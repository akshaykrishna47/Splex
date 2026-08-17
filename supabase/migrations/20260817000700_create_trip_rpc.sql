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
