-- Checks for migration 20261026000000 (equipment on gigs, availability).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL AVAILABILITY CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_o uuid; wh uuid; g1 uuid; g2 uuid; g3 uuid; speaker uuid; cable uuid; plain uuid; foreign_item uuid;
  l1 uuid; l2 uuid; n int; q int; t text; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'e-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'e-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'e-v@avx.invalid', 'authenticated', 'authenticated'), (c, 'e-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'e-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other', o) returning id into org_o;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_o, 'Their cable', 1, o, 'bulk') returning id into foreign_item;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Gear Co', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Speaker', 60, a, 'serial') returning id into speaker;
  insert into price_items (org_id, name, category, unit_price, created_by, tracking) values (org_a, 'XLR', 'Cables', 2, a, 'bulk') returning id into cable;
  insert into price_items (org_id, name, unit_price, created_by) values (org_a, 'Not tracked', 5, a) returning id into plain;
  insert into stock_units (org_id, item_id, location_id) values (org_a, speaker, wh), (org_a, speaker, wh), (org_a, speaker, wh);
  update stock_units set status = 'repair' where id = (select id from stock_units where item_id = speaker limit 1);
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, cable, 'purchase', 10, wh);
  insert into gigs (org_id, name, created_by, start_date, end_date, status) values (org_a, 'Gig 1', a, '2026-11-10', '2026-11-11', 'confirmed') returning id into g1;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 2', a, '2026-11-11', 'draft') returning id into g2;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 3', a, '2026-11-20', 'confirmed') returning id into g3;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');

  -- Planning gear makes reservations for the gig's days
  insert into gig_equipment (gig_id, item_id, quantity) values (g1, speaker, 2) returning id into l1;
  insert into gig_equipment (gig_id, item_id, quantity, notes) values (g1, cable, 6, 'Spares') returning id into l2;
  select item_name into t from gig_equipment where id = l2;
  if t <> 'XLR' then raise exception 'CHECK FAILED: item name not copied (%)', t; end if;
  begin
    insert into gig_equipment (gig_id, item_id, quantity) values (g1, plain, 1);
    raise exception 'CHECK FAILED: untracked item planned';
  exception when check_violation then null; end;
  begin
    insert into gig_equipment (gig_id, item_id, quantity) values (g1, foreign_item, 1);
    raise exception 'CHECK FAILED: another company''s item planned';
  exception when check_violation then null; end;
  begin
    insert into gig_equipment (gig_id, item_id, quantity) values (g1, cable, 1);
    raise exception 'CHECK FAILED: same item twice on a gig';
  exception when unique_violation then null; end;
  reset role;

  select count(*) into n from reservations where source_type = 'gig_equipment' and source_id = l2::text
     and resource_type = 'equipment' and resource_id = cable and quantity = 6 and status = 'confirmed'
     and period = tstzrange('2026-11-10 00:00+00', '2026-11-12 00:00+00', '[)');
  if n <> 1 then raise exception 'CHECK FAILED: equipment reservation'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Prep/return days widen the bookings
  update organisations set equipment_prep_days = 1, equipment_return_days = 2 where id = org_a;
  reset role;
  select count(*) into n from reservations where source_id = l2::text
     and period = tstzrange('2026-11-09 00:00+00', '2026-11-14 00:00+00', '[)');
  if n <> 1 then raise exception 'CHECK FAILED: prep/return days not applied'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- A member plans on any of the organisation's gigs. A draft gig holds; availability
  -- counts the busiest moment, not the sum
  insert into gig_equipment (gig_id, item_id, quantity) values (g2, cable, 5);
  insert into gig_equipment (gig_id, item_id, quantity, planned_from, planned_until)
    values (g3, cable, 7, '2026-11-20 08:00+00', '2026-11-20 23:00+00');
  select * into r from equipment_availability(org_a, array[cable], '2026-11-11 00:00+00', '2026-11-12 00:00+00');
  if r.owned <> 10 or r.booked <> 11 or r.available <> -1 then raise exception 'CHECK FAILED: availability %', row_to_json(r); end if;
  select * into r from equipment_availability(org_a, array[cable], '2026-11-11 00:00+00', '2026-11-12 00:00+00', g2);
  if r.booked <> 6 then raise exception 'CHECK FAILED: excluding a gig %', row_to_json(r); end if;
  select * into r from equipment_availability(org_a, array[cable], '2026-11-01 00:00+00', '2026-11-30 00:00+00');
  if r.booked <> 11 then raise exception 'CHECK FAILED: peak over a month is % (not the sum)', r.booked; end if;
  select * into r from equipment_availability(org_a, array[speaker], '2026-11-10 00:00+00', '2026-11-11 00:00+00');
  if r.owned <> 2 or r.available <> 0 then raise exception 'CHECK FAILED: units in repair counted %', row_to_json(r); end if;
  select * into r from gig_equipment_status(g2);
  if r.quantity <> 5 or r.available <> 4 then raise exception 'CHECK FAILED: gig status %', row_to_json(r); end if;
  select count(*) into n from item_bookings(cable, '2026-11-01', '2026-12-01');
  if n <> 3 then raise exception 'CHECK FAILED: item bookings %', n; end if;
  select status into t from item_bookings(cable, '2026-11-01', '2026-12-01') where gig_id = g2;
  if t <> 'hold' then raise exception 'CHECK FAILED: draft gig gives %', t; end if;
  -- Quantity changes follow; the item can't be swapped
  update gig_equipment set quantity = 4, item_id = speaker where id = l2;
  reset role;
  select count(*) into n from reservations where source_id = l2::text and quantity = 4 and resource_id = cable;
  if n <> 1 then raise exception 'CHECK FAILED: quantity change'; end if;

  -- Crew see the list but not stock figures, and can't plan
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_equipment where gig_id = g1;
  if n <> 2 then raise exception 'CHECK FAILED: crew see % lines', n; end if;
  select count(*) into n from gig_equipment_status(g1);
  if n <> 0 then raise exception 'CHECK FAILED: crew see stock figures'; end if;
  begin
    insert into gig_equipment (gig_id, item_id, quantity) values (g1, speaker, 1);
    raise exception 'CHECK FAILED: crew planned gear';
  exception when insufficient_privilege or unique_violation then null; end;
  update gig_equipment set quantity = 99 where id = l1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew changed a line'; end if;
  reset role;

  -- Viewer and outsider: no availability, no bookings
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from equipment_availability(org_a, null, '2026-11-01', '2026-12-01');
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees availability'; end if;
  select count(*) into n from item_bookings(cable, '2026-11-01', '2026-12-01');
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees bookings'; end if;
  begin
    insert into gig_equipment (gig_id, item_id, quantity) values (g3, speaker, 1);
    raise exception 'CHECK FAILED: viewer planned gear';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_equipment where gig_id = g1;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees the gig''s gear'; end if;
  select count(*) into n from equipment_availability(org_a, null, '2026-11-01', '2026-12-01');
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees availability'; end if;
  reset role;

  -- Archiving a gig frees its gear
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update gigs set status = 'archived' where id = g1;
  reset role;
  select count(*) into n from reservations where gig_id = g1 and resource_type = 'equipment' and status <> 'cancelled';
  if n <> 0 then raise exception 'CHECK FAILED: archived gig still holds gear'; end if;

  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'gig_equipment' and policyname = 'mfa_required';
  if n <> 1 then raise exception 'CHECK FAILED: two-step rule missing'; end if;

  raise exception 'ALL AVAILABILITY CHECKS PASSED';
end $$;
