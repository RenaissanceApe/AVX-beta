-- Checks for migration 20261208000000 ("not enough stock" holds for movements at the same moment).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL STOCK CHECK LOCK CHECKS PASSED"  → good
-- Two movements at the very same moment need two connections, which one script can't open, so this
-- file checks the rule still gives the right answers and that the check takes the lock; the
-- waiting itself is Postgres's row locking.
do $$
declare
  a uuid := gen_random_uuid();
  org_a uuid; wh uuid; van uuid; cable uuid; n int; q int; t text;
begin
  insert into auth.users (id, email, aud, role) values (a, 'scl-a@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Lock Co', a) returning id into org_a;
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into stock_locations (org_id, name, kind) values (org_a, 'Van 1', 'vehicle') returning id into van;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'XLR 10m', 2, a, 'bulk') returning id into cable;

  -- Nothing there yet: any movement out is refused
  begin
    insert into stock_movements (org_id, item_id, kind, quantity, from_location_id) values (org_a, cable, 'sale', 1, wh);
    raise exception 'CHECK FAILED: sold from an empty location';
  exception when check_violation then
    get stacked diagnostics t = message_text;
    if t not like '%(0 available)%' then raise exception 'CHECK FAILED: empty location said "%"', t; end if;
  end;

  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, cable, 'purchase', 10, wh);
  -- Out of the van, which has none, while the warehouse has 10
  begin
    insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, to_location_id) values (org_a, cable, 'transfer', 1, van, wh);
    raise exception 'CHECK FAILED: moved out of an empty van';
  exception when check_violation then null; end;
  -- Both ways between two locations that both have stock
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, to_location_id) values (org_a, cable, 'transfer', 4, wh, van);
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, to_location_id) values (org_a, cable, 'transfer', 1, van, wh);
  select quantity into q from stock_levels where item_id = cable and location_id = wh;
  if q is distinct from 7 then raise exception 'CHECK FAILED: warehouse after transfers %', q; end if;
  -- One more than there is: refused, with the right number; exactly what there is: allowed
  begin
    insert into stock_movements (org_id, item_id, kind, quantity, from_location_id) values (org_a, cable, 'sale', 8, wh);
    raise exception 'CHECK FAILED: sold more than there is';
  exception when check_violation then
    get stacked diagnostics t = message_text;
    if t not like '%(7 available)%' then raise exception 'CHECK FAILED: stock check said "%"', t; end if;
  end;
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id) values (org_a, cable, 'sale', 7, wh);
  select count(*) into n from stock_levels where item_id = cable and location_id = wh;
  if n <> 0 then raise exception 'CHECK FAILED: warehouse not empty after selling all'; end if;
  reset role;

  -- The check locks the totals before reading them
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'private' and p.proname = 'stock_movements_before' and p.prosrc ilike '%for update%';
  if n <> 1 then raise exception 'CHECK FAILED: the stock check doesn''t lock'; end if;

  raise exception 'ALL STOCK CHECK LOCK CHECKS PASSED';
end $$;
