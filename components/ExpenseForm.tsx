import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CurrencyPicker } from './CurrencyPicker';
import { Screen } from './Screen';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import { friendlyError } from '@/lib/errors';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { DateField } from './ui/DateField';
import { Icon, type IconName } from './ui/Icon';
import { Input } from './ui/Input';
import { MultiSelect, Select } from './ui/Select';
import { Sheet } from './ui/Sheet';
import { Text } from './ui/Text';
import { todayIso, isValidIsoDate } from '@/lib/dates';
import { buildExpenseWrite, willRepin } from '@/lib/expense-draft';
import { resolveRate } from '@/lib/fx';
import { useMoney } from '@/lib/hooks/useMoney';
import { decimalDigitsFor, formatMinor, parseAmount, toMajorString } from '@/lib/money';
import { useDeleteExpense, useMembers, useSaveExpense, useTrip } from '@/lib/queries';
import { computeSplits, type SplitEntry } from '@/lib/splits';
import { usePrefsStore } from '@/lib/stores/prefs';
import { useSessionStore } from '@/lib/stores/session';
import { CATEGORY_KEYS, categoryMeta, colors, radius, spacing } from '@/lib/theme';
import type { Category, ExpenseWithSplits, ShareType, Uuid } from '@/lib/types';

const SPLIT_MODES: { value: ShareType; label: string; hint: string }[] = [
  { value: 'equal', label: 'Equally', hint: 'Divide the total evenly' },
  { value: 'exact', label: 'Exact amounts', hint: 'Type what each person owes' },
  { value: 'percent', label: 'Percentage', hint: 'Give each person a share of 100%' },
  { value: 'shares', label: 'Shares', hint: 'Weight it, e.g. 2 shares to 1' },
];

/**
 * Progressive disclosure: an equal split needs no per-person inputs at all, so
 * the breakdown below only appears when the chosen method actually asks the
 * user for numbers.
 */
const SPLIT_HELP: Record<ShareType, string> = {
  equal: 'Everyone selected pays the same amount.',
  exact: 'Enter each amount. They must add up to the total.',
  percent: 'Enter each percentage. They must add up to 100%.',
  shares: 'Enter shares. Someone with 2 pays twice someone with 1.',
};

export type ExpenseFormProps = {
  tripId: Uuid;
  /** Present when editing. The same component serves create and edit. */
  expense?: ExpenseWithSplits | null;
  /**
   * Present when duplicating. Seeds every field from an existing expense but
   * creates a NEW one — so the date resets to today and, critically, the FX
   * rate is pinned fresh rather than inheriting a stale one. `existing` stays
   * null on save, which is what makes buildExpenseWrite re-pin.
   */
  template?: ExpenseWithSplits | null;
};

