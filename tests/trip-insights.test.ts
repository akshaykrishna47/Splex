import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  buildActivity,
  countActiveFilters,
  filterExpenses,
  hasActiveFilters,
  resolveDateRange,
  summarizeTrip,
} from '@/lib/trip-insights';
import type { ExpenseWithSplits, MemberBalance, Settlement, TripMember } from '@/lib/types';
import { MEMBERS } from './fixtures';

// --- fixtures ---------------------------------------------------------------

function member(id: string, name: string, extra: Partial<TripMember> = {}): TripMember {
  return {
    id,
    trip_id: 'trip-1',
    user_id: null,
    display_name: name,
    role: 'member',
    removed_at: null,
    created_at: '2026-08-10T00:00:00.000Z',
    ...extra,
  };
}

function expense(over: Partial<ExpenseWithSplits> = {}): ExpenseWithSplits {
  return {
    id: 'e1',
    trip_id: 'trip-1',
    title: 'Dinner',
    amount_cents: 12000,
    currency: 'SGD',
    base_amount_cents: 12000,
    fx_rate: '1.0000000000',
    fx_rate_date: '2026-08-15',
    fx_source: 'identity',
    category: 'food',
    paid_by: MEMBERS.aditi,
    expense_date: '2026-08-15',
    receipt_url: null,
    notes: null,
    created_by: 'user-1',
    created_at: '2026-08-15T10:00:00.000Z',
    updated_at: '2026-08-15T10:00:00.000Z',
    deleted_at: null,
    splits: [],
    ...over,
  };
}

function settlement(over: Partial<Settlement> = {}): Settlement {
  return {
    id: 's1',
    trip_id: 'trip-1',
    from_member: MEMBERS.ben,
    to_member: MEMBERS.aditi,
    amount_cents: 2000,
    note: null,
    settled_at: '2026-08-16T09:00:00.000Z',
    created_by: 'user-1',
    created_at: '2026-08-16T09:00:00.000Z',
    ...over,
  };
}

function balance(id: string, net: number): MemberBalance {
  return {
    member_id: id,
    display_name: id,
    paid_cents: net > 0 ? net : 0,
    owed_cents: net < 0 ? -net : 0,
    settlements_cents: 0,
    net_cents: net,
  };
}

const MEMBER_LIST = [
  member(MEMBERS.aditi, 'Aditi', { role: 'owner', user_id: 'user-1' }),
  member(MEMBERS.ben, 'Ben'),
  member(MEMBERS.cara, 'Cara'),
];

const CONTEXT = {
  memberNames: new Map(MEMBER_LIST.map((m) => [m.id, m.display_name])),
  categoryLabels: { food: 'Food & Drinks', transport: 'Transport', other: 'Other' },
};

// --- summary ----------------------------------------------------------------

