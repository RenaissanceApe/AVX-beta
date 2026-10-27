-- Checks for migration 20261129000000 (tasks T1).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL TASK CHECKS PASSED"  → good
do $$
declare
  c uuid := gen_random_uuid(); k uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  m uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_c uuid; g uuid; g2 uuid; t1 uuid; t2 uuid; s uuid; note uuid; note2 uuid; n int; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (c, 'tk-c@avx.invalid', 'authenticated', 'authenticated'), (k, 'tk-k@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'tk-v@avx.invalid', 'authenticated', 'authenticated'), (m, 'tk-m@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'tk-x@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Task Co', c) returning id into org_c;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_c, m, 'member');
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_c, 'Task gig', current_date, current_date, 'confirmed', c) returning id into g;
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_c, 'Other gig', current_date, current_date, 'confirmed', c) returning id into g2;
  insert into gig_members (gig_id, user_id, role) values (g, c, 'pm'), (g, k, 'crew'), (g, v, 'viewer'), (g2, k, 'crew');

  -- The PM gives the crew member a task with a checklist; they're told
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into tasks (gig_id, title, assignee_id, due_on, checklist, created_by)
  values (g, ' Tape the cable runs ', k, current_date, '[{"id":"a","text":"Stage left","done":false},{"id":"b","text":"FOH snake","done":false}]', x)
  returning id into t1;
  select * into r from tasks where id = t1;
  if r.title <> 'Tape the cable runs' or r.org_id <> org_c or r.created_by <> c then raise exception 'CHECK FAILED: task stamped'; end if;
  begin
    insert into tasks (gig_id, title, assignee_id) values (g, 'Nobody', x);
    raise exception 'CHECK FAILED: assignee off the gig';
  exception when invalid_parameter_value then null; end;
  begin
    insert into tasks (gig_id, title, checklist) values (g, 'Bad list', '[{"id":"a","text":""}]');
    raise exception 'CHECK FAILED: empty checklist item';
  exception when invalid_parameter_value then null; end;
  insert into tasks (gig_id, title, assignee_id) values (g, 'Mine', c);
  reset role;
  if (select count(*) from notifications where kind = 'task_assigned' and user_id = k and details->>'gig_name' = 'Task gig' and gig_id = g) <> 1 then
    raise exception 'CHECK FAILED: assignment notified';
  end if;
  if exists (select 1 from notifications where kind = 'task_assigned' and user_id = c) then raise exception 'CHECK FAILED: told about own task'; end if;

  -- The crew member ticks it, but can't rewrite it
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update tasks set checklist = '[{"id":"a","text":"Stage left","done":true},{"id":"b","text":"FOH snake","done":false}]' where id = t1;
  update tasks set status = 'done' where id = t1;
  select * into r from tasks where id = t1;
  if r.status <> 'done' or r.done_by <> k or (r.checklist->0->>'done')::boolean is not true then raise exception 'CHECK FAILED: ticked'; end if;
  begin
    update tasks set title = 'Renamed' where id = t1;
    raise exception 'CHECK FAILED: crew renamed a task';
  exception when insufficient_privilege then null; end;
  begin
    update tasks set checklist = '[{"id":"a","text":"Other","done":true}]' where id = t1;
    raise exception 'CHECK FAILED: crew rewrote the checklist';
  exception when insufficient_privilege then null; end;
  begin
    insert into tasks (gig_id, title) values (g, 'Crew task');
    raise exception 'CHECK FAILED: crew created a task';
  exception when insufficient_privilege then null; end;
  reset role;

  -- The viewer reads but can't tick; the outsider sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from tasks where gig_id = g;
  if n <> 2 then raise exception 'CHECK FAILED: viewer reads (%)', n; end if;
  update tasks set status = 'open' where id = t1;
  reset role;
  if (select status from tasks where id = t1) <> 'done' then raise exception 'CHECK FAILED: viewer ticked'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from tasks) <> 0 then raise exception 'CHECK FAILED: outsider sees tasks'; end if;
  reset role;

  -- Organisation tasks: members only
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into tasks (org_id, title, assignee_id) values (org_c, 'Renew insurance', m) returning id into t2;
  begin
    insert into tasks (org_id, title, assignee_id) values (org_c, 'Outsider job', x);
    raise exception 'CHECK FAILED: org task to an outsider';
  exception when invalid_parameter_value then null; end;
  reset role;
  if (select count(*) from notifications where kind = 'task_assigned' and user_id = m and gig_id is null and org_id = org_c) <> 1 then
    raise exception 'CHECK FAILED: org assignment notified';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if exists (select 1 from tasks where id = t2) then raise exception 'CHECK FAILED: crew sees org tasks'; end if;
  -- A rehearsal note to turn into a task
  insert into rehearsal_sessions (gig_id, name) values (g, 'Run 1') returning id into s;
  insert into rehearsal_notes (session_id, gig_id, client_id, tc_ms, body) values (s, g, gen_random_uuid(), 1000, 'Spot late') returning id into note;
  insert into rehearsal_sessions (gig_id, name) values (g2, 'Run 1') returning id into s;
  insert into rehearsal_notes (session_id, gig_id, client_id, tc_ms, body) values (s, g2, gen_random_uuid(), 1000, 'Other gig') returning id into note2;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into tasks (gig_id, title, source_kind, source_id) values (g, 'Spot late', 'rehearsal_note', note);
  begin
    insert into tasks (gig_id, title, source_kind, source_id) values (g, 'Again', 'rehearsal_note', note);
    raise exception 'CHECK FAILED: one task per note';
  exception when unique_violation then null; end;
  begin
    insert into tasks (gig_id, title, source_kind, source_id) values (g, 'Wrong gig', 'rehearsal_note', note2);
    raise exception 'CHECK FAILED: note from another gig';
  exception when invalid_parameter_value then null; end;
  -- The PM removes a task (only marked)
  update tasks set removed_at = now() where id = t1;
  if (select removed_at from tasks where id = t1) is null then raise exception 'CHECK FAILED: removed'; end if;
  reset role;

  raise exception 'ALL TASK CHECKS PASSED';
end $$;
