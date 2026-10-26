-- Crew network N5 (docs/CREW_NETWORK.md): alerts and saved searches.
-- - Job alerts: when a job is posted, freelancers whose crew profile matches it (their functions,
--   within their travel range, as "For you" on the job board) get a "job_match" notification (in
--   the app, by push and in the e-mail summary). On by default; crew_profiles.job_alerts switches
--   it off. At most 10 a day per person. Not for the posting organisation's own members, people on
--   the gig, or across a block. The notification never names the gig.
-- - Saved searches: an organisation's admins and members keep Find crew filters by name
--   (crew_saved_searches; up to 30 per organisation; removing one only marks it).
--   With alerts on, whoever saved it hears when a profile that matches is switched on
--   ("crew_match", at most 5 a day per search), if they may see it.
-- Written without destructive statements so it applies without manual confirmation.

alter table public.crew_profiles add column if not exists job_alerts boolean not null default true;

-- ── Job alerts ───────────────────────────────────────────────────────────────
-- Whether a post fits a profile: the same rule as "For you" on the job board
create or replace function private.job_fits_profile(p_post public.job_posts, c public.crew_profiles) returns boolean
language sql stable security definer set search_path = '' as $$
  select (p_post.function_key is null or p_post.function_key = any (c.functions))
     and (p_post.lat is null or c.base_lat is null
          or c.travel_scope = 'world'
          or (c.travel_scope = 'europe' and private.in_europe(p_post.country))
          or (c.travel_scope = 'country' and p_post.country = c.base_country)
          or (c.travel_scope = 'km' and private.km_between(c.base_lat, c.base_lng, p_post.lat, p_post.lng) <= coalesce(c.travel_km, 50)))
$$;

create or replace function private.job_posts_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org text;
begin
  if new.status <> 'open' or new.ends_on < current_date then return null; end if;
  select o.name into v_org from public.organisations o where o.id = new.org_id;
  insert into public.notifications (user_id, gig_id, org_id, actor_id, kind, details)
  select c.user_id, null, new.org_id, null, 'job_match',
         jsonb_build_object('post_id', new.id, 'title', new.title, 'org_name', v_org, 'place', new.place,
                            'starts_on', new.starts_on, 'ends_on', new.ends_on)
    from public.crew_profiles c
   where c.enabled and c.suspended_at is null and c.job_alerts
     and c.user_id is distinct from new.created_by
     and not exists (select 1 from public.org_members m where m.org_id = new.org_id and m.user_id = c.user_id)
     and not exists (select 1 from public.gig_members m where m.gig_id = new.gig_id and m.user_id = c.user_id)
     and not exists (select 1 from public.user_blocks b where b.active
                      and ((b.user_id = c.user_id and b.blocked_id = new.created_by) or (b.user_id = new.created_by and b.blocked_id = c.user_id)))
     and private.job_fits_profile(new, c)
     and (select count(*) from public.notifications n
           where n.user_id = c.user_id and n.kind = 'job_match' and n.created_at > now() - interval '1 day') < 10;
  return null;
end $$;
create or replace trigger job_posts_alert after insert on public.job_posts
  for each row execute function private.job_posts_alert();

-- ── Saved searches ───────────────────────────────────────────────────────────
create table if not exists public.crew_saved_searches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  filters jsonb not null default '{}' check (jsonb_typeof(filters) = 'object' and octet_length(filters::text) <= 4000),
  alert boolean not null default true,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists crew_saved_searches_org_idx on public.crew_saved_searches (org_id) where removed_at is null;
alter table public.crew_saved_searches enable row level security;
-- Removed searches stay readable to the organisation (an update must still see its row); the app
-- lists only those without removed_at
create policy crew_saved_searches_select on public.crew_saved_searches for select to authenticated
  using (private.can_quote(org_id));
create policy crew_saved_searches_insert on public.crew_saved_searches for insert to authenticated
  with check (private.can_quote(org_id) and created_by = auth.uid() and removed_at is null);
