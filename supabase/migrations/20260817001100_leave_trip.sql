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
