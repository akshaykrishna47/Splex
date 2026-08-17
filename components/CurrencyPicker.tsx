import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Input } from './ui/Input';
import { Icon } from './ui/Icon';
import { Sheet } from './ui/Sheet';
import { Text } from './ui/Text';
import { colors, radius, spacing } from '@/lib/theme';
import type { Currency, CurrencyCode } from '@/lib/types';

export type CurrencyPickerProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (code: CurrencyCode) => void;
  currencies: Currency[];
  selected?: CurrencyCode;
  /** The trip's base currency. Always sorts first. */
  pinned?: CurrencyCode;
  /** The user's recently-used currencies, newest first. */
  recent?: CurrencyCode[];
};

/**
 * Searchable list of every currency in the table.
 *
 * Order is deliberate: trip base currency, then recently used, then
 * alphabetical. Someone spending in Thailand for a week should find THB at the
 * top, not scroll past 40 codes to reach it.
 */
export function CurrencyPicker({
  visible,
  onClose,
  onSelect,
  currencies,
  selected,
  pinned,
  recent = [],
}: CurrencyPickerProps) {
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = term
      ? currencies.filter(
          (c) => c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term),
        )
      : currencies;

    if (term) return [{ title: null, items: matches }];

    const pinnedUpper = pinned?.toUpperCase();
    const recentUpper = recent.map((r) => r.toUpperCase()).filter((r) => r !== pinnedUpper);

    const byCode = new Map(matches.map((c) => [c.code.toUpperCase(), c]));

    const top = pinnedUpper ? byCode.get(pinnedUpper) : undefined;
    const recents = recentUpper
      .map((code) => byCode.get(code))
      .filter((c): c is Currency => Boolean(c));

    const usedCodes = new Set([
      ...(top ? [top.code.toUpperCase()] : []),
      ...recents.map((r) => r.code.toUpperCase()),
    ]);

    const rest = matches
      .filter((c) => !usedCodes.has(c.code.toUpperCase()))
      .sort((a, b) => a.code.localeCompare(b.code));

    return [
      ...(top ? [{ title: 'Trip currency', items: [top] }] : []),
      ...(recents.length ? [{ title: 'Recently used', items: recents }] : []),
      { title: 'All currencies', items: rest },
    ];
  }, [currencies, query, pinned, recent]);

  function choose(code: CurrencyCode) {
    setQuery('');
    onSelect(code.toUpperCase());
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Currency"
      header={
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search by code or name"
          autoCapitalize="characters"
          autoCorrect={false}
        />
      }
    >
      {sections.map((section) => (
        <View key={section.title ?? 'results'}>
          {section.title ? (
            <Text variant="caption" tone="faint" weight="600" style={styles.sectionTitle}>
              {section.title.toUpperCase()}
            </Text>
          ) : null}

          {section.items.map((currency) => {
            const isSelected = selected?.toUpperCase() === currency.code.toUpperCase();
            return (
              <Pressable
                key={currency.code}
                onPress={() => choose(currency.code)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  isSelected && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.symbolBox}>
                  <Text variant="label" tone={isSelected ? 'primary' : 'muted'}>
                    {currency.symbol}
                  </Text>
                </View>

                <View style={styles.rowText}>
                  <Text variant="body" weight="600">
                    {currency.code}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {currency.name}
                  </Text>
                </View>

                {currency.decimal_digits !== 2 ? (
                  <Text variant="caption" tone="faint">
                    {currency.decimal_digits === 0 ? 'no decimals' : `${currency.decimal_digits} dp`}
                  </Text>
                ) : null}

                {isSelected ? (
                  <Icon name="check" size={16} color={colors.primaryText} />
                ) : null}
              </Pressable>
            );
          })}

          {section.items.length === 0 ? (
            <Text variant="caption" tone="muted" style={styles.empty}>
              No currency matches “{query}”.
            </Text>
          ) : null}
        </View>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { marginTop: spacing.md, marginBottom: spacing.xs, letterSpacing: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowSelected: { backgroundColor: colors.primaryMuted },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  symbolBox: { width: 36, alignItems: 'center' },
  rowText: { flex: 1 },
  empty: { paddingVertical: spacing.lg },
});
