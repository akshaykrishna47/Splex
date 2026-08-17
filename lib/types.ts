/**
 * Domain types. These mirror the SQL schema in `supabase/migrations/`.
 *
 * Money convention used everywhere in this codebase:
 *   *_cents fields are integers in the currency's MINOR UNIT, and the number
 *   of minor units per major unit comes from `currencies.decimal_digits`.
 *   It is 100 for USD/SGD, 1 for JPY/VND/KRW, and 1000 for KWD/BHD.
 *   Never assume 100. See `lib/money.ts`.
 */

export type Uuid = string;
/** ISO 4217 alpha-3, uppercase. */
export type CurrencyCode = string;
/** ISO date, `YYYY-MM-DD`. */
export type IsoDate = string;

export const CATEGORIES = [
  'food',
  'lodging',
  'transport',
  'activities',
  'shopping',
  'flights',
  'tickets',
  'groceries',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export type ShareType = 'equal' | 'exact' | 'percent' | 'shares';
export type MemberRole = 'owner' | 'member';

export type UserProfile = {
  id: Uuid;
  email: string | null;
  display_name: string | null;
  /**
   * Assigned at signup: 4–6 letters of the name plus 2–4 digits, e.g.
   * `aksh4920`. Unique, and immutable — a database trigger rejects changes.
   */
  username: string;
  avatar_url: string | null;
  display_currency: CurrencyCode | null;
  created_at: string;
};

export type Trip = {
  id: Uuid;
  name: string;
  /** Optional one-liner, e.g. "Tokyo, Osaka and Kyoto with the group". */
  description: string | null;
  /** Optional single emoji used as the trip's icon. */
  emoji: string | null;
  created_by: Uuid;
  base_currency: CurrencyCode;
  invite_code: string;
  archived_at: string | null;
  created_at: string;
};

export type TripMember = {
  id: Uuid;
  trip_id: Uuid;
  /** Null for a bare-name member who has no account yet. Load-bearing. */
  user_id: Uuid | null;
  display_name: string;
  role: MemberRole;
  removed_at: string | null;
  created_at: string;
};

export type Expense = {
  id: Uuid;
  trip_id: Uuid;
  title: string;
  /** In `currency`'s minor unit. */
  amount_cents: number;
  /** The currency actually spent in. */
  currency: CurrencyCode;
  /** `amount_cents` converted to the trip's base currency, PINNED at save time. */
  base_amount_cents: number;
  /** The rate used, as a string to avoid float drift. 1 when currency == base. */
  fx_rate: string;
  fx_rate_date: IsoDate;
  fx_source: string;
  category: Category;
  paid_by: Uuid;
  expense_date: IsoDate;
  receipt_url: string | null;
  notes: string | null;
  created_by: Uuid;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ExpenseSplit = {
  id: Uuid;
  expense_id: Uuid;
  member_id: Uuid;
  /** In the expense's own currency. */
  share_cents: number;
  /** In the trip's base currency. PINNED alongside the expense. */
  base_share_cents: number;
  share_type: ShareType;
  /** Raw user input before conversion to minor units (e.g. 33.33 or 2 shares). */
  share_value: number | null;
  created_at: string;
};

export type Settlement = {
  id: Uuid;
  trip_id: Uuid;
  from_member: Uuid;
  to_member: Uuid;
  /** Always in the trip's base currency. */
  amount_cents: number;
  note: string | null;
  settled_at: string;
  created_by: Uuid;
  created_at: string;
};

export type FxRate = {
  id: Uuid;
  base_currency: CurrencyCode;
  quote_currency: CurrencyCode;
  /** numeric(20,10) arrives as a string from PostgREST. Keep it that way. */
  rate: string;
  rate_date: IsoDate;
  source: string;
  fetched_at: string;
  created_at: string;
};

export type Currency = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimal_digits: number;
};

/** Expense joined with its splits, as the feed and edit form consume it. */
export type ExpenseWithSplits = Expense & {
  splits: ExpenseSplit[];
};

/** One row of the derived balance view. Never stored. */
export type MemberBalance = {
  member_id: Uuid;
  display_name: string;
  /** Set when the member has left or been removed. They still appear here
   *  while their balance is non-zero, so the ledger stays consistent. */
  removed_at?: string | null;
  /** All in the trip's base currency. */
  paid_cents: number;
  owed_cents: number;
  settlements_cents: number;
  net_cents: number;
};

/** A suggested payment from the debt simplification pass. */
export type Transfer = {
  from_member: Uuid;
  to_member: Uuid;
  amount_cents: number;
};