export function ExpenseForm({ tripId, expense, template }: ExpenseFormProps) {
  const router = useRouter();
  const toast = useToast();
  const session = useSessionStore((s) => s.session);
  const trip = useTrip(tripId);
  const members = useMembers(tripId);
  const money = useMoney(trip.data);

  const saveExpense = useSaveExpense(tripId);
  const deleteExpense = useDeleteExpense(tripId);

  const lastCurrency = usePrefsStore((s) => s.lastCurrencyByTrip[tripId]);
  const recentCurrencies = usePrefsStore((s) => s.recentCurrencies);
  const rememberTripCurrency = usePrefsStore((s) => s.rememberTripCurrency);

  const isEditing = Boolean(expense);
  const memberList = members.data ?? [];

  // Whichever expense is seeding the form. Editing uses its own values;
  // duplicating borrows them for a brand-new expense.
  const source = expense ?? template ?? null;

  // --- form state -----------------------------------------------------------

  const [title, setTitle] = useState(source?.title ?? '');
  const [amountText, setAmountText] = useState(() =>
    source ? initialAmountText(source, money) : '',
  );
  const [currency, setCurrency] = useState(
    () => source?.currency ?? lastCurrency ?? trip.data?.base_currency ?? 'USD',
  );
    // Defaults to Other: guessing a category for the user is worse than letting
  // them pick, and Other is always a valid answer.
  const [category, setCategory] = useState<Category>(source?.category ?? 'other');
  // A duplicate is a new expense happening now, so it starts at today rather
  // than inheriting the original's date.
  const [expenseDate, setExpenseDate] = useState(expense?.expense_date ?? todayIso());
  const [paidBy, setPaidBy] = useState<Uuid | null>(source?.paid_by ?? null);
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [mode, setMode] = useState<ShareType>(
    (source?.splits?.[0]?.share_type as ShareType) ?? 'equal',
  );
  const [entries, setEntries] = useState<Record<Uuid, SplitEntry>>({});
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [confirmRepin, setConfirmRepin] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The queries above resolve AFTER first render, but useState initialisers run
   * on the first one. Seeding the fields there produced two real bugs:
   *
   *   - a new expense defaulted to USD, because trip.base_currency wasn't known
   *   - editing a JPY expense showed "55.00" for ¥5,500, because decimal_digits
   *     fell back to 2 before the currencies table had loaded
   *
   * So seed once, when the data actually arrives.
   */
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !trip.data || !money.ready) return;
    seeded.current = true;

    setCurrency(source?.currency ?? lastCurrency ?? trip.data.base_currency);

    if (source) {
      setAmountText(
        toMajorString(source.amount_cents, decimalDigitsFor(source.currency, money.currencies)),
      );
    }
  }, [trip.data, money.ready, money.currencies, source, lastCurrency]);

  // Most people pay for their own expenses, so preselect the signed-in member.
  useEffect(() => {
    if (paidBy || source || memberList.length === 0) return;
    const me = memberList.find((m) => m.user_id && m.user_id === session?.user.id);
    if (me) setPaidBy(me.id);
  }, [paidBy, source, memberList, session?.user.id]);

  // Default: everyone in, paid by whoever the trip thinks is first, unless the
  // expense being edited says otherwise.
  const resolvedEntries = useMemo(() => {
    const out: SplitEntry[] = memberList.map((member) => {
      const override = entries[member.id];
      if (override) return override;

      const existingSplit = source?.splits?.find((s) => s.member_id === member.id);
      return {
        memberId: member.id,
        included: source ? Boolean(existingSplit) : true,
        value: existingSplit?.share_value != null ? String(existingSplit.share_value) : '',
      };
    });
    return out;
  }, [memberList, entries, source]);

  // Dropdown options. Everything the user picks here already has a known set of
  // valid answers, so none of it is free text — that rules out typos, duplicate
  // people, and members who aren't on the trip.
  const memberOptions = useMemo(
    () =>
      memberList.map((member) => ({
        value: member.id,
        label: member.display_name,
        hint: member.user_id ? undefined : 'no account yet',
        icon: <Avatar name={member.display_name} size={22} />,
      })),
    [memberList],
  );

  const categoryOptions = useMemo(
    () =>
      CATEGORY_KEYS.map((key) => ({
        value: key,
        label: categoryMeta[key].label,
        icon: <Icon name={key as IconName} size={20} color={categoryMeta[key].tint} />,
      })),
    [],
  );

  const includedIds = useMemo(
    () => resolvedEntries.filter((e) => e.included).map((e) => e.memberId),
    [resolvedEntries],
  );

  const digits = decimalDigitsFor(currency, money.currencies);
  const parsed = parseAmount(amountText, digits);
  const totalMinor = parsed.ok ? parsed.minor : 0;

  const splitResult = useMemo(
    () => computeSplits({ mode, totalMinor, decimalDigits: digits, entries: resolvedEntries }),
    [mode, totalMinor, digits, resolvedEntries],
  );

  const freshRate = useMemo(
    () => resolveRate(currency, money.baseCurrency, money.rateTable),
    [currency, money.baseCurrency, money.rateTable],
  );

  const repins = willRepin(expense ?? null, totalMinor, currency);
  const foreign = currency.toUpperCase() !== money.baseCurrency;

  const canSave =
    Boolean(title.trim()) &&
    parsed.ok &&
    Boolean(paidBy) &&
    isValidIsoDate(expenseDate) &&
    splitResult.ok;

  function updateEntry(memberId: Uuid, patch: Partial<SplitEntry>) {
    const current = resolvedEntries.find((e) => e.memberId === memberId);
    if (!current) return;
    setEntries((prev) => ({ ...prev, [memberId]: { ...current, ...patch } }));
  }

  /** Multi-select gives back the full included set; mirror it onto the entries. */
  function setIncluded(ids: string[]) {
    const next: Record<Uuid, SplitEntry> = {};
    for (const entry of resolvedEntries) {
      next[entry.memberId] = { ...entry, included: ids.includes(entry.memberId) };
    }
    setEntries(next);
  }

  async function save() {
    setError(null);

    if (!parsed.ok) return setError(parsed.error);
    if (!paidBy) return setError('Choose who paid.');
    if (!isValidIsoDate(expenseDate)) return setError('Pick a date for this expense.');
    if (!splitResult.ok) return setError(splitResult.error);
    if (!trip.data) return setError('Trip not loaded yet.');

    const built = buildExpenseWrite({
      tripId,
      title,
      amountMinor: parsed.minor,
      currency,
      baseCurrency: money.baseCurrency,
      currencies: money.currencies,
      category,
      paidBy,
      expenseDate,
      mode,
      shares: splitResult.shares,
      notes,
      receiptUrl: expense?.receipt_url ?? null,
      freshRate,
      existing: expense ?? null,
    });

    if (!built.ok) return setError(built.error);

    try {
      await saveExpense.mutateAsync({ expenseId: expense?.id, input: built.input });
      rememberTripCurrency(tripId, currency);
      toast.success(isEditing ? 'Expense updated' : 'Expense added');
      router.back();
    } catch (e) {
      const message = friendlyError(e, 'Could not save the expense. Please try again.');
      setError(message);
      toast.error(e, message);
    }
  }

  function attemptSave() {
    // Changing the amount or currency moves the pinned rate. Say so first.
    if (repins) setConfirmRepin(true);
    else void save();
  }

  async function remove() {
    if (!expense) return;
    try {
      await deleteExpense.mutateAsync(expense.id);
      setConfirmDelete(false);
      toast.success('Expense deleted');
      router.back();
    } catch (e) {
      setConfirmDelete(false);
      toast.error(e, 'Could not delete the expense.');
    }
  }

  /**
   * Duplicating opens a fresh create form seeded from this expense. It does not
   * copy the stored FX pin: the new expense is saved through the normal path,
   * so if it is in a foreign currency it gets today's rate, not the original's.
   */
  function duplicate() {
    if (!expense) return;
    router.replace(`/trip/${tripId}/expense/new?from=${expense.id}`);
  }

  return (
    <>
      <Screen
        loading={trip.isLoading || members.isLoading}
        error={trip.error}
        footer={
          <View style={styles.footerRow}>
            {isEditing ? (
              <>
                <Button label="Delete" variant="ghost" onPress={() => setConfirmDelete(true)} />
                <Button label="Duplicate" variant="secondary" onPress={duplicate} />
              </>
            ) : null}
            <Button
              label={isEditing ? 'Save changes' : 'Add expense'}
              size="lg"
              onPress={attemptSave}
              disabled={!canSave}
              loading={saveExpense.isPending}
              style={styles.saveButton}
            />
          </View>
        }
      >
        {/* --- what and how much ------------------------------------------ */}
        <Card padding="lg" style={styles.block}>
          <Input
            label="What was it?"
            value={title}
            onChangeText={setTitle}
            placeholder="Dinner at the night market"
            autoFocus={!isEditing}
          />

          <Input
            label="Amount"
            value={amountText}
            onChangeText={setAmountText}
            placeholder={digits === 0 ? '1200' : '0.00'}
            keyboardType="decimal-pad"
            inputMode="decimal"
            error={amountText.length > 0 && !parsed.ok ? parsed.error : null}
            trailing={
              <Pressable
                onPress={() => setCurrencyOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Currency: ${currency}`}
                style={styles.currencyChip}
              >
                <Text variant="label" tone="primary">
                  {currency}
                </Text>
              </Pressable>
            }
          />

          {foreign && parsed.ok ? (
            <Text variant="caption" tone="muted">
              {freshRate
                ? `Converts to about ${money.formatBase(
                    convertPreview(parsed.minor, digits, money, freshRate.rate),
                  )} — pinned at today's rate when you save, and never recalculated after that.`
                : `No cached rate for ${currency} → ${money.baseCurrency} yet, so this can't be saved. Rates refresh every few hours.`}
            </Text>
          ) : null}

        </Card>

        {/* --- category, date, payer -------------------------------------- */}
        <Card padding="lg" style={styles.block}>
          <Select
            label="Category"
            value={category}
            onChange={(value) => setCategory(value as Category)}
            options={categoryOptions}
            placeholder="Select a category"
          />

          <DateField
            label="Date"
            value={expenseDate}
            onChange={setExpenseDate}
            helper="Defaults to today. Tap to pick another day."
          />

          <Select
            label="Who paid?"
            title="Who paid?"
            value={paidBy}
            onChange={setPaidBy}
            options={memberOptions}
            placeholder="Select participant"
            error={!paidBy ? 'Required.' : null}
          />
        </Card>

        {/* --- split ------------------------------------------------------- */}
        <Card padding="lg" style={styles.block}>
          <View style={styles.splitHeader}>
            <Text variant="heading">Split</Text>
            <RemainingIndicator result={splitResult} digits={digits} currency={currency} money={money} />
          </View>

          <Select
            label="How should it be split?"
            title="Split method"
            value={mode}
            onChange={(value) => setMode(value as ShareType)}
            options={SPLIT_MODES}
            helper={SPLIT_HELP[mode]}
          />

          <MultiSelect
            label="Who's splitting this?"
            title="Who's splitting this?"
            values={includedIds}
            onChange={setIncluded}
            options={memberOptions}
            placeholder="Select participants"
            noun="people"
            error={includedIds.length === 0 ? 'Include at least one person.' : null}
          />

          {/* Per-person amounts only exist for the modes that need them. An
              equal split has nothing to type. */}
          {includedIds.length > 0 ? (
            <View style={styles.breakdown}>
              {resolvedEntries
                .filter((entry) => entry.included)
                .map((entry) => {
                  const member = memberList.find((m) => m.id === entry.memberId);
                  if (!member) return null;

                  const computed = splitResult.ok
                    ? splitResult.shares.find((s) => s.memberId === entry.memberId)
                    : undefined;

                  return (
                    <View key={entry.memberId} style={styles.splitRow}>
                      <Avatar name={member.display_name} size={28} />
                      <Text variant="body" numberOfLines={1} style={styles.splitName}>
                        {member.display_name}
                      </Text>

                      {mode !== 'equal' ? (
                        <Input
                          value={entry.value ?? ''}
                          onChangeText={(value) => updateEntry(entry.memberId, { value })}
                          placeholder={mode === 'percent' ? '%' : mode === 'shares' ? '1' : '0.00'}
                          keyboardType="decimal-pad"
                          inputMode="decimal"
                          containerStyle={styles.splitInput}
                        />
                      ) : null}

                      <Text variant="caption" tone="muted" style={styles.splitAmount}>
                        {computed ? formatMinor(computed.shareCents, currency, money.currencies) : '—'}
                      </Text>
                    </View>
                  );
                })}
            </View>
          ) : null}
        </Card>

        <Card padding="lg">
          <Input
            label="Notes"
            value={notes ?? ''}
            onChangeText={setNotes}
            placeholder="Optional"
            multiline
            numberOfLines={3}
          />
        </Card>

        {error ? (
          <Text variant="caption" tone="negative">
            {error}
          </Text>
        ) : null}
      </Screen>

      <CurrencyPicker
        visible={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        onSelect={setCurrency}
        currencies={money.currencyList}
        selected={currency}
        pinned={money.baseCurrency}
        recent={recentCurrencies}
      />

      <ConfirmDialog
        visible={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete this expense?"
        message={`"${title}" will be removed from the trip and everyone's balance will be recalculated without it. This can't be undone from the app.`}
        confirmLabel="Delete expense"
        destructive
        loading={deleteExpense.isPending}
      />

      <Sheet
        visible={confirmRepin}
        onClose={() => setConfirmRepin(false)}
        title="This will re-pin the exchange rate"
        footer={
          <View style={styles.footerRow}>
            <Button label="Cancel" variant="secondary" onPress={() => setConfirmRepin(false)} />
            <Button
              label="Save anyway"
              style={styles.saveButton}
              onPress={() => {
                setConfirmRepin(false);
                void save();
              }}
            />
          </View>
        }
      >
        <Text variant="body" tone="muted">
          You changed the amount or the currency, so this expense will be converted again at
          today&apos;s rate rather than the one it was saved with
          {expense ? ` on ${expense.fx_rate_date}` : ''}.
        </Text>
        <Text variant="body" tone="muted" style={styles.confirmDetail}>
          Everyone&apos;s balance for this expense will shift accordingly. Editing only the title,
          category, or who paid would have left the original rate untouched.
        </Text>
      </Sheet>
    </>
  );
}

