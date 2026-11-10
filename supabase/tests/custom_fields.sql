-- Checks for migration 20261202000000 (custom fields, step 6 S2).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL CUSTOM FIELD CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); k uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; org_x uuid; po uuid; cap uuid; ins uuid; kind uuid; site uuid; due uuid; theirs uuid; vat uuid;
  g uuid; c uuid; i uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'cf-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'cf-m@avx.invalid', 'authenticated', 'authenticated'),
    (k, 'cf-k@avx.invalid', 'authenticated', 'authenticated'), (x, 'cf-x@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_x;
  insert into custom_fields (org_id, entity, label, kind) values (org_x, 'gig', 'Theirs', 'text') returning id into theirs;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Fields Co', a) returning id into org_a;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');

  -- The admin adds fields of every kind
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'gig', ' PO number ', 'text') returning id into po;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'gig', 'Capacity', 'number') returning id into cap;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'gig', 'Insurance checked', 'yes_no') returning id into ins;
  insert into custom_fields (org_id, entity, label, kind, choices) values (org_a, 'gig', 'Kind', 'choice', '["Indoor", "Outdoor"]') returning id into kind;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'gig', 'Site', 'link') returning id into site;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'gig', 'Deposit due', 'date') returning id into due;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'client', 'VAT exempt', 'yes_no') returning id into vat;
  if (select label from custom_fields where id = po) <> 'PO number' then raise exception 'CHECK FAILED: label tidied'; end if;
  begin
    insert into custom_fields (org_id, entity, label, kind) values (org_a, 'gig', 'No choices', 'choice');
    raise exception 'CHECK FAILED: choice without choices';
  exception when invalid_parameter_value then null; end;

  -- Values of the right kind are kept
  insert into gigs (org_id, name, status, created_by, custom_values)
  values (org_a, 'Fields gig', 'draft', a, jsonb_build_object(po::text, 'PO-77', cap::text, 1200, ins::text, true, kind::text, 'Outdoor',
                                                              site::text, 'https://venue.example', due::text, '2026-12-01'))
  returning id into g;
  if (select custom_values->>po::text from gigs where id = g) <> 'PO-77' then raise exception 'CHECK FAILED: values kept'; end if;
  -- Wrong kinds, unknown fields, other organisations' fields and fields of other records are refused
  begin update gigs set custom_values = custom_values || jsonb_build_object(cap::text, 'many') where id = g; raise exception 'CHECK FAILED: number';
  exception when invalid_parameter_value then null; end;
  begin update gigs set custom_values = custom_values || jsonb_build_object(kind::text, 'Underwater') where id = g; raise exception 'CHECK FAILED: choice';
  exception when invalid_parameter_value then null; end;
  begin update gigs set custom_values = custom_values || jsonb_build_object(site::text, 'javascript:alert(1)') where id = g; raise exception 'CHECK FAILED: link';
  exception when invalid_parameter_value then null; end;
  begin update gigs set custom_values = custom_values || jsonb_build_object(due::text, 'tomorrow') where id = g; raise exception 'CHECK FAILED: date';
  exception when invalid_parameter_value then null; end;
  begin update gigs set custom_values = custom_values || jsonb_build_object(theirs::text, 'x') where id = g; raise exception 'CHECK FAILED: foreign field';
  exception when invalid_parameter_value then null; end;
  begin update gigs set custom_values = custom_values || jsonb_build_object(vat::text, true) where id = g; raise exception 'CHECK FAILED: client field on a gig';
  exception when invalid_parameter_value then null; end;
  -- A cleared value is fine
  update gigs set custom_values = custom_values || jsonb_build_object(cap::text, null) where id = g;
  -- Clients and items take their own fields
  insert into clients (org_id, name, custom_values) values (org_a, 'Client A', jsonb_build_object(vat::text, true)) returning id into c;
  begin
    insert into price_items (org_id, name, unit_price, created_by, custom_values) values (org_a, 'Item', 1, a, jsonb_build_object(po::text, 'x'));
    raise exception 'CHECK FAILED: gig field on an item';
  exception when invalid_parameter_value then null; end;
  -- A removed field: its values stay, other edits still save, it can't be set again
  update custom_fields set removed_at = now() where id = po;
  update gigs set name = 'Renamed', custom_values = custom_values || jsonb_build_object(ins::text, false) where id = g;
  if (select custom_values->>po::text from gigs where id = g) <> 'PO-77' then raise exception 'CHECK FAILED: removed field value kept'; end if;
  begin update gigs set custom_values = custom_values || jsonb_build_object(po::text, 'PO-78') where id = g; raise exception 'CHECK FAILED: removed field set';
  exception when invalid_parameter_value then null; end;
  -- A field's kind can't be changed
  begin update custom_fields set kind = 'number' where id = site; raise exception 'CHECK FAILED: kind changed';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Members read but don't manage; crew on a gig read gig fields only; outsiders see none
  insert into gig_members (gig_id, user_id, role) values (g, k, 'crew');
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from custom_fields where org_id = org_a) <> 7 then raise exception 'CHECK FAILED: member reads'; end if;
  begin
    insert into custom_fields (org_id, entity, label, kind) values (org_a, 'gig', 'Member field', 'text');
    raise exception 'CHECK FAILED: member added a field';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from custom_fields where org_id = org_a and entity = 'gig') <> 6 then raise exception 'CHECK FAILED: crew reads gig fields'; end if;
  if exists (select 1 from custom_fields where org_id = org_a and entity <> 'gig') then raise exception 'CHECK FAILED: crew reads client fields'; end if;
  reset role;

  raise exception 'ALL CUSTOM FIELD CHECKS PASSED';
