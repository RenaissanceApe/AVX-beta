-- Checks for migrations 20261229000000_gig_cancelled_status.sql (by hand) and
-- 20261229000001_reports_k7.sql (K7, operations and people).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL REPORTS K7 CHECKS PASSED"  → good
-- Who: a = admin of Ops Co, m = member (staff) who works on gigs, v = viewer, c = freelancer on the
-- gigs (not in the organisation; PM of "Gig two"), x = admin of Other Co, s = member with two-step
-- sign-in set up.
-- The clock is fixed with p_at at 2026-10-15 12:00 UTC (Lisbon); the period is October 2026.
-- Every expected number is worked out by hand in the comments next to it.
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); x uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g1 uuid; g2 uuid; g3 uuid; g4 uuid; gb uuid; gb2 uuid; ty uuid; wh uuid;
  cable uuid; speaker uuid; u1 uuid; call1 uuid; post1 uuid; d_in bigint;
  at_ timestamptz := '2026-10-15 12:00+00';
  p_from date := '2026-10-01'; p_until date := '2026-11-01';
  out jsonb; r record; who uuid; n integer; got numeric; per numeric;
  claims_s_aal1 text; claims_s_aal2 text;
begin
  insert into auth.users (id, email, aud, role)
  select t.i, 'k7-' || t.o || '@avx.invalid', 'authenticated', 'authenticated'
  from unnest(array[a, m, v, c, x, s]) with ordinality t(i, o);
  insert into profiles (id, full_name) values (a, 'Ana Admin'), (m, 'Mia Member'), (c, 'Caio Crew')
  on conflict (id) do update set full_name = excluded.full_name;
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), s, 'test', 'totp', 'verified', now(), now());
  claims_s_aal1 := json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal1')::text;
  claims_s_aal2 := json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text;

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Ops Co', a) returning id into org_a;
  reset role;
  update organisations set time_zone = 'Europe/Lisbon' where id = org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer'), (org_a, s, 'member');
  -- Other Co's gigs and task (entered as its admin): never counted for Ops Co
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  insert into gigs (org_id, name, status, created_by, start_date, end_date)
  values (org_b, 'Their gig', 'confirmed', x, '2026-10-06', '2026-10-06') returning id into gb;
  insert into gigs (org_id, name, status, created_by, start_date, end_date)
  values (org_b, 'Their other gig', 'confirmed', x, '2026-10-20', '2026-10-20') returning id into gb2;
  insert into gig_members (gig_id, user_id, role, function_title) values (gb, x, 'crew', 'Sound');
  insert into tasks (gig_id, title, assignee_id, due_on, status) values (gb, 'Theirs', x, '2026-10-01', 'open');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- ── Gigs (as the owner) ────────────────────────────────────────────────────
  insert into gig_types (org_id, name) values (org_a, 'Corporate') returning id into ty;
  -- g1 Mon 5 – Wed 7 Oct (5 Oct is a national holiday), booked 30 days ahead
  insert into gigs (org_id, name, status, created_by, start_date, end_date, gig_type_id, created_at)
  values (org_a, 'Gig one', 'confirmed', a, '2026-10-05', '2026-10-07', ty, '2026-09-05 10:00+00') returning id into g1;
  -- g2 Sat 10 – Sun 11 Oct, booked 2 days ahead
  insert into gigs (org_id, name, status, created_by, start_date, end_date, created_at)
  values (org_a, 'Gig two', 'completed', a, '2026-10-10', '2026-10-11', '2026-10-08 10:00+00') returning id into g2;
  -- g4 Tue 27 Oct, booked 13 days ahead
  insert into gigs (org_id, name, status, created_by, start_date, end_date, created_at)
  values (org_a, 'Gig four', 'confirmed', a, '2026-10-27', '2026-10-27', '2026-10-14 10:00+00') returning id into g4;
  -- g3 cancelled, 20 Oct (needs part 1)
  begin
    insert into gigs (org_id, name, status, created_by, start_date, end_date, created_at)
    values (org_a, 'Gig three', 'cancelled', a, '2026-10-20', '2026-10-20', '2026-10-01 10:00+00') returning id into g3;
  exception when check_violation then
    raise exception 'PART 1 NOT APPLIED: run 20261229000000_gig_cancelled_status.sql by hand first';
  end;

  -- Crew: m (staff) Sound on g1 (gig dates, 3 days), g3 (cancelled) and g4 (1 day);
  -- c (freelancer) Lights on g1 booked 6–7 Oct (2 days), PM on g2 (2 days); v viewer on g2 (not booked)
  insert into gig_members (gig_id, user_id, role, function_title) values (g1, m, 'crew', 'Sound');
  insert into gig_members (gig_id, user_id, role, function_title, booked_from, booked_until)
  values (g1, c, 'crew', 'Lights', '2026-10-06 08:00+00', '2026-10-07 20:00+00');
  insert into gig_members (gig_id, user_id, role, function_title) values (g2, c, 'pm', 'Lights'), (g2, v, 'viewer', null),
    (g3, m, 'crew', 'Sound'), (g4, m, 'crew', 'Sound');
  -- The creator joins each gig as its PM; make the admin a viewer there so only m and c are booked
  update gig_members set role = 'viewer', function_title = null where user_id = a and gig_id in (g1, g2, g3, g4);
  -- Crew days in October: g1 3 + 2, g2 2, g4 1 = 8 (staff 4, freelance 4)

  -- Positions: g1 Sound × 1, Lights × 2 (needed 3, filled 2); g4 Sound × 2, sound × 0 more via
  -- another row, Rigger × 1 (needed 3, filled 1). October: needed 6, filled 3, open 3, gigs with open 2
  insert into gig_positions (gig_id, title, quantity, created_at) values
    (g1, 'Sound', 1, '2026-09-06 10:00+00'), (g1, 'Lights', 2, '2026-09-06 10:00+00'),
    (g4, 'Sound', 1, '2026-10-14 10:00+00'), (g4, ' sound ', 1, '2026-10-14 12:00+00'), (g4, 'Rigger', 1, '2026-10-14 10:00+00');
  -- Time to fill from the activity log: 12 h, 48 h and 6 h → median 12, average 22
  update gig_activity set created_at = '2026-09-06 22:00+00'
   where gig_id = g1 and action = 'member_added' and details ->> 'user_id' = m::text;
  update gig_activity set created_at = '2026-09-08 10:00+00'
   where gig_id = g1 and action = 'member_added' and details ->> 'user_id' = c::text;
  update gig_activity set created_at = '2026-10-14 16:00+00'
   where gig_id = g4 and action = 'member_added' and details ->> 'user_id' = m::text;

  -- Crew call on g4, 14 Oct 09:00: m accepted after 2 h, c declined after 4 h, v no answer → median 3 h
  insert into crew_calls (gig_id, title, quantity, created_by, created_at) values (g4, 'Sound', 2, a, '2026-10-14 09:00+00') returning id into call1;
  insert into crew_call_answers (call_id, user_id, answer, answered_at) values
    (call1, m, 'accepted', '2026-10-14 11:00+00'), (call1, c, 'declined', '2026-10-14 13:00+00'), (call1, v, 'invited', null);
  -- A job post in October, filled, with two applications (one accepted)
  insert into job_posts (org_id, gig_id, title, starts_on, ends_on, created_by, status, created_at)
  values (org_a, g4, 'Rigger', '2026-10-27', '2026-10-27', a, 'filled', '2026-10-14 10:00+00') returning id into post1;
  insert into job_applications (post_id, user_id, status) values (post1, c, 'accepted'), (post1, x, 'declined');

  -- Rate card: Sound 100 a day; c's hourly fee on g2: 16 h × 20
  insert into crew_rates (org_id, function_title, day_rate) values (org_a, 'Sound', 100);
  insert into gig_crew_fees (gig_id, user_id, org_id, unit, rate, quantity) values (g2, c, org_a, 'hour', 20, 16);

  -- Hours: m 6 Oct approved 10 h (2 night), cost 200, approved 12 h after entry;
  -- c 6 Oct approved 12 h (2 overtime), cost 300, approved after 48 h; c 10 Oct waiting 09–18, 60 min
  -- break = 8 h; c 11 Oct returned (not counted). Approved 22, overtime 2, night 2, waiting 8 (1 day),
  -- approval time (12 + 48) ÷ 2 = 30 h
  insert into time_entries (gig_id, user_id, org_id, work_date, start_time, end_time, status, cost, split, created_at, reviewed_at) values
    (g1, m, org_a, '2026-10-06', '08:00', '18:00', 'approved', 200, '{"normal": 8, "night": 2, "worked": 10}', '2026-10-06 20:00+00', '2026-10-07 08:00+00'),
    (g1, c, org_a, '2026-10-06', '08:00', '20:00', 'approved', 300, '{"normal": 10, "overtime": 2, "worked": 12}', '2026-10-06 22:00+00', '2026-10-08 22:00+00');
  insert into time_entries (gig_id, user_id, org_id, work_date, start_time, end_time, break_minutes, status) values
    (g2, c, org_a, '2026-10-10', '09:00', '18:00', 60, 'submitted'),
    (g2, c, org_a, '2026-10-11', '09:00', '18:00', 0, 'returned');
  -- m's approved holiday on Wed 7 Oct (booked on g1 that day: not a booked working day)
  insert into crew_unavailability (user_id, org_id, type, start_date, end_date, status)
  values (m, org_a, 'holiday', '2026-10-07', '2026-10-07', 'approved');
  update crew_unavailability set status = 'approved' where user_id = m and org_id = org_a;

  -- Tasks: done on time, done late, overdue, organisation's own open, one on the cancelled gig, one elsewhere
  insert into tasks (gig_id, title, assignee_id, due_on, status, done_at) values
    (g1, 'Advance', m, '2026-10-04', 'done', '2026-10-04 10:00+00'),
    (g1, 'Invoice crew', c, '2026-10-05', 'done', '2026-10-09 10:00+00'),
    (g4, 'Book van', m, '2026-10-10', 'open', null),
    (g3, 'Never mind', m, '2026-10-01', 'open', null);
  insert into tasks (org_id, title, status) values (org_a, 'Tidy warehouse', 'open');
  -- Totals: open 2, overdue 1, done 2, on time 1, late 1

  -- Equipment on g1: 10 cables out, 7 back fine, 1 back damaged (2 not back); a speaker out and never
  -- back (its return scan was undone), marked lost
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'XLR', 2, a, 'bulk') returning id into cable;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Speaker', 60, a, 'serial') returning id into speaker;
  insert into stock_units (org_id, item_id, location_id) values (org_a, speaker, wh) returning id into u1;
  insert into gig_dispatch (gig_id, org_id, item_id, direction, quantity) values (g1, org_a, cable, 'out', 10);
  insert into gig_dispatch (gig_id, org_id, item_id, direction, quantity) values (g1, org_a, cable, 'in', 7);
  insert into gig_dispatch (gig_id, org_id, item_id, direction, quantity, condition, note) values (g1, org_a, cable, 'in', 1, 'damaged', 'Bent pin');
  insert into gig_dispatch (gig_id, org_id, item_id, unit_id, direction, quantity) values (g1, org_a, speaker, u1, 'out', 1);
  insert into gig_dispatch (gig_id, org_id, item_id, unit_id, direction, quantity) values (g1, org_a, speaker, u1, 'in', 1) returning id into d_in;
  update gig_dispatch set undone_at = now() where id = d_in;
  update stock_units set status = 'lost' where id = u1;

  -- ── The cancelled status ──────────────────────────────────────────────────
  if exists (select 1 from reservations where gig_id = g3 and status <> 'cancelled') then
    raise exception 'CHECK FAILED: a cancelled gig still holds a reservation';
  end if;
  if private.crew_busy(m, '2026-10-20', '2026-10-20') then raise exception 'CHECK FAILED: busy on a cancelled gig'; end if;
  if exists (select 1 from private.person_conflicts(gb2, m) where kind = 'booked') then
    raise exception 'CHECK FAILED: a cancelled gig is a clash';
  end if;
  insert into gig_statuses (org_id, name, base_status) values (org_a, 'Called off', 'cancelled');

  -- ── Activity (as the member) ──────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := ops_activity(org_a, p_from, p_until, at_);
  select coalesce(sum((e ->> 'gigs')::int), 0) into n from jsonb_array_elements(out -> 'gigs') e;
  if n <> 4 then raise exception 'CHECK FAILED: gigs in October % (expected 4)', n; end if;
  select coalesce(sum((e ->> 'gigs')::int), 0) into n from jsonb_array_elements(out -> 'gigs') e where e ->> 'gig_type_id' = ty::text;
  if n <> 1 then raise exception 'CHECK FAILED: corporate gigs % (expected 1)', n; end if;
  select coalesce(sum((e ->> 'gig_days')::int), 0) into n from jsonb_array_elements(out -> 'days') e;
  if n <> 7 then raise exception 'CHECK FAILED: gig days % (expected 7)', n; end if;
  if (out ->> 'cancelled')::int <> 1 then raise exception 'CHECK FAILED: cancelled %', out ->> 'cancelled'; end if;
  if out -> 'busiest' -> 0 ->> 'day' <> '2026-10-06' or (out -> 'busiest' -> 0 ->> 'crew')::int <> 2 then
    raise exception 'CHECK FAILED: busiest day %', out -> 'busiest' -> 0;
  end if;
  if exists (select 1 from jsonb_array_elements(out -> 'busiest') e where e ->> 'day' = '2026-10-20') then
    raise exception 'CHECK FAILED: a cancelled gig among the busiest days';
  end if;
  if (out -> 'lead' ->> 'gigs')::int <> 3 or (out -> 'lead' ->> 'median_days')::numeric <> 13
     or (out -> 'lead' ->> 'under_7')::int <> 1 or (out -> 'lead' ->> 'd7_29')::int <> 1 or (out -> 'lead' ->> 'd30_89')::int <> 1 then
    raise exception 'CHECK FAILED: lead time %', out -> 'lead';
  end if;

  -- ── People: totals for the member, no per-person rows ─────────────────────
  out := ops_people(org_a, p_from, p_until, at_);
  if out -> 'persons' <> 'null'::jsonb then raise exception 'CHECK FAILED: a member gets per-person rows'; end if;
  if (out -> 'totals' ->> 'crew_days')::int <> 8 or (out -> 'totals' ->> 'crew_days_staff')::int <> 4
     or (out -> 'totals' ->> 'crew_days_freelance')::int <> 4 then
    raise exception 'CHECK FAILED: crew days %', out -> 'totals';
  end if;
  -- planned: m 4 days × 10 = 40; c g1 2 × 10 = 20 + g2 hourly fee 16 → 76
  if (out -> 'totals' ->> 'hours_planned')::numeric <> 76 then raise exception 'CHECK FAILED: planned hours %', out -> 'totals' ->> 'hours_planned'; end if;
  if (out -> 'totals' ->> 'hours_approved')::numeric <> 22 or (out -> 'totals' ->> 'overtime')::numeric <> 2
     or (out -> 'totals' ->> 'night')::numeric <> 2 then
    raise exception 'CHECK FAILED: approved hours %', out -> 'totals';
  end if;
  if (out -> 'totals' ->> 'hours_waiting')::numeric <> 8 or (out -> 'totals' ->> 'days_waiting')::int <> 1 then
    raise exception 'CHECK FAILED: hours waiting %', out -> 'totals';
  end if;
  if (out -> 'totals' ->> 'approval_hours')::numeric <> 30 then raise exception 'CHECK FAILED: approval time %', out -> 'totals' ->> 'approval_hours'; end if;
  reset role;

  -- ── People: per person for the admin ──────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := ops_people(org_a, p_from, p_until, at_);
  select e into out from jsonb_array_elements(out -> 'persons') e where e ->> 'user_id' = m::text;
  -- m: October has 22 weekdays − 5 Oct (national holiday) = 21 working days; 1 day of leave → 20
  -- available; booked working days 6 Oct and 27 Oct (5 Oct a holiday, 7 Oct on leave) = 2 → 10 %
  if (out ->> 'days')::int <> 4 or (out ->> 'working_days')::numeric <> 21 or (out ->> 'available_days')::numeric <> 20
     or (out ->> 'booked_working_days')::int <> 2 or (out ->> 'utilisation')::numeric <> 0.1 then
    raise exception 'CHECK FAILED: m utilisation %', out;
  end if;
  if (out ->> 'leave_used')::numeric <> 1 or (out ->> 'leave_left')::numeric <> 21 then raise exception 'CHECK FAILED: m leave %', out; end if;
  out := ops_people(org_a, p_from, p_until, at_);
  select e into out from jsonb_array_elements(out -> 'persons') e where e ->> 'user_id' = c::text;
  if (out ->> 'staff')::boolean or (out ->> 'days')::int <> 4 or (out ->> 'hours_planned')::numeric <> 36
     or (out ->> 'utilisation') is not null then
    raise exception 'CHECK FAILED: c as a freelancer %', out;
  end if;
  out := ops_people(org_a, p_from, p_until, at_);
  -- staff with nothing in the period still appear (a, s), with 0 booked days
  if not exists (select 1 from jsonb_array_elements(out -> 'persons') e where e ->> 'user_id' = s::text and (e ->> 'utilisation')::numeric = 0) then
    raise exception 'CHECK FAILED: idle staff missing';
  end if;

  -- ── Staffing ──────────────────────────────────────────────────────────────
  out := ops_staffing(org_a, p_from, p_until, at_);
  if (out -> 'positions' ->> 'needed')::int <> 6 or (out -> 'positions' ->> 'filled')::int <> 3
     or (out -> 'positions' ->> 'open')::int <> 3 or (out -> 'positions' ->> 'gigs_open')::int <> 2 then
    raise exception 'CHECK FAILED: positions %', out -> 'positions';
  end if;
  if (out -> 'time_to_fill' ->> 'count')::int <> 3 or (out -> 'time_to_fill' ->> 'median_hours')::numeric <> 12
     or (out -> 'time_to_fill' ->> 'avg_hours')::numeric <> 22 then
    raise exception 'CHECK FAILED: time to fill %', out -> 'time_to_fill';
  end if;
  if (out -> 'calls' ->> 'calls')::int <> 1 or (out -> 'calls' ->> 'accepted')::int <> 1 or (out -> 'calls' ->> 'declined')::int <> 1
     or (out -> 'calls' ->> 'none')::int <> 1 or (out -> 'calls' ->> 'median_answer_hours')::numeric <> 3 then
    raise exception 'CHECK FAILED: crew calls %', out -> 'calls';
  end if;
  if (out -> 'posts' ->> 'posts')::int <> 1 or (out -> 'posts' ->> 'filled')::int <> 1 or (out -> 'posts' ->> 'applications')::int <> 2 then
    raise exception 'CHECK FAILED: job posts %', out -> 'posts';
  end if;

  -- ── Tasks ─────────────────────────────────────────────────────────────────
  out := ops_tasks(org_a, p_from, p_until, at_);
  if (out -> 'totals' ->> 'open')::int <> 2 or (out -> 'totals' ->> 'overdue')::int <> 1 or (out -> 'totals' ->> 'done')::int <> 2
     or (out -> 'totals' ->> 'on_time')::int <> 1 or (out -> 'totals' ->> 'late')::int <> 1 then
    raise exception 'CHECK FAILED: tasks %', out -> 'totals';
  end if;
  if not exists (select 1 from jsonb_array_elements(out -> 'by_person') e where e ->> 'user_id' = m::text and (e ->> 'overdue')::int = 1 and (e ->> 'on_time')::int = 1) then
    raise exception 'CHECK FAILED: tasks per person %', out -> 'by_person';
  end if;
  if not exists (select 1 from jsonb_array_elements(out -> 'by_gig') e where e ->> 'gig_id' = g1::text and (e ->> 'late')::int = 1) then
    raise exception 'CHECK FAILED: tasks per gig %', out -> 'by_gig';
  end if;

  -- ── Overview tiles ────────────────────────────────────────────────────────
  out := report_overview_k7(org_a, at_);
  -- crew days this month 8; open positions on gigs 15–28 Oct: g4 needs 3, has 1 → 2; overdue 1; waiting 1 day, 8 h
  if (out ->> 'crew_days_month')::int <> 8 or (out ->> 'open_positions_14')::int <> 2 or (out ->> 'overdue_tasks')::int <> 1
     or (out -> 'hours_waiting' ->> 'days')::int <> 1 or (out -> 'hours_waiting' ->> 'hours')::numeric <> 8 then
    raise exception 'CHECK FAILED: overview %', out;
  end if;

  -- ── The person page (admin) ───────────────────────────────────────────────
  -- m in October: g1 (3 days, 10 h approved, cost 200) and g4 (1 day, rate card 100, estimate)
  out := ops_person(org_a, m, p_from, p_until, at_);
  if (out -> 'totals' ->> 'gigs')::int <> 2 or (out -> 'totals' ->> 'days')::int <> 4 or (out -> 'totals' ->> 'hours_approved')::numeric <> 10
     or (out -> 'totals' ->> 'cost')::numeric <> 300 or (out -> 'totals' ->> 'cost_estimated')::numeric <> 100 then
    raise exception 'CHECK FAILED: person page %', out -> 'totals';
  end if;
  if (out -> 'leave' ->> 'used')::numeric <> 1 or (out -> 'utilisation' ->> 'booked_working_days')::int <> 2 then
    raise exception 'CHECK FAILED: person page leave %', out;
  end if;
  begin
    perform ops_person(org_a, x, p_from, p_until, at_);
    raise exception 'CHECK FAILED: a stranger''s page';
  exception when no_data_found then null; end;

  -- ── Wrap-up of g1 (admin: people and money) ───────────────────────────────
  out := gig_wrapup(g1, at_);
  if not (out -> 'gig' ->> 'ended')::boolean then raise exception 'CHECK FAILED: g1 not ended'; end if;
  if (out -> 'hours' ->> 'days_planned')::int <> 5 or (out -> 'hours' ->> 'hours_planned')::numeric <> 50
     or (out -> 'hours' ->> 'hours_approved')::numeric <> 22 then
    raise exception 'CHECK FAILED: wrap-up hours %', out -> 'hours';
  end if;
  if jsonb_array_length(out -> 'people') <> 2 or out -> 'money' = 'null'::jsonb then raise exception 'CHECK FAILED: wrap-up for the admin %', out -> 'can'; end if;
  if not exists (select 1 from jsonb_array_elements(out -> 'not_back') e where e ->> 'item_name' = 'XLR' and (e ->> 'missing')::int = 2)
     or jsonb_array_length(out -> 'damaged') <> 1 then
    raise exception 'CHECK FAILED: wrap-up equipment % %', out -> 'not_back', out -> 'damaged';
  end if;
  -- the speaker went out, its return was undone: not back and lost
  if jsonb_array_length(out -> 'lost') <> 1 or jsonb_array_length(out -> 'not_back') <> 2 then
    raise exception 'CHECK FAILED: wrap-up lost % %', out -> 'lost', out -> 'not_back';
  end if;
  if (out -> 'tasks' ->> 'open')::int <> 0 or (out -> 'tasks' ->> 'done')::int <> 2 then raise exception 'CHECK FAILED: wrap-up tasks %', out -> 'tasks'; end if;
  reset role;

  -- The labour per person adds up to the gig's labour (same rule as step 10)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  for r in select l.gig_id, l.labour, l.planned, l.actual from private.gig_labour(org_a, array[g1, g2, g4]) l loop
    select coalesce(sum(p.labour), 0), coalesce(sum(p.planned), 0) into got, per from private.person_labour(org_a, array[r.gig_id]) p;
    if got <> r.labour or per <> r.planned then raise exception 'CHECK FAILED: labour per person % / % against %', got, per, r; end if;
  end loop;

  -- Wrap-up as the member who doesn't manage g1: totals and money, no per-person rows
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := gig_wrapup(g1, at_);
  if out -> 'people' <> 'null'::jsonb or out -> 'money' = 'null'::jsonb or (out -> 'hours' ->> 'hours_approved')::numeric <> 22 then
    raise exception 'CHECK FAILED: wrap-up for a member %', out -> 'can';
  end if;
  update gigs set wrapup_notes = 'Load-in was late' where id = g1;
  if found then raise exception 'CHECK FAILED: a member who doesn''t manage the gig wrote its notes'; end if;
  reset role;
  -- Wrap-up as the freelance PM of g2: people, no money, no repairs
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := gig_wrapup(g2, at_);
  if out -> 'money' <> 'null'::jsonb or out -> 'repairs' <> 'null'::jsonb or jsonb_array_length(out -> 'people') <> 1 then
    raise exception 'CHECK FAILED: wrap-up for a freelance PM %', out;
  end if;
  update gigs set wrapup_notes = 'Good show' where id = g2;
  if not found then raise exception 'CHECK FAILED: the PM can''t write the notes'; end if;
  begin
    perform gig_wrapup(g1, at_);
    raise exception 'CHECK FAILED: crew opens the wrap-up';
  exception when insufficient_privilege then null; end;
  begin
    perform ops_activity(org_a, p_from, p_until, at_);
    raise exception 'CHECK FAILED: crew calls the operations report';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Who may call ──────────────────────────────────────────────────────────
  -- The member: no person page
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform ops_person(org_a, c, p_from, p_until, at_);
    raise exception 'CHECK FAILED: a member opens a person page';
  exception when insufficient_privilege then null; end;
  out := ops_tasks(org_a, p_from, p_until, at_);
  if out -> 'by_person' <> 'null'::jsonb then raise exception 'CHECK FAILED: a member gets tasks per person'; end if;
  reset role;
  -- Viewer, crew and the other company: nothing
  foreach who in array array[v, c, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform ops_activity(org_a, p_from, p_until, at_); raise exception 'CHECK FAILED: % activity', who;
    exception when insufficient_privilege then null; end;
    begin perform ops_people(org_a, p_from, p_until, at_); raise exception 'CHECK FAILED: % people', who;
    exception when insufficient_privilege then null; end;
    begin perform ops_staffing(org_a, p_from, p_until, at_); raise exception 'CHECK FAILED: % staffing', who;
    exception when insufficient_privilege then null; end;
    begin perform ops_tasks(org_a, p_from, p_until, at_); raise exception 'CHECK FAILED: % tasks', who;
    exception when insufficient_privilege then null; end;
    begin perform ops_person(org_a, m, p_from, p_until, at_); raise exception 'CHECK FAILED: % person', who;
    exception when insufficient_privilege then null; end;
    begin perform report_overview_k7(org_a, at_); raise exception 'CHECK FAILED: % tiles', who;
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;
  foreach who in array array[v, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform gig_wrapup(g1, at_); raise exception 'CHECK FAILED: % wrap-up', who;
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;
  -- Two-step sign-in set up but not done: refused; done: allowed
  perform set_config('request.jwt.claims', claims_s_aal1, true);
  set local role authenticated;
  begin perform ops_activity(org_a, p_from, p_until, at_); raise exception 'CHECK FAILED: activity without the second step';
  exception when insufficient_privilege then null; end;
  begin perform gig_wrapup(g1, at_); raise exception 'CHECK FAILED: wrap-up without the second step';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', claims_s_aal2, true);
  set local role authenticated;
  perform ops_activity(org_a, p_from, p_until, at_);
  perform gig_wrapup(g1, at_);
  reset role;
  -- Anonymous
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin perform report_overview_k7(org_a, at_); raise exception 'CHECK FAILED: anonymous call';
  exception when insufficient_privilege then null; end;
  reset role;
  -- A period that is too long
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform ops_people(org_a, '2025-01-01', '2026-11-01', at_); raise exception 'CHECK FAILED: 22 months of people';
  exception when invalid_parameter_value then null; end;
  reset role;

  raise exception 'ALL REPORTS K7 CHECKS PASSED';
end $$;
