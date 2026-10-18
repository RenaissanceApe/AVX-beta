-- Checks for migration 20261024000000 (reservations, shifts, availability requests, mutes).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL RESERVATION CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); b uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g1 uuid; g2 uuid; g3 uuid; un uuid; req uuid; n int; t text; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'r-a@avx.invalid', 'authenticated', 'authenticated'),
    (m, 'r-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'r-v@avx.invalid', 'authenticated', 'authenticated'),
    (c, 'r-c@avx.invalid', 'authenticated', 'authenticated'),
    (b, 'r-b@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'r-x@avx.invalid', 'authenticated', 'authenticated');

  -- Company A books c for 10–11 Nov (Lisbon is UTC+0 in November)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Res A', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');
  insert into gigs (org_id, name, created_by, start_date, end_date, status)
    values (org_a, 'Gig A', a, '2026-11-10', '2026-11-11', 'confirmed') returning id into g1;
  insert into gig_members (gig_id, user_id, role, function_title) values (g1, c, 'crew', 'Sound');
  reset role;

  select count(*) into n from reservations
   where gig_id = g1 and resource_id = c and status = 'confirmed' and label = 'Sound'
     and period = tstzrange('2026-11-10 00:00+00', '2026-11-12 00:00+00', '[)');
  if n <> 1 then raise exception 'CHECK FAILED: member reservation not created with gig days'; end if;

  -- Company B books c for 11 Nov
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Res B', b) returning id into org_b;
  insert into gigs (org_id, name, created_by, start_date, end_date, status)
    values (org_b, 'Gig B', b, '2026-11-11', '2026-11-11', 'confirmed') returning id into g2;
  insert into gig_members (gig_id, user_id, role, function_title) values (g2, c, 'crew', 'Lights');
  -- B sees c is busy, but not where
  select count(*) into n from gig_clashes(g2) where user_id = c;
  if n <> 1 then raise exception 'CHECK FAILED: B does not see the clash (%)', n; end if;
  select * into r from gig_clashes(g2) where user_id = c;
  if r.kind <> 'booked' or r.gig_id is not null or r.label is not null or r.company is not null or r.role_label is not null then
    raise exception 'CHECK FAILED: clash leaks another company''s gig';
  end if;
  -- Nobody writes reservations directly
  begin
    insert into reservations (resource_type, resource_id, period, source_type, source_id)
      values ('person', c, tstzrange(now(), now() + interval '1 hour'), 'manual', 'x');
    raise exception 'CHECK FAILED: user wrote a reservation';
  exception when insufficient_privilege then null; end;
  reset role;

  -- A sees the clash too, also without B's details
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_clashes(g1) where user_id = c and gig_id is null and kind = 'booked';
  if n <> 1 then raise exception 'CHECK FAILED: A does not see the clash'; end if;
  select count(*) into n from reservations where gig_id = g1;
  if n < 1 then raise exception 'CHECK FAILED: manager cannot see the gig''s reservations'; end if;
  select count(*) into n from reservations where gig_id = g2;
  if n <> 0 then raise exception 'CHECK FAILED: A sees B''s reservations'; end if;
  reset role;

  -- c sees both, with details (they're on both gigs)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from my_clashes('2026-11-11 00:00+00', '2026-11-12 00:00+00') where label is not null and company is not null;
  if n <> 2 then raise exception 'CHECK FAILED: my_clashes shows % detailed rows', n; end if;
  select count(*) into n from my_clashes('2026-11-11 00:00+00', '2026-11-12 00:00+00', g1);
  if n <> 1 then raise exception 'CHECK FAILED: my_clashes does not exclude the gig being edited'; end if;
  select count(*) into n from my_clashes('2026-11-20 00:00+00', '2026-11-21 00:00+00');
  if n <> 0 then raise exception 'CHECK FAILED: my_clashes outside the range'; end if;
  select count(*) into n from reservations where resource_id = c;
  if n <> 2 then raise exception 'CHECK FAILED: person sees % own reservations', n; end if;
  -- Member and viewer of A can't see clashes of A's gig (they don't manage it)
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_clashes(g1);
  if n <> 0 then raise exception 'CHECK FAILED: plain member sees gig clashes'; end if;
  select count(*) into n from email_clashes(g1, 'r-c@avx.invalid');
  if n <> 0 then raise exception 'CHECK FAILED: plain member checks emails'; end if;
  select count(*) into n from reservations where gig_id = g1;
  if n <> 0 then raise exception 'CHECK FAILED: plain member sees crew reservations'; end if;
  insert into gigs (org_id, name, created_by) values (org_a, 'Member gig', m);
  reset role;

  -- Viewers can no longer create gigs
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into gigs (org_id, name, created_by) values (org_a, 'Viewer gig', v);
    raise exception 'CHECK FAILED: viewer created a gig';
  exception when insufficient_privilege then null; end;
  reset role;

  -- A shift on 10 Nov only: no clash with B any more, and c is told
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update gig_members set booked_from = '2026-11-10 09:00+00', booked_until = '2026-11-10 18:00+00' where gig_id = g1 and user_id = c;
  select count(*) into n from gig_clashes(g1) where user_id = c;
  if n <> 0 then raise exception 'CHECK FAILED: shift still clashes'; end if;
  begin
    update gig_members set booked_from = '2026-11-10 18:00+00', booked_until = '2026-11-10 09:00+00' where gig_id = g1 and user_id = c;
    raise exception 'CHECK FAILED: shift ending before it starts';
  exception when check_violation then null; end;
  reset role;
  select count(*) into n from reservations where gig_id = g1 and resource_id = c
     and period = tstzrange('2026-11-10 09:00+00', '2026-11-10 18:00+00', '[)');
  if n <> 1 then raise exception 'CHECK FAILED: shift not reflected in reservation'; end if;
  select count(*) into n from notifications where user_id = c and kind = 'booking_changed' and gig_id = g1 and org_id = org_a and actor_id = a;
  if n <> 1 then raise exception 'CHECK FAILED: booking_changed notification (%)', n; end if;

  -- B moves its gig to 10 Nov: clash again; draft → hold; archived → cancelled
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update gigs set start_date = '2026-11-10', end_date = '2026-11-10' where id = g2;
  select count(*) into n from gig_clashes(g2) where user_id = c;
  if n <> 1 then raise exception 'CHECK FAILED: moved gig does not clash'; end if;
  update gigs set status = 'draft' where id = g2;
  select status into t from gig_clashes(g2) where user_id = c;
  if t <> 'confirmed' then raise exception 'CHECK FAILED: clash status %', t; end if;
  reset role;
  select status into t from reservations where gig_id = g2 and resource_id = c;
  if t <> 'hold' then raise exception 'CHECK FAILED: draft gig gives %', t; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update gigs set status = 'archived' where id = g2;
  reset role;
  select status into t from reservations where gig_id = g2 and resource_id = c;
  if t <> 'cancelled' then raise exception 'CHECK FAILED: archived gig gives %', t; end if;

  -- Unavailable dates are personal reservations, seen by email check before inviting
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into crew_unavailability (user_id, start_date, end_date) values (c, '2026-12-01', '2026-12-02') returning id into un;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig C', a, '2026-12-02', 'confirmed') returning id into g3;
  select count(*) into n from email_clashes(g3, '  R-C@avx.invalid ') where kind = 'unavailable' and user_id = c;
  if n <> 1 then raise exception 'CHECK FAILED: email_clashes misses unavailability'; end if;
  select count(*) into n from email_clashes(g3, 'nobody@avx.invalid');
  if n <> 0 then raise exception 'CHECK FAILED: email_clashes for unknown email'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from crew_unavailability where id = un;
  reset role;
  select status into t from reservations where source_type = 'unavailable' and source_id = un::text;
  if t <> 'cancelled' then raise exception 'CHECK FAILED: removed unavailability gives %', t; end if;

  -- Availability requests
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into availability_requests (gig_id, person_id, message) values (g3, c, 'Free on the 2nd?') returning id into req;
  begin
    insert into availability_requests (gig_id, person_id) values (g3, c);
    raise exception 'CHECK FAILED: second open request';
  exception when unique_violation then null; end;
  begin
    insert into availability_requests (gig_id, person_id) values (g3, a);
    raise exception 'CHECK FAILED: asked themselves';
  exception when insufficient_privilege then null; end;
  -- The manager can't answer for the person
  begin
    update availability_requests set status = 'available' where id = req;
    raise exception 'CHECK FAILED: manager answered for the person';
  exception when insufficient_privilege then null; end;
  reset role;
  select count(*) into n from availability_requests where id = req and org_id = org_a and asked_by = a and status = 'pending'
     and period = tstzrange('2026-12-02 00:00+00', '2026-12-03 00:00+00', '[)');
  if n <> 1 then raise exception 'CHECK FAILED: request fields not filled'; end if;
  select count(*) into n from notifications where user_id = c and kind = 'availability_request' and org_id = org_a
     and details->>'request_id' = req::text and details->>'message' = 'Free on the 2nd?';
  if n <> 1 then raise exception 'CHECK FAILED: request not notified'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into availability_requests (gig_id, person_id) values (g1, x);
    raise exception 'CHECK FAILED: plain member asked';
  exception when insufficient_privilege then null; end;
  select count(*) into n from availability_requests where id = req;
  if n <> 0 then raise exception 'CHECK FAILED: plain member sees request'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update availability_requests set message = 'changed' where id = req;
    raise exception 'CHECK FAILED: person changed the message';
  exception when insufficient_privilege then null; end;
  begin
    update availability_requests set status = 'withdrawn' where id = req;
    raise exception 'CHECK FAILED: person withdrew';
  exception when insufficient_privilege then null; end;
  update availability_requests set status = 'available', reply_note = 'Yes, from 10:00' where id = req;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: person could not answer'; end if;
  update availability_requests set status = 'unavailable' where id = req;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: answered twice'; end if;
  -- Mute A; can't mute for someone else
  insert into org_mutes (org_id) values (org_a);
  begin
    insert into org_mutes (user_id, org_id) values (a, org_b);
    raise exception 'CHECK FAILED: muted for someone else';
  exception when insufficient_privilege then null; end;
  reset role;
  select count(*) into n from availability_requests where id = req and status = 'available' and replied_at is not null and reply_note = 'Yes, from 10:00';
  if n <> 1 then raise exception 'CHECK FAILED: answer not stored'; end if;
  select count(*) into n from notifications where user_id = a and kind = 'availability_reply' and actor_id = c
     and details->>'answer' = 'available' and details->>'note' = 'Yes, from 10:00';
  if n <> 1 then raise exception 'CHECK FAILED: reply not notified'; end if;

  -- A new request can be withdrawn by the manager, then not answered
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into availability_requests (gig_id, person_id) values (g3, c) returning id into req;
  update availability_requests set status = 'withdrawn', reply_note = 'sneaky' where id = req;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: manager could not withdraw'; end if;
  select count(*) into n from org_mutes;
  if n <> 0 then raise exception 'CHECK FAILED: sees someone else''s mutes'; end if;
  reset role;
  select count(*) into n from availability_requests where id = req and reply_note is null;
  if n <> 1 then raise exception 'CHECK FAILED: manager wrote the person''s note'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update availability_requests set status = 'available' where id = req;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: answered a withdrawn request'; end if;
  select count(*) into n from org_mutes where org_id = org_a;
  if n <> 1 then raise exception 'CHECK FAILED: own mute not visible'; end if;
  reset role;

  -- Crew member → organisation
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform add_gig_member_to_org(g1, c);
    raise exception 'CHECK FAILED: plain member added to org';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform add_gig_member_to_org(g1, x);
    raise exception 'CHECK FAILED: added someone not on the gig';
  exception when raise_exception then
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;
  begin
    perform add_gig_member_to_org(g1, c, 'owner');
    raise exception 'CHECK FAILED: invalid role accepted';
  exception when raise_exception then
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;
  if add_gig_member_to_org(g1, c) <> 'added' then raise exception 'CHECK FAILED: not added'; end if;
  if add_gig_member_to_org(g1, c) <> 'already_member' then raise exception 'CHECK FAILED: added twice'; end if;
  -- Removing c from the gig cancels the booking
  delete from gig_members where gig_id = g1 and user_id = c;
  reset role;
  select count(*) into n from org_members where org_id = org_a and user_id = c and role = 'member';
  if n <> 1 then raise exception 'CHECK FAILED: org membership'; end if;
  select status into t from reservations where gig_id = g1 and resource_id = c;
  if t <> 'cancelled' then raise exception 'CHECK FAILED: removed member gives %', t; end if;

  -- Notifications about a gig always carry its organisation
  insert into notifications (user_id, gig_id, kind) values (c, g2, 'gig_updated');
  select count(*) into n from notifications where user_id = c and gig_id = g2 and org_id = org_b;
  if n < 1 then raise exception 'CHECK FAILED: notification org not filled'; end if;

  raise exception 'ALL RESERVATION CHECKS PASSED';
end $$;

-- Part 2 (migration 20261024000001): requests list and unread counts
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; g uuid; n int; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'r2-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'r2-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'r2-o@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Req Org', a) returning id into org_a;
  insert into gigs (org_id, name, venue, created_by, start_date, status) values (org_a, 'Req Gig', 'Hall', a, '2026-12-02', 'confirmed') returning id into g;
  insert into availability_requests (gig_id, person_id, message) values (g, c, 'Free?');
  reset role;

  -- c isn't on the gig, but sees the request with the gig's name and the company
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gigs where id = g;
  if n <> 0 then raise exception 'CHECK FAILED: person can read the gig'; end if;
  select * into r from my_availability_requests();
  if r.gig_name <> 'Req Gig' or r.company <> 'Req Org' or r.venue <> 'Hall' or r.status <> 'pending' then
    raise exception 'CHECK FAILED: request details %', row_to_json(r);
  end if;
  select count(*) into n from my_unread_counts() where org_id = org_a and unread = 1;
  if n <> 1 then raise exception 'CHECK FAILED: unread per organisation'; end if;
  update availability_requests set status = 'unavailable' where gig_id = g;
  select count(*) into n from my_availability_requests();
  if n <> 0 then raise exception 'CHECK FAILED: answered request still listed as open'; end if;
  select count(*) into n from my_availability_requests(true);
  if n <> 1 then raise exception 'CHECK FAILED: answered request not in history'; end if;
  reset role;

  -- Someone else sees none of it
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from my_availability_requests(true);
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees requests'; end if;
  select count(*) into n from my_unread_counts();
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees unread counts'; end if;
  reset role;

  raise exception 'ALL REQUEST LIST CHECKS PASSED';
end $$;
