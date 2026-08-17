-- ============================================================================
-- Splex — one-shot setup for a FRESH database.
--
-- GENERATED FILE. Do not edit by hand; edit supabase/migrations/ and re-run:
--   node scripts/bundle-sql.mjs
--
-- The migrations below appear in filename order, followed by two setup steps
-- that are not migrations (a public.users backfill and starter FX rates).
--
-- Paste the whole thing into the Supabase SQL editor and run it once.
--
-- NOT idempotent: CREATE TABLE / POLICY / TRIGGER error on a second run. That
-- is deliberate — it fails loudly rather than half-applying. For repeat runs
-- use the CLI: npx supabase db push
-- ============================================================================


-- ############################################################################
-- # 20260817000100_init_schema.sql
-- ############################################################################
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



-- ############################################################################
-- # 20260817000200_invariants.sql
-- ############################################################################
-- Invariants enforced in the database, not just in application code.
--
-- The application enforces these too (see lib/money.ts and lib/splits.ts), but
-- a balance that silently stops adding up is the worst possible failure for
-- this app, so the database refuses to store one.

-- ---------------------------------------------------------------------------
-- Mirror auth.users into public.users
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, 'friend@'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email
  where public.users.email is distinct from excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Invite codes: 8 chars, unambiguous alphabet (no 0/O/1/I)
-- ---------------------------------------------------------------------------

create or replace function public.gen_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result text := '';
  i int;
begin
  for i in 1 .. 8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.set_invite_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempts int := 0;
begin
  if new.invite_code is not null and length(trim(new.invite_code)) > 0 then
    return new;
  end if;

  loop
    v_code := public.gen_invite_code();
    exit when not exists (select 1 from public.trips where invite_code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'could not allocate a unique invite code';
    end if;
  end loop;

  new.invite_code := v_code;
  return new;
end;
$$;

create trigger trips_set_invite_code
  before insert on public.trips
  for each row execute function public.set_invite_code();

-- ---------------------------------------------------------------------------
-- A trip's creator is always its owner member.
--
-- This runs as a trigger rather than a second client request because RLS keys
-- off trip_members: without this row the creator could not read the trip they
-- just made.
-- ---------------------------------------------------------------------------

create or replace function public.add_trip_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, display_name, role)
  values (
    new.id,
    new.created_by,
    coalesce(
      (select nullif(trim(u.display_name), '') from public.users u where u.id = new.created_by),
      (select split_part(u.email, '@', 1) from public.users u where u.id = new.created_by),
      'Me'
    ),
    'owner'
  );
  return new;
end;
$$;

create trigger trips_add_owner_member
  after insert on public.trips
  for each row execute function public.add_trip_owner_member();

-- ---------------------------------------------------------------------------
-- expenses.updated_at
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger expenses_touch_updated_at
  before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- INVARIANT 1: sum(expense_splits.share_cents) == expenses.amount_cents
--              and the same for base_share_cents vs base_amount_cents.
--
-- Deferred to commit time so an expense and its splits can be written together
-- inside one transaction (see create_expense / update_expense).
-- ---------------------------------------------------------------------------

create or replace function public.assert_expense_balanced()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_amount bigint;
  v_base bigint;
  v_share_sum bigint;
  v_base_sum bigint;
  v_split_count int;
begin
  if tg_table_name = 'expense_splits' then
    v_expense_id := case when tg_op = 'DELETE' then old.expense_id else new.expense_id end;
  else
    v_expense_id := case when tg_op = 'DELETE' then old.id else new.id end;
  end if;

  select e.amount_cents, e.base_amount_cents
    into v_amount, v_base
    from public.expenses e
   where e.id = v_expense_id;

  -- The expense itself is gone (cascade delete); its splits went with it.
  if not found then
    return null;
  end if;

  select coalesce(sum(s.share_cents), 0), coalesce(sum(s.base_share_cents), 0), count(*)
    into v_share_sum, v_base_sum, v_split_count
    from public.expense_splits s
   where s.expense_id = v_expense_id;

  if v_split_count = 0 then
    raise exception 'expense % has no splits', v_expense_id
      using errcode = '23514';
  end if;

  if v_share_sum <> v_amount then
    raise exception
      'splits total % but expense % is %  (currency amount must match exactly)',
      v_share_sum, v_expense_id, v_amount
      using errcode = '23514';
  end if;

  if v_base_sum <> v_base then
    raise exception
      'base splits total % but expense % base amount is % (FX rounding must be distributed, not recomputed)',
      v_base_sum, v_expense_id, v_base
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger expense_splits_balance_check
  after insert or update or delete on public.expense_splits
  deferrable initially deferred
  for each row execute function public.assert_expense_balanced();

create constraint trigger expenses_balance_check
  after insert or update on public.expenses
  deferrable initially deferred
  for each row execute function public.assert_expense_balanced();

-- ---------------------------------------------------------------------------
-- Referential sanity: every member referenced by an expense, split, or
-- settlement must belong to that same trip.
-- ---------------------------------------------------------------------------

create or replace function public.assert_member_in_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
begin
  if tg_table_name = 'expenses' then
    if not exists (
      select 1 from public.trip_members m
       where m.id = new.paid_by and m.trip_id = new.trip_id
    ) then
      raise exception 'paid_by member % does not belong to trip %', new.paid_by, new.trip_id
        using errcode = '23514';
    end if;

  elsif tg_table_name = 'expense_splits' then
    select e.trip_id into v_trip_id from public.expenses e where e.id = new.expense_id;
    if not exists (
      select 1 from public.trip_members m
       where m.id = new.member_id and m.trip_id = v_trip_id
    ) then
      raise exception 'split member % does not belong to trip %', new.member_id, v_trip_id
        using errcode = '23514';
    end if;

  elsif tg_table_name = 'settlements' then
    if not exists (
      select 1 from public.trip_members m
       where m.id = new.from_member and m.trip_id = new.trip_id
    ) or not exists (
      select 1 from public.trip_members m
       where m.id = new.to_member and m.trip_id = new.trip_id
    ) then
      raise exception 'settlement references a member outside trip %', new.trip_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger expenses_member_check
  before insert or update on public.expenses
  for each row execute function public.assert_member_in_trip();

create trigger expense_splits_member_check
  before insert or update on public.expense_splits
  for each row execute function public.assert_member_in_trip();

create trigger settlements_member_check
  before insert or update on public.settlements
  for each row execute function public.assert_member_in_trip();

-- ---------------------------------------------------------------------------
-- An expense in the trip's base currency must be pinned at rate 1.
-- ---------------------------------------------------------------------------

create or replace function public.assert_fx_pin_coherent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base char(3);
begin
  select t.base_currency into v_base from public.trips t where t.id = new.trip_id;

  if new.currency = v_base then
    if new.fx_rate <> 1 then
      raise exception 'same-currency expense must pin fx_rate = 1, got %', new.fx_rate
        using errcode = '23514';
    end if;
    if new.base_amount_cents <> new.amount_cents then
      raise exception 'same-currency expense must have base_amount_cents = amount_cents'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger expenses_fx_pin_check
  before insert or update on public.expenses
  for each row execute function public.assert_fx_pin_coherent();



