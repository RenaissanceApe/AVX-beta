-- ============================================================================================
--  TEST ONLY: NEVER RUN THIS ON PRODUCTION (otmulrlslecgyezpcqxy).
--  For the Supabase TEST project ("AVX test", idvebeadnrxudfgortzg) only.
-- ============================================================================================
--
-- What it is: a schema `test_support` with a few functions the signed-in browser tests
-- (e2e/auth/) call to do what a person can't do from the app in a test run: become an AVX admin,
-- make something expire now instead of in 60 days, and run the daily jobs for their own
-- organisation now instead of waiting for the night.
--
-- Who can use it: only a signed-in account whose email is e2e-…@example.com (the accounts the
-- tests create, e2e/auth/accounts.js). Everyone else gets "test_support: only e2e test accounts".
-- The functions only touch rows that belong to such accounts, or to organisations where the caller
-- is an admin and EVERY member is such an account. A real person's data is never touched, even if
-- a real person invites a test account into their company.
--
-- How to run it (once, and again whenever this file changes; it is safe to re-run):
--   1. Supabase → the TEST project → SQL editor → paste this whole file → Run.
--   2. Supabase → the TEST project → Project Settings → Data API → "Exposed schemas":
--      add `test_support` → Save. (The tests call it through the API like any other function.)
--   3. Check it: paste supabase/tests/test_support_check.sql into the same SQL editor → Run.
--      It must end with "ALL TEST SUPPORT CHECKS PASSED".
-- Until then, the tests that need it skip with "test_support not installed".
--
-- It has no delete, drop or truncate. The daily jobs below are copies of the real ones
-- (private.draft_recurring_expenses, private.remind_overdue_invoices, private.remind_held_invites,
-- private.send_maintenance_reminders) limited to one organisation; if a real job changes, change its
-- copy here too.
-- ============================================================================================

create schema if not exists test_support;
revoke all on schema test_support from public, anon;
grant usage on schema test_support to authenticated;

-- Is this user one of the accounts the tests create?
create or replace function test_support.is_e2e_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select lower(u.email) ~ '^e2e-[a-z0-9-]+@example\.com$' from auth.users u where u.id = p_user), false)
$$;

-- The caller must be a test account; returns their id
create or replace function test_support.require_e2e_caller() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not test_support.is_e2e_user(auth.uid()) then
    raise exception 'test_support: only e2e test accounts (e2e-…@example.com) may call this' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- The caller must be an admin of this organisation, and every member of it a test account
create or replace function test_support.require_e2e_org(p_org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := test_support.require_e2e_caller();
begin
  if not exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = v_me and m.role = 'admin') then
    raise exception 'test_support: you are not an admin of this organisation' using errcode = '42501';
  end if;
  if exists (select 1 from public.org_members m where m.org_id = p_org and not test_support.is_e2e_user(m.user_id)) then
    raise exception 'test_support: this organisation has members who are not e2e test accounts' using errcode = '42501';
  end if;
end $$;

-- The tests ask this first: it says the file is installed and which version
create or replace function test_support.installed() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform test_support.require_e2e_caller();
  return 'test_support v1';
end $$;

-- Make the caller an AVX admin (private.avx_admins). The row goes when the account is deleted
-- (on delete cascade), so the run's sweep removes it.
create or replace function test_support.make_me_avx_admin() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := test_support.require_e2e_caller();
begin
  insert into private.avx_admins (user_id) values (v_me) on conflict do nothing;
end $$;

