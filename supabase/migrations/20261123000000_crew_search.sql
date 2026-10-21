-- Crew network N2 (docs/CREW_NETWORK.md): companies search the crew pool and contact people.
-- search_crew(): admins and members of an organisation find switched-on crew profiles they're
-- allowed to see (the person's choice and blocks, crew_profile() rules), by function, words,
-- languages, a certificate, distance from a place and whether they're free on given dates. It
-- returns the profile without coordinates, the distance in whole km, whether they've worked for
-- this organisation, and free/busy for the dates (never which gigs).
-- contact_crew(): from a gig the caller manages, ask a found person about their availability (5a)
-- or offer them a place (a crew call, M4a). The first contact is recorded in crew_contacts, which
-- lets the two message each other from then on.
-- Limits against scraping: 200 searches and 25 first contacts a day per organisation.
-- Written without destructive statements so it applies without manual confirmation.

create table if not exists public.crew_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contacted_by uuid references auth.users(id) on delete set null,
  gig_id uuid references public.gigs(id) on delete set null,
  kind text not null check (kind in ('availability', 'offer')),
  created_at timestamptz not null default now()
);
create index if not exists crew_contacts_org_idx on public.crew_contacts (org_id, created_at);
create index if not exists crew_contacts_pair_idx on public.crew_contacts (contacted_by, user_id);
create index if not exists crew_contacts_user_idx on public.crew_contacts (user_id, contacted_by);
alter table public.crew_contacts enable row level security;
-- The person contacted and the organisation's admins and members can see the record
create policy crew_contacts_select on public.crew_contacts for select to authenticated
  using (user_id = auth.uid() or private.can_quote(org_id));
create policy mfa_required on public.crew_contacts as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

create table if not exists public.crew_search_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organisations(id) on delete cascade,
  searched_by uuid references auth.users(id) on delete set null,
  results integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists crew_search_log_org_idx on public.crew_search_log (org_id, created_at);
alter table public.crew_search_log enable row level security;
create policy mfa_required on public.crew_search_log as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Written only by search_crew(); nobody reads it through the API

-- Great-circle distance in km
create or replace function private.km_between(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) returns numeric
language sql immutable set search_path = '' as $$
  select (2 * 6371 * asin(sqrt(
           power(sin(radians((lat2 - lat1) / 2)), 2)
           + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians((lng2 - lng1) / 2)), 2))))::numeric
$$;

-- Countries counted as Europe for "travels anywhere in Europe"
create or replace function private.in_europe(p_country text) returns boolean
language sql immutable set search_path = '' as $$
  select upper(coalesce(p_country, '')) = any (array['AD','AL','AT','BA','BE','BG','BY','CH','CY','CZ','DE','DK','EE','ES','FI','FO','FR','GB','GI','GR',
    'HR','HU','IE','IS','IT','LI','LT','LU','LV','MC','MD','ME','MK','MT','NL','NO','PL','PT','RO','RS','SE','SI','SK','SM','UA','VA','XK'])
$$;

-- Whether a person is booked or unavailable on any day from p_from to p_to
create or replace function private.crew_busy(p_user uuid, p_from date, p_to date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.gig_members m join public.gigs g on g.id = m.gig_id
       where m.user_id = p_user and g.status <> 'archived' and g.start_date is not null
         and g.start_date <= p_to and coalesce(g.end_date, g.start_date) >= p_from)
    or exists (
      select 1 from public.crew_unavailability u
       where u.user_id = p_user and u.start_date <= p_to and u.end_date >= p_from)
$$;

