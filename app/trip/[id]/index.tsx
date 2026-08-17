import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { DisplayCurrencyToggle } from '@/components/DisplayCurrencyToggle';
import { ExpenseFilterBar } from '@/components/ExpenseFilterBar';
import { FxFooter } from '@/components/FxFooter';
import { RecentActivity } from '@/components/RecentActivity';
import { TripActionsSheet } from '@/components/TripActionsSheet';
import { Screen } from '@/components/Screen';
import { TripSummary } from '@/components/TripSummary';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Fab } from '@/components/ui/Fab';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { formatDateHeading, groupByDate } from '@/lib/dates';
import { summarizeForMember } from '@/lib/balances';
import { useMoney } from '@/lib/hooks/useMoney';
import {
  useBalances,
  useExpenses,
  useMembers,
  useMyMembership,
  useSettlements,
  useTrip,
} from '@/lib/queries';
import { useSessionStore } from '@/lib/stores/session';
import { categoryMeta, colors, spacing, tintBackground, type CategoryKey } from '@/lib/theme';
import {
  EMPTY_FILTERS,
  buildActivity,
  filterExpenses,
  hasActiveFilters,
  summarizeTrip,
  type ExpenseFilters,
} from '@/lib/trip-insights';
import type { ExpenseWithSplits, TripMember } from '@/lib/types';

/** Keeps the header title short enough to sit beside the currency control. */
const MAX_TITLE_CHARS = 22;

function headerTitleFor(emoji: string | null, name: string): string {
  const prefix = emoji ? `${emoji} ` : '';
  const chars = [...name];
  const shortened =
    chars.length > MAX_TITLE_CHARS ? `${chars.slice(0, MAX_TITLE_CHARS).join('')}…` : name;
  return `${prefix}${shortened}`;
}

export default function TripFeedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSessionStore((s) => s.session);

  const trip = useTrip(id);
  const expenses = useExpenses(id);
  const members = useMembers(id);
  const balances = useBalances(id);
  const settlements = useSettlements(id);
  const membership = useMyMembership(id, session?.user.id);
  const money = useMoney(trip.data);

  const [filters, setFilters] = useState<ExpenseFilters>({ ...EMPTY_FILTERS });
  const [actionsOpen, setActionsOpen] = useState(false);

  const memberList = members.data ?? [];
  const expenseList = expenses.data ?? [];

  const memberNames = useMemo(() => {
    const map = new Map<string, TripMember>();
    for (const m of memberList) map.set(m.id, m);
    return map;
  }, [memberList]);

  const summary = useMemo(
    () =>
      summarizeTrip({
        expenses: expenseList,
        members: memberList,
        settlements: settlements.data ?? [],
        balances: balances.data ?? [],
      }),
    [expenseList, memberList, settlements.data, balances.data],
  );

  const activity = useMemo(
    () =>
      buildActivity({
        expenses: expenseList,
        settlements: settlements.data ?? [],
        members: memberList,
        // Activity items carry an icon name; the feed resolves it to a glyph.
        categoryIcon: (c) => (c in categoryMeta ? c : 'other'),
        limit: 6,
      }),
    [expenseList, settlements.data, memberList],
  );

  // Filtering is presentation only — `summary` and `balances` above both read
  // the full expense list, so a filter never changes what anyone owes.
  const visible = useMemo(
    () =>
      filterExpenses(expenseList, filters, {
        memberNames: new Map(memberList.map((m) => [m.id, m.display_name])),
        categoryLabels: Object.fromEntries(
          Object.entries(categoryMeta).map(([key, meta]) => [key, meta.label]),
        ),
      }),
    [expenseList, filters, memberList],
  );

  const tripCurrencies = useMemo(
    () => [...new Set(expenseList.map((e) => e.currency.toUpperCase()))].sort(),
    [expenseList],
  );

  const sections = useMemo(() => groupByDate(visible, (e) => e.expense_date), [visible]);
  const mySummary = summarizeForMember(balances.data ?? [], membership.data?.id ?? null);
  const filtering = hasActiveFilters(filters);

  return (
    <>
      <Stack.Screen
        options={{
          // Truncated here rather than left to the navigator: native-stack has
          // no container-width option, so a long name would push the currency
          // control off the right edge.
          title: trip.data ? headerTitleFor(trip.data.emoji, trip.data.name) : 'Trip',
          headerRight: () =>
            trip.data ? (
              <View style={styles.headerRightRow}>
                <DisplayCurrencyToggle
                  tripId={trip.data.id}
                  baseCurrency={money.baseCurrency}
                  displayCurrency={money.displayCurrency}
                />
                <Pressable
                  onPress={() => setActionsOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Trip settings"
                  hitSlop={8}
                  style={styles.headerButton}
                >
                  <Icon name="settings" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : null,
        }}
      />

      <Screen
        loading={trip.isLoading || expenses.isLoading || members.isLoading}
        error={trip.error ?? expenses.error}
        onRefresh={() => {
          void expenses.refetch();
          void balances.refetch();
          void settlements.refetch();
        }}
        refreshing={expenses.isRefetching}
        fab={<Fab label="Add expense" onPress={() => router.push(`/trip/${id}/expense/new`)} />}
      >
        {trip.data?.description ? (
          <Text variant="body" tone="muted">
            {trip.data.description}
          </Text>
        ) : null}

        <BalanceHeader
          net={mySummary.net}
          format={money.formatDisplay}
          onOpenBalances={() => router.push(`/trip/${id}/balances`)}
          onOpenMembers={() => router.push(`/trip/${id}/members`)}
          memberCount={memberList.length}
        />

        {expenseList.length > 0 ? <TripSummary summary={summary} format={money.formatDisplay} /> : null}

        {expenseList.length > 0 ? (
          <ExpenseFilterBar
            filters={filters}
            onChange={setFilters}
            members={memberList}
            currencies={tripCurrencies}
            resultCount={visible.length}
            totalCount={expenseList.length}
          />
        ) : null}

        {expenseList.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="No expenses yet"
            message={`Add your first expense to start tracking the trip. Enter it in whatever currency you actually paid in — Splex converts it into ${money.baseCurrency} once and keeps it there.`}
            actionLabel="Add an expense"
            onAction={() => router.push(`/trip/${id}/expense/new`)}
            secondaryLabel="Add people"
            onSecondary={() => router.push(`/trip/${id}/members`)}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="search"
            title="No expenses match"
            message="Nothing here fits those filters. Try widening the date range or clearing them."
            actionLabel="Clear filters"
            onAction={() => setFilters({ ...EMPTY_FILTERS })}
          />
        ) : (
          sections.map((section) => (
            <View key={section.date} style={styles.section}>
              <Text variant="label" tone="faint" style={styles.sectionHeading}>
                {formatDateHeading(section.date).toUpperCase()}
              </Text>

              {section.items.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  payer={memberNames.get(expense.paid_by)}
                  money={money}
                  onPress={() => router.push(`/trip/${id}/expense/${expense.id}`)}
                />
              ))}
            </View>
          ))
        )}

        {!filtering ? (
          <RecentActivity
            items={activity}
            format={money.formatDisplay}
            formatIn={money.formatIn}
            baseCurrency={money.baseCurrency}
          />
        ) : null}

        {money.isConverting || money.missingDisplayRate ? (
          <FxFooter
            baseCurrency={money.baseCurrency}
            displayCurrency={money.displayCurrency}
            rate={money.displayRate}
            missing={money.missingDisplayRate}
          />
        ) : null}
      </Screen>

      <TripActionsSheet
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        trip={trip.data ?? null}
        isOwner={membership.data?.role === 'owner'}
      />
    </>
  );
}

