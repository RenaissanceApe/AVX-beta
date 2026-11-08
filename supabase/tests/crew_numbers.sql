-- Checks for migration 20261230000000_crew_numbers.sql (K8, crew numbers, fee paid, crew to pay).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL CREW NUMBERS CHECKS PASSED"  → good
-- Who: a = admin of Stage Co, m = member of Stage Co, c = freelancer on gigs of Stage Co and of
-- Other Co, d = another freelancer on Stage Co's gig, x = admin of Other Co.
-- Dates are relative to today, because "over" and "upcoming" use today's date.
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  d uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g1 uuid; g2 uuid; gb uuid; post uuid; call uuid; claim uuid; exp_d uuid;
  r record; who uuid; dval date; s_earned numeric; s_paid numeric; s_km numeric; s_hours numeric; n integer; got numeric; out jsonb; res text; ok boolean;
  y_from date := date_trunc('year', current_date - 40)::date;
  y_until date := (date_trunc('year', current_date + 40) + interval '1 year')::date;
begin
  insert into auth.users (id, email, aud, role)
  select t.i, 'k8-' || t.o || '@avx.invalid', 'authenticated', 'authenticated'
  from unnest(array[a, m, c, d, x]) with ordinality t(i, o);
  insert into profiles (id, full_name) values (c, 'Carla Test'), (d, 'Duarte Test')
  on conflict (id) do update set full_name = excluded.full_name;

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Stage Co', a) returning id into org_a;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');
  perform set_config('request.jwt.claims', '', true);

  -- ── Fixtures (entered as the owner) ─────────────────────────────────────────
  -- g1: over (20 and 19 days ago), c on a day fee 300 × 2 = 600, d on a fixed fee of 500
  -- g2: in 10 days, c on an hour fee 25 × 10 = 250 (upcoming, not earned)
  -- gb: Other Co, over (15 days ago), c with no fee: one approved day (cost 200, 8 h worked, 1 h
  --     overtime, 30 km, 60 min travel) and one waiting day (09:00–18:00, 60 min break = 8 h)
  insert into gigs (org_id, name, status, created_by, start_date, end_date)
  values (org_a, 'Past gig', 'confirmed', a, current_date - 20, current_date - 19) returning id into g1;
  insert into gigs (org_id, name, status, created_by, start_date, end_date)
  values (org_a, 'Next gig', 'confirmed', a, current_date + 10, current_date + 10) returning id into g2;
  insert into gigs (org_id, name, status, created_by, start_date, end_date)
  values (org_b, 'Their gig', 'confirmed', x, current_date - 15, current_date - 15) returning id into gb;
  insert into gig_members (gig_id, user_id, role, function_title) values
    (g1, c, 'crew', 'Sound'), (g1, d, 'crew', 'Lights'), (g2, c, 'crew', 'Sound'), (gb, c, 'crew', 'Stagehand');
  insert into gig_crew_fees (gig_id, user_id, org_id, unit, rate, quantity) values
    (g1, c, org_a, 'day', 300, 2), (g1, d, org_a, 'fixed', 500, 1), (g2, c, org_a, 'hour', 25, 10);
  insert into time_entries (gig_id, user_id, org_id, work_date, start_time, end_time, break_minutes, travel_minutes, km, status, cost, split)
  values (gb, c, org_b, current_date - 15, '09:00', '18:00', 60, 60, 30, 'approved', 200,
          '{"normal": 7, "overtime": 1, "night": 0, "weekend": 0, "holiday": 0, "worked": 8, "travel": 1, "km": 30}');
  insert into time_entries (gig_id, user_id, org_id, work_date, start_time, end_time, break_minutes, status)
  values (gb, c, org_b, current_date - 14, '09:00', '18:00', 60, 'submitted');
  insert into job_posts (org_id, gig_id, title, starts_on, ends_on, created_by)
  values (org_a, g2, 'Sound tech', current_date + 10, current_date + 10, a) returning id into post;
  insert into job_applications (post_id, user_id, status) values (post, c, 'shortlisted');
  insert into crew_calls (gig_id, title, created_by) values (g1, 'Riggers', a) returning id into call;
  insert into crew_call_answers (call_id, user_id, answer, answered_at) values (call, c, 'declined', now());

  -- ── My numbers: only the caller's own rows ──────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from my_gig_numbers();
  if n <> 3 then raise exception 'CHECK FAILED: c should see 3 gigs, saw %', n; end if;
  select * into r from my_gig_numbers() where gig_id = g1;
  if r.earned <> 600 or r.upcoming is not null or r.fee_total <> 600 or r.days <> 2 or not r.finished or r.org_name <> 'Stage Co' then
    raise exception 'CHECK FAILED: g1 for c: earned %, upcoming %, fee %, days %', r.earned, r.upcoming, r.fee_total, r.days;
  end if;
  select * into r from my_gig_numbers() where gig_id = g2;
  if r.earned is not null or r.upcoming <> 250 or r.finished then
    raise exception 'CHECK FAILED: g2 for c: earned %, upcoming %', r.earned, r.upcoming;
  end if;
  select * into r from my_gig_numbers() where gig_id = gb;
  if r.earned <> 200 or r.hours_approved <> 8 or r.hours_waiting <> 8 or r.overtime_hours <> 1 or r.km <> 30
     or r.travel_minutes <> 60 or r.org_name <> 'Other Co' then
    raise exception 'CHECK FAILED: gb for c: earned %, hours % / %, overtime %, km %', r.earned, r.hours_approved, r.hours_waiting, r.overtime_hours, r.km;
  end if;
  select count(*) into n from my_gig_numbers(current_date - 30, current_date);
  if n <> 2 then raise exception 'CHECK FAILED: the period should hold 2 of c''s gigs, held %', n; end if;
  select count(*) into n from my_gig_numbers(null, null, g2);
  if n <> 1 then raise exception 'CHECK FAILED: one gig asked, % returned', n; end if;
  -- c never reads d's fee, hours or received mark
  select count(*) into n from gig_crew_fees where user_id = d;
  if n <> 0 then raise exception 'CHECK FAILED: c reads d''s fee'; end if;
  out := my_crew_activity(current_date - 60, current_date + 1);
  if (out #>> '{applications,total}')::int <> 1 or (out #>> '{applications,shortlisted}')::int <> 1
     or (out #>> '{calls,total}')::int <> 1 or (out #>> '{calls,answered}')::int <> 1 or (out #>> '{calls,accepted}')::int <> 0 then
    raise exception 'CHECK FAILED: activity %', out;
  end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from my_gig_numbers();
  if n <> 1 then raise exception 'CHECK FAILED: d should see only g1, saw %', n; end if;
  select earned into got from my_gig_numbers() where gig_id = g1;
  if got <> 500 then raise exception 'CHECK FAILED: d earned % on g1', got; end if;
  select count(*) into n from my_monthly_summary(y_from, y_until, org_b);
  if n <> 0 then raise exception 'CHECK FAILED: d sees a company they never worked for'; end if;
  reset role;

  -- ── Crew to pay and the tile ────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*), sum(amount) into n, got from crew_to_pay(org_a);
  if n <> 2 or got <> 1100 then raise exception 'CHECK FAILED: crew to pay for a: % rows, %', n, got; end if;
  if exists (select 1 from crew_to_pay(org_a) where gig_id = g2) then raise exception 'CHECK FAILED: an upcoming gig is to pay'; end if;
  out := report_overview_k8(org_a);
  if (out #>> '{crew_to_pay,EUR}')::numeric <> 1100 or (out ->> 'crew_to_pay_count')::int <> 2 or (out ->> 'crew_to_pay_estimated')::int <> 2 then
    raise exception 'CHECK FAILED: tile %', out;
  end if;
  reset role;
  -- A member who manages none of the gigs: the tile's total, no per-person rows
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from crew_to_pay(org_a);
  if n <> 0 then raise exception 'CHECK FAILED: a member who manages no gig sees % people to pay', n; end if;
  out := report_overview_k8(org_a);
  if (out #>> '{crew_to_pay,EUR}')::numeric <> 1100 then raise exception 'CHECK FAILED: member tile %', out; end if;
  reset role;
  insert into gig_members (gig_id, user_id, role) values (g1, m, 'pm');
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from crew_to_pay(org_a);
  if n <> 2 then raise exception 'CHECK FAILED: the gig''s PM should see 2 people to pay, saw %', n; end if;
  reset role;
  -- Other organisations, crew and anonymous calls are refused
  foreach who in array array[x, c] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform * from crew_to_pay(org_a); raise exception 'CHECK FAILED: crew_to_pay for an outsider';
    exception when insufficient_privilege then null; end;
    begin perform report_overview_k8(org_a); raise exception 'CHECK FAILED: report_overview_k8 for an outsider';
    exception when insufficient_privilege then null; end;
    begin perform mark_crew_fee_paid(g1, c, current_date); raise exception 'CHECK FAILED: an outsider marks a fee paid';
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin perform * from my_gig_numbers(); raise exception 'CHECK FAILED: anonymous my_gig_numbers';
  exception when insufficient_privilege then null; end;
  begin perform * from crew_to_pay(org_a); raise exception 'CHECK FAILED: anonymous crew_to_pay';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Fee paid ────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := mark_crew_fee_paid(g1, c, current_date - 1, 'transfer', null, 23, 'Carla · Past gig');
  if res <> 'paid' then raise exception 'CHECK FAILED: mark paid returned %', res; end if;
  select count(*) into n from expenses where gig_id = g1 and crew_fee_user_id = c and removed_at is null
    and status = 'confirmed' and paid_on = current_date - 1 and amount_net = 600 and vat_amount = 138;
  if n <> 1 then raise exception 'CHECK FAILED: the linked expense was not recorded'; end if;
  if mark_crew_fee_paid(g1, c, current_date) <> 'already' then raise exception 'CHECK FAILED: paid twice'; end if;
  select count(*), sum(amount) into n, got from crew_to_pay(org_a);
  if n <> 1 or got <> 500 then raise exception 'CHECK FAILED: after paying c: % rows, %', n, got; end if;
  begin perform mark_crew_fee_paid(g2, d, current_date); raise exception 'CHECK FAILED: paid a fee that does not exist';
  exception when invalid_parameter_value then null; end;
  begin perform mark_crew_fee_paid(g1, d, current_date + 30); raise exception 'CHECK FAILED: paid in the future';
  exception when invalid_parameter_value then null; end;
  -- Paid through Expenses (a plain update): d is told too
  insert into expenses (org_id, spent_on, description, amount_net, vat_rate, vat_amount, gig_id, crew_fee_user_id)
  values (org_a, current_date - 2, 'Duarte invoice', 500, 0, 0, g1, d) returning id into exp_d;
  select count(*) into n from crew_to_pay(org_a) where user_id = d and not estimated and amount = 500;
  if n <> 1 then raise exception 'CHECK FAILED: d''s invoice not used as the amount to pay'; end if;
  update expenses set paid_on = current_date, paid_how = 'transfer' where id = exp_d;
  select count(*) into n from crew_to_pay(org_a);
  if n <> 0 then raise exception 'CHECK FAILED: % still to pay', n; end if;
  reset role;
  select count(*) into n from notifications where user_id = c and kind = 'fee_paid' and details ->> 'gig_id' = g1::text
    and details ->> 'paid_on' = (current_date - 1)::text and not (details ? 'total');
  if n <> 1 then raise exception 'CHECK FAILED: c was not notified (or told the amount)'; end if;
  select count(*) into n from notifications where user_id = d and kind = 'fee_paid';
  if n <> 1 then raise exception 'CHECK FAILED: d was not notified'; end if;

  -- ── Paid on and received, seen by the person only ───────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select paid_on into dval from my_gig_numbers() where gig_id = g1;
  if dval is distinct from current_date - 1 then raise exception 'CHECK FAILED: c does not see paid on'; end if;
  select count(*) into n from expenses;
  if n <> 0 then raise exception 'CHECK FAILED: c reads the organisation''s expenses'; end if;
  begin perform mark_fee_received(g2); raise exception 'CHECK FAILED: received before paid';
  exception when invalid_parameter_value then null; end;
  if mark_fee_received(g1) <> 'received' then raise exception 'CHECK FAILED: received'; end if;
  if mark_fee_received(g1) <> 'already' then raise exception 'CHECK FAILED: received twice'; end if;
  begin perform mark_fee_received(gen_random_uuid()); raise exception 'CHECK FAILED: received on a gig c is not on';
  exception when insufficient_privilege then null; end;
  if (select received_at from my_gig_numbers() where gig_id = g1) is null then raise exception 'CHECK FAILED: received not shown'; end if;
  begin insert into crew_fee_received (gig_id, user_id, received_at) values (g2, c, now());
    raise exception 'CHECK FAILED: c writes the table directly';
  exception when insufficient_privilege then null; end;
  reset role;
  -- The company sees only its own received marks: Stage Co's admin yes, Other Co's admin and d no
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from crew_fee_received where received_at is not null;
  if n <> 1 then raise exception 'CHECK FAILED: a sees % received marks', n; end if;
  reset role;
  foreach who in array array[x, d] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from crew_fee_received;
    if n <> 0 then raise exception 'CHECK FAILED: someone else reads c''s received mark'; end if;
    reset role;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if mark_fee_received(g1, false) <> 'unmarked' then raise exception 'CHECK FAILED: unmark'; end if;
  if (select received_at from my_gig_numbers() where gig_id = g1) is not null then raise exception 'CHECK FAILED: still received'; end if;
  reset role;
  -- Taking the paid date off brings the fee back to the list
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if mark_crew_fee_paid(g1, c, null) <> 'unpaid' then raise exception 'CHECK FAILED: unpay'; end if;
  select count(*) into n from crew_to_pay(org_a) where user_id = c;
  if n <> 1 then raise exception 'CHECK FAILED: unpaid fee not back on the list'; end if;
  if mark_crew_fee_paid(g1, c, current_date) <> 'paid' then raise exception 'CHECK FAILED: pay again'; end if;
  reset role;

  -- ── Reimbursements and the monthly summary ─────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into expenses (org_id, spent_on, description, amount_net, vat_rate, vat_amount, gig_id, claimed_by)
  values (org_b, current_date - 15, 'Taxi', 20, 0, 0, gb, c) returning id into claim;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform decide_expense_claim(claim, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := my_crew_activity(current_date - 60, current_date + 1);
  if (out #>> '{reimbursements_owed,EUR}')::numeric <> 20 or (out ->> 'reimbursements_count')::int <> 1 then
    raise exception 'CHECK FAILED: reimbursements %', out;
  end if;
  select sum(earned), sum(paid), sum(gigs), sum(km), sum(hours_approved), sum(reimbursements) into s_earned, s_paid, n, s_km, s_hours, got
  from my_monthly_summary(y_from, y_until);
  -- earned 600 (g1) + 200 (gb), g2 not yet; paid 600 (g1 marked paid); 3 gigs; 30 km; 8 h; 20 claimed back
  if s_earned <> 800 or s_paid <> 600 or n <> 3 or s_km <> 30 or s_hours <> 8 or got <> 20 then
    raise exception 'CHECK FAILED: summary earned %, paid %, gigs %, km %, hours %, reimbursements %', s_earned, s_paid, n, s_km, s_hours, got;
  end if;
  select count(*) into n from my_monthly_summary(y_from, y_until, org_b);
  if n < 1 or exists (select 1 from my_monthly_summary(y_from, y_until, org_b) where org_id <> org_b) then
    raise exception 'CHECK FAILED: one company asked';
  end if;
  begin perform * from my_monthly_summary(current_date, current_date); raise exception 'CHECK FAILED: empty period';
  exception when invalid_parameter_value then null; end;
  reset role;

  raise exception 'ALL CREW NUMBERS CHECKS PASSED';
end $$;
