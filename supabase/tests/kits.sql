-- Checks for migration 20261028000000 (sets, cases, accessories, alternatives).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL KIT CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; wh uuid; g1 uuid; speaker uuid; clamp uuid; cable uuid; plain uuid; sset uuid; bigset uuid; scase uuid;
  s1 uuid; s2 uuid; s3 uuid; k1 uuid; k2 uuid; ck1 text; n int; r jsonb; t text;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'k-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'k-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'k-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Kit Co', a) returning id into org_a;
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Speaker', 60, a, 'serial') returning id into speaker;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Clamp', 1, a, 'bulk') returning id into clamp;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Cable', 1, a, 'bulk') returning id into cable;
  insert into price_items (org_id, name, unit_price, created_by) values (org_a, 'Labour', 20, a) returning id into plain;
  insert into price_items (org_id, name, unit_price, created_by, kit_type) values (org_a, 'Sound set', 150, a, 'set') returning id into sset;
  insert into price_items (org_id, name, unit_price, created_by, kit_type) values (org_a, 'Big set', 300, a, 'set') returning id into bigset;
  insert into price_items (org_id, name, unit_price, created_by, tracking, kit_type) values (org_a, 'Speaker case', 10, a, 'serial', 'case') returning id into scase;
  begin
    insert into price_items (org_id, name, unit_price, created_by, tracking, kit_type) values (org_a, 'Bad set', 1, a, 'bulk', 'set');
    raise exception 'CHECK FAILED: a set with stock';
  exception when check_violation then null; end;
  begin
    insert into price_items (org_id, name, unit_price, created_by, kit_type) values (org_a, 'Bad case', 1, a, 'case');
    raise exception 'CHECK FAILED: a case without stock';
  exception when check_violation then null; end;

  -- Contents and accessories
  insert into item_parts (parent_id, child_id, kind, quantity) values
    (sset, speaker, 'content', 2), (sset, cable, 'content', 4), (bigset, sset, 'content', 2),
    (speaker, clamp, 'accessory', 1), (scase, speaker, 'content', 2), (scase, cable, 'content', 2);
  select count(*) into n from item_parts where org_id = org_a;
  if n <> 6 then raise exception 'CHECK FAILED: % parts', n; end if;
  begin
    insert into item_parts (parent_id, child_id, kind) values (speaker, cable, 'content');
    raise exception 'CHECK FAILED: contents on a plain item';
  exception when check_violation then null; end;
  begin
    insert into item_parts (parent_id, child_id, kind) values (sset, clamp, 'accessory');
    raise exception 'CHECK FAILED: accessory on a set';
  exception when check_violation then null; end;
  begin
    insert into item_parts (parent_id, child_id, kind) values (sset, plain, 'content');
    raise exception 'CHECK FAILED: untracked item in a set';
  exception when check_violation then null; end;
  begin
    insert into item_parts (parent_id, child_id, kind) values (clamp, speaker, 'accessory');
    raise exception 'CHECK FAILED: accessory loop';
  exception when check_violation then null; end;
  begin
    insert into item_parts (parent_id, child_id, kind) values (sset, bigset, 'content');
    raise exception 'CHECK FAILED: set inside itself';
  exception when check_violation then null; end;
  begin
    update price_items set kit_type = null where id = sset;
    raise exception 'CHECK FAILED: set with contents stopped being a set';
  exception when check_violation then null; end;

  -- Alternatives are one row per pair, whichever way round
  insert into item_alternatives (item_a, item_b) values (greatest(clamp, cable), least(clamp, cable));
  begin
    insert into item_alternatives (item_a, item_b) values (least(clamp, cable), greatest(clamp, cable));
    raise exception 'CHECK FAILED: same pair twice';
  exception when unique_violation then null; end;
  begin
    insert into item_alternatives (item_a, item_b) values (speaker, sset);
    raise exception 'CHECK FAILED: a set as an alternative';
  exception when check_violation then null; end;

  -- Units in a case
  insert into stock_units (org_id, item_id, location_id) values (org_a, speaker, wh) returning id into s1;
  insert into stock_units (org_id, item_id, location_id) values (org_a, speaker, wh) returning id into s2;
  insert into stock_units (org_id, item_id, location_id) values (org_a, speaker, wh) returning id into s3;
  insert into stock_units (org_id, item_id, location_id) values (org_a, scase, wh) returning id, code into k1, ck1;
  insert into stock_units (org_id, item_id, location_id) values (org_a, scase, wh) returning id into k2;
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, cable, 'purchase', 20, wh);
  update stock_units set case_unit_id = k1 where id in (s1, s2, s3);
  update stock_units set status = 'repair' where id = s3;
  begin
    update stock_units set case_unit_id = s1 where id = s2;
    raise exception 'CHECK FAILED: packed in a speaker';
  exception when check_violation then null; end;
  begin
    update stock_units set case_unit_id = k1 where id = k2;
    raise exception 'CHECK FAILED: case in a case';
  exception when check_violation then null; end;
  begin
    update price_items set kit_type = null where id = scase;
    raise exception 'CHECK FAILED: case with contents stopped being a case';
  exception when check_violation then null; end;

  -- Scanning the case moves what's in it
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'confirmed') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  insert into gig_equipment (gig_id, item_id, quantity) values (g1, scase, 1), (g1, speaker, 2), (g1, cable, 2);
  r := dispatch_scan(g1, ck1, 'out');
  if not (r->>'ok')::boolean or (r->>'contents')::int <> 3 or (r->>'contents_skipped')::int <> 1 then
    raise exception 'CHECK FAILED: case out %', r;
  end if;
  select count(*) into n from stock_units where out_on_gig = g1;
  if n <> 3 then raise exception 'CHECK FAILED: % units out with the case', n; end if;
  select out_qty into n from gig_dispatch_summary(g1) where item_id = cable;
  if n <> 2 then raise exception 'CHECK FAILED: cable out with the case %', n; end if;
  r := dispatch_scan(g1, ck1, 'in');
  if not (r->>'ok')::boolean or (r->>'contents')::int <> 3 then raise exception 'CHECK FAILED: case in %', r; end if;
  select count(*) into n from stock_units where out_on_gig = g1;
  if n <> 0 then raise exception 'CHECK FAILED: % units still out', n; end if;
  r := dispatch_scan(g1, (select code from stock_units where id = s1), 'out');
  if r ? 'contents' then raise exception 'CHECK FAILED: a plain unit has contents %', r; end if;
  reset role;

  -- Crew and outsiders don't see or change the catalogue's kits
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from item_parts where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: crew see kits'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from item_alternatives where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees alternatives'; end if;
  begin
    insert into item_parts (parent_id, child_id, kind) values (sset, clamp, 'content');
    raise exception 'CHECK FAILED: outsider changed a set';
  exception when insufficient_privilege then null; end;
  begin
    update stock_units set case_unit_id = null where id = s1;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'CHECK FAILED: outsider unpacked a case'; end if;
  end;
  reset role;

  raise exception 'ALL KIT CHECKS PASSED';
end $$;
