-- Checks for migration 20270115000000 (IM3: fixes in the import's batch, exact picks, remembered
-- fixes, what's in use). Run in the TEST project's SQL editor after that migration. Rolls itself
-- back; ends with
--   "ALL IMPORT FIXES CHECKS PASSED"  → good
-- Undoing the rest and switching to per unit are checked in import_undo.sql (after the hand-run
-- file 20270115000001_import_fixes_undo.sql).
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g1 uuid; tw1 uuid; tw2 uuid; foreign_item uuid; m1 uuid; m2 uuid; wh uuid; old_loc uuid; gaffer uuid; bulk uuid;
  cl1 uuid; cl2 uuid; res jsonb; b uuid; n int; t text; v numeric; ok boolean; switched boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'ifx-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'ifx-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'ifx-o@avx.invalid', 'authenticated', 'authenticated');
  select exists (select 1 from pg_constraint where conname = 'import_changes_action_check' and pg_get_constraintdef(oid) like '%removed%') into switched;

  -- Another organisation with an item of its own
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', o) returning id into org_b;
  insert into price_items (org_id, name, created_by) values (org_b, 'Foreign mic', o) returning id into foreign_item;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Fixes Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, current_date + 10, 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  -- Two items with the same name and no code
  insert into price_items (org_id, name, created_by) values (org_a, 'Shure SM58', a) returning id into m1;
  insert into price_items (org_id, name, created_by) values (org_a, 'Shure SM58', a) returning id into m2;

  -- ── Exact picks ──
  res := run_import(org_a, 'items', '[{"_row": 2, "name": "Shure SM58", "unit_price": 12}]');
  if (res ->> 'skipped')::int <> 1 then raise exception 'CHECK FAILED: same name without a pick went in %', res; end if;
  res := run_import(org_a, 'items', jsonb_build_array(jsonb_build_object('_row', 2, 'name', 'Shure SM58', 'unit_price', 12, '_item_id', m2)));
  if (res ->> 'updated')::int <> 1 then raise exception 'CHECK FAILED: pick by id %', res; end if;
  select unit_price into v from price_items where id = m2;
  if v <> 12 then raise exception 'CHECK FAILED: the picked item wasn''t updated (%)', v; end if;
  select unit_price into v from price_items where id = m1;
  if v <> 0 then raise exception 'CHECK FAILED: the other item changed (%)', v; end if;
  -- Another organisation's item, an archived one, and something that isn't an id are refused
  res := run_import(org_a, 'units', jsonb_build_array(jsonb_build_object('item', 'Foreign mic', '_item_id', foreign_item, 'code', 'F-1')));
  if (res ->> 'skipped')::int <> 1 or res -> 'problems' -> 0 ->> 'message' not like 'The chosen item isn''t in this organisation%' then
    raise exception 'CHECK FAILED: another organisation''s item %', res;
  end if;
  update price_items set archived_at = now() where id = m1;
  res := run_import(org_a, 'items', jsonb_build_array(jsonb_build_object('name', 'Shure SM58', '_item_id', m1, 'unit_price', 3)));
  if (res ->> 'skipped')::int <> 1 then raise exception 'CHECK FAILED: archived pick went in %', res; end if;
  res := run_import(org_a, 'items', '[{"name": "Shure SM58", "_item_id": "not-an-id"}]');
  if (res ->> 'skipped')::int <> 1 or res -> 'problems' -> 0 ->> 'message' <> 'The chosen record isn''t one AVX knows' then
    raise exception 'CHECK FAILED: a bad pick %', res;
  end if;
  -- Locations by id, gigs by id
  res := run_import(org_a, 'items', jsonb_build_array(jsonb_build_object('name', 'Cable', 'quantity', 5, 'location', 'nowhere', '_location_id', wh)));
  if (res ->> 'created')::int <> 1 then raise exception 'CHECK FAILED: location by id %', res; end if;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Twin', a, current_date + 20, 'draft') returning id into tw1;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Twin', a, current_date + 30, 'draft') returning id into tw2;
  res := import_jobs(org_a, 'gig_equipment', '[{"gig": "Twin", "item": "Cable", "quantity": 2}]');
  if (res ->> 'skipped')::int <> 1 then raise exception 'CHECK FAILED: same-named gigs without a pick %', res; end if;
  update price_items set tracking = 'bulk' where id = m2; -- only stock items can be planned
  res := import_jobs(org_a, 'gig_equipment', jsonb_build_array(jsonb_build_object('gig', 'Twin', '_gig_id', tw2, 'item', 'Shure SM58', '_item_id', m2, 'quantity', 2)));
  if (res ->> 'created')::int <> 1 or not exists (select 1 from gig_equipment where gig_id = tw2 and item_id = m2) then
    raise exception 'CHECK FAILED: gig and item by id %', res;
  end if;
  if res ->> 'batch' is not null then raise exception 'CHECK FAILED: a batch without fixes'; end if;

  -- Contacts: the chosen one, or a new one
  insert into clients (org_id, name) values (org_a, 'Acme') returning id into cl1;
  insert into clients (org_id, name) values (org_a, 'Acme') returning id into cl2;
  res := run_import(org_a, 'clients', '[{"name": "Acme", "phone": "111"}]');
  if (res ->> 'skipped')::int <> 1 then raise exception 'CHECK FAILED: same-named contacts without a pick %', res; end if;
  res := run_import(org_a, 'clients', jsonb_build_array(jsonb_build_object('name', 'Acme', 'phone', '222', '_contact_id', cl2)));
  select phone into t from clients where id = cl2;
  if (res ->> 'updated')::int <> 1 or t <> '222' then raise exception 'CHECK FAILED: contact by id % %', res, t; end if;
  res := run_import(org_a, 'clients', '[{"name": "Acme", "_new": "yes"}]');
  select count(*) into n from clients where org_id = org_a and name = 'Acme';
  if (res ->> 'created')::int <> 1 or n <> 3 then raise exception 'CHECK FAILED: add as a new contact % %', res, n; end if;
  -- A gig and a quote linked to the chosen client
  res := import_jobs(org_a, 'gigs', jsonb_build_array(jsonb_build_object('name', 'Show 2', 'start_date', current_date + 40, 'client', 'Acme', '_client_id', cl2)));
  if (select client_id from gigs where org_id = org_a and name = 'Show 2') is distinct from cl2 then raise exception 'CHECK FAILED: gig client by id %', res; end if;
  res := import_jobs(org_a, 'quotes', jsonb_build_array(jsonb_build_object('quote_ref', 'Q-1', 'client', 'Acme', '_client_id', cl2, 'description', 'Mic', 'item', 'Shure SM58', '_item_id', m2)));
  if (select client_id from quotes where org_id = org_a and import_ref = 'Q-1') is distinct from cl2 then raise exception 'CHECK FAILED: quote client by id %', res; end if;
  if (select body -> 'phases' -> 0 -> 'sections' -> 0 -> 'lines' -> 0 ->> 'item_id' from quotes where org_id = org_a and import_ref = 'Q-1') <> m2::text then
    raise exception 'CHECK FAILED: quote line item by id';
  end if;

  -- ── What the fixes add goes in the import's batch; one undo takes it all back ──
  res := run_import(org_a, 'units', '[
    {"_fix": "add_location", "name": "Van 9", "kind": "vehicle"},
    {"_fix": "add_item", "name": "Wireless kit", "code": "WK", "tracking": "serial"},
    {"_row": 2, "item_code": "WK", "code": "WK-1", "location": "Van 9"}]');
  b := (res ->> 'batch')::uuid;
  if (res ->> 'added')::int <> 2 or (res ->> 'created')::int <> 1 then raise exception 'CHECK FAILED: fixes in the batch %', res; end if;
  if (select added from import_batches where id = b) <> 2 then raise exception 'CHECK FAILED: batch added count'; end if;
  res := undo_import(b);
  select count(*) into n from stock_locations where org_id = org_a and name = 'Van 9';
  if n <> 0 then raise exception 'CHECK FAILED: the added location stayed %', res; end if;
  select count(*) into n from price_items where org_id = org_a and code = 'WK';
  if n <> 0 then raise exception 'CHECK FAILED: the added item stayed %', res; end if;
  -- Only fixes, no rows, is fine too
  res := run_import(org_a, 'locations', '[{"_fix": "add_location", "name": "Spare room"}]');
  if (res ->> 'added')::int <> 1 or (res ->> 'created')::int <> 0 then raise exception 'CHECK FAILED: fixes only %', res; end if;

  -- A fix that fails stops the whole import
  begin
    perform run_import(org_a, 'locations', jsonb_build_array(jsonb_build_object('_fix', 'restore_item', 'id', gen_random_uuid()), jsonb_build_object('name', 'Nope')));
    raise exception 'CHECK FAILED: a failed fix let the import go on';
  exception when invalid_parameter_value then
    if sqlerrm not like 'Fix not saved:%' then raise; end if;
  end;
  if exists (select 1 from stock_locations where org_id = org_a and name = 'Nope') then raise exception 'CHECK FAILED: rows went in after a failed fix'; end if;
  begin
    perform run_import(org_a, 'items', jsonb_build_array(jsonb_build_object('_fix', 'restore_item', 'id', foreign_item)));
    raise exception 'CHECK FAILED: restored another organisation''s item';
  exception when invalid_parameter_value then null; end;

  -- Restoring an archived item (m1) with the import; undo archives it again
  res := run_import(org_a, 'items', jsonb_build_array(jsonb_build_object('_fix', 'restore_item', 'id', m1), jsonb_build_object('name', 'Shure SM58', '_item_id', m1, 'unit_price', 5)));
  if (res ->> 'added')::int <> 1 or (res ->> 'updated')::int <> 1 then raise exception 'CHECK FAILED: restore item %', res; end if;
  if (select archived_at from price_items where id = m1) is not null then raise exception 'CHECK FAILED: item not restored'; end if;
  res := undo_import((res ->> 'batch')::uuid);
  if (select archived_at from price_items where id = m1) is null then raise exception 'CHECK FAILED: undo didn''t archive the item again %', res; end if;
  if (select unit_price from price_items where id = m1) <> 0 then raise exception 'CHECK FAILED: undo didn''t put the price back'; end if;

  -- Restoring an archived location; undo archives it again
  insert into stock_locations (org_id, name, archived_at) values (org_a, 'Old store', now()) returning id into old_loc;
  res := run_import(org_a, 'items', jsonb_build_array(jsonb_build_object('_fix', 'restore_location', 'id', old_loc), jsonb_build_object('name', 'Clamp', 'quantity', 3, 'location', 'Old store')));
  if (res ->> 'created')::int <> 1 then raise exception 'CHECK FAILED: restore location %', res; end if;
  res := undo_import((res ->> 'batch')::uuid);
  if (select archived_at from stock_locations where id = old_loc) is null then raise exception 'CHECK FAILED: location not archived again %', res; end if;

  -- Equipment on jobs: "start keeping in stock" in a batch of its own, made in the same call
  insert into price_items (org_id, name, created_by) values (org_a, 'Gaffer', a) returning id into gaffer;
  res := import_jobs(org_a, 'gig_equipment', jsonb_build_array(jsonb_build_object('_fix', 'track', 'id', gaffer), jsonb_build_object('gig', 'Gig 1', 'item', 'Gaffer', 'quantity', 2)));
  b := (res ->> 'batch')::uuid;
  if b is null or (res ->> 'added')::int <> 1 or (res ->> 'created')::int <> 1 then raise exception 'CHECK FAILED: jobs fixes %', res; end if;
  if (select tracking from price_items where id = gaffer) <> 'bulk' then raise exception 'CHECK FAILED: not kept in stock'; end if;
  if (select kind from import_batches where id = b) <> 'items' then raise exception 'CHECK FAILED: jobs fixes batch kind'; end if;
  res := undo_import(b);
  if (select tracking from price_items where id = gaffer) <> 'none' then raise exception 'CHECK FAILED: undo of "keep in stock" %', res; end if;

  -- Jobs: "Add to Contacts" goes in the batch; the gig then uses the client, so it's in use
  res := import_jobs(org_a, 'gigs', jsonb_build_array(jsonb_build_object('_fix', 'add_client', 'name', 'New Client Lda'),
    jsonb_build_object('name', 'Show', 'start_date', current_date + 10, 'client', 'New Client Lda')));
  b := (res ->> 'batch')::uuid;
  if (select g.client_id from gigs g where g.org_id = org_a and g.name = 'Show') is distinct from (select id from clients where org_id = org_a and name = 'New Client Lda') then
    raise exception 'CHECK FAILED: the gig isn''t linked to the added client %', res;
  end if;
  res := import_in_use(b);
  if (res ->> 'count')::int <> 1 or res -> 'items' -> 0 ->> 'used_by' <> 'gig' or res -> 'items' -> 0 ->> 'used_name' <> 'Show'
     or res -> 'items' -> 0 ->> 'name' <> 'New Client Lda' then
    raise exception 'CHECK FAILED: in use %', res;
  end if;
  -- Undo knows a gig uses the client only once the hand-run file has replaced undo_import
  if switched then
    begin
      perform undo_import(b);
      raise exception 'CHECK FAILED: undid a client a gig uses';
    exception when foreign_key_violation then null; end;
  end if;

  -- Bulk items that could switch to per unit: only while their stock is the imported quantity
  res := run_import(org_a, 'items', '[{"name": "Wedge", "code": "WDG", "quantity": 4, "location": "Warehouse"}, {"name": "Sub", "code": "SUB", "quantity": 4, "location": "Warehouse"}]');
  select id into bulk from price_items where org_id = org_a and code = 'WDG';
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, (select id from price_items where org_id = org_a and code = 'SUB'), 'found', 1, wh);
  if switched then
    if import_per_unit_ok(org_a, array[bulk, (select id from price_items where org_id = org_a and code = 'SUB'), gaffer]) <> array[bulk] then
      raise exception 'CHECK FAILED: per unit ok';
    end if;
  else
    begin
      perform import_per_unit_ok(org_a, array[bulk]);
      raise exception 'CHECK FAILED: the per-unit check before the hand-run file';
    exception when feature_not_supported then null; end;
    begin
      perform run_import(org_a, 'units', jsonb_build_array(jsonb_build_object('_fix', 'per_unit', 'id', bulk), jsonb_build_object('item_code', 'WDG', 'code', 'WDG-1')));
      raise exception 'CHECK FAILED: per unit before the hand-run file';
    exception when invalid_parameter_value then
      if sqlerrm not like 'Fix not saved: Switching to per unit isn''t switched on yet%' then raise; end if;
    end;
  end if;

  -- ── Fixes remembered with a saved matching ──
  insert into import_presets (org_id, kind, name, mapping, fixes)
  values (org_a, 'items', 'Rentman', '{"Name": "name"}', '[{"type": "replace", "field": "kind", "from": "verhuur", "set": {"kind": "rental"}}]');
  begin
    insert into import_presets (org_id, kind, name, mapping, fixes) values (org_a, 'items', 'Too big', '{}', jsonb_build_array(repeat('x', 40000)));
    raise exception 'CHECK FAILED: oversized fixes saved';
  exception when check_violation then null; end;
  begin
    insert into import_presets (org_id, kind, name, mapping, fixes) values (org_a, 'items', 'Not a list', '{}', '{"a": 1}');
    raise exception 'CHECK FAILED: fixes that aren''t a list saved';
  exception when check_violation then null; end;
  reset role;

  -- Crew can't see what's in use, run the per-unit check, or read the presets
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform import_in_use(b);
    raise exception 'CHECK FAILED: crew read what''s in use';
  exception when insufficient_privilege then null; end;
  begin
    perform import_per_unit_ok(org_a, array[bulk]);
    raise exception 'CHECK FAILED: crew ran the per-unit check';
  exception when insufficient_privilege then null; end;
  select count(*) into n from import_presets where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: crew read the presets'; end if;
  reset role;

  -- Another organisation's admin can't either
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform import_in_use(b);
    raise exception 'CHECK FAILED: another organisation read what''s in use';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL IMPORT FIXES CHECKS PASSED';
end $$;
