-- Checks for migration 20261116000000 (switching S1b: importing kit contents).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL KIT IMPORT CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); org_a uuid; res jsonb; n int; t text; b uuid;
begin
  insert into auth.users (id, email, aud, role) values (a, 'ik-a@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Kit Co', a) returning id into org_a;
  perform run_import(org_a, 'locations', '[{"name": "Warehouse"}]');
  perform run_import(org_a, 'items', '[
    {"name": "Speaker", "code": "SPK", "tracking": "serial"},
    {"name": "Speaker case", "code": "SPKCASE", "tracking": "serial"},
    {"name": "Powercon 1 m", "code": "PWC1", "quantity": 50, "location": "Warehouse"},
    {"name": "Rigging plate", "code": "PLATE", "quantity": 10, "location": "Warehouse"},
    {"name": "PA set", "code": "PASET"},
    {"name": "Plain thing", "code": "PLAIN"}
  ]');

  -- A case's contents, a set's contents, an accessory, and three bad rows
  res := run_import(org_a, 'kits', '[
    {"_row": 2, "kit_code": "SPKCASE", "item_code": "SPK", "quantity": 2},
    {"_row": 3, "kit": "PA set", "item": "Speaker case", "quantity": 2},
    {"_row": 4, "kit_code": "SPK", "item_code": "PWC1"},
    {"_row": 5, "kit_code": "NOPE", "item_code": "SPK"},
    {"_row": 6, "kit_code": "PASET", "item_code": "PLAIN"},
    {"_row": 7, "kit_code": "SPKCASE", "item_code": "PLATE", "quantity": 5000}
  ]', 'kits.csv');
  b := (res ->> 'batch')::uuid;
  if (res ->> 'created')::int <> 3 or (res ->> 'skipped')::int <> 3 then raise exception 'CHECK FAILED: kits %', res; end if;
  if (res -> 'problems' -> 0 ->> 'message') not like 'Unknown kit: NOPE%' then raise exception 'CHECK FAILED: problems %', res -> 'problems'; end if;
  select kit_type into t from price_items where org_id = org_a and code = 'SPKCASE';
  if t <> 'case' then raise exception 'CHECK FAILED: tracked kit became %', t; end if;
  select kit_type into t from price_items where org_id = org_a and code = 'PASET';
  if t <> 'set' then raise exception 'CHECK FAILED: untracked kit became %', t; end if;
  select p.kind into t from item_parts p join price_items i on i.id = p.parent_id where i.code = 'SPK' and p.org_id = org_a;
  if t <> 'accessory' then raise exception 'CHECK FAILED: speaker part is %', t; end if;
  select count(*) into n from import_batches where id = b and kind = 'items' and subject = 'kits';
  if n <> 1 then raise exception 'CHECK FAILED: kits batch not recorded as such'; end if;

  -- Again with a new quantity: updated, not doubled
  res := run_import(org_a, 'kits', '[{"kit_code": "SPKCASE", "item_code": "SPK", "quantity": 4}, {"kit": "PA set", "item": "Speaker case", "quantity": 2}]');
  if (res ->> 'updated')::int <> 1 or (res ->> 'unchanged')::int <> 1 then raise exception 'CHECK FAILED: kits re-import %', res; end if;
  select quantity into n from item_parts p join price_items i on i.id = p.parent_id where i.code = 'SPKCASE' and p.org_id = org_a;
  if n <> 4 then raise exception 'CHECK FAILED: quantity %', n; end if;

  -- A preset for kits
  insert into import_presets (org_id, kind, subject, name, mapping) values (org_a, 'items', 'kits', 'Rentman cases', '{"Inhoud": "item"}');
  begin
    insert into import_presets (org_id, kind, subject, name, mapping) values (org_a, 'units', 'kits', 'Wrong', '{}');
    raise exception 'CHECK FAILED: kits preset on units';
  exception when check_violation then null; end;

  select count(*) into n from import_part_changes;
  if n <> 0 then raise exception 'CHECK FAILED: part log readable'; end if;
  reset role;
  select count(*) into n from import_part_changes c join import_batches x on x.id = c.batch_id where x.org_id = org_a;
  if n <> 4 then raise exception 'CHECK FAILED: % part changes logged', n; end if;
  raise exception 'ALL KIT IMPORT CHECKS PASSED';
end $$;
