-- Checks for migration 20261115000000 (switching S1a: the import wizard).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL IMPORT WIZARD CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; g1 uuid; res jsonb; b1 uuid; n int; t text; v numeric;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'im-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'im-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'im-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Import Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');

  -- Locations: two new, then the same file with one address changed
  res := run_import(org_a, 'locations', '[{"_row": 2, "name": "Warehouse", "kind": "warehouse", "address": "Rua A"}, {"_row": 3, "name": "Van 1", "kind": "vehicle"}]', 'locations.csv');
  if (res ->> 'created')::int <> 2 then raise exception 'CHECK FAILED: locations created %', res; end if;
  res := run_import(org_a, 'locations', '[{"name": "warehouse", "address": "Rua B"}, {"name": "Van 1", "kind": "vehicle"}]');
  if (res ->> 'updated')::int <> 1 or (res ->> 'unchanged')::int <> 1 then raise exception 'CHECK FAILED: locations re-import %', res; end if;
  select address into t from stock_locations where org_id = org_a and name = 'Warehouse';
  if t <> 'Rua B' then raise exception 'CHECK FAILED: address not updated'; end if;

  -- Items: a counted item with opening stock, one with a code, and three bad rows
  res := run_import(org_a, 'items', '[
    {"_row": 2, "name": "XLR 10 m", "category": "Cables", "unit_price": 2.5, "quantity": 40, "location": "Warehouse"},
    {"_row": 3, "name": "MAC Aura XB", "code": "AURA", "unit_price": 80, "brand": "Martin", "power_w": 470, "weight_kg": 13.5},
    {"_row": 4, "category": "No name"},
    {"_row": 5, "name": "Mic stand", "quantity": 10, "location": "Moon base"},
    {"_row": 6, "name": "Serial thing", "tracking": "serial", "quantity": 3, "location": "Warehouse"}
  ]', 'items.csv', 'My preset');
  b1 := (res ->> 'batch')::uuid;
  if (res ->> 'created')::int <> 2 or (res ->> 'skipped')::int <> 3 then raise exception 'CHECK FAILED: items %', res; end if;
  if (res -> 'problems' -> 0 ->> 'row') <> '4' or (res -> 'problems' -> 1 ->> 'message') not like 'Unknown location: Moon base%' then
    raise exception 'CHECK FAILED: problems %', res -> 'problems';
  end if;
  select tracking into t from price_items where org_id = org_a and name = 'XLR 10 m';
  if t <> 'bulk' then raise exception 'CHECK FAILED: opening stock makes it bulk, got %', t; end if;
  select coalesce(sum(quantity), 0) into n from stock_movements m join price_items i on i.id = m.item_id where i.name = 'XLR 10 m' and i.org_id = org_a;
  if n <> 40 then raise exception 'CHECK FAILED: opening stock %', n; end if;
  select skipped, preset, file_name into n, t, t from import_batches where id = b1;
  if n <> 3 then raise exception 'CHECK FAILED: batch counts'; end if;

  -- The same file again: matched by code, then name; price updated; quantity not added twice
  res := run_import(org_a, 'items', '[{"name": "Moving head", "code": "aura", "unit_price": 85}, {"name": "xlr 10 M", "quantity": 40, "location": "Warehouse"}]');
  if (res ->> 'updated')::int <> 1 or (res ->> 'unchanged')::int <> 1 or (res ->> 'created')::int <> 0 then raise exception 'CHECK FAILED: items re-import %', res; end if;
  if (res -> 'problems' -> 0 ->> 'level') <> 'note' then raise exception 'CHECK FAILED: quantity note %', res -> 'problems'; end if;
  select unit_price, name into strict v, t from price_items where org_id = org_a and code = 'AURA';
  if v is distinct from 85 or t is distinct from 'Moving head' then raise exception 'CHECK FAILED: item update % %', v, t; end if;
  select coalesce(sum(quantity), 0) into n from stock_movements m join price_items i on i.id = m.item_id where i.name = 'XLR 10 m' and i.org_id = org_a;
  if n <> 40 then raise exception 'CHECK FAILED: quantity added twice (%)', n; end if;

  -- Units: the item becomes serial-numbered; codes kept; a unit for a bulk item is refused
  res := run_import(org_a, 'units', '[
    {"_row": 2, "item_code": "AURA", "code": "LP-0001", "serial": "SN1", "location": "Warehouse", "purchase_date": "2024-03-01", "purchase_cost": 2400},
    {"_row": 3, "item": "Moving head", "code": "LP-0002", "serial": "SN2", "location": "Van 1"},
    {"_row": 4, "item": "XLR 10 m", "code": "LP-0003"},
    {"_row": 5, "item": "Nothing like it", "code": "LP-0004"}
  ]');
  if (res ->> 'created')::int <> 2 or (res ->> 'skipped')::int <> 2 then raise exception 'CHECK FAILED: units %', res; end if;
  select tracking into t from price_items where org_id = org_a and code = 'AURA';
  if t <> 'serial' then raise exception 'CHECK FAILED: item not made serial'; end if;
  -- Again, with one unit moved: matched by code (old labels keep working)
  res := run_import(org_a, 'units', '[{"item_code": "AURA", "code": "lp-0001", "location": "Van 1"}, {"item_code": "AURA", "serial": "sn2"}]');
  if (res ->> 'updated')::int <> 1 or (res ->> 'unchanged')::int <> 1 then raise exception 'CHECK FAILED: units re-import %', res; end if;
  select l.name into t from stock_units u join stock_locations l on l.id = u.location_id where u.org_id = org_a and u.code = 'LP-0001';
  if t <> 'Van 1' then raise exception 'CHECK FAILED: unit not moved (%)', t; end if;

  -- Presets
  insert into import_presets (org_id, kind, name, mapping) values (org_a, 'items', 'Rentman equipment', '{"Naam": "name", "Code": "code"}');
  begin
    insert into import_presets (org_id, kind, name, mapping) values (org_a, 'items', 'rentman EQUIPMENT', '{}');
    raise exception 'CHECK FAILED: duplicate preset name';
  exception when unique_violation then null; end;

  -- The change log is not readable directly
  select count(*) into n from import_changes;
  if n <> 0 then raise exception 'CHECK FAILED: change log readable'; end if;
  select count(*) into n from import_batches where org_id = org_a;
  if n <> 6 then raise exception 'CHECK FAILED: % batches', n; end if;
  reset role;

  -- The log is complete underneath
  select count(*) into n from import_changes ch join import_batches b on b.id = ch.batch_id where b.org_id = org_a and ch.action = 'created';
  if n <> 2 + 2 + 1 + 2 + 2 then raise exception 'CHECK FAILED: % created rows logged', n; end if;

  -- Crew can't import, see batches or presets
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform run_import(org_a, 'locations', '[{"name": "Crew shed"}]');
    raise exception 'CHECK FAILED: crew imported';
  exception when insufficient_privilege then null; end;
  select count(*) into n from import_batches;
  if n <> 0 then raise exception 'CHECK FAILED: crew see batches'; end if;
  select count(*) into n from import_presets;
  if n <> 0 then raise exception 'CHECK FAILED: crew see presets'; end if;
  reset role;

  -- Outsiders neither
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform run_import(org_a, 'items', '[{"name": "Sneaky"}]');
    raise exception 'CHECK FAILED: outsider imported';
  exception when insufficient_privilege then null; end;
  begin
    perform run_import(org_a, 'gigs', '[{"name": "x"}]');
    raise exception 'CHECK FAILED: unknown kind';
  exception when insufficient_privilege or invalid_parameter_value then null; end;
  reset role;

  raise exception 'ALL IMPORT WIZARD CHECKS PASSED';
end $$;
