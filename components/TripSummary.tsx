import { StyleSheet, View } from 'react-native';
import { Card } from './ui/Card';
import { Icon, type IconName } from './ui/Icon';
import { Text } from './ui/Text';
import { categoryMeta, colors, radius, spacing, type CategoryKey } from '@/lib/theme';
import type { TripSummary as Summary } from '@/lib/trip-insights';

export type TripSummaryProps = {
  summary: Summary;
  /** Formats base-currency minor units into the user's display currency. */
  format: (minor: number) => string;
};

/**
 * Trip overview: five headline figures and where the money went.
 *
 * The headline numbers are stat tiles, not a chart — a single value per tile
 * reads faster as a number than as any plot.
 *
 * The breakdown is a magnitude comparison, so it uses ONE hue and lets bar
 * length carry the value. It deliberately does not colour each row by category:
 * nine category hues cannot all stay distinguishable under colour-blind
 * simulation, and encoding the same fact twice (length and hue) buys nothing.
 * Each row is labelled with its emoji, name and percentage, so nothing here
 * depends on colour at all.
 */
export function TripSummary({ summary, format }: TripSummaryProps) {
  const { byCategory } = summary;
  const max = byCategory[0]?.percent ?? 0;

  return (
    <Card padding="lg" style={styles.card}>
      <Text variant="label" tone="faint" style={styles.eyebrow}>
        TRIP SUMMARY
      </Text>

      <View style={styles.hero}>
        <Text variant="caption" tone="muted">
          Total spending
        </Text>
        <Text variant="display" numeric>{format(summary.totalCents)}</Text>
      </View>

      <View style={styles.tiles}>
        <Tile label="Expenses" value={String(summary.expenseCount)} />
        <Tile label="Members" value={String(summary.memberCount)} />
        <Tile label="Settled" value={format(summary.settledCents)} tone="positive" />
        <Tile label="Outstanding" value={format(summary.outstandingCents)} tone="warning" />
      </View>

      {byCategory.length > 0 ? (
        <View style={styles.breakdown}>
          <Text variant="label" tone="faint" style={styles.eyebrow}>
            WHERE IT WENT
          </Text>

          {byCategory.map((row) => {
            const meta = categoryMeta[row.category as CategoryKey] ?? categoryMeta.other;
            // Scale bars against the largest share, not against 100, so a trip
            // where nothing exceeds 30% still reads clearly.
            const width = max === 0 ? 0 : Math.max((row.percent / max) * 100, 2);

            return (
              <View key={row.category} style={styles.row}>
                <View style={styles.rowHeader}>
                  <Icon name={row.category as IconName} size={16} color={colors.textMuted} />
                  <Text variant="body" numberOfLines={1} style={styles.rowLabel}>
                    {meta.label}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {format(row.totalCents)}
                  </Text>
                  <Text variant="label" style={styles.percent}>
                    {row.percent}%
                  </Text>
                </View>

                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${width}%` }]} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

function Tile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'warning';
}) {
  return (
    <View style={styles.tile}>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text
        variant="heading"
        numeric
        numberOfLines={1}
        // Text tokens, not chart colours — the value stays legible ink.
        tone={tone === 'positive' ? 'positive' : 'default'}
        style={tone === 'warning' ? styles.warningValue : undefined}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  eyebrow: { letterSpacing: 0.6 },
  hero: { gap: 2 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: 120,
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  warningValue: { color: colors.warning },

  breakdown: { gap: spacing.md },
  row: { gap: spacing.xs },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { flex: 1 },
  percent: { minWidth: 46, textAlign: 'right' },
  track: {
    height: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  // Rounded data-end, anchored to the baseline at the left.
  fill: { height: '100%', borderRadius: radius.sm, backgroundColor: colors.primary },
});
