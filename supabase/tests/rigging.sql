-- Checks for migration 20270107000000 (rigging RG1: gig_show.rigging and hoist models).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL RIGGING CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  org_a uuid; org_o uuid; g1 uuid; m1 uuid; n int; t text; ok boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'rg-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'rg-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'rg-o@avx.invalid', 'authenticated', 'authenticated'), (v, 'rg-v@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Rig Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', o) returning id into org_o;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, v, 'viewer') on conflict do nothing;

  -- The presets are there, all needing a check; Lodestar ones have no WLL
  select count(*) into n from hoist_models where org_id is null and needs_check;
  if n < 6 then raise exception 'CHECK FAILED: presets missing (%)', n; end if;
  select count(*) into n from hoist_models where org_id is null and brand = 'CM Lodestar' and wll_kg is not null;
  if n <> 0 then raise exception 'CHECK FAILED: a Lodestar preset has a WLL nobody read from a data sheet'; end if;
  select wll_kg::text into t from hoist_models where id = '5e120000-0000-4000-8000-000000001001';
  if t is distinct from '1000.0' then raise exception 'CHECK FAILED: Chainmaster 1000 kg preset WLL %', t; end if;

  -- The rigging is kept with the show model; editors write it
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_show (gig_id, rigging) values (g1,
    '{"settings": {"cable_kg_m": 5, "dynamic_factor": 1.2}, "lines": [{"id": "l1", "name": "Truss 1", "length_m": 10, "points": []}]}');
  select rigging->'lines'->0->>'name' into t from gig_show where gig_id = g1;
  if t <> 'Truss 1' then raise exception 'CHECK FAILED: rigging not kept'; end if;
  begin
    update gig_show set rigging = '[1]' where gig_id = g1;
    raise exception 'CHECK FAILED: rigging that isn''t an object';
  exception when check_violation then null; end;

  -- An editor adds a model from a data plate; it always starts as needing a check
  insert into hoist_models (org_id, brand, model, class, wll_kg, source, needs_check)
    values (org_a, 'Acme', 'D8 500', 'D8', 500, 'data plate', false) returning id into m1;
  select needs_check into ok from hoist_models where id = m1;
  if not ok then raise exception 'CHECK FAILED: a new model skipped the check'; end if;
  -- …and can't move it to another organisation or change who made it
  update hoist_models set org_id = org_o, created_by = o where id = m1;
  select org_id = org_a and created_by = a into ok from hoist_models where id = m1;
  if not ok then raise exception 'CHECK FAILED: model moved or creator changed'; end if;
  begin
    insert into hoist_models (org_id, brand, model, class) values (org_a, 'Acme', 'X', 'D9');
    raise exception 'CHECK FAILED: unknown class accepted';
  exception when check_violation then null; end;
  -- Presets can't be added or changed
  begin
    insert into hoist_models (org_id, brand, model, class) values (null, 'Fake', 'Preset', 'C1');
    raise exception 'CHECK FAILED: a preset was added';
  exception when insufficient_privilege then null; end;
  update hoist_models set wll_kg = 9999 where id = '5e120000-0000-4000-8000-000000000501';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: a preset was changed'; end if;
  -- Removing is marking
  update hoist_models set removed_at = now() where id = m1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: model not marked removed'; end if;
  reset role;

  -- Crew read the rigging but don't change it, and don't see the organisation's own models
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select rigging->'settings'->>'dynamic_factor' into t from gig_show where gig_id = g1;
  if t is distinct from '1.2' then raise exception 'CHECK FAILED: crew can''t read the rigging'; end if;
  update gig_show set rigging = '{}' where gig_id = g1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew changed the rigging'; end if;
  select count(*) into n from hoist_models where id = m1;
  if n <> 0 then raise exception 'CHECK FAILED: crew outside the organisation see its models'; end if;
  select count(*) into n from hoist_models where org_id is null;
  if n < 6 then raise exception 'CHECK FAILED: crew can''t see the presets'; end if;
  reset role;

  -- A viewer in the organisation reads its models but doesn't add any
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from hoist_models where id = m1;
  if n <> 1 then raise exception 'CHECK FAILED: viewer can''t read the organisation''s models'; end if;
  begin
    insert into hoist_models (org_id, brand, model, class) values (org_a, 'Viewer', 'X', 'D8');
    raise exception 'CHECK FAILED: viewer added a model';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Outsiders see nothing of the gig or the organisation's models
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_show where gig_id = g1;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees the show model'; end if;
  select count(*) into n from hoist_models where id = m1;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees the organisation''s models'; end if;
  begin
    insert into hoist_models (org_id, brand, model, class) values (org_a, 'Outsider', 'X', 'D8');
    raise exception 'CHECK FAILED: outsider added a model';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL RIGGING CHECKS PASSED';
end $$;
