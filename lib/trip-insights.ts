/**
 * Derived views over a trip: summary totals, expense filtering, and recent
 * activity.
 *
 * All of it is computed from data that already exists — there is no activity
 * table and no stored aggregate. Nothing here recalculates a balance; balances
 * come from `lib/balances.ts` and the `trip_member_balances` view, which remain
 * the single source of truth.
 *
 * Everything operates on BASE-currency minor units, like the rest of the ledger.
 */

import { addDays, toIsoDate } from './dates';
import type {
  Category,
  CurrencyCode,
  ExpenseWithSplits,
  MemberBalance,
  Settlement,
  TripMember,
  Uuid,
} from './types';

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export type CategoryTotal = {
  category: Category;
  totalCents: number;
  /** 0–100, rounded to one decimal place. */
  percent: number;
};

export type TripSummary = {
  totalCents: number;
  expenseCount: number;
  memberCount: number;
  settledCents: number;
  /** What is still owed between members: the sum of positive net balances. */
  outstandingCents: number;
  byCategory: CategoryTotal[];
};

export function summarizeTrip(input: {
  expenses: ExpenseWithSplits[];
  members: TripMember[];
  settlements: Settlement[];
  balances: MemberBalance[];
}): TripSummary {
  const live = input.expenses.filter((e) => !e.deleted_at);
  const totalCents = live.reduce((sum, e) => sum + e.base_amount_cents, 0);
  const settledCents = input.settlements.reduce((sum, s) => sum + s.amount_cents, 0);

  // Positive and negative nets mirror each other, so summing the positive side
  // gives the amount still to change hands — not double it.
  const outstandingCents = input.balances
    .filter((b) => b.net_cents > 0)
    .reduce((sum, b) => sum + b.net_cents, 0);

  const totals = new Map<Category, number>();
  for (const expense of live) {
    const key = (expense.category ?? 'other') as Category;
    totals.set(key, (totals.get(key) ?? 0) + expense.base_amount_cents);
  }

  const byCategory: CategoryTotal[] = [...totals.entries()]
    .map(([category, cents]) => ({
      category,
      totalCents: cents,
      percent: totalCents === 0 ? 0 : Math.round((cents / totalCents) * 1000) / 10,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return {
    totalCents,
    expenseCount: live.length,
    memberCount: input.members.filter((m) => !m.removed_at).length,
    settledCents,
    outstandingCents,
    byCategory,
  };
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export type DateRangePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

export type ExpenseFilters = {
  /** Matches title, category label, or payer name. */
  search: string;
  categories: Category[];
  payers: Uuid[];
  currencies: CurrencyCode[];
  range: DateRangePreset;
  /** Only consulted when range is 'custom'. ISO dates. */
  from?: string | null;
  to?: string | null;
};

export const EMPTY_FILTERS: ExpenseFilters = {
  search: '',
  categories: [],
  payers: [],
  currencies: [],
  range: 'all',
  from: null,
  to: null,
};

export function hasActiveFilters(filters: ExpenseFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.categories.length > 0 ||
    filters.payers.length > 0 ||
    filters.currencies.length > 0 ||
    filters.range !== 'all'
  );
}

export function countActiveFilters(filters: ExpenseFilters): number {
  return (
    (filters.search.trim() ? 1 : 0) +
    (filters.categories.length ? 1 : 0) +
    (filters.payers.length ? 1 : 0) +
    (filters.currencies.length ? 1 : 0) +
    (filters.range !== 'all' ? 1 : 0)
  );
}

/**
 * Resolve a preset into an inclusive ISO date window.
 *
 * The week runs Monday–Sunday, matching the calendar in DateField.
 */
export function resolveDateRange(
  filters: ExpenseFilters,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  const today = toIsoDate(now);

  switch (filters.range) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const offset = (now.getDay() + 6) % 7; // Monday = 0
      return { from: addDays(today, -offset), to: addDays(today, 6 - offset) };
    }
    case 'month': {
      const first = toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
      const last = toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { from: first, to: last };
    }
    case 'custom':
      return { from: filters.from ?? null, to: filters.to ?? null };
    default:
      return { from: null, to: null };
  }
}

/**
 * Filter expenses for display.
 *
 * Purely a view concern — it never mutates the input array or the expenses in
 * it, and balances are always computed from the full unfiltered set.
 */
export function filterExpenses(
  expenses: ExpenseWithSplits[],
  filters: ExpenseFilters,
  context: {
    /** member id -> display name, for searching by payer. */
    memberNames: Map<Uuid, string>;
    /** category key -> label, for searching by category. */
    categoryLabels: Record<string, string>;
    now?: Date;
  },
): ExpenseWithSplits[] {
  const term = filters.search.trim().toLowerCase();
  const { from, to } = resolveDateRange(filters, context.now ?? new Date());

  return expenses.filter((expense) => {
    if (filters.categories.length > 0) {
      if (!filters.categories.includes((expense.category ?? 'other') as Category)) return false;
    }

    if (filters.payers.length > 0 && !filters.payers.includes(expense.paid_by)) return false;

    if (filters.currencies.length > 0) {
      if (!filters.currencies.includes(expense.currency.toUpperCase())) return false;
    }

    if (from && expense.expense_date < from) return false;
    if (to && expense.expense_date > to) return false;

    if (term) {
      const payer = context.memberNames.get(expense.paid_by)?.toLowerCase() ?? '';
      const label = (context.categoryLabels[expense.category ?? 'other'] ?? '').toLowerCase();
      const haystack = `${expense.title.toLowerCase()} ${payer} ${label} ${expense.notes?.toLowerCase() ?? ''}`;
      if (!haystack.includes(term)) return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

export type ActivityItem = {
  id: string;
  kind: 'expense' | 'settlement' | 'member';
  /** Sort key — ISO timestamp. */
  at: string;
  actor: string;
  /** Pre-composed sentence fragment after the actor, e.g. "added Dinner". */
  text: string;
  /** Base-currency minor units, when the item involves money. */
  amountCents?: number;
  /** The expense's own currency and amount, when it differs from base. */
  originalAmountCents?: number;
  originalCurrency?: CurrencyCode;
  /** Icon name for the row, resolved to a glyph by the UI. */
  icon: string;
};

/**
 * Recent activity, derived entirely from rows that already exist.
 *
 * No activity table, and deliberately no invented events: every item here is
 * backed by an expense, a settlement, or a member row. A dedicated table would
 * let us show edits and deletions too, but it would also mean writing history
 * rows on every mutation — not worth it for a feature that is glanceable
 * context, not an audit log.
 */
export function buildActivity(input: {
  expenses: ExpenseWithSplits[];
  settlements: Settlement[];
  members: TripMember[];
  categoryIcon: (category: string) => string;
  limit?: number;
}): ActivityItem[] {
  const names = new Map(input.members.map((m) => [m.id, m.display_name]));
  const items: ActivityItem[] = [];

  for (const expense of input.expenses) {
    if (expense.deleted_at) continue;
    items.push({
      id: `expense-${expense.id}`,
      kind: 'expense',
      at: expense.created_at,
      actor: names.get(expense.paid_by) ?? 'Someone',
      text: `added ${expense.title}`,
      amountCents: expense.base_amount_cents,
      originalAmountCents: expense.amount_cents,
      originalCurrency: expense.currency,
      icon: input.categoryIcon(expense.category ?? 'other'),
    });
  }

  for (const settlement of input.settlements) {
    items.push({
      id: `settlement-${settlement.id}`,
      kind: 'settlement',
      at: settlement.settled_at,
      actor: names.get(settlement.from_member) ?? 'Someone',
      text: `settled with ${names.get(settlement.to_member) ?? 'someone'}`,
      amountCents: settlement.amount_cents,
      icon: 'settle',
    });
  }

  // A member row's created_at is when they were added to the trip. The trip
  // owner is skipped — "the creator joined their own trip" is noise.
  const owner = input.members.find((m) => m.role === 'owner');
  for (const member of input.members) {
    if (member.id === owner?.id) continue;
    items.push({
      id: `member-${member.id}`,
      kind: 'member',
      at: member.created_at,
      actor: member.display_name,
      text: member.user_id ? 'joined the trip' : 'was added to the trip',
      icon: 'invite',
    });
  }

  return items
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, input.limit ?? 8);
}
