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
