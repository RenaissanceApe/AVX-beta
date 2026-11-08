-- K7: operations and people (docs/ANALYTICS.md, "How K7 works"). Needs part 1
-- (20261229000000_gig_cancelled_status.sql, applied by hand) first.
-- - The "cancelled" gig status: no reservations, not busy, not a clash (like archived).
-- - gigs.wrapup_notes: what went well and what to change, written on the gig's wrap-up page.
-- - Reports → Operations: ops_activity, ops_people, ops_staffing, ops_tasks (admins and members;
--   per-person rows for admins only), ops_person (the person page, admins only), gig_wrapup (the
--   gig's managers and the organisation's admins and members), report_overview_k7 (four tiles).
-- The report functions run as their owner (security definer) because hours and fees are readable
-- only by a gig's managers; like private.gig_labour (step 10) they check who is asking first and
-- hand members totals only. Every one checks the second sign-in step.
-- Only adds: create or replace, if not exists. No destructive statements.

-- ── Cancelled gigs hold nothing ──────────────────────────────────────────────
create or replace function private.gig_reservation_status(p_status text) returns text
language sql immutable set search_path = '' as $$
  select case p_status when 'draft' then 'hold' when 'archived' then 'cancelled' when 'cancelled' then 'cancelled' else 'confirmed' end
$$;

create or replace function private.person_conflicts(p_gig uuid, p_user uuid)
returns table (kind text, start_date date, end_date date, label text)
language sql stable security definer set search_path = public, private as $$
  with g as (select start_date, coalesce(end_date, start_date) as end_date from gigs where id = p_gig and start_date is not null)
  select 'unavailable', u.start_date, u.end_date, null::text
    from crew_unavailability u, g
   where u.user_id = p_user and u.status = 'approved' and u.removed_at is null
     and u.start_date <= g.end_date and u.end_date >= g.start_date
  union all
  select 'booked', o.start_date, coalesce(o.end_date, o.start_date),
         case when private.can_access_gig(o.id) then o.name end
    from gig_members m join gigs o on o.id = m.gig_id, g
   where m.user_id = p_user and o.id <> p_gig and o.status not in ('archived', 'cancelled') and o.start_date is not null
     and o.start_date <= g.end_date and coalesce(o.end_date, o.start_date) >= g.start_date
$$;
revoke execute on function private.person_conflicts(uuid, uuid) from public, anon, authenticated;

create or replace function private.crew_busy(p_user uuid, p_from date, p_to date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.gig_members m join public.gigs g on g.id = m.gig_id
       where m.user_id = p_user and g.status not in ('archived', 'cancelled') and g.start_date is not null
         and g.start_date <= p_to and coalesce(g.end_date, g.start_date) >= p_from)
    or exists (
      select 1 from public.crew_unavailability u
       where u.user_id = p_user and u.status = 'approved' and u.removed_at is null
         and u.start_date <= p_to and u.end_date >= p_from)
$$;
revoke execute on function private.crew_busy(uuid, date, date) from public, anon, authenticated;

-- Gigs already marked cancelled (none before part 1) release what they hold: nothing to do here,
-- the reservation triggers run on the status change itself.

-- ── Wrap-up notes ────────────────────────────────────────────────────────────
alter table public.gigs add column if not exists wrapup_notes text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gigs_wrapup_notes_length') then
    alter table public.gigs add constraint gigs_wrapup_notes_length check (char_length(coalesce(wrapup_notes, '')) <= 4000);
  end if;
end $$;

