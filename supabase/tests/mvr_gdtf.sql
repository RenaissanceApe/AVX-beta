-- Checks for migration 20270104000000 (step 14: MVR and GDTF).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL MVR GDTF CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g1 uuid; aura uuid; other uuid; ft uuid; f1 uuid; n int; t text;
  u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'mvr-a@avx.invalid', 'authenticated', 'authenticated'), (b, 'mvr-b@avx.invalid', 'authenticated', 'authenticated'),
    (c, 'mvr-c@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', b) returning id into org_b;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_b, 'Their spot', 50, b, 'serial') returning id into other;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Light Co', a) returning id into org_a;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'MAC Aura XB', 80, a, 'serial') returning id into aura;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');

  -- A fixture type per catalogue item, with its modes
  insert into fixture_types (org_id, item_id, manufacturer, name, modes, weight_kg, power_w, file_path, file_name)
  values (org_a, aura, 'Martin', '  MAC Aura XB ', '[{"name": "Standard", "footprint": 14}]', 13.5, 470,
          org_a || '/' || aura || '/aura.gdtf', 'aura.gdtf') returning id into ft;
  select name into t from fixture_types where id = ft;
  if t <> 'MAC Aura XB' then raise exception 'CHECK FAILED: name not trimmed'; end if;
  begin
    insert into fixture_types (org_id, item_id, name) values (org_a, aura, 'Twice');
    raise exception 'CHECK FAILED: two fixture types for one item';
  exception when unique_violation then null; end;
  begin
    insert into fixture_types (org_id, item_id, name) values (org_a, other, 'Not ours');
    raise exception 'CHECK FAILED: another organisation''s item';
  exception when check_violation or insufficient_privilege then null; end;
  begin
    update fixture_types set file_path = org_b || '/x.gdtf' where id = ft;
    raise exception 'CHECK FAILED: file in another organisation''s folder';
  exception when check_violation then null; end;
  begin
    update fixture_types set modes = '{"name": "x"}' where id = ft;
    raise exception 'CHECK FAILED: modes that aren''t a list';
  exception when check_violation then null; end;

  -- Fixtures from an MVR file keep their MVR id, file name, number and height
  insert into gig_fixtures (gig_id, name, fixture_type, mode, footprint, universe, address, mvr_uuid, gdtf_spec, fixture_no, height_m, item_id)
  values (g1, 'Spot 1', 'MAC Aura XB', 'Standard', 14, 1, 1, u, 'Martin@MAC Aura XB.gdtf', 101, 6.5, aura) returning id into f1;
  begin
    insert into gig_fixtures (gig_id, name, fixture_type, footprint, mvr_uuid) values (g1, 'Spot 1 again', 'MAC Aura XB', 14, u);
    raise exception 'CHECK FAILED: one MVR fixture twice in a gig';
  exception when unique_violation then null; end;
  begin
    update gig_fixtures set fixture_no = 0 where id = f1;
    raise exception 'CHECK FAILED: fixture number 0';
  exception when check_violation then null; end;
  begin
    update gig_fixtures set height_m = 80 where id = f1;
    raise exception 'CHECK FAILED: height off the scale';
  exception when check_violation then null; end;
  reset role;

  -- Another organisation sees neither the fixture type nor its files
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from fixture_types where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: other organisation sees fixture types'; end if;
  update fixture_types set name = 'Hacked' where id = ft;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: other organisation changed a fixture type'; end if;
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('fixture-types', org_a || '/' || aura || '/evil.gdtf', b::text);
    raise exception 'CHECK FAILED: file put in another organisation''s folder';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Crew on the gig read the fixtures but not the catalogue's fixture types
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select fixture_no into n from gig_fixtures where id = f1;
  if n is distinct from 101 then raise exception 'CHECK FAILED: crew don''t see the fixture number'; end if;
  select count(*) into n from fixture_types where id = ft;
  if n <> 0 then raise exception 'CHECK FAILED: crew see fixture types'; end if;
  reset role;

  raise exception 'ALL MVR GDTF CHECKS PASSED';
end $$;
