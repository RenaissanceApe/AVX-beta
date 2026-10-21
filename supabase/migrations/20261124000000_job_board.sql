-- Crew network N3 (docs/CREW_NETWORK.md): the job board.
-- job_posts: an organisation publishes an open position for one of its gigs (function, dates,
-- place, languages, a certificate, a description and how pay works: "send your day rate" or a
-- stated fee). Posting needs two-step sign-in switched on, and organisations not verified yet
-- (organisations.verified_at, set in N4) can have at most 3 open posts.
-- Freelancers with their crew profile switched on see open posts (list_jobs: by default those
-- matching their functions and travel range) and apply (apply_job: a message and, if asked, their
-- day rate). An application starts a direct conversation with whoever posted; the organisation's
-- admins and members see the applications and shortlist, decline or offer the place (a crew call,
-- M4a). Accepting the offer adds the person to the gig and marks the application accepted; the
-- post is marked filled when every place is taken. Posts close on their last day, or by hand.
-- Written without destructive statements so it applies without manual confirmation.

alter table public.organisations add column if not exists verified_at timestamptz;

create table if not exists public.job_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  gig_id uuid not null references public.gigs(id) on delete cascade,
  position_id uuid references public.gig_positions(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  function_key text check (function_key ~ '^[a-z_]{2,40}$'),
  quantity integer not null default 1 check (quantity between 1 and 50),
  starts_on date not null,
  ends_on date not null,
  place text check (char_length(place) <= 160),
  country text check (country ~ '^[A-Z]{2}$'),
  lat numeric(5, 2) check (lat between -90 and 90),
  lng numeric(6, 2) check (lng between -180 and 180),
  languages text[] not null default '{}' check (cardinality(languages) <= 8 and private.all_match(languages, '^[a-z]{2,3}$')),
  certificate text check (char_length(certificate) <= 100),
  description text check (char_length(description) <= 2000),
  pay_mode text not null default 'ask_rate' check (pay_mode in ('ask_rate', 'fixed')),
  pay_amount numeric(10, 2) check (pay_amount >= 0),
  pay_max numeric(10, 2) check (pay_max >= 0),
  pay_per text not null default 'day' check (pay_per in ('day', 'job', 'hour')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'open' check (status in ('open', 'filled', 'closed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (ends_on >= starts_on),
  check (pay_mode = 'ask_rate' or pay_amount is not null),
  check (pay_max is null or pay_max >= coalesce(pay_amount, 0))
);
create index if not exists job_posts_open_idx on public.job_posts (status, ends_on);
create index if not exists job_posts_org_idx on public.job_posts (org_id, created_at);
alter table public.job_posts enable row level security;
create policy job_posts_select on public.job_posts for select to authenticated using (private.can_quote(org_id));
create policy mfa_required on public.job_posts as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.job_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text check (char_length(message) <= 1000),
  day_rate numeric(10, 2) check (day_rate >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'applied' check (status in ('applied', 'shortlisted', 'declined', 'offered', 'accepted', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists job_applications_user_idx on public.job_applications (user_id, created_at);
alter table public.job_applications enable row level security;
-- The applicant, and the posting organisation's admins and members
create policy job_applications_select on public.job_applications for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.job_posts p where p.id = post_id and private.can_quote(p.org_id)));
create policy mfa_required on public.job_applications as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- Whether the caller has switched two-step sign-in on (a verified factor)
create or replace function private.has_two_step() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;

-- ── Publishing ────────────────────────────────────────────────────────────────
create or replace function private.publish_job_unchecked(p_gig uuid, p_job jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_gig public.gigs; v_id uuid; v_from date; v_to date; v_pos uuid;
begin
  select * into v_gig from public.gigs where id = p_gig;
  if v_gig.id is null or not private.can_manage_gig(p_gig) or not private.can_quote(v_gig.org_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not private.has_two_step() then raise exception 'Two-step sign-in needed to post' using errcode = '42501'; end if;
  if (select o.verified_at from public.organisations o where o.id = v_gig.org_id) is null
     and (select count(*) from public.job_posts p where p.org_id = v_gig.org_id and p.status = 'open' and p.ends_on >= current_date) >= 3 then
    raise exception 'Open post limit reached' using errcode = '54000';
  end if;
  v_from := coalesce(nullif(p_job->>'starts_on', '')::date, v_gig.start_date);
  v_to := coalesce(nullif(p_job->>'ends_on', '')::date, v_gig.end_date, v_from);
  if v_from is null then raise exception 'The gig needs dates' using errcode = '22023'; end if;
  if v_to < current_date then raise exception 'The dates have passed' using errcode = '22023'; end if;
  v_pos := nullif(p_job->>'position_id', '')::uuid;
  if v_pos is not null and not exists (select 1 from public.gig_positions g where g.id = v_pos and g.gig_id = p_gig) then v_pos := null; end if;
  insert into public.job_posts (org_id, gig_id, position_id, title, function_key, quantity, starts_on, ends_on, place, country, lat, lng,
                                languages, certificate, description, pay_mode, pay_amount, pay_max, pay_per, currency, created_by)
  values (v_gig.org_id, p_gig, v_pos, trim(p_job->>'title'), nullif(p_job->>'function_key', ''),
          coalesce(nullif(p_job->>'quantity', '')::integer, 1), v_from, v_to,
          nullif(trim(coalesce(p_job->>'place', '')), ''), nullif(p_job->>'country', ''),
          round(nullif(p_job->>'lat', '')::numeric, 2), round(nullif(p_job->>'lng', '')::numeric, 2),
          coalesce(array(select jsonb_array_elements_text(coalesce(p_job->'languages', '[]'))), '{}'),
          nullif(trim(coalesce(p_job->>'certificate', '')), ''), nullif(trim(coalesce(p_job->>'description', '')), ''),
          coalesce(nullif(p_job->>'pay_mode', ''), 'ask_rate'), nullif(p_job->>'pay_amount', '')::numeric, nullif(p_job->>'pay_max', '')::numeric,
          coalesce(nullif(p_job->>'pay_per', ''), 'day'), coalesce(nullif(p_job->>'currency', ''), 'EUR'), auth.uid())
  returning id into v_id;
  return v_id;
end $$;
create or replace function public.publish_job(p_gig uuid, p_job jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.publish_job_unchecked(p_gig, p_job);
end $$;

create or replace function private.close_job_unchecked(p_post uuid, p_status text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_status not in ('open', 'filled', 'closed') then raise exception 'Unknown status' using errcode = '22023'; end if;
  if not exists (select 1 from public.job_posts p where p.id = p_post and private.can_quote(p.org_id) and private.can_manage_gig(p.gig_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.job_posts set status = p_status, closed_at = case when p_status = 'open' then null else now() end where id = p_post;
end $$;
create or replace function public.close_job(p_post uuid, p_status text default 'closed') returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.close_job_unchecked(p_post, p_status);
end $$;

-- ── The board, for freelancers ─────────────────────────────────────────────────
-- Open posts still to come. By default only those for the person's functions and within their
-- travel range from their base; p_all shows every open post (nearest first when they have a base).
create or replace function private.list_jobs_unchecked(p_all boolean default false, p_function text default null, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_p public.crew_profiles; v_out jsonb; v_total integer; v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  select * into v_p from public.crew_profiles where user_id = v_me;
  if v_p.user_id is null or not v_p.enabled then
    return jsonb_build_object('needs_profile', true, 'results', '[]'::jsonb, 'total', 0, 'more', false);
  end if;
  with posts as (
    select j.*, o.name as org_name, o.verified_at is not null as verified,
           case when j.lat is not null and v_p.base_lat is not null then round(private.km_between(v_p.base_lat, v_p.base_lng, j.lat, j.lng))::integer end as km,
           (select a.status from public.job_applications a where a.post_id = j.id and a.user_id = v_me) as my_status
      from public.job_posts j join public.organisations o on o.id = j.org_id
     where j.status = 'open' and j.ends_on >= current_date
       and not exists (select 1 from public.user_blocks b where b.active
                        and ((b.user_id = v_me and b.blocked_id = j.created_by) or (b.user_id = j.created_by and b.blocked_id = v_me)))
       and (p_function is null or j.function_key = p_function)
  ), matching as (
    select * from posts p
     where coalesce(p_all, false)
        or ((p.function_key is null or p.function_key = any (v_p.functions))
            and (p.km is null
                 or v_p.travel_scope = 'world'
                 or (v_p.travel_scope = 'europe' and private.in_europe(p.country))
                 or (v_p.travel_scope = 'country' and p.country = v_p.base_country)
                 or (v_p.travel_scope = 'km' and p.km <= coalesce(v_p.travel_km, 50))))
  )
  select (select count(*) from matching),
         coalesce((select jsonb_agg(x.r order by x.ord) from (
           select row_number() over (order by m.starts_on, m.km nulls last, m.created_at desc) as ord,
                  jsonb_build_object('id', m.id, 'org_name', m.org_name, 'verified', m.verified, 'title', m.title, 'function_key', m.function_key,
                    'quantity', m.quantity, 'starts_on', m.starts_on, 'ends_on', m.ends_on, 'place', m.place, 'country', m.country, 'km', m.km,
                    'languages', m.languages, 'certificate', m.certificate, 'description', m.description, 'pay_mode', m.pay_mode,
                    'pay_amount', m.pay_amount, 'pay_max', m.pay_max, 'pay_per', m.pay_per, 'currency', m.currency,
                    'my_status', m.my_status, 'created_at', m.created_at) as r
             from matching m order by m.starts_on, m.km nulls last, m.created_at desc offset v_off limit 20) x), '[]')
    into v_total, v_out;
  return jsonb_build_object('needs_profile', false, 'results', v_out, 'total', v_total, 'more', v_total > v_off + 20);
end $$;
create or replace function public.list_jobs(p_all boolean default false, p_function text default null, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.list_jobs_unchecked(p_all, p_function, p_offset);
end $$;

-- ── Applying ──────────────────────────────────────────────────────────────────
create or replace function private.apply_job_unchecked(p_post uuid, p_message text default null, p_rate numeric default null, p_currency text default null)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_post public.job_posts; v_id uuid; v_conv uuid; v_gig_name text;
begin
  select * into v_post from public.job_posts where id = p_post;
  if v_post.id is null or v_post.status <> 'open' or v_post.ends_on < current_date then
    raise exception 'This job is no longer open' using errcode = '22023';
  end if;
  if not exists (select 1 from public.crew_profiles c where c.user_id = v_me and c.enabled) then
    raise exception 'Switch on your crew profile first' using errcode = '42501';
  end if;
  if v_post.created_by is null or v_post.created_by = v_me or exists (select 1 from public.user_blocks b where b.active
       and ((b.user_id = v_me and b.blocked_id = v_post.created_by) or (b.user_id = v_post.created_by and b.blocked_id = v_me))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.gig_members m where m.gig_id = v_post.gig_id and m.user_id = v_me) then
    raise exception 'Already on this gig' using errcode = '23505';
  end if;
  if v_post.pay_mode = 'ask_rate' and p_rate is null then raise exception 'Your day rate is asked for' using errcode = '22023'; end if;
  if (select count(*) from public.job_applications a where a.user_id = v_me and a.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Application limit reached for today' using errcode = '54000';
  end if;
  begin
    insert into public.job_applications (post_id, user_id, message, day_rate, currency)
    values (p_post, v_me, nullif(left(trim(coalesce(p_message, '')), 1000), ''), p_rate,
            case when p_rate is not null then coalesce(nullif(p_currency, ''), v_post.currency) end)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Already applied' using errcode = '23505';
  end;
  select g.name into v_gig_name from public.gigs g where g.id = v_post.gig_id;
  v_conv := private.ensure_direct(v_me, v_post.created_by);
  insert into public.messages (conversation_id, author_id, kind, payload)
  values (v_conv, v_me, 'system', jsonb_build_object('event', 'job_application', 'post_id', p_post, 'application_id', v_id, 'title', v_post.title,
          'rate', p_rate, 'currency', case when p_rate is not null then coalesce(nullif(p_currency, ''), v_post.currency) end,
          'note', nullif(left(trim(coalesce(p_message, '')), 1000), '')));
  insert into public.notifications (user_id, gig_id, org_id, actor_id, kind, details)
  select m.user_id, v_post.gig_id, v_post.org_id, v_me, 'job_application',
         jsonb_build_object('post_id', p_post, 'title', v_post.title, 'gig_name', v_gig_name, 'conversation_id', case when m.user_id = v_post.created_by then v_conv end)
    from public.org_members m where m.org_id = v_post.org_id and (m.user_id = v_post.created_by or m.role = 'admin');
  return v_id;
end $$;
create or replace function public.apply_job(p_post uuid, p_message text default null, p_rate numeric default null, p_currency text default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.apply_job_unchecked(p_post, p_message, p_rate, p_currency);
end $$;

create or replace function private.withdraw_application_unchecked(p_application uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.job_applications set status = 'withdrawn', updated_at = now()
   where id = p_application and user_id = auth.uid() and status in ('applied', 'shortlisted', 'offered');
  if not found then raise exception 'Not allowed' using errcode = '42501'; end if;
end $$;
create or replace function public.withdraw_application(p_application uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.withdraw_application_unchecked(p_application);
end $$;

-- ── Answering applications (the organisation) ─────────────────────────────────
create or replace function private.answer_application_unchecked(p_application uuid, p_action text, p_message text default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_a public.job_applications; v_post public.job_posts; v_conv uuid; v_gig_name text; v_status text;
begin
  select * into v_a from public.job_applications where id = p_application;
  select * into v_post from public.job_posts where id = v_a.post_id;
  if v_a.id is null or not private.can_quote(v_post.org_id) or not private.can_manage_gig(v_post.gig_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_a.status in ('withdrawn', 'accepted') then raise exception 'This application is closed' using errcode = '22023'; end if;
  select g.name into v_gig_name from public.gigs g where g.id = v_post.gig_id;
  case p_action
  when 'shortlist' then v_status := 'shortlisted';
  when 'decline' then
    v_status := 'declined';
    v_conv := private.ensure_direct(auth.uid(), v_a.user_id);
    insert into public.messages (conversation_id, author_id, kind, payload)
    values (v_conv, auth.uid(), 'system', jsonb_build_object('event', 'job_declined', 'post_id', v_post.id, 'title', v_post.title,
            'note', nullif(left(trim(coalesce(p_message, '')), 500), '')));
    insert into public.notifications (user_id, gig_id, org_id, actor_id, kind, details)
    values (v_a.user_id, null, v_post.org_id, auth.uid(), 'job_declined',
            jsonb_build_object('post_id', v_post.id, 'title', v_post.title, 'conversation_id', v_conv));
  when 'offer' then
    v_status := 'offered';
    perform private.send_crew_call_unchecked(v_post.gig_id, v_post.title, 1, nullif(left(trim(coalesce(p_message, '')), 500), ''), array[v_a.user_id]);
  else
    raise exception 'Unknown action' using errcode = '22023';
  end case;
  update public.job_applications set status = v_status, updated_at = now() where id = p_application;
  return v_status;
end $$;
create or replace function public.answer_application(p_application uuid, p_action text, p_message text default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.answer_application_unchecked(p_application, p_action, p_message);
end $$;

-- Joining the gig (accepting the offer) marks the application accepted, and the post filled
-- when every place is taken
create or replace function private.job_applications_on_join() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    update public.job_applications a set status = 'accepted', updated_at = now()
      from public.job_posts p
     where a.post_id = p.id and p.gig_id = new.gig_id and a.user_id = new.user_id and a.status in ('applied', 'shortlisted', 'offered')
    returning p.id as post_id, p.quantity
  loop
    if (select count(*) from public.job_applications x where x.post_id = r.post_id and x.status = 'accepted') >= r.quantity then
      update public.job_posts set status = 'filled', closed_at = now() where id = r.post_id and status = 'open';
    end if;
  end loop;
  return null;
end $$;
create or replace trigger gig_members_job_applications after insert on public.gig_members
  for each row execute function private.job_applications_on_join();

-- An application lets the applicant and the person who posted write to each other
create or replace function private.can_message(p_me uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_me is not null and p_user is not null and p_me <> p_user and (
    exists (select 1 from public.gig_members a join public.gig_members b on b.gig_id = a.gig_id where a.user_id = p_me and b.user_id = p_user)
    or exists (select 1 from public.org_members a join public.org_members b on b.org_id = a.org_id where a.user_id = p_me and b.user_id = p_user)
    or private.can_find(p_me, p_user)
    or exists (select 1 from public.crew_contacts c
                where (c.contacted_by = p_me and c.user_id = p_user) or (c.user_id = p_me and c.contacted_by = p_user))
    or exists (select 1 from public.job_applications a join public.job_posts j on j.id = a.post_id
                where (a.user_id = p_me and j.created_by = p_user) or (a.user_id = p_user and j.created_by = p_me)))
$$;

revoke execute on function private.has_two_step() from public, anon, authenticated;
revoke execute on function private.publish_job_unchecked(uuid, jsonb) from public, anon, authenticated;
revoke execute on function private.close_job_unchecked(uuid, text) from public, anon, authenticated;
revoke execute on function private.list_jobs_unchecked(boolean, text, integer) from public, anon, authenticated;
revoke execute on function private.apply_job_unchecked(uuid, text, numeric, text) from public, anon, authenticated;
revoke execute on function private.withdraw_application_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.answer_application_unchecked(uuid, text, text) from public, anon, authenticated;
revoke execute on function private.job_applications_on_join() from public, anon, authenticated;
revoke execute on function private.can_message(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.publish_job(uuid, jsonb) from public, anon;
revoke execute on function public.close_job(uuid, text) from public, anon;
revoke execute on function public.list_jobs(boolean, text, integer) from public, anon;
revoke execute on function public.apply_job(uuid, text, numeric, text) from public, anon;
revoke execute on function public.withdraw_application(uuid) from public, anon;
revoke execute on function public.answer_application(uuid, text, text) from public, anon;
grant execute on function public.publish_job(uuid, jsonb) to authenticated;
grant execute on function public.close_job(uuid, text) to authenticated;
grant execute on function public.list_jobs(boolean, text, integer) to authenticated;
grant execute on function public.apply_job(uuid, text, numeric, text) to authenticated;
grant execute on function public.withdraw_application(uuid) to authenticated;
grant execute on function public.answer_application(uuid, text, text) to authenticated;

-- ── Reading ───────────────────────────────────────────────────────────────────
-- A freelancer's own applications, with what they applied for
create or replace function private.my_job_applications_unchecked() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'status', a.status, 'day_rate', a.day_rate, 'currency', a.currency, 'created_at', a.created_at,
           'post', jsonb_build_object('id', j.id, 'title', j.title, 'org_name', o.name, 'starts_on', j.starts_on, 'ends_on', j.ends_on,
                                      'place', j.place, 'status', j.status), 'poster', j.created_by)
           order by a.created_at desc), '[]')
    from public.job_applications a
    join public.job_posts j on j.id = a.post_id
    join public.organisations o on o.id = j.org_id
   where a.user_id = auth.uid()
$$;
create or replace function public.my_job_applications() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.my_job_applications_unchecked();
end $$;

-- A post's applicants, for the organisation: the application and the person's crew profile as
-- they show it (even if they switched it off since, the name stays)
create or replace function private.job_applicants_unchecked(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select j.org_id into v_org from public.job_posts j where j.id = p_post;
  if v_org is null or not private.can_quote(v_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'user_id', a.user_id, 'status', a.status, 'message', a.message, 'day_rate', a.day_rate, 'currency', a.currency,
           'created_at', a.created_at, 'name', p.full_name,
           'profile', case when c.enabled then jsonb_build_object(
             'headline', c.headline, 'functions', c.functions, 'other_functions', c.other_functions, 'bio', c.bio,
             'base_place', c.base_place, 'base_country', c.base_country, 'travel_scope', c.travel_scope, 'travel_km', c.travel_km,
             'languages', c.languages, 'experience_years', c.experience_years, 'links', c.links, 'certificates', c.certificates) end)
           order by a.created_at), '[]')
    from public.job_applications a
    join public.profiles p on p.id = a.user_id
    left join public.crew_profiles c on c.user_id = a.user_id
   where a.post_id = p_post and a.status <> 'withdrawn');
end $$;
create or replace function public.job_applicants(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.job_applicants_unchecked(p_post);
end $$;

revoke execute on function private.my_job_applications_unchecked() from public, anon, authenticated;
revoke execute on function private.job_applicants_unchecked(uuid) from public, anon, authenticated;
revoke execute on function public.my_job_applications() from public, anon;
revoke execute on function public.job_applicants(uuid) from public, anon;
grant execute on function public.my_job_applications() to authenticated;
grant execute on function public.job_applicants(uuid) to authenticated;
