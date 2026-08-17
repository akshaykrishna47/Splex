-- Splex core schema.
--
-- Money convention: every *_cents column is an integer count of the currency's
-- MINOR UNIT. The number of minor units per major unit lives in
-- currencies.decimal_digits and is 100 for USD, 1 for JPY/VND, 1000 for KWD.
-- Nothing in this schema assumes a factor of 100.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- users — mirrors auth.users
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  -- Cosmetic only: what the UI converts figures into at render time.
  -- Never affects stored ledger values.
  display_currency char(3),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- currencies — reference data, seeded by migration (not by seeds/)
-- ---------------------------------------------------------------------------

create table public.currencies (
  code char(3) primary key,
  name text not null,
  symbol text not null,
  decimal_digits int not null default 2 check (decimal_digits between 0 and 4),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid not null references public.users (id),
  base_currency char(3) not null default 'USD' references public.currencies (code),
  invite_code text not null unique,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index trips_created_by_idx on public.trips (created_by);

-- ---------------------------------------------------------------------------
-- trip_members
--
-- user_id is NULLABLE on purpose and it is load-bearing: a member can exist as
-- a bare name with no account at all. Joining via an invite link links a
-- user_id onto the existing row instead of creating a duplicate member.
-- ---------------------------------------------------------------------------

create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  display_name text not null check (length(trim(display_name)) > 0),
  role text not null default 'member' check (role in ('owner', 'member')),
  removed_at timestamptz,
  created_at timestamptz not null default now()
);

create index trip_members_trip_idx on public.trip_members (trip_id);
create index trip_members_user_idx on public.trip_members (user_id);

-- One account cannot occupy two member slots in the same trip.
create unique index trip_members_unique_user_per_trip
  on public.trip_members (trip_id, user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- expenses
--
-- base_amount_cents / fx_rate / fx_rate_date / fx_source are PINNED at save
-- time and never recomputed on read. A dinner in Bangkok costs the same in SGD
-- tomorrow as it did the night it happened.
-- ---------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null references public.currencies (code),
  base_amount_cents bigint not null check (base_amount_cents > 0),
  fx_rate numeric(20, 10) not null check (fx_rate > 0),
  fx_rate_date date not null,
  fx_source text not null,
  category text not null check (
    category in ('food', 'transport', 'lodging', 'activities', 'groceries', 'shopping', 'other')
  ),
  paid_by uuid not null references public.trip_members (id),
  expense_date date not null,
  receipt_url text,
  notes text,
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete only. Never hard-delete a row someone's balance depends on.
  deleted_at timestamptz
);

create index expenses_trip_idx on public.expenses (trip_id, expense_date desc);
create index expenses_live_idx on public.expenses (trip_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- expense_splits
-- ---------------------------------------------------------------------------

create table public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  member_id uuid not null references public.trip_members (id),
  -- In the expense's OWN currency.
  share_cents bigint not null check (share_cents >= 0),
  -- In the trip's BASE currency. Pinned alongside the expense.
  base_share_cents bigint not null check (base_share_cents >= 0),
  share_type text not null check (share_type in ('equal', 'exact', 'percent', 'shares')),
  -- The raw input before conversion to minor units, kept so the edit form can
  -- round-trip "33.33%" or "2 shares" without reverse-engineering it.
  share_value numeric,
  created_at timestamptz not null default now(),
  unique (expense_id, member_id)
);

create index expense_splits_expense_idx on public.expense_splits (expense_id);
create index expense_splits_member_idx on public.expense_splits (member_id);

-- ---------------------------------------------------------------------------
-- settlements — always recorded in the trip's base currency
-- ---------------------------------------------------------------------------

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  from_member uuid not null references public.trip_members (id),
  to_member uuid not null references public.trip_members (id),
  amount_cents bigint not null check (amount_cents > 0),
  note text,
  settled_at timestamptz not null default now(),
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  check (from_member <> to_member)
);

create index settlements_trip_idx on public.settlements (trip_id);

-- ---------------------------------------------------------------------------
-- fx_rates — a CACHE written only by the sync-fx-rates edge function
-- ---------------------------------------------------------------------------

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency char(3) not null,
  quote_currency char(3) not null,
  rate numeric(20, 10) not null check (rate > 0),
  rate_date date not null,
  source text not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (base_currency, quote_currency, rate_date)
);

create index fx_rates_lookup_idx
  on public.fx_rates (base_currency, quote_currency, rate_date desc);
