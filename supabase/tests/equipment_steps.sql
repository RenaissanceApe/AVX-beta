-- Checks for migration 20261109000000 (equipment steps, undoing a scan).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL EQUIPMENT STEP CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  org_a uuid; wh uuid; g1 uuid; g2 uuid; speaker uuid; cable uuid; scase uuid;
  u1 uuid; u2 uuid; k1 uuid; c1 text; c2 text; ck text; n int; r jsonb; batch1 uuid; batch2 uuid; s record;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'st-a@avx.invalid', 'authenticated', 'authenticated'), (b, 'st-b@avx.invalid', 'authenticated', 'authenticated'),
    (c, 'st-c@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Steps Co', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, b, 'member');
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into price_items (org_id, name, unit_price, created_by, tracking, code) values (org_a, 'Speaker', 60, a, 'serial', 'SPK') returning id into speaker;
  insert into price_items (org_id, name, unit_price, created_by, tracking, code) values (org_a, 'XLR', 2, a, 'bulk', 'XLR') returning id into cable;
  insert into price_items (org_id, name, unit_price, created_by, tracking, kit_type) values (org_a, 'Speaker case', 10, a, 'serial', 'case') returning id into scase;
  insert into item_parts (parent_id, child_id, kind, quantity) values (scase, speaker, 'content', 1), (scase, cable, 'content', 2);
  insert into stock_units (org_id, item_id, location_id) values (org_a, speaker, wh) returning id, code into u1, c1;
  insert into stock_units (org_id, item_id, location_id) values (org_a, speaker, wh) returning id, code into u2, c2;
  insert into stock_units (org_id, item_id, location_id) values (org_a, scase, wh) returning id, code into k1, ck;
  update stock_units set case_unit_id = k1 where id = u2;
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, cable, 'purchase', 50, wh);
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'confirmed') returning id into g1;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 2', a, '2026-11-12', 'confirmed') returning id into g2;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  insert into gig_equipment (gig_id, item_id, quantity) values (g1, speaker, 2), (g1, cable, 10);

  -- All six steps by default; loaded and returned can't be turned off
  select equipment_steps into s from organisations where id = org_a;
  if array_length(s.equipment_steps, 1) <> 6 then raise exception 'CHECK FAILED: default steps %', s.equipment_steps; end if;
  begin
    update organisations set equipment_steps = array['prepped', 'returned'] where id = org_a;
    raise exception 'CHECK FAILED: loaded turned off';
  exception when check_violation then null; end;
  begin
    update organisations set equipment_steps = array['loaded', 'returned', 'polished'] where id = org_a;
    raise exception 'CHECK FAILED: unknown step';
  exception when check_violation then null; end;

  -- Prepped: a unit, the same unit again, bulk, a case with its contents
  r := step_scan(g1, lower(c1), 'prepped');
  if not (r->>'ok')::boolean or r->>'warning' is not null or (r->>'done')::int <> 1 or r->>'batch' is null then raise exception 'CHECK FAILED: prepped unit %', r; end if;
  batch1 := (r->>'batch')::uuid;
  r := step_scan(g1, c1, 'prepped');
  if r->>'error' <> 'already_step' then raise exception 'CHECK FAILED: prepped twice %', r; end if;
  r := step_scan(g1, 'xlr', 'prepped', 6);
  if (r->>'done')::int <> 6 or r->>'kind' <> 'bulk' then raise exception 'CHECK FAILED: prepped bulk %', r; end if;
  r := step_scan(g1, ck, 'prepped');
  if (r->>'contents')::int <> 2 or r->>'warning' <> 'not_planned' then raise exception 'CHECK FAILED: prepped case %', r; end if;
  select count(*) into n from gig_steps where gig_id = g1 and step = 'prepped' and undone_at is null;
  if n <> 5 then raise exception 'CHECK FAILED: % prepped rows', n; end if;
  r := step_scan(g1, 'SPK', 'prepped');
  if r->>'error' <> 'scan_units' then raise exception 'CHECK FAILED: serial item code %', r; end if;
  r := step_scan(g1, c1, 'on_site');
  if r->>'warning' <> 'not_out' then raise exception 'CHECK FAILED: on site before out %', r; end if;
  begin
    perform step_scan(g1, c1, 'loaded');
    raise exception 'CHECK FAILED: loaded is a dispatch scan, not a step';
  exception when invalid_parameter_value then null; end;

  -- An organisation that turned a step off
  reset role;
  update organisations set equipment_steps = array['loaded', 'returned'] where id = org_a;
  set local role authenticated;
  r := step_scan(g1, c1, 'checked_in');
  if r->>'error' <> 'step_off' then raise exception 'CHECK FAILED: step turned off %', r; end if;
  reset role;
  update organisations set equipment_steps = array['prepped', 'loaded', 'on_site', 'loaded_back', 'returned', 'checked_in'] where id = org_a;
  set local role authenticated;

  -- Crew can see steps but not scan them
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin
    perform step_scan(g1, c2, 'prepped');
    raise exception 'CHECK FAILED: crew scanned a step';
  exception when insufficient_privilege then null; end;
  select count(*) into n from gig_step_summary(g1);
  if n = 0 then raise exception 'CHECK FAILED: crew sees no summary'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- Undo a step scan: only yours
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := undo_scan(g1, batch1);
  if r->>'error' <> 'not_yours' then raise exception 'CHECK FAILED: undo someone else''s scan %', r; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  r := undo_scan(g1, batch1);
  if not (r->>'ok')::boolean then raise exception 'CHECK FAILED: undo step %', r; end if;
  r := undo_scan(g1, batch1);
  if r->>'error' <> 'nothing' then raise exception 'CHECK FAILED: undo twice %', r; end if;
  r := step_scan(g1, c1, 'prepped');
  if not (r->>'ok')::boolean then raise exception 'CHECK FAILED: prepped again after undo %', r; end if;

  -- Undo a scan out: the unit is back in the warehouse and the counts drop
  r := dispatch_scan(g1, c1, 'out');
  batch1 := (r->>'batch')::uuid;
  if batch1 is null or (r->>'out')::int <> 1 then raise exception 'CHECK FAILED: scan out %', r; end if;
  r := undo_scan(g1, batch1);
  if not (r->>'ok')::boolean then raise exception 'CHECK FAILED: undo out %', r; end if;
  select out_on_gig into s from stock_units where id = u1;
  if s.out_on_gig is not null then raise exception 'CHECK FAILED: unit still out after undo'; end if;
  select out_qty into n from gig_dispatch_summary(g1) where item_id = speaker;
  if n <> 0 then raise exception 'CHECK FAILED: undone scan still counted (%)', n; end if;

  -- Undo after something else happened to the unit: refused
  r := dispatch_scan(g1, c1, 'out');
  batch1 := (r->>'batch')::uuid;
  r := dispatch_scan(g1, c1, 'in');
  batch2 := (r->>'batch')::uuid;
  r := undo_scan(g1, batch1);
  if r->>'error' <> 'moved_since' then raise exception 'CHECK FAILED: undo out after in %', r; end if;
  r := undo_scan(g1, batch2);
  if not (r->>'ok')::boolean then raise exception 'CHECK FAILED: undo in %', r; end if;
  select out_on_gig into s from stock_units where id = u1;
  if s.out_on_gig is distinct from g1 then raise exception 'CHECK FAILED: undoing the return didn''t put the unit back out'; end if;

  -- A case and its contents are one scan, undone together
  r := dispatch_scan(g1, ck, 'out');
  batch1 := (r->>'batch')::uuid;
  select count(*) into n from gig_dispatch where batch = batch1;
  if n <> 3 then raise exception 'CHECK FAILED: case batch has % rows', n; end if;
  r := undo_scan(g1, batch1);
  if not (r->>'ok')::boolean then raise exception 'CHECK FAILED: undo case %', r; end if;
  select count(*) into n from stock_units where id in (k1, u2) and out_on_gig is not null;
  if n <> 0 then raise exception 'CHECK FAILED: case contents still out after undo'; end if;

  -- A unit that was lost and turned up on a scan out is lost again after undo
  reset role;
  update stock_units set status = 'lost' where id = u2;
  set local role authenticated;
  r := dispatch_scan(g2, c2, 'out');
  if r->>'warning' <> 'was_lost' then raise exception 'CHECK FAILED: lost unit out %', r; end if;
  r := undo_scan(g2, (r->>'batch')::uuid);
  select status into s from stock_units where id = u2;
  if s.status <> 'lost' then raise exception 'CHECK FAILED: lost unit is % after undo', s.status; end if;

  -- A damaged return opens a repair: no undo here
  r := dispatch_scan(g1, 'XLR', 'out', 10);
  r := dispatch_scan(g1, 'XLR', 'in', 1, 'damaged');
  if not (r->>'repair')::boolean then raise exception 'CHECK FAILED: no repair %', r; end if;
  r := undo_scan(g1, (r->>'batch')::uuid);
  if r->>'error' <> 'damaged' then raise exception 'CHECK FAILED: undid a damaged return %', r; end if;

  -- Too late after 15 minutes
  reset role;
  update gig_dispatch set created_at = now() - interval '20 minutes' where batch = batch2;
  update gig_dispatch set undone_at = null where batch = batch2;
  set local role authenticated;
  r := undo_scan(g1, batch2);
  if r->>'error' <> 'too_late' then raise exception 'CHECK FAILED: undo after 20 minutes %', r; end if;

  -- The summary: a unit back in has reached every step up to returned
  r := step_scan(g1, c1, 'checked_in');
  select done into n from gig_step_summary(g1) where item_id = speaker and step = 'loaded';
  if n <> 1 then raise exception 'CHECK FAILED: loaded % (unit out and back)', n; end if;
  select done into n from gig_step_summary(g1) where item_id = speaker and step = 'checked_in';
  if n <> 1 then raise exception 'CHECK FAILED: checked in %', n; end if;
  select done into n from gig_step_summary(g1) where item_id = cable and step = 'prepped';
  if n <> 10 then raise exception 'CHECK FAILED: bulk prepped % (10 went out)', n; end if;

  -- Nobody writes the logs directly
  begin
    insert into gig_steps (gig_id, org_id, item_id, step, quantity) values (g1, org_a, cable, 'prepped', 1);
    raise exception 'CHECK FAILED: wrote a step directly';
  exception when insufficient_privilege then null; end;
  update gig_dispatch set undone_at = now() where gig_id = g1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: changed the dispatch log directly'; end if;

  -- A case returning remembers its contents were out, so undoing the return puts them back
  reset role;
  update stock_units set status = 'available' where id = u2;
  set local role authenticated;
  r := dispatch_scan(g1, ck, 'out');
  r := dispatch_scan(g1, ck, 'in');
  select count(*) into n from gig_dispatch where batch = (r->>'batch')::uuid and unit_id is not null and prev_out_on_gig = g1;
  if n <> 2 then raise exception 'CHECK FAILED: % unit rows (the case and its speaker) remember they were out', n; end if;
  r := undo_scan(g1, (r->>'batch')::uuid);
  select count(*) into n from stock_units where id in (k1, u2) and out_on_gig = g1;
  if n <> 2 then raise exception 'CHECK FAILED: undoing the case return put % back out', n; end if;
  reset role;

  -- Outsiders see no steps
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_step_summary(g1);
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees the step summary'; end if;
  select count(*) into n from gig_steps where gig_id = g1;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees the steps'; end if;
  reset role;

  select count(*) into n from pg_policies where schemaname = 'public' and tablename in ('gig_dispatch', 'gig_steps') and cmd <> 'SELECT' and permissive = 'PERMISSIVE';
  if n <> 0 then raise exception 'CHECK FAILED: the scan logs have write rules'; end if;
  raise exception 'ALL EQUIPMENT STEP CHECKS PASSED';
end $$;