-- ── Who may ──────────────────────────────────────────────────────────────────
-- Reports → Operations: the organisation's admins and members (not viewers, not crew), with the
-- second sign-in step when they have one
create or replace function private.require_ops(p_org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is null or auth.uid() is null or not private.is_staff(p_org, auth.uid()) or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end $$;
revoke execute on function private.require_ops(uuid) from public, anon;
grant execute on function private.require_ops(uuid) to authenticated;

-- Per-person figures (the owner's choice, 2026-11-08): admins only
create or replace function private.require_ops_admin(p_org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is null or auth.uid() is null or not private.is_org_admin(p_org) or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end $$;
revoke execute on function private.require_ops_admin(uuid) from public, anon;
grant execute on function private.require_ops_admin(uuid) to authenticated;

create or replace function private.ops_period(p_from date, p_until date, p_max integer) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_from is null or p_until is null or p_until <= p_from or p_until - p_from > p_max then
    raise exception 'Bad period' using errcode = '22023';
  end if;
end $$;
revoke execute on function private.ops_period(date, date, integer) from public, anon;
grant execute on function private.ops_period(date, date, integer) to authenticated;

-- ── Crew days ────────────────────────────────────────────────────────────────
-- A crew day (K1 definition): a calendar day someone is booked on a gig, from their booking, else
-- the gig's dates (as private.gig_labour_hours reads them). Viewers aren't booked; cancelled gigs
-- don't count. One row per gig, person and day inside [from, until); n_total = all their days on it.
create or replace function private.ops_crew_days(p_org uuid, p_from date, p_until date)
returns table(gig_id uuid, user_id uuid, day date, staff boolean, n_total integer)
language sql stable security definer set search_path = '' as $$
  with p as (
    select gm.gig_id, gm.user_id,
           coalesce((gm.booked_from at time zone 'UTC')::date, g.start_date) as d_from,
           coalesce((gm.booked_until at time zone 'UTC')::date, g.end_date, g.start_date) as d_until
    from public.gig_members gm
    join public.gigs g on g.id = gm.gig_id
    where g.org_id = p_org and gm.role <> 'viewer' and g.status <> 'cancelled'
  ), q as (
    select p.gig_id, p.user_id, p.d_from,
           least(366, greatest(coalesce(p.d_until, p.d_from), p.d_from) - p.d_from + 1)::int as n
    from p where p.d_from is not null and p.d_from < p_until
  )
  select q.gig_id, q.user_id, s.day::date, m.user_id is not null, q.n
  from q
  left join public.org_members m on m.org_id = p_org and m.user_id = q.user_id and m.role in ('admin', 'member')
  cross join lateral generate_series(greatest(q.d_from, p_from)::timestamp, least(q.d_from + q.n - 1, p_until - 1)::timestamp, interval '1 day') s(day)
  where q.d_from + q.n - 1 >= p_from
$$;
revoke execute on function private.ops_crew_days(uuid, date, date) from public, anon, authenticated;

-- Hours of a day as typed (submitted days have no split yet): end − start (past midnight when the
-- end is at or before the start) − break
create or replace function private.entry_hours(p_start time, p_end time, p_break integer) returns numeric
language sql immutable set search_path = '' as $$
  select greatest(round((extract(epoch from (p_end - p_start)) / 3600.0
         + case when p_end <= p_start then 24 else 0 end - coalesce(p_break, 0) / 60.0)::numeric, 2), 0)
$$;
revoke execute on function private.entry_hours(time, time, integer) from public, anon, authenticated;

-- ── Activity ─────────────────────────────────────────────────────────────────
-- Gigs per month (by start date) and gig days per month, by built-in status, own status and type;
-- the busiest days; how far ahead gigs are booked (created → start date, gigs starting in the period)
create or replace function public.ops_activity(p_org uuid, p_from date, p_until date, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text; v_out jsonb;
begin
  perform private.require_ops(p_org);
  perform private.ops_period(p_from, p_until, 1100);
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  with g as (
    select g.id, g.status, g.custom_status_id, g.gig_type_id, g.start_date,
           least(coalesce(g.end_date, g.start_date), g.start_date + 365) as end_date,
           (g.created_at at time zone v_tz)::date as created_on
    from public.gigs g where g.org_id = p_org and g.start_date is not null
  ), gd as (
    select g.id, g.status, g.custom_status_id, g.gig_type_id, s.day::date as day
    from g cross join lateral generate_series(greatest(g.start_date, p_from)::timestamp, least(g.end_date, p_until - 1)::timestamp, interval '1 day') s(day)
    where g.start_date < p_until and g.end_date >= p_from
  ), crew as (
    select cd.day, count(distinct cd.user_id) as n from private.ops_crew_days(p_org, p_from, p_until) cd group by cd.day
  ), lead as (
    select g.start_date - g.created_on as d from g
    where g.start_date >= p_from and g.start_date < p_until and g.status not in ('cancelled', 'draft') and g.created_on <= g.start_date
  )
  select jsonb_build_object(
    'gigs', coalesce((select jsonb_agg(to_jsonb(x) order by x.month, x.status) from (
        select to_char(g.start_date, 'YYYY-MM') as month, g.status, g.custom_status_id, g.gig_type_id, count(*)::int as gigs
        from g where g.start_date >= p_from and g.start_date < p_until group by 1, 2, 3, 4) x), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(to_jsonb(x) order by x.month, x.status) from (
        select to_char(gd.day, 'YYYY-MM') as month, gd.status, gd.custom_status_id, gd.gig_type_id, count(*)::int as gig_days
        from gd group by 1, 2, 3, 4) x), '[]'::jsonb),
    'busiest', coalesce((select jsonb_agg(to_jsonb(x) order by x.gigs desc, x.crew desc, x.day) from (
        select gd.day, count(*)::int as gigs, coalesce(max(crew.n), 0)::int as crew
        from gd left join crew on crew.day = gd.day
        where gd.status <> 'cancelled'
        group by gd.day order by count(*) desc, coalesce(max(crew.n), 0) desc, gd.day limit 10) x), '[]'::jsonb),
    'lead', jsonb_build_object(
        'gigs', (select count(*) from lead),
        'median_days', (select percentile_cont(0.5) within group (order by lead.d) from lead),
        'under_7', (select count(*) from lead where lead.d < 7),
        'd7_29', (select count(*) from lead where lead.d between 7 and 29),
        'd30_89', (select count(*) from lead where lead.d between 30 and 89),
        'd90_plus', (select count(*) from lead where lead.d >= 90)),
    'cancelled', (select count(*) from g where g.status = 'cancelled' and g.start_date >= p_from and g.start_date < p_until)
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.ops_activity(uuid, date, date, timestamptz) from public, anon;
grant execute on function public.ops_activity(uuid, date, date, timestamptz) to authenticated;

-- ── People ───────────────────────────────────────────────────────────────────
-- Crew days by day in the period; planned hours = an hourly agreed fee's quantity (its share of the
-- days inside the period), else days × overtime_after_hours (10 when not set), as K2; approved hours
-- and their split (overtime, night, weekend, holiday) by work date; hours waiting; how long approval
-- took (entered → approved). Totals for admins and members; one row per person for admins only,
-- with utilisation (booked working days ÷ working days after leave and holidays) and leave.
create or replace function public.ops_people(p_org uuid, p_from date, p_until date, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare v_admin boolean; v_day numeric; v_out jsonb; v_year integer := extract(year from p_until - 1)::int;
begin
  perform private.require_ops(p_org);
  perform private.ops_period(p_from, p_until, 400);
  v_admin := private.is_org_admin(p_org);
  select coalesce((select f.overtime_after_hours from public.crew_rate_factors f where f.org_id = p_org), 10) into v_day;

  with cd as (
    select * from private.ops_crew_days(p_org, p_from, p_until)
  ), pg as (
    select cd.gig_id, cd.user_id, bool_or(cd.staff) as staff, max(cd.n_total) as n_total, count(*)::int as n_in
    from cd group by cd.gig_id, cd.user_id
  ), plan as (
    select pg.user_id, bool_or(pg.staff) as staff, sum(pg.n_in)::int as days, count(*)::int as gigs,
           round(sum(case when fe.unit = 'hour' and fe.rate is not null then fe.quantity * pg.n_in / greatest(pg.n_total, 1)
                          else pg.n_in * v_day end), 2) as planned
    from pg
    left join public.gig_crew_fees fe on fe.gig_id = pg.gig_id and fe.user_id = pg.user_id
    group by pg.user_id
  ), te as (
    select t.user_id, t.status, t.split, t.created_at, t.reviewed_at, t.start_time, t.end_time, t.break_minutes
    from public.time_entries t join public.gigs g on g.id = t.gig_id
    where g.org_id = p_org and t.removed_at is null and t.work_date >= p_from and t.work_date < p_until
  ), hrs as (
    select te.user_id,
           sum(coalesce((te.split ->> 'worked')::numeric, 0)) filter (where te.status = 'approved') as approved,
           sum(coalesce((te.split ->> 'overtime')::numeric, 0)) filter (where te.status = 'approved') as overtime,
           sum(coalesce((te.split ->> 'night')::numeric, 0)) filter (where te.status = 'approved') as night,
           sum(coalesce((te.split ->> 'weekend')::numeric, 0)) filter (where te.status = 'approved') as weekend,
           sum(coalesce((te.split ->> 'holiday')::numeric, 0)) filter (where te.status = 'approved') as holiday,
           sum(private.entry_hours(te.start_time, te.end_time, te.break_minutes)) filter (where te.status = 'submitted') as waiting,
           (count(*) filter (where te.status = 'submitted'))::int as waiting_days,
           avg(extract(epoch from te.reviewed_at - te.created_at) / 3600.0) filter (where te.status = 'approved' and te.reviewed_at is not null) as approval_hours,
           (count(*) filter (where te.status = 'approved' and te.reviewed_at is not null))::int as approved_days
    from te group by te.user_id
  ), booked as (
    select cd.user_id, count(distinct cd.day)::int as n
    from cd
    where cd.staff
      and extract(isodow from cd.day)::smallint = any (private.work_days(p_org, cd.user_id))
      and not private.pt_holiday(cd.day)
      and not exists (select 1 from public.org_holidays h where h.org_id = p_org and h.day = cd.day and h.removed_at is null)
      and not private.on_leave(cd.user_id, cd.day)
    group by cd.user_id
  ), k as (
    select coalesce(plan.user_id, hrs.user_id) as user_id,
           coalesce(plan.staff, private.is_staff(p_org, hrs.user_id)) as staff,
           coalesce(plan.days, 0) as days, coalesce(plan.gigs, 0) as gigs, coalesce(plan.planned, 0) as planned,
           round(coalesce(hrs.approved, 0), 2) as approved, round(coalesce(hrs.overtime, 0), 2) as overtime,
           round(coalesce(hrs.night, 0), 2) as night, round(coalesce(hrs.weekend, 0), 2) as weekend,
           round(coalesce(hrs.holiday, 0), 2) as holiday, round(coalesce(hrs.waiting, 0), 2) as waiting,
           coalesce(hrs.waiting_days, 0) as waiting_days, round(hrs.approval_hours, 1) as approval_hours,
           coalesce(hrs.approved_days, 0) as approved_days
    from plan full join hrs on hrs.user_id = plan.user_id
  ), allk as (
    select k.*, coalesce((select booked.n from booked where booked.user_id = k.user_id), 0) as booked_working_days from k
    union all
    -- staff with no gig and no hours in the period still have a utilisation (of 0)
    select m.user_id, true, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, 0, 0
    from public.org_members m
    where m.org_id = p_org and m.role in ('admin', 'member') and not exists (select 1 from k where k.user_id = m.user_id)
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
        'people', count(*), 'staff', count(*) filter (where k.staff),
        'crew_days', coalesce(sum(k.days), 0),
        'crew_days_staff', coalesce(sum(k.days) filter (where k.staff), 0),
        'crew_days_freelance', coalesce(sum(k.days) filter (where not k.staff), 0),
        'hours_planned', coalesce(sum(k.planned), 0), 'hours_approved', coalesce(sum(k.approved), 0),
        'overtime', coalesce(sum(k.overtime), 0), 'night', coalesce(sum(k.night), 0),
        'weekend', coalesce(sum(k.weekend), 0), 'holiday', coalesce(sum(k.holiday), 0),
        'hours_waiting', coalesce(sum(k.waiting), 0), 'days_waiting', coalesce(sum(k.waiting_days), 0),
        'approval_hours', round(sum(k.approval_hours * k.approved_days) filter (where k.approval_hours is not null)
                                / nullif(sum(k.approved_days) filter (where k.approval_hours is not null), 0), 1))
      from k),
    'persons', case when v_admin then coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', a.user_id, 'full_name', pr.full_name, 'staff', a.staff, 'days', a.days, 'gigs', a.gigs,
               'hours_planned', a.planned, 'hours_approved', a.approved, 'overtime', a.overtime, 'night', a.night,
               'weekend', a.weekend, 'holiday', a.holiday, 'hours_waiting', a.waiting, 'approval_hours', a.approval_hours,
               'booked_working_days', case when a.staff then a.booked_working_days end,
               'working_days', su.working_days, 'available_days', su.available_days, 'leave', su.leave,
               'utilisation', case when a.staff and su.available_days > 0 then round(a.booked_working_days / su.available_days, 4) end,
               'leave_allowance', lb.allowance + lb.carried, 'leave_used', lb.used, 'leave_left', lb.left_days)
             order by a.days desc, pr.full_name, a.user_id)
      from allk a
      left join public.profiles pr on pr.id = a.user_id
      left join public.staff_utilisation(p_org, p_from, p_until - 1) su on su.user_id = a.user_id and a.staff
      left join public.leave_balances(p_org, v_year) lb on lb.user_id = a.user_id and a.staff
    ), '[]'::jsonb) end,
    'year', v_year
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.ops_people(uuid, date, date, timestamptz) from public, anon;
grant execute on function public.ops_people(uuid, date, date, timestamptz) to authenticated;

