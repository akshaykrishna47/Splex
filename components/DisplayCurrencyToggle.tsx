import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { CurrencyPicker } from './CurrencyPicker';
import { Text } from './ui/Text';
import { useCurrencies } from '@/lib/queries';
import { usePrefsStore } from '@/lib/stores/prefs';
import { colors, radius, spacing } from '@/lib/theme';
import type { CurrencyCode, Uuid } from '@/lib/types';

export type DisplayCurrencyToggleProps = {
  tripId: Uuid;
  baseCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
};

/**
 * Header dropdown for the display currency. Cosmetic only — it changes what
 * figures are rendered in, never what the ledger stores.
 */
export function DisplayCurrencyToggle({
  tripId,
  baseCurrency,
  displayCurrency,
}: DisplayCurrencyToggleProps) {
  const [open, setOpen] = useState(false);
  const { data: currencies = [] } = useCurrencies();
  const recent = usePrefsStore((s) => s.recentCurrencies);
  const setTripDisplayCurrency = usePrefsStore((s) => s.setTripDisplayCurrency);

  const converting = displayCurrency.toUpperCase() !== baseCurrency.toUpperCase();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Display currency: ${displayCurrency}`}
        style={({ pressed }) => [styles.chip, converting && styles.chipActive, pressed && styles.pressed]}
      >
        <Text variant="label" tone={converting ? 'primary' : 'muted'}>
          {displayCurrency}
        </Text>
      </Pressable>

      <CurrencyPicker
        visible={open}
        onClose={() => setOpen(false)}
        currencies={currencies}
        selected={displayCurrency}
        pinned={baseCurrency}
        recent={recent}
        onSelect={(code) =>
          // Selecting the base currency clears the override rather than storing
          // a redundant one.
          setTripDisplayCurrency(tripId, code.toUpperCase() === baseCurrency.toUpperCase() ? null : code)
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    // No right margin: the screen that renders this owns the header edge
    // spacing, so adding it here would double up inside a header row.
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  pressed: { opacity: 0.7 },
});