-- ############################################################################
-- # 20260817000300_views_and_rpcs.sql
-- ############################################################################
-- Membership helpers, derived balances, and the transactional write RPCs.

-- ---------------------------------------------------------------------------
-- Membership helpers.
--
-- These are SECURITY DEFINER so that RLS policies on trip_members can consult
-- trip_members without recursing into their own policy.
-- ---------------------------------------------------------------------------

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.trip_members m
     where m.trip_id = p_trip_id
       and m.user_id = auth.uid()
       and m.removed_at is null
  );
$$;

create or replace function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.trip_members m
     where m.trip_id = p_trip_id
       and m.user_id = auth.uid()
       and m.removed_at is null
       and m.role = 'owner'
  );
$$;

create or replace function public.shares_trip_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.trip_members a
      join public.trip_members b on b.trip_id = a.trip_id
     where a.user_id = auth.uid()
       and a.removed_at is null
       and b.user_id = p_user_id
       and b.removed_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- INVARIANT 2: balances are never stored. This view derives them, always, from
-- base-currency amounts only. The ledger is single-currency internally.
--
--   net = paid - owed + (settlements sent - settlements received)
--
-- Positive net means the trip owes this member. Negative means they owe it.
-- ---------------------------------------------------------------------------

create or replace view public.trip_member_balances
with (security_invoker = on) as
with paid as (
  select e.trip_id, e.paid_by as member_id, sum(e.base_amount_cents) as total
    from public.expenses e
   where e.deleted_at is null
   group by e.trip_id, e.paid_by
),
owed as (
  select e.trip_id, s.member_id, sum(s.base_share_cents) as total
    from public.expense_splits s
    join public.expenses e on e.id = s.expense_id
   where e.deleted_at is null
   group by e.trip_id, s.member_id
),
settled as (
  select trip_id, member_id, sum(amount) as total
    from (
      select trip_id, from_member as member_id, amount_cents as amount from public.settlements
      union all
      select trip_id, to_member as member_id, -amount_cents from public.settlements
    ) x
   group by trip_id, member_id
)
select
  m.trip_id,
  m.id as member_id,
  m.display_name,
  m.user_id,
  m.removed_at,
  coalesce(p.total, 0)::bigint as paid_cents,
  coalesce(o.total, 0)::bigint as owed_cents,
  coalesce(s.total, 0)::bigint as settlements_cents,
  (coalesce(p.total, 0) - coalesce(o.total, 0) + coalesce(s.total, 0))::bigint as net_cents
from public.trip_members m
left join paid p on p.trip_id = m.trip_id and p.member_id = m.id
left join owed o on o.trip_id = m.trip_id and o.member_id = m.id
left join settled s on s.trip_id = m.trip_id and s.member_id = m.id;

-- ---------------------------------------------------------------------------
-- Newest cached rate per pair. The client reads this and never an FX provider.
-- ---------------------------------------------------------------------------

create or replace view public.fx_rates_latest
with (security_invoker = on) as
select distinct on (base_currency, quote_currency)
  base_currency,
  quote_currency,
  rate,
  rate_date,
  source,
  fetched_at
from public.fx_rates
order by base_currency, quote_currency, rate_date desc, fetched_at desc;

-- ---------------------------------------------------------------------------
-- Expense writes.
--
-- An expense and its splits MUST be written in one transaction, because the
-- deferred balance trigger checks them together at commit. PostgREST gives
-- each request its own transaction, so these have to be RPCs rather than two
-- table inserts from the client.
--
-- SECURITY INVOKER (the default) is deliberate: RLS still decides whether the
-- caller may touch this trip.
-- ---------------------------------------------------------------------------

create or replace function public.create_expense(
  p_trip_id uuid,
  p_title text,
  p_amount_cents bigint,
  p_currency char(3),
  p_base_amount_cents bigint,
  p_fx_rate numeric,
  p_fx_rate_date date,
  p_fx_source text,
  p_category text,
  p_paid_by uuid,
  p_expense_date date,
  p_splits jsonb,
  p_notes text default null,
  p_receipt_url text default null,
  -- Only consulted when there is no JWT user context, i.e. a service_role
  -- caller such as the seed script. For a real signed-in user auth.uid() always
  -- wins, so this cannot be used to forge authorship from the client.
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_actor uuid := coalesce(auth.uid(), p_created_by);
begin
  if v_actor is null then
    raise exception 'create_expense needs an authenticated user or an explicit p_created_by'
      using errcode = '42501';
  end if;

  insert into public.expenses (
    trip_id, title, amount_cents, currency, base_amount_cents,
    fx_rate, fx_rate_date, fx_source, category, paid_by,
    expense_date, notes, receipt_url, created_by
  )
  values (
    p_trip_id, trim(p_title), p_amount_cents, upper(p_currency), p_base_amount_cents,
    p_fx_rate, p_fx_rate_date, p_fx_source, p_category, p_paid_by,
    p_expense_date, nullif(trim(coalesce(p_notes, '')), ''), p_receipt_url, v_actor
  )
  returning id into v_id;

  insert into public.expense_splits (
    expense_id, member_id, share_cents, base_share_cents, share_type, share_value
  )
  select
    v_id,
    (s ->> 'member_id')::uuid,
    (s ->> 'share_cents')::bigint,
    (s ->> 'base_share_cents')::bigint,
    (s ->> 'share_type'),
    nullif(s ->> 'share_value', '')::numeric
  from jsonb_array_elements(p_splits) s;

  return v_id;
end;
$$;

create or replace function public.update_expense(
  p_expense_id uuid,
  p_title text,
  p_amount_cents bigint,
  p_currency char(3),
  p_base_amount_cents bigint,
  p_fx_rate numeric,
  p_fx_rate_date date,
  p_fx_source text,
  p_category text,
  p_paid_by uuid,
  p_expense_date date,
  p_splits jsonb,
  p_notes text default null,
  p_receipt_url text default null
)
returns uuid
language plpgsql
as $$
begin
  -- Replace the split set wholesale; the deferred trigger validates the result
  -- against the new amount at commit.
  delete from public.expense_splits where expense_id = p_expense_id;

  update public.expenses
     set title = trim(p_title),
         amount_cents = p_amount_cents,
         currency = upper(p_currency),
         base_amount_cents = p_base_amount_cents,
         fx_rate = p_fx_rate,
         fx_rate_date = p_fx_rate_date,
         fx_source = p_fx_source,
         category = p_category,
         paid_by = p_paid_by,
         expense_date = p_expense_date,
         notes = nullif(trim(coalesce(p_notes, '')), ''),
         receipt_url = p_receipt_url
   where id = p_expense_id
     and deleted_at is null;

  if not found then
    raise exception 'expense % not found or not editable', p_expense_id
      using errcode = 'P0002';
  end if;

  insert into public.expense_splits (
    expense_id, member_id, share_cents, base_share_cents, share_type, share_value
  )
  select
    p_expense_id,
    (s ->> 'member_id')::uuid,
    (s ->> 'share_cents')::bigint,
    (s ->> 'base_share_cents')::bigint,
    (s ->> 'share_type'),
    nullif(s ->> 'share_value', '')::numeric
  from jsonb_array_elements(p_splits) s;

  return p_expense_id;
end;
$$;

-- INVARIANT 6: soft delete only.
create or replace function public.soft_delete_expense(p_expense_id uuid)
returns void
language sql
as $$
  update public.expenses
     set deleted_at = now()
   where id = p_expense_id
     and deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Invite flow.
--
-- A prospective member cannot read the trip yet (RLS), so these two functions
-- are SECURITY DEFINER and expose only what an invite legitimately reveals.
-- ---------------------------------------------------------------------------

create or replace function public.trip_preview_by_code(p_code text)
returns table (
  trip_id uuid,
  name text,
  base_currency char(3),
  member_count int,
  already_member boolean,
  unclaimed_members jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.name,
    t.base_currency,
    (select count(*)::int from public.trip_members m
      where m.trip_id = t.id and m.removed_at is null),
    exists (select 1 from public.trip_members m
             where m.trip_id = t.id and m.user_id = auth.uid() and m.removed_at is null),
    -- Bare-name members with no account yet. The joiner picks "that's me" or
    -- joins as someone new; we never guess a link on their behalf.
    coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name)
                       order by m.created_at)
        from public.trip_members m
       where m.trip_id = t.id and m.removed_at is null and m.user_id is null
    ), '[]'::jsonb)
  from public.trips t
  where upper(t.invite_code) = upper(trim(p_code))
    and t.archived_at is null;
