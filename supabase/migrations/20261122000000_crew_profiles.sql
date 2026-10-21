-- Crew network N1 (docs/CREW_NETWORK.md): opt-in crew profiles.
-- crew_profiles: one per person, off until they switch it on. They choose who sees it and can
-- change it at any time: 'companies' (admins and members of AVX organisations, the default) or
-- 'crew' (also every other signed-in person). Never the public web. No rates on a profile.
-- The base is a place name with coordinates rounded to about 1 km (found through the geocode
-- Edge Function). Certificates are self-declared here; checking them comes in N4.
-- Only the person reads and writes their row; others see it through crew_profile(), which applies
-- the person's choice and blocks.
-- Written without destructive statements so it applies without manual confirmation: "remove my
-- profile" clears the row instead.

-- Every element of an array matches a pattern
create or replace function private.all_match(p_values text[], p_pattern text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(v ~ p_pattern), true) from unnest(p_values) v
$$;

create table if not exists public.crew_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  visibility text not null default 'companies' check (visibility in ('companies', 'crew')),
  headline text check (char_length(headline) <= 120),
  functions text[] not null default '{}' check (cardinality(functions) <= 12 and private.all_match(functions, '^[a-z_]{2,40}$')),
  other_functions text check (char_length(other_functions) <= 200),
  bio text check (char_length(bio) <= 1000),
  base_place text check (char_length(base_place) <= 160),
  base_country text check (base_country ~ '^[A-Z]{2}$'),
  base_lat numeric(5, 2) check (base_lat between -90 and 90),
  base_lng numeric(6, 2) check (base_lng between -180 and 180),
  travel_scope text not null default 'km' check (travel_scope in ('km', 'country', 'europe', 'world')),
  travel_km integer check (travel_km between 1 and 5000),
  languages text[] not null default '{}' check (cardinality(languages) <= 12 and private.all_match(languages, '^[a-z]{2,3}$')),
  experience_years integer check (experience_years between 0 and 70),
  links text[] not null default '{}' check (cardinality(links) <= 3 and private.all_match(links, '^https?://[^\s]{3,200}$')),
  certificates jsonb not null default '[]' check (jsonb_typeof(certificates) = 'array' and jsonb_array_length(certificates) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Switching it on needs at least one function and a base
  constraint crew_profiles_complete check (not enabled or (cardinality(functions) > 0 or other_functions is not null) and base_place is not null)
);
alter table public.crew_profiles enable row level security;
create policy crew_profiles_own_select on public.crew_profiles for select to authenticated using (user_id = auth.uid());
create policy crew_profiles_own_insert on public.crew_profiles for insert to authenticated with check (user_id = auth.uid());
create policy crew_profiles_own_update on public.crew_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mfa_required on public.crew_profiles as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- Certificates: [{ name, issuer, expires_on }], checked and trimmed on the way in
create or replace function private.crew_profiles_before() returns trigger
language plpgsql set search_path = '' as $$
declare c jsonb; v_out jsonb := '[]';
begin
  for c in select * from jsonb_array_elements(new.certificates) loop
    if jsonb_typeof(c) <> 'object' or coalesce(trim(c->>'name'), '') = '' or char_length(c->>'name') > 100
       or char_length(coalesce(c->>'issuer', '')) > 100
       or (c->>'expires_on' is not null and c->>'expires_on' !~ '^\d{4}-\d{2}-\d{2}$') then
      raise exception 'Invalid certificate' using errcode = '22023';
    end if;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', trim(c->>'name'), 'issuer', nullif(trim(coalesce(c->>'issuer', '')), ''), 'expires_on', c->>'expires_on')));
  end loop;
  new.certificates := v_out;
  new.headline := nullif(trim(coalesce(new.headline, '')), '');
  new.other_functions := nullif(trim(coalesce(new.other_functions, '')), '');
  new.bio := nullif(trim(coalesce(new.bio, '')), '');
  new.base_place := nullif(trim(coalesce(new.base_place, '')), '');
  new.functions := array(select distinct f from unnest(new.functions) f order by f);
  new.languages := array(select distinct l from unnest(new.languages) l order by l);
  if new.travel_scope <> 'km' then new.travel_km := null; end if;
  new.updated_at := now();
  return new;
end $$;
create or replace trigger crew_profiles_before before insert or update on public.crew_profiles
  for each row execute function private.crew_profiles_before();

-- Whether p_viewer may see p_user's profile: their own; otherwise only when it's switched on, the
-- viewer is on the side the person chose, and neither has blocked the other
create or replace function private.can_see_crew_profile(p_viewer uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_viewer = p_user or exists (
    select 1 from public.crew_profiles c
     where c.user_id = p_user and c.enabled
       and (c.visibility = 'crew' or private.is_company_side(p_viewer))
       and not exists (select 1 from public.user_blocks b where b.active
                        and ((b.user_id = p_user and b.blocked_id = p_viewer) or (b.user_id = p_viewer and b.blocked_id = p_user))))
$$;

-- A profile as others see it (null when they may not)
create or replace function public.crew_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform private.require_mfa();
  if not private.can_see_crew_profile(auth.uid(), p_user) then return null; end if;
  select jsonb_build_object(
           'user_id', c.user_id, 'enabled', c.enabled, 'visibility', c.visibility, 'name', p.full_name, 'avatar_url', p.avatar_url,
           'headline', c.headline, 'functions', c.functions, 'other_functions', c.other_functions, 'bio', c.bio,
           'base_place', c.base_place, 'base_country', c.base_country, 'travel_scope', c.travel_scope, 'travel_km', c.travel_km,
           'languages', c.languages, 'experience_years', c.experience_years, 'links', c.links, 'certificates', c.certificates,
           'updated_at', c.updated_at)
    into v
    from public.crew_profiles c join public.profiles p on p.id = c.user_id
   where c.user_id = p_user;
  return v;
end $$;

-- "Remove my profile": everything cleared and switched off (the row stays, empty)
create or replace function public.clear_crew_profile() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform private.require_mfa();
  update public.crew_profiles set enabled = false, visibility = 'companies', headline = null, functions = '{}',
         other_functions = null, bio = null, base_place = null, base_country = null, base_lat = null, base_lng = null,
         travel_scope = 'km', travel_km = null, languages = '{}', experience_years = null, links = '{}', certificates = '[]'
   where user_id = auth.uid();
end $$;

revoke execute on function private.all_match(text[], text) from public, anon;
grant execute on function private.all_match(text[], text) to authenticated;
revoke execute on function private.can_see_crew_profile(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.crew_profile(uuid) from public, anon;
grant execute on function public.crew_profile(uuid) to authenticated;
revoke execute on function public.clear_crew_profile() from public, anon;
grant execute on function public.clear_crew_profile() to authenticated;

-- S4's calendar link missed the two-step sign-in rule every other table and function has
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendar_feeds' and policyname = 'mfa_required') then
    create policy mfa_required on public.calendar_feeds as restrictive for all to authenticated
      using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
  end if;
end $$;
create or replace function public.calendar_feed(p_new boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform private.require_mfa();
  select token into v_token from public.calendar_feeds where user_id = auth.uid();
  if v_token is null or p_new then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.calendar_feeds (user_id, token) values (auth.uid(), v_token)
    on conflict (user_id) do update set token = excluded.token, created_at = now(), last_used_at = null;
  end if;
  return v_token;
end $$;