function RemainingIndicator({
  result,
  digits,
  currency,
  money,
}: {
  result: ReturnType<typeof computeSplits>;
  digits: number;
  currency: string;
  money: ReturnType<typeof useMoney>;
}) {
  const remainder = result.remainder;
  if (!remainder) {
    return result.ok ? null : (
      <Text variant="caption" tone="negative">
        {result.error}
      </Text>
    );
  }

  const settled =
    remainder.kind === 'amount' ? remainder.minor === 0 : Math.abs(remainder.value) < 0.005;

  if (settled) {
    return (
      <Text variant="caption" tone="positive" weight="600">
        Fully assigned
      </Text>
    );
  }

  return (
    <Text variant="caption" tone="negative" weight="600">
      {remainder.kind === 'amount'
        ? `${remainder.minor > 0 ? 'Remaining' : 'Over by'} ${formatMinor(
            Math.abs(remainder.minor),
            currency,
            money.currencies,
          )}`
        : `${remainder.value > 0 ? 'Remaining' : 'Over by'} ${Math.abs(remainder.value)}%`}
    </Text>
  );
}

/** Rough base-currency preview shown under the amount field, before saving. */
function convertPreview(
  minor: number,
  fromDigits: number,
  money: ReturnType<typeof useMoney>,
  rate: string,
): number {
  const toDigits = decimalDigitsFor(money.baseCurrency, money.currencies);
  const scale = 10 ** (toDigits - fromDigits);
  return Math.round(minor * Number(rate) * scale);
}

function initialAmountText(expense: ExpenseWithSplits, money: ReturnType<typeof useMoney>): string {
  return toMajorString(expense.amount_cents, decimalDigitsFor(expense.currency, money.currencies));
}

const styles = StyleSheet.create({
  block: { gap: spacing.lg },
  currencyChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
  },
  splitHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.surface },
  breakdown: { gap: spacing.md },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  splitName: { flex: 1 },
  optionEmoji: { fontSize: 18 },
  splitInput: { width: 88 },
  splitAmount: { minWidth: 72, textAlign: 'right' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  saveButton: { flex: 1 },
  confirmDetail: { marginTop: spacing.md },
});