$$;

create or replace function public.join_trip_by_code(
  p_code text,
  p_claim_member_id uuid default null,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_existing uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to join a trip' using errcode = '42501';
  end if;

  select t.id into v_trip_id
    from public.trips t
   where upper(t.invite_code) = upper(trim(p_code))
     and t.archived_at is null;

  if v_trip_id is null then
    raise exception 'invite code % is not valid', p_code using errcode = 'P0002';
  end if;

  -- Already in. Joining twice is a no-op, not an error.
  select m.id into v_existing
    from public.trip_members m
   where m.trip_id = v_trip_id and m.user_id = auth.uid() and m.removed_at is null;

  if v_existing is not null then
    return v_trip_id;
  end if;

  if p_claim_member_id is not null then
    -- Link onto the existing bare-name row rather than creating a duplicate.
    update public.trip_members
       set user_id = auth.uid()
     where id = p_claim_member_id
       and trip_id = v_trip_id
       and user_id is null
       and removed_at is null;

    if not found then
      raise exception 'that member has already been claimed' using errcode = 'P0002';
    end if;

    return v_trip_id;
  end if;

  v_name := coalesce(
    nullif(trim(p_display_name), ''),
    (select nullif(trim(u.display_name), '') from public.users u where u.id = auth.uid()),
    (select split_part(u.email, '@', 1) from public.users u where u.id = auth.uid()),
    'Guest'
  );

  insert into public.trip_members (trip_id, user_id, display_name, role)
  values (v_trip_id, auth.uid(), v_name, 'member');

  return v_trip_id;
end;
$$;



-- ############################################################################
-- # 20260817000400_rls.sql
-- ############################################################################
-- Row Level Security.
--
-- Core rule: you can touch a trip's rows only if you hold a trip_members row
-- for that trip with removed_at is null. Owners additionally may delete the
-- trip and remove members. Every table below has RLS enabled — none are left
-- open.

-- Membership check for a row that only knows its expense_id. SECURITY DEFINER
-- so the policy is one indexed lookup rather than a nested policy evaluation.
create or replace function public.can_access_expense(p_expense_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.expenses e
      join public.trip_members m on m.trip_id = e.trip_id
     where e.id = p_expense_id
       and m.user_id = auth.uid()
       and m.removed_at is null
  );
$$;

alter table public.users enable row level security;
alter table public.currencies enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;
alter table public.fx_rates enable row level security;

-- ---------------------------------------------------------------------------
-- users — your own row, plus the profiles of people you share a trip with
-- (so their avatar renders next to their name).
-- ---------------------------------------------------------------------------

create policy users_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.shares_trip_with(id));

create policy users_insert_self on public.users
  for insert to authenticated
  with check (id = auth.uid());

create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- currencies — public reference data, read-only to clients.
-- ---------------------------------------------------------------------------

create policy currencies_select on public.currencies
  for select to authenticated, anon
  using (true);

-- ---------------------------------------------------------------------------
-- fx_rates — read-only cache. Only the sync-fx-rates edge function writes
-- here, and it uses the service role key, which bypasses RLS entirely.
-- ---------------------------------------------------------------------------

create policy fx_rates_select on public.fx_rates
  for select to authenticated, anon
  using (true);

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------

create policy trips_select on public.trips
  for select to authenticated
  using (public.is_trip_member(id));

create policy trips_insert on public.trips
  for insert to authenticated
  with check (created_by = auth.uid());

create policy trips_update on public.trips
  for update to authenticated
  using (public.is_trip_member(id))
  with check (public.is_trip_member(id));

-- Only an owner may delete a trip.
create policy trips_delete on public.trips
  for delete to authenticated
  using (public.is_trip_owner(id));

-- ---------------------------------------------------------------------------
-- trip_members
-- ---------------------------------------------------------------------------

create policy trip_members_select on public.trip_members
  for select to authenticated
  using (public.is_trip_member(trip_id));

create policy trip_members_insert on public.trip_members
  for insert to authenticated
  with check (public.is_trip_member(trip_id));

-- Any member may edit member rows (renaming a bare-name member, say), but the
-- WITH CHECK means only an owner can leave removed_at set — i.e. only an owner
-- can actually remove someone.
create policy trip_members_update on public.trip_members
  for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_owner(trip_id) or removed_at is null);

create policy trip_members_delete on public.trip_members
  for delete to authenticated
  using (public.is_trip_owner(trip_id));

-- ---------------------------------------------------------------------------
-- expenses — note the deliberate absence of a DELETE policy. Soft delete only;
-- a hard delete is impossible for any client, by construction.
-- ---------------------------------------------------------------------------

create policy expenses_select on public.expenses
  for select to authenticated
  using (public.is_trip_member(trip_id));

create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (public.is_trip_member(trip_id) and created_by = auth.uid());

create policy expenses_update on public.expenses
  for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

-- ---------------------------------------------------------------------------
-- expense_splits
-- ---------------------------------------------------------------------------

create policy expense_splits_select on public.expense_splits
  for select to authenticated
  using (public.can_access_expense(expense_id));

create policy expense_splits_insert on public.expense_splits
  for insert to authenticated
  with check (public.can_access_expense(expense_id));

create policy expense_splits_update on public.expense_splits
  for update to authenticated
  using (public.can_access_expense(expense_id))
  with check (public.can_access_expense(expense_id));

-- Splits are replaced wholesale when an expense is edited, so DELETE is
-- allowed here (unlike expenses themselves).
create policy expense_splits_delete on public.expense_splits
  for delete to authenticated
  using (public.can_access_expense(expense_id));

-- ---------------------------------------------------------------------------
-- settlements
-- ---------------------------------------------------------------------------

