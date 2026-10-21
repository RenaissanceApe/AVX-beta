-- Checks for migration 20261121000000 (switching S5: organisation export).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL ORG EXPORT CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  org_a uuid; loc uuid; it uuid; kit uuid; un uuid; cl uuid; sp uuid; g uuid; sr uuid; res jsonb; p text; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'ex-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'ex-m@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Export Co', a) returning id into org_a;
  reset role;
  -- Sample data written directly (the checks are about reading it back)
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');

  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into loc;
  insert into price_items (org_id, name, code, category, unit_price, tracking) values (org_a, 'Shure SM58', 'SM58', 'Audio', 5, 'serial') returning id into it;
  insert into price_items (org_id, name, code, kit_type) values (org_a, 'Mic set', 'SET1', 'set') returning id into kit;
  insert into item_parts (org_id, parent_id, child_id, kind, quantity) values (org_a, kit, it, 'content', 6);
  insert into stock_units (org_id, item_id, code, serial, location_id) values (org_a, it, 'A001', 'SN1', loc) returning id into un;
  insert into clients (org_id, name, email) values (org_a, 'Festival Lda', 'f@example.com') returning id into cl;
  insert into suppliers (org_id, name) values (org_a, 'Hire Co') returning id into sp;
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_a, 'Summer Fest', '2026-11-10', '2026-11-12', 'confirmed', a) returning id into g;
  insert into gig_equipment (gig_id, org_id, item_id, item_name, quantity) values (g, org_a, it, 'Shure SM58', 4);
  insert into gig_schedule (gig_id, day, start_time, title) values (g, '2026-11-10', '09:00', 'Load in');
  insert into quotes (org_id, number, title, client_id, gig_id, body, created_by) values (org_a, 1, 'Summer Fest', cl, g,
    jsonb_build_object('phases', jsonb_build_array(jsonb_build_object('name', 'Show', 'sections', jsonb_build_array(
      jsonb_build_object('name', 'Audio', 'lines', jsonb_build_array(
        jsonb_build_object('kind', 'equipment', 'description', 'SM58', 'qty', 4, 'factor', 2, 'unit_price', 5, 'discount_pct', 10, 'item_id', it),
        jsonb_build_object('kind', 'comment', 'description', 'Spare on request'))))))), a);
  insert into subrentals (org_id, supplier_id, gig_id, reference, starts_at, ends_at, created_by) values (org_a, sp, g, 'SR-1', '2026-11-09', '2026-11-13', a) returning id into sr;
  insert into subrental_lines (subrental_id, org_id, item_id, description, quantity) values (sr, org_a, it, 'SM58', 2);
  insert into repairs (org_id, item_id, unit_id, problem, reported_by) values (org_a, it, un, 'Grille dented', a);
  insert into inspections (org_id, item_id, unit_id, done_on, result, created_by) values (org_a, it, un, '2026-10-01', 'pass', a);
  set local role authenticated;

  -- Every part runs
  foreach p in array array['organisation', 'members', 'held_invites', 'locations', 'items', 'stock', 'units', 'kit_contents',
    'stock_movements', 'clients', 'suppliers', 'gigs', 'gig_equipment', 'gig_crew', 'gig_schedule', 'gig_files', 'quotes',
    'quote_lines', 'subrentals', 'subrental_lines', 'repairs', 'inspections'] loop
    res := export_org_part(org_a, p);
    if jsonb_typeof(res) <> 'array' then raise exception 'CHECK FAILED: % not a list', p; end if;
  end loop;

  res := export_org_part(org_a, 'organisation');
  if res->0->>'name' <> 'Export Co' then raise exception 'CHECK FAILED: organisation %', res; end if;
  if export_org_part(org_a, 'organisation', 1) <> '[]' then raise exception 'CHECK FAILED: organisation paged'; end if;
  res := export_org_part(org_a, 'members');
  if jsonb_array_length(res) <> 2 then raise exception 'CHECK FAILED: members %', res; end if;
  res := export_org_part(org_a, 'units');
  if res->0->>'item' <> 'Shure SM58' or res->0->>'location' <> 'Warehouse' or res->0->>'serial' <> 'SN1' then raise exception 'CHECK FAILED: units %', res; end if;
  res := export_org_part(org_a, 'kit_contents');
  if res->0->>'kit' <> 'Mic set' or res->0->>'item_code' <> 'SM58' or (res->0->>'quantity')::int <> 6 then raise exception 'CHECK FAILED: kits %', res; end if;
  res := export_org_part(org_a, 'stock');
  if res->0->>'location' <> 'Warehouse' or (res->0->>'quantity')::int <> 1 then raise exception 'CHECK FAILED: stock %', res; end if;
  res := export_org_part(org_a, 'gig_equipment');
  if res->0->>'gig' <> 'Summer Fest' or res->0->>'gig_ref' <> g::text or res->0->>'item_code' <> 'SM58' then raise exception 'CHECK FAILED: gig equipment %', res; end if;
  res := export_org_part(org_a, 'quotes');
  if res->0->>'client' <> 'Festival Lda' or res->0->>'gig' <> 'Summer Fest' or res->0->>'quote_number' <> 'Q0001' then raise exception 'CHECK FAILED: quotes %', res; end if;
  res := export_org_part(org_a, 'quote_lines');
  if jsonb_array_length(res) <> 2 or res->0->>'section' <> 'Audio' or res->0->>'item_code' <> 'SM58'
     or (res->0->>'line_total')::numeric <> 36 or (res->1->>'line_total')::numeric <> 0 then raise exception 'CHECK FAILED: quote lines %', res; end if;
  res := export_org_part(org_a, 'subrental_lines');
  if res->0->>'supplier' <> 'Hire Co' or res->0->>'item' <> 'Shure SM58' then raise exception 'CHECK FAILED: subrental lines %', res; end if;
  res := export_org_part(org_a, 'repairs');
  if res->0->>'unit_code' <> 'A001' then raise exception 'CHECK FAILED: repairs %', res; end if;

  -- Unknown part
  begin
    perform export_org_part(org_a, 'secrets');
    raise exception 'CHECK FAILED: unknown part';
  exception when invalid_parameter_value then null; end;
  reset role;

  -- A member (not an admin) gets nothing
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform export_org_part(org_a, 'clients');
    raise exception 'CHECK FAILED: member exported';
  exception when insufficient_privilege then null; end;
  reset role;
  -- Signed out: not callable
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform export_org_part(org_a, 'clients');
    raise exception 'CHECK FAILED: anon exported';
  exception when insufficient_privilege then null; end;
  reset role;
  raise exception 'ALL ORG EXPORT CHECKS PASSED';
end $$;