create policy crew_saved_searches_update on public.crew_saved_searches for update to authenticated
  using (removed_at is null and private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy mfa_required on public.crew_saved_searches as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- What may change after saving: the name, the filters, alerts, and removing it
revoke update on public.crew_saved_searches from authenticated;
grant update (name, filters, alert, removed_at) on public.crew_saved_searches to authenticated;

create or replace function private.crew_saved_searches_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := trim(new.name);
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if (select count(*) from public.crew_saved_searches s where s.org_id = new.org_id and s.removed_at is null) >= 30 then
      raise exception 'Saved search limit reached' using errcode = '54000';
    end if;
  end if;
  return new;
end $$;
create or replace trigger crew_saved_searches_before before insert or update on public.crew_saved_searches
  for each row execute function private.crew_saved_searches_before();

-- Whether a profile fits a saved search's filters (function, words, language, certificate, place)
create or replace function private.profile_fits_search(c public.crew_profiles, f jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_lat numeric := nullif(f#>>'{place,lat}', '')::numeric; v_lng numeric := nullif(f#>>'{place,lng}', '')::numeric;
        v_country text := upper(coalesce(f#>>'{place,country}', '')); v_km numeric; v_text text := nullif(trim(coalesce(f->>'text', '')), '');
        v_cert text := nullif(trim(coalesce(f->>'certificate', '')), '');
begin
  if nullif(f->>'fn', '') is not null and not (f->>'fn' = any (c.functions)) then return false; end if;
  if nullif(f->>'language', '') is not null and not (f->>'language' = any (c.languages)) then return false; end if;
  if v_cert is not null and not exists (select 1 from jsonb_array_elements(c.certificates) e
                                         where e->>'name' ilike '%' || v_cert || '%'
                                           and (e->>'expires_on' is null or (e->>'expires_on')::date >= current_date)) then
    return false;
  end if;
  if v_text is not null and not (concat_ws(' ', (select p.full_name from public.profiles p where p.id = c.user_id), c.headline, c.other_functions, c.bio)
                                 ilike '%' || v_text || '%') then
    return false;
  end if;
  if v_lat is not null and v_lng is not null then
    if c.base_lat is null then return false; end if;
    v_km := private.km_between(v_lat, v_lng, c.base_lat, c.base_lng);
    return v_km <= coalesce(nullif(f->>'km', '')::numeric, 100)
        or c.travel_scope = 'world'
        or (c.travel_scope = 'europe' and private.in_europe(v_country) and private.in_europe(c.base_country))
        or (c.travel_scope = 'country' and c.base_country = v_country)
        or (c.travel_scope = 'km' and v_km <= coalesce(c.travel_km, 0));
  end if;
  return true;
end $$;

-- A profile switched on (or shown again): tell the saved searches it fits
create or replace function private.crew_profiles_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.enabled or new.suspended_at is not null then return null; end if;
  if tg_op = 'UPDATE' and old.enabled and old.suspended_at is null then return null; end if;
  insert into public.notifications (user_id, gig_id, org_id, actor_id, kind, details)
  select s.created_by, null, s.org_id, new.user_id, 'crew_match',
         jsonb_build_object('search_id', s.id, 'search_name', s.name)
    from public.crew_saved_searches s
   where s.alert and s.removed_at is null and s.created_by is not null and s.created_by <> new.user_id
     and private.can_quote_as(s.created_by, s.org_id)
     and private.can_see_crew_profile(s.created_by, new.user_id)
     and private.profile_fits_search(new, s.filters)
     and (select count(*) from public.notifications n
           where n.user_id = s.created_by and n.kind = 'crew_match' and n.details->>'search_id' = s.id::text
             and n.created_at > now() - interval '1 day') < 5;
  return null;
end $$;
create or replace trigger crew_profiles_alert after insert or update on public.crew_profiles
  for each row execute function private.crew_profiles_alert();

-- Whether a given person is still an admin or member of the organisation (can_quote is for the caller)
create or replace function private.can_quote_as(p_user uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = p_user and m.role in ('admin', 'member'))
$$;

revoke execute on function private.job_fits_profile(public.job_posts, public.crew_profiles) from public, anon, authenticated;
revoke execute on function private.profile_fits_search(public.crew_profiles, jsonb) from public, anon, authenticated;
revoke execute on function private.can_quote_as(uuid, uuid) from public, anon, authenticated;
