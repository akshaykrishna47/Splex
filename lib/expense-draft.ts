/**
 * Turning a filled-in expense form into a write payload.
 *
 * This is where the pinning rule lives, so it can be tested without a UI:
 *
 *   - Editing the amount or the currency RE-PINS the FX rate to the current
 *     one. The caller must have confirmed that with the user first.
 *   - Editing only the title, category, date, payer, or the split shape must
 *     NOT touch the pinned rate. The stored rate and stored base total are
 *     reused, and only the distribution across members is recalculated.
 */

import { pinExpenseToBase, type ResolvedRate } from './fx';
import { decimalDigitsFor, pinSharesToBase, type CurrencyLookup } from './money';
import type { ComputedShare } from './splits';
import type { ExpenseWriteInput } from './repo/expenses';
import type { Category, CurrencyCode, Expense, IsoDate, ShareType, Uuid } from './types';

export type ExistingPin = Pick<
  Expense,
  'amount_cents' | 'currency' | 'base_amount_cents' | 'fx_rate' | 'fx_rate_date' | 'fx_source'
>;

export type BuildResult =
  | { ok: true; input: ExpenseWriteInput; repinned: boolean }
  | { ok: false; error: string };

export function buildExpenseWrite(params: {
  tripId: Uuid;
  title: string;
  amountMinor: number;
  currency: CurrencyCode;
  baseCurrency: CurrencyCode;
  currencies: CurrencyLookup;
  category: Category;
  paidBy: Uuid;
  expenseDate: IsoDate;
  mode: ShareType;
  shares: ComputedShare[];
  notes?: string | null;
  receiptUrl?: string | null;
  /** The current cached rate, needed only when the ledger figures change. */
  freshRate: ResolvedRate | null;
  /** Present when editing. Absent when creating. */
  existing?: ExistingPin | null;
}): BuildResult {
  const {
    tripId,
    title,
    amountMinor,
    currency,
    baseCurrency,
    currencies,
    category,
    paidBy,
    expenseDate,
    mode,
    shares,
    notes,
    receiptUrl,
    freshRate,
    existing,
  } = params;

  if (shares.length === 0) return { ok: false, error: 'Include at least one person in the split.' };
  if (amountMinor <= 0) return { ok: false, error: 'Enter an amount greater than zero.' };

  const shareMinor = shares.map((s) => s.shareCents);
  const shareSum = shareMinor.reduce((a, b) => a + b, 0);
  if (shareSum !== amountMinor) {
    return { ok: false, error: 'The split does not add up to the total.' };
  }

  const sameCurrency = currency.toUpperCase() === baseCurrency.toUpperCase();

  const ledgerChanged =
    !existing ||
    existing.amount_cents !== amountMinor ||
    existing.currency.toUpperCase() !== currency.toUpperCase();

  let baseAmountCents: number;
  let baseShareCents: number[];
  let fxRate: string;
  let fxRateDate: IsoDate;
  let fxSource: string;

  if (!ledgerChanged && existing) {
    // Keep the original pin. Only the distribution across members can move.
    baseAmountCents = existing.base_amount_cents;
    fxRate = existing.fx_rate;
    fxRateDate = existing.fx_rate_date;
    fxSource = existing.fx_source;

    baseShareCents = sameCurrency
      ? [...shareMinor]
      : pinSharesToBase(
          shareMinor,
          baseAmountCents,
          decimalDigitsFor(currency, currencies),
          decimalDigitsFor(baseCurrency, currencies),
          fxRate,
        );
  } else {
    if (!sameCurrency && !freshRate) {
      return {
        ok: false,
        error: `No cached exchange rate for ${currency.toUpperCase()} → ${baseCurrency.toUpperCase()} yet. Rates refresh every few hours — try again shortly.`,
      };
    }

    const pinned = pinExpenseToBase({
      amountMinor,
      shareMinor,
      currency,
      baseCurrency,
      currencies,
      rate:
        freshRate ??
        ({
          rate: '1.0000000000',
          rate_date: expenseDate,
          source: 'identity',
          fetched_at: new Date().toISOString(),
          derived: false,
        } satisfies ResolvedRate),
    });

    baseAmountCents = pinned.baseAmountCents;
    baseShareCents = pinned.baseShareCents;
    fxRate = pinned.fxRate;
    fxRateDate = pinned.fxRateDate;
    fxSource = pinned.fxSource;
  }

  // Belt and braces: the database rejects this too, via a deferred trigger.
  const baseSum = baseShareCents.reduce((a, b) => a + b, 0);
  if (baseSum !== baseAmountCents) {
    return {
      ok: false,
      error: `Converted shares total ${baseSum} but the converted amount is ${baseAmountCents}.`,
    };
  }

  return {
    ok: true,
    repinned: ledgerChanged && Boolean(existing),
    input: {
      tripId,
      title: title.trim(),
      amountCents: amountMinor,
      currency: currency.toUpperCase(),
      baseAmountCents,
      fxRate,
      fxRateDate,
      fxSource,
      category,
      paidBy,
      expenseDate,
      notes: notes ?? null,
      receiptUrl: receiptUrl ?? null,
      splits: shares.map((share, i) => ({
        member_id: share.memberId,
        share_cents: share.shareCents,
        base_share_cents: baseShareCents[i] as number,
        share_type: mode,
        share_value: share.shareValue,
      })),
    },
  };
}

/** Does saving this edit move the pinned rate? Drives the confirmation prompt. */
export function willRepin(
  existing: ExistingPin | null | undefined,
  amountMinor: number,
  currency: CurrencyCode,
): boolean {
  if (!existing) return false;
  return (
    existing.amount_cents !== amountMinor ||
    existing.currency.toUpperCase() !== currency.toUpperCase()
  );
}
