import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { DisplayCurrencyToggle } from '@/components/DisplayCurrencyToggle';
import { FxFooter } from '@/components/FxFooter';
import { Screen } from '@/components/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useToast } from '@/components/ui/Toast';
import { simplifyDebts, summarizeForMember } from '@/lib/balances';
import { formatLongDate } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { useMoney } from '@/lib/hooks/useMoney';
import { decimalDigitsFor, parseAmount, toMajorString } from '@/lib/money';
import {
  useBalances,
  useMembers,
  useMyMembership,
  useRecordSettlement,
  useSettlements,
  useTrip,
} from '@/lib/queries';
import { useSessionStore } from '@/lib/stores/session';
import { colors, radius, spacing } from '@/lib/theme';
import type { MemberBalance, Transfer, Uuid } from '@/lib/types';

export default function BalancesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSessionStore((s) => s.session);

  const trip = useTrip(id);
  const balances = useBalances(id);
  const members = useMembers(id);
  const settlements = useSettlements(id);
  const membership = useMyMembership(id, session?.user.id);
  const money = useMoney(trip.data);

  const [pending, setPending] = useState<Transfer | null>(null);

  const nameFor = useMemo(() => {
    const map = new Map<Uuid, string>();
    for (const b of balances.data ?? []) map.set(b.member_id, b.display_name);
    for (const m of members.data ?? []) map.set(m.id, m.display_name);
    return (memberId: Uuid) => map.get(memberId) ?? 'Someone';
  }, [balances.data, members.data]);

  const { transfers, simplifyError } = useMemo(() => {
    try {
      return { transfers: simplifyDebts(balances.data ?? []), simplifyError: null };
    } catch (e) {
      return { transfers: [] as Transfer[], simplifyError: friendlyError(e) };
    }
  }, [balances.data]);

  const sorted = useMemo(
    () => [...(balances.data ?? [])].sort((a, b) => b.net_cents - a.net_cents),
    [balances.data],
  );

  const mine = summarizeForMember(balances.data ?? [], membership.data?.id ?? null);
  const myTransfers = transfers.filter(
    (t) => t.from_member === membership.data?.id || t.to_member === membership.data?.id,
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Balances',
          headerRight: () =>
            trip.data ? (
              <View style={styles.headerRightRow}>
                <DisplayCurrencyToggle
                  tripId={trip.data.id}
                  baseCurrency={money.baseCurrency}
                  displayCurrency={money.displayCurrency}
                />
              </View>
            ) : null,
        }}
      />

      <Screen
        loading={balances.isLoading || trip.isLoading}
        error={balances.error}
        onRefresh={() => {
          void balances.refetch();
          void settlements.refetch();
        }}
        refreshing={balances.isRefetching}
      >
        {/* Your own position, stated in words as well as colour. */}
        <Card padding="lg" variant="raised" style={styles.hero}>
          <Text variant="label" tone="muted">
            {mine.net === 0 ? 'You are all settled' : mine.net > 0 ? 'You are owed' : 'You owe'}
          </Text>
          <Text
            variant="display"
            numeric
            tone={mine.net === 0 ? 'default' : mine.net > 0 ? 'positive' : 'negative'}
          >
            {money.formatDisplay(Math.abs(mine.net))}
          </Text>
          <Text variant="caption" tone="muted">
            {mine.net === 0
              ? 'Nothing to pay and nothing to collect.'
              : myTransfers.length === 1
                ? mine.net > 0
                  ? `${nameFor(myTransfers[0]!.from_member)} owes you this.`
                  : `Pay ${nameFor(myTransfers[0]!.to_member)} to clear it.`
                : `Across ${myTransfers.length} payments.`}
          </Text>
        </Card>

        {/* Per person */}
        <Card padding="lg" style={styles.block}>
          <Text variant="heading">Where everyone stands</Text>
          <Text variant="caption" tone="muted">
            Worked out from every expense and payment in the trip. Nothing here is stored — it
            always reflects the current ledger.
          </Text>

          <View style={styles.list}>
            {sorted.map((balance) => (
              <BalanceRow
                key={balance.member_id}
                balance={balance}
                money={money}
                isMe={balance.member_id === membership.data?.id}
              />
            ))}
          </View>
        </Card>

        {/* Settle up */}
        <Card padding="lg" style={styles.block}>
          <Text variant="heading">Settle up</Text>

          {simplifyError ? (
            <Text variant="caption" tone="negative">
              {simplifyError}
            </Text>
          ) : transfers.length === 0 ? (
            <View style={styles.settledBox}>
              <Icon name="celebrate" size={24} color={colors.positive} />
              <Text variant="body" weight="600">
                Everyone&apos;s square
              </Text>
              <Text variant="caption" tone="muted" align="center">
                No payments needed. Add another expense and this will update.
              </Text>
            </View>
          ) : (
            <>
              <Text variant="caption" tone="muted">
                The fewest payments that clear every debt — {transfers.length}{' '}
                {transfers.length === 1 ? 'transfer' : 'transfers'} instead of settling each expense
                separately.
              </Text>

              <View style={styles.list}>
                {transfers.map((transfer, i) => (
                  <View key={`${transfer.from_member}-${transfer.to_member}-${i}`} style={styles.transferRow}>
                    <Avatar name={nameFor(transfer.from_member)} size={30} />
                    <View style={styles.transferText}>
                      <Text variant="body" numberOfLines={2}>
                        <Text weight="600">{nameFor(transfer.from_member)}</Text> pays{' '}
                        <Text weight="600">{nameFor(transfer.to_member)}</Text>
                      </Text>
                      <Text variant="caption" tone="muted" numeric>
                        {money.formatDisplay(transfer.amount_cents)}
                      </Text>
                    </View>
                    <Button label="Record" size="sm" onPress={() => setPending(transfer)} />
                  </View>
                ))}
              </View>
            </>
          )}
        </Card>

        {/* History */}
        <Card padding="lg" style={styles.block}>
          <Text variant="heading">Payment history</Text>

          {(settlements.data ?? []).length === 0 ? (
            <EmptyState
              icon="settle"
              title="No settlements yet"
              message="Payments between members will appear here once you record one."
            />
          ) : (
            <View style={styles.list}>
              {(settlements.data ?? []).map((settlement) => (
                <View key={settlement.id} style={styles.historyRow}>
                  <Avatar name={nameFor(settlement.from_member)} size={30} />

                  <View style={styles.historyText}>
                    <Text variant="body" numberOfLines={2}>
                      <Text weight="600">{nameFor(settlement.from_member)}</Text>{' to '}
                      <Text weight="600">{nameFor(settlement.to_member)}</Text>
                    </Text>
                    <Text variant="caption" tone="faint">
                      {formatLongDate(settlement.settled_at.slice(0, 10))}
                    </Text>
                    {settlement.note ? (
                      <Text variant="caption" tone="muted" numberOfLines={2}>
                        “{settlement.note}”
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.historyAmount}>
                    <Text variant="body" weight="600" numeric>
                      {money.formatBase(settlement.amount_cents)}
                    </Text>
                    <Text variant="caption" tone="faint">
                      {money.baseCurrency}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>

        {money.isConverting || money.missingDisplayRate ? (
          <FxFooter
            baseCurrency={money.baseCurrency}
            displayCurrency={money.displayCurrency}
            rate={money.displayRate}
            missing={money.missingDisplayRate}
          />
        ) : null}
      </Screen>

      <RecordPaymentSheet
        tripId={id}
        transfer={pending}
        onClose={() => setPending(null)}
        nameFor={nameFor}
        money={money}
        createdBy={session?.user.id}
      />
    </>
  );
}

function BalanceRow({
  balance,
  money,
  isMe,
}: {
  balance: MemberBalance;
  money: ReturnType<typeof useMoney>;
  isMe: boolean;
}) {
  const net = balance.net_cents;
  // Never colour alone: each row says what the number means.
  const state = net === 0 ? 'Settled' : net > 0 ? 'is owed' : 'owes';
  const tone = net === 0 ? 'muted' : net > 0 ? 'positive' : 'negative';

  return (
    <View style={styles.balanceRow}>
      <Avatar name={balance.display_name} size={34} />

      <View style={styles.balanceText}>
        <Text variant="body" weight="600" numberOfLines={1}>
          {balance.display_name}
          {isMe ? ' (you)' : ''}
        </Text>
        <Text variant="caption" tone="faint" numberOfLines={1}>
          paid {money.formatDisplay(balance.paid_cents)} · share{' '}
          {money.formatDisplay(balance.owed_cents)}
        </Text>
      </View>

      <View style={styles.balanceAmount}>
        <Text variant="caption" tone="muted">
          {state}
        </Text>
        {net !== 0 ? (
          <Text variant="body" weight="600" tone={tone} numeric>
            {money.formatDisplay(Math.abs(net))}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Recording a payment always writes the BASE-currency amount. When the user is
 * viewing another currency we show both, so nobody records a payment without
 * seeing what is actually being cleared.
 */
function RecordPaymentSheet({
  tripId,
  transfer,
  onClose,
  nameFor,
  money,
  createdBy,
}: {
  tripId: Uuid;
  transfer: Transfer | null;
  onClose: () => void;
  nameFor: (id: Uuid) => string;
  money: ReturnType<typeof useMoney>;
  createdBy: string | undefined;
}) {
  const record = useRecordSettlement(tripId);
  const toast = useToast();
  const digits = decimalDigitsFor(money.baseCurrency, money.currencies);

  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const suggested = transfer ? toMajorString(transfer.amount_cents, digits) : '';
  const effective = amountText.trim() === '' ? suggested : amountText;
  const parsed = parseAmount(effective, digits);

  async function submit() {
    if (!transfer || !createdBy) return;
    if (!parsed.ok) {
      setConfirming(false);
      return setError(parsed.error);
    }

    setError(null);
    try {
      await record.mutateAsync({
        fromMember: transfer.from_member,
        toMember: transfer.to_member,
        amountCents: parsed.minor,
        createdBy,
        note,
      });
      setConfirming(false);
      setAmountText('');
      setNote('');
      toast.success('Settlement recorded');
      onClose();
    } catch (e) {
      setConfirming(false);
      const message = friendlyError(e, 'Could not record that payment.');
      setError(message);
      toast.error(e, message);
    }
  }

  return (
    <>
      <Sheet
        visible={Boolean(transfer) && !confirming}
        onClose={onClose}
        title="Record a payment"
        footer={
          <Button
            label="Record payment"
            onPress={() => (parsed.ok ? setConfirming(true) : setError(parsed.error))}
            fullWidth
          />
        }
      >
        {transfer ? (
          <View style={styles.paymentBody}>
            <Text variant="body">
              <Text weight="600">{nameFor(transfer.from_member)}</Text> pays{' '}
              <Text weight="600">{nameFor(transfer.to_member)}</Text>
            </Text>

            <Input
              label={`Amount in ${money.baseCurrency}`}
              value={effective}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              inputMode="decimal"
              error={effective.length > 0 && !parsed.ok ? parsed.error : null}
              hint={`Settlements are always recorded in ${money.baseCurrency}, the trip's settle-up currency.`}
            />

            {money.isConverting && parsed.ok ? (
              <View style={styles.conversionNote}>
                <Text variant="caption" tone="muted">
                  That&apos;s about {money.formatDisplay(parsed.minor)} in {money.displayCurrency} at
                  today&apos;s rate — but {money.formatBase(parsed.minor)} is the amount actually
                  being cleared.
                </Text>
              </View>
            ) : null}

            <Input
              label="Note"
              value={note}
              onChangeText={setNote}
              placeholder="Optional — cash, bank transfer…"
            />

            {error ? (
              <Text variant="caption" tone="negative">
                {error}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <ConfirmDialog
        visible={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={submit}
        title="Record this payment?"
        message={
          transfer
            ? `This records that ${nameFor(transfer.from_member)} paid ${nameFor(transfer.to_member)} ${money.formatBase(parsed.ok ? parsed.minor : 0)}. Everyone's balance updates immediately.`
            : ''
        }
        confirmLabel="Record payment"
        loading={record.isPending}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Keeps the currency control off the viewport edge.
  headerRightRow: { paddingRight: spacing.lg },
  hero: { gap: spacing.xs },
  block: { gap: spacing.sm },
  list: { gap: spacing.md, marginTop: spacing.sm },

  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  balanceText: { flex: 1, gap: 2, minWidth: 0 },
  balanceAmount: { alignItems: 'flex-end', gap: 1 },

  settledBox: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  settledEmoji: { fontSize: 26 },

  transferRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  transferText: { flex: 1, gap: 1, minWidth: 0 },

  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  historyText: { flex: 1, gap: 1, minWidth: 0 },
  historyAmount: { alignItems: 'flex-end' },

  paymentBody: { gap: spacing.lg, paddingTop: spacing.sm },
  conversionNote: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningMuted,
  },
});
