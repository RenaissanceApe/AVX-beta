-- Checks for migration 20261114000000 (field tools F4: sound system calculator).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL SYSTEM CALCULATOR CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; g1 uuid; n int; t text;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'sc-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'sc-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'sc-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Sound Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  reset role;

  -- New organisations get all six tools
  select array_to_string(field_tools, ',') into t from organisations where id = org_a;
  if t <> 'stage_plot,input_list,patch,dmx_patch,light_plot,system_calc' then raise exception 'CHECK FAILED: default tools %', t; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_tools (gig_id, tool) values (g1, 'system_calc');
  insert into gig_show (gig_id, system) values (g1,
    '{"temp_c": 18, "sources": [{"id": "m1", "name": "Main L", "kind": "main", "x": -1, "y": 0}], "listeners": [{"id": "l1", "name": "FOH", "x": 5, "y": -25}]}');
  select system->'sources'->0->>'name' into t from gig_show where gig_id = g1;
  if t <> 'Main L' then raise exception 'CHECK FAILED: system not kept'; end if;
  begin
    update gig_show set system = '[1]' where gig_id = g1;
    raise exception 'CHECK FAILED: system that isn''t an object';
  exception when check_violation then null; end;
  reset role;

  -- Crew read but don't change it
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select system->>'temp_c' into t from gig_show where gig_id = g1;
  if t is distinct from '18' then raise exception 'CHECK FAILED: crew can''t read the system'; end if;
  update gig_show set system = '{}' where gig_id = g1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew changed the system'; end if;
  reset role;

  -- Outsiders see nothing
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_show where gig_id = g1;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees the show model'; end if;
  reset role;

  raise exception 'ALL SYSTEM CALCULATOR CHECKS PASSED';
end $$;
