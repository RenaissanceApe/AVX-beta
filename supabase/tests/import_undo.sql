-- Checks for migration 20261117000001 (switching S1a: undoing an import). Run in the TEST
-- project's SQL editor AFTER that migration has been run by hand. Rolls itself back; ends with
--   "ALL IMPORT UNDO CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  org_a uuid; g1 uuid; res jsonb; b_loc uuid; b_items uuid; b_price uuid; b_units uuid; b_units2 uuid; n int; t text; v numeric;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'iu-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'iu-c@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Undo Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');

  b_loc := (run_import(org_a, 'locations', '[{"name": "Warehouse"}, {"name": "Van 1", "kind": "vehicle"}]') ->> 'batch')::uuid;
  b_items := (run_import(org_a, 'items', '[{"name": "XLR 10 m", "quantity": 40, "location": "Warehouse"}, {"name": "MAC Aura XB", "code": "AURA", "unit_price": 80}]') ->> 'batch')::uuid;

  -- Units: undoing removes them (and their history) and makes the item untracked again
  b_units := (run_import(org_a, 'units', '[{"item_code": "AURA", "code": "LP-1"}, {"item_code": "AURA", "code": "LP-2"}]') ->> 'batch')::uuid;
  res := undo_import(b_units);
  if (res ->> 'removed')::int <> 4 or (res ->> 'restored')::int <> 1 then raise exception 'CHECK FAILED: undo units %', res; end if;
  select count(*) into n from stock_units where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: units left'; end if;
  select tracking into t from price_items where org_id = org_a and code = 'AURA';
  if t <> 'none' then raise exception 'CHECK FAILED: tracking not restored (%)', t; end if;
  select undone_at is not null into strict t from import_batches where id = b_units;
  begin
    perform undo_import(b_units);
    raise exception 'CHECK FAILED: undone twice';
  exception when invalid_parameter_value then null; end;

  -- Units used since (moved to the van): the import can't be undone any more
  b_units2 := (run_import(org_a, 'units', '[{"item_code": "AURA", "code": "LP-3", "location": "Warehouse"}]') ->> 'batch')::uuid;
  update stock_units set location_id = (select id from stock_locations where org_id = org_a and name = 'Van 1') where code = 'LP-3' and org_id = org_a;
  begin
    perform undo_import(b_units2);
    raise exception 'CHECK FAILED: undo of a used import';
  exception when foreign_key_violation then null; end;
  select count(*) into n from stock_units where org_id = org_a;
  if n <> 1 then raise exception 'CHECK FAILED: refused undo still removed something'; end if;

  -- A changed price is put back, unless someone changed it again since
  b_price := (run_import(org_a, 'items', '[{"code": "AURA", "unit_price": 85}, {"name": "XLR 10 m", "unit_price": 3}]') ->> 'batch')::uuid;
  update price_items set unit_price = 90 where org_id = org_a and code = 'AURA';
  res := undo_import(b_price);
  if (res ->> 'restored')::int <> 1 or (res ->> 'kept')::int <> 1 then raise exception 'CHECK FAILED: undo prices %', res; end if;
  select unit_price into v from price_items where org_id = org_a and code = 'AURA';
  if v <> 90 then raise exception 'CHECK FAILED: later change overwritten (%)', v; end if;
  select unit_price into v from price_items where org_id = org_a and name = 'XLR 10 m';
  if v <> 0 then raise exception 'CHECK FAILED: price not restored (%)', v; end if;

  -- The items batch: AURA has a unit from another import, so it's in use
  begin
    perform undo_import(b_items);
    raise exception 'CHECK FAILED: undo of items in use';
  exception when foreign_key_violation then null; end;
  reset role;

  -- Crew can't undo
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform undo_import(b_loc);
    raise exception 'CHECK FAILED: crew undid';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Locations with stock in them are in use too
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform undo_import(b_loc);
    raise exception 'CHECK FAILED: undo of locations in use';
  exception when foreign_key_violation then null; end;
  reset role;

  -- Kit contents: undoing removes the parts it added, puts back a changed quantity, and the
  -- kit is a plain item again
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform run_import(org_a, 'items', '[{"name": "Speaker case", "code": "CASE", "tracking": "serial"}, {"name": "Clamp", "code": "CLAMP", "quantity": 4, "location": "Warehouse"}]');
  perform run_import(org_a, 'kits', '[{"kit_code": "CASE", "item_code": "CLAMP", "quantity": 2}]');
  res := run_import(org_a, 'kits', '[{"kit_code": "CASE", "item_code": "CLAMP", "quantity": 3}, {"kit_code": "CASE", "item_code": "AURA"}]');
  res := undo_import((res ->> 'batch')::uuid);
  if (res ->> 'removed')::int <> 1 or (res ->> 'restored')::int <> 1 then raise exception 'CHECK FAILED: undo kits %', res; end if;
  select p.quantity into n from item_parts p join price_items i on i.id = p.parent_id where i.code = 'CASE' and p.org_id = org_a;
  if n <> 2 then raise exception 'CHECK FAILED: kit quantity not put back (%)', n; end if;
  reset role;

  raise exception 'ALL IMPORT UNDO CHECKS PASSED';
end $$;