-- ── Staffing ─────────────────────────────────────────────────────────────────
-- Gigs starting in the period (not cancelled): positions needed, filled (people on the gig with the
-- same function, ignoring case, at most the quantity) and open. Time to fill, from the activity log:
-- position added → someone with that function joined. Crew calls sent in the period and their
-- answers (accepted, declined, none yet, the call was full) with the time to answer. Job posts made
-- in the period with their applications.
create or replace function public.ops_staffing(p_org uuid, p_from date, p_until date, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text; v_out jsonb; v_start timestamptz; v_end timestamptz;
begin
  perform private.require_ops(p_org);
  perform private.ops_period(p_from, p_until, 1100);
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := p_until::timestamp at time zone v_tz;
  with g as (
    select g.id, g.name, g.start_date from public.gigs g
    where g.org_id = p_org and g.status <> 'cancelled' and g.start_date >= p_from and g.start_date < p_until
  ), pos as (
    select p.gig_id, lower(trim(p.title)) as key, sum(p.quantity)::int as needed, min(p.created_at) as created_at
    from public.gig_positions p join g on g.id = p.gig_id group by 1, 2
  ), mem as (
    select gm.gig_id, lower(trim(gm.function_title)) as key, count(*)::int as n
    from public.gig_members gm join g on g.id = gm.gig_id
    where gm.role <> 'viewer' and trim(coalesce(gm.function_title, '')) <> '' group by 1, 2
  ), pp as (
    select pos.gig_id, pos.key, pos.needed, least(pos.needed, coalesce(mem.n, 0)) as filled, pos.created_at
    from pos left join mem on mem.gig_id = pos.gig_id and mem.key = pos.key
  ), per_gig as (
    select g.id, g.name, g.start_date, sum(pp.needed)::int as needed, sum(pp.filled)::int as filled
    from g join pp on pp.gig_id = g.id group by g.id, g.name, g.start_date
  ), fill as (
    select extract(epoch from a.created_at - pos.created_at) / 3600.0 as h
    from public.gig_activity a
    join pos on pos.gig_id = a.gig_id and pos.key = lower(trim(a.details ->> 'function_title'))
    where a.action = 'member_added' and a.created_at >= pos.created_at
  ), calls as (
    select c.id, c.created_at from public.crew_calls c join public.gigs g2 on g2.id = c.gig_id
    where g2.org_id = p_org and c.created_at >= v_start and c.created_at < v_end
  ), ans as (
    select a.answer, a.answered_at, calls.created_at from public.crew_call_answers a join calls on calls.id = a.call_id
  ), posts as (
    select p.id, p.status from public.job_posts p
    where p.org_id = p_org and p.created_at >= v_start and p.created_at < v_end
  ), apps as (
    select a.status from public.job_applications a join posts on posts.id = a.post_id
  )
  select jsonb_build_object(
    'positions', jsonb_build_object(
        'needed', coalesce((select sum(per_gig.needed) from per_gig), 0),
        'filled', coalesce((select sum(per_gig.filled) from per_gig), 0),
        'open', coalesce((select sum(per_gig.needed - per_gig.filled) from per_gig), 0),
        'gigs_open', (select count(*) from per_gig where per_gig.filled < per_gig.needed)),
    'gigs', coalesce((select jsonb_agg(jsonb_build_object('gig_id', per_gig.id, 'name', per_gig.name, 'start_date', per_gig.start_date,
                        'needed', per_gig.needed, 'filled', per_gig.filled, 'open', per_gig.needed - per_gig.filled)
                      order by per_gig.start_date, per_gig.name)
                      from (select * from per_gig order by per_gig.start_date, per_gig.name limit 300) per_gig), '[]'::jsonb),
    'time_to_fill', jsonb_build_object('count', (select count(*) from fill),
        'median_hours', (select round(percentile_cont(0.5) within group (order by fill.h)::numeric, 1) from fill),
        'avg_hours', (select round(avg(fill.h)::numeric, 1) from fill)),
    'calls', jsonb_build_object(
        'calls', (select count(*) from calls), 'invited', (select count(*) from ans),
        'accepted', (select count(*) from ans where ans.answer = 'accepted'),
        'declined', (select count(*) from ans where ans.answer = 'declined'),
        'none', (select count(*) from ans where ans.answer = 'invited'),
        'full', (select count(*) from ans where ans.answer = 'full'),
        'median_answer_hours', (select round(percentile_cont(0.5) within group (order by extract(epoch from ans.answered_at - ans.created_at) / 3600.0)::numeric, 1)
                                from ans where ans.answer in ('accepted', 'declined') and ans.answered_at is not null)),
    'posts', jsonb_build_object(
        'posts', (select count(*) from posts),
        'open', (select count(*) from posts where posts.status = 'open'),
        'filled', (select count(*) from posts where posts.status = 'filled'),
        'closed', (select count(*) from posts where posts.status = 'closed'),
        'applications', (select count(*) from apps),
        'accepted', (select count(*) from apps where apps.status = 'accepted'))
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.ops_staffing(uuid, date, date, timestamptz) from public, anon;
grant execute on function public.ops_staffing(uuid, date, date, timestamptz) to authenticated;

-- ── Tasks ────────────────────────────────────────────────────────────────────
-- The organisation's tasks and its gigs' tasks (not on cancelled gigs, not removed). Open and overdue
-- are as of today (organisation's date); done, on time and late count tasks done in the period (on
-- time: done on or before the due date). Per gig for admins and members, per person for admins.
create or replace function public.ops_tasks(p_org uuid, p_from date, p_until date, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text; v_today date; v_admin boolean; v_out jsonb;
begin
  perform private.require_ops(p_org);
  perform private.ops_period(p_from, p_until, 1100);
  v_admin := private.is_org_admin(p_org);
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  v_today := private.org_today(p_org, p_at);
  with t as (
    select t.id, t.gig_id, g.name as gig_name, g.start_date, t.assignee_id, t.status, t.due_on,
           (t.done_at at time zone v_tz)::date as done_on
    from public.tasks t left join public.gigs g on g.id = t.gig_id
    where t.removed_at is null and (t.org_id = p_org and t.gig_id is null or g.org_id = p_org) and coalesce(g.status, '') <> 'cancelled'
  ), m as (
    select t.*,
           (t.status = 'open') as is_open,
           (t.status = 'open' and t.due_on < v_today) as is_overdue,
           (t.status = 'done' and t.done_on >= p_from and t.done_on < p_until) as is_done,
           (t.status = 'done' and t.done_on >= p_from and t.done_on < p_until and t.due_on is not null and t.done_on <= t.due_on) as on_time,
           (t.status = 'done' and t.done_on >= p_from and t.done_on < p_until and t.due_on is not null and t.done_on > t.due_on) as late
    from t
  )
  select jsonb_build_object(
    'today', v_today,
    'totals', (select jsonb_build_object('open', count(*) filter (where is_open), 'overdue', count(*) filter (where is_overdue),
        'done', count(*) filter (where is_done), 'on_time', count(*) filter (where on_time), 'late', count(*) filter (where late)) from m),
    'by_gig', coalesce((select jsonb_agg(to_jsonb(x) order by x.overdue desc, x.open desc, x.start_date nulls last) from (
        select m.gig_id, max(m.gig_name) as name, max(m.start_date) as start_date,
               count(*) filter (where is_open) as open, count(*) filter (where is_overdue) as overdue,
               count(*) filter (where is_done) as done, count(*) filter (where on_time) as on_time, count(*) filter (where late) as late
        from m group by m.gig_id
        having count(*) filter (where is_open or is_done) > 0
        order by count(*) filter (where is_overdue) desc, count(*) filter (where is_open) desc limit 100) x), '[]'::jsonb),
    'by_person', case when v_admin then coalesce((select jsonb_agg(to_jsonb(x) order by x.overdue desc, x.open desc, x.full_name nulls first) from (
        select m.assignee_id as user_id, max(pr.full_name) as full_name,
               count(*) filter (where is_open) as open, count(*) filter (where is_overdue) as overdue,
               count(*) filter (where is_done) as done, count(*) filter (where on_time) as on_time, count(*) filter (where late) as late
        from m left join public.profiles pr on pr.id = m.assignee_id group by m.assignee_id
        having count(*) filter (where is_open or is_done) > 0
        order by count(*) filter (where is_overdue) desc, count(*) filter (where is_open) desc limit 200) x), '[]'::jsonb) end
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.ops_tasks(uuid, date, date, timestamptz) from public, anon;
grant execute on function public.ops_tasks(uuid, date, date, timestamptz) to authenticated;

-- ── Labour per person ────────────────────────────────────────────────────────
-- private.gig_labour's rule for each person instead of each gig (the test checks the two add up to
-- the same): actual = a confirmed EUR expense linked to their fee, else their approved days' cost plus
-- a fixed fee once; planned = the agreed fee, else the rate card (the estimated part).
create or replace function private.person_labour(p_org uuid, p_gigs uuid[])
returns table(gig_id uuid, user_id uuid, function_title text, days integer, planned numeric, actual numeric,
              labour numeric, from_card boolean, hours_planned numeric, hours_approved numeric, hours_waiting numeric,
              overtime numeric, night numeric, weekend numeric, holiday numeric)
language plpgsql stable security definer set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare v_day numeric;
begin
  select coalesce((select f.overtime_after_hours from public.crew_rate_factors f where f.org_id = p_org), 10) into v_day;
  return query
  with p as (
    select gm.gig_id, gm.user_id, gm.function_title,
           coalesce((gm.booked_from at time zone 'UTC')::date, g.start_date) as d_from,
           coalesce((gm.booked_until at time zone 'UTC')::date, g.end_date, g.start_date) as d_until
    from public.gig_members gm
    join public.gigs g on g.id = gm.gig_id
    where g.org_id = p_org and g.id = any(p_gigs)
  ), d as (
    select p.*, case when p.d_from is null then 0
                     else least(366, greatest(coalesce(p.d_until, p.d_from), p.d_from) - p.d_from + 1) end::int as n
    from p
  ), per as (
    select d.gig_id, d.user_id, d.function_title, d.n,
           case when fe.rate is not null then round(fe.rate * case when fe.unit = 'fixed' then 1 else fe.quantity end, 2) end as fee_total,
           fe.unit as fee_unit, fe.rate as fee_rate, fe.quantity as fee_quantity,
           case when rt.per is not null and d.n > 0 then
             round(rt.per * (d.n - wk.days) + rt.per * coalesce((select f.weekend from public.crew_rate_factors f where f.org_id = p_org), 1) * wk.days, 2)
           end as card_total,
           inv.cost as invoice, hrs.*
    from d
    left join public.gig_crew_fees fe on fe.gig_id = d.gig_id and fe.user_id = d.user_id and fe.rate is not null
    left join lateral (
      select coalesce(r.day_rate, r.half_day_rate) as per
      from public.crew_rates r
      where r.org_id = p_org and r.removed_at is null and (
              (r.user_id = d.user_id and r.function_title is not null and lower(trim(r.function_title)) = lower(trim(coalesce(d.function_title, ''))))
           or (r.user_id = d.user_id and r.function_title is null)
           or (r.user_id is null and trim(coalesce(d.function_title, '')) <> '' and lower(trim(r.function_title)) = lower(trim(d.function_title))))
      order by case when r.user_id is not null and r.function_title is not null then 1 when r.user_id is not null then 2 else 3 end
      limit 1
    ) rt on true
    left join lateral (
      select count(*)::int as days
      from generate_series(d.d_from::timestamp, (d.d_from + greatest(d.n - 1, 0))::timestamp, interval '1 day') s(day)
      where d.n > 0 and extract(isodow from s.day) in (6, 7)
    ) wk on true
    left join lateral (
      select x.cost from private.expense_costs x
      where x.org_id = p_org and x.gig_id = d.gig_id and x.crew_fee_user_id = d.user_id
        and x.removed_at is null and x.status = 'confirmed' and x.currency = 'EUR'
      limit 1
    ) inv on true
    left join lateral (
      select (count(*) filter (where t.status = 'approved'))::int as approved_days,
             coalesce(sum(t.cost) filter (where t.status = 'approved'), 0) as hours_cost,
             coalesce(sum(coalesce((t.split ->> 'worked')::numeric, 0)) filter (where t.status = 'approved'), 0) as h_approved,
             coalesce(sum(private.entry_hours(t.start_time, t.end_time, t.break_minutes)) filter (where t.status = 'submitted'), 0) as h_waiting,
             coalesce(sum(coalesce((t.split ->> 'overtime')::numeric, 0)) filter (where t.status = 'approved'), 0) as h_overtime,
             coalesce(sum(coalesce((t.split ->> 'night')::numeric, 0)) filter (where t.status = 'approved'), 0) as h_night,
             coalesce(sum(coalesce((t.split ->> 'weekend')::numeric, 0)) filter (where t.status = 'approved'), 0) as h_weekend,
             coalesce(sum(coalesce((t.split ->> 'holiday')::numeric, 0)) filter (where t.status = 'approved'), 0) as h_holiday
      from public.time_entries t
      where t.gig_id = d.gig_id and t.user_id = d.user_id and t.removed_at is null
    ) hrs on true
  )
  select per.gig_id, per.user_id, per.function_title, per.n,
         coalesce(per.fee_total, per.card_total),
         case when per.invoice is not null then per.invoice
              when per.approved_days > 0 then round(per.hours_cost + case when per.fee_unit = 'fixed' then per.fee_rate else 0 end, 2)
         end,
         coalesce(case when per.invoice is not null then per.invoice
                       when per.approved_days > 0 then round(per.hours_cost + case when per.fee_unit = 'fixed' then per.fee_rate else 0 end, 2)
                  end, coalesce(per.fee_total, per.card_total)),
         per.fee_total is null and per.card_total is not null
           and per.invoice is null and per.approved_days = 0,
         round(case when per.fee_unit = 'hour' then per.fee_quantity else per.n * v_day end, 2),
         round(per.h_approved, 2), round(per.h_waiting, 2),
         round(per.h_overtime, 2), round(per.h_night, 2), round(per.h_weekend, 2), round(per.h_holiday, 2)
  from per;
end $$;
revoke execute on function private.person_labour(uuid, uuid[]) from public, anon, authenticated;

-- ── The person page (admins only) ────────────────────────────────────────────
-- One person's days, hours and cost with the organisation: the gigs starting in the period that they
-- were on (dated by the gig's start date, as the money reports), with totals; their leave and
-- utilisation when they are staff; their first and last gig with the organisation.
create or replace function public.ops_person(p_org uuid, p_user uuid, p_from date, p_until date, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare v_gigs uuid[]; v_role text; v_out jsonb; v_year integer := extract(year from p_until - 1)::int;
begin
  perform private.require_ops_admin(p_org);
  perform private.ops_period(p_from, p_until, 1100);
  select m.role into v_role from public.org_members m where m.org_id = p_org and m.user_id = p_user;
  if v_role is null and not exists (select 1 from public.gig_members gm join public.gigs g on g.id = gm.gig_id
                                     where g.org_id = p_org and gm.user_id = p_user) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(g.id), '{}') into v_gigs
  from public.gigs g join public.gig_members gm on gm.gig_id = g.id and gm.user_id = p_user
  where g.org_id = p_org and gm.role <> 'viewer' and g.status <> 'cancelled' and g.start_date >= p_from and g.start_date < p_until;

  with pl as (
    select l.*, g.name, g.start_date, g.end_date, g.status
    from private.person_labour(p_org, v_gigs) l join public.gigs g on g.id = l.gig_id
    where l.user_id = p_user
  )
  select jsonb_build_object(
    'user_id', p_user,
    'full_name', (select pr.full_name from public.profiles pr where pr.id = p_user),
    'role', v_role,
    'staff', v_role in ('admin', 'member'),
    'totals', (select jsonb_build_object('gigs', count(*), 'days', coalesce(sum(pl.days), 0),
        'hours_planned', coalesce(sum(pl.hours_planned), 0), 'hours_approved', coalesce(sum(pl.hours_approved), 0),
        'hours_waiting', coalesce(sum(pl.hours_waiting), 0), 'overtime', coalesce(sum(pl.overtime), 0),
        'night', coalesce(sum(pl.night), 0), 'weekend', coalesce(sum(pl.weekend), 0), 'holiday', coalesce(sum(pl.holiday), 0),
        'cost', coalesce(sum(pl.labour), 0), 'cost_actual', coalesce(sum(pl.actual), 0),
        'cost_estimated', coalesce(sum(pl.labour) filter (where pl.from_card), 0)) from pl),
    'gigs', coalesce((select jsonb_agg(jsonb_build_object('gig_id', pl.gig_id, 'name', pl.name, 'start_date', pl.start_date,
        'end_date', pl.end_date, 'status', pl.status, 'function_title', pl.function_title, 'days', pl.days,
        'hours_planned', pl.hours_planned, 'hours_approved', pl.hours_approved, 'hours_waiting', pl.hours_waiting,
        'cost', pl.labour, 'cost_actual', pl.actual, 'estimated', pl.from_card) order by pl.start_date, pl.name) from pl), '[]'::jsonb),
    'first_gig', (select min(g.start_date) from public.gigs g join public.gig_members gm on gm.gig_id = g.id
                   where g.org_id = p_org and gm.user_id = p_user and gm.role <> 'viewer' and g.status <> 'cancelled'),
    'last_gig', (select max(g.start_date) from public.gigs g join public.gig_members gm on gm.gig_id = g.id
                  where g.org_id = p_org and gm.user_id = p_user and gm.role <> 'viewer' and g.status <> 'cancelled'
                    and g.start_date <= private.org_today(p_org, p_at)),
    'all_gigs', (select count(*) from public.gigs g join public.gig_members gm on gm.gig_id = g.id
                  where g.org_id = p_org and gm.user_id = p_user and gm.role <> 'viewer' and g.status <> 'cancelled'),
    'year', v_year,
    'leave', case when v_role in ('admin', 'member') then (
        select jsonb_build_object('allowance', lb.allowance, 'carried', lb.carried, 'used', lb.used, 'asked', lb.asked, 'left', lb.left_days)
        from public.leave_balances(p_org, v_year) lb where lb.user_id = p_user) end,
    'utilisation', case when v_role in ('admin', 'member') and p_until - p_from <= 400 then (
        select jsonb_build_object('working_days', su.working_days, 'available_days', su.available_days, 'leave', su.leave,
               'booked_working_days', (select count(distinct cd.day) from private.ops_crew_days(p_org, p_from, p_until) cd
                    where cd.user_id = p_user
                      and extract(isodow from cd.day)::smallint = any (private.work_days(p_org, p_user))
                      and not private.pt_holiday(cd.day)
                      and not exists (select 1 from public.org_holidays h where h.org_id = p_org and h.day = cd.day and h.removed_at is null)
                      and not private.on_leave(p_user, cd.day)))
        from public.staff_utilisation(p_org, p_from, p_until - 1) su where su.user_id = p_user) end
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.ops_person(uuid, uuid, date, date, timestamptz) from public, anon;
grant execute on function public.ops_person(uuid, uuid, date, date, timestamptz) to authenticated;

-- ── Gig wrap-up ──────────────────────────────────────────────────────────────
-- One gig after it ends: planned against actual hours (each person's row for those who manage the gig
-- and the organisation's admins; totals for its members), money (gig_finance) for those who see it,
-- damage, losses and what didn't come back, open tasks and the wrap-up notes.
-- Crew and viewers can't open it.
create or replace function public.gig_wrapup(p_gig uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare v_gig record; v_manage boolean; v_staff boolean; v_admin boolean; v_fin boolean; v_people boolean;
        v_today date; v_day numeric; v_out jsonb;
begin
  select g.id, g.org_id, g.name, g.venue, g.start_date, g.end_date, g.status, g.custom_status_id, g.gig_type_id, g.wrapup_notes
    into v_gig from public.gigs g where g.id = p_gig;
  if not found or auth.uid() is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  v_manage := private.can_manage_gig(p_gig);
  v_staff := v_gig.org_id is not null and private.is_staff(v_gig.org_id, auth.uid());
  if not (v_manage or v_staff) or not private.mfa_ok() then raise exception 'Not allowed' using errcode = '42501'; end if;
  v_admin := v_gig.org_id is not null and private.is_org_admin(v_gig.org_id);
  v_fin := v_gig.org_id is not null and private.can_see_finance(v_gig.org_id);
  v_people := v_manage or v_admin;
  v_today := case when v_gig.org_id is null then (p_at at time zone 'UTC')::date else private.org_today(v_gig.org_id, p_at) end;
  select coalesce((select f.overtime_after_hours from public.crew_rate_factors f where f.org_id = v_gig.org_id), 10) into v_day;

  with pl as (
    -- The organisation's rule; personal gigs have no rates, so their hours are counted the same way without money
    select l.* from private.person_labour(v_gig.org_id, array[p_gig]) l where v_gig.org_id is not null
    union all
    select gm.gig_id, gm.user_id, gm.function_title,
           case when v_gig.start_date is null then 0 else least(366, coalesce(v_gig.end_date, v_gig.start_date) - v_gig.start_date + 1) end,
           null, null, null, false,
           round(case when v_gig.start_date is null then 0 else least(366, coalesce(v_gig.end_date, v_gig.start_date) - v_gig.start_date + 1) end * v_day, 2),
           coalesce((select round(sum(coalesce((t.split ->> 'worked')::numeric, 0)), 2) from public.time_entries t
                     where t.gig_id = p_gig and t.user_id = gm.user_id and t.status = 'approved' and t.removed_at is null), 0),
           coalesce((select round(sum(private.entry_hours(t.start_time, t.end_time, t.break_minutes)), 2) from public.time_entries t
                     where t.gig_id = p_gig and t.user_id = gm.user_id and t.status = 'submitted' and t.removed_at is null), 0),
           0, 0, 0, 0
    from public.gig_members gm where gm.gig_id = p_gig and v_gig.org_id is null
  ), crew as (
    select pl.* from pl join public.gig_members gm on gm.gig_id = pl.gig_id and gm.user_id = pl.user_id where gm.role <> 'viewer'
  ), disp as (
    select d.item_id, d.unit_id, d.direction, d.quantity, d.condition, d.note, d.created_at
    from public.gig_dispatch d where d.gig_id = p_gig
  )
  select jsonb_build_object(
    'gig', jsonb_build_object('id', v_gig.id, 'org_id', v_gig.org_id, 'name', v_gig.name, 'venue', v_gig.venue,
        'start_date', v_gig.start_date, 'end_date', v_gig.end_date, 'status', v_gig.status,
        'custom_status_id', v_gig.custom_status_id, 'gig_type_id', v_gig.gig_type_id, 'wrapup_notes', v_gig.wrapup_notes,
        'ended', coalesce(v_gig.end_date, v_gig.start_date) < v_today),
    'can', jsonb_build_object('manage', v_manage, 'money', v_fin, 'people', v_people),
    'hours', (select jsonb_build_object('people', count(*), 'days_planned', coalesce(sum(crew.days), 0),
        'hours_planned', coalesce(sum(crew.hours_planned), 0), 'hours_approved', coalesce(sum(crew.hours_approved), 0),
        'hours_waiting', coalesce(sum(crew.hours_waiting), 0), 'overtime', coalesce(sum(crew.overtime), 0),
        'night', coalesce(sum(crew.night), 0), 'weekend', coalesce(sum(crew.weekend), 0), 'holiday', coalesce(sum(crew.holiday), 0),
        'days_returned', (select count(*) from public.time_entries t where t.gig_id = p_gig and t.status = 'returned' and t.removed_at is null))
      from crew),
    'people', case when v_people then coalesce((select jsonb_agg(jsonb_build_object('user_id', crew.user_id, 'full_name', pr.full_name,
        'function_title', crew.function_title, 'days', crew.days, 'hours_planned', crew.hours_planned,
        'hours_approved', crew.hours_approved, 'hours_waiting', crew.hours_waiting, 'overtime', crew.overtime)
        order by pr.full_name, crew.user_id) from crew left join public.profiles pr on pr.id = crew.user_id), '[]'::jsonb) end,
    'money', case when v_fin then (select to_jsonb(f) from public.gig_finance(v_gig.org_id, null, null, p_gig) f limit 1) end,
    'damaged', coalesce((select jsonb_agg(jsonb_build_object('item_name', i.name, 'quantity', disp.quantity, 'note', disp.note,
        'unit_code', u.code, 'at', disp.created_at) order by disp.created_at)
        from disp join public.price_items i on i.id = disp.item_id left join public.stock_units u on u.id = disp.unit_id
        where disp.direction = 'in' and disp.condition = 'damaged'), '[]'::jsonb),
    'repairs', case when v_staff then coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'item_name', i.name, 'quantity', r.quantity,
        'problem', r.problem, 'status', r.status, 'charge_client', r.charge_client, 'cost', case when v_fin then r.cost end)
        order by r.created_at)
        from public.repairs r join public.price_items i on i.id = r.item_id where r.gig_id = p_gig), '[]'::jsonb) end,
    'not_back', coalesce((select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'item_name', i.name, 'out', x.out_qty, 'back', x.back_qty,
        'missing', x.out_qty - x.back_qty) order by i.name)
        from (select disp.item_id, sum(disp.quantity) filter (where disp.direction = 'out') as out_qty,
                     coalesce(sum(disp.quantity) filter (where disp.direction = 'in'), 0) as back_qty
              from disp group by disp.item_id) x
        join public.price_items i on i.id = x.item_id where x.out_qty > x.back_qty), '[]'::jsonb),
    'lost', coalesce((select jsonb_agg(jsonb_build_object('unit_id', u.id, 'item_name', i.name, 'code', u.code, 'serial', u.serial)
        order by i.name, u.code)
        from public.stock_units u join public.price_items i on i.id = u.item_id
        where u.status = 'lost'
          and exists (select 1 from disp o where o.unit_id = u.id and o.direction = 'out'
                      and not exists (select 1 from disp b where b.unit_id = u.id and b.direction = 'in' and b.created_at > o.created_at))), '[]'::jsonb),
    'tasks', jsonb_build_object(
        'open', (select count(*) from public.tasks t where t.gig_id = p_gig and t.removed_at is null and t.status = 'open'),
        'done', (select count(*) from public.tasks t where t.gig_id = p_gig and t.removed_at is null and t.status = 'done'),
        'items', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'assignee', pr.full_name, 'due_on', t.due_on,
            'overdue', t.due_on < v_today) order by t.due_on nulls last, t.created_at)
            from (select * from public.tasks t where t.gig_id = p_gig and t.removed_at is null and t.status = 'open'
                  order by t.due_on nulls last, t.created_at limit 100) t
            left join public.profiles pr on pr.id = t.assignee_id), '[]'::jsonb))
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.gig_wrapup(uuid, timestamptz) from public, anon;
grant execute on function public.gig_wrapup(uuid, timestamptz) to authenticated;

