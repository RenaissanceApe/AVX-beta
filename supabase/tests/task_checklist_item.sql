-- Checks for migration 20270125000000 (BF5: tick one checklist item, issue 236).
-- Run in the TEST project's SQL editor after the tasks migrations. Rolls itself back; ends with
--   "ALL CHECKLIST ITEM CHECKS PASSED"  → good
do $$
declare
  c uuid := gen_random_uuid(); k uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  o uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  org_c uuid; g uuid; t1 uuid; t2 uuid; r record; stamp timestamptz;
begin
  insert into auth.users (id, email, aud, role) values
    (c, 'ci-c@avx.invalid', 'authenticated', 'authenticated'), (k, 'ci-k@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'ci-v@avx.invalid', 'authenticated', 'authenticated'), (o, 'ci-o@avx.invalid', 'authenticated', 'authenticated'),
    (m, 'ci-m@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Checklist Co', c) returning id into org_c;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_c, m, 'member');
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_c, 'Checklist gig', current_date, current_date, 'confirmed', c) returning id into g;
  insert into gig_members (gig_id, user_id, role) values (g, c, 'pm'), (g, k, 'crew'), (g, v, 'viewer');

  -- The PM writes a task for the crew member with three items, and an organisation task
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into tasks (gig_id, title, assignee_id, checklist)
  values (g, 'Tape the cable runs', k, '[{"id":"a","text":"Stage left","done":false},{"id":"b","text":"FOH snake","done":false},{"id":"c","text":"Riser","done":true}]')
  returning id, updated_at into t1, stamp;
  insert into tasks (org_id, title, checklist) values (org_c, 'Clean the van', '[{"id":"x","text":"Mop","done":false}]') returning id into t2;
  reset role;

  -- The assignee ticks one item: only that item changes, the order stays, updated_at moves on
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.set_task_checklist_item(t1, 'b', true);
  if r.checklist <> '[{"id":"a","text":"Stage left","done":false},{"id":"b","text":"FOH snake","done":true},{"id":"c","text":"Riser","done":true}]'::jsonb then
    raise exception 'CHECK FAILED: one item ticked (%)', r.checklist;
  end if;
  if (select checklist from tasks where id = t1) <> r.checklist then raise exception 'CHECK FAILED: saved list returned'; end if;
  if r.updated_at is null or r.updated_at < stamp then raise exception 'CHECK FAILED: updated_at moved on'; end if;
  reset role;

  -- Meanwhile the PM ticks another item: both ticks are kept (the bug in issue 236)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_task_checklist_item(t1, 'a', true);
  perform public.set_task_checklist_item(t1, 'c', false);
  if (select checklist from tasks where id = t1) <> '[{"id":"a","text":"Stage left","done":true},{"id":"b","text":"FOH snake","done":true},{"id":"c","text":"Riser","done":false}]'::jsonb then
    raise exception 'CHECK FAILED: both people''s ticks kept';
  end if;
  -- An item that isn't there: refused, nothing changes
  begin
    perform public.set_task_checklist_item(t1, 'zz', true);
    raise exception 'CHECK FAILED: unknown item';
  exception when no_data_found then null; end;
  -- A member of the organisation ticks the organisation's task
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_task_checklist_item(t2, 'x', true);
  if (select checklist->0->>'done' from tasks where id = t2) <> 'true' then raise exception 'CHECK FAILED: org task ticked'; end if;
  reset role;

  -- A viewer on the gig can read the task but may not tick it
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.set_task_checklist_item(t1, 'a', false);
    raise exception 'CHECK FAILED: viewer ticked';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Someone outside the gig and the organisation: refused for both tasks, nothing changes
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.set_task_checklist_item(t1, 'a', false);
    raise exception 'CHECK FAILED: outsider ticked a gig task';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_task_checklist_item(t2, 'x', false);
    raise exception 'CHECK FAILED: outsider ticked an org task';
  exception when insufficient_privilege then null; end;
  reset role;
  if (select checklist->0->>'done' from tasks where id = t1) <> 'true' or (select checklist->0->>'done' from tasks where id = t2) <> 'true' then
    raise exception 'CHECK FAILED: refused ticks left the lists alone';
  end if;

  -- Not signed in: no access at all
  begin
    set local role anon;
    perform public.set_task_checklist_item(t1, 'a', false);
    raise exception 'CHECK FAILED: anon ticked';
  exception when insufficient_privilege then null; end;
  reset role;

  -- A removed task can't be ticked
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update tasks set removed_at = now() where id = t1;
  begin
    perform public.set_task_checklist_item(t1, 'a', false);
    raise exception 'CHECK FAILED: removed task ticked';
  exception when no_data_found then null; end;
  reset role;

  raise exception 'ALL CHECKLIST ITEM CHECKS PASSED';
end $$;