end $$;

-- Migration 20261202000001: the export has one column per custom field (built-in columns win)
--   "ALL CUSTOM EXPORT CHECKS PASSED"  → good
do $$
declare a uuid := gen_random_uuid(); org_a uuid; po uuid; vat uuid; out jsonb; outc jsonb;
begin
  insert into auth.users (id, email, aud, role) values (a, 'cx-a@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Export Fields Co', a) returning id into org_a;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'gig', 'PO number', 'text') returning id into po;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'gig', 'name', 'text');
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'client', 'VAT exempt', 'yes_no') returning id into vat;
  insert into gigs (org_id, name, status, created_by, custom_values) values (org_a, 'Export gig', 'draft', a, jsonb_build_object(po::text, 'PO-9'));
  insert into gigs (org_id, name, status, created_by) values (org_a, 'Plain gig', 'draft', a);
  insert into clients (org_id, name, custom_values) values (org_a, 'Client', jsonb_build_object(vat::text, true));
  out := public.export_org_part(org_a, 'gigs', 0);
  outc := public.export_org_part(org_a, 'clients', 0);
  reset role;
  if out->0->>'PO number' <> 'PO-9' or out->0->>'name' <> 'Export gig' or not (out->1 ? 'PO number') or out->0 ? 'custom_values' then
    raise exception 'CHECK FAILED: %', out;
  end if;
  if (outc->0->'VAT exempt')::boolean is not true then raise exception 'CHECK FAILED clients: %', outc; end if;
  raise exception 'ALL CUSTOM EXPORT CHECKS PASSED';
end $$;