-- ── Overview tiles (K7's own; report_overview stays as it is) ────────────────
-- Crew days this month, open positions on gigs starting in the next 14 days (today included),
-- overdue tasks, hours waiting for approval (days and hours)
create or replace function public.report_overview_k7(p_org uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_today date; v_month date; v_out jsonb;
begin
  perform private.require_ops(p_org);
  v_today := private.org_today(p_org, p_at);
  v_month := date_trunc('month', v_today)::date;
  with pos as (
    select p.gig_id, lower(trim(p.title)) as key, sum(p.quantity)::int as needed
    from public.gig_positions p join public.gigs g on g.id = p.gig_id
    where g.org_id = p_org and g.status not in ('cancelled', 'archived') and g.start_date >= v_today and g.start_date < v_today + 14
    group by 1, 2
  ), mem as (
    select gm.gig_id, lower(trim(gm.function_title)) as key, count(*)::int as n
    from public.gig_members gm where gm.gig_id in (select pos.gig_id from pos) and gm.role <> 'viewer' group by 1, 2
  ), waiting as (
    select t.start_time, t.end_time, t.break_minutes from public.time_entries t join public.gigs g on g.id = t.gig_id
    where g.org_id = p_org and t.status = 'submitted' and t.removed_at is null
  )
  select jsonb_build_object(
    'crew_days_month', (select count(*) from private.ops_crew_days(p_org, v_month, (v_month + interval '1 month')::date)),
    'open_positions_14', coalesce((select sum(greatest(pos.needed - coalesce(mem.n, 0), 0)) from pos
                                   left join mem on mem.gig_id = pos.gig_id and mem.key = pos.key), 0),
    'overdue_tasks', (select count(*) from public.tasks t left join public.gigs g on g.id = t.gig_id
                      where t.removed_at is null and t.status = 'open' and t.due_on < v_today
                        and (t.org_id = p_org and t.gig_id is null or g.org_id = p_org) and coalesce(g.status, '') <> 'cancelled'),
    'hours_waiting', jsonb_build_object('days', (select count(*) from waiting),
        'hours', coalesce((select sum(private.entry_hours(w.start_time, w.end_time, w.break_minutes)) from waiting w), 0))
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.report_overview_k7(uuid, timestamptz) from public, anon;
grant execute on function public.report_overview_k7(uuid, timestamptz) to authenticated;
