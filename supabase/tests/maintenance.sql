-- Checks for migration 20261029000000 (repairs, damage reports, inspections, reminders).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL MAINTENANCE CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); mb uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; wh uuid; g1 uuid; speaker uuid; cable uuid; mic uuid;
  u1 uuid; u2 uuid; u3 uuid; c1 text; rep uuid; rep2 uuid; n int; t text; r jsonb; d date;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'm-a@avx.invalid', 'authenticated', 'authenticated'), (mb, 'm-m@avx.invalid', 'authenticated', 'authenticated'),
    (c, 'm-c@avx.invalid', 'authenticated', 'authenticated'), (o, 'm-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Repair Co', a) returning id into org_a;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, mb, 'member');
  set local role authenticated;
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into price_items (org_id, name, unit_price, created_by, tracking, inspection_kind, inspection_months)
    values (org_a, 'Speaker', 60, a, 'serial', 'PAT', 12) returning id into speaker;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Cable', 1, a, 'bulk') returning id into cable;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Mic', 5, a, 'bulk') returning id into mic;
  insert into stock_units (org_id, item_id, location_id) values (org_a, speaker, wh) returning id, code into u1, c1;
  insert into stock_units (org_id, item_id, location_id) values (org_a, speaker, wh) returning id into u2;
  insert into stock_units (org_id, item_id, location_id) values (org_a, speaker, wh) returning id into u3;
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, cable, 'purchase', 20, wh);
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'confirmed') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  insert into gig_equipment (gig_id, item_id, quantity) values (g1, speaker, 2), (g1, cable, 10);
  perform dispatch_scan(g1, c1, 'out');
  reset role;

  -- Crew report damage from site
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  rep := report_damage(g1, null, lower(c1), 1, 'Cracked grille', org_a::text || '/' || g1::text || '/a.jpg');
  if rep is null then raise exception 'CHECK FAILED: no repair from site'; end if;
  rep2 := report_damage(g1, null, c1, 1, 'Again', null);
  if rep2 <> rep then raise exception 'CHECK FAILED: second report opened another repair'; end if;
  perform report_damage(g1, cable, null, 3, 'Frayed ends', null);
  select count(*) into n from repairs;
  if n <> 0 then raise exception 'CHECK FAILED: crew read repairs'; end if;
  begin
    perform report_damage(g1, mic, null, 1, 'Broken', null);
    raise exception 'CHECK FAILED: damage to equipment not on the gig';
  exception when invalid_parameter_value then null; end;
  if not private.can_add_repair_photo(org_a::text || '/' || g1::text || '/b.jpg') then raise exception 'CHECK FAILED: crew can''t add a photo'; end if;
  if private.can_add_repair_photo(org_a::text || '/stock/b.jpg') then raise exception 'CHECK FAILED: crew add stock photos'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform report_damage(g1, cable, null, 1, 'x', null);
    raise exception 'CHECK FAILED: outsider reported damage';
  exception when insufficient_privilege then null; end;
  if private.can_add_repair_photo(org_a::text || '/' || g1::text || '/c.jpg') or private.can_add_repair_photo('nonsense/path') then
    raise exception 'CHECK FAILED: outsider photo';
  end if;
  reset role;

  select status into t from stock_units where id = u1;
  if t <> 'repair' then raise exception 'CHECK FAILED: reported unit is %', t; end if;
  if private.item_owned(cable) <> 17 then raise exception 'CHECK FAILED: cable owned %', private.item_owned(cable); end if;
  select count(*) into n from notifications where user_id = a and kind = 'damage_reported';
  if n <> 2 then raise exception 'CHECK FAILED: admin got % damage notifications', n; end if;
  select count(*) into n from notifications where user_id = mb and kind = 'damage_reported';
  if n <> 0 then raise exception 'CHECK FAILED: member notified'; end if;

  -- Repairs in the warehouse
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from repairs where org_id = org_a;
  if n <> 2 then raise exception 'CHECK FAILED: admin sees % repairs', n; end if;
  update repairs set status = 'in_repair', repairer = 'Audio Fix Lda', cost = 85, charge_client = true where id = rep;
  update repairs set status = 'done', outcome = 'New grille' where id = rep;
  select status into t from stock_units where id = u1;
  if t <> 'available' then raise exception 'CHECK FAILED: repaired unit is %', t; end if;
  select count(*) into n from repairs where id = rep and closed_at is not null;
  if n <> 1 then raise exception 'CHECK FAILED: closed_at not set'; end if;
  update repairs set status = 'done' where item_id = cable;
  select owned into n from equipment_availability(org_a, array[cable], now(), now() + interval '1 day', null);
  if n <> 20 then raise exception 'CHECK FAILED: cable not back (%)', n; end if;
  begin
    insert into repairs (item_id, problem) values (speaker, 'Which one?');
    raise exception 'CHECK FAILED: serial repair without a unit';
  exception when check_violation then null; end;
  insert into repairs (item_id, unit_id, problem) values (speaker, u2, 'Dead driver');
  begin
    insert into repairs (item_id, unit_id, problem) values (speaker, u2, 'Twice');
    raise exception 'CHECK FAILED: two open repairs on a unit';
  exception when unique_violation then null; end;
  update repairs set status = 'written_off' where unit_id = u2;
  select status into t from stock_units where id = u2;
  if t <> 'retired' then raise exception 'CHECK FAILED: written-off unit is %', t; end if;

  -- Damaged on return opens a repair
  r := dispatch_scan(g1, c1, 'in', 1, 'damaged', 'Dropped from truck');
  if not (r->>'repair')::boolean then raise exception 'CHECK FAILED: damaged return %', r; end if;
  select count(*) into n from repairs where unit_id = u1 and status = 'open' and problem = 'Dropped from truck';
  if n <> 1 then raise exception 'CHECK FAILED: no repair from the return'; end if;

  -- Inspections: what's due, and a fail opens a repair
  insert into inspections (item_id, unit_id, done_on, result, inspector) values (speaker, u1, current_date - 400, 'pass', 'J. Silva');
  select due_on into d from maintenance_due(org_a) where unit_id = u1;
  if d <> (current_date - 400 + interval '12 months')::date then raise exception 'CHECK FAILED: u1 due %', d; end if;
  select due_on into d from maintenance_due(org_a) where unit_id = u3;
  if d <> current_date then raise exception 'CHECK FAILED: never inspected due %', d; end if;
  select count(*) into n from maintenance_due(org_a) where unit_id = u2;
  if n <> 0 then raise exception 'CHECK FAILED: retired unit due'; end if;
  insert into inspections (item_id, unit_id, result, notes) values (speaker, u3, 'fail', 'Earth fault');
  select status into t from stock_units where id = u3;
  if t <> 'repair' then raise exception 'CHECK FAILED: failed unit is %', t; end if;
  select problem into t from repairs where unit_id = u3;
  if t <> 'Failed inspection (PAT): Earth fault' then raise exception 'CHECK FAILED: failed inspection repair %', t; end if;
  begin
    insert into inspections (item_id, result) values (speaker, 'pass');
    raise exception 'CHECK FAILED: serial inspection without a unit';
  exception when check_violation then null; end;
  update inspections set result = 'fail' where unit_id = u1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: an inspection was changed'; end if;
  reset role;

  -- Crew don't see what's due
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from maintenance_due(org_a);
  if n <> 0 then raise exception 'CHECK FAILED: crew see maintenance'; end if;
  reset role;

  -- Reminders: once per due date
  n := private.send_maintenance_reminders();
  select count(*) into n from notifications where user_id = a and kind = 'inspection_due';
  if n <> 1 then raise exception 'CHECK FAILED: % reminders', n; end if;
  perform private.send_maintenance_reminders();
  select count(*) into n from notifications where user_id = a and kind = 'inspection_due';
  if n <> 1 then raise exception 'CHECK FAILED: reminded twice'; end if;
  select count(*) into n from cron.job where jobname = 'avx-maintenance-reminders';
  if n <> 1 then raise exception 'CHECK FAILED: reminder job not scheduled'; end if;

  raise exception 'ALL MAINTENANCE CHECKS PASSED';
end $$;
