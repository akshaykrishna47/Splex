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
