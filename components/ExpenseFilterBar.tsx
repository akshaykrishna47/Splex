import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { DateField } from './ui/DateField';
import { Icon, type IconName } from './ui/Icon';
import { Input } from './ui/Input';
import { MultiSelect, Select } from './ui/Select';
import { Text } from './ui/Text';
import { todayIso } from '@/lib/dates';
import { CATEGORIES } from '@/lib/types';
import { categoryMeta, colors, radius, spacing, type CategoryKey } from '@/lib/theme';
import {
  EMPTY_FILTERS,
  countActiveFilters,
  hasActiveFilters,
  type DateRangePreset,
  type ExpenseFilters,
} from '@/lib/trip-insights';
import type { Category, TripMember, Uuid } from '@/lib/types';

export type ExpenseFilterBarProps = {
  filters: ExpenseFilters;
  onChange: (filters: ExpenseFilters) => void;
  members: TripMember[];
  /** Currencies actually used in this trip — no point offering the other 170. */
  currencies: string[];
  resultCount: number;
  totalCount: number;
};

const RANGES: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];

/**
 * Search and filtering for the expense feed.
 *
 * Search is always visible because it is the common case; the rest collapse
 * behind a toggle so the feed stays the focus. Filtering is a view concern only
 * — balances are always computed from the full, unfiltered set.
 */
export function ExpenseFilterBar({
  filters,
  onChange,
  members,
  currencies,
  resultCount,
  totalCount,
}: ExpenseFilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = countActiveFilters(filters);
  const isFiltering = hasActiveFilters(filters);

  const memberOptions = useMemo(
    () => members.map((m) => ({ value: m.id, label: m.display_name })),
    [members],
  );

  const categoryOptions = useMemo(
    () =>
      CATEGORIES.map((key) => ({
        value: key,
        label: categoryMeta[key as CategoryKey].label,
        icon: <Icon name={key as IconName} size={20} color={categoryMeta[key as CategoryKey].tint} />,
      })),
    [],
  );

  const currencyOptions = useMemo(
    () => currencies.map((code) => ({ value: code, label: code })),
    [currencies],
  );

  function patch(next: Partial<ExpenseFilters>) {
    onChange({ ...filters, ...next });
  }

  return (
    <Card padding="sm" style={styles.card}>
      <View style={styles.searchRow}>
        <Input
          value={filters.search}
          onChangeText={(search) => patch({ search })}
          placeholder="Search expenses, people, categories"
          autoCorrect={false}
          containerStyle={styles.search}
        />
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={[styles.filterToggle, activeCount > 0 && styles.filterToggleActive]}
        >
          <Icon name="filter" size={16} color={activeCount > 0 ? colors.primaryText : colors.textMuted} />
          <Icon name="filter" size={16} color={activeCount > 0 ? colors.primaryText : colors.textMuted} />
          <Text variant="label" tone={activeCount > 0 ? 'primary' : 'muted'}>
            Filters{activeCount > 0 ? ` (${activeCount})` : ''} 
          </Text>
        </Pressable>
      </View>

      {expanded ? (
        <View style={styles.panel}>
          <View style={styles.fields}>
            <View style={styles.field}>
              <MultiSelect
                label="Category"
                values={filters.categories}
                onChange={(values) => patch({ categories: values as Category[] })}
                options={categoryOptions}
                placeholder="Any category"
                noun="categories"
              />
            </View>

            <View style={styles.field}>
              <MultiSelect
                label="Paid by"
                values={filters.payers}
                onChange={(payers) => patch({ payers: payers as Uuid[] })}
                options={memberOptions}
                placeholder="Anyone"
                noun="people"
              />
            </View>

            {currencyOptions.length > 1 ? (
              <View style={styles.field}>
                <MultiSelect
                  label="Currency"
                  values={filters.currencies}
                  onChange={(values) => patch({ currencies: values })}
                  options={currencyOptions}
                  placeholder="Any currency"
                  noun="currencies"
                />
              </View>
            ) : null}

            <View style={styles.field}>
              <Select
                label="Date"
                value={filters.range}
                onChange={(range) =>
                  patch({
                    range: range as DateRangePreset,
                    // Seed a sensible custom window rather than an empty one.
                    from: range === 'custom' ? (filters.from ?? todayIso()) : null,
                    to: range === 'custom' ? (filters.to ?? todayIso()) : null,
                  })
                }
                options={RANGES}
              />
            </View>
          </View>

          {filters.range === 'custom' ? (
            <View style={styles.fields}>
              <View style={styles.field}>
                <DateField label="From" value={filters.from ?? todayIso()} onChange={(from) => patch({ from })} />
              </View>
              <View style={styles.field}>
                <DateField label="To" value={filters.to ?? todayIso()} onChange={(to) => patch({ to })} />
              </View>
            </View>
          ) : null}

          <View style={styles.footer}>
            <Text variant="caption" tone="muted">
              {isFiltering ? `Showing ${resultCount} of ${totalCount}` : `${totalCount} expenses`}
            </Text>
            {isFiltering ? (
              <Button
                label="Clear filters"
                variant="ghost"
                size="sm"
                onPress={() => onChange({ ...EMPTY_FILTERS })}
              />
            ) : null}
          </View>
        </View>
      ) : isFiltering ? (
        <View style={styles.footer}>
          <Text variant="caption" tone="muted">
            Showing {resultCount} of {totalCount}
          </Text>
          <Button
            label="Clear filters"
            variant="ghost"
            size="sm"
            onPress={() => onChange({ ...EMPTY_FILTERS })}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  search: { flex: 1 },
  filterToggle: {
    paddingHorizontal: spacing.md,
    minHeight: 46,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  filterToggleActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },

  panel: { gap: spacing.md, paddingTop: spacing.sm },
  // Wraps to one field per row on narrow screens, two or more when there's room.
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { flexGrow: 1, flexBasis: 200 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  optionEmoji: { fontSize: 18 },
});