create policy settlements_select on public.settlements
  for select to authenticated
  using (public.is_trip_member(trip_id));

create policy settlements_insert on public.settlements
  for insert to authenticated
  with check (public.is_trip_member(trip_id) and created_by = auth.uid());

create policy settlements_update on public.settlements
  for update to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

create policy settlements_delete on public.settlements
  for delete to authenticated
  using (public.is_trip_owner(trip_id));

-- ---------------------------------------------------------------------------
-- Grants. RLS decides row visibility; these decide table visibility.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on public.currencies, public.fx_rates to anon, authenticated;
grant select on public.fx_rates_latest to anon, authenticated;

grant select, insert, update on public.users to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.trip_members to authenticated;
grant select, insert, update on public.expenses to authenticated;
grant select, insert, update, delete on public.expense_splits to authenticated;
grant select, insert, update, delete on public.settlements to authenticated;
grant select on public.trip_member_balances to authenticated;

grant execute on function public.create_expense(
  uuid, text, bigint, char, bigint, numeric, date, text, text, uuid, date, jsonb, text, text, uuid
) to authenticated;
grant execute on function public.update_expense(
  uuid, text, bigint, char, bigint, numeric, date, text, text, uuid, date, jsonb, text, text
) to authenticated;
grant execute on function public.soft_delete_expense(uuid) to authenticated;
grant execute on function public.trip_preview_by_code(text) to authenticated;
grant execute on function public.join_trip_by_code(text, uuid, text) to authenticated;
grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public.is_trip_owner(uuid) to authenticated;

-- service_role is the backend identity: the sync-fx-rates edge function and the
-- seed script. It bypasses RLS by virtue of the role itself, but it still needs
-- table privileges. Hosted Supabase projects usually confer these through
-- default privileges; a local stack does not, so grant them explicitly rather
-- than depending on the environment.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;



-- ############################################################################
-- # 20260817000500_currencies_seed.sql
-- ############################################################################
-- ISO 4217 reference data.
--
-- This is reference data, not test data, so it ships as a migration and never
-- from supabase/seeds/.
--
-- decimal_digits is the whole point of this table. It is 0 for JPY, KRW, VND,
-- ISK and the CFA francs; 3 for BHD, IQD, JOD, KWD, LYD, OMR, TND; and 4 for
-- the Chilean and Uruguayan index units. Code that assumes 100 minor units per
-- major unit is wrong for roughly a fifth of the world. See lib/money.ts.
--
-- Included: every active ISO 4217 code, including fund codes (BOV, CLF, ...)
-- and the precious metals (XAU, ...). Excluded: XXX ("no currency") and XTS
-- ("reserved for testing"), which are not things a person can spend.

