-- Checks for migrations 20270119000000_appointments.sql and 20270119000001_appointments_select_fix.sql
-- (step 23, V2: appointments).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL APPOINTMENTS CHECKS PASSED"  → good
-- Who: a = admin of Lumen (America/New_York), m = member (a planner), v = viewer of Lumen,
-- c = freelance crew on one of Lumen's gigs, x = someone with no link to Lumen,
-- b = admin of Other Co, where c also works.
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); x uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  org uuid; org_b uuid; g uuid; g_b uuid; cl uuid; ap uuid; day_ap uuid;
  n integer; p tstzrange; k text; lbl text; ok boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'ap-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'ap-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'ap-v@avx.invalid', 'authenticated', 'authenticated'), (c, 'ap-c@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'ap-x@avx.invalid', 'authenticated', 'authenticated'), (b, 'ap-b@avx.invalid', 'authenticated', 'authenticated');

  -- ── Setting up ──────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by, time_zone) values ('Lumen', a, 'America/New_York') returning id into org;
  insert into gigs (org_id, name, status, created_by, start_date, end_date)
    values (org, 'Festival', 'confirmed', a, '2027-03-10', '2027-03-10') returning id into g;
  insert into gig_members (gig_id, user_id, role, function_title) values (g, c, 'crew', 'A1');
  insert into clients (org_id, name) values (org, 'Coliseu') returning id into cl;
  reset role;
  insert into org_members (org_id, user_id, role) values (org, m, 'member'), (org, v, 'viewer');

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', b) returning id into org_b;
  insert into gigs (org_id, name, status, created_by, start_date, end_date)
    values (org_b, 'Other gig', 'confirmed', b, '2027-03-12', '2027-03-12') returning id into g_b;
  insert into gig_members (gig_id, user_id, role, function_title) values (g_b, c, 'crew', 'Lights');
  reset role;

  -- ── Who may add one ─────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into appointments (org_id, kind, title, starts_at, ends_at) values (org, 'meeting', 'Viewer meeting', '2027-03-10 14:00+00', '2027-03-10 15:00+00');
    raise exception 'CHECK FAILED: a viewer added an appointment';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- 09:00–11:00 in New York on 12 March (UTC-5; the clocks change on the 14th)
  insert into appointments (org_id, kind, title, place, starts_at, ends_at, gig_id, client_id)
    values (org, 'site_visit', '  Venue walk  ', 'Coliseu', '2027-03-12 14:00+00', '2027-03-12 16:00+00', g, cl) returning id into ap;
  if (select title from appointments where id = ap) <> 'Venue walk' then raise exception 'CHECK FAILED: title not trimmed'; end if;
  if (select created_by from appointments where id = ap) <> m then raise exception 'CHECK FAILED: creator not recorded'; end if;
  -- A gig from another organisation can't be linked
  begin
    update appointments set gig_id = g_b where id = ap;
    raise exception 'CHECK FAILED: linked another organisation''s gig';
  exception when insufficient_privilege then null; end;
  -- Times must make sense
  begin
    insert into appointments (org_id, kind, title, starts_at, ends_at) values (org, 'meeting', 'Backwards', '2027-03-12 16:00+00', '2027-03-12 15:00+00');
    raise exception 'CHECK FAILED: an appointment ending before it starts';
  exception when check_violation then null; end;

  -- ── Inviting ────────────────────────────────────────────────────────────────
  insert into appointment_people (appointment_id, user_id) values (ap, c), (ap, v);
  begin
    insert into appointment_people (appointment_id, user_id) values (ap, x);
    raise exception 'CHECK FAILED: invited someone with no link to the organisation';
  exception when insufficient_privilege then null; end;
  select count(*) into n from appointment_invitees(org) where user_id in (c, v, m, a);
  if n <> 4 then raise exception 'CHECK FAILED: invitees list (%)', n; end if;
  select count(*) into n from appointment_invitees(org) where user_id = x;
  if n <> 0 then raise exception 'CHECK FAILED: an outsider in the invitees list'; end if;
  reset role;

  -- Reservations for the invited people
  select period into p from reservations where source_type = 'appointment' and source_id = ap::text || ':' || c::text and status = 'confirmed';
  if p is distinct from tstzrange('2027-03-12 14:00+00', '2027-03-12 16:00+00', '[)') then raise exception 'CHECK FAILED: crew reservation %', p; end if;
  select count(*) into n from reservations where source_type = 'appointment' and source_id like ap::text || ':%' and status = 'confirmed';
  if n <> 2 then raise exception 'CHECK FAILED: % reservations for two people', n; end if;

  -- Notifications: the invited people, not the planner
  select count(*) into n from notifications where kind = 'appointment_invited' and user_id in (c, v) and (details ->> 'appointment_id')::uuid = ap;
  if n <> 2 then raise exception 'CHECK FAILED: % invitations notified', n; end if;
  select count(*) into n from notifications where kind like 'appointment_%' and user_id = m;
  if n <> 0 then raise exception 'CHECK FAILED: the planner was notified of their own change'; end if;

  -- ── Who sees it ─────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not exists (select 1 from appointments where id = ap) then raise exception 'CHECK FAILED: invited crew can''t see it'; end if;
  select count(*) into n from appointment_people where appointment_id = ap;
  if n <> 2 then raise exception 'CHECK FAILED: invited crew sees % people', n; end if;
  -- Crew can't change it, invite people or see the planner's tools
  update appointments set title = 'Hacked' where id = ap;
  begin
    insert into appointment_people (appointment_id, user_id) values (ap, a);
    raise exception 'CHECK FAILED: invited crew invited someone';
  exception when insufficient_privilege then null; end;
  select count(*) into n from appointment_invitees(org);
  if n <> 0 then raise exception 'CHECK FAILED: crew sees the invitees list'; end if;
  select count(*) into n from appointment_clashes(org, array[v], '2027-03-12 00:00+00', '2027-03-13 00:00+00');
  if n <> 0 then raise exception 'CHECK FAILED: crew ran the planner''s clash check'; end if;
  reset role;
  if (select title from appointments where id = ap) <> 'Venue walk' then raise exception 'CHECK FAILED: crew changed the appointment'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if exists (select 1 from appointments where id = ap) then raise exception 'CHECK FAILED: an outsider sees it'; end if;
  if exists (select 1 from appointment_people where appointment_id = ap) then raise exception 'CHECK FAILED: an outsider sees who is invited'; end if;
  reset role;

  -- ── Clashes ─────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Other Co's admin may not see Lumen's appointment: just "booked", no title
  select c2.kind, c2.label into k, lbl from gig_clashes(g_b) c2 where c2.user_id = c limit 1;
  if k is distinct from 'booked' or lbl is not null then raise exception 'CHECK FAILED: Other Co sees % / %', k, lbl; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- The planner's form check: c is on Other Co's gig that day (shown without details) and on nothing
  -- else once this appointment is left out
  select count(*) into n from appointment_clashes(org, array[c], '2027-03-12 14:00+00', '2027-03-12 16:00+00', ap);
  if n <> 1 then raise exception 'CHECK FAILED: planner clash check found % (want the other gig)', n; end if;
  select count(*) into n from appointment_clashes(org, array[c], '2027-03-12 14:00+00', '2027-03-12 16:00+00', null) where kind = 'appointment';
  if n <> 1 then raise exception 'CHECK FAILED: the appointment itself is not named in the planner''s check'; end if;
  select count(*) into n from appointment_clashes(org, array[x], '2027-03-12 00:00+00', '2027-03-13 00:00+00');
  if n <> 0 then raise exception 'CHECK FAILED: checked an outsider'; end if;
  reset role;

  -- The crew member's own check names it (they're invited)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select mc.kind, mc.label into k, lbl from my_clashes('2027-03-12 15:00+00', '2027-03-12 15:30+00') mc where mc.kind <> 'booked' limit 1;
  if k is distinct from 'appointment' or lbl is distinct from 'Venue walk' then raise exception 'CHECK FAILED: my_clashes says % / %', k, lbl; end if;
  reset role;

  -- ── Changing it ─────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update appointments set starts_at = '2027-03-12 18:00+00', ends_at = '2027-03-12 19:00+00' where id = ap;
  reset role;
  select period into p from reservations where source_type = 'appointment' and source_id = ap::text || ':' || c::text;
  if p is distinct from tstzrange('2027-03-12 18:00+00', '2027-03-12 19:00+00', '[)') then raise exception 'CHECK FAILED: reservation did not move %', p; end if;
  select count(*) into n from notifications where kind = 'appointment_changed' and user_id in (c, v);
  if n <> 2 then raise exception 'CHECK FAILED: % change notifications', n; end if;
  -- Changing only the notes tells nobody
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update appointments set notes = 'Bring the laser meter' where id = ap;
  reset role;
  select count(*) into n from notifications where kind = 'appointment_changed' and user_id in (c, v);
  if n <> 2 then raise exception 'CHECK FAILED: a notes change notified people'; end if;

  -- ── Taking someone off, and back ────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update appointment_people set removed_at = now() where appointment_id = ap and user_id = c;
  reset role;
  if exists (select 1 from reservations where source_type = 'appointment' and source_id = ap::text || ':' || c::text and status <> 'cancelled') then
    raise exception 'CHECK FAILED: reservation kept after taking someone off';
  end if;
  if not exists (select 1 from notifications where kind = 'appointment_cancelled' and user_id = c and details ->> 'why' = 'taken_off') then
    raise exception 'CHECK FAILED: the person taken off was not told';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if exists (select 1 from appointments where id = ap) then raise exception 'CHECK FAILED: still sees it after being taken off'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update appointment_people set removed_at = null where appointment_id = ap and user_id = c;
  reset role;
  if not exists (select 1 from reservations where source_type = 'appointment' and source_id = ap::text || ':' || c::text and status = 'confirmed') then
    raise exception 'CHECK FAILED: reservation not back after inviting again';
  end if;
  select count(*) into n from notifications where kind = 'appointment_invited' and user_id = c;
  if n <> 2 then raise exception 'CHECK FAILED: inviting again did not notify (%)', n; end if;
  -- Only removed_at can be changed on an invitation
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update appointment_people set user_id = x where appointment_id = ap and user_id = c;
    raise exception 'CHECK FAILED: moved an invitation to another person';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── All day, on the organisation's clock ────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into appointments (org_id, kind, title, all_day, start_date, end_date)
    values (org, 'warehouse', 'Prep day', true, '2027-01-20', '2027-01-21') returning id into day_ap;
  insert into appointment_people (appointment_id, user_id) values (day_ap, m);
  reset role;
  select period into p from reservations where source_type = 'appointment' and source_id = day_ap::text || ':' || m::text;
  if p is distinct from tstzrange('2027-01-20 05:00+00', '2027-01-22 05:00+00', '[)') then raise exception 'CHECK FAILED: all-day NY period %', p; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update organisations set time_zone = 'Europe/London' where id = org;
  reset role;
  select period into p from reservations where source_type = 'appointment' and source_id = day_ap::text || ':' || m::text;
  if p is distinct from tstzrange('2027-01-20 00:00+00', '2027-01-22 00:00+00', '[)') then raise exception 'CHECK FAILED: all-day did not move with the time zone %', p; end if;
  -- A timed appointment keeps its real time
  select period into p from reservations where source_type = 'appointment' and source_id = ap::text || ':' || c::text;
  if p is distinct from tstzrange('2027-03-12 18:00+00', '2027-03-12 19:00+00', '[)') then raise exception 'CHECK FAILED: timed appointment moved %', p; end if;

  -- ── Cancelling ──────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update appointments set removed_at = now() where id = ap;
  reset role;
  select count(*) into n from reservations where source_type = 'appointment' and source_id like ap::text || ':%' and status <> 'cancelled';
  if n <> 0 then raise exception 'CHECK FAILED: % reservations left after cancelling', n; end if;
  select count(*) into n from notifications where kind = 'appointment_cancelled' and user_id in (c, v) and details ->> 'why' is null;
  if n <> 2 then raise exception 'CHECK FAILED: % cancel notifications', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from my_clashes('2027-03-12 00:00+00', '2027-03-13 00:00+00') where kind = 'appointment';
  if n <> 0 then raise exception 'CHECK FAILED: cancelled appointment still clashes'; end if;
  reset role;
  -- The row is still there (marked, not removed)
  if not exists (select 1 from appointments where id = ap and removed_at is not null) then raise exception 'CHECK FAILED: cancelled row gone'; end if;

  -- ── Functions are not open to everyone ──────────────────────────────────────
  select has_function_privilege('anon', 'public.appointment_clashes(uuid, uuid[], timestamptz, timestamptz, uuid)', 'execute') into ok;
  if ok then raise exception 'CHECK FAILED: anon can run appointment_clashes'; end if;
  select has_function_privilege('authenticated', 'private.sync_appointment_reservation(uuid, uuid)', 'execute') into ok;
  if ok then raise exception 'CHECK FAILED: signed-in users can run sync_appointment_reservation'; end if;
  select has_function_privilege('authenticated', 'private.can_invite_to_org(uuid, uuid)', 'execute') into ok;
  if ok then raise exception 'CHECK FAILED: signed-in users can run can_invite_to_org'; end if;

  raise exception 'ALL APPOINTMENTS CHECKS PASSED';
end $$;
