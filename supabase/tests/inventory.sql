-- Checks for migration 20261025000000 (inventory: catalogue, locations, units, ledger).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL INVENTORY CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_o uuid; wh uuid; van uuid; other_loc uuid; cable uuid; speaker uuid; crew_item uuid;
  u1 uuid; u2 uuid; n int; t text; q int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'i-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'i-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'i-v@avx.invalid', 'authenticated', 'authenticated'), (o, 'i-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other', o) returning id into org_o;
  insert into stock_locations (org_id, name) values (org_o, 'Their warehouse') returning id into other_loc;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Stock Co', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into stock_locations (org_id, name, kind) values (org_a, 'Van 1', 'vehicle') returning id into van;
  begin
    insert into stock_locations (org_id, name) values (org_a, 'warehouse');
    raise exception 'CHECK FAILED: duplicate location name';
  exception when unique_violation then null; end;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'XLR 10m', 2, a, 'bulk') returning id, code into cable, t;
  if t !~ '^I-[2-9A-HJ-NP-Z]{8}$' then raise exception 'CHECK FAILED: item code %', t; end if;
  insert into price_items (org_id, name, unit_price, created_by, tracking, code) values (org_a, 'Speaker', 60, a, 'serial', 'SPK') returning id into speaker;
  begin
    insert into price_items (org_id, name, unit_price, created_by, tracking, code) values (org_a, 'Speaker 2', 60, a, 'serial', 'spk');
    raise exception 'CHECK FAILED: duplicate item code';
  exception when unique_violation then null; end;
  begin
    insert into price_items (org_id, name, kind, unit_price, created_by, tracking) values (org_a, 'Tech', 'crew', 200, a, 'bulk') returning id into crew_item;
    raise exception 'CHECK FAILED: crew item with stock';
  exception when check_violation then null; end;
  reset role;

  -- Member: bulk stock moves through the ledger
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, cable, 'purchase', 50, wh);
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, to_location_id) values (org_a, cable, 'transfer', 20, wh, van);
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id) values (org_a, cable, 'lost', 2, van);
  select quantity into q from stock_levels where item_id = cable and location_id = wh;
  if q <> 30 then raise exception 'CHECK FAILED: warehouse level %', q; end if;
  select quantity into q from stock_levels where item_id = cable and location_id = van;
  if q <> 18 then raise exception 'CHECK FAILED: van level %', q; end if;
  begin
    insert into stock_movements (org_id, item_id, kind, quantity, from_location_id) values (org_a, cable, 'sale', 31, wh);
    raise exception 'CHECK FAILED: more out than in stock';
  exception when check_violation then null; end;
  begin
    insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, to_location_id) values (org_a, cable, 'purchase', 1, wh, van);
    raise exception 'CHECK FAILED: purchase with a from location';
  exception when check_violation then null; end;
  begin
    insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, cable, 'purchase', 1, other_loc);
    raise exception 'CHECK FAILED: another company''s location';
  exception when check_violation then null; end;
  begin
    insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, speaker, 'purchase', 1, wh);
    raise exception 'CHECK FAILED: bulk movement on a serial item';
  exception when check_violation then null; end;
  -- A count that finds 28 at the warehouse: correction out of 2
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, note) values (org_a, cable, 'correction', 2, wh, 'Count');
  select quantity into q from stock_levels where item_id = cable and location_id = wh;
  if q <> 28 then raise exception 'CHECK FAILED: after count %', q; end if;
  -- Ledger can't be edited
  update stock_movements set quantity = 999 where item_id = cable;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: ledger edited'; end if;
  -- Tracking can't change once there is stock
  begin
    update price_items set tracking = 'serial' where id = cable;
    raise exception 'CHECK FAILED: tracking changed with stock';
  exception when check_violation then null; end;

  -- Serial units
  insert into stock_units (org_id, item_id, serial, location_id, purchase_cost, purchase_date) values (org_a, speaker, 'SN-1', wh, 1200, '2024-01-01') returning id, code into u1, t;
  if t !~ '^U-[2-9A-HJ-NP-Z]{8}$' then raise exception 'CHECK FAILED: unit code %', t; end if;
  insert into stock_units (org_id, item_id, serial, location_id, code) values (org_a, speaker, 'SN-2', wh, 'SPK-02') returning id into u2;
  begin
    insert into stock_units (org_id, item_id, serial) values (org_a, speaker, 'sn-1');
    raise exception 'CHECK FAILED: duplicate serial';
  exception when unique_violation then null; end;
  begin
    insert into stock_units (org_id, item_id) values (org_a, cable);
    raise exception 'CHECK FAILED: unit of a bulk item';
  exception when check_violation then null; end;
  begin
    insert into stock_movements (org_id, item_id, unit_id, kind, quantity, to_location_id) values (org_a, speaker, u1, 'purchase', 1, wh);
    raise exception 'CHECK FAILED: hand-written unit history';
  exception when insufficient_privilege then null; end;
  update stock_units set location_id = van where id = u1;
  update stock_units set status = 'repair' where id = u2;
  select quantity into q from stock_levels where item_id = speaker and location_id = wh;
  if q <> 1 then raise exception 'CHECK FAILED: speakers at warehouse %', q; end if;
  select in_repair into q from stock_levels where item_id = speaker and location_id = wh;
  if q <> 1 then raise exception 'CHECK FAILED: in repair %', q; end if;
  update stock_units set status = 'lost' where id = u1;
  select count(*) into n from stock_levels where item_id = speaker and location_id = van;
  if n <> 0 then raise exception 'CHECK FAILED: lost unit still counted'; end if;
  update stock_units set status = 'available', location_id = wh where id = u1;
  select string_agg(kind, ',' order by id) into t from stock_movements where unit_id = u1;
  if t <> 'purchase,transfer,lost,found' then raise exception 'CHECK FAILED: unit history %', t; end if;
  -- A unit can't be moved to another company's item or location
  update stock_units set item_id = cable where id = u1;
  select count(*) into n from stock_units where id = u1 and item_id = speaker;
  if n <> 1 then raise exception 'CHECK FAILED: unit changed item'; end if;
  begin
    update stock_units set location_id = other_loc where id = u1;
    raise exception 'CHECK FAILED: unit moved to another company''s location';
  exception when check_violation then null; end;
  -- Scanning a code
  select count(*) into n from find_stock_code(' spk-02 ') where unit_id = u2;
  if n <> 1 then raise exception 'CHECK FAILED: find unit code'; end if;
  select count(*) into n from find_stock_code('SPK') where item_id = speaker and unit_id is null;
  if n <> 1 then raise exception 'CHECK FAILED: find item code'; end if;
  -- Archived locations take no new stock
  update stock_locations set archived_at = now() where id = van;
  begin
    insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, to_location_id) values (org_a, cable, 'transfer', 1, wh, van);
    raise exception 'CHECK FAILED: stock into an archived location';
  exception when check_violation then null; end;
  -- Moving out of it still works
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, to_location_id) values (org_a, cable, 'transfer', 18, van, wh);
  reset role;

  -- Viewer and outsider see nothing and can't write
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from stock_levels where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees stock'; end if;
  select count(*) into n from stock_units where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees units'; end if;
  begin
    insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, cable, 'purchase', 5, wh);
    raise exception 'CHECK FAILED: viewer added stock';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from find_stock_code('SPK-02');
  if n <> 0 then raise exception 'CHECK FAILED: outsider finds the code'; end if;
  select count(*) into n from stock_movements where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees the ledger'; end if;
  reset role;

  -- Nothing in inventory can be deleted by users (no delete rules)
  select count(*) into n from pg_policies where schemaname = 'public'
    and tablename in ('stock_locations', 'stock_units', 'stock_movements') and cmd in ('DELETE', 'ALL') and permissive = 'PERMISSIVE';
  if n <> 0 then raise exception 'CHECK FAILED: a delete rule exists'; end if;
  select count(*) into n from pg_policies where schemaname = 'public'
    and tablename in ('stock_locations', 'stock_units', 'stock_movements') and policyname = 'mfa_required';
  if n <> 3 then raise exception 'CHECK FAILED: two-step rule missing'; end if;

  raise exception 'ALL INVENTORY CHECKS PASSED';
end $$;