insert into public.currencies (code, name, symbol, decimal_digits) values
  ('AED', 'UAE Dirham', 'د.إ', 2),
  ('AFN', 'Afghan Afghani', '؋', 2),
  ('ALL', 'Albanian Lek', 'L', 2),
  ('AMD', 'Armenian Dram', '֏', 2),
  ('ANG', 'Netherlands Antillean Guilder', 'ƒ', 2),
  ('AOA', 'Angolan Kwanza', 'Kz', 2),
  ('ARS', 'Argentine Peso', '$', 2),
  ('AUD', 'Australian Dollar', 'A$', 2),
  ('AWG', 'Aruban Florin', 'ƒ', 2),
  ('AZN', 'Azerbaijani Manat', '₼', 2),
  ('BAM', 'Bosnia-Herzegovina Convertible Mark', 'KM', 2),
  ('BBD', 'Barbadian Dollar', 'Bds$', 2),
  ('BDT', 'Bangladeshi Taka', '৳', 2),
  ('BGN', 'Bulgarian Lev', 'лв', 2),
  ('BHD', 'Bahraini Dinar', '.د.ب', 3),
  ('BIF', 'Burundian Franc', 'FBu', 0),
  ('BMD', 'Bermudian Dollar', 'BD$', 2),
  ('BND', 'Brunei Dollar', 'B$', 2),
  ('BOB', 'Bolivian Boliviano', 'Bs.', 2),
  ('BOV', 'Bolivian Mvdol (funds code)', 'BOV', 2),
  ('BRL', 'Brazilian Real', 'R$', 2),
  ('BSD', 'Bahamian Dollar', 'B$', 2),
  ('BTN', 'Bhutanese Ngultrum', 'Nu.', 2),
  ('BWP', 'Botswanan Pula', 'P', 2),
  ('BYN', 'Belarusian Ruble', 'Br', 2),
  ('BZD', 'Belize Dollar', 'BZ$', 2),
  ('CAD', 'Canadian Dollar', 'C$', 2),
  ('CDF', 'Congolese Franc', 'FC', 2),
  ('CHE', 'WIR Euro (funds code)', 'CHE', 2),
  ('CHF', 'Swiss Franc', 'CHF', 2),
  ('CHW', 'WIR Franc (funds code)', 'CHW', 2),
  ('CLF', 'Chilean Unit of Account (UF)', 'UF', 4),
  ('CLP', 'Chilean Peso', '$', 0),
  ('CNY', 'Chinese Yuan', '¥', 2),
  ('COP', 'Colombian Peso', '$', 2),
  ('COU', 'Colombian Real Value Unit', 'COU', 2),
  ('CRC', 'Costa Rican Colón', '₡', 2),
  ('CUP', 'Cuban Peso', '$', 2),
  ('CVE', 'Cape Verdean Escudo', '$', 2),
  ('CZK', 'Czech Koruna', 'Kč', 2),
  ('DJF', 'Djiboutian Franc', 'Fdj', 0),
  ('DKK', 'Danish Krone', 'kr', 2),
  ('DOP', 'Dominican Peso', 'RD$', 2),
  ('DZD', 'Algerian Dinar', 'دج', 2),
  ('EGP', 'Egyptian Pound', 'E£', 2),
  ('ERN', 'Eritrean Nakfa', 'Nfk', 2),
  ('ETB', 'Ethiopian Birr', 'Br', 2),
  ('EUR', 'Euro', '€', 2),
  ('FJD', 'Fijian Dollar', 'FJ$', 2),
  ('FKP', 'Falkland Islands Pound', '£', 2),
  ('GBP', 'British Pound', '£', 2),
  ('GEL', 'Georgian Lari', '₾', 2),
  ('GHS', 'Ghanaian Cedi', '₵', 2),
  ('GIP', 'Gibraltar Pound', '£', 2),
  ('GMD', 'Gambian Dalasi', 'D', 2),
  ('GNF', 'Guinean Franc', 'FG', 0),
  ('GTQ', 'Guatemalan Quetzal', 'Q', 2),
  ('GYD', 'Guyanaese Dollar', 'G$', 2),
  ('HKD', 'Hong Kong Dollar', 'HK$', 2),
  ('HNL', 'Honduran Lempira', 'L', 2),
  ('HTG', 'Haitian Gourde', 'G', 2),
  ('HUF', 'Hungarian Forint', 'Ft', 2),
  ('IDR', 'Indonesian Rupiah', 'Rp', 2),
  ('ILS', 'Israeli New Shekel', '₪', 2),
  ('INR', 'Indian Rupee', '₹', 2),
  ('IQD', 'Iraqi Dinar', 'ع.د', 3),
  ('IRR', 'Iranian Rial', '﷼', 2),
  ('ISK', 'Icelandic Króna', 'kr', 0),
  ('JMD', 'Jamaican Dollar', 'J$', 2),
  ('JOD', 'Jordanian Dinar', 'JD', 3),
  ('JPY', 'Japanese Yen', '¥', 0),
  ('KES', 'Kenyan Shilling', 'KSh', 2),
  ('KGS', 'Kyrgystani Som', 'с', 2),
  ('KHR', 'Cambodian Riel', '៛', 2),
  ('KMF', 'Comorian Franc', 'CF', 0),
  ('KPW', 'North Korean Won', '₩', 2),
  ('KRW', 'South Korean Won', '₩', 0),
  ('KWD', 'Kuwaiti Dinar', 'KD', 3),
  ('KYD', 'Cayman Islands Dollar', 'CI$', 2),
  ('KZT', 'Kazakhstani Tenge', '₸', 2),
  ('LAK', 'Laotian Kip', '₭', 2),
  ('LBP', 'Lebanese Pound', 'L£', 2),
  ('LKR', 'Sri Lankan Rupee', 'Rs', 2),
  ('LRD', 'Liberian Dollar', 'L$', 2),
  ('LSL', 'Lesotho Loti', 'L', 2),
  ('LYD', 'Libyan Dinar', 'LD', 3),
  ('MAD', 'Moroccan Dirham', 'د.م.', 2),
  ('MDL', 'Moldovan Leu', 'L', 2),
  ('MGA', 'Malagasy Ariary', 'Ar', 2),
  ('MKD', 'Macedonian Denar', 'ден', 2),
  ('MMK', 'Myanmar Kyat', 'K', 2),
  ('MNT', 'Mongolian Tugrik', '₮', 2),
  ('MOP', 'Macanese Pataca', 'MOP$', 2),
  ('MRU', 'Mauritanian Ouguiya', 'UM', 2),
  ('MUR', 'Mauritian Rupee', '₨', 2),
  ('MVR', 'Maldivian Rufiyaa', 'Rf', 2),
  ('MWK', 'Malawian Kwacha', 'MK', 2),
  ('MXN', 'Mexican Peso', '$', 2),
  ('MXV', 'Mexican Investment Unit', 'MXV', 2),
  ('MYR', 'Malaysian Ringgit', 'RM', 2),
  ('MZN', 'Mozambican Metical', 'MT', 2),
  ('NAD', 'Namibian Dollar', 'N$', 2),
  ('NGN', 'Nigerian Naira', '₦', 2),
  ('NIO', 'Nicaraguan Córdoba', 'C$', 2),
  ('NOK', 'Norwegian Krone', 'kr', 2),
  ('NPR', 'Nepalese Rupee', '₨', 2),
  ('NZD', 'New Zealand Dollar', 'NZ$', 2),
  ('OMR', 'Omani Rial', '﷼', 3),
  ('PAB', 'Panamanian Balboa', 'B/.', 2),
  ('PEN', 'Peruvian Sol', 'S/', 2),
  ('PGK', 'Papua New Guinean Kina', 'K', 2),
  ('PHP', 'Philippine Peso', '₱', 2),
  ('PKR', 'Pakistani Rupee', '₨', 2),
  ('PLN', 'Polish Zloty', 'zł', 2),
  ('PYG', 'Paraguayan Guarani', '₲', 0),
  ('QAR', 'Qatari Rial', '﷼', 2),
  ('RON', 'Romanian Leu', 'lei', 2),
  ('RSD', 'Serbian Dinar', 'дин.', 2),
  ('RUB', 'Russian Ruble', '₽', 2),
  ('RWF', 'Rwandan Franc', 'FRw', 0),
  ('SAR', 'Saudi Riyal', '﷼', 2),
  ('SBD', 'Solomon Islands Dollar', 'SI$', 2),
  ('SCR', 'Seychellois Rupee', '₨', 2),
  ('SDG', 'Sudanese Pound', 'ج.س.', 2),
  ('SEK', 'Swedish Krona', 'kr', 2),
  ('SGD', 'Singapore Dollar', 'S$', 2),
  ('SHP', 'Saint Helena Pound', '£', 2),
  ('SLE', 'Sierra Leonean Leone', 'Le', 2),
  ('SOS', 'Somali Shilling', 'Sh', 2),
  ('SRD', 'Surinamese Dollar', '$', 2),
  ('SSP', 'South Sudanese Pound', '£', 2),
  ('STN', 'São Tomé and Príncipe Dobra', 'Db', 2),
  ('SVC', 'Salvadoran Colón', '₡', 2),
  ('SYP', 'Syrian Pound', 'L£', 2),
  ('SZL', 'Swazi Lilangeni', 'L', 2),
  ('THB', 'Thai Baht', '฿', 2),
  ('TJS', 'Tajikistani Somoni', 'ЅМ', 2),
  ('TMT', 'Turkmenistani Manat', 'm', 2),
  ('TND', 'Tunisian Dinar', 'د.ت', 3),
  ('TOP', 'Tongan Paʻanga', 'T$', 2),
  ('TRY', 'Turkish Lira', '₺', 2),
  ('TTD', 'Trinidad & Tobago Dollar', 'TT$', 2),
  ('TWD', 'New Taiwan Dollar', 'NT$', 2),
  ('TZS', 'Tanzanian Shilling', 'TSh', 2),
  ('UAH', 'Ukrainian Hryvnia', '₴', 2),
  ('UGX', 'Ugandan Shilling', 'USh', 0),
  ('USD', 'US Dollar', '$', 2),
  ('UYI', 'Uruguayan Peso (Indexed Units)', 'UYI', 0),
  ('UYU', 'Uruguayan Peso', '$U', 2),
  ('UYW', 'Uruguayan Nominal Wage Index Unit', 'UYW', 4),
  ('UZS', 'Uzbekistani Som', 'so''m', 2),
  ('VED', 'Venezuelan Bolívar Digital', 'Bs.D', 2),
  ('VES', 'Venezuelan Bolívar Soberano', 'Bs.S', 2),
  ('VND', 'Vietnamese Dong', '₫', 0),
  ('VUV', 'Vanuatu Vatu', 'VT', 0),
  ('WST', 'Samoan Tala', 'WS$', 2),
  ('XAF', 'Central African CFA Franc', 'FCFA', 0),
  ('XAG', 'Silver (troy ounce)', 'XAG', 2),
  ('XAU', 'Gold (troy ounce)', 'XAU', 2),
  ('XCD', 'East Caribbean Dollar', 'EC$', 2),
  ('XCG', 'Caribbean Guilder', 'Cg', 2),
  ('XDR', 'IMF Special Drawing Rights', 'SDR', 2),
  ('XOF', 'West African CFA Franc', 'CFA', 0),
  ('XPD', 'Palladium (troy ounce)', 'XPD', 2),
  ('XPF', 'CFP Franc', '₣', 0),
  ('XPT', 'Platinum (troy ounce)', 'XPT', 2),
  ('XSU', 'SUCRE', 'XSU', 2),
  ('XUA', 'ADB Unit of Account', 'XUA', 2),
  ('YER', 'Yemeni Rial', '﷼', 2),
  ('ZAR', 'South African Rand', 'R', 2),
  ('ZMW', 'Zambian Kwacha', 'ZK', 2),
  ('ZWG', 'Zimbabwe Gold', 'ZiG', 2)
