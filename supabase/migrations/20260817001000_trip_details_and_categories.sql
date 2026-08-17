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
