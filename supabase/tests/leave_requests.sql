-- Checks for migration 20261213000000 (leave requests, step 9).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL LEAVE REQUEST CHECKS PASSED"  → good
-- Who: a = admin of Leave Co, m = member (staff), v = viewer (not staff), f = freelancer,
-- x = admin of Other Co (another company).
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  f uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g_a uuid; g_b uuid; hol uuid; tr uuid; sick uuid; adm uuid; own uuid;
  n integer; res text; b record; c record; out jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'lv-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'lv-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'lv-v@avx.invalid', 'authenticated', 'authenticated'), (f, 'lv-f@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'lv-x@avx.invalid', 'authenticated', 'authenticated');
  insert into profiles (id, full_name) values (m, 'Maria Member')
    on conflict (id) do update set full_name = excluded.full_name;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Leave Co', a) returning id into org_a;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Leave gig', 'confirmed', a, '2027-03-03', '2027-03-10') returning id into g_a;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_b, 'Other gig', 'confirmed', x, '2027-03-02', '2027-03-02') returning id into g_b;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');
  insert into gig_members (gig_id, user_id, role, function_title) values (g_a, m, 'crew', 'FOH engineer'), (g_b, m, 'crew', 'Monitors');

  -- ── Staff request leave ─────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into crew_unavailability (user_id, org_id, type, start_date, end_date, note)
  values (m, org_a, 'holiday', '2027-03-01', '2027-03-05', ' Family trip ') returning id into hol;
  select * into c from crew_unavailability where id = hol;
  if c.status <> 'requested' or c.days <> 5 or c.note <> 'Family trip' then raise exception 'CHECK FAILED: holiday request %', row_to_json(c); end if;
  insert into crew_unavailability (user_id, org_id, type, start_date, end_date, end_half)
  values (m, org_a, 'training', '2027-03-08', '2027-03-08', true) returning id into tr;
  if (select days from crew_unavailability where id = tr) <> 0.5 then raise exception 'CHECK FAILED: half day counts 0.5'; end if;
  -- Sick days count at once, even in the past
  insert into crew_unavailability (user_id, org_id, type, start_date, end_date)
  values (m, org_a, 'sick', '2026-11-02', '2026-11-02') returning id into sick;
  if (select status from crew_unavailability where id = sick) <> 'approved' then raise exception 'CHECK FAILED: sick day approved at once'; end if;
  begin
    insert into crew_unavailability (user_id, org_id, type, start_date, end_date) values (m, org_a, 'holiday', '2020-01-06', '2020-01-06');
    raise exception 'CHECK FAILED: holiday asked for the past';
  exception when invalid_parameter_value then null; end;
  begin
    insert into crew_unavailability (user_id, org_id, type, start_date, end_date, start_half, end_half) values (m, org_a, 'other', '2027-04-01', '2027-04-01', true, true);
    raise exception 'CHECK FAILED: morning and afternoon off on one day';
  exception when invalid_parameter_value or check_violation then null; end;
  begin
    insert into crew_unavailability (user_id, org_id, type, start_date, end_date) values (a, org_a, 'holiday', '2027-05-03', '2027-05-03');
    raise exception 'CHECK FAILED: member asked leave for someone else';
  exception when insufficient_privilege then null; end;
  begin
    insert into crew_unavailability (user_id, org_id, type, start_date, end_date, status) values (m, org_a, 'holiday', '2027-05-03', '2027-05-03', 'approved');
    raise exception 'CHECK FAILED: member approved own request';
  exception when insufficient_privilege then null; end;
  begin
    update crew_unavailability set end_date = '2027-03-12' where id = hol;
    raise exception 'CHECK FAILED: organisation leave moved';
  exception when invalid_parameter_value then null; end;
  begin
    res := public.decide_leave(hol, true);
    raise exception 'CHECK FAILED: member decided leave';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.staff_utilisation(org_a, '2027-03-01', '2027-03-31');
    raise exception 'CHECK FAILED: member read utilisation';
  exception when insufficient_privilege then null; end;
  -- A member sees their own balance only
  select count(*) into n from public.leave_balances(org_a, 2027);
  if n <> 1 then raise exception 'CHECK FAILED: member sees % balances', n; end if;
  reset role;

  -- A viewer isn't staff: no leave requests, no calendar
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into crew_unavailability (user_id, org_id, type, start_date, end_date) values (v, org_a, 'holiday', '2027-05-03', '2027-05-03');
    raise exception 'CHECK FAILED: viewer asked for leave';
  exception when insufficient_privilege or invalid_parameter_value then null; end;
  begin
    perform * from public.org_leave_calendar(org_a, '2027-03-01', '2027-03-31');
    raise exception 'CHECK FAILED: viewer read the calendar';
  exception when insufficient_privilege then null; end;
  select count(*) into n from crew_unavailability where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees % leave rows', n; end if;
  reset role;

  -- ── The admin decides ──────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from notifications where user_id = a and kind = 'leave_requested';
  if n <> 2 then raise exception 'CHECK FAILED: % request notifications', n; end if;
  if not exists (select 1 from notifications where user_id = a and kind = 'leave_sick') then raise exception 'CHECK FAILED: admins told about a sick day'; end if;
  select count(*) into n from crew_unavailability where org_id = org_a;
  if n <> 3 then raise exception 'CHECK FAILED: admin sees % rows', n; end if;
  -- A request holds no reservation until approved
  if exists (select 1 from reservations where source_type = 'unavailable' and source_id = hol::text and status <> 'cancelled') then
    raise exception 'CHECK FAILED: request blocked before approval';
  end if;
  res := public.decide_leave(hol, true);
  if res <> 'approved' or (select status from crew_unavailability where id = hol) <> 'approved' then raise exception 'CHECK FAILED: approve'; end if;
  begin
    res := public.decide_leave(tr, false);
    raise exception 'CHECK FAILED: refused without a note';
  exception when invalid_parameter_value then null; end;
  res := public.decide_leave(tr, false, 'Busy week');
  if res <> 'refused' then raise exception 'CHECK FAILED: refuse'; end if;
  -- An admin enters a sick day for staff: approved, the person is told
  insert into crew_unavailability (user_id, org_id, type, start_date, end_date) values (m, org_a, 'sick', '2027-03-09', '2027-03-09') returning id into adm;
  if (select status from crew_unavailability where id = adm) <> 'approved' then raise exception 'CHECK FAILED: admin entry approved'; end if;
  -- Balances: 22 by default, own allowance and carry-over, the working week
  select * into b from public.leave_balances(org_a, 2027) where user_id = m;
  if b.allowance <> 22 or b.used <> 5 or b.left_days <> 17 then raise exception 'CHECK FAILED: balance %', row_to_json(b); end if;
  insert into staff_leave_years (org_id, user_id, year, allowance, carried) values (org_a, m, 2027, 25, 2);
  insert into staff_work_weeks (org_id, user_id, days, hours_per_day) values (org_a, m, '{1,2,3,4}', 7.5);
  select * into b from public.leave_balances(org_a, 2027) where user_id = m;
  if b.allowance <> 25 or b.carried <> 2 or b.used <> 4 or b.left_days <> 23 then raise exception 'CHECK FAILED: balance with overrides %', row_to_json(b); end if;
  select * into b from public.staff_utilisation(org_a, '2027-03-01', '2027-03-31') where user_id = m;
  -- March 2027, Monday to Thursday: 19 days; 4 of holiday and 1 sick day leave 14 (× 7.5 h)
  if b.working_days <> 19 or (b.leave->>'holiday')::numeric <> 4 or (b.leave->>'sick')::numeric <> 1
     or b.available_days <> 14 or b.available_hours <> 105 then
    raise exception 'CHECK FAILED: utilisation %', row_to_json(b);
  end if;
  reset role;

  -- Members can't change balances or working weeks
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update staff_leave_years set allowance = 40 where org_id = org_a and user_id = m;
  if (select allowance from staff_leave_years where org_id = org_a and user_id = m) <> 25 then raise exception 'CHECK FAILED: member raised own allowance'; end if;
  begin
    insert into org_leave_settings (org_id, holiday_days) values (org_a, 40);
    raise exception 'CHECK FAILED: member set the allowance';
  exception when insufficient_privilege then null; end;
  if not exists (select 1 from notifications where user_id = m and kind = 'leave_approved') then raise exception 'CHECK FAILED: person told of approval'; end if;
  if not exists (select 1 from notifications where user_id = m and kind = 'leave_refused' and details->>'note' = 'Busy week') then raise exception 'CHECK FAILED: person told of refusal'; end if;

  -- ── Approved leave blocks ──────────────────────────────────────────────────
  -- No hours on a whole day of leave; the refused half day and other days are fine
  begin
    insert into time_entries (gig_id, user_id, work_date, start_time, end_time) values (g_a, m, '2027-03-03', '09:00', '17:00');
    raise exception 'CHECK FAILED: hours logged on leave';
  exception when invalid_parameter_value then null; end;
  insert into time_entries (gig_id, user_id, work_date, start_time, end_time) values (g_a, m, '2027-03-08', '09:00', '17:00');
  insert into time_entries (gig_id, user_id, work_date, start_time, end_time) values (g_a, m, '2027-03-10', '09:00', '17:00');
  -- The calendar: own entries with notes, refused ones only for the person
  select count(*) into n from public.org_leave_calendar(org_a, '2027-03-01', '2027-03-31');
  if n <> 3 then raise exception 'CHECK FAILED: member calendar has % rows', n; end if;
  reset role;
  -- Find crew "free": approved leave is busy (1 March has no gig)
  if not private.crew_busy(m, '2027-03-01', '2027-03-01') then raise exception 'CHECK FAILED: Find crew sees leave as busy'; end if;

  -- Another member sees approved leave without notes, a sick day as "away", no requests
  insert into org_members (org_id, user_id, role) values (org_a, f, 'member');
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from crew_unavailability where user_id = m;
  if n <> 0 then raise exception 'CHECK FAILED: member read a colleague''s rows'; end if;
  select count(*) into n from public.org_leave_calendar(org_a, '2027-03-01', '2027-03-31') where note is not null or type = 'sick' or status <> 'approved';
  if n <> 0 then raise exception 'CHECK FAILED: colleague saw notes, sick or requests'; end if;
  select count(*) into n from public.org_leave_calendar(org_a, '2027-03-01', '2027-03-31') where type = 'away';
  if n <> 1 then raise exception 'CHECK FAILED: sick day not shown as away'; end if;
  reset role;
  update org_members set role = 'viewer' where org_id = org_a and user_id = f;

  -- ── Other companies only see "busy" ────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from crew_unavailability where user_id = m;
  if n <> 0 then raise exception 'CHECK FAILED: other company read leave rows'; end if;
  begin
    perform * from public.org_leave_calendar(org_a, '2027-03-01', '2027-03-31');
    raise exception 'CHECK FAILED: other company read the calendar';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.leave_balances(org_a, 2027);
    raise exception 'CHECK FAILED: other company read balances';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.gig_clashes(g_b) where user_id = m and kind = 'unavailable' and label is null and company is null;
  if n <> 1 then raise exception 'CHECK FAILED: other company sees busy (% rows)', n; end if;
  begin
    res := public.decide_leave(hol, false, 'No');
    raise exception 'CHECK FAILED: other admin decided leave';
  exception when insufficient_privilege then null; end;
  begin
    out := public.export_org_part(org_a, 'leave', 0);
    raise exception 'CHECK FAILED: other company exported leave';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Cancelling and freelancers ─────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update crew_unavailability set removed_at = now() where id = hol;
  reset role;
  if (select status from crew_unavailability where id = hol) <> 'cancelled' then raise exception 'CHECK FAILED: removed leave cancelled'; end if;
  if (select status from reservations where source_type = 'unavailable' and source_id = hol::text) <> 'cancelled' then raise exception 'CHECK FAILED: reservation freed'; end if;
  if not exists (select 1 from notifications where user_id = a and kind = 'leave_cancelled') then raise exception 'CHECK FAILED: admins told of cancelling'; end if;
  if private.crew_busy(m, '2027-03-01', '2027-03-01') then raise exception 'CHECK FAILED: cancelled leave still busy'; end if;

  -- A freelancer marks dates without approval, with a type
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into crew_unavailability (user_id, type, start_date, end_date) values (f, 'holiday', '2027-07-01', '2027-07-14') returning id into own;
  if (select status from crew_unavailability where id = own) <> 'approved' or (select days from crew_unavailability where id = own) <> 14 then
    raise exception 'CHECK FAILED: freelancer dates approved, every day counted';
  end if;
  reset role;
  if not exists (select 1 from reservations where source_type = 'unavailable' and source_id = own::text and status = 'confirmed') then
    raise exception 'CHECK FAILED: freelancer dates block';
  end if;

  -- ── Export ─────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := public.export_org_part(org_a, 'leave', 0);
  if jsonb_array_length(out) <> 3 or out->0->>'name' <> 'Maria Member' then raise exception 'CHECK FAILED export leave: %', out; end if;
  out := public.export_org_part(org_a, 'leave_years', 0);
  if (out->0->>'allowance')::numeric <> 25 then raise exception 'CHECK FAILED export years: %', out; end if;
  out := public.export_org_part(org_a, 'work_weeks', 0);
  if out->0->>'days' <> '1 2 3 4' then raise exception 'CHECK FAILED export weeks: %', out; end if;
  out := public.export_org_part(org_a, 'time_entries', 0);
  if jsonb_array_length(out) <> 2 then raise exception 'CHECK FAILED older part: %', out; end if;
  reset role;

  raise exception 'ALL LEAVE REQUEST CHECKS PASSED';
end $$;