on conflict (code) do update
  set name = excluded.name,
      symbol = excluded.symbol,
      decimal_digits = excluded.decimal_digits;



-- ############################################################################
-- # 20260817000600_fx_cron.sql
-- ############################################################################
-- Schedule sync-fx-rates every 6 hours.
--
-- One-time setup before this does anything (run once, in the SQL editor):
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
--
-- The service role key lives in Vault, never in a migration and never in the
-- client bundle. If the secrets are absent the scheduled job simply fails and
-- the last good cached rates keep being served, which is the intended
-- degradation.

-- Guarded, for the same reason the scheduling below is. An unguarded
-- `create extension` aborts the entire script when the database cannot host
-- it — pg_cron in particular refuses to install anywhere but the database
-- named in cron.database_name. Applying this file top to bottom would then
-- stop here, leaving every later migration unapplied: no create_trip RPC, no
-- usernames, no categories. A missing scheduler costs periodic FX refreshes;
-- a half-applied schema costs the app.
do $$
begin
  execute 'create extension if not exists pg_cron with schema extensions';
  execute 'create extension if not exists pg_net with schema extensions';
exception
  when others then
    raise notice 'FX cron extensions unavailable: %. Rates will sync on demand from the client instead.', sqlerrm;
end;
$$;

do $$
begin
  -- Re-running this migration should not stack duplicate jobs.
  perform cron.unschedule('sync-fx-rates-6h');
exception
  when others then null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'sync-fx-rates-6h',
    '0 */6 * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
             || '/functions/v1/sync-fx-rates?force=true',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
    $job$
  );
exception
  when others then
    -- pg_cron unavailable (e.g. a local stack without it). Not fatal: the
    -- client still triggers an on-demand sync when the cache goes stale.
    raise notice 'Could not schedule sync-fx-rates: %. Schedule it from the dashboard instead.', sqlerrm;
end;
$$;



-- ############################################################################
-- # 20260817000700_create_trip_rpc.sql
-- ############################################################################
-- Fix: a user could not create a trip.
--
-- repo.trips.create() did `insert(...).select('*').single()`, which PostgREST
-- issues as INSERT ... RETURNING. Postgres applies SELECT policies to the
-- RETURNING clause as an additional WITH CHECK, and `trips_select` requires
-- `is_trip_member(id)`.
--
-- The row that would satisfy that check is written by `trips_add_owner_member`,
-- an AFTER INSERT trigger — and AFTER row triggers fire at the end of the
-- statement, after RETURNING has already been evaluated. So the creator could
-- never read back the trip they had just inserted, and every attempt failed
-- with 42501 "new row violates row-level security policy for table trips".
--
-- A plain INSERT succeeded; only INSERT ... RETURNING failed, which is why the
-- policy looks correct in isolation.
--
-- Fixed the same way expenses already are: one SECURITY DEFINER RPC that does
-- the whole job in a single transaction. It also takes the initial participant
-- list, so creating a trip and adding people to it is one atomic operation
-- rather than a create followed by N inserts that can half-fail.

create or replace function public.create_trip(
  p_name text,
  p_base_currency char(3) default 'USD',
  /** Bare-name participants to seed the trip with. The creator is added
      automatically as owner by the trips_add_owner_member trigger. */
  p_member_names text[] default '{}'
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create a trip.' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Give the trip a name.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.currencies c where c.code = upper(p_base_currency)) then
    raise exception 'Unknown currency: %', p_base_currency using errcode = '22023';
  end if;

  insert into public.trips (name, base_currency, created_by)
  values (trim(p_name), upper(p_base_currency), auth.uid())
  returning * into v_trip;

  -- The owner's trip_members row is created by trips_add_owner_member.
  -- Everything below is the optional extra participants.
  foreach v_name in array coalesce(p_member_names, '{}'::text[])
  loop
    if length(trim(coalesce(v_name, ''))) > 0 then
      insert into public.trip_members (trip_id, display_name, role)
      values (v_trip.id, trim(v_name), 'member');
    end if;
  end loop;

  return v_trip;
end;
$$;

grant execute on function public.create_trip(text, char, text[]) to authenticated;

-- Belt and braces for any other INSERT ... RETURNING path on trips: the creator
-- can always see their own trip even in the window before the membership row
-- exists. Without this the same class of bug can reappear silently.
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select to authenticated
  using (public.is_trip_member(id) or created_by = auth.uid());



-- ############################################################################
-- # 20260817000800_cascade_member_refs.sql
-- ############################################################################
-- Fix: deleting a trip failed with
--   update or delete on table "trip_members" violates foreign key constraint
--   "expense_splits_member_id_fkey" on table "expense_splits"
--
-- `trip_members` cascades from `trips`, but expenses, splits and settlements
-- all reference `trip_members` with no ON DELETE behaviour. Deleting a trip
-- therefore tried to remove the member rows while other rows in the same trip
-- still pointed at them, and the whole delete aborted.
--
-- Cascading is the correct behaviour here: every one of these rows belongs to
-- the trip being deleted, so none of them can outlive it.
--
-- This does NOT weaken the soft-delete rule for expenses. Expenses still have
-- no DELETE policy, so no client can remove one; this only governs what happens
-- when the whole trip goes, which only an owner can do.
--
-- Hard-deleting a single member who already has splits still fails, and should:
-- the cascade would remove their share rows, and the deferred balance trigger
-- would then find the expense no longer adding up and reject the transaction.
-- Members are removed with `removed_at`, not DELETE.

alter table public.expenses
  drop constraint expenses_paid_by_fkey,
  add constraint expenses_paid_by_fkey
    foreign key (paid_by) references public.trip_members (id) on delete cascade;

alter table public.expense_splits
  drop constraint expense_splits_member_id_fkey,
  add constraint expense_splits_member_id_fkey
    foreign key (member_id) references public.trip_members (id) on delete cascade;

alter table public.settlements
  drop constraint settlements_from_member_fkey,
  add constraint settlements_from_member_fkey
    foreign key (from_member) references public.trip_members (id) on delete cascade;

alter table public.settlements
  drop constraint settlements_to_member_fkey,
  add constraint settlements_to_member_fkey
    foreign key (to_member) references public.trip_members (id) on delete cascade;



-- ############################################################################
-- # 20260817000900_usernames.sql
-- ############################################################################
-- Every user gets an assigned username: 4–6 letters from their name, then 2–4
-- random digits. "Akshay" becomes aksha67, aksh4920, akshay812, and so on.
--
-- Generated in the database rather than the client, because uniqueness has to
-- be decided where the unique index lives. Two people signing up at the same
-- moment cannot both win.

alter table public.users
  add column if not exists username text;

-- ---------------------------------------------------------------------------
-- Generation
-- ---------------------------------------------------------------------------

create or replace function public.gen_username(p_seed text)
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'abcdefghijklmnopqrstuvwxyz';
  v_letters text;
  v_stem_len int;
  v_digit_len int;
begin
  -- ASCII letters only: "Aditi Rao" -> aditirao, "José" -> jos, "李雷" -> ''.
  v_letters := lower(regexp_replace(coalesce(p_seed, ''), '[^a-zA-Z]', '', 'g'));

  if length(v_letters) = 0 then
    v_letters := 'user';
  end if;

  -- The stem must be at least 4 letters, so short names get padded rather than
  -- producing a username that breaks the format.
  while length(v_letters) < 4 loop
    v_letters := v_letters || substr(alphabet, 1 + floor(random() * 26)::int, 1);
  end loop;

  v_stem_len := 4 + floor(random() * 3)::int;   -- 4, 5 or 6
  v_digit_len := 2 + floor(random() * 3)::int;  -- 2, 3 or 4

  return substr(v_letters, 1, v_stem_len)
       || lpad(floor(random() * power(10, v_digit_len))::bigint::text, v_digit_len, '0');
end;
$$;

/**
 * Generate until the result is free. SECURITY DEFINER so the uniqueness check
 * sees every row, not just the ones RLS would show the caller — otherwise two
 * users could be handed the same name because neither can see the other.
 */
create or replace function public.allocate_username(p_seed text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate text;
  v_attempts int := 0;
begin
  loop
    v_candidate := public.gen_username(p_seed);
    exit when not exists (select 1 from public.users u where u.username = v_candidate);

    v_attempts := v_attempts + 1;
    if v_attempts > 100 then
      raise exception 'could not allocate a unique username for %', p_seed;
    end if;
  end loop;

  return v_candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill, then lock the column down
-- ---------------------------------------------------------------------------

-- Row by row on purpose: a single UPDATE would not see the names it assigned
-- earlier in the same statement, so it could hand out duplicates.
do $$
declare
  r record;
begin
  for r in select id, display_name, email from public.users where username is null loop
    update public.users
       set username = public.allocate_username(
             coalesce(nullif(trim(r.display_name), ''), split_part(coalesce(r.email, 'user@'), '@', 1))
           )
     where id = r.id;
  end loop;
end;
$$;

alter table public.users
  alter column username set not null;

alter table public.users
  add constraint users_username_key unique (username);

alter table public.users
  add constraint users_username_format check (username ~ '^[a-z]{4,6}[0-9]{2,4}$');

-- ---------------------------------------------------------------------------
-- Assign on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(new.email, 'friend@'), '@', 1)
  );

  insert into public.users (id, email, display_name, avatar_url, username)
  values (
    new.id,
    new.email,
    v_display_name,
    new.raw_user_meta_data ->> 'avatar_url',
    public.allocate_username(v_display_name)
  )
  on conflict (id) do update
    set email = excluded.email
  where public.users.email is distinct from excluded.email;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Usernames are assigned, not chosen
