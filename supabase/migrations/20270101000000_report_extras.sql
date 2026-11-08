-- K9 · Report extras (docs/ANALYTICS.md, "How K9 works"). Needs K1–K8.
-- 1. profiles.weekly_numbers: an admin's opt-in to the weekly key-numbers email (default off).
--    public.weekly_numbers_recipients, public.weekly_key_numbers and public.claim_weekly_numbers are
--    for the send-key-numbers Edge Function only (service role).
-- 2. report_views: saved views (a report tab with its filters), per person, pinned to the Overview.
-- 3. report_links: a read-only link for the accountant. Only the SHA-256 hash of the token is stored
--    (like quote links); it has an expiry and can be revoked. public.create_report_link and
--    public.revoke_report_link for admins; public.report_link_view for the report-link-public Edge
--    Function only (service role): revoked, expired or unknown links return null.
-- How numbers are counted without a signed-in reader (the weekly email, the accountant link): the
-- function checks the person (an admin who opted in; the admin who made the link and still is one)
-- and then runs the existing report functions as that person (private.report_claims_swap), so the
-- same rules and the same finance check apply. The claims are put back before it returns.
-- Checks in supabase/tests/report_extras.sql. Written without destructive statements.

-- ── 1. Weekly key-numbers email (opt-in) ─────────────────────────────────────
alter table public.profiles add column if not exists weekly_numbers boolean not null default false;

-- One weekly email per person per organisation per week; also counted against the project's daily
-- email cap (send_settings) together with send_log
create table if not exists public.report_email_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  week date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id, week)
);
create index if not exists report_email_log_created_idx on public.report_email_log (created_at);
-- No policies: only the functions below read or write it
alter table public.report_email_log enable row level security;
revoke all on public.report_email_log from anon, authenticated;

-- Swaps the request's claims for p_claims and returns the old ones (to put back with the same
-- function). Only called from the security definer functions below.
create or replace function private.report_claims_swap(p_claims text, p_sub text) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare v_old jsonb := jsonb_build_object('claims', coalesce(current_setting('request.jwt.claims', true), ''),
                                          'sub', coalesce(current_setting('request.jwt.claim.sub', true), ''));
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  return v_old;
end $$;
revoke execute on function private.report_claims_swap(text, text) from public, anon, authenticated;

create or replace function private.report_as(p_user uuid) returns jsonb
language sql volatile set search_path = '' as $$
  select private.report_claims_swap(json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text, p_user::text)
$$;
revoke execute on function private.report_as(uuid) from public, anon, authenticated;

create or replace function private.report_unswap(p_old jsonb) returns void
language plpgsql volatile set search_path = '' as $$
begin
  perform private.report_claims_swap(p_old ->> 'claims', p_old ->> 'sub');
end $$;
revoke execute on function private.report_unswap(jsonb) from public, anon, authenticated;

-- Every Overview number in one object (the answers of report_overview and the K4–K8 functions
-- merged, as useOverview merges them in the browser). Runs as the reader; each part checks finance.
create or replace function private.key_numbers(p_org uuid, p_at timestamptz default now()) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  return coalesce(public.report_overview(p_org, p_at), '{}'::jsonb)
      || coalesce(public.report_overview_k4(p_org, p_at), '{}'::jsonb)
      || coalesce(public.report_overview_k5(p_org, p_at), '{}'::jsonb)
      || coalesce(public.report_overview_k6(p_org, p_at), '{}'::jsonb)
      || coalesce(public.report_overview_k7(p_org, p_at), '{}'::jsonb)
      || coalesce(public.report_overview_k8(p_org, p_at), '{}'::jsonb);
end $$;
revoke execute on function private.key_numbers(uuid, timestamptz) from public, anon, authenticated;

-- Who gets the weekly email: admins who opted in, once per organisation they administer (not the
-- organisations they muted)
create or replace function public.weekly_numbers_recipients()
returns table(user_id uuid, org_id uuid, org_name text, language text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.org_id, o.name, coalesce(p.language, 'en')
    from public.org_members m
    join public.profiles p on p.id = m.user_id and p.weekly_numbers
    join public.organisations o on o.id = m.org_id
   where m.role = 'admin'
     and not exists (select 1 from public.org_mutes u where u.user_id = m.user_id and u.org_id = m.org_id)
   order by m.user_id, o.name
$$;
revoke execute on function public.weekly_numbers_recipients() from public, anon, authenticated;
grant execute on function public.weekly_numbers_recipients() to service_role;

-- The numbers for one weekly email, counted as that admin; null when they aren't an admin of the
-- organisation or haven't opted in
create or replace function public.weekly_key_numbers(p_org uuid, p_user uuid, p_at timestamptz default now()) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_old jsonb; v_out jsonb;
begin
  if p_org is null or p_user is null
     or not exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = p_user and m.role = 'admin')
     or not exists (select 1 from public.profiles p where p.id = p_user and p.weekly_numbers) then
    return null;
  end if;
  v_old := private.report_as(p_user);
  v_out := private.key_numbers(p_org, p_at);
  perform private.report_unswap(v_old);
  return v_out;
