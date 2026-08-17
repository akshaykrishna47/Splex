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
