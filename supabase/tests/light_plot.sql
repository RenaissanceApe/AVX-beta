-- Checks for migration 20261113000000 (field tools F3: light plot).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL LIGHT PLOT CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  org_a uuid; g1 uuid; aura uuid; par uuid; f1 uuid; f2 uuid; n int; t text; w int; kg numeric;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'lp-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'lp-c@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Light Co', a) returning id into org_a;
  insert into price_items (org_id, name, unit_price, created_by, tracking, power_w, weight_kg)
  values (org_a, 'MAC Aura XB', 80, a, 'serial', 470, 13.5) returning id into aura;
  insert into price_items (org_id, name, unit_price, created_by, tracking, power_w, weight_kg)
  values (org_a, 'LED par', 10, a, 'serial', 180, 4) returning id into par;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  reset role;

  -- New organisations get the five tools
  select array_to_string(field_tools, ',') into t from organisations where id = org_a;
  if t <> 'stage_plot,input_list,patch,dmx_patch,light_plot' then raise exception 'CHECK FAILED: default tools %', t; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_tools (gig_id, tool) values (g1, 'light_plot');
  -- Bars and supply live in the show model
  insert into gig_show (gig_id, lighting) values (g1,
    '{"bars": [{"id": "b1", "name": "Truss 1", "kind": "truss", "x": 5, "y": 4, "length": 10, "rotation": 0}], "supply": {"volts": 230, "phases": 3, "amps": 32}}');
  select lighting->'bars'->0->>'name' into t from gig_show where gig_id = g1;
  if t <> 'Truss 1' then raise exception 'CHECK FAILED: bars not kept'; end if;
  begin
    update gig_show set lighting = '"x"' where gig_id = g1;
    raise exception 'CHECK FAILED: lighting that isn''t an object';
  exception when check_violation then null; end;

  -- Power and weight come from the catalogue item unless given
  insert into gig_fixtures (gig_id, name, fixture_type, footprint, universe, address, item_id, position)
  values (g1, 'Spot 1', 'MAC Aura XB', 14, 1, 1, aura, 'Truss 1') returning id into f1;
  select power_w, weight_kg into w, kg from gig_fixtures where id = f1;
  if w <> 470 or kg <> 13.5 then raise exception 'CHECK FAILED: catalogue power % weight %', w, kg; end if;
  insert into gig_fixtures (gig_id, name, fixture_type, footprint, universe, address, item_id, power_w)
  values (g1, 'Spot 2', 'MAC Aura XB', 14, 1, 15, aura, 500) returning id into f2;
  select power_w into w from gig_fixtures where id = f2;
  if w <> 500 then raise exception 'CHECK FAILED: typed power replaced'; end if;
  -- Another item brings its figures; a figure changed in the same edit stays
  update gig_fixtures set item_id = par where id = f1;
  select power_w, weight_kg into w, kg from gig_fixtures where id = f1;
  if w <> 180 or kg <> 4 then raise exception 'CHECK FAILED: new item power % weight %', w, kg; end if;
  update gig_fixtures set item_id = aura, power_w = 300 where id = f1;
  select power_w, weight_kg into w, kg from gig_fixtures where id = f1;
  if w <> 300 or kg <> 13.5 then raise exception 'CHECK FAILED: edit with item power % weight %', w, kg; end if;
  -- A fixture without an item keeps what's typed
  insert into gig_fixtures (gig_id, name, fixture_type, footprint, universe, power_w, weight_kg, symbol)
  values (g1, 'Haze', 'Hazer', 2, 2, 1200, 20, 'haze');

  -- Place on the plot: both coordinates or neither, within limits; known symbols only
  update gig_fixtures set plot_x = 2.5, plot_y = 4 where id = f1;
  begin
    update gig_fixtures set plot_x = 3, plot_y = null where id = f1;
    raise exception 'CHECK FAILED: half a place';
  exception when check_violation then null; end;
  begin
    update gig_fixtures set plot_x = 100, plot_y = 4 where id = f1;
    raise exception 'CHECK FAILED: place off the drawing';
  exception when check_violation then null; end;
  begin
    update gig_fixtures set symbol = 'laser cannon' where id = f1;
    raise exception 'CHECK FAILED: unknown symbol';
  exception when check_violation then null; end;
  begin
    update gig_fixtures set power_w = -5 where id = f1;
    raise exception 'CHECK FAILED: negative power';
  exception when check_violation then null; end;
  reset role;

  -- Crew read the plot but don't change it
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_fixtures where gig_id = g1 and power_w is not null;
  if n <> 3 then raise exception 'CHECK FAILED: crew see % fixtures with power', n; end if;
  select jsonb_array_length(lighting->'bars') into n from gig_show where gig_id = g1;
  if n <> 1 then raise exception 'CHECK FAILED: crew don''t see the bars'; end if;
  update gig_fixtures set plot_x = 1, plot_y = 1 where gig_id = g1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew moved fixtures'; end if;
  update gig_show set lighting = '{}' where gig_id = g1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew changed the bars'; end if;
  reset role;

  raise exception 'ALL LIGHT PLOT CHECKS PASSED';
end $$;