function BalanceHeader({
  net,
  format,
  onOpenBalances,
  onOpenMembers,
  memberCount,
}: {
  net: number;
  format: (minor: number) => string;
  onOpenBalances: () => void;
  onOpenMembers: () => void;
  memberCount: number;
}) {
  const settled = net === 0;

  return (
    <Card padding="lg" style={styles.header}>
      <View>
        <Text variant="label" tone="muted">
          {settled ? 'All settled up' : net > 0 ? 'You are owed' : 'You owe'}
        </Text>
        <Text variant="display" numeric tone={settled ? 'default' : net > 0 ? 'positive' : 'negative'}>
          {format(Math.abs(net))}
        </Text>
      </View>

      <View style={styles.headerActions}>
        <Button label="Balances" variant="secondary" size="sm" onPress={onOpenBalances} />
        <Button label={`People (${memberCount})`} variant="secondary" size="sm" onPress={onOpenMembers} />
      </View>
    </Card>
  );
}

function ExpenseRow({
  expense,
  payer,
  money,
  onPress,
}: {
  expense: ExpenseWithSplits;
  payer: TripMember | undefined;
  money: ReturnType<typeof useMoney>;
  onPress: () => void;
}) {
  const meta = categoryMeta[expense.category as CategoryKey] ?? categoryMeta.other;
  const foreign = expense.currency.toUpperCase() !== money.baseCurrency;

  return (
    <Card onPress={onPress} padding="sm">
      <View style={styles.expenseRow}>
        <View style={[styles.categoryBadge, { backgroundColor: tintBackground(meta.tint) }]}>
          <Icon name={(expense.category ?? 'other') as IconName} size={20} color={meta.tint} />
        </View>

        <View style={styles.expenseText}>
          <Text variant="body" weight="600" numberOfLines={1}>
            {expense.title}
          </Text>
          <View style={styles.payerRow}>
            {payer ? <Avatar name={payer.display_name} size={16} /> : null}
            <Text variant="caption" tone="muted" numberOfLines={1} style={styles.payerText}>
              {payer?.display_name ?? 'Unknown'} paid · {meta.label}
            </Text>
          </View>
          {expense.notes ? (
            <Text variant="caption" tone="faint" numberOfLines={1}>
              {expense.notes}
            </Text>
          ) : null}
        </View>

        <View style={styles.amountColumn}>
          <Text variant="body" weight="600" numeric>
            {money.formatDisplay(expense.base_amount_cents)}
          </Text>
          {foreign ? (
            <Text variant="caption" tone="faint" numeric>
              {money.formatIn(expense.amount_cents, expense.currency)}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerButton: { paddingRight: spacing.lg },
  header: { gap: spacing.lg },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { gap: spacing.sm },
  sectionHeading: { marginTop: spacing.sm, letterSpacing: 0.6 },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  categoryBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  emoji: { fontSize: 18 },
  // minWidth 0 lets long titles ellipsize instead of pushing the amount off-screen.
  expenseText: { flex: 1, gap: 2, minWidth: 0 },
  payerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  payerText: { flex: 1 },
  amountColumn: { alignItems: 'flex-end', gap: 2 },
});