end $$;
revoke execute on function public.weekly_key_numbers(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.weekly_key_numbers(uuid, uuid, timestamptz) to service_role;

-- Records one weekly email just before it is sent: once per person, organisation and week, and under
-- the project's daily email cap. Over a limit it raises 54000, like claim_system_send.
create or replace function public.claim_weekly_numbers(p_user uuid, p_org uuid, p_week date)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_cap integer;
begin
  if p_user is null or p_org is null or p_week is null then raise exception 'Invalid' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('public.send_log'));
  if exists (select 1 from public.report_email_log l where l.user_id = p_user and l.org_id = p_org and l.week = p_week) then
    raise exception 'Send limit reached' using errcode = '54000', hint = 'week';
  end if;
  select s.daily_email_cap into v_cap from public.send_settings s where s.id = 1;
  if (select count(*) from public.send_log l where l.kind in ('invite', 'quote', 'digest') and l.created_at > now() - interval '1 day')
     + (select count(*) from public.report_email_log l where l.created_at > now() - interval '1 day') >= coalesce(v_cap, 250) then
    raise exception 'Send limit reached' using errcode = '54000', hint = 'project_day';
  end if;
  insert into public.report_email_log (user_id, org_id, week) values (p_user, p_org, p_week);
end $$;
revoke execute on function public.claim_weekly_numbers(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.claim_weekly_numbers(uuid, uuid, date) to service_role;

-- ── 2. Saved views ───────────────────────────────────────────────────────────
-- A report tab and its URL filters (e.g. "period=this_year&view=cash"), saved by one person for one
-- organisation. Only that person sees it, and only while they may see the organisation's money.
-- Removed by marking (removed_at).
create table if not exists public.report_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  tab text not null check (tab ~ '^[a-z_]{1,30}$'),
  query text not null default '' check (char_length(query) <= 1000 and query !~ '[\s#]'),
  pinned boolean not null default true,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists report_views_user_idx on public.report_views (user_id, org_id, created_at) where removed_at is null;
alter table public.report_views enable row level security;

create policy report_views_select on public.report_views for select to authenticated
  using (user_id = (select auth.uid()) and private.can_see_finance(org_id));
create policy report_views_insert on public.report_views for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_see_finance(org_id) and removed_at is null);
create policy report_views_update on public.report_views for update to authenticated
  using (user_id = (select auth.uid()) and private.can_see_finance(org_id))
  with check (user_id = (select auth.uid()) and private.can_see_finance(org_id));
create policy mfa_required on public.report_views as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.report_views from anon, authenticated;
grant select on public.report_views to authenticated;
grant insert (org_id, name, tab, query, pinned) on public.report_views to authenticated;
grant update (name, pinned, removed_at) on public.report_views to authenticated;

-- At most 50 live views per person and organisation
create or replace function private.report_views_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  new.created_at := now();
  if (select count(*) from public.report_views v where v.user_id = new.user_id and v.org_id = new.org_id and v.removed_at is null) >= 50 then
    raise exception 'Too many saved views' using errcode = '54000';
  end if;
  return new;
end $$;
revoke execute on function private.report_views_before_insert() from public, anon, authenticated;
create or replace trigger report_views_before_insert before insert on public.report_views
  for each row execute function private.report_views_before_insert();

-- ── 3. Read-only link for the accountant ─────────────────────────────────────
create table if not exists public.report_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null check (char_length(trim(label)) between 1 and 80),
  period_from date not null,
  period_until date not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  last_viewed_at timestamptz,
  views integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_until > period_from and period_until - period_from <= 731)
);
create index if not exists report_links_org_idx on public.report_links (org_id, created_at desc);
alter table public.report_links enable row level security;

-- Admins see their organisation's links (never the hash); they are made and revoked through the
-- functions below
create policy report_links_select on public.report_links for select to authenticated
  using (private.is_org_admin(org_id));
create policy mfa_required on public.report_links as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.report_links from anon, authenticated;
grant select (id, org_id, label, period_from, period_until, expires_at, revoked_at, last_viewed_at, views, created_by, created_at)
  on public.report_links to authenticated;

