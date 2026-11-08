-- K8 · Crew numbers (docs/ANALYTICS.md, "How K8 works"). Only adds: one table, functions and a
-- trigger. Checks in supabase/tests/crew_numbers.sql (no destructive statements).
--
-- - crew_fee_received: the person marks their own fee received (decided with the owner, 2026-11-08)
-- - private.my_gig_rows: one row per gig the caller is on, their own numbers only
-- - my_gig_numbers / my_monthly_summary / my_crew_activity: My work → My numbers and the year
--   statement; step 27 ("recibo verde") reuses my_monthly_summary
-- - mark_crew_fee_paid: the labour panel's "Mark paid" records or updates the linked expense (9b)
-- - expenses_fee_paid trigger: a crew fee's expense getting a paid date notifies the person
-- - crew_to_pay and report_overview_k8: the organisation's crew-to-pay list and K3's tile

-- ── Received marks ───────────────────────────────────────────────────────────
create table if not exists public.crew_fee_received (
  gig_id uuid not null references public.gigs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  received_at timestamptz, -- empty: marked, then unmarked (the row stays)
  primary key (gig_id, user_id)
);
alter table public.crew_fee_received enable row level security;
-- The person, and the gig's managers (so the labour panel can show "received"). Written only
-- through mark_fee_received.
create policy crew_fee_received_select on public.crew_fee_received for select to authenticated
  using (user_id = (select auth.uid()) or private.can_manage_gig(gig_id));
create policy mfa_required on public.crew_fee_received as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.crew_fee_received from anon, authenticated;
grant select on public.crew_fee_received to authenticated;

