-- Checks for migration 20261207000000 (stock totals stored, not added up each time).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL STOCK TOTALS CHECKS PASSED"  → good
-- The last check also compares the stored totals of every organisation in the database with the
-- full history, so it can be run on production too as a health check (it changes nothing).
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  org_a uuid; wh uuid; van uuid; cable uuid; speaker uuid; u1 uuid; u2 uuid; u3 uuid; u4 uuid;
  n int; q int; r int; t text;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'st-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'st-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'st-v@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Totals Co', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into stock_locations (org_id, name, kind) values (org_a, 'Van 1', 'vehicle') returning id into van;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'XLR 10m', 2, a, 'bulk') returning id into cable;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Speaker', 60, a, 'serial') returning id into speaker;
  reset role;

  -- Member: bulk stock through the ledger
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, cable, 'purchase', 50, wh);
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, to_location_id) values (org_a, cable, 'transfer', 20, wh, van);
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id) values (org_a, cable, 'lost', 2, van);
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, note) values (org_a, cable, 'correction', 2, wh, 'Count');
  select quantity into q from stock_levels where item_id = cable and location_id = wh;
  if q is distinct from 28 then raise exception 'CHECK FAILED: warehouse cable %', q; end if;
  select quantity into q from stock_levels where item_id = cable and location_id = van;
  if q is distinct from 18 then raise exception 'CHECK FAILED: van cable %', q; end if;

  -- "Not enough stock" still uses the right number (now from the stored total)
  begin
    insert into stock_movements (org_id, item_id, kind, quantity, from_location_id) values (org_a, cable, 'sale', 29, wh);
    raise exception 'CHECK FAILED: more out than in stock';
  exception when check_violation then
    get stacked diagnostics t = message_text;
    if t not like '%(28 available)%' then raise exception 'CHECK FAILED: stock check said "%"', t; end if;
  end;
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id) values (org_a, cable, 'sale', 28, wh);
  select count(*) into n from stock_levels where item_id = cable and location_id = wh;
  if n <> 0 then raise exception 'CHECK FAILED: an empty location still shows'; end if;

  -- Units: available and in repair count, lost doesn't, moves follow the unit
  insert into stock_units (item_id, location_id) values (speaker, wh) returning id into u1;
  insert into stock_units (item_id, location_id) values (speaker, wh) returning id into u2;
  insert into stock_units (item_id, location_id) values (speaker, wh) returning id into u3;
  insert into stock_units (item_id) values (speaker) returning id into u4;
  update stock_units set status = 'repair' where id = u2;
  update stock_units set location_id = van where id = u3;
  update stock_units set status = 'lost' where id = u3;
  select quantity, in_repair into q, r from stock_levels where item_id = speaker and location_id = wh;
  if q is distinct from 2 or r is distinct from 1 then raise exception 'CHECK FAILED: warehouse speakers % / % in repair', q, r; end if;
  select count(*) into n from stock_levels where item_id = speaker and location_id = van;
  if n <> 0 then raise exception 'CHECK FAILED: a lost unit still counts'; end if;
  select quantity into q from stock_levels where item_id = speaker and location_id is null;
  if q is distinct from 1 then raise exception 'CHECK FAILED: unit without a location %', q; end if;
  update stock_units set status = 'available', location_id = van where id = u3;   -- found again, in the van
  update stock_units set location_id = wh where id = u4;                          -- given a place
  update stock_units set status = 'available' where id = u2;                      -- back from repair
  update stock_units set notes = 'Checked' where id = u1;                         -- not a stock change
  select quantity, in_repair into q, r from stock_levels where item_id = speaker and location_id = wh;
  if q is distinct from 3 or r is distinct from 0 then raise exception 'CHECK FAILED: after moves % / % in repair', q, r; end if;
  select quantity into q from stock_levels where item_id = speaker and location_id = van;
  if q is distinct from 1 then raise exception 'CHECK FAILED: found unit %', q; end if;
  select count(*) into n from stock_levels where item_id = speaker and location_id is null;
  if n <> 0 then raise exception 'CHECK FAILED: unit still counted without a location'; end if;

  -- People can read the totals but not write them
  select count(*) into n from stock_totals where org_id = org_a;
  if n = 0 then raise exception 'CHECK FAILED: member can''t read totals'; end if;
  begin
    insert into stock_totals (org_id, item_id, location_id, quantity) values (org_a, cable, wh, 1000);
    raise exception 'CHECK FAILED: member wrote a total';
  exception when insufficient_privilege then null; end;
  begin
    update stock_totals set quantity = 1000 where org_id = org_a;
    raise exception 'CHECK FAILED: member changed a total';
  exception when insufficient_privilege then null; end;
  reset role;

  -- A viewer doesn't see stock, as before
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from stock_levels where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees stock levels'; end if;
  select count(*) into n from stock_totals where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees stock totals'; end if;
  reset role;

  if has_table_privilege('anon', 'public.stock_totals', 'select') then
    raise exception 'CHECK FAILED: signed-out visitors can read totals';
  end if;

  -- The stored totals match the full history, for every organisation in the database
  with recount as (
    select s.org_id, s.item_id, s.location_id, sum(s.qty)::integer as quantity, sum(s.in_repair)::integer as in_repair
    from (
      select x.org_id, x.item_id, x.to_location_id as location_id, x.quantity as qty, 0 as in_repair
        from public.stock_movements x where x.unit_id is null and x.to_location_id is not null
      union all
      select x.org_id, x.item_id, x.from_location_id, -x.quantity, 0
        from public.stock_movements x where x.unit_id is null and x.from_location_id is not null
      union all
      select u.org_id, u.item_id, u.location_id, 1, (u.status = 'repair')::integer
        from public.stock_units u where u.status in ('available', 'repair')
    ) s
    group by s.org_id, s.item_id, s.location_id
    having sum(s.qty) <> 0
  ), stored as (
    select org_id, item_id, location_id, quantity, in_repair from public.stock_levels
  )
  select count(*) into n from ((select * from recount except select * from stored) union all (select * from stored except select * from recount)) d;
  if n <> 0 then raise exception 'CHECK FAILED: % stored totals differ from the history', n; end if;

  raise exception 'ALL STOCK TOTALS CHECKS PASSED';
end $$;
