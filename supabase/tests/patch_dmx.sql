-- Checks for migration 20261112000000 (field tools F2: audio patch and DMX patch).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL PATCH AND DMX CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g1 uuid; aura uuid; other uuid; f1 uuid; n int; t text;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'dmx-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'dmx-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'dmx-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Light Co', a) returning id into org_a;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'MAC Aura XB', 80, a, 'serial') returning id into aura;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', o) returning id into org_b;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_b, 'Their spot', 80, o, 'serial') returning id into other;
  reset role;

  -- New organisations get the four tools
  select array_to_string(field_tools, ',') into t from organisations where id = org_a;
  if t <> 'stage_plot,input_list,patch,dmx_patch' then raise exception 'CHECK FAILED: default tools %', t; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_tools (gig_id, tool) values (g1, 'patch'), (g1, 'dmx_patch');
  -- Stage boxes live in the show model
  insert into gig_show (gig_id, audio) values (g1, '{"boxes": [{"name": "SB1", "inputs": 32, "split": true}]}');
  select audio->'boxes'->0->>'name' into t from gig_show where gig_id = g1;
  if t <> 'SB1' then raise exception 'CHECK FAILED: stage boxes not kept'; end if;
  begin
    update gig_show set audio = '[]' where gig_id = g1;
    raise exception 'CHECK FAILED: audio that isn''t an object';
  exception when check_violation then null; end;

  -- Fixtures: four on universe 1, one with a catalogue item
  insert into gig_fixtures (gig_id, name, fixture_type, mode, footprint, universe, address, item_id)
  values (g1, ' Spot 1 ', 'MAC Aura XB', 'Extended', 14, 1, 1, aura) returning id into f1;
  insert into gig_fixtures (gig_id, name, fixture_type, footprint, universe, address)
  values (g1, 'Spot 2', 'MAC Aura XB', 14, 1, 15), (g1, 'Wash 1', 'LED par', 7, 1, 29), (g1, 'Haze', 'Hazer', 2, 2, null);
  select name into t from gig_fixtures where id = f1;
  if t <> 'Spot 1' then raise exception 'CHECK FAILED: name not trimmed'; end if;
  begin
    insert into gig_fixtures (gig_id, name, fixture_type, footprint, universe, address) values (g1, 'Too far', 'Spot', 14, 1, 500);
    raise exception 'CHECK FAILED: fixture past channel 512';
  exception when check_violation then null; end;
  begin
    insert into gig_fixtures (gig_id, name, fixture_type, footprint, universe, address, item_id) values (g1, 'X', 'Spot', 1, 1, 100, other);
    raise exception 'CHECK FAILED: another company''s item';
  exception when check_violation then null; end;
  -- Overlaps are allowed (the app warns)
  insert into gig_fixtures (gig_id, name, fixture_type, footprint, universe, address) values (g1, 'Twin', 'LED par', 7, 1, 29);
  update gig_fixtures set address = 36 where name = 'Twin' and gig_id = g1;
  reset role;

  -- Crew read, but don't change
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_fixtures where gig_id = g1;
  if n <> 5 then raise exception 'CHECK FAILED: crew see % fixtures', n; end if;
  update gig_fixtures set address = 1 where gig_id = g1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew readdressed'; end if;
  update gig_show set audio = '{}' where gig_id = g1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew changed the stage boxes'; end if;
  reset role;

  -- Outsiders see nothing
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_fixtures where gig_id = g1;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees fixtures'; end if;
  begin
    insert into gig_fixtures (gig_id, name, fixture_type, footprint) values (g1, 'Mine', 'Spot', 1);
    raise exception 'CHECK FAILED: outsider added a fixture';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL PATCH AND DMX CHECKS PASSED';
end $$;
