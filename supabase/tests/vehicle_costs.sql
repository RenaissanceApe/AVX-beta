-- Checks for migration 20270123000000_vehicle_costs.sql (step 23, V4: transport costs in gig finance,
-- expenses linked to a vehicle or trip, the vehicle-use report, vehicles and trips in the export).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL VEHICLE COST CHECKS PASSED (gig_finance … ms)"  → good
-- Who: a = admin of Vc Transport Co (each gig's creator), m = member (manages no gig), v = viewer,
-- c = crew on a gig (not in the organisation), x = admin of Vc Other Co.
-- The fixtures below are a verbatim copy of src/lib/transportCostFixtures.json (a Vitest test checks
-- the copy), so the database and the browser are held to the same expected numbers.
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  fx jsonb := $fixtures${
  "about": "Shared fixtures for transport costs (step 23, V4; docs/BUSINESS.md). Checked by src/lib/transportCost.test.js and, copied verbatim, by supabase/tests/vehicle_costs.sql (a Vitest test keeps the copy equal). Vehicles, gigs, trips and categories are named by keys; the database test gives them real ids. Times are UTC; Lisbon is UTC+0 in March 2027 before the clocks change. Change both twins together.",
  "time_zone": "Europe/Lisbon",
  "recovers_vat": true,
  "categories": [
    { "key": "fuel", "kind": "direct", "vat_recoverable": true },
    { "key": "tolls", "kind": "direct", "vat_recoverable": true }
  ],
  "vehicles": [
    { "key": "V1", "name": "Van", "plate": "AA-11-AA", "max_load_kg": 1200, "cost_per_km": 0.35, "cost_per_day": 40 },
    { "key": "V2", "name": "Truck", "plate": "BB-22-BB", "max_load_kg": 7000, "cost_per_km": 0.9, "cost_per_day": 120 },
    { "key": "V3", "name": "Old van", "plate": null, "max_load_kg": null, "cost_per_km": 0.2, "cost_per_day": 10, "removed": true },
    { "key": "V4", "name": "Car", "plate": null, "max_load_kg": null, "cost_per_km": null, "cost_per_day": null }
  ],
  "gigs": [
    { "key": "T1", "name": "Transport festival", "start_date": "2027-03-10", "end_date": "2027-03-12" },
    { "key": "T2", "name": "Transport one day", "start_date": "2027-03-20", "end_date": "2027-03-20" }
  ],
  "trips": [
    { "key": "t1", "gig": "T1", "vehicle": "V1", "direction": "out", "departs_at": "2027-03-10T07:00:00Z", "arrives_at": "2027-03-10T10:00:00Z", "km": 120 },
    { "key": "t2", "gig": "T1", "vehicle": "V1", "direction": "back", "departs_at": "2027-03-12T22:00:00Z", "arrives_at": "2027-03-13T01:30:00Z", "km": 120 },
    { "key": "t3", "gig": "T1", "vehicle": "V2", "direction": "out", "departs_at": "2027-03-10T06:00:00Z", "arrives_at": "2027-03-10T09:00:00Z", "km": null },
    { "key": "t4", "gig": "T1", "vehicle": "V1", "direction": "one_way", "departs_at": "2027-03-11T08:00:00Z", "arrives_at": "2027-03-11T18:00:00Z", "km": 500, "removed": true },
    { "key": "t5", "gig": "T1", "vehicle": null, "direction": "one_way", "departs_at": "2027-03-11T08:00:00Z", "arrives_at": "2027-03-11T09:00:00Z", "km": 50 },
    { "key": "t6", "gig": "T2", "vehicle": "V1", "direction": "out", "departs_at": "2027-03-20T08:00:00Z", "arrives_at": "2027-03-20T11:00:00Z", "km": 80 },
    { "key": "t7", "gig": "T2", "vehicle": "V1", "direction": "back", "departs_at": "2027-03-20T20:00:00Z", "arrives_at": "2027-03-21T00:00:00Z", "km": 80 },
    { "key": "t8", "gig": "T2", "vehicle": "V4", "direction": "out", "departs_at": "2027-03-20T09:00:00Z", "arrives_at": "2027-03-20T10:00:00Z", "km": 30 },
    { "key": "t9", "gig": "T2", "vehicle": "V3", "direction": "one_way", "departs_at": "2027-02-27T10:00:00Z", "arrives_at": "2027-02-27T12:00:00Z", "km": 10 }
  ],
  "expenses": [
    { "key": "fuel1", "vehicle": "V1", "trip": "t1", "category": "fuel", "spent_on": "2027-03-10", "amount_net": 50, "vat_rate": 23, "vat_amount": 11.5, "currency": "EUR" },
    { "key": "toll1", "vehicle": "V1", "category": "tolls", "spent_on": "2027-03-20", "amount_net": 12.5, "vat_rate": 23, "vat_amount": 2.88, "currency": "EUR" },
    { "key": "gone", "vehicle": "V1", "category": "fuel", "spent_on": "2027-03-15", "amount_net": 99, "vat_rate": 23, "vat_amount": 22.77, "currency": "EUR", "removed": true },
    { "key": "later", "vehicle": "V1", "category": "fuel", "spent_on": "2027-04-02", "amount_net": 40, "vat_rate": 23, "vat_amount": 9.2, "currency": "EUR" },
    { "key": "usd", "vehicle": "V2", "category": "tolls", "spent_on": "2027-03-11", "amount_net": 20, "vat_rate": 0, "vat_amount": 0, "currency": "USD" }
  ],
  "expect_gigs": {
    "T1": { "transport": 324, "transport_km": 240, "transport_trips": 3, "transport_km_missing": 1, "other_costs": 50, "cost": 374, "margin": -374 },
    "T2": { "transport": 108, "transport_km": 200, "transport_trips": 4, "transport_km_missing": 0, "other_costs": 0, "cost": 108, "margin": -108 }
  },
  "expect_gig_vehicles": {
    "T1": { "V1": { "trips": 2, "km": 240, "days": 3, "running": 204 }, "V2": { "trips": 1, "km": 0, "km_missing": 1, "days": 1, "running": 120 } },
    "T2": { "V1": { "trips": 2, "km": 160, "days": 1, "running": 96 }, "V3": { "trips": 1, "km": 10, "days": 1, "running": 12 }, "V4": { "trips": 1, "km": 30, "days": 1, "running": 0 } }
  },
  "periods": [
    {
      "from": "2027-03-01", "until": "2027-04-01",
      "vehicles": ["V1", "V2", "V4"],
      "expect": {
        "V1": { "trips": 4, "gigs": 2, "km": 400, "km_missing": 0, "days": 4, "running": 300, "expenses": 62.5, "total": 362.5 },
        "V2": { "trips": 1, "gigs": 1, "km": 0, "km_missing": 1, "days": 1, "running": 120, "expenses": 0, "total": 120, "other_currencies": { "USD": 20 } },
        "V4": { "trips": 1, "gigs": 1, "km": 30, "km_missing": 0, "days": 1, "running": 0, "expenses": 0, "total": 0 }
      }
    },
    {
      "from": "2027-03-12", "until": "2027-03-13",
      "vehicles": ["V1", "V2", "V4"],
      "expect": {
        "V1": { "trips": 1, "gigs": 1, "km": 120, "days": 1, "running": 82, "expenses": 0, "total": 82 },
        "V2": { "trips": 0, "km": 0, "days": 0, "running": 0, "total": 0 }
      }
    },
    {
      "from": "2027-02-01", "until": "2027-03-01",
      "vehicles": ["V1", "V2", "V3", "V4"],
      "expect": {
        "V3": { "trips": 1, "gigs": 1, "km": 10, "days": 1, "running": 12, "total": 12 }
      }
    }
  ]
}$fixtures$::jsonb;
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  ids jsonb := '{}'; org_a uuid; org_b uuid; sup uuid; sub uuid; new_id uuid; veh_b uuid; trip_b uuid; gig_b uuid;
  e jsonb; p jsonb; k text; vk text; val jsonb; got jsonb; who uuid; n integer; out jsonb; ok boolean;
  t0 timestamptz; ms numeric;
begin
  insert into auth.users (id, email, aud, role)
  select t.i, 'vc-' || t.o || '@avx.invalid', 'authenticated', 'authenticated'
  from unnest(array[a, m, v, c, x]) with ordinality t(i, o);

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Vc Other Co', x) returning id into org_b;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_b, 'Vc other gig', x, '2027-03-10', 'confirmed') returning id into gig_b;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Vc Transport Co', a) returning id into org_a;
  reset role;
  update organisations set time_zone = fx ->> 'time_zone' where id = org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');
  insert into vehicles (org_id, name, cost_per_km, cost_per_day) values (org_b, 'Vc other van', 1, 1) returning id into veh_b;
  insert into trips (gig_id, vehicle_id, departs_at, arrives_at, km) values (gig_b, veh_b, '2027-03-10T08:00Z', '2027-03-10T09:00Z', 5)
    returning id into trip_b;

  -- ── The fixtures (entered as the owner) ─────────────────────────────────────
  insert into org_finance_settings (org_id, recovers_vat) values (org_a, (fx ->> 'recovers_vat')::boolean)
  on conflict (org_id) do update set recovers_vat = excluded.recovers_vat;
  for e in select * from jsonb_array_elements(fx -> 'categories') loop
    insert into expense_categories (org_id, name, kind, vat_recoverable)
    values (org_a, e ->> 'key', e ->> 'kind', (e ->> 'vat_recoverable')::boolean) returning id into new_id;
    ids := ids || jsonb_build_object('cat:' || (e ->> 'key'), new_id);
  end loop;
  for e in select * from jsonb_array_elements(fx -> 'vehicles') loop
    insert into vehicles (org_id, name, plate, max_load_kg, cost_per_km, cost_per_day)
    values (org_a, e ->> 'name', e ->> 'plate', (e ->> 'max_load_kg')::numeric, (e ->> 'cost_per_km')::numeric, (e ->> 'cost_per_day')::numeric)
    returning id into new_id;
    ids := ids || jsonb_build_object(e ->> 'key', new_id);
  end loop;
  for e in select * from jsonb_array_elements(fx -> 'gigs') loop
    insert into gigs (org_id, name, start_date, end_date, status, created_by)
    values (org_a, e ->> 'name', (e ->> 'start_date')::date, (e ->> 'end_date')::date, 'confirmed', a) returning id into new_id;
    ids := ids || jsonb_build_object(e ->> 'key', new_id);
  end loop;
  for e in select * from jsonb_array_elements(fx -> 'trips') loop
    insert into trips (gig_id, vehicle_id, direction, departs_at, arrives_at, km)
    values ((ids ->> (e ->> 'gig'))::uuid, (ids ->> (e ->> 'vehicle'))::uuid, e ->> 'direction',
            (e ->> 'departs_at')::timestamptz, (e ->> 'arrives_at')::timestamptz, (e ->> 'km')::numeric)
    returning id into new_id;
    ids := ids || jsonb_build_object(e ->> 'key', new_id);
    if (e ->> 'removed')::boolean then update trips set removed_at = now() where id = new_id; end if;
  end loop;
  -- Vehicles removed after their trips (old trips keep them)
  update vehicles set removed_at = now()
   where id in (select (ids ->> (ve ->> 'key'))::uuid from jsonb_array_elements(fx -> 'vehicles') ve where (ve ->> 'removed')::boolean);
  for e in select * from jsonb_array_elements(fx -> 'expenses') loop
    insert into expenses (org_id, status, spent_on, description, category_id, amount_net, vat_rate, vat_amount, currency, vehicle_id, trip_id)
    values (org_a, 'confirmed', (e ->> 'spent_on')::date, e ->> 'key', (ids ->> ('cat:' || (e ->> 'category')))::uuid,
            (e ->> 'amount_net')::numeric, (e ->> 'vat_rate')::numeric, (e ->> 'vat_amount')::numeric, e ->> 'currency',
            (ids ->> (e ->> 'vehicle'))::uuid, (ids ->> (e ->> 'trip'))::uuid)
    returning id into new_id;
    if (e ->> 'removed')::boolean then update expenses set removed_at = now() where id = new_id; end if;
  end loop;
  -- A trip fills in its gig
  select count(*) into n from expenses where org_id = org_a and description = 'fuel1' and gig_id = (ids ->> 'T1')::uuid
     and vehicle_id = (ids ->> 'V1')::uuid;
  if n <> 1 then raise exception 'CHECK FAILED: an expense linked to a trip did not get its gig'; end if;

  -- ── The totals, read by m (a member who manages none of the gigs) ──────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for k, val in select * from jsonb_each(fx -> 'expect_gigs') loop
    select to_jsonb(f) into got from gig_finance(org_a, null, null, (ids ->> k)::uuid) f;
    if got is null then raise exception 'CHECK FAILED: no gig_finance row for %', k; end if;
    for e in select jsonb_build_object('key', j.key, 'value', j.value) from jsonb_each(val) j loop
      if (got -> (e ->> 'key')) is distinct from (e -> 'value')
         and not (jsonb_typeof(e -> 'value') = 'number' and jsonb_typeof(got -> (e ->> 'key')) = 'number'
                  and (got ->> (e ->> 'key'))::numeric = (e ->> 'value')::numeric) then
        raise exception 'CHECK FAILED: gig % % is % (expected %)', k, e ->> 'key', got -> (e ->> 'key'), e -> 'value';
      end if;
    end loop;
  end loop;
  -- The period form gives the same rows
  select count(*) into n from gig_finance(org_a, '2027-03-01', '2027-04-01') f where f.transport > 0;
  if n <> 2 then raise exception 'CHECK FAILED: % gigs with transport in March', n; end if;
  -- Per vehicle, for the Transport tab
  for k, val in select * from jsonb_each(fx -> 'expect_gig_vehicles') loop
    select count(*) into n from gig_transport_cost((ids ->> k)::uuid);
    if n <> (select count(*) from jsonb_object_keys(val)) then raise exception 'CHECK FAILED: % has % vehicles', k, n; end if;
    for vk, p in select * from jsonb_each(val) loop
      select to_jsonb(t) into got from gig_transport_cost((ids ->> k)::uuid) t where t.vehicle_id = (ids ->> vk)::uuid;
      if got is null then raise exception 'CHECK FAILED: % has no row for %', k, vk; end if;
      for e in select jsonb_build_object('key', j.key, 'value', j.value) from jsonb_each(p) j loop
        if (got ->> (e ->> 'key'))::numeric is distinct from (e ->> 'value')::numeric then
          raise exception 'CHECK FAILED: % % % is % (expected %)', k, vk, e ->> 'key', got -> (e ->> 'key'), e -> 'value';
        end if;
      end loop;
    end loop;
  end loop;
  -- The vehicle-use report
  for p in select * from jsonb_array_elements(fx -> 'periods') loop
    select coalesce(jsonb_agg(r.vehicle_name order by r.vehicle_name), '[]') into got
      from vehicle_use(org_a, (p ->> 'from')::date, (p ->> 'until')::date) r;
    select coalesce(jsonb_agg(ve ->> 'name' order by ve ->> 'name'), '[]') into out
      from jsonb_array_elements(fx -> 'vehicles') ve where (ve ->> 'key') in (select jsonb_array_elements_text(p -> 'vehicles'));
    if got <> out then raise exception 'CHECK FAILED: vehicles from % are % (expected %)', p ->> 'from', got, out; end if;
    for vk, val in select * from jsonb_each(p -> 'expect') loop
      select to_jsonb(r) into got from vehicle_use(org_a, (p ->> 'from')::date, (p ->> 'until')::date) r
       where r.vehicle_id = (ids ->> vk)::uuid;
      for e in select jsonb_build_object('key', j.key, 'value', j.value) from jsonb_each(val) j loop
        if (got -> (e ->> 'key')) is distinct from (e -> 'value')
           and not (jsonb_typeof(e -> 'value') = 'number' and (got ->> (e ->> 'key'))::numeric = (e ->> 'value')::numeric) then
          raise exception 'CHECK FAILED: % from % % is % (expected %)', vk, p ->> 'from', e ->> 'key', got -> (e ->> 'key'), e -> 'value';
        end if;
      end loop;
    end loop;
  end loop;
  begin
    perform * from vehicle_use(org_a, '2027-04-01', '2027-03-01');
    raise exception 'CHECK FAILED: backwards period accepted';
  exception when invalid_parameter_value then null; end;
  -- Margins elsewhere include transport: the overview still adds up
  out := report_overview(org_a, '2027-03-15T12:00Z');
  if out is null then raise exception 'CHECK FAILED: report_overview after the wrap'; end if;
  reset role;

  -- ── Who sees transport costs ────────────────────────────────────────────────
  -- a admin and m member: yes; v viewer, c crew on the gig, x another organisation: no
  insert into gig_members (gig_id, user_id, role) values ((ids ->> 'T1')::uuid, c, 'crew');
  foreach who in array array[a, m, v, c, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform * from gig_transport_cost((ids ->> 'T1')::uuid);
      ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: gig_transport_cost for % (allowed: %)', who, ok; end if;
    begin
      perform * from vehicle_use(org_a, '2027-03-01', '2027-04-01');
      ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: vehicle_use for % (allowed: %)', who, ok; end if;
    begin
      perform * from private.gig_transport(org_a, array[(ids ->> 'T1')::uuid]);
      ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: gig_transport for % (allowed: %)', who, ok; end if;
    reset role;
  end loop;
  -- Crew see the trips but never a vehicle's running costs
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from trips where gig_id = (ids ->> 'T1')::uuid;
  if n = 0 then raise exception 'CHECK FAILED: crew no longer see their gig''s trips'; end if;
  select count(*) into n from vehicles where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: crew read vehicles with their costs'; end if;
  select count(*) into n from expenses where org_id = org_a and vehicle_id is not null;
  if n <> 0 then raise exception 'CHECK FAILED: crew read vehicle expenses'; end if;
  reset role;
  -- Another organisation's admin never reaches these gigs through their own organisation
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from private.gig_transport(org_b, array[(ids ->> 'T1')::uuid]);
  if n <> 0 then raise exception 'CHECK FAILED: gig_transport across organisations'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform * from vehicle_use(org_a, '2027-03-01', '2027-04-01');
    raise exception 'CHECK FAILED: anonymous vehicle_use';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Organisation export (admins only) ───────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := export_org_part(org_a, 'vehicles', 0);
  if jsonb_array_length(out) <> jsonb_array_length(fx -> 'vehicles')
     or not exists (select 1 from jsonb_array_elements(out) o where o ->> 'name' = 'Van' and (o ->> 'cost_per_km')::numeric = 0.35)
     or not exists (select 1 from jsonb_array_elements(out) o where o ->> 'name' = 'Old van' and o ->> 'removed_at' is not null) then
    raise exception 'CHECK FAILED: vehicles file %', out;
  end if;
  out := export_org_part(org_a, 'trips', 0);
  if jsonb_array_length(out) <> (select count(*) from jsonb_array_elements(fx -> 'trips') t where not coalesce((t ->> 'removed')::boolean, false))
     or not exists (select 1 from jsonb_array_elements(out) o where o ->> 'vehicle' = 'Van' and o ->> 'gig' = 'Transport festival') then
    raise exception 'CHECK FAILED: trips file %', out;
  end if;
  out := export_org_part(org_a, 'vehicle_expenses', 0);
  if jsonb_array_length(out) <> (select count(*) from jsonb_array_elements(fx -> 'expenses') t where not coalesce((t ->> 'removed')::boolean, false))
     or not exists (select 1 from jsonb_array_elements(out) o where o ->> 'description' = 'fuel1' and o ->> 'gig' = 'Transport festival'
                    and o ->> 'trip_direction' = 'out') then
    raise exception 'CHECK FAILED: vehicle_expenses file %', out;
  end if;
  out := export_org_part(org_a, 'gig_finance', 0);   -- the older file now carries the margin with transport
  if not exists (select 1 from jsonb_array_elements(out) o where o ->> 'gig' = 'Transport festival' and (o ->> 'margin')::numeric = -374) then
    raise exception 'CHECK FAILED: gig_finance file %', out;
  end if;
  out := export_org_part(org_a, 'expenses', 0);      -- older parts still go through
  if jsonb_array_length(out) < 1 then raise exception 'CHECK FAILED: expenses file after the wrap'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    out := export_org_part(org_a, 'vehicles', 0);
    raise exception 'CHECK FAILED: a member exports';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Linking an expense to a vehicle or trip (as the admin) ──────────────────
  insert into suppliers (org_id, name) values (org_a, 'Vc supplier') returning id into sup;
  insert into subrentals (org_id, supplier_id, starts_at, ends_at) values (org_a, sup, '2027-03-10', '2027-03-11') returning id into sub;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- A trip gives its vehicle and gig
  insert into expenses (org_id, spent_on, description, amount_net, trip_id) values (org_a, '2027-03-20', 'Vc toll', 5, (ids ->> 't6')::uuid)
    returning id into new_id;
  select count(*) into n from expenses where id = new_id and vehicle_id = (ids ->> 'V1')::uuid and gig_id = (ids ->> 'T2')::uuid;
  if n <> 1 then raise exception 'CHECK FAILED: a trip did not fill in its vehicle and gig'; end if;
  -- Another vehicle than the trip's: refused
  begin
    update expenses set vehicle_id = (ids ->> 'V2')::uuid where id = new_id;
    raise exception 'CHECK FAILED: an expense moved to another vehicle than its trip''s';
  exception when invalid_parameter_value then null; end;
  -- Another organisation's vehicle or trip
  begin
    insert into expenses (org_id, spent_on, description, amount_net, vehicle_id) values (org_a, '2027-03-20', 'Vc bad', 1, veh_b);
    raise exception 'CHECK FAILED: another organisation''s vehicle linked';
  exception when insufficient_privilege then null; end;
  begin
    insert into expenses (org_id, spent_on, description, amount_net, trip_id) values (org_a, '2027-03-20', 'Vc bad', 1, trip_b);
    raise exception 'CHECK FAILED: another organisation''s trip linked';
  exception when insufficient_privilege then null; end;
  -- A trip of another gig, a removed trip, a trip without a vehicle
  begin
    insert into expenses (org_id, spent_on, description, amount_net, gig_id, trip_id) values (org_a, '2027-03-20', 'Vc bad', 1, (ids ->> 'T1')::uuid, (ids ->> 't6')::uuid);
    raise exception 'CHECK FAILED: a trip of another gig linked';
  exception when invalid_parameter_value then null; end;
  begin
    insert into expenses (org_id, spent_on, description, amount_net, trip_id) values (org_a, '2027-03-20', 'Vc bad', 1, (ids ->> 't4')::uuid);
    raise exception 'CHECK FAILED: a removed trip linked';
  exception when invalid_parameter_value then null; end;
  begin
    insert into expenses (org_id, spent_on, description, amount_net, trip_id) values (org_a, '2027-03-20', 'Vc bad', 1, (ids ->> 't5')::uuid);
    raise exception 'CHECK FAILED: a trip without a vehicle linked';
  exception when invalid_parameter_value then null; end;
  -- A vehicle and another linked record together
  begin
    insert into expenses (org_id, spent_on, description, amount_net, vehicle_id, subrental_id) values (org_a, '2027-03-20', 'Vc bad', 1, (ids ->> 'V1')::uuid, sub);
    raise exception 'CHECK FAILED: a vehicle and a subrental on one expense';
  exception when invalid_parameter_value then null; end;
  -- A removed vehicle still takes its late bills; many expenses per vehicle are fine
  insert into expenses (org_id, spent_on, description, amount_net, vehicle_id) values (org_a, '2027-03-21', 'Vc last repair', 300, (ids ->> 'V3')::uuid);
  insert into expenses (org_id, spent_on, description, amount_net, vehicle_id) values (org_a, '2027-03-21', 'Vc fuel', 30, (ids ->> 'V1')::uuid);
  reset role;
  -- A claim links only to its gig, so never to a vehicle
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into expenses (org_id, spent_on, description, amount_net, gig_id, claimed_by, vehicle_id)
    values (org_a, '2027-03-11', 'Vc claim', 10, (ids ->> 'T1')::uuid, c, (ids ->> 'V1')::uuid);
    raise exception 'CHECK FAILED: a claim linked to a vehicle';
  exception when invalid_parameter_value then null; end;
  insert into expenses (org_id, spent_on, description, amount_net, gig_id, claimed_by)
  values (org_a, '2027-03-11', 'Vc claim', 10, (ids ->> 'T1')::uuid, c);   -- a plain claim still works
  reset role;

  -- ── Under a second on 300 gigs with a trip each ─────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into gigs (org_id, name, start_date, end_date, status, created_by)
  select org_a, 'Load ' || i, date '2027-05-01' + (i % 28), date '2027-05-01' + (i % 28) + 1, 'confirmed', a
  from generate_series(1, 300) i;
  insert into trips (gig_id, vehicle_id, departs_at, arrives_at, km)
  select g.id, (ids ->> 'V2')::uuid, g.start_date + time '08:00', g.start_date + time '20:00', 100
  from gigs g where g.org_id = org_a and g.name like 'Load %';
  -- Fresh planner statistics: rows made inside this transaction have none, and without them the
  -- existing labour helper (private.gig_labour) takes ~0.8 s here instead of ~40 ms
  analyze public.gigs; analyze public.trips; analyze public.reservations;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t0 := clock_timestamp();
  select count(*) into n from gig_finance(org_a, '2027-05-01', '2027-06-01') f where f.transport = 210;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  if n <> 300 or ms > 1000 then raise exception 'CHECK FAILED: 300 gigs: % with transport in % ms', n, round(ms); end if;
  reset role;

  raise exception 'ALL VEHICLE COST CHECKS PASSED (gig_finance % ms)', round(ms);
end $$;
