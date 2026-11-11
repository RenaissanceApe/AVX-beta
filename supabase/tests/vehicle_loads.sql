-- Checks for migration 20270122000000 (packing list per vehicle, step 23 part V3).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL VEHICLE LOADS CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); pm uuid := gen_random_uuid();
  k uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; g uuid; g2 uuid; van uuid; truck uuid; t_out uuid; t_out2 uuid; t_back uuid; t_other uuid;
  rack uuid; speaker uuid; cable uuid; extra uuid;
  n integer; js jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'vl-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'vl-m@avx.invalid', 'authenticated', 'authenticated'),
    (pm, 'vl-pm@avx.invalid', 'authenticated', 'authenticated'), (k, 'vl-k@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'vl-x@avx.invalid', 'authenticated', 'authenticated');

  -- ── Setup: organisation (admin a, member m), gig with a PM who isn't a member and crew k
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Loads Co', a) returning id into org_a;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Festival', 'confirmed', a, '2027-04-10', '2027-04-12') returning id into g;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Gala', 'confirmed', a, '2027-04-10', '2027-04-10') returning id into g2;
  insert into price_items (org_id, name, unit_price, created_by, tracking, kit_type, weight_kg, volume_m3) values (org_a, 'Amp rack', 100, a, 'serial', 'case', 60, 0.8) returning id into rack;
  insert into price_items (org_id, name, unit_price, created_by, tracking, weight_kg, dimensions) values (org_a, 'Speaker', 60, a, 'serial', 25, '60 x 40 x 50 cm') returning id into speaker;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Cable', 1, a, 'bulk') returning id into cable;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Not planned', 1, a, 'bulk') returning id into extra;
  begin
    update price_items set volume_m3 = -1 where id = cable;
    raise exception 'CHECK FAILED: negative volume';
  exception when check_violation then null; end;
  update price_items set volume_m3 = 0.002 where id = cable;
  insert into item_parts (org_id, parent_id, child_id, kind, quantity) values (org_a, rack, cable, 'content', 4);
  insert into gig_equipment (gig_id, org_id, item_id, item_name, quantity) values
    (g, org_a, rack, 'Amp rack', 2), (g, org_a, speaker, 'Speaker', 6), (g, org_a, cable, 'Cable', 20);
  insert into vehicles (org_id, name, max_load_kg, volume_m3) values (org_a, 'Van', 1000, 10) returning id into van;
  insert into vehicles (org_id, name, max_load_kg) values (org_a, 'Truck', 3500) returning id into truck;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');
  insert into gig_members (gig_id, user_id, role, function_title) values (g, pm, 'pm', 'Production manager'), (g, k, 'crew', 'Rigger');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into trips (gig_id, vehicle_id, direction, departs_at, arrives_at) values (g, van, 'out', '2027-04-10 07:00+00', '2027-04-10 09:00+00') returning id into t_out;
  insert into trips (gig_id, vehicle_id, direction, departs_at, arrives_at) values (g, truck, 'one_way', '2027-04-10 06:00+00', '2027-04-10 09:00+00') returning id into t_out2;
  insert into trips (gig_id, vehicle_id, direction, departs_at, arrives_at) values (g, van, 'back', '2027-04-12 22:00+00', '2027-04-13 00:30+00') returning id into t_back;
  insert into trips (gig_id, vehicle_id, direction, departs_at, arrives_at) values (g2, truck, 'out', '2027-04-10 10:00+00', '2027-04-10 11:00+00') returning id into t_other;
  reset role;

  -- ── Crew see the plan but can't change it; outsiders see nothing
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  js := public.gig_load_plan(g);
  if jsonb_array_length(js -> 'trips') <> 2 or (js ->> 'can_plan')::boolean then raise exception 'CHECK FAILED: crew plan read: %', js; end if;
  if (js -> 'trips' -> 0 ->> 'id')::uuid <> t_out2 then raise exception 'CHECK FAILED: trips in time order, outward only'; end if;
  if js -> 'trips' -> 0 ? 'cost_per_km' then raise exception 'CHECK FAILED: costs shown with the plan'; end if;
  if jsonb_array_length(js -> 'lines') <> 3 or jsonb_array_length(js -> 'parts') <> 1 then raise exception 'CHECK FAILED: lines and contents: %', js; end if;
  if (select (l ->> 'weight_kg')::numeric from jsonb_array_elements(js -> 'lines') l where (l ->> 'item_id')::uuid = rack) <> 60
     or (select l ->> 'dimensions' from jsonb_array_elements(js -> 'lines') l where (l ->> 'item_id')::uuid = speaker) <> '60 x 40 x 50 cm' then
    raise exception 'CHECK FAILED: weights and dimensions reach crew';
  end if;
  begin
    perform public.set_vehicle_loads(g, jsonb_build_array(jsonb_build_object('trip_id', t_out, 'item_id', speaker, 'quantity', 1)));
    raise exception 'CHECK FAILED: crew changed the loads';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.gig_load_plan(g) is not null then raise exception 'CHECK FAILED: outsider read the plan'; end if;
  begin
    perform public.set_vehicle_loads(g, '[]'::jsonb);
    raise exception 'CHECK FAILED: outsider changed the loads';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── A member plans: whole plan at once, checked
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := public.set_vehicle_loads(g, jsonb_build_array(
    jsonb_build_object('trip_id', t_out, 'item_id', rack, 'quantity', 1),
    jsonb_build_object('trip_id', t_out2, 'item_id', rack, 'quantity', 1),
    jsonb_build_object('trip_id', t_out, 'item_id', speaker, 'quantity', 4),
    jsonb_build_object('trip_id', t_out2, 'item_id', speaker, 'quantity', 2),
    jsonb_build_object('trip_id', t_out2, 'item_id', cable, 'quantity', 0)));
  if n <> 4 then raise exception 'CHECK FAILED: loads saved: %', n; end if;
  if (select count(*) from vehicle_loads where gig_id = g) <> 4 then raise exception 'CHECK FAILED: a zero row was stored'; end if;
  if (select updated_by from vehicle_loads where trip_id = t_out and item_id = rack) <> m then raise exception 'CHECK FAILED: updated_by'; end if;
  begin
    insert into vehicle_loads (gig_id, trip_id, item_id, quantity) values (g, t_out, cable, 1);
    raise exception 'CHECK FAILED: wrote loads past the function';
  exception when insufficient_privilege then null; end;
  begin
    update vehicle_loads set quantity = 6 where trip_id = t_out and item_id = speaker;
    raise exception 'CHECK FAILED: changed loads past the function';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_vehicle_loads(g, jsonb_build_array(jsonb_build_object('trip_id', t_out, 'item_id', speaker, 'quantity', 4),
                                                          jsonb_build_object('trip_id', t_out2, 'item_id', speaker, 'quantity', 3)));
    raise exception 'CHECK FAILED: loaded more than planned';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_vehicle_loads(g, jsonb_build_array(jsonb_build_object('trip_id', t_back, 'item_id', speaker, 'quantity', 1)));
    raise exception 'CHECK FAILED: loaded a way-back trip';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_vehicle_loads(g, jsonb_build_array(jsonb_build_object('trip_id', t_other, 'item_id', speaker, 'quantity', 1)));
    raise exception 'CHECK FAILED: loaded another gig''s trip';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_vehicle_loads(g, jsonb_build_array(jsonb_build_object('trip_id', t_out, 'item_id', extra, 'quantity', 1)));
    raise exception 'CHECK FAILED: loaded an item not on the list';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_vehicle_loads(g, jsonb_build_array(jsonb_build_object('trip_id', t_out, 'item_id', speaker, 'quantity', 1),
                                                          jsonb_build_object('trip_id', t_out, 'item_id', speaker, 'quantity', 1)));
    raise exception 'CHECK FAILED: the same item twice on one trip';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_vehicle_loads(g, jsonb_build_array(jsonb_build_object('trip_id', t_out, 'item_id', speaker, 'quantity', -1)));
    raise exception 'CHECK FAILED: negative quantity';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_vehicle_loads(g, '{"trip_id": null}'::jsonb);
    raise exception 'CHECK FAILED: not a list';
  exception when invalid_parameter_value then null; end;
  if (select sum(quantity) from vehicle_loads where gig_id = g) <> 8 then raise exception 'CHECK FAILED: a refused plan changed something'; end if;
  reset role;

  -- ── Crew see the loads; the PM (not an org member) plans too, and what's left out goes to 0
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from vehicle_loads where gig_id = g) <> 4 or jsonb_array_length(public.gig_load_plan(g) -> 'loads') <> 4 then
    raise exception 'CHECK FAILED: crew see the loads';
  end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not (public.gig_load_plan(g) ->> 'can_plan')::boolean then raise exception 'CHECK FAILED: PM can plan'; end if;
  n := public.set_vehicle_loads(g, jsonb_build_array(jsonb_build_object('trip_id', t_out, 'item_id', rack, 'quantity', 2),
                                                     jsonb_build_object('trip_id', t_out, 'item_id', speaker, 'quantity', 6)));
  if n <> 2 then raise exception 'CHECK FAILED: PM saved: %', n; end if;
  if (select count(*) from vehicle_loads where gig_id = g) <> 4
     or (select count(*) from vehicle_loads where gig_id = g and quantity = 0) <> 2
     or (select quantity from vehicle_loads where trip_id = t_out and item_id = speaker) <> 6 then
    raise exception 'CHECK FAILED: left-out rows marked 0, not removed';
  end if;
  js := public.gig_load_plan(g);
  if jsonb_array_length(js -> 'loads') <> 2 then raise exception 'CHECK FAILED: zero rows not listed: %', js -> 'loads'; end if;

  -- A removed trip's loads drop out of the plan, and it can't be loaded any more
  update trips set removed_at = now() where id = t_out;
  if jsonb_array_length(public.gig_load_plan(g) -> 'loads') <> 0 or jsonb_array_length(public.gig_load_plan(g) -> 'trips') <> 1 then
    raise exception 'CHECK FAILED: removed trip still in the plan';
  end if;
  begin
    perform public.set_vehicle_loads(g, jsonb_build_array(jsonb_build_object('trip_id', t_out, 'item_id', rack, 'quantity', 1)));
    raise exception 'CHECK FAILED: loaded a removed trip';
  exception when invalid_parameter_value then null; end;
  reset role;

  -- ── Nothing on the table can stand in the way of account closing
  if exists (select 1 from pg_trigger where tgrelid = 'public.vehicle_loads'::regclass and not tgisinternal) then
    raise exception 'CHECK FAILED: a trigger on vehicle_loads';
  end if;
  if (select confdeltype from pg_constraint where conrelid = 'public.vehicle_loads'::regclass and contype = 'f'
        and conkey = array[(select attnum from pg_attribute where attrelid = 'public.vehicle_loads'::regclass and attname = 'updated_by')]) <> 'n' then
    raise exception 'CHECK FAILED: updated_by empties when an account closes';
  end if;

  raise exception 'ALL VEHICLE LOADS CHECKS PASSED';
end $$;
