-- Checks for migrations 20261127000000 and 20261128000000 (rehearsal companion R1 and R2).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL REHEARSAL CHECKS PASSED"  → good
do $$
declare
  c uuid := gen_random_uuid(); k uuid := gen_random_uuid(); k2 uuid := gen_random_uuid();
  v uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_c uuid; g uuid; g2 uuid; s1 uuid; s2 uuid; n1 uuid; cl uuid := gen_random_uuid(); n int; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (c, 'rh-c@avx.invalid', 'authenticated', 'authenticated'), (k, 'rh-k@avx.invalid', 'authenticated', 'authenticated'),
    (k2, 'rh-k2@avx.invalid', 'authenticated', 'authenticated'), (v, 'rh-v@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'rh-x@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Rehearsal Co', c) returning id into org_c;
  reset role;
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_c, 'Tech day', current_date, current_date, 'confirmed', c) returning id into g;
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_c, 'Other gig', current_date, current_date, 'confirmed', c) returning id into g2;
  insert into gig_members (gig_id, user_id, role) values (g, c, 'pm'), (g, k, 'crew'), (g, k2, 'crew'), (g, v, 'viewer');

  -- Crew starts a session; the server stamps who and when
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into rehearsal_sessions (gig_id, name, fps, clock, anchor_ms, created_by, anchor_at)
  values (g, ' Run-through 1 ', 25, 'stopwatch', 0, x, now() - interval '1 day') returning id into s1;
  select * into r from rehearsal_sessions where id = s1;
  if r.name <> 'Run-through 1' or r.created_by <> k or r.clock_set_by <> k or r.anchor_at < now() - interval '1 minute' then
    raise exception 'CHECK FAILED: session stamped by the server';
  end if;
  begin
    insert into rehearsal_sessions (gig_id, name, fps, frame_count) values (g, 'Bad', 25, 'df');
    raise exception 'CHECK FAILED: DF timecode at 25 fps';
  exception when check_violation then null; end;

  -- Notes: a duplicate from an offline retry is refused; assignee must be on the gig
  insert into rehearsal_notes (session_id, gig_id, client_id, tc_ms, department, priority, cue, body, author_id)
  values (s1, g2, cl, 61000, 'lighting', 'fix', ' Q12 ', 'Spot late on the chorus', x) returning id into n1;
  select * into r from rehearsal_notes where id = n1;
  if r.gig_id <> g or r.author_id <> k or r.cue <> 'Q12' then raise exception 'CHECK FAILED: note stamped by the server'; end if;
  begin
    insert into rehearsal_notes (session_id, gig_id, client_id, tc_ms, body) values (s1, g, cl, 61000, 'Again');
    raise exception 'CHECK FAILED: duplicate client id';
  exception when unique_violation then null; end;
  begin
    insert into rehearsal_notes (session_id, gig_id, client_id, tc_ms, body, assignee_id) values (s1, g, gen_random_uuid(), 1, 'Who?', x);
    raise exception 'CHECK FAILED: assignee off the gig';
  exception when invalid_parameter_value then null; end;
  begin
    insert into rehearsal_notes (session_id, gig_id, client_id, tc_ms, body) values (s1, g, gen_random_uuid(), 1, '   ');
    raise exception 'CHECK FAILED: empty note';
  exception when check_violation then null; end;
  begin
    insert into rehearsal_notes (session_id, gig_id, client_id, tc_ms, body, photo_path)
    values (s1, g, gen_random_uuid(), 1, 'Photo', g2::text || '/' || s1::text || '/a.jpg');
    raise exception 'CHECK FAILED: photo from another gig';
  exception when invalid_parameter_value then null; end;
  reset role;

  -- Another crew member ticks it done and moves the clock, but can't rewrite or remove it
  perform set_config('request.jwt.claims', json_build_object('sub', k2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update rehearsal_notes set status = 'done', assignee_id = k2 where id = n1;
  select * into r from rehearsal_notes where id = n1;
  if r.status <> 'done' or r.done_by <> k2 or r.assignee_id <> k2 then raise exception 'CHECK FAILED: ticked done'; end if;
  begin
    update rehearsal_notes set body = 'Changed' where id = n1;
    raise exception 'CHECK FAILED: someone else rewrote the note';
  exception when insufficient_privilege then null; end;
  begin
    update rehearsal_notes set removed_at = now() where id = n1;
    raise exception 'CHECK FAILED: someone else removed the note';
  exception when insufficient_privilege then null; end;
  update rehearsal_sessions set anchor_ms = 3600000, clock = 'time_of_day' where id = s1;
  if (select clock_set_by from rehearsal_sessions where id = s1) <> k2 then raise exception 'CHECK FAILED: clock set by'; end if;
  -- R2: the phone's own time of the reading is kept when it is believable, not otherwise
  update rehearsal_sessions set anchor_ms = 3700000, anchor_at = now() - interval '2 seconds' where id = s1;
  if (select anchor_at from rehearsal_sessions where id = s1) <> now() - interval '2 seconds' then raise exception 'CHECK FAILED: phone time kept'; end if;
  update rehearsal_sessions set anchor_ms = 3800000, anchor_at = now() - interval '1 day' where id = s1;
  if (select anchor_at from rehearsal_sessions where id = s1) <> now() then raise exception 'CHECK FAILED: odd phone time replaced'; end if;
  begin
    update rehearsal_sessions set removed_at = now() where id = s1;
    raise exception 'CHECK FAILED: crew removed someone else''s session';
  exception when insufficient_privilege then null; end;
  reset role;

  -- The viewer reads but doesn't write; the outsider sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from rehearsal_notes where session_id = s1;
  if n <> 1 then raise exception 'CHECK FAILED: viewer reads notes'; end if;
  begin
    insert into rehearsal_notes (session_id, gig_id, client_id, tc_ms, body) values (s1, g, gen_random_uuid(), 1, 'Viewer');
    raise exception 'CHECK FAILED: viewer wrote a note';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from rehearsal_sessions;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees sessions'; end if;
  begin
    insert into rehearsal_sessions (gig_id, name) values (g, 'Mine');
    raise exception 'CHECK FAILED: outsider started a session';
  exception when insufficient_privilege then null; end;
  reset role;

  -- The author removes the note; the PM removes the session; removed sessions take no notes
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update rehearsal_notes set removed_at = now() where id = n1;
  if (select removed_at from rehearsal_notes where id = n1) is null then raise exception 'CHECK FAILED: author removes'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update rehearsal_sessions set removed_at = now() where id = s1;
  begin
    insert into rehearsal_notes (session_id, gig_id, client_id, tc_ms, body) values (s1, g, gen_random_uuid(), 1, 'Late');
    raise exception 'CHECK FAILED: note on a removed session';
  exception when no_data_found then null; end;
  if public.server_now() is null then raise exception 'CHECK FAILED: server clock'; end if;
  reset role;

  raise exception 'ALL REHEARSAL CHECKS PASSED';
end $$;