-- ---------------------------------------------------------------------------

-- profileRepo.update() takes a patch object, so without this a stray key would
-- silently rewrite someone's identity. Renaming yourself is `display_name`.
create or replace function public.freeze_username()
returns trigger
language plpgsql
as $$
begin
  if new.username is distinct from old.username then
    raise exception 'username is assigned and cannot be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger users_freeze_username
  before update on public.users
  for each row execute function public.freeze_username();

grant execute on function public.gen_username(text) to authenticated;



-- ############################################################################
-- # 20260817001000_trip_details_and_categories.sql
-- ############################################################################
-- Trip description and emoji, plus two more expense categories.
--
-- Note what is NOT happening here: the existing category VALUES are untouched.
-- 'food' and 'lodging' stay as they are and simply present as "Food & Drinks"
-- and "Accommodation" in the UI (see lib/theme.ts). Renaming stored enum values
-- would mean rewriting every existing expense row for a cosmetic gain.

alter table public.trips
  add column if not exists description text,
  add column if not exists emoji text;

alter table public.trips
  add constraint trips_description_length check (description is null or length(description) <= 280);

-- One emoji, not a free-text field. Length is generous because a single emoji
-- can be several code points (flags, skin tones, ZWJ sequences).
alter table public.trips
  add constraint trips_emoji_length check (emoji is null or length(emoji) <= 16);

-- ---------------------------------------------------------------------------
-- Categories: add flights and tickets
-- ---------------------------------------------------------------------------

alter table public.expenses
  drop constraint expenses_category_check;

alter table public.expenses
  add constraint expenses_category_check check (
    category in (
      'food', 'transport', 'lodging', 'activities',
      'groceries', 'shopping', 'flights', 'tickets', 'other'
    )
  );

-- ---------------------------------------------------------------------------
-- create_trip gains the optional fields.
--
-- Appended with defaults so existing callers keep working unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.create_trip(
  p_name text,
  p_base_currency char(3) default 'USD',
  p_member_names text[] default '{}',
  p_description text default null,
  p_emoji text default null
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create a trip.' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Give the trip a name.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.currencies c where c.code = upper(p_base_currency)) then
    raise exception 'Unknown currency: %', p_base_currency using errcode = '22023';
  end if;

  insert into public.trips (name, base_currency, created_by, description, emoji)
  values (
    trim(p_name),
    upper(p_base_currency),
    auth.uid(),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_emoji, '')), '')
  )
  returning * into v_trip;

  -- The owner's trip_members row is created by trips_add_owner_member.
  foreach v_name in array coalesce(p_member_names, '{}'::text[])
  loop
    if length(trim(coalesce(v_name, ''))) > 0 then
      insert into public.trip_members (trip_id, display_name, role)
      values (v_trip.id, trim(v_name), 'member');
    end if;
  end loop;

  return v_trip;
end;
$$;

grant execute on function public.create_trip(text, char, text[], text, text) to authenticated;

-- The 3-argument signature is now unreachable and would shadow the new one in
-- PostgREST's overload resolution.
drop function if exists public.create_trip(text, char, text[]);



-- ############################################################################
-- # 20260817001100_leave_trip.sql
-- ############################################################################
-- Leaving a trip.
--
-- SECURITY DEFINER because leaving can require promoting someone else to owner,
-- which an ordinary member has no permission to do. Every rule below is checked
-- against auth.uid(), so it cannot be used to remove anyone else.
--
-- Three rules, each guarding a way the ledger could otherwise break:
--
--   1. You cannot leave while your balance is non-zero. Members are removed by
--      setting removed_at, and removed members drop out of the balances list —
--      so a member leaving mid-debt would leave the remaining nets summing to
--      something other than zero, and simplifyDebts() refuses to suggest
--      settlements from an inconsistent ledger. Settle first.
--   2. You cannot leave if you are the only person left. That would orphan the
--      trip: nobody could read it, and nobody could delete it either.
--   3. A trip always keeps an owner. If the last owner leaves, the
--      longest-standing remaining member is promoted.

create or replace function public.leave_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.trip_members;
  v_net bigint;
  v_others int;
  v_other_owners int;
  v_successor uuid;
