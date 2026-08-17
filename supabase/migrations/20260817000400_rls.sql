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
