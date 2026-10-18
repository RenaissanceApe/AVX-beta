-- Checks for migration 20261027000000 (scanning out and in, units out on gigs).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL WAREHOUSE CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; wh uuid; g1 uuid; g2 uuid; speaker uuid; cable uuid;
  u1 uuid; u2 uuid; u3 uuid; c1 text; c2 text; c3 text; n int; t text; r jsonb; s record;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'w-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'w-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'w-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Warehouse Co', a) returning id into org_a;
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into price_items (org_id, name, unit_price, created_by, tracking, code) values (org_a, 'Speaker', 60, a, 'serial', 'SPK') returning id into speaker;
  insert into price_items (org_id, name, unit_price, created_by, tracking, code, packing_note) values (org_a, 'XLR', 2, a, 'bulk', 'XLR', 'Coil') returning id into cable;
  insert into stock_units (org_id, item_id, location_id, serial) values (org_a, speaker, wh, 'S1') returning id, code into u1, c1;
  insert into stock_units (org_id, item_id, location_id, serial) values (org_a, speaker, wh, 'S2') returning id, code into u2, c2;
  insert into stock_units (org_id, item_id, location_id, serial) values (org_a, speaker, wh, 'S3') returning id, code into u3, c3;
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, cable, 'purchase', 20, wh);
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'confirmed') returning id into g1;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 2', a, '2026-11-12', 'confirmed') returning id into g2;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  insert into gig_equipment (gig_id, item_id, quantity) values (g1, speaker, 2), (g1, cable, 10);
  select packing_note into t from gig_equipment where gig_id = g1 and item_id = cable;
  if t is distinct from 'Coil' then raise exception 'CHECK FAILED: packing note not copied'; end if;

  -- Units out
  r := dispatch_scan(g1, lower(c1), 'out');
  if not (r->>'ok')::boolean or r->>'warning' is not null or (r->>'out')::int <> 1 then raise exception 'CHECK FAILED: first unit out %', r; end if;
  r := dispatch_scan(g1, c1, 'out');
  if r->>'error' <> 'already_out' then raise exception 'CHECK FAILED: same unit out twice %', r; end if;
  perform dispatch_scan(g1, c2, 'out');
  r := dispatch_scan(g1, c3, 'out');
  if r->>'warning' <> 'over_planned' then raise exception 'CHECK FAILED: over plan not flagged %', r; end if;
  -- Only scanning moves a unit out or in
  update stock_units set out_on_gig = null where id = u1;
  select count(*) into n from stock_units where id = u1 and out_on_gig = g1;
  if n <> 1 then raise exception 'CHECK FAILED: out cleared by hand'; end if;
  -- Bulk
  r := dispatch_scan(g1, 'xlr', 'out', 10);
  if not (r->>'ok')::boolean or r->>'warning' is not null then raise exception 'CHECK FAILED: bulk out %', r; end if;
  r := dispatch_scan(g1, 'XLR', 'out', 2);
  if r->>'warning' <> 'over_planned' then raise exception 'CHECK FAILED: bulk over plan %', r; end if;
  r := dispatch_scan(g1, 'SPK', 'out');
  if r->>'error' <> 'scan_units' then raise exception 'CHECK FAILED: item code of a serial item %', r; end if;
  r := dispatch_scan(g1, 'NOPE', 'out');
  if r->>'error' <> 'not_found' then raise exception 'CHECK FAILED: unknown code %', r; end if;
  -- A unit taken to another gig moves there, with a warning
  r := dispatch_scan(g2, c1, 'out');
  if r->>'warning' <> 'out_elsewhere' or r->>'other_gig' <> 'Gig 1' or r->>'warning' is null then raise exception 'CHECK FAILED: out elsewhere %', r; end if;
  r := dispatch_scan(g1, c1, 'in');
  if r->>'error' <> 'out_on_other_gig' then raise exception 'CHECK FAILED: in on the wrong gig %', r; end if;
  -- Back in, one damaged
  r := dispatch_scan(g1, c2, 'in', 1, 'damaged', 'Dented');
  if not (r->>'ok')::boolean then raise exception 'CHECK FAILED: unit in %', r; end if;
  select status into t from stock_units where id = u2;
  if t <> 'repair' then raise exception 'CHECK FAILED: damaged unit is %', t; end if;
  r := dispatch_scan(g1, c2, 'in');
  if r->>'error' <> 'not_out' then raise exception 'CHECK FAILED: in twice %', r; end if;
  perform dispatch_scan(g1, 'XLR', 'in', 11);
  r := dispatch_scan(g1, 'XLR', 'in', 2);
  if r->>'warning' <> 'more_back_than_out' then raise exception 'CHECK FAILED: more back than out %', r; end if;
  select * into s from gig_dispatch_summary(g1) where item_id = speaker;
  if s.planned <> 2 or s.out_qty <> 3 or s.back_qty <> 1 then raise exception 'CHECK FAILED: speaker summary %/%/%', s.planned, s.out_qty, s.back_qty; end if;
  select * into s from gig_dispatch_summary(g1) where item_id = cable;
  if s.planned <> 10 or s.out_qty <> 12 or s.back_qty <> 13 or s.packing_note <> 'Coil' then raise exception 'CHECK FAILED: cable summary'; end if;
  select count(*) into n from gig_units_out(g1);
  if n <> 1 then raise exception 'CHECK FAILED: % units out on gig 1', n; end if;
  begin
    insert into gig_dispatch (gig_id, org_id, item_id, direction, quantity) values (g1, org_a, cable, 'out', 1);
    raise exception 'CHECK FAILED: hand-written dispatch row';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Crew see the progress but can't scan
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_dispatch_summary(g1);
  if n <> 2 then raise exception 'CHECK FAILED: crew see % summary rows', n; end if;
  select count(*) into n from gig_units_out(g1);
  if n <> 1 then raise exception 'CHECK FAILED: crew don''t see units out'; end if;
  begin
    perform dispatch_scan(g1, c3, 'in');
    raise exception 'CHECK FAILED: crew scanned';
  exception when insufficient_privilege then null; end;
  begin
    perform mark_units_lost(g1);
    raise exception 'CHECK FAILED: crew marked lost';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Outsiders see nothing
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_dispatch_summary(g1);
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees the summary'; end if;
  select count(*) into n from gig_dispatch where gig_id = g1;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees the log'; end if;
  begin
    perform dispatch_scan(g1, c3, 'in');
    raise exception 'CHECK FAILED: outsider scanned';
  exception when insufficient_privilege then null; end;
  reset role;

  -- After the gig: what never came back is marked lost, and turns up later
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := mark_units_lost(g1);
  if n <> 1 then raise exception 'CHECK FAILED: marked % lost', n; end if;
  select status into t from stock_units where id = u3 and out_on_gig is null;
  if t <> 'lost' then raise exception 'CHECK FAILED: missing unit is %', t; end if;
  r := dispatch_scan(g1, c3, 'in');
  if r->>'warning' <> 'was_lost' then raise exception 'CHECK FAILED: lost unit back %', r; end if;
  select status into t from stock_units where id = u3;
  if t <> 'available' then raise exception 'CHECK FAILED: found unit is %', t; end if;
  reset role;

  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'gig_dispatch' and cmd <> 'SELECT' and permissive = 'PERMISSIVE';
  if n <> 0 then raise exception 'CHECK FAILED: dispatch log has write rules'; end if;

  raise exception 'ALL WAREHOUSE CHECKS PASSED';
end $$;
