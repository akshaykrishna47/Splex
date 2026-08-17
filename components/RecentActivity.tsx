import { StyleSheet, View } from 'react-native';
import { Card } from './ui/Card';
import { Icon, type IconName } from './ui/Icon';
import { Text } from './ui/Text';
import { colors, radius, spacing } from '@/lib/theme';
import type { ActivityItem } from '@/lib/trip-insights';
import type { CurrencyCode } from '@/lib/types';

export type RecentActivityProps = {
  items: ActivityItem[];
  /** Formats base-currency minor units into the display currency. */
  format: (minor: number) => string;
  /** Formats an amount already known to be in `code`. */
  formatIn: (minor: number, code: CurrencyCode) => string;
  baseCurrency: CurrencyCode;
};

/**
 * What has happened in this trip lately.
 *
 * Derived entirely from expenses, settlements and member rows — there is no
 * activity table and nothing here is fabricated. That does mean edits and
 * deletions don't appear; adding them would require writing history rows on
 * every mutation, which is a lot of machinery for a glanceable panel.
 */
export function RecentActivity({ items, format, formatIn, baseCurrency }: RecentActivityProps) {
  if (items.length === 0) return null;

  return (
    <Card padding="lg" style={styles.card}>
      <Text variant="label" tone="faint" style={styles.eyebrow}>
        RECENT ACTIVITY
      </Text>

      <View style={styles.list}>
        {items.map((item) => {
          const foreign =
            item.originalCurrency &&
            item.originalCurrency.toUpperCase() !== baseCurrency.toUpperCase();

          return (
            <View key={item.id} style={styles.row}>
              <View style={styles.icon}>
                <Icon name={item.icon as IconName} size={16} color={colors.textMuted} />
              </View>

              <View style={styles.text}>
                <Text variant="body" numberOfLines={2}>
                  <Text weight="600">{item.actor}</Text> {item.text}
                </Text>
                {foreign && item.originalAmountCents != null && item.originalCurrency ? (
                  <Text variant="caption" tone="faint">
                    {formatIn(item.originalAmountCents, item.originalCurrency)}
                  </Text>
                ) : null}
              </View>

              {item.amountCents != null ? (
                <Text variant="body" weight="600" numeric>
                  {format(item.amountCents)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  eyebrow: { letterSpacing: 0.6 },
  list: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  emoji: { fontSize: 16 },
  text: { flex: 1, gap: 1 },
});