-- Makes a link and returns its token once (only the hash is kept). Admins only, after the second
-- sign-in step when they have one. Expiry 1–180 days; a period of at most two years; 20 live links
-- per organisation.
create or replace function public.create_report_link(p_org uuid, p_label text, p_from date, p_until date, p_days integer default 30)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_token text; v_id uuid; v_expires timestamptz;
begin
  if p_org is null or not private.is_org_admin(p_org) or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_until is null or p_until <= p_from or p_until - p_from > 731 then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > 180 then raise exception 'Bad expiry' using errcode = '22023'; end if;
  if nullif(trim(coalesce(p_label, '')), '') is null or char_length(trim(p_label)) > 80 then
    raise exception 'Bad label' using errcode = '22023';
  end if;
  if (select count(*) from public.report_links l where l.org_id = p_org and l.revoked_at is null and l.expires_at > now()) >= 20 then
    raise exception 'Too many links' using errcode = '54000';
  end if;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=');
  v_expires := now() + make_interval(days => p_days);
  insert into public.report_links (org_id, token_hash, label, period_from, period_until, expires_at, created_by)
  values (p_org, encode(extensions.digest(v_token, 'sha256'), 'hex'), trim(p_label), p_from, p_until, v_expires, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end $$;
revoke execute on function public.create_report_link(uuid, text, date, date, integer) from public, anon;
grant execute on function public.create_report_link(uuid, text, date, date, integer) to authenticated;

create or replace function public.revoke_report_link(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid;
begin
  select l.org_id into v_org from public.report_links l where l.id = p_id;
  if v_org is null or not private.is_org_admin(v_org) or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.report_links set revoked_at = now(), revoked_by = auth.uid() where id = p_id and revoked_at is null;
end $$;
revoke execute on function public.revoke_report_link(uuid) from public, anon;
grant execute on function public.revoke_report_link(uuid) to authenticated;

-- What the accountant's page shows, looked up by the token's hash. Null when the link is unknown,
-- revoked or expired, or when the admin who made it is no longer an admin. Counted as that admin:
-- results by month and in total (finance_results), invoiced, credited, received and paid out by
-- month (cash_report) and spending by category, all for the link's period. No per-person rows.
create or replace function public.report_link_view(p_hash text, p_at timestamptz default now()) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.report_links; v_old jsonb; v_out jsonb;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into l from public.report_links r where r.token_hash = p_hash;
  if l.id is null or l.revoked_at is not null or l.expires_at <= p_at or l.created_by is null
     or not exists (select 1 from public.org_members m where m.org_id = l.org_id and m.user_id = l.created_by and m.role = 'admin') then
    return null;
  end if;
  update public.report_links set last_viewed_at = p_at, views = views + 1 where id = l.id;

  v_old := private.report_as(l.created_by);
  select jsonb_build_object(
    'org', (select jsonb_build_object('name', o.name, 'legal_name', o.legal_name) from public.organisations o where o.id = l.org_id),
    'label', l.label, 'from', l.period_from, 'until', l.period_until, 'expires_at', l.expires_at, 'at', p_at,
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', f.group_key, 'currency', f.currency, 'revenue', f.revenue,
                          'direct_costs', f.direct_costs, 'gross_margin', f.gross_margin, 'overheads', f.overheads,
                          'depreciation', f.depreciation, 'operating_result', f.operating_result, 'estimated', f.estimated)
                          order by f.group_key, f.currency)
                        from public.finance_results(l.org_id, l.period_from, l.period_until, 'month') f), '[]'::jsonb),
    'total', coalesce((select jsonb_agg(jsonb_build_object('currency', f.currency, 'revenue', f.revenue,
                          'direct_costs', f.direct_costs, 'gross_margin', f.gross_margin, 'margin_pct', f.margin_pct,
                          'overheads', f.overheads, 'depreciation', f.depreciation, 'operating_result', f.operating_result,
                          'estimated', f.estimated) order by f.currency)
                        from public.finance_results(l.org_id, l.period_from, l.period_until, 'total') f), '[]'::jsonb),
    'cash', coalesce((select jsonb_agg(jsonb_build_object('section', c.section, 'month', c.month, 'currency', c.currency, 'amount', c.amount)
                          order by c.section, c.month, c.currency)
                        from (select x.section, x.month, x.currency, sum(x.amount) as amount
                                from public.cash_report(l.org_id, l.period_from, l.period_until, 1, p_at) x
                               where x.section in ('invoiced', 'credited', 'received', 'paid_out')
                               group by x.section, x.month, x.currency) c), '[]'::jsonb),
    'spending', coalesce((select jsonb_agg(jsonb_build_object('category', s.group_label, 'starter_key', s.starter_key,
                          'currency', s.currency, 'amount', s.amount) order by s.amount desc)
                        from public.spending(l.org_id, l.period_from, l.period_until, 'category') s), '[]'::jsonb)
  ) into v_out;
  perform private.report_unswap(v_old);
  return v_out;
end $$;
revoke execute on function public.report_link_view(text, timestamptz) from public, anon, authenticated;
grant execute on function public.report_link_view(text, timestamptz) to service_role;