begin
  select * into v_member
    from public.trip_members m
   where m.trip_id = p_trip_id
     and m.user_id = auth.uid()
     and m.removed_at is null;

  if not found then
    raise exception 'You are not a member of this trip.' using errcode = '42501';
  end if;

  select count(*) into v_others
    from public.trip_members m
   where m.trip_id = p_trip_id and m.removed_at is null and m.id <> v_member.id;

  if v_others = 0 then
    raise exception 'You are the only person on this trip. Delete the trip instead.'
      using errcode = 'P0001';
  end if;

  select b.net_cents into v_net
    from public.trip_member_balances b
   where b.member_id = v_member.id;

  if coalesce(v_net, 0) <> 0 then
    raise exception 'Settle up before leaving — your balance is not yet zero.'
      using errcode = 'P0001';
  end if;

  if v_member.role = 'owner' then
    select count(*) into v_other_owners
      from public.trip_members m
     where m.trip_id = p_trip_id
       and m.removed_at is null
       and m.role = 'owner'
       and m.id <> v_member.id;

    if v_other_owners = 0 then
      -- Longest-standing member inherits the trip.
      select m.id into v_successor
        from public.trip_members m
       where m.trip_id = p_trip_id and m.removed_at is null and m.id <> v_member.id
       order by m.created_at asc
       limit 1;

      update public.trip_members set role = 'owner' where id = v_successor;
    end if;
  end if;

  update public.trip_members set removed_at = now() where id = v_member.id;
end;
$$;

grant execute on function public.leave_trip(uuid) to authenticated;



-- ############################################################################
-- # 20260817001200_add_member_by_username.sql
-- ############################################################################
-- Adding a real Splex account to a trip, by username.
--
-- Lookup is EXACT MATCH ONLY — no prefix, no ILIKE, no partial matching. A
-- search that matched fragments would let anyone enumerate the whole user base
-- by typing "a", so you have to know the username already. It is also why this
-- matches on username rather than display name: display names are neither
-- unique nor secret, and "Ben" would be ambiguous across thousands of accounts.
--
-- Both functions are SECURITY DEFINER because the caller cannot read a user
-- they do not already share a trip with. They return only what an invite
-- legitimately reveals — never the email address.

create or replace function public.find_user_by_username(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.username, u.display_name, u.avatar_url
    from public.users u
   where u.username = lower(trim(p_username))
   limit 1;
$$;

create or replace function public.add_member_by_username(p_trip_id uuid, p_username text)
returns public.trip_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text := lower(trim(coalesce(p_username, '')));
  v_user public.users;
  v_member public.trip_members;
  v_existing public.trip_members;
begin
  -- Membership check first: without it this would be a user-existence oracle
  -- for anyone with a session.
  if not public.is_trip_member(p_trip_id) then
    raise exception 'You are not a member of this trip.' using errcode = '42501';
  end if;

  if v_handle = '' then
    raise exception 'Enter a username.' using errcode = '22023';
  end if;

  select * into v_user from public.users u where u.username = v_handle;

  if not found then
    raise exception 'No Splex user with the username @%.', v_handle using errcode = 'P0002';
  end if;

  select * into v_existing
    from public.trip_members m
   where m.trip_id = p_trip_id and m.user_id = v_user.id and m.removed_at is null;

  if found then
    raise exception '% is already on this trip.', v_existing.display_name using errcode = 'P0001';
  end if;

  -- Someone who left before is reinstated rather than duplicated — a unique
  -- index on (trip_id, user_id) would reject a second row anyway, and their
  -- historical expenses point at the original member id.
  select * into v_existing
    from public.trip_members m
   where m.trip_id = p_trip_id and m.user_id = v_user.id and m.removed_at is not null
   order by m.created_at desc
   limit 1;

  if found then
    update public.trip_members
       set removed_at = null
     where id = v_existing.id
    returning * into v_member;

    return v_member;
  end if;

  insert into public.trip_members (trip_id, user_id, display_name, role)
  values (
    p_trip_id,
    v_user.id,
    coalesce(nullif(trim(v_user.display_name), ''), v_user.username),
    'member'
  )
  returning * into v_member;

  return v_member;
end;
$$;

grant execute on function public.find_user_by_username(text) to authenticated;
grant execute on function public.add_member_by_username(uuid, text) to authenticated;


-- ############################################################################
-- # POST-MIGRATION SETUP (not part of supabase/migrations/)
-- ############################################################################

-- ----------------------------------------------------------------------------
-- 1. Backfill public.users for accounts that already existed.
--
-- handle_new_user() is an AFTER INSERT trigger on auth.users, so it never fired
-- for any account created before these migrations were applied. Without a
-- public.users row, creating a trip fails the trips.created_by foreign key.
-- ----------------------------------------------------------------------------

insert into public.users (id, email, display_name)
select
  u.id,
  u.email,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    split_part(u.email, '@', 1)
  )
from auth.users u
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Starter FX rates, so foreign-currency expenses can be saved today.
--
-- The app refuses to save an expense it cannot convert rather than inventing a
-- rate, so an empty fx_rates table blocks any expense not in the trip's base
-- currency. These are USD-pivot rows; lib/fx.ts derives every other pair from
-- them arithmetically. Approximate values — deploying sync-fx-rates replaces
-- them with live data on its next run.
-- ----------------------------------------------------------------------------

insert into public.fx_rates (base_currency, quote_currency, rate, rate_date, source)
values
  ('USD', 'USD', '1.0000000000',     current_date, 'manual'),
  ('USD', 'SGD', '1.3400000000',     current_date, 'manual'),
  ('USD', 'THB', '32.5000000000',    current_date, 'manual'),
  ('USD', 'MYR', '4.2200000000',     current_date, 'manual'),
  ('USD', 'JPY', '152.0000000000',   current_date, 'manual'),
  ('USD', 'VND', '25400.0000000000', current_date, 'manual'),
  ('USD', 'IDR', '16200.0000000000', current_date, 'manual'),
  ('USD', 'KHR', '4100.0000000000',  current_date, 'manual'),
  ('USD', 'LAK', '21500.0000000000', current_date, 'manual'),
  ('USD', 'INR', '83.5000000000',    current_date, 'manual'),
  ('USD', 'EUR', '0.9200000000',     current_date, 'manual'),
  ('USD', 'GBP', '0.7800000000',     current_date, 'manual'),
  ('USD', 'AUD', '1.5100000000',     current_date, 'manual'),
  ('USD', 'KRW', '1330.0000000000',  current_date, 'manual'),
  ('USD', 'KWD', '0.3070000000',     current_date, 'manual')
on conflict (base_currency, quote_currency, rate_date) do nothing;

-- ----------------------------------------------------------------------------
-- Sanity check. Expect: currencies 172, users >= 1, fx_rates 15.
-- ----------------------------------------------------------------------------

select
  (select count(*) from public.currencies) as currencies,
  (select count(*) from public.users)      as users,
  (select count(*) from public.fx_rates)   as fx_rates,
  (select count(*) from pg_policies where schemaname = 'public') as rls_policies;