-- Migration 20270114000000 (IM2): the import saves values for the organisation's own fields
-- (items, clients, suppliers and gigs), merges them over what's there, keeps what an empty cell
-- doesn't give, refuses a wrong value as a row problem, and Undo puts the old values back.
--   "ALL CUSTOM IMPORT CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); x uuid := gen_random_uuid(); org_a uuid; org_x uuid;
  colour uuid; height uuid; vat uuid; po uuid; rating uuid; theirs uuid; res jsonb; b uuid; cv jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'ci-a@avx.invalid', 'authenticated', 'authenticated'), (x, 'ci-x@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Import Co', x) returning id into org_x;
  insert into custom_fields (org_id, entity, label, kind) values (org_x, 'item', 'Theirs', 'text') returning id into theirs;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Import Fields Co', a) returning id into org_a;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'item', 'Colour', 'text') returning id into colour;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'item', 'Height', 'number') returning id into height;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'client', 'VAT exempt', 'yes_no') returning id into vat;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'supplier', 'Rating', 'number') returning id into rating;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'gig', 'PO number', 'text') returning id into po;

  -- A new item gets its values
  res := run_import(org_a, 'items', jsonb_build_array(jsonb_build_object('_row', 2, 'name', 'CI Lamp', 'code', 'CIL1',
    'custom_values', jsonb_build_object(colour::text, 'red', height::text, 2))));
  if (res ->> 'created')::int <> 1 then raise exception 'CHECK FAILED: item created %', res; end if;
  select custom_values into cv from price_items where org_id = org_a and code = 'CIL1';
  if cv ->> colour::text <> 'red' or (cv ->> height::text)::numeric <> 2 then raise exception 'CHECK FAILED: item values %', cv; end if;
  -- No values (or an empty cell) keep what's there
  res := run_import(org_a, 'items', '[{"_row": 2, "code": "CIL1", "custom_values": {}}]');
  if (res ->> 'unchanged')::int <> 1 then raise exception 'CHECK FAILED: empty kept %', res; end if;
  -- A value the file gives is merged over the others; Undo puts the old ones back
  res := run_import(org_a, 'items', jsonb_build_array(jsonb_build_object('_row', 2, 'code', 'CIL1', 'custom_values', jsonb_build_object(height::text, 3))));
  if (res ->> 'updated')::int <> 1 then raise exception 'CHECK FAILED: item updated %', res; end if;
  select custom_values into cv from price_items where org_id = org_a and code = 'CIL1';
  if cv ->> colour::text <> 'red' or (cv ->> height::text)::numeric <> 3 then raise exception 'CHECK FAILED: merged %', cv; end if;
  res := undo_import((res ->> 'batch')::uuid);
  select custom_values into cv from price_items where org_id = org_a and code = 'CIL1';
  if (cv ->> height::text)::numeric <> 2 or cv ->> colour::text <> 'red' then raise exception 'CHECK FAILED: undo restores %', cv; end if;
  -- A value of the wrong kind, or another organisation's field, is the row's problem, not an error
  res := run_import(org_a, 'items', jsonb_build_array(
    jsonb_build_object('_row', 2, 'name', 'CI Desk', 'custom_values', jsonb_build_object(height::text, 'tall')),
    jsonb_build_object('_row', 3, 'name', 'CI Stand', 'custom_values', jsonb_build_object(theirs::text, 'x'))));
  if (res ->> 'skipped')::int <> 2 or res -> 'problems' -> 0 ->> 'message' <> 'Value does not fit the field'
     or res -> 'problems' -> 1 ->> 'message' <> 'Unknown field' then raise exception 'CHECK FAILED: refused as problems %', res; end if;
  if exists (select 1 from price_items where org_id = org_a and name in ('CI Desk', 'CI Stand')) then raise exception 'CHECK FAILED: refused rows saved'; end if;

  -- Clients and suppliers, new and existing
  res := run_import(org_a, 'clients', jsonb_build_array(jsonb_build_object('_row', 2, 'name', 'CI Client', 'custom_values', jsonb_build_object(vat::text, true))));
  if (res ->> 'created')::int <> 1 or (select (custom_values ->> vat::text)::boolean from clients where org_id = org_a and name = 'CI Client') is not true
    then raise exception 'CHECK FAILED: client %', res; end if;
  res := run_import(org_a, 'clients', jsonb_build_array(jsonb_build_object('_row', 2, 'name', 'CI Client', 'custom_values', jsonb_build_object(vat::text, false))));
  if (res ->> 'updated')::int <> 1 or (select (custom_values ->> vat::text)::boolean from clients where org_id = org_a and name = 'CI Client') is not false
    then raise exception 'CHECK FAILED: client updated %', res; end if;
  res := run_import(org_a, 'suppliers', jsonb_build_array(jsonb_build_object('_row', 2, 'name', 'CI Supplier', 'custom_values', jsonb_build_object(rating::text, 4))));
  if (select (custom_values ->> rating::text)::numeric from suppliers where org_id = org_a and name = 'CI Supplier') <> 4 then raise exception 'CHECK FAILED: supplier %', res; end if;
  -- A client field on a supplier is refused
  res := run_import(org_a, 'suppliers', jsonb_build_array(jsonb_build_object('_row', 2, 'name', 'CI Supplier 2', 'custom_values', jsonb_build_object(vat::text, true))));
  if (res ->> 'skipped')::int <> 1 then raise exception 'CHECK FAILED: field of another kind %', res; end if;

  -- Gigs (upcoming jobs), new and existing
  res := import_jobs(org_a, 'gigs', jsonb_build_array(jsonb_build_object('_row', 2, 'ref', 'CI-1', 'name', 'CI Gig', 'start_date', current_date + 10,
    'custom_values', jsonb_build_object(po::text, 'PO-1'))));
  if (select custom_values ->> po::text from gigs where org_id = org_a and import_ref = 'CI-1') <> 'PO-1' then raise exception 'CHECK FAILED: gig %', res; end if;
  res := import_jobs(org_a, 'gigs', jsonb_build_array(jsonb_build_object('_row', 2, 'ref', 'CI-1', 'name', 'CI Gig', 'start_date', current_date + 10,
    'custom_values', jsonb_build_object(po::text, 'PO-2'))));
  if (select custom_values ->> po::text from gigs where org_id = org_a and import_ref = 'CI-1') <> 'PO-2' then raise exception 'CHECK FAILED: gig updated %', res; end if;
  reset role;

  raise exception 'ALL CUSTOM IMPORT CHECKS PASSED';
end $$;
