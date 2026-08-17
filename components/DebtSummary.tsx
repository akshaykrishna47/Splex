import { StyleSheet, View } from 'react-native';
import { Avatar } from './ui/Avatar';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';
import { formatMinor, type CurrencyLookup } from '@/lib/money';
import { colors, radius, spacing } from '@/lib/theme';
import type { DebtRow, DebtSummary as Summary } from '@/lib/overview';

export type DebtSummaryProps = {
  summary: Summary;
  currencies: CurrencyLookup;
  loading?: boolean;
};

/**
 * Who owes you, and who you owe, across every trip.
 *
 * Amounts stay in each trip's own settle-up currency — that is the figure
 * people actually pay — so a person appearing in an SGD trip and a THB trip
 * gets one row each rather than a converted total nobody settles.
 */
export function DebtSummary({ summary, currencies, loading }: DebtSummaryProps) {
  const { owedToYou, youOwe } = summary;
  const settled = owedToYou.length === 0 && youOwe.length === 0;

  if (loading) {
    return (
      <Card padding="lg" style={styles.card}>
        <Text variant="caption" tone="muted">
          Working out who owes what…
        </Text>
      </Card>
    );
  }

  if (settled) {
    return (
      <Card padding="lg" style={styles.settled}>
        <View style={styles.settledIcon}>
          <Icon name="celebrate" size={24} color={colors.positive} />
        </View>
        <Text variant="heading" align="center">
          You&apos;re all square
        </Text>
        <Text variant="body" tone="muted" align="center" style={styles.settledBody}>
          Nobody owes you anything and you don&apos;t owe anyone. Add an expense and this will
          keep track of it for you.
        </Text>
      </Card>
    );
  }

  return (
    <View style={styles.stack}>
      {owedToYou.length > 0 ? (
        <DebtList
          title="Owes you"
          rows={owedToYou}
          tone="positive"
          currencies={currencies}
          verb="owes you"
        />
      ) : null}

      {youOwe.length > 0 ? (
        <DebtList
          title="You owe"
          rows={youOwe}
          tone="negative"
          currencies={currencies}
          verb="you owe"
        />
      ) : null}
    </View>
  );
}

function DebtList({
  title,
  rows,
  tone,
  currencies,
  verb,
}: {
  title: string;
  rows: DebtRow[];
  tone: 'positive' | 'negative';
  currencies: CurrencyLookup;
  verb: string;
}) {
  return (
    <Card padding="lg" style={styles.card}>
      <View style={styles.header}>
        <Text variant="label" tone="faint" style={styles.eyebrow}>
          {title.toUpperCase()}
        </Text>
        <Text variant="caption" tone="muted">
          {rows.length} {rows.length === 1 ? 'person' : 'people'}
        </Text>
      </View>

      <View style={styles.list}>
        {rows.map((row) => (
          <View key={row.key} style={styles.row}>
            <Avatar name={row.name} size={34} />

            <View style={styles.rowText}>
              <Text variant="body" weight="600" numberOfLines={1}>
                {row.name}
              </Text>
              <Text variant="caption" tone="faint" numberOfLines={1}>
                {row.tripNames.join(' · ')}
              </Text>
            </View>

            <View style={styles.amount}>
              {/* Stated in words too — never colour alone. */}
              <Text variant="caption" tone="muted">
                {verb}
              </Text>
              <Text variant="body" weight="600" tone={tone} numeric>
                {formatMinor(row.amountCents, row.currency, currencies)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { letterSpacing: 0.6 },
  list: { gap: spacing.md, marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 1, minWidth: 0 },
  amount: { alignItems: 'flex-end', gap: 1 },

  settled: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  settledIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.positiveMuted,
    marginBottom: spacing.xs,
  },
  settledBody: { maxWidth: 380 },
});