create or replace function private.search_crew_unchecked(
  p_org uuid, p_functions text[] default '{}', p_text text default null, p_languages text[] default '{}',
  p_certificate text default null, p_lat numeric default null, p_lng numeric default null, p_km integer default null,
  p_country text default null, p_from date default null, p_to date default null, p_only_free boolean default false,
  p_offset integer default 0)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid(); v_out jsonb; v_total integer; v_to date := coalesce(p_to, p_from);
  v_text text := nullif(trim(coalesce(p_text, '')), ''); v_cert text := nullif(trim(coalesce(p_certificate, '')), '');
  v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not private.can_quote(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if (select count(*) from public.crew_search_log l where l.org_id = p_org and l.created_at > now() - interval '1 day') >= 200 then
    raise exception 'Search limit reached for today' using errcode = '54000';
  end if;
  if v_to is not null and p_from is not null and v_to < p_from then v_to := p_from; end if;

  with found as (
    select c.*, p.full_name, p.avatar_url,
           case when p_lat is not null and p_lng is not null and c.base_lat is not null
                then round(private.km_between(p_lat, p_lng, c.base_lat, c.base_lng))::integer end as km,
           (select count(distinct g.id) from public.gig_members m join public.gigs g on g.id = m.gig_id
             where m.user_id = c.user_id and g.org_id = p_org)::integer as worked_with,
           case when p_from is not null then not private.crew_busy(c.user_id, p_from, v_to) end as free
      from public.crew_profiles c
      join public.profiles p on p.id = c.user_id
     where c.enabled and c.user_id <> v_me
       and private.can_see_crew_profile(v_me, c.user_id)
       and (cardinality(coalesce(p_functions, '{}')) = 0 or c.functions && p_functions)
       and (cardinality(coalesce(p_languages, '{}')) = 0 or c.languages @> p_languages)
       and (v_text is null or concat_ws(' ', p.full_name, c.headline, c.other_functions, c.bio) ilike '%' || v_text || '%')
       and (v_cert is null or exists (
             select 1 from jsonb_array_elements(c.certificates) e
              where e->>'name' ilike '%' || v_cert || '%'
                and (e->>'expires_on' is null or (e->>'expires_on')::date >= coalesce(v_to, current_date))))
  ), placed as (
    select f.* from found f
     where p_lat is null or p_lng is null
        or (f.km is not null and (
              (p_km is not null and f.km <= p_km)
              or (f.travel_scope = 'world')
              or (f.travel_scope = 'europe' and private.in_europe(p_country) and private.in_europe(f.base_country))
              or (f.travel_scope = 'country' and f.base_country = upper(coalesce(p_country, '')))
              or (f.travel_scope = 'km' and f.km <= coalesce(f.travel_km, 0))))
  ), kept as (
    select * from placed where not coalesce(p_only_free, false) or free is distinct from false
  )
  select (select count(*) from kept),
         coalesce((select jsonb_agg(x.r order by x.ord) from (
           select row_number() over (order by k.free is distinct from true, k.km nulls last, k.worked_with desc, k.updated_at desc) as ord,
                  jsonb_build_object(
                    'user_id', k.user_id, 'name', k.full_name, 'avatar_url', k.avatar_url, 'headline', k.headline,
                    'functions', k.functions, 'other_functions', k.other_functions, 'bio', k.bio,
                    'base_place', k.base_place, 'base_country', k.base_country, 'travel_scope', k.travel_scope, 'travel_km', k.travel_km,
                    'languages', k.languages, 'experience_years', k.experience_years, 'links', k.links, 'certificates', k.certificates,
                    'km', k.km, 'worked_with', k.worked_with, 'free', k.free) as r
             from kept k
            order by k.free is distinct from true, k.km nulls last, k.worked_with desc, k.updated_at desc
            offset v_off limit 20) x), '[]')
    into v_total, v_out;

  insert into public.crew_search_log (org_id, searched_by, results) values (p_org, v_me, v_total);
  return jsonb_build_object('results', v_out, 'total', v_total, 'more', v_total > v_off + 20);
end $$;

create or replace function public.search_crew(
  p_org uuid, p_functions text[] default '{}', p_text text default null, p_languages text[] default '{}',
  p_certificate text default null, p_lat numeric default null, p_lng numeric default null, p_km integer default null,
  p_country text default null, p_from date default null, p_to date default null, p_only_free boolean default false,
  p_offset integer default 0)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.search_crew_unchecked(p_org, p_functions, p_text, p_languages, p_certificate, p_lat, p_lng, p_km,
                                       p_country, p_from, p_to, p_only_free, p_offset);
end $$;

-- Contact a person found in the search, from a gig the caller manages
create or replace function private.contact_crew_unchecked(p_gig uuid, p_user uuid, p_kind text, p_title text default null, p_message text default null)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_org uuid; v_known boolean;
begin
  select g.org_id into v_org from public.gigs g where g.id = p_gig;
  if v_org is null or not private.can_manage_gig(p_gig) or not private.can_quote(v_org) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('availability', 'offer') then raise exception 'Unknown kind' using errcode = '22023'; end if;
  if p_kind = 'offer' and coalesce(trim(p_title), '') = '' then raise exception 'A function is needed' using errcode = '22023'; end if;
  -- Someone the caller can already reach (shared gig or organisation, earlier contact) or whose
  -- profile they may see; never someone who blocked them or whom they blocked
  v_known := private.can_message(v_me, p_user);
  if not v_known and not private.can_see_crew_profile(v_me, p_user) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_blocks b where b.active
              and ((b.user_id = p_user and b.blocked_id = v_me) or (b.user_id = v_me and b.blocked_id = p_user))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.gig_members m where m.gig_id = p_gig and m.user_id = p_user) then
    raise exception 'Already on this gig' using errcode = '23505';
  end if;
  -- New contacts per organisation per day
  if not v_known and not exists (select 1 from public.crew_contacts c where c.org_id = v_org and c.user_id = p_user)
     and (select count(distinct c.user_id) from public.crew_contacts c
           where c.org_id = v_org and c.created_at > now() - interval '1 day'
             and not exists (select 1 from public.crew_contacts e where e.org_id = v_org and e.user_id = c.user_id
                              and e.created_at <= now() - interval '1 day')) >= 25 then
    raise exception 'Contact limit reached for today' using errcode = '54000';
  end if;

  insert into public.crew_contacts (org_id, user_id, contacted_by, gig_id, kind) values (v_org, p_user, v_me, p_gig, p_kind);
  if p_kind = 'availability' then
    begin
      insert into public.availability_requests (gig_id, person_id, message)
      values (p_gig, p_user, nullif(left(trim(coalesce(p_message, '')), 500), ''));
    exception when unique_violation then
      raise exception 'Already asked' using errcode = '23505';
    end;
  else
    perform private.send_crew_call_unchecked(p_gig, left(trim(p_title), 120), 1, nullif(left(trim(coalesce(p_message, '')), 500), ''), array[p_user]);
  end if;
  return p_kind;