-- ── The caller's own gigs ────────────────────────────────────────────────────
-- Report date: the gig's start date (K1). Booked days: the person's booking, else the gig's dates
-- (as private.gig_labour_hours). Earned: approved days' stored cost plus a fixed fee once; with no
-- approved days, the agreed fee once the gig is over. Upcoming: the agreed fee of a gig not over.
-- Paid: the date on the live confirmed expense linked to the fee. Draft and cancelled gigs are left out.
create or replace function private.my_gig_rows(p_user uuid)
returns table(gig_id uuid, gig_name text, org_id uuid, org_name text, start_date date, end_date date, gig_status text,
              role text, function_title text, days numeric, fee_unit text, fee_rate numeric, fee_quantity numeric,
              fee_total numeric, hours_approved numeric, hours_waiting numeric, overtime_hours numeric, approved_cost numeric,
              km numeric, travel_minutes numeric, earned numeric, upcoming numeric, finished boolean,
              paid_on date, received_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with m as (
    select gm.gig_id, gm.role, gm.function_title, g.name, g.org_id, o.name as org_name, g.start_date, g.end_date, g.status,
           coalesce((gm.booked_from at time zone 'UTC')::date, g.start_date) as d_from,
           coalesce((gm.booked_until at time zone 'UTC')::date, g.end_date, g.start_date) as d_until,
           (now() at time zone coalesce(o.time_zone, 'Europe/Lisbon'))::date as today
    from public.gig_members gm
    join public.gigs g on g.id = gm.gig_id
    left join public.organisations o on o.id = g.org_id
    where gm.user_id = p_user and coalesce(g.status, '') not in ('draft', 'cancelled')
  ), t as (
    select te.gig_id,
           sum(case when te.status = 'approved' then coalesce((te.split ->> 'worked')::numeric, 0) else 0 end) as h_ok,
           sum(case when te.status = 'submitted' then greatest(0,
                 (extract(epoch from (te.end_time - te.start_time)) / 60
                  + case when te.end_time <= te.start_time then 1440 else 0 end - te.break_minutes) / 60.0) else 0 end) as h_wait,
           sum(case when te.status = 'approved' then coalesce((te.split ->> 'overtime')::numeric, 0) else 0 end) as h_ot,
           sum(case when te.status = 'approved' then coalesce(te.cost, 0) else 0 end) as cost,
           count(*) filter (where te.status = 'approved') as n_ok,
           sum(case when te.status <> 'returned' then te.km else 0 end) as km,
           sum(case when te.status <> 'returned' then te.travel_minutes else 0 end) as travel
    from public.time_entries te
    where te.user_id = p_user and te.removed_at is null
    group by te.gig_id
  ), x as (
    select m.*, f.unit, f.rate, f.quantity,
           case when f.rate is null then null when f.unit = 'fixed' then f.rate else round(f.rate * f.quantity, 2) end as fee_total,
           coalesce(t.h_ok, 0) as h_ok, coalesce(t.h_wait, 0) as h_wait, coalesce(t.h_ot, 0) as h_ot,
           coalesce(t.cost, 0) as cost, coalesce(t.n_ok, 0) as n_ok, coalesce(t.km, 0) as km, coalesce(t.travel, 0) as travel,
           coalesce(m.end_date, m.start_date) < m.today as finished
    from m
    left join public.gig_crew_fees f on f.gig_id = m.gig_id and f.user_id = p_user
    left join t on t.gig_id = m.gig_id
  )
  select x.gig_id, x.name, x.org_id, x.org_name, x.start_date, x.end_date, x.status, x.role, x.function_title,
         case when x.d_from is null then 0
              else least(366, greatest(coalesce(x.d_until, x.d_from), x.d_from) - x.d_from + 1) end::numeric,
         x.unit, x.rate, x.quantity, x.fee_total,
         round(x.h_ok, 2), round(x.h_wait, 2), round(x.h_ot, 2), round(x.cost, 2), x.km, x.travel,
         case when x.n_ok > 0 then round(x.cost + case when x.unit = 'fixed' and x.rate is not null then x.rate else 0 end, 2)
              when x.finished then x.fee_total end,
         case when not x.finished and x.n_ok = 0 then x.fee_total end,
         x.finished,
         (select e.paid_on from public.expenses e
           where e.gig_id = x.gig_id and e.crew_fee_user_id = p_user and e.removed_at is null and e.status = 'confirmed'
           order by e.created_at desc limit 1),
         (select r.received_at from public.crew_fee_received r where r.gig_id = x.gig_id and r.user_id = p_user)
  from x
$$;
revoke execute on function private.my_gig_rows(uuid) from public, anon, authenticated;

-- My numbers, per gig. Only the caller's own rows; the company only by name.
create or replace function public.my_gig_numbers(p_from date default null, p_until date default null, p_gig uuid default null)
returns table(gig_id uuid, gig_name text, org_id uuid, org_name text, start_date date, end_date date, gig_status text,
              role text, function_title text, days numeric, fee_unit text, fee_rate numeric, fee_quantity numeric,
              fee_total numeric, hours_approved numeric, hours_waiting numeric, overtime_hours numeric, approved_cost numeric,
              km numeric, travel_minutes numeric, earned numeric, upcoming numeric, finished boolean,
              paid_on date, received_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  if auth.uid() is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query select r.* from private.my_gig_rows(auth.uid()) r
    where (p_gig is null or r.gig_id = p_gig)
      and (p_from is null or r.start_date >= p_from)
      and (p_until is null or r.start_date < p_until)
    order by r.start_date nulls last, r.gig_name;
end $$;
revoke execute on function public.my_gig_numbers(date, date, uuid) from public, anon;
grant execute on function public.my_gig_numbers(date, date, uuid) to authenticated;

-- The monthly summary per company: what the year statement shows and what step 27 reuses for the
-- "recibo verde". One row per company and month (the gig's start date). `paid` adds the earned
-- amount of gigs whose fee is marked paid; `reimbursements` approved claims paid back (by paid date
-- would need the organisation's amount, so it is the claim's total, by the claim's date).
create or replace function public.my_monthly_summary(p_from date, p_until date, p_org uuid default null)
returns table(org_id uuid, org_name text, month date, gigs integer, days numeric, hours_approved numeric,
              hours_waiting numeric, overtime_hours numeric, earned numeric, paid numeric, km numeric,
              travel_minutes numeric, reimbursements numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  if auth.uid() is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_from is null or p_until is null or p_until <= p_from or p_until > p_from + 3700 then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  return query
  with g as (
    select r.* from private.my_gig_rows(auth.uid()) r
    where r.start_date >= p_from and r.start_date < p_until and (p_org is null or r.org_id = p_org)
  ), c as (
    select e.org_id, date_trunc('month', e.spent_on)::date as month, sum(e.total) as total
    from public.expenses e
    where e.claimed_by = auth.uid() and e.status = 'confirmed' and e.removed_at is null
      and e.spent_on >= p_from and e.spent_on < p_until and (p_org is null or e.org_id = p_org)
    group by 1, 2
  ), gm as (
    select g.org_id, max(g.org_name) as org_name, date_trunc('month', g.start_date)::date as month,
           count(*)::integer as gigs, sum(g.days) as days, sum(g.hours_approved) as h_ok, sum(g.hours_waiting) as h_wait,
           sum(g.overtime_hours) as h_ot, sum(coalesce(g.earned, 0)) as earned,
           sum(case when g.paid_on is not null then coalesce(g.earned, 0) else 0 end) as paid,
           sum(g.km) as km, sum(g.travel_minutes) as travel
    from g group by 1, 3
  )
  select coalesce(gm.org_id, c.org_id), coalesce(gm.org_name, (select n.name from private.my_gig_companies_unchecked() n where n.org_id = c.org_id)),
         coalesce(gm.month, c.month), coalesce(gm.gigs, 0), coalesce(gm.days, 0), coalesce(gm.h_ok, 0), coalesce(gm.h_wait, 0),
         coalesce(gm.h_ot, 0), coalesce(gm.earned, 0), coalesce(gm.paid, 0), coalesce(gm.km, 0), coalesce(gm.travel, 0),
         coalesce(c.total, 0)
  from gm full join c on c.org_id = gm.org_id and c.month = gm.month
  order by 3, 2;
end $$;
revoke execute on function public.my_monthly_summary(date, date, uuid) from public, anon;
grant execute on function public.my_monthly_summary(date, date, uuid) to authenticated;

-- Job posts applied to and crew calls answered, in [from, until) (when applied / when called),
-- plus the reimbursements still owed to the caller (approved claims with no paid date).
create or replace function public.my_crew_activity(p_from date, p_until date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  perform private.require_mfa();
  if v_me is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'applications', (select jsonb_build_object(
        'total', count(*),
        'shortlisted', count(*) filter (where a.status in ('shortlisted', 'offered', 'accepted')),
        'offered', count(*) filter (where a.status in ('offered', 'accepted')),
        'accepted', count(*) filter (where a.status = 'accepted'))
      from public.job_applications a
      where a.user_id = v_me and a.created_at >= p_from and a.created_at < p_until),
    'calls', (select jsonb_build_object(
        'total', count(*),
        'answered', count(*) filter (where ca.answered_at is not null and ca.answer in ('accepted', 'declined')),
        'accepted', count(*) filter (where ca.answer = 'accepted'))
      from public.crew_call_answers ca join public.crew_calls cc on cc.id = ca.call_id
      where ca.user_id = v_me and cc.created_at >= p_from and cc.created_at < p_until),
    'reimbursements_owed', coalesce((select jsonb_object_agg(t.currency, t.s) from
        (select e.currency, sum(e.total) as s from public.expenses e
          where e.claimed_by = v_me and e.status = 'confirmed' and e.removed_at is null and e.paid_on is null
          group by 1) t), '{}'::jsonb),
    'reimbursements_count', (select count(*) from public.expenses e
          where e.claimed_by = v_me and e.status = 'confirmed' and e.removed_at is null and e.paid_on is null)
  );
end $$;
revoke execute on function public.my_crew_activity(date, date) from public, anon;
grant execute on function public.my_crew_activity(date, date) to authenticated;

-- The person marks their own fee received (or not). Only once it is marked paid.
create or replace function public.mark_fee_received(p_gig uuid, p_received boolean default true)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  perform private.require_mfa();
  if v_me is null or not exists (select 1 from public.gig_members gm where gm.gig_id = p_gig and gm.user_id = v_me) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not p_received then
    update public.crew_fee_received set received_at = null
     where gig_id = p_gig and user_id = v_me and received_at is not null;
    return case when found then 'unmarked' else 'already' end;
  end if;
  if not exists (select 1 from public.expenses e where e.gig_id = p_gig and e.crew_fee_user_id = v_me
                   and e.removed_at is null and e.status = 'confirmed' and e.paid_on is not null) then
    raise exception 'Not marked paid yet' using errcode = '22023';
  end if;
  if exists (select 1 from public.crew_fee_received r where r.gig_id = p_gig and r.user_id = v_me and r.received_at is not null) then
    return 'already';
  end if;
  insert into public.crew_fee_received (gig_id, user_id, received_at) values (p_gig, v_me, now())
  on conflict (gig_id, user_id) do update set received_at = now();
  return 'received';
end $$;
revoke execute on function public.mark_fee_received(uuid, boolean) from public, anon;
grant execute on function public.mark_fee_received(uuid, boolean) to authenticated;

-- ── Fee paid (the labour panel) ──────────────────────────────────────────────
-- Those who see the organisation's money (admins and members, D23) mark a person's agreed fee paid:
-- the live expense linked to the fee (9b) gets the paid date (a draft is confirmed); with none, one is
-- recorded (amount and VAT from the app, the starter "freelance crew" category when there is one).
-- p_paid_on empty takes the paid date off again. The trigger below notifies the person.
create or replace function public.mark_crew_fee_paid(p_gig uuid, p_user uuid, p_paid_on date,
  p_paid_how text default 'transfer', p_amount_net numeric default null, p_vat_rate numeric default 0,
  p_description text default null)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_fee public.gig_crew_fees; v_e public.expenses; v_cat uuid; v_amount numeric; v_how text;
begin
  select g.org_id into v_org from public.gigs g where g.id = p_gig;
  perform private.require_finance(v_org);
  select * into v_fee from public.gig_crew_fees f where f.gig_id = p_gig and f.user_id = p_user;
  if not found then raise exception 'No fee agreed with this person' using errcode = '22023'; end if;
  v_how := coalesce(p_paid_how, 'transfer');
  if v_how not in ('transfer', 'card', 'cash', 'direct_debit', 'other') then raise exception 'Bad payment method' using errcode = '22023'; end if;
  if p_paid_on is not null and (p_paid_on > private.org_today(v_org) + 1 or p_paid_on < date '2000-01-01') then
    raise exception 'Bad date' using errcode = '22023';
  end if;
  select * into v_e from public.expenses e
   where e.gig_id = p_gig and e.crew_fee_user_id = p_user and e.removed_at is null
   order by e.created_at desc limit 1 for update;
  if found then
    if p_paid_on is null then
      if v_e.paid_on is null then return 'already'; end if;
      update public.expenses set paid_on = null, paid_how = null, updated_at = clock_timestamp() where id = v_e.id;
      return 'unpaid';
    end if;
    if v_e.paid_on is not null and v_e.status = 'confirmed' then return 'already'; end if;
    update public.expenses set paid_on = p_paid_on, paid_how = v_how, status = 'confirmed', updated_at = clock_timestamp()
     where id = v_e.id;
    return 'paid';
  end if;
  if p_paid_on is null then return 'already'; end if;
  v_amount := coalesce(p_amount_net, case when v_fee.unit = 'fixed' then v_fee.rate else round(v_fee.rate * v_fee.quantity, 2) end);
  if v_amount is null or v_amount < 0 or v_amount > 1000000 then raise exception 'Bad amount' using errcode = '22023'; end if;
  if p_vat_rate is null or p_vat_rate < 0 or p_vat_rate > 100 then raise exception 'Bad VAT rate' using errcode = '22023'; end if;
  select c.id into v_cat from public.expense_categories c
   where c.org_id = v_org and c.starter_key = 'freelance_crew' and c.archived_at is null limit 1;
  insert into public.expenses (org_id, status, spent_on, description, category_id, amount_net, vat_rate, vat_amount, currency,
                               paid_on, paid_how, gig_id, crew_fee_user_id, created_by)
  values (v_org, 'confirmed', p_paid_on,
          left(coalesce(nullif(trim(p_description), ''), 'Crew fee'), 300), v_cat, v_amount, p_vat_rate,
          round(v_amount * p_vat_rate / 100, 2), 'EUR', p_paid_on, v_how, p_gig, p_user, auth.uid());
  return 'paid';
end $$;
revoke execute on function public.mark_crew_fee_paid(uuid, uuid, date, text, numeric, numeric, text) from public, anon;
grant execute on function public.mark_crew_fee_paid(uuid, uuid, date, text, numeric, numeric, text) to authenticated;

-- Whichever way a crew fee's expense gets its paid date (the labour panel, Expenses), the person
-- is told, with only the gig and the date. Not when they set it themselves.
create or replace function private.expenses_fee_paid() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_gig text;
begin
  if new.crew_fee_user_id is null or new.paid_on is null or new.status <> 'confirmed' or new.removed_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.paid_on is not null and old.status = 'confirmed' and old.removed_at is null
     and old.crew_fee_user_id is not distinct from new.crew_fee_user_id then return new; end if;
  if new.crew_fee_user_id = auth.uid() then return new; end if;
  select g.name into v_gig from public.gigs g where g.id = new.gig_id;
  insert into public.notifications (user_id, org_id, actor_id, kind, details)
  values (new.crew_fee_user_id, new.org_id, auth.uid(), 'fee_paid',
          jsonb_build_object('gig_id', new.gig_id, 'gig_name', v_gig, 'paid_on', new.paid_on));
  return new;
end $$;
revoke execute on function private.expenses_fee_paid() from public, anon, authenticated;
create or replace trigger expenses_fee_paid after insert or update of paid_on, status, removed_at, crew_fee_user_id on public.expenses
  for each row execute function private.expenses_fee_paid();

-- ── Crew to pay (the organisation) ───────────────────────────────────────────
-- Agreed fees on gigs that are over and not marked paid. Amount: the linked expense's total (with
-- VAT, what leaves the bank) when there is one, else the agreed fee (`estimated`, no VAT known).
-- Per-person money: organisation admins see every row, members only the gigs they manage (the
-- Definitions: one person's cost is for admins by default). Draft and cancelled gigs left out.
create or replace function private.crew_to_pay_rows(p_org uuid, p_today date)
returns table(gig_id uuid, gig_name text, start_date date, end_date date, user_id uuid, function_title text,
              fee_unit text, fee_rate numeric, fee_quantity numeric, fee_total numeric, expense_id uuid,
              expense_status text, due_on date, amount numeric, currency text, estimated boolean, days_waiting integer)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.start_date, g.end_date, f.user_id, gm.function_title, f.unit, f.rate, f.quantity,
         case when f.unit = 'fixed' then f.rate else round(f.rate * f.quantity, 2) end,
         e.id, e.status, e.due_on,
         coalesce(e.total, case when f.unit = 'fixed' then f.rate else round(f.rate * f.quantity, 2) end),
         coalesce(e.currency, 'EUR'), e.id is null,
         (p_today - coalesce(g.end_date, g.start_date))::integer
  from public.gig_crew_fees f
  join public.gigs g on g.id = f.gig_id
  left join public.gig_members gm on gm.gig_id = f.gig_id and gm.user_id = f.user_id
  left join lateral (
    select x.id, x.status, x.due_on, x.total, x.currency, x.paid_on from public.expenses x
     where x.gig_id = f.gig_id and x.crew_fee_user_id = f.user_id and x.removed_at is null
     order by x.created_at desc limit 1) e on true
  where g.org_id = p_org and f.rate is not null and coalesce(g.status, '') not in ('draft', 'cancelled')
    and coalesce(g.end_date, g.start_date) < p_today
    and (e.id is null or e.paid_on is null or e.status <> 'confirmed')
$$;
revoke execute on function private.crew_to_pay_rows(uuid, date) from public, anon, authenticated;

create or replace function public.crew_to_pay(p_org uuid, p_at timestamptz default now())
returns table(gig_id uuid, gig_name text, start_date date, end_date date, user_id uuid, person_name text, function_title text,
              fee_unit text, fee_rate numeric, fee_quantity numeric, fee_total numeric, expense_id uuid,
              expense_status text, due_on date, amount numeric, currency text, estimated boolean, days_waiting integer)
language plpgsql stable security definer set search_path = '' as $$
declare v_admin boolean;
begin
  perform private.require_finance(p_org);
  v_admin := private.is_org_admin(p_org);
  return query
  select r.gig_id, r.gig_name, r.start_date, r.end_date, r.user_id, p.full_name, r.function_title, r.fee_unit, r.fee_rate,
         r.fee_quantity, r.fee_total, r.expense_id, r.expense_status, r.due_on, r.amount, r.currency, r.estimated, r.days_waiting
  from private.crew_to_pay_rows(p_org, private.org_today(p_org, p_at)) r
  left join public.profiles p on p.id = r.user_id
  where v_admin or private.can_manage_gig(r.gig_id)
  order by r.days_waiting desc, r.gig_name, p.full_name;
end $$;
revoke execute on function public.crew_to_pay(uuid, timestamptz) from public, anon;
grant execute on function public.crew_to_pay(uuid, timestamptz) to authenticated;

-- K3's tile: crew fees to pay, totals only (per currency) and how many, for everyone who sees money.
-- A function of its own beside report_overview; the Overview reads both and merges them.
create or replace function public.report_overview_k8(p_org uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb;
begin
  perform private.require_finance(p_org);
  with r as (select * from private.crew_to_pay_rows(p_org, private.org_today(p_org, p_at)))
  select jsonb_build_object(
           'crew_to_pay', coalesce((select jsonb_object_agg(t.currency, t.s) from
               (select r.currency, sum(r.amount) as s from r group by 1) t), '{}'::jsonb),
           'crew_to_pay_count', (select count(*) from r),
           'crew_to_pay_estimated', (select count(*) from r where r.estimated))
    into v_out;
  return v_out;
end $$;
revoke execute on function public.report_overview_k8(uuid, timestamptz) from public, anon;
grant execute on function public.report_overview_k8(uuid, timestamptz) to authenticated;
