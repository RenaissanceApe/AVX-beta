-- Checks for migration 20270110000000_org_time_zone.sql (U1, the organisation's time zone).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL ORG TIME ZONE CHECKS PASSED"  → good
-- Who: a = admin of NY Co (America/New_York), m = member (staff), c = freelance crew,
-- b = admin of London Co (Europe/London).
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); c uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  org_ny uuid; org_ldn uuid; org_k uuid; org_p uuid; g_ny uuid; g_ldn uuid; hol uuid; half uuid; own uuid;
  n integer; p tstzrange; d date; out jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'tz-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'tz-m@avx.invalid', 'authenticated', 'authenticated'),
    (c, 'tz-c@avx.invalid', 'authenticated', 'authenticated'), (b, 'tz-b@avx.invalid', 'authenticated', 'authenticated');

  -- ── The setting ─────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('NY Co', a) returning id into org_ny;
  if (select time_zone from organisations where id = org_ny) <> 'Europe/Lisbon' then raise exception 'CHECK FAILED: Lisbon is not the default'; end if;
  update organisations set time_zone = 'America/New_York' where id = org_ny;
  begin
    update organisations set time_zone = 'Mars/Olympus_Mons' where id = org_ny;
    raise exception 'CHECK FAILED: unknown time zone accepted';
  exception when invalid_parameter_value then null; end;
  begin
    insert into organisations (name, created_by, time_zone) values ('Bad Co', a, 'Europe/Atlantis');
    raise exception 'CHECK FAILED: new organisation with an unknown time zone';
  exception when invalid_parameter_value then null; end;
  insert into gigs (org_id, name, status, created_by, start_date, end_date)
    values (org_ny, 'NY gig', 'confirmed', a, '2027-01-10', '2027-01-11') returning id into g_ny;
  insert into gig_members (gig_id, user_id, role, function_title) values (g_ny, c, 'crew', 'A1');
  reset role;
  insert into org_members (org_id, user_id, role) values (org_ny, m, 'member');

  -- Only admins change it (a member's update touches nothing)
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update organisations set time_zone = 'Asia/Tokyo' where id = org_ny;
  reset role;
  if (select time_zone from organisations where id = org_ny) <> 'America/New_York' then raise exception 'CHECK FAILED: a member changed the time zone'; end if;

  -- ── Gig days in New York time (UTC-5 in January) ────────────────────────────
  select period into p from reservations where gig_id = g_ny and resource_id = c and status <> 'cancelled';
  if p is distinct from tstzrange('2027-01-10 05:00+00', '2027-01-12 05:00+00', '[)') then
    raise exception 'CHECK FAILED: NY gig days %', p;
  end if;

  -- A London gig on the 12th clashes with the NY gig's last evening (00:00–05:00 UTC)
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by, time_zone) values ('London Co', b, 'Europe/London') returning id into org_ldn;
  insert into gigs (org_id, name, status, created_by, start_date, end_date)
    values (org_ldn, 'London gig', 'confirmed', b, '2027-01-12', '2027-01-12') returning id into g_ldn;
  insert into gig_members (gig_id, user_id, role, function_title) values (g_ldn, c, 'crew', 'Lights');
  select count(*) into n from gig_clashes(g_ldn) where user_id = c and kind = 'booked';
  if n <> 1 then raise exception 'CHECK FAILED: London gig does not see the NY evening clash (%)', n; end if;
  reset role;

  -- ── Changing the time zone moves the bookings ───────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update organisations set time_zone = 'Europe/London' where id = org_ny;
  reset role;
  select period into p from reservations where gig_id = g_ny and resource_id = c and status <> 'cancelled';
  if p is distinct from tstzrange('2027-01-10 00:00+00', '2027-01-12 00:00+00', '[)') then
    raise exception 'CHECK FAILED: gig days did not move with the time zone %', p;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_clashes(g_ldn) where user_id = c and kind = 'booked';
  if n <> 0 then raise exception 'CHECK FAILED: clash left over after the time zone changed'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update organisations set time_zone = 'America/New_York' where id = org_ny;

  -- ── Leave in the organisation's time zone ───────────────────────────────────
  insert into crew_unavailability (user_id, org_id, type, start_date, end_date)
    values (m, org_ny, 'holiday', '2027-01-20', '2027-01-20') returning id into hol;
  insert into crew_unavailability (user_id, org_id, type, start_date, end_date, start_half)
    values (m, org_ny, 'training', '2027-01-21', '2027-01-22', true) returning id into half;
  reset role;
  select period into p from reservations where source_type = 'unavailable' and source_id = hol::text and status = 'confirmed';
  if p is distinct from tstzrange('2027-01-20 05:00+00', '2027-01-21 05:00+00', '[)') then
    raise exception 'CHECK FAILED: NY leave %', p;
  end if;
  select period into p from reservations where source_type = 'unavailable' and source_id = half::text;
  if p is distinct from tstzrange('2027-01-21 18:00+00', '2027-01-23 05:00+00', '[)') then
    raise exception 'CHECK FAILED: NY half day from 13:00 %', p;
  end if;

  -- Personal unavailable dates (no organisation) stay in Lisbon time
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into crew_unavailability (user_id, org_id, type, start_date, end_date)
    values (c, null, 'other', '2027-02-01', '2027-02-01') returning id into own;
  reset role;
  select period into p from reservations where source_type = 'unavailable' and source_id = own::text;
  if p is distinct from tstzrange('2027-02-01 00:00+00', '2027-02-02 00:00+00', '[)') then
    raise exception 'CHECK FAILED: personal date not in Lisbon time %', p;
  end if;

  -- The organisation's leave moves with its time zone; personal dates don't
  update organisations set time_zone = 'Europe/London' where id = org_ny;
  select period into p from reservations where source_type = 'unavailable' and source_id = hol::text;
  if p is distinct from tstzrange('2027-01-20 00:00+00', '2027-01-21 00:00+00', '[)') then
    raise exception 'CHECK FAILED: leave did not move with the time zone %', p;
  end if;
  select period into p from reservations where source_type = 'unavailable' and source_id = own::text;
  if p is distinct from tstzrange('2027-02-01 00:00+00', '2027-02-02 00:00+00', '[)') then
    raise exception 'CHECK FAILED: personal date moved %', p;
  end if;

  -- ── "Leave from today" uses the organisation's today ────────────────────────
  -- Kiritimati (UTC+14) is always at least a day ahead of Pago Pago (UTC-11)
  insert into organisations (name, created_by, time_zone) values ('Kiritimati Co', a, 'Pacific/Kiritimati') returning id into org_k;
  insert into organisations (name, created_by, time_zone) values ('Pago Co', a, 'Pacific/Pago_Pago') returning id into org_p;
  insert into org_members (org_id, user_id, role) values (org_k, m, 'member'), (org_p, m, 'member');
  d := (now() at time zone 'Pacific/Pago_Pago')::date;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into crew_unavailability (user_id, org_id, type, start_date, end_date) values (m, org_p, 'holiday', d, d);
  begin
    insert into crew_unavailability (user_id, org_id, type, start_date, end_date) values (m, org_k, 'holiday', d, d);
    raise exception 'CHECK FAILED: leave asked for yesterday in Kiritimati';
  exception when invalid_parameter_value then null; end;
  reset role;

  -- ── Reports read the same "today" (K1) ──────────────────────────────────────
  if private.org_today(org_ny, '2027-01-10 03:00+00') <> '2027-01-10'
     or private.org_today(org_k, '2027-01-10 12:00+00') <> '2027-01-11'
     or private.org_today(org_p, '2027-01-10 03:00+00') <> '2027-01-09' then
    raise exception 'CHECK FAILED: org_today';
  end if;
  update organisations set time_zone = 'America/New_York' where id = org_ny;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := report_overview(org_ny, '2027-01-01 03:00+00');
  if out ->> 'today' <> '2026-12-31' then raise exception 'CHECK FAILED: NY report today %', out ->> 'today'; end if;
  reset role;
  update organisations set time_zone = 'Europe/London' where id = org_ny;
  set local role authenticated;
  out := report_overview(org_ny, '2027-01-01 03:00+00');
  if out ->> 'today' <> '2027-01-01' then raise exception 'CHECK FAILED: London report today %', out ->> 'today'; end if;
  reset role;

  raise exception 'ALL ORG TIME ZONE CHECKS PASSED';
end $$;