end $$;

create or replace function public.contact_crew(p_gig uuid, p_user uuid, p_kind text, p_title text default null, p_message text default null)
returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.contact_crew_unchecked(p_gig, p_user, p_kind, p_title, p_message);
end $$;

-- Once a company has contacted someone through the crew network, the two can write to each other
create or replace function private.can_message(p_me uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_me is not null and p_user is not null and p_me <> p_user and (
    exists (select 1 from public.gig_members a join public.gig_members b on b.gig_id = a.gig_id where a.user_id = p_me and b.user_id = p_user)
    or exists (select 1 from public.org_members a join public.org_members b on b.org_id = a.org_id where a.user_id = p_me and b.user_id = p_user)
    or private.can_find(p_me, p_user)
    or exists (select 1 from public.crew_contacts c
                where (c.contacted_by = p_me and c.user_id = p_user) or (c.user_id = p_me and c.contacted_by = p_user)))
$$;

revoke execute on function private.km_between(numeric, numeric, numeric, numeric) from public, anon;
revoke execute on function private.in_europe(text) from public, anon;
revoke execute on function private.crew_busy(uuid, date, date) from public, anon, authenticated;
revoke execute on function private.search_crew_unchecked(uuid, text[], text, text[], text, numeric, numeric, integer, text, date, date, boolean, integer) from public, anon, authenticated;
revoke execute on function private.contact_crew_unchecked(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function private.can_message(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.search_crew(uuid, text[], text, text[], text, numeric, numeric, integer, text, date, date, boolean, integer) from public, anon;
revoke execute on function public.contact_crew(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.search_crew(uuid, text[], text, text[], text, numeric, numeric, integer, text, date, date, boolean, integer) to authenticated;
grant execute on function public.contact_crew(uuid, uuid, text, text, text) to authenticated;
