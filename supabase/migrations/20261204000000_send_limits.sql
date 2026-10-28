-- Send limits: a cap on the emails and push notifications the Edge Functions send, so a buggy
-- screen or a bad actor can't flood Brevo (and get the sending domain blocked).
--
-- Each function asks claim_send (as the user) or claim_system_send (service role) just before it
-- sends. Under the limits the send is recorded in send_log; over them it raises 54000, like the
-- message and search limits. Recipients are stored as a SHA-256 hash, never as an address.
--
-- Limits (rolling windows):
--   invite  per user 40/hour and 150/day; per organisation 300/day; same address 3/day
--   quote   per user 20/hour and 60/day;  per organisation 100/day; same address 5/day
--   digest  one per person per 20 hours
--   push    60/hour per person;  push_test 5/hour per person
--   all emails together (invite, quote, digest): send_settings.daily_email_cap per 24 hours
--   (250: under Brevo's free plan of 300 a day). After upgrading Brevo, raise it with
--   update public.send_settings set daily_email_cap = 5000;

create table if not exists public.send_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('invite', 'quote', 'digest', 'push', 'push_test')),
  user_id uuid not null references auth.users(id) on delete cascade, -- sender, or recipient for digest/push
  org_id uuid references public.organisations(id) on delete cascade,
  recipient_hash text check (recipient_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index if not exists send_log_user_idx on public.send_log (user_id, kind, created_at);
create index if not exists send_log_org_idx on public.send_log (org_id, kind, created_at);
create index if not exists send_log_recipient_idx on public.send_log (recipient_hash, kind, created_at);
create index if not exists send_log_created_idx on public.send_log (created_at);
-- No policies: only the functions below read or write it
alter table public.send_log enable row level security;

create table if not exists public.send_settings (
  id integer primary key default 1 check (id = 1),
  daily_email_cap integer not null default 250 check (daily_email_cap > 0)
);
insert into public.send_settings (id) values (1) on conflict (id) do nothing;
alter table public.send_settings enable row level security;

-- Counts, checks and records one send. p_user is the sender (invite, quote, push_test) or the
-- recipient (digest, push).
create or replace function private.claim_send_unchecked(p_kind text, p_user uuid, p_org uuid, p_recipient text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hash text := case when nullif(trim(coalesce(p_recipient, '')), '') is not null
                      then encode(sha256(convert_to(lower(trim(p_recipient)), 'UTF8')), 'hex') end;
  v_cap integer;
  v_limit text;
begin
  -- One claim at a time, so two sends at the same moment can't both slip under a limit
  perform pg_advisory_xact_lock(hashtext('public.send_log'));

  v_limit := case
    when p_kind = 'invite' and (select count(*) from public.send_log l where l.user_id = p_user and l.kind = 'invite' and l.created_at > now() - interval '1 hour') >= 40 then 'user_hour'
    when p_kind = 'invite' and (select count(*) from public.send_log l where l.user_id = p_user and l.kind = 'invite' and l.created_at > now() - interval '1 day') >= 150 then 'user_day'
    when p_kind = 'invite' and (select count(*) from public.send_log l where l.org_id = p_org and l.kind = 'invite' and l.created_at > now() - interval '1 day') >= 300 then 'org_day'
    when p_kind = 'invite' and (select count(*) from public.send_log l where l.recipient_hash = v_hash and l.kind = 'invite' and l.created_at > now() - interval '1 day') >= 3 then 'recipient_day'
    when p_kind = 'quote' and (select count(*) from public.send_log l where l.user_id = p_user and l.kind = 'quote' and l.created_at > now() - interval '1 hour') >= 20 then 'user_hour'
    when p_kind = 'quote' and (select count(*) from public.send_log l where l.user_id = p_user and l.kind = 'quote' and l.created_at > now() - interval '1 day') >= 60 then 'user_day'
    when p_kind = 'quote' and (select count(*) from public.send_log l where l.org_id = p_org and l.kind = 'quote' and l.created_at > now() - interval '1 day') >= 100 then 'org_day'
    when p_kind = 'quote' and (select count(*) from public.send_log l where l.recipient_hash = v_hash and l.kind = 'quote' and l.created_at > now() - interval '1 day') >= 5 then 'recipient_day'
    when p_kind = 'digest' and exists (select 1 from public.send_log l where l.user_id = p_user and l.kind = 'digest' and l.created_at > now() - interval '20 hours') then 'recipient_day'
    when p_kind = 'push' and (select count(*) from public.send_log l where l.user_id = p_user and l.kind = 'push' and l.created_at > now() - interval '1 hour') >= 60 then 'recipient_hour'
    when p_kind = 'push_test' and (select count(*) from public.send_log l where l.user_id = p_user and l.kind = 'push_test' and l.created_at > now() - interval '1 hour') >= 5 then 'user_hour'
  end;
  if v_limit is null and p_kind in ('invite', 'quote', 'digest') then
    select s.daily_email_cap into v_cap from public.send_settings s where s.id = 1;
    if (select count(*) from public.send_log l where l.kind in ('invite', 'quote', 'digest') and l.created_at > now() - interval '1 day') >= coalesce(v_cap, 250) then
      v_limit := 'project_day';
    end if;
  end if;
  if v_limit is not null then
    raise exception 'Send limit reached' using errcode = '54000', hint = v_limit;
  end if;

  insert into public.send_log (kind, user_id, org_id, recipient_hash) values (p_kind, p_user, p_org, v_hash);
  -- Keep a month: the longest window is a day
  delete from public.send_log l where l.created_at < now() - interval '30 days';
end $$;

-- From the app's functions, as the signed-in user: invites (to a gig or an organisation), quote
-- emails and test pushes. The caller must be able to send for that gig or organisation.
create or replace function public.claim_send(p_kind text, p_org uuid default null, p_gig uuid default null, p_recipient text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_org uuid := p_org;
begin
  if v_me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_kind = 'invite' then
    if p_gig is not null then
      if not private.can_manage_gig(p_gig) then raise exception 'Not allowed' using errcode = '42501'; end if;
      select g.org_id into v_org from public.gigs g where g.id = p_gig;
    elsif v_org is null or not private.is_org_admin(v_org) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  elsif p_kind = 'quote' then
    if v_org is null or not private.can_quote(v_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  elsif p_kind = 'push_test' then
    v_org := null;
  else
    raise exception 'Invalid kind' using errcode = '22023';
  end if;
  perform private.claim_send_unchecked(p_kind, v_me, v_org, p_recipient);
end $$;

-- From send-digest and send-push (service role): p_user is the person receiving it
create or replace function public.claim_system_send(p_kind text, p_user uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_kind not in ('digest', 'push') or p_user is null then raise exception 'Invalid kind' using errcode = '22023'; end if;
  perform private.claim_send_unchecked(p_kind, p_user, null, null);
end $$;

revoke execute on function private.claim_send_unchecked(text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_send(text, uuid, uuid, text) from public, anon;
grant execute on function public.claim_send(text, uuid, uuid, text) to authenticated;
revoke execute on function public.claim_system_send(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_system_send(text, uuid) to service_role;
