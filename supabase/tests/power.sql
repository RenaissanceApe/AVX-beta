-- Checks for migration 20270106000000 (S09 · P1: electrical fields on catalogue items, the gig's
-- power plan). Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL POWER CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; g1 uuid; res jsonb; n int; t text; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'pw-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'pw-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'pw-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Power Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');

  -- Typed by hand: the electrical fields and a distro's outputs are kept
  insert into price_items (org_id, created_by, name, kind, unit, power_w, power_typical_w, power_factor, inrush_a, connector_in, connector_out)
  values (org_a, a, 'Spot', 'rental', 'day', 700, 450, 0.95, 40, 'powercon_true1', 'powercon_true1');
  insert into price_items (org_id, created_by, name, kind, unit, current_a, current_v, connector_in)
  values (org_a, a, 'Amp', 'rental', 'day', 8, 230, 'cee16_1');
  insert into price_items (org_id, created_by, name, kind, unit, connector_in, distro)
  values (org_a, a, 'Distro 63', 'rental', 'day', 'cee63_3',
    '{"inputs": [{"connector": "cee63_3"}], "outputs": [{"id": "o1", "connector": "cee32_3", "phase": "3P", "breaker_a": 32, "rcd_ma": 30},
      {"id": "o2", "connector": "schuko", "phase": "L1", "breaker_a": 16, "rcd_ma": 30}]}');
  select * into r from price_items where org_id = org_a and name = 'Spot';
  if r.power_factor <> 0.95 or r.power_typical_w <> 450 or r.connector_in <> 'powercon_true1' then
    raise exception 'CHECK FAILED: electrical fields not kept %', row_to_json(r);
  end if;
  select jsonb_array_length(distro -> 'outputs') into n from price_items where org_id = org_a and name = 'Distro 63';
  if n <> 2 then raise exception 'CHECK FAILED: distro outputs %', n; end if;

  -- Out-of-range values are refused
  begin update price_items set power_factor = 1.2 where id = r.id; raise exception 'CHECK FAILED: power factor 1.2';
  exception when check_violation then null; end;
  begin update price_items set connector_in = 'usb' where id = r.id; raise exception 'CHECK FAILED: unknown connector';
  exception when check_violation then null; end;
  begin update price_items set current_a = 5, current_v = null where id = r.id; raise exception 'CHECK FAILED: amps without volts';
  exception when check_violation then null; end;
  begin update price_items set distro = '{"outputs": []}' where id = r.id; raise exception 'CHECK FAILED: distro without outputs';
  exception when check_violation then null; end;
  begin update price_items set distro = '[1]' where id = r.id; raise exception 'CHECK FAILED: distro not an object';
  exception when check_violation then null; end;

  -- The import creates items with electrical fields, updates only the cells given, and refuses a bad row
  res := run_import(org_a, 'items', '[
    {"_row": 2, "name": "Wash", "code": "WSH", "power_w": 600, "power_factor": 0.98, "inrush_a": 25, "connector_in": "powercon"},
    {"_row": 3, "name": "Bad amp", "code": "BAD", "current_a": 6}
  ]', 'power.csv');
  if (res ->> 'created')::int <> 1 or (res ->> 'skipped')::int <> 1 then raise exception 'CHECK FAILED: import %', res; end if;
  if (res -> 'problems' -> 0 ->> 'message') not like '%price_items_power_check%' then
    raise exception 'CHECK FAILED: bad row message %', res -> 'problems';
  end if;
  res := run_import(org_a, 'items', '[{"code": "WSH", "current_a": 2.7, "current_v": 230}]');
  if (res ->> 'updated')::int <> 1 then raise exception 'CHECK FAILED: re-import %', res; end if;
  select * into r from price_items where org_id = org_a and code = 'WSH';
  if r.current_a <> 2.7 or r.power_factor <> 0.98 or r.connector_in <> 'powercon' then
    raise exception 'CHECK FAILED: update lost cells %', row_to_json(r);
  end if;
  perform undo_import((res ->> 'batch')::uuid);
  select current_a into r from price_items where org_id = org_a and code = 'WSH';
  if r.current_a is not null then raise exception 'CHECK FAILED: undo kept %', r.current_a; end if;

  -- The gig's power plan is kept with the show model
  insert into gig_show (gig_id, power) values (g1,
    '{"supply": {"kind": "generator", "volts": 230, "phases": 3, "amps": 63, "hz": 50}, "distros": [], "manual": [{"id": "m1", "name": "Catering", "watts": 3000}]}');
  select power -> 'supply' ->> 'kind' into t from gig_show where gig_id = g1;
  if t <> 'generator' then raise exception 'CHECK FAILED: power plan not kept'; end if;
  begin
    update gig_show set power = '[1]' where gig_id = g1;
    raise exception 'CHECK FAILED: power plan that isn''t an object';
  exception when check_violation then null; end;
  reset role;

  -- Crew on the gig read the plan but don't change it
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select power -> 'manual' -> 0 ->> 'name' into t from gig_show where gig_id = g1;
  if t is distinct from 'Catering' then raise exception 'CHECK FAILED: crew can''t read the plan'; end if;
  update gig_show set power = '{}' where gig_id = g1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew changed the plan'; end if;
  -- …nor do they see the catalogue
  select count(*) into n from price_items where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: crew sees % catalogue items', n; end if;
  reset role;

  -- Someone outside the gig sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_show where gig_id = g1;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees the plan'; end if;
  reset role;

  raise exception 'ALL POWER CHECKS PASSED';
end $$;
