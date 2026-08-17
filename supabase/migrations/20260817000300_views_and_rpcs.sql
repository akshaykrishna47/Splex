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