-- Put one thing's expiry into the past (p_days ago, default 1).
--   held_invite              held_invites.expired_at        (p_id = the held invitation)
--   quote_share              quote_shares.expires_at        (p_id = the share)
--   report_link              report_links.expires_at        (p_id = the link)
--   certificate_proof        certificate_proofs.expires_on  (p_id = the proof)
--   certificate_confirmation certificate_confirmations.expires_on (p_id = the certificate id, cert_id)
--   inspection               inspections.done_on            (p_id = the inspection; moves it p_days back,
--                                                             so the next inspection falls due sooner)
-- A crew profile's own certificates (crew_profiles.certificates) need nothing here: their owner can
-- type a past expiry date in the app. Returns how many rows changed.
create or replace function test_support.expire(p_kind text, p_id uuid, p_days integer default 1) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_user uuid; v_n integer := 0;
begin
  perform test_support.require_e2e_caller();
  if p_days is null or p_days < 0 or p_days > 3650 then
    raise exception 'test_support: p_days must be between 0 and 3650' using errcode = '22023';
  end if;
  if p_kind = 'held_invite' then
    select org_id into v_org from public.held_invites where id = p_id;
    perform test_support.require_e2e_org(v_org);
    -- the same switch the daily job uses to change expired_at (private.held_invites_before)
    perform set_config('avx.held_upkeep', 'on', true);
    update public.held_invites set expired_at = now() - make_interval(days => p_days) where id = p_id;
    get diagnostics v_n = row_count;
    perform set_config('avx.held_upkeep', 'off', true);
  elsif p_kind = 'quote_share' then
    select org_id into v_org from public.quote_shares where id = p_id;
    perform test_support.require_e2e_org(v_org);
    update public.quote_shares set expires_at = now() - make_interval(days => p_days) where id = p_id;
    get diagnostics v_n = row_count;
  elsif p_kind = 'report_link' then
    select org_id into v_org from public.report_links where id = p_id;
    perform test_support.require_e2e_org(v_org);
    update public.report_links set expires_at = now() - make_interval(days => p_days) where id = p_id;
    get diagnostics v_n = row_count;
  elsif p_kind = 'certificate_proof' then
    select user_id into v_user from public.certificate_proofs where id = p_id;
    if not test_support.is_e2e_user(v_user) then
      raise exception 'test_support: that certificate does not belong to an e2e test account' using errcode = '42501';
    end if;
    update public.certificate_proofs set expires_on = current_date - p_days where id = p_id;
    get diagnostics v_n = row_count;
  elsif p_kind = 'certificate_confirmation' then
    update public.certificate_confirmations c set expires_on = current_date - p_days
     where c.cert_id = p_id and test_support.is_e2e_user(c.user_id)
       and exists (select 1 from public.org_members m where m.org_id = c.org_id and m.user_id = auth.uid() and m.role = 'admin')
       and not exists (select 1 from public.org_members m where m.org_id = c.org_id and not test_support.is_e2e_user(m.user_id));
    get diagnostics v_n = row_count;
  elsif p_kind = 'inspection' then
    select org_id into v_org from public.inspections where id = p_id;
    perform test_support.require_e2e_org(v_org);
    update public.inspections set done_on = done_on - p_days where id = p_id;
    get diagnostics v_n = row_count;
  else
    raise exception 'test_support: unknown kind % (held_invite, quote_share, report_link, certificate_proof, certificate_confirmation, inspection)', p_kind using errcode = '22023';
  end if;
  return v_n;
end $$;

