import { supabase } from '@/lib/supabase';
import type {
  Category,
  CurrencyCode,
  ExpenseWithSplits,
  IsoDate,
  ShareType,
  Uuid,
} from '@/lib/types';

export type ExpenseSplitInput = {
  member_id: Uuid;
  share_cents: number;
  base_share_cents: number;
  share_type: ShareType;
  share_value: number | null;
};

export type ExpenseWriteInput = {
  tripId: Uuid;
  title: string;
  amountCents: number;
  currency: CurrencyCode;
  /** Pinned at save time by lib/fx.ts. Never recomputed on read. */
  baseAmountCents: number;
  fxRate: string;
  fxRateDate: IsoDate;
  fxSource: string;
  category: Category;
  paidBy: Uuid;
  expenseDate: IsoDate;
  splits: ExpenseSplitInput[];
  notes?: string | null;
  receiptUrl?: string | null;
};

const SELECT_WITH_SPLITS = '*, splits:expense_splits(*)';

export const expensesRepo = {
  /** Live expenses for a trip, newest first. Soft-deleted rows never appear. */
  async listForTrip(tripId: Uuid): Promise<ExpenseWithSplits[]> {
    const { data, error } = await supabase
      .from('expenses')
      .select(SELECT_WITH_SPLITS)
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as ExpenseWithSplits[];
  },

  async get(expenseId: Uuid): Promise<ExpenseWithSplits | null> {
    const { data, error } = await supabase
      .from('expenses')
      .select(SELECT_WITH_SPLITS)
      .eq('id', expenseId)
      .maybeSingle();

    if (error) throw error;
    return (data as ExpenseWithSplits) ?? null;
  },

  /**
   * An expense and its splits must be written in ONE transaction: the deferred
   * balance trigger checks sum(share_cents) == amount_cents at commit, and
   * PostgREST gives every request its own transaction. Hence the RPC.
   */
  async create(input: ExpenseWriteInput): Promise<Uuid> {
    const { data, error } = await supabase.rpc('create_expense', toRpcArgs(input));
    if (error) throw error;
    return data as Uuid;
  },


  /**
   * Editing the amount or currency re-pins the FX rate to the current one; the
   * caller is responsible for having confirmed that with the user first.
   * Editing only the title or category leaves the pinned rate alone.
   */
  async update(expenseId: Uuid, input: ExpenseWriteInput): Promise<Uuid> {
    const { p_trip_id: _omit, ...args } = toRpcArgs(input);
    const { data, error } = await supabase.rpc('update_expense', {
      p_expense_id: expenseId,
      ...args,
    });
    if (error) throw error;
    return data as Uuid;
  },

  /** INVARIANT 6: soft delete only. There is no hard-delete path. */
  async softDelete(expenseId: Uuid): Promise<void> {
    const { error } = await supabase.rpc('soft_delete_expense', { p_expense_id: expenseId });
    if (error) throw error;
  },
};

function toRpcArgs(input: ExpenseWriteInput) {
  return {
    p_trip_id: input.tripId,
    p_title: input.title,
    p_amount_cents: input.amountCents,
    p_currency: input.currency.toUpperCase(),
    p_base_amount_cents: input.baseAmountCents,
    p_fx_rate: input.fxRate,
    p_fx_rate_date: input.fxRateDate,
    p_fx_source: input.fxSource,
    p_category: input.category,
    p_paid_by: input.paidBy,
    p_expense_date: input.expenseDate,
    p_splits: input.splits,
    p_notes: input.notes ?? null,
    p_receipt_url: input.receiptUrl ?? null,
  };
}
