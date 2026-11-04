-- Checks for migration 20261212000000 (time registration, step 8).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL TIME REGISTRATION CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); k uuid := gen_random_uuid(); k2 uuid := gen_random_uuid();
  pm uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; g uuid; e1 uuid; e2 uuid; e3 uuid; n integer; res text; s jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'tr-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'tr-m@avx.invalid', 'authenticated', 'authenticated'),
    (k, 'tr-k@avx.invalid', 'authenticated', 'authenticated'), (k2, 'tr-k2@avx.invalid', 'authenticated', 'authenticated'),
    (pm, 'tr-pm@avx.invalid', 'authenticated', 'authenticated'), (x, 'tr-x@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Hours Co', a) returning id into org_a;
  insert into crew_rate_factors (org_id, overtime, night, night_from, night_until, km_rate) values (org_a, 1.5, 1.25, '23:00', '06:00', 0.36);
  insert into org_holidays (org_id, day, name) values (org_a, '2026-06-13', ' Santo António ');
  if (select name from org_holidays where org_id = org_a) <> 'Santo António' then raise exception 'CHECK FAILED: holiday tidied'; end if;
  begin
    insert into org_holidays (org_id, day, name) values (org_a, '2026-06-13', 'Again');
    raise exception 'CHECK FAILED: duplicate holiday';
  exception when unique_violation then null; end;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Hours gig', 'confirmed', a, '2026-12-04', '2026-12-05') returning id into g;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');
  insert into gig_members (gig_id, user_id, role, function_title) values (g, k, 'crew', 'FOH engineer'), (g, k2, 'crew', 'Rigger'), (g, pm, 'pm', 'Production manager');

  -- Crew log their own hours (the id can come from the app); not for others, not on gigs they're not on
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  e1 := gen_random_uuid();
  insert into time_entries (id, gig_id, user_id, work_date, start_time, end_time, break_minutes, travel_minutes, km)
  values (e1, g, k, '2026-12-04', '14:00', '02:00', 60, 45, 120);
  if (select status from time_entries where id = e1) <> 'submitted' or (select org_id from time_entries where id = e1) <> org_a then
    raise exception 'CHECK FAILED: new entry submitted with org';
  end if;
  begin
    insert into time_entries (gig_id, user_id, work_date, start_time, end_time) values (g, k2, '2026-12-04', '09:00', '17:00');
    raise exception 'CHECK FAILED: crew logged for someone else';
  exception when insufficient_privilege then null; end;
  begin
    insert into time_entries (gig_id, user_id, work_date, start_time, end_time) values (g, k, '2026-12-04', '09:00', '17:00');
    raise exception 'CHECK FAILED: two entries on one day';
  exception when unique_violation then null; end;
  begin
    insert into time_entries (gig_id, user_id, work_date, start_time, end_time, status, cost) values (g, k, '2026-12-05', '09:00', '17:00', 'approved', 1);
    raise exception 'CHECK FAILED: crew approved on insert';
  exception when insufficient_privilege then null; end;
  begin
    update time_entries set cost = 1 where id = e1;
    raise exception 'CHECK FAILED: crew set a cost';
  exception when insufficient_privilege then null; end;
  begin
    res := public.review_time_entry(e1, true, null, '{"normal":11}'::jsonb, 'day', 300, 300);
    raise exception 'CHECK FAILED: crew approved own hours';
  exception when insufficient_privilege then null; end;
  begin
    perform public.time_settings(g);
    raise exception 'CHECK FAILED: crew read the factors';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from org_holidays) then raise exception 'CHECK FAILED: crew read org holidays'; end if;
  reset role;

  -- Someone not on the gig can't log hours there, even for themselves
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into time_entries (gig_id, user_id, work_date, start_time, end_time) values (g, x, '2026-12-04', '09:00', '17:00');
    raise exception 'CHECK FAILED: outsider logged hours';
  exception when invalid_parameter_value then null; end;
  if exists (select 1 from time_entries where gig_id = g) then raise exception 'CHECK FAILED: outsider reads hours'; end if;
  reset role;

  -- The approvers (the gig's PM and its creator) were told; one unread notice per person, not more
  if (select count(*) from notifications where gig_id = g and kind = 'hours_submitted') <> 2 then
    raise exception 'CHECK FAILED: approvers notified (%)', (select count(*) from notifications where gig_id = g and kind = 'hours_submitted');
  end if;

  -- The freelance PM logs for another crew member, reads everyone's, reads the factors
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into time_entries (gig_id, user_id, work_date, start_time, end_time) values (g, k2, '2026-12-04', '09:00', '17:00') returning id into e2;
  select count(*) into n from time_entries where gig_id = g;
  if n <> 2 then raise exception 'CHECK FAILED: PM reads % entries', n; end if;
  s := public.time_settings(g);
  if s->'factors'->>'night_from' <> '23:00' or jsonb_array_length(s->'holidays') <> 1 then raise exception 'CHECK FAILED: settings %', s; end if;

  -- Sending back needs a note; approving needs a split that matches the hours (11 h worked)
  begin
    res := public.review_time_entry(e1, false, '  ');
    raise exception 'CHECK FAILED: returned without a note';
  exception when invalid_parameter_value then null; end;
  res := public.review_time_entry(e1, false, 'Load-out ended at 01:00');
  if res <> 'returned' or (select status from time_entries where id = e1) <> 'returned' then raise exception 'CHECK FAILED: returned'; end if;
  begin
    res := public.review_time_entry(e2, true, null, '{"normal":5}'::jsonb, 'day', 300, 300);
    raise exception 'CHECK FAILED: wrong split accepted';
  exception when invalid_parameter_value then null; end;
  res := public.review_time_entry(e2, true, null, '{"normal":8,"overtime":0,"night":0,"weekend":0,"holiday":0}'::jsonb, 'day', 300, 300);
  if res <> 'approved' then raise exception 'CHECK FAILED: approved'; end if;
  if (select (split->>'worked')::numeric from time_entries where id = e2) <> 8 then raise exception 'CHECK FAILED: worked stored'; end if;
  if public.review_time_entry(e2, false, 'x') <> 'already' then raise exception 'CHECK FAILED: approved twice'; end if;
  -- Approved hours are locked, even for the PM
  update time_entries set end_time = '20:00' where id = e2;
  if (select end_time from time_entries where id = e2) <> '17:00' then raise exception 'CHECK FAILED: approved hours changed'; end if;
  reset role;

  -- The person was told both ways (k: returned; k2: approved)
  if not exists (select 1 from notifications where user_id = k and kind = 'hours_returned' and details->>'note' = 'Load-out ended at 01:00') then
    raise exception 'CHECK FAILED: returned notice';
  end if;
  if not exists (select 1 from notifications where user_id = k2 and kind = 'hours_approved') then raise exception 'CHECK FAILED: approved notice'; end if;

  -- Crew fix a returned day (it goes back to submitted) and see only their own hours and money
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update time_entries set end_time = '01:00' where id = e1;
  if (select status from time_entries where id = e1) <> 'submitted' or (select review_note from time_entries where id = e1) is not null then
    raise exception 'CHECK FAILED: edit resubmits';
  end if;
  select count(*) into n from time_entries where gig_id = g;
  if n <> 1 then raise exception 'CHECK FAILED: crew read % entries', n; end if;
  if exists (select 1 from time_entries where user_id = k2) then raise exception 'CHECK FAILED: crew read another person''s cost'; end if;
  -- Removing a day marks it and frees the date
  insert into time_entries (gig_id, user_id, work_date, start_time, end_time) values (g, k, '2026-12-05', '10:00', '18:00') returning id into e3;
  update time_entries set removed_at = now() where id = e3;
  insert into time_entries (gig_id, user_id, work_date, start_time, end_time) values (g, k, '2026-12-05', '11:00', '18:00');
  reset role;

  -- A member who isn't on the gig sees no one's hours; the admin sees them all
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if exists (select 1 from time_entries where gig_id = g) then raise exception 'CHECK FAILED: member reads hours'; end if;
  begin
    insert into org_holidays (org_id, day, name) values (org_a, '2026-06-24', 'São João');
    raise exception 'CHECK FAILED: member added a holiday';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from time_entries where org_id = org_a and removed_at is null;
  if n <> 3 then raise exception 'CHECK FAILED: admin reads % entries', n; end if;
  reset role;

  raise exception 'ALL TIME REGISTRATION CHECKS PASSED';
end $$;

-- The export has the hours and the organisation's holidays, and the older parts still work
--   "ALL TIME EXPORT CHECKS PASSED"  → good
do $$
declare a uuid := gen_random_uuid(); k uuid := gen_random_uuid(); org_a uuid; g uuid; e uuid; out jsonb;
begin
  insert into auth.users (id, email, aud, role) values (a, 'trx-a@avx.invalid', 'authenticated', 'authenticated'), (k, 'trx-k@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Export Hours Co', a) returning id into org_a;
  insert into crew_rate_factors (org_id, overtime) values (org_a, 1.5);
  insert into org_holidays (org_id, day, name) values (org_a, '2026-06-13', 'Santo António');
  insert into gigs (org_id, name, status, created_by) values (org_a, 'Export hours gig', 'draft', a) returning id into g;
  reset role;
  insert into gig_members (gig_id, user_id, role, function_title) values (g, k, 'crew', 'Rigger');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into time_entries (gig_id, user_id, work_date, start_time, end_time) values (g, k, '2026-12-02', '09:00', '18:00') returning id into e;
  perform public.review_time_entry(e, true, null, '{"normal":9}'::jsonb, 'hour', 20, 180);
  out := public.export_org_part(org_a, 'time_entries', 0);
  if out->0->>'start_time' <> '09:00' or (out->0->>'cost')::numeric <> 180 or out->0->>'normal' <> '9' then raise exception 'CHECK FAILED hours: %', out; end if;
  out := public.export_org_part(org_a, 'org_holidays', 0);
  if out->0->>'name' <> 'Santo António' then raise exception 'CHECK FAILED holidays: %', out; end if;
  out := public.export_org_part(org_a, 'crew_rate_factors', 0);
  if (out->0->>'overtime')::numeric <> 1.5 then raise exception 'CHECK FAILED older part: %', out; end if;
  reset role;
  raise exception 'ALL TIME EXPORT CHECKS PASSED';
end $$;
