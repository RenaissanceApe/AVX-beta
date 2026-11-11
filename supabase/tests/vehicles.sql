-- Checks for migration 20270118000000 (vehicles and trips, step 23 part V1).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL VEHICLES CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); vw uuid := gen_random_uuid(); pm uuid := gen_random_uuid();
  k uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); x uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g uuid; g2 uuid; van uuid; truck uuid; other_van uuid; t1 uuid; t2 uuid; t3 uuid; e uuid;
  n integer; res text; js jsonb; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'vh-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'vh-m@avx.invalid', 'authenticated', 'authenticated'),
    (vw, 'vh-v@avx.invalid', 'authenticated', 'authenticated'), (pm, 'vh-pm@avx.invalid', 'authenticated', 'authenticated'),
    (k, 'vh-k@avx.invalid', 'authenticated', 'authenticated'), (k2, 'vh-k2@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'vh-x@avx.invalid', 'authenticated', 'authenticated'), (b, 'vh-b@avx.invalid', 'authenticated', 'authenticated');

  -- ── Setup: organisation A (admin a, member m, viewer vw, staff k), gigs, crew; organisation B
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Vehicles Co', a) returning id into org_a;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Festival', 'confirmed', a, '2027-03-10', '2027-03-12') returning id into g;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Gala', 'confirmed', a, '2027-03-10', '2027-03-10') returning id into g2;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, vw, 'viewer'), (org_a, k, 'member');
  insert into gig_members (gig_id, user_id, role, function_title) values
    (g, pm, 'pm', 'Production manager'), (g, k, 'crew', 'Driver'), (g, k2, 'crew', 'Rigger'), (g2, k2, 'crew', 'Rigger');
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', b) returning id into org_b;
  insert into vehicles (org_id, name) values (org_b, 'Their van') returning id into other_van;
  reset role;

  -- ── Vehicles: admins and members manage them; viewers, outsiders and the gig's PM don't see them
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into vehicles (org_id, name, plate, licence_category, max_load_kg, volume_m3, cost_per_km, cost_per_day)
  values (org_a, '  Van 1 ', ' 12-ab-34 ', 'B', 1200, 12, 0.35, 40) returning id into van;
  insert into vehicles (org_id, name, licence_category, max_load_kg) values (org_a, 'Truck', 'C1', 3500) returning id into truck;
  if (select name || '|' || plate from vehicles where id = van) <> 'Van 1|12-AB-34' then raise exception 'CHECK FAILED: vehicle tidied'; end if;
  begin
    insert into vehicles (org_id, name, licence_category) values (org_a, 'Bad', 'Z');
    raise exception 'CHECK FAILED: unknown licence category';
  exception when check_violation then null; end;
  begin
    update vehicles set org_id = org_b where id = van;
    raise exception 'CHECK FAILED: moved a vehicle to another organisation';
  exception when insufficient_privilege then null; end;
  begin
    insert into vehicles (org_id, name) values (org_b, 'Sneaky');
    raise exception 'CHECK FAILED: added a vehicle to another organisation';
  exception when insufficient_privilege then null; end;
  if (select count(*) from vehicles where id = other_van) <> 0 then raise exception 'CHECK FAILED: saw another organisation''s vehicle'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', vw, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from vehicles where org_id = org_a) <> 0 then raise exception 'CHECK FAILED: viewer saw vehicles'; end if;
  begin
    insert into vehicles (org_id, name) values (org_a, 'Viewer van');
    raise exception 'CHECK FAILED: viewer added a vehicle';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from vehicles) <> 0 then raise exception 'CHECK FAILED: freelance PM read the vehicles table (costs)'; end if;
  -- …but can pick from the gig's organisation's vehicles, without costs
  select count(*) into n from public.gig_vehicle_choices(g);
  if n <> 2 then raise exception 'CHECK FAILED: PM vehicle choices = %', n; end if;
  if (select count(*) from public.gig_vehicle_choices(g2)) <> 0 then raise exception 'CHECK FAILED: PM saw choices for a gig they don''t manage'; end if;
  reset role;

  -- ── Trips: the gig's PM plans them; drivers and passengers must be on the gig
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into trips (gig_id, vehicle_id, direction, driver_id, passenger_ids, departs_at, arrives_at, from_place, to_place, km)
  values (g, van, 'out', k, array[k2, k2, k], '2027-03-10 07:00+00', '2027-03-10 10:30+00', ' Warehouse ', 'Venue', 210)
  returning id into t1;
  if (select org_id from trips where id = t1) <> org_a or (select passenger_ids from trips where id = t1) <> array[k2]
     or (select from_place from trips where id = t1) <> 'Warehouse' then
    raise exception 'CHECK FAILED: trip tidied (org, passengers, places)';
  end if;
  begin
    insert into trips (gig_id, driver_id, departs_at, arrives_at) values (g, x, '2027-03-10 07:00+00', '2027-03-10 08:00+00');
    raise exception 'CHECK FAILED: driver not on the gig';
  exception when invalid_parameter_value then null; end;
  begin
    insert into trips (gig_id, passenger_ids, departs_at, arrives_at) values (g, array[x], '2027-03-10 07:00+00', '2027-03-10 08:00+00');
    raise exception 'CHECK FAILED: passenger not on the gig';
  exception when invalid_parameter_value then null; end;
  begin
    insert into trips (gig_id, vehicle_id, departs_at, arrives_at) values (g, other_van, '2027-03-10 07:00+00', '2027-03-10 08:00+00');
    raise exception 'CHECK FAILED: another organisation''s vehicle';
  exception when invalid_parameter_value then null; end;
  begin
    insert into trips (gig_id, departs_at, arrives_at) values (g, '2027-03-10 08:00+00', '2027-03-10 07:00+00');
    raise exception 'CHECK FAILED: arrives before it leaves';
  exception when check_violation then null; end;
  begin
    insert into trips (gig_id, driver_id, co_driver_id, departs_at, arrives_at) values (g, k, k, '2027-03-10 07:00+00', '2027-03-10 08:00+00');
    raise exception 'CHECK FAILED: driver and co-driver the same';
  exception when check_violation then null; end;
  begin
    insert into trips (gig_id, departs_at, arrives_at) values (g2, '2027-03-10 07:00+00', '2027-03-10 08:00+00');
    raise exception 'CHECK FAILED: PM planned a trip on a gig they don''t manage';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Crew see the gig's trips but don't plan them; outsiders see nothing
  perform set_config('request.jwt.claims', json_build_object('sub', k2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from trips where gig_id = g) <> 1 then raise exception 'CHECK FAILED: crew see the trips'; end if;
  select * into r from public.gig_trips(g) limit 1;
  if r.vehicle_name <> 'Van 1' or r.clashes is not null or r.licence is not null then
    raise exception 'CHECK FAILED: crew get the vehicle name but no checks: %', row_to_json(r);
  end if;
  begin
    insert into trips (gig_id, departs_at, arrives_at) values (g, '2027-03-11 07:00+00', '2027-03-11 08:00+00');
    raise exception 'CHECK FAILED: crew planned a trip';
  exception when insufficient_privilege then null; end;
  update trips set km = 1 where id = t1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew changed a trip'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from trips) <> 0 or (select count(*) from public.gig_trips(g)) <> 0 then raise exception 'CHECK FAILED: outsider saw trips'; end if;
  reset role;

  -- ── Reservations: the vehicle and the driver are booked for the trip's times
  if (select count(*) from reservations where source_id = t1::text and status = 'confirmed'
        and period = tstzrange('2027-03-10 07:00+00', '2027-03-10 10:30+00', '[)')) <> 2 then
    raise exception 'CHECK FAILED: trip booked the vehicle and the driver';
  end if;
  if (select resource_id from reservations where source_type = 'trip' and source_id = t1::text) <> van
     or (select resource_id from reservations where source_type = 'trip_driver' and source_id = t1::text) <> k
     or (select label from reservations where source_type = 'trip' and source_id = t1::text) <> 'Van 1' then
    raise exception 'CHECK FAILED: reservation rows';
  end if;

  -- An overlapping trip with the same van, driven by k2 (who is also on the Gala that day): clashes
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into trips (gig_id, vehicle_id, direction, driver_id, departs_at, arrives_at)
  values (g, van, 'one_way', k2, '2027-03-10 09:00+00', '2027-03-10 12:00+00') returning id into t2;
  select count(*) into n from public.transport_clashes(g, t2, van, k2, null, '2027-03-10 09:00+00', '2027-03-10 12:00+00') c where c.who = 'vehicle' and c.kind = 'trip';
  if n <> 1 then raise exception 'CHECK FAILED: van double-booked shows one clash, got %', n; end if;
  select count(*) into n from public.transport_clashes(g, t2, van, k2, null, '2027-03-10 09:00+00', '2027-03-10 12:00+00') c where c.who = 'driver';
  if n <> 1 then raise exception 'CHECK FAILED: k2 clashes with the Gala only (not this gig''s crew booking), got %', n; end if;
  if (select label from public.transport_clashes(g, t2, van, k2, null, '2027-03-10 09:00+00', '2027-03-10 12:00+00') c where c.who = 'driver') <> 'Gala' then
    raise exception 'CHECK FAILED: clash names the other gig';
  end if;
  -- k drives t1 and is crew on this gig: no clash for their own crew booking
  if (select count(*) from public.transport_clashes(g, t1, null, k, null, '2027-03-10 07:00+00', '2027-03-10 10:30+00')) <> 0 then
    raise exception 'CHECK FAILED: own crew booking on the gig counted as a clash';
  end if;
  -- A driver's trip makes them busy for other gigs' crew clashes (the shared clash check)
  if (select count(*) from public.gig_clashes(g2) c where c.user_id = k2) < 1 then
    raise exception 'CHECK FAILED: driving shows on the other gig''s crew clashes';
  end if;
  -- Planners get the checks in gig_trips
  select clashes into js from public.gig_trips(g) where id = t2;
  if jsonb_array_length(js) < 2 then raise exception 'CHECK FAILED: gig_trips clashes for planners: %', js; end if;
  -- Asking about someone not on the gig or another organisation's van gives nothing
  if (select count(*) from public.transport_clashes(g, null, other_van, x, null, '2027-03-10 00:00+00', '2027-03-11 00:00+00')) <> 0 then
    raise exception 'CHECK FAILED: looked up an outsider or another organisation''s vehicle';
  end if;
  reset role;

  -- ── Licences: own row only; admins of the person's organisation read it; planners get ok / missing
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into driving_licences (user_id, categories) values (k, array['C', 'B', 'B']);
  if (select categories from driving_licences where user_id = k) <> array['B', 'C'] then raise exception 'CHECK FAILED: categories tidied'; end if;
  begin
    insert into driving_licences (user_id, categories) values (k2, array['B']);
    raise exception 'CHECK FAILED: wrote someone else''s licence';
  exception when insufficient_privilege then null; end;
  begin
    update driving_licences set categories = array['X'] where user_id = k;
    raise exception 'CHECK FAILED: unknown category';
  exception when check_violation then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from driving_licences where user_id = k) <> 1 then raise exception 'CHECK FAILED: admin reads staff licence'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from driving_licences where user_id = k) <> 0 then raise exception 'CHECK FAILED: a member read a colleague''s licence'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from driving_licences) <> 0 then raise exception 'CHECK FAILED: PM read licences'; end if;
  if public.driver_licence_check(g, k, truck) <> 'ok' then raise exception 'CHECK FAILED: C covers C1'; end if;
  if public.driver_licence_check(g, k2, truck) <> 'unknown' then raise exception 'CHECK FAILED: nothing recorded = unknown'; end if;
  if public.driver_licence_check(g, x, truck) is not null then raise exception 'CHECK FAILED: asked about an outsider'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- The app saves with an upsert (insert … on conflict do update)
  insert into driving_licences (user_id, categories) values (k, array['B'])
  on conflict (user_id) do update set user_id = excluded.user_id, categories = excluded.categories;
  begin
    update driving_licences set user_id = k2 where user_id = k;
    raise exception 'CHECK FAILED: moved a licence to someone else';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.driver_licence_check(g, k, truck) <> 'missing' then raise exception 'CHECK FAILED: B doesn''t cover C1'; end if;
  -- The warning is a warning: the trip saves, with the planner's override recorded
  insert into trips (gig_id, vehicle_id, driver_id, departs_at, arrives_at, licence_override)
  values (g, truck, k, '2027-03-12 20:00+00', '2027-03-12 23:00+00', true) returning id into t3;
  if (select licence from public.gig_trips(g) where id = t3) <> 'missing' or not (select licence_override from trips where id = t3) then
    raise exception 'CHECK FAILED: licence missing shown and override kept';
  end if;
  reset role;
  if not private.licence_covers(array['CE'], 'BE') or private.licence_covers(array['C1'], 'C') or not private.licence_covers(array['C1'], 'B')
     or not private.licence_covers('{}', null) then
    raise exception 'CHECK FAILED: licence rules';
  end if;

  -- ── Gig status, removal and renames keep the bookings in step
  update gigs set status = 'draft' where id = g;
  if (select count(*) from reservations where source_id = t1::text and status = 'hold') <> 2 then raise exception 'CHECK FAILED: draft gig holds its trips'; end if;
  update gigs set status = 'archived' where id = g;
  if (select count(*) from reservations where source_id = t1::text and status <> 'cancelled') <> 0 then raise exception 'CHECK FAILED: archived gig frees its trips'; end if;
  update gigs set status = 'confirmed' where id = g;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update vehicles set name = 'Van One' where id = van;
  reset role;
  if (select label from reservations where source_type = 'trip' and source_id = t1::text) <> 'Van One' then raise exception 'CHECK FAILED: rename relabels'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Changing the driver moves the booking
  update trips set driver_id = k2, co_driver_id = k where id = t1;
  reset role;
  if (select resource_id from reservations where source_type = 'trip_driver' and source_id = t1::text) <> k2
     or (select resource_id from reservations where source_type = 'trip_codriver' and source_id = t1::text and status = 'confirmed') <> k then
    raise exception 'CHECK FAILED: driver change moved the booking';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update trips set removed_at = now() where id = t2;
  if (select count(*) from public.gig_trips(g) where id = t2) <> 0 then raise exception 'CHECK FAILED: removed trip hidden'; end if;
  update trips set km = 5 where id = t2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: changed a removed trip'; end if;
  reset role;
  if (select count(*) from reservations where source_id = t2::text and status <> 'cancelled') <> 0 then raise exception 'CHECK FAILED: removed trip frees its bookings'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update vehicles set removed_at = now() where id = truck;
  if (select count(*) from vehicles where id = truck and removed_at is not null) <> 1 then raise exception 'CHECK FAILED: vehicle marked removed'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into trips (gig_id, vehicle_id, departs_at, arrives_at) values (g, truck, '2027-03-11 07:00+00', '2027-03-11 08:00+00');
    raise exception 'CHECK FAILED: picked a removed vehicle';
  exception when invalid_parameter_value then null; end;
  -- A trip already using it keeps it and can still be changed
  update trips set note = 'Keep the truck' where id = t3;
  if (select vehicle_id from trips where id = t3) <> truck then raise exception 'CHECK FAILED: old trip kept its removed vehicle'; end if;
  reset role;

  -- ── Driving hours: logged apart, stored as "driving" at approval
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into time_entries (gig_id, user_id, work_date, start_time, end_time, driving_minutes)
  values (g, k, '2027-03-10', '11:00', '19:00', 210) returning id into e;
  begin
    update time_entries set driving_minutes = 2000 where id = e;
    raise exception 'CHECK FAILED: driving over a day';
  exception when check_violation then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.review_time_entry(e, true, null, '{"normal":8}'::jsonb, 'hour', 20, 230);
  if res <> 'approved' or (select (split->>'driving')::numeric from time_entries where id = e) <> 3.5
     or (select (split->>'worked')::numeric from time_entries where id = e) <> 8 then
    raise exception 'CHECK FAILED: driving stored in the split: %', (select split from time_entries where id = e);
  end if;
  reset role;

  raise exception 'ALL VEHICLES CHECKS PASSED';
end $$;