describe('summarizeTrip', () => {
  const expenses = [
    expense({ id: 'e1', base_amount_cents: 5000, category: 'food' }),
    expense({ id: 'e2', base_amount_cents: 3000, category: 'food' }),
    expense({ id: 'e3', base_amount_cents: 2000, category: 'transport' }),
  ];

  it('totals only live expenses', () => {
    const summary = summarizeTrip({
      expenses: [...expenses, expense({ id: 'e4', base_amount_cents: 9999, deleted_at: 'x' })],
      members: MEMBER_LIST,
      settlements: [],
      balances: [],
    });

    expect(summary.totalCents).toBe(10000);
    expect(summary.expenseCount).toBe(3);
  });

  it('counts only members still on the trip', () => {
    const summary = summarizeTrip({
      expenses,
      members: [...MEMBER_LIST, member('gone', 'Gone', { removed_at: '2026-08-16' })],
      settlements: [],
      balances: [],
    });
    expect(summary.memberCount).toBe(3);
  });

  it('sums settlements and outstanding without double counting', () => {
    // Nets always mirror: +50 / -30 / -20. Outstanding is the positive side.
    const summary = summarizeTrip({
      expenses,
      members: MEMBER_LIST,
      settlements: [settlement({ amount_cents: 2000 }), settlement({ id: 's2', amount_cents: 500 })],
      balances: [balance('a', 5000), balance('b', -3000), balance('c', -2000)],
    });

    expect(summary.settledCents).toBe(2500);
    expect(summary.outstandingCents).toBe(5000);
  });

  it('breaks down by category, largest first, summing to 100%', () => {
    const summary = summarizeTrip({
      expenses,
      members: MEMBER_LIST,
      settlements: [],
      balances: [],
    });

    expect(summary.byCategory.map((c) => c.category)).toEqual(['food', 'transport']);
    expect(summary.byCategory[0]?.totalCents).toBe(8000);
    expect(summary.byCategory[0]?.percent).toBe(80);
    expect(summary.byCategory[1]?.percent).toBe(20);
    expect(summary.byCategory.reduce((s, c) => s + c.percent, 0)).toBe(100);
  });

  it('treats a missing category as Other', () => {
    const summary = summarizeTrip({
      expenses: [expense({ category: null as never, base_amount_cents: 1000 })],
      members: MEMBER_LIST,
      settlements: [],
      balances: [],
    });
    expect(summary.byCategory[0]?.category).toBe('other');
  });

  it('does not divide by zero on an empty trip', () => {
    const summary = summarizeTrip({ expenses: [], members: [], settlements: [], balances: [] });
    expect(summary.totalCents).toBe(0);
    expect(summary.byCategory).toEqual([]);
  });
});

// --- filtering --------------------------------------------------------------

describe('filterExpenses', () => {
  const expenses = [
    expense({ id: 'e1', title: 'Dinner', category: 'food', paid_by: MEMBERS.aditi, currency: 'SGD', expense_date: '2026-08-15' }),
    expense({ id: 'e2', title: 'Taxi', category: 'transport', paid_by: MEMBERS.ben, currency: 'THB', expense_date: '2026-08-10' }),
    expense({ id: 'e3', title: 'Lunch', category: 'food', paid_by: MEMBERS.ben, currency: 'SGD', expense_date: '2026-08-01' }),
  ];

  it('returns everything when no filter is set', () => {
    expect(filterExpenses(expenses, EMPTY_FILTERS, CONTEXT)).toHaveLength(3);
  });

  it('searches title, payer, and category label', () => {
    const byTitle = filterExpenses(expenses, { ...EMPTY_FILTERS, search: 'taxi' }, CONTEXT);
    expect(byTitle.map((e) => e.id)).toEqual(['e2']);

    const byPayer = filterExpenses(expenses, { ...EMPTY_FILTERS, search: 'ben' }, CONTEXT);
    expect(byPayer.map((e) => e.id)).toEqual(['e2', 'e3']);

    const byCategory = filterExpenses(expenses, { ...EMPTY_FILTERS, search: 'food & drinks' }, CONTEXT);
    expect(byCategory.map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  it('filters by category, payer and currency', () => {
    expect(
      filterExpenses(expenses, { ...EMPTY_FILTERS, categories: ['food'] }, CONTEXT).map((e) => e.id),
    ).toEqual(['e1', 'e3']);

    expect(
      filterExpenses(expenses, { ...EMPTY_FILTERS, payers: [MEMBERS.ben] }, CONTEXT).map((e) => e.id),
    ).toEqual(['e2', 'e3']);

    expect(
      filterExpenses(expenses, { ...EMPTY_FILTERS, currencies: ['THB'] }, CONTEXT).map((e) => e.id),
    ).toEqual(['e2']);
  });

  it('combines filters with AND', () => {
    const result = filterExpenses(
      expenses,
      { ...EMPTY_FILTERS, categories: ['food'], payers: [MEMBERS.ben] },
      CONTEXT,
    );
    expect(result.map((e) => e.id)).toEqual(['e3']);
  });

  it('filters by a custom date range, inclusive at both ends', () => {
    const result = filterExpenses(
      expenses,
      { ...EMPTY_FILTERS, range: 'custom', from: '2026-08-10', to: '2026-08-15' },
      CONTEXT,
    );
    expect(result.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('never mutates the input', () => {
    const snapshot = JSON.stringify(expenses);
    filterExpenses(expenses, { ...EMPTY_FILTERS, search: 'dinner', categories: ['food'] }, CONTEXT);
    expect(JSON.stringify(expenses)).toBe(snapshot);
  });

  it('tracks whether any filter is active', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: '  ' })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, range: 'today' })).toBe(true);
    expect(countActiveFilters({ ...EMPTY_FILTERS, search: 'a', categories: ['food'] })).toBe(2);
  });
});

