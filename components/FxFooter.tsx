import { StyleSheet, View } from 'react-native';
import { Text } from './ui/Text';
import { describeFreshness, isStale, type ResolvedRate } from '@/lib/fx';
import { colors, radius, spacing } from '@/lib/theme';
import type { CurrencyCode } from '@/lib/types';

export type FxFooterProps = {
  baseCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
  rate: ResolvedRate | null;
  /** True when a conversion was wanted but no cached rate could supply it. */
  missing?: boolean;
};

/**
 * Shown whenever figures on screen are not in the trip's base currency.
 *
 * Three things it must say, once, plainly: what rate is being used, how old it
 * is, and that settlements are authoritative in the base currency. Users who
 * are not told this will assume the converted number is what they owe.
 */
export function FxFooter({ baseCurrency, displayCurrency, rate, missing }: FxFooterProps) {
  if (missing) {
    return (
      <View style={[styles.container, styles.warning]}>
        <Text variant="caption" tone="muted">
          No cached rate for {baseCurrency} → {displayCurrency}, so amounts are shown in{' '}
          {baseCurrency}. Rates refresh every few hours.
        </Text>
      </View>
    );
  }

  if (!rate) return null;

  const stale = isStale(rate.fetched_at);

  return (
    <View style={[styles.container, stale && styles.warning]}>
      <Text variant="caption" tone="muted">
        Showing {displayCurrency} at 1 {baseCurrency} = {trimRate(rate.rate)} {displayCurrency},{' '}
        {describeFreshness(rate.fetched_at)}
        {stale ? ' — rates may be out of date' : ''}.
      </Text>
      <Text variant="caption" tone="muted">
        Settlement amounts are authoritative in {baseCurrency}. These are mid-market reference
        rates, not what a bank or card issuer charges.
      </Text>
    </View>
  );
}

/** numeric(20,10) is unreadable in a footer; show enough to be checkable. */
function trimRate(rate: string): string {
  const value = Number(rate);
  if (!Number.isFinite(value)) return rate;
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toPrecision(4);
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  warning: {
    backgroundColor: colors.warningMuted,
    borderColor: colors.warningBorder,
  },
});
