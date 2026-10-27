-- Checks for migration 20261130000000 (tasks T2: templates, repairs as tasks).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL TASK T2 CHECKS PASSED"  → good
do $$
declare
  c uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_c uuid; org_x uuid; tpl uuid; item uuid; rep uuid; rep_x uuid; t uuid; n int; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (c, 't2-c@avx.invalid', 'authenticated', 'authenticated'), (m, 't2-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 't2-v@avx.invalid', 'authenticated', 'authenticated'), (x, 't2-x@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('T2 Co', c) returning id into org_c;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Elsewhere', x) returning id into org_x;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_c, m, 'member'), (org_c, v, 'viewer');

  -- A member makes a template; text tidied, author stamped
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into task_templates (org_id, name, notes, items, created_by)
  values (org_c, '  Van check ', 'Before leaving', '["Tyres", "Straps", "Fuel"]', x) returning id into tpl;
  select * into r from task_templates where id = tpl;
  if r.name <> 'Van check' or r.created_by <> m or jsonb_array_length(r.items) <> 3 then raise exception 'CHECK FAILED: template stamped'; end if;
  begin
    insert into task_templates (org_id, name, items) values (org_c, 'Bad', '[""]');
    raise exception 'CHECK FAILED: empty template item';
  exception when invalid_parameter_value then null; end;
  begin
    insert into task_templates (org_id, name, items) values (org_c, 'Bad', '[{"text":"x"}]');
    raise exception 'CHECK FAILED: template item not text';
  exception when invalid_parameter_value then null; end;
  begin
    update task_templates set org_id = org_x where id = tpl;
    raise exception 'CHECK FAILED: template moved';
  exception when insufficient_privilege then null; end;
  update task_templates set items = '["Tyres", "Straps"]' where id = tpl;
  if (select jsonb_array_length(items) from task_templates where id = tpl) <> 2 then raise exception 'CHECK FAILED: template edited'; end if;
  reset role;

  -- The viewer reads templates but can't make or change them; an outsider sees none
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from task_templates where org_id = org_c) <> 1 then raise exception 'CHECK FAILED: viewer reads templates'; end if;
  begin
    insert into task_templates (org_id, name) values (org_c, 'Viewer template');
    raise exception 'CHECK FAILED: viewer made a template';
  exception when insufficient_privilege then null; end;
  update task_templates set name = 'Renamed' where id = tpl;
  reset role;
  if (select name from task_templates where id = tpl) <> 'Van check' then raise exception 'CHECK FAILED: viewer renamed'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if exists (select 1 from task_templates where id = tpl) then raise exception 'CHECK FAILED: outsider sees templates'; end if;
  reset role;

  -- A repair turned into a task, once; not from another organisation's repair, not on a gig
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_c, 'Dimmer', 10, c, 'bulk') returning id into item;
  insert into repairs (org_id, item_id, problem) values (org_c, item, 'Channel 4 dead') returning id into rep;
  insert into tasks (org_id, title, assignee_id, repair_id) values (org_c, 'Repair: Dimmer', m, rep) returning id into t;
  if (select repair_id from tasks where id = t) <> rep then raise exception 'CHECK FAILED: repair task'; end if;
  begin
    insert into tasks (org_id, title, repair_id) values (org_c, 'Again', rep);
    raise exception 'CHECK FAILED: one task per repair';
  exception when unique_violation then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_x, 'Their amp', 10, x, 'bulk') returning id into item;
  insert into repairs (org_id, item_id, problem) values (org_x, item, 'Fan') returning id into rep_x;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into tasks (org_id, title, repair_id) values (org_c, 'Not ours', rep_x);
    raise exception 'CHECK FAILED: another organisation''s repair';
  exception when invalid_parameter_value or foreign_key_violation then null; end;
  -- The repair link can't be changed afterwards
  begin
    update tasks set repair_id = null where id = t;
    raise exception 'CHECK FAILED: repair link changed';
  exception when insufficient_privilege then null; end;
  -- Removing the task lets the repair have a new one
  update tasks set removed_at = now() where id = t;
  insert into tasks (org_id, title, repair_id) values (org_c, 'Repair again', rep);
  -- Removing a template only marks it
  update task_templates set removed_at = now() where id = tpl;
  reset role;
  if (select removed_at from task_templates where id = tpl) is null then raise exception 'CHECK FAILED: template removed'; end if;
  select count(*) into n from tasks where repair_id = rep;
  if n <> 2 then raise exception 'CHECK FAILED: repair tasks (%)', n; end if;

  raise exception 'ALL TASK T2 CHECKS PASSED';
end $$;