describe('resolveDateRange', () => {
  // Monday 17 August 2026.
  const now = new Date(2026, 7, 17, 12, 0, 0);

  it('today is a single day', () => {
    expect(resolveDateRange({ ...EMPTY_FILTERS, range: 'today' }, now)).toEqual({
      from: '2026-08-17',
      to: '2026-08-17',
    });
  });

  it('week runs Monday to Sunday', () => {
    expect(resolveDateRange({ ...EMPTY_FILTERS, range: 'week' }, now)).toEqual({
      from: '2026-08-17',
      to: '2026-08-23',
    });
  });

  it('week is correct mid-week too', () => {
    const thursday = new Date(2026, 7, 20, 12, 0, 0);
    expect(resolveDateRange({ ...EMPTY_FILTERS, range: 'week' }, thursday)).toEqual({
      from: '2026-08-17',
      to: '2026-08-23',
    });
  });

  it('month covers the whole calendar month', () => {
    expect(resolveDateRange({ ...EMPTY_FILTERS, range: 'month' }, now)).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('all is unbounded', () => {
    expect(resolveDateRange(EMPTY_FILTERS, now)).toEqual({ from: null, to: null });
  });
});

// --- activity ---------------------------------------------------------------

describe('buildActivity', () => {
  const base = {
    members: MEMBER_LIST,
    categoryIcon: () => 'food',
  };

  it('includes expenses, settlements and joins, newest first', () => {
    const items = buildActivity({
      ...base,
      expenses: [expense({ id: 'e1', created_at: '2026-08-15T10:00:00.000Z' })],
      settlements: [settlement({ settled_at: '2026-08-16T09:00:00.000Z' })],
    });

    expect(items[0]?.kind).toBe('settlement');
    expect(items.some((i) => i.kind === 'expense')).toBe(true);
    expect(items.some((i) => i.kind === 'member')).toBe(true);
  });

  it('attributes an expense to whoever paid', () => {
    const items = buildActivity({
      ...base,
      expenses: [expense({ paid_by: MEMBERS.ben, title: 'Hotel' })],
      settlements: [],
    });
    const item = items.find((i) => i.kind === 'expense');
    expect(item?.actor).toBe('Ben');
    expect(item?.text).toBe('added Hotel');
  });

  it('omits soft-deleted expenses', () => {
    const items = buildActivity({
      ...base,
      expenses: [expense({ deleted_at: '2026-08-16T00:00:00.000Z' })],
      settlements: [],
    });
    expect(items.some((i) => i.kind === 'expense')).toBe(false);
  });

  it('does not announce the owner joining their own trip', () => {
    const items = buildActivity({ ...base, expenses: [], settlements: [] });
    expect(items.some((i) => i.actor === 'Aditi' && i.kind === 'member')).toBe(false);
    expect(items.filter((i) => i.kind === 'member')).toHaveLength(2);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      expense({ id: `e${i}`, created_at: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );
    expect(buildActivity({ ...base, expenses: many, settlements: [], limit: 5 })).toHaveLength(5);
  });
});