-- Daily job, one organisation: draft the recurring expenses that are due
-- (copy of private.draft_recurring_expenses). Returns how many drafts it made.
create or replace function test_support.run_recurring_expenses(p_org uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_today date; v_made integer := 0; v_n integer; v_due date;
begin
  perform test_support.require_e2e_org(p_org);
  for r in select x.*, coalesce(o.time_zone, 'Europe/Lisbon') as tz
             from public.expense_recurrences x join public.organisations o on o.id = x.org_id
            where x.org_id = p_org and x.removed_at is null and x.next_on <= current_date + 1
            order by x.next_on for update of x loop
    v_today := (now() at time zone r.tz)::date;
    v_n := 0;
    v_due := r.next_on;
    while v_due <= v_today and (r.ends_on is null or v_due <= r.ends_on) and v_n < 24 loop
      insert into public.expenses (org_id, status, spent_on, due_on, supplier_id, supplier_name, description, category_id,
                                   amount_net, vat_rate, vat_amount, currency, paid_how, notes, recurrence_id, recurrence_due)
      values (r.org_id, 'draft', v_due, v_due, r.supplier_id, r.supplier_name, r.description, r.category_id,
              r.amount_net, r.vat_rate, round(r.amount_net * r.vat_rate / 100, 2), r.currency, r.paid_how, r.notes, r.id, v_due)
      on conflict do nothing;
      if found then v_made := v_made + 1; end if;
      v_n := v_n + 1;
      v_due := private.add_periods(r.starts_on, r.every, r.drafted + v_n);
    end loop;
    if v_n > 0 then
      update public.expense_recurrences set drafted = r.drafted + v_n, next_on = v_due where id = r.id;
    end if;
  end loop;
  if v_made > 0 then
    insert into public.notifications (user_id, org_id, kind, details)
    select m.user_id, p_org, 'expense_drafted', jsonb_build_object('count', v_made)
      from public.org_members m where m.org_id = p_org and m.role = 'admin';
  end if;
  return v_made;
end $$;

-- Daily job, one organisation: remind about overdue invoices (copy of private.remind_overdue_invoices,
-- without the "once every 6½ days" wait). Returns how many invoices it reminded about.
create or replace function test_support.run_overdue_invoice_reminders(p_org uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_n integer := 0;
begin
  perform test_support.require_e2e_org(p_org);
  for r in
    select i.id, i.org_id, i.legal_number, i.number, i.client_name, i.total, i.currency, i.due_date, q.created_by as quote_author,
           private.invoice_due(i.id) - private.invoice_paid(i.id) as left_to_pay
      from public.invoices i left join public.quotes q on q.id = i.quote_id
     where i.org_id = p_org and i.kind = 'invoice' and i.status = 'issued' and i.removed_at is null and i.due_date is not null
       and i.due_date < private.org_today(i.org_id)
       and private.invoice_due(i.id) - private.invoice_paid(i.id) > 0
     order by i.due_date limit 200
  loop
    insert into public.notifications (user_id, org_id, kind, details)
    select distinct u, r.org_id, 'invoice_overdue', jsonb_build_object(
             'invoice_id', r.id, 'number', coalesce(r.legal_number, r.number::text), 'client', r.client_name,
             'total', r.total, 'left', r.left_to_pay, 'currency', r.currency, 'due_date', r.due_date,
             'days', private.org_today(r.org_id) - r.due_date)
      from (select m.user_id as u from public.org_members m where m.org_id = r.org_id and m.role = 'admin'
            union
            select m.user_id from public.org_members m
             where m.org_id = r.org_id and m.user_id = r.quote_author and m.role in ('admin', 'member')) who;
    update public.invoices set last_reminded_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Daily job, one organisation: remind about held invitations and expire old ones
-- (copy of private.remind_held_invites, without the 14- and 60-day waits: every held invitation
-- not yet reminded counts as waiting; use expire('held_invite', …) to expire one).
create or replace function test_support.run_held_invite_reminders(p_org uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_ids uuid[]; v_name text;
begin
  perform test_support.require_e2e_org(p_org);
  select array_agg(h.id) into v_ids from public.held_invites h
   where h.org_id = p_org and h.status = 'held' and h.reminded_at is null and h.expired_at is null;
  if v_ids is null then return 0; end if;
  select name into v_name from public.organisations where id = p_org;
  perform set_config('avx.held_upkeep', 'on', true);
  insert into public.notifications (user_id, org_id, kind, details)
  select m.user_id, p_org, 'held_invites_waiting',
         jsonb_build_object('count', (select count(*) from public.held_invites h where h.org_id = p_org and h.status = 'held'),
                            'org_name', v_name)
    from public.org_members m where m.org_id = p_org and m.role = 'admin';
  update public.held_invites set reminded_at = now() where id = any (v_ids);
  perform set_config('avx.held_upkeep', 'off', true);
  return cardinality(v_ids);
end $$;

-- Daily job, one organisation: inspection reminders (copy of private.send_maintenance_reminders).
-- Returns how many new reminders it made.
create or replace function test_support.run_maintenance_reminders(p_org uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare n integer; v_name text;
begin
  perform test_support.require_e2e_org(p_org);
  select name into v_name from public.organisations where id = p_org;
  with fresh as (
    insert into public.maintenance_reminders (org_id, target, due_on)
    select p_org, coalesce(d.unit_id, d.item_id), d.due_on
      from private.maintenance_due_all(p_org) d
     where d.due_on <= private.org_today(p_org) + 14
    on conflict do nothing
    returning 1
  ) select count(*) into n from fresh;
  if n > 0 then
    insert into public.notifications (user_id, org_id, kind, details)
    select m.user_id, p_org, 'inspection_due', jsonb_build_object('count', n, 'org_name', v_name)
      from public.org_members m where m.org_id = p_org and m.role = 'admin';
  end if;
  return n;
end $$;

-- The morning email summary, one organisation: what the send-digest function would put in each
-- member's email, without sending anything. Like send-digest: unread, not yet emailed, from the
-- last 7 days and at least p_min_age old (send-digest waits 30 minutes; tests pass 0).
-- opted_out: the member switched the summary off. muted: they muted this organisation (send-digest
-- still sends direct kinds such as messages; muted is shown so a test can check either way).
create or replace function test_support.email_summary_candidates(p_org uuid, p_min_age interval default '0 minutes')
returns table(user_id uuid, kind text, notifications integer, opted_out boolean, muted boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform test_support.require_e2e_org(p_org);
  return query
    select n.user_id, n.kind, count(*)::integer,
           coalesce(p.email_digest = false, true),
           exists (select 1 from public.org_mutes mu where mu.user_id = n.user_id and mu.org_id = p_org)
      from public.notifications n
      join public.org_members m on m.org_id = p_org and m.user_id = n.user_id
      left join public.profiles p on p.id = n.user_id
     where (n.org_id = p_org or n.gig_id in (select g.id from public.gigs g where g.org_id = p_org))
       and n.read_at is null and n.emailed_at is null
       and n.created_at >= now() - interval '7 days' and n.created_at <= now() - p_min_age
     group by n.user_id, n.kind, p.email_digest
     order by 1, 2;
end $$;

-- Only signed-in accounts may call these, and each function checks the email itself
revoke execute on all functions in schema test_support from public, anon;
grant execute on function test_support.installed() to authenticated;
grant execute on function test_support.make_me_avx_admin() to authenticated;
grant execute on function test_support.expire(text, uuid, integer) to authenticated;
grant execute on function test_support.run_recurring_expenses(uuid) to authenticated;
grant execute on function test_support.run_overdue_invoice_reminders(uuid) to authenticated;
grant execute on function test_support.run_held_invite_reminders(uuid) to authenticated;
grant execute on function test_support.run_maintenance_reminders(uuid) to authenticated;
grant execute on function test_support.email_summary_candidates(uuid, interval) to authenticated;

notify pgrst, 'reload schema';
