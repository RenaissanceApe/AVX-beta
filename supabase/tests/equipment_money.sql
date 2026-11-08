-- Checks for migration 20261228000000_equipment_money.sql (K5, equipment money).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL EQUIPMENT MONEY CHECKS PASSED (equipment_money … ms)"  → good
-- Who: a = admin of Gear Co, m = member, v = viewer, x = admin of Other Co, s = member with two-step
-- sign-in set up. Every expected number is worked out by hand in the comments next to it.
-- Fixtures: a set (2 moving heads + 10 cables), serial units (one bought mid-period, one lost, one
-- lost and found again, one with no purchase cost), a bulk item (lost and found), one hire-in covering
-- two items, a hire-in paid by an expense, a line typed by hand.
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  x uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  org_a uuid; org_b uuid; loc uuid; sup uuid; mh uuid; cab uuid; kit uuid;
  u1 uuid; u2 uuid; u3 uuid; u4 uuid; g_mar uuid; g_oct uuid; g_nov uuid; sr uuid; mv bigint;
  r record; out jsonb; ok boolean; who uuid; n integer; t0 timestamptz; ms numeric;
  at_ timestamptz := '2026-11-30 12:00+00';
begin
  insert into auth.users (id, email, aud, role)
  select t.i, 'em-' || t.o || '@avx.invalid', 'authenticated', 'authenticated'
  from unnest(array[a, m, v, x, s]) with ordinality t(i, o);
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), s, 'test', 'totp', 'verified', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Gear Co', a) returning id into org_a;
  reset role;
  update organisations set time_zone = 'Europe/Lisbon' where id = org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer'), (org_a, s, 'member');

  -- ── Fixtures (entered as the owner) ─────────────────────────────────────────
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into loc;
  insert into suppliers (org_id, name) values (org_a, 'Hire Co') returning id into sup;
  -- MH: serial, day price 100, cost price 1000 over 10 months, replacement 1500
  insert into price_items (org_id, name, category, unit_price, created_by, tracking, cost_price, depreciation_months, replacement_value)
  values (org_a, 'Moving head', 'Lighting', 100, a, 'serial', 1000, 10, 1500) returning id into mh;
  -- Cable: bulk, day price 10, no cost price, replacement 20, 10 months
  insert into price_items (org_id, name, category, unit_price, created_by, tracking, depreciation_months, replacement_value)
  values (org_a, 'Cable', 'Cables', 10, a, 'bulk', 10, 20) returning id into cab;
  -- The set: 2 × MH (2 × 100 = 200) + 10 × Cable (10 × 10 = 100) → MH 2/3, Cable 1/3
  insert into price_items (org_id, name, unit_price, created_by, kit_type) values (org_a, 'Wash kit', 600, a, 'set') returning id into kit;
  insert into item_parts (org_id, parent_id, child_id, kind, quantity) values (org_a, kit, mh, 'content', 2), (org_a, kit, cab, 'content', 10);

  -- Units of MH. U1 1200 over 12 months from January (100 a month). U2 bought mid-period, 16 November,
  -- 600 over 12 (50 a month). U3 1200 over 12 from January, lost 11 November with a 300 payout.
  -- U4 no purchase cost (the item's 1000 over 10 = 100 a month, an estimate) from June, lost and found again.
  insert into stock_units (org_id, item_id, code, location_id, purchase_date, purchase_cost, depreciation_months)
  values (org_a, mh, 'MH1', loc, '2026-01-01', 1200, 12) returning id into u1;
  insert into stock_units (org_id, item_id, code, location_id, purchase_date, purchase_cost, depreciation_months)
  values (org_a, mh, 'MH2', loc, '2026-11-16', 600, 12) returning id into u2;
  insert into stock_units (org_id, item_id, code, location_id, purchase_date, purchase_cost, depreciation_months)
  values (org_a, mh, 'MH3', loc, '2026-01-01', 1200, 12) returning id into u3;
  update stock_units set status = 'lost', disposed_on = '2026-11-11', disposal_value = 300 where id = u3;
  insert into stock_units (org_id, item_id, code, location_id, purchase_date) values (org_a, mh, 'MH4', loc, '2026-06-01') returning id into u4;
  update stock_units set status = 'lost' where id = u4;
  update stock_units set status = 'available' where id = u4;
  if (select disposed_on from stock_units where id = u4) is not null then raise exception 'CHECK FAILED: found unit keeps its disposal'; end if;

  -- Cable: 100 bought 1 October at 5 (500 over 10 months = 50 a month); 10 lost, 4 found in November
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id, unit_cost)
  values (org_a, cab, 'purchase', 100, loc, 5) returning id into mv;
  update stock_movements set created_at = '2026-10-01 10:00+00' where id = mv;
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id) values (org_a, cab, 'lost', 10, loc) returning id into mv;
  update stock_movements set created_at = '2026-11-12 10:00+00' where id = mv;
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, cab, 'found', 4, loc) returning id into mv;
  update stock_movements set created_at = '2026-11-25 10:00+00' where id = mv;

  insert into gigs (org_id, name, start_date, end_date, status, created_by)
  values (org_a, 'Spring', '2026-03-10', '2026-03-10', 'completed', a) returning id into g_mar;
  insert into gigs (org_id, name, start_date, end_date, status, created_by)
  values (org_a, 'Autumn', '2026-10-15', '2026-10-15', 'completed', a) returning id into g_oct;
  insert into gigs (org_id, name, start_date, end_date, status, created_by)
  values (org_a, 'Winter', '2026-11-20', '2026-11-21', 'confirmed', a) returning id into g_nov;

  -- Quotes: March MH 10 × 100 = 1000; October cable 40 × 10 = 400; November MH 4 × 100 = 400, the set
  -- 1 × 600 (MH 400, cable 200), a rental line typed by hand 300, a crew line (not equipment)
  alter table quotes disable trigger quotes_report_dates;
  insert into quotes (org_id, title, status, gig_id, issue_date, currency, discount_pct, body) values
    (org_a, 'QM', 'accepted', g_mar, '2026-02-01', 'EUR', 0, jsonb_build_object('phases', jsonb_build_array(jsonb_build_object(
      'id', 'p', 'sections', jsonb_build_array(jsonb_build_object('id', 's', 'lines', jsonb_build_array(
        jsonb_build_object('id', 'm1', 'kind', 'rental', 'item_id', mh, 'qty', 10, 'factor', 1, 'unit_price', 100)))))))),
    (org_a, 'QO', 'accepted', g_oct, '2026-09-01', 'EUR', 0, jsonb_build_object('phases', jsonb_build_array(jsonb_build_object(
      'id', 'p', 'sections', jsonb_build_array(jsonb_build_object('id', 's', 'lines', jsonb_build_array(
        jsonb_build_object('id', 'o1', 'kind', 'rental', 'item_id', cab, 'qty', 40, 'factor', 1, 'unit_price', 10)))))))),
    (org_a, 'QN', 'accepted', g_nov, '2026-10-01', 'EUR', 0, jsonb_build_object('phases', jsonb_build_array(jsonb_build_object(
      'id', 'p', 'sections', jsonb_build_array(jsonb_build_object('id', 's', 'lines', jsonb_build_array(
        jsonb_build_object('id', 'n1', 'kind', 'rental', 'item_id', mh, 'qty', 4, 'factor', 1, 'unit_price', 100),
        jsonb_build_object('id', 'n2', 'kind', 'rental', 'item_id', kit, 'qty', 1, 'factor', 1, 'unit_price', 600),
        jsonb_build_object('id', 'n3', 'kind', 'rental', 'qty', 1, 'factor', 1, 'unit_price', 300, 'description', 'Haze machine'),
        jsonb_build_object('id', 'n4', 'kind', 'crew', 'qty', 1, 'factor', 1, 'unit_price', 250)))))))),
    (org_a, 'QD', 'draft', g_nov, '2026-10-01', 'EUR', 0, jsonb_build_object('phases', jsonb_build_array(jsonb_build_object(
      'id', 'p', 'sections', jsonb_build_array(jsonb_build_object('id', 's', 'lines', jsonb_build_array(
        jsonb_build_object('id', 'd1', 'kind', 'rental', 'item_id', mh, 'qty', 1, 'factor', 1, 'unit_price', 9999))))))));
  alter table quotes enable trigger quotes_report_dates;

  -- One hire-in covering two items, for the November gig: supplier's price 300 over lines MH 1 × 120
  -- and cable 30 × 2 (120 : 60) → MH 200, cable 100. A cable hire-in in September (no gig) with lines
  -- of 20 × 1 and a confirmed expense of 50 that replaces them.
  perform set_config('avx.partner', 'on', true);
  insert into subrentals (org_id, supplier_id, gig_id, status, starts_at, ends_at)
  values (org_a, sup, g_nov, 'confirmed', '2026-11-19 09:00+00', '2026-11-22 09:00+00') returning id into sr;
  update subrentals set quoted_total = 300 where id = sr;
  insert into subrental_lines (subrental_id, org_id, item_id, description, quantity, unit_cost) values
    (sr, org_a, mh, 'Moving head', 1, 120), (sr, org_a, cab, 'Cable', 30, 2);
  insert into subrentals (org_id, supplier_id, gig_id, status, starts_at, ends_at)
  values (org_a, sup, null, 'returned', '2026-09-10 09:00+00', '2026-09-12 09:00+00') returning id into sr;
  insert into subrental_lines (subrental_id, org_id, item_id, description, quantity, unit_cost) values (sr, org_a, cab, 'Cable', 20, 1);
  perform set_config('avx.partner', '', true);
  insert into expenses (org_id, status, spent_on, description, amount_net, vat_amount, currency, subrental_id)
  values (org_a, 'confirmed', '2026-09-12', 'Cable hire', 50, 11.5, 'EUR', sr);

  -- Repairs (dated when opened): U1 80 not charged (counts), 999 charged to the client (doesn't)
  alter table repairs disable trigger user;
  insert into repairs (org_id, item_id, unit_id, status, problem, cost, charge_client, created_at) values
    (org_a, mh, u1, 'done', 'Fan', 80, false, '2026-11-05 10:00+00'),
    (org_a, mh, u1, 'done', 'Dropped', 999, true, '2026-11-06 10:00+00');
  alter table repairs enable trigger user;
  -- Inspection of U1: 25 (inspections can't be dated in the future, so it is before the clock of the test)
  insert into inspections (org_id, item_id, unit_id, done_on, result, cost) values (org_a, mh, u1, '2026-11-06', 'pass', 25);

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ── The set's shares ────────────────────────────────────────────────────────
  select count(*) into n from private.set_shares(org_a) sh
  where sh.set_id = kit and ((sh.item_id = mh and round(sh.share, 6) = round(2 / 3.0, 6)) or (sh.item_id = cab and round(sh.share, 6) = round(1 / 3.0, 6)));
  if n <> 2 then raise exception 'CHECK FAILED: set shares'; end if;

  -- ── Profit per item, November ───────────────────────────────────────────────
  -- MH: revenue 400 + 400 (set) = 800; depreciation U1 100 + U2 50 + U3 100 + U4 100 (estimate) = 350;
  --     repairs 80; inspections 25; hire-in 200; loss U3 1500 − 300 = 1200 → profit −1055.
  --     Owned 3 (U1, U2, U4), units 3, with a cost 2; has a cost (the item's cost price)
  -- Cable: revenue 200 (set); depreciation 50; hire-in 100; loss (10 − 4) × 20 = 120 → profit −70; owned 94
  -- Not linked: 300. Equipment revenue 1300.
  select * into r from equipment_money(org_a, '2026-11-01', '2026-12-01') e where e.item_id = mh;
  if r.revenue <> 800 or r.revenue_sets <> 400 or r.depreciation <> 350 or r.depreciation_estimated <> 100 or r.repairs <> 80
     or r.inspections <> 25 or r.hire_in <> 200 or r.losses <> 1200 or r.profit <> -1055
     or r.owned <> 3 or r.units <> 3 or r.units_with_cost <> 2 or not r.has_cost or r.category <> 'Lighting' then
    raise exception 'CHECK FAILED: MH November %', row_to_json(r);
  end if;
  select * into r from equipment_money(org_a, '2026-11-01', '2026-12-01') e where e.item_id = cab;
  if r.revenue <> 200 or r.revenue_sets <> 200 or r.depreciation <> 50 or r.hire_in <> 100 or r.losses <> 120 or r.profit <> -70
     or r.owned <> 94 or not r.has_cost then
    raise exception 'CHECK FAILED: cable November %', row_to_json(r);
  end if;
  select * into r from equipment_money(org_a, '2026-11-01', '2026-12-01') e where e.item_id is null;
  if r.revenue <> 300 or r.profit <> 300 then raise exception 'CHECK FAILED: not linked %', row_to_json(r); end if;
  select count(*) into n from equipment_money(org_a, '2026-11-01', '2026-12-01') e where e.item_id = kit;
  if n <> 0 then raise exception 'CHECK FAILED: the set has a row of its own'; end if;
  if (select sum(e.revenue) from equipment_money(org_a, '2026-11-01', '2026-12-01') e) <> 1300 then
    raise exception 'CHECK FAILED: rows do not add up to 1300';
  end if;
  -- Another currency: revenue only (none here), no costs
  if exists (select 1 from equipment_money(org_a, '2026-11-01', '2026-12-01', 'USD') e where e.depreciation <> 0 or e.revenue <> 0) then
    raise exception 'CHECK FAILED: USD has euro costs';
  end if;

  -- ── Profit per unit, November ───────────────────────────────────────────────
  -- Owned days: U1 30, U2 15 (from the 16th), U3 10 (lost the 11th), U4 30 (found again) = 85
  -- Revenue 800 × days ÷ 85: U1 282.35, U2 141.18, U3 94.12, U4 282.35
  -- U1 282.35 − 100 − 80 − 25 = 77.35; U2 141.18 − 50 = 91.18; U3 94.12 − 100 − 1200 = −1205.88; U4 282.35 − 100 = 182.35
  for r in select * from equipment_unit_money(org_a, '2026-11-01', '2026-12-01', mh) loop
    if (r.code = 'MH1' and (r.owned_days <> 30 or r.revenue <> 282.35 or r.inspections <> 25 or r.profit <> 77.35))
       or (r.code = 'MH2' and (r.owned_days <> 15 or r.revenue <> 141.18 or r.profit <> 91.18))
       or (r.code = 'MH3' and (r.owned_days <> 10 or r.revenue <> 94.12 or r.losses <> 1200 or r.profit <> -1205.88))
       or (r.code = 'MH4' and (r.owned_days <> 30 or r.revenue <> 282.35 or r.depreciation_estimated <> 100 or r.losses <> 0 or r.profit <> 182.35)) then
      raise exception 'CHECK FAILED: unit %', row_to_json(r);
    end if;
  end loop;
  select count(*) into n from equipment_unit_money(org_a, '2026-11-01', '2026-12-01', mh);
  if n <> 4 then raise exception 'CHECK FAILED: % units', n; end if;

  -- ── Payback (today 30 November) ─────────────────────────────────────────────
  -- MH item: cost 1200 + 600 + 1200 + 1000 (U4, estimate) = 4000 since 1 January; revenue 1000 + 800 =
  --   1800 (the draft doesn't count) → 0.45; not paid back; pace 1800 over 334 days → 163.92 a month;
  --   expected 30 November + ceil(2200 ÷ (1800 ÷ 334)) = + 409 days = 13 January 2028
  -- Cable item: cost 500 since 1 October; 400 on 15 October, 600 on 20 November → paid back 20 November, 1.2
  -- Units: 10 March owned U1, U3 → 500 each; 20 November owned U1, U2, U4 → 266.67 each
  --   U1 766.67 ÷ 1200; U2 266.67 ÷ 600, expected + ceil(333.33 ÷ (266.67 ÷ 15)) = 19 days → 19 December;
  --   U3 500 ÷ 1200, lost: no expected date
  for r in select * from equipment_payback(org_a, null, at_) loop
    if (r.level = 'item' and r.item_id = mh and (r.cost <> 4000 or not r.estimated or r.revenue <> 1800 or r.ratio <> 0.45
          or r.paid_back_on is not null or r.pace_month <> 163.92 or r.expected_on <> '2028-01-13' or r.since <> '2026-01-01'))
       or (r.level = 'item' and r.item_id = cab and (r.cost <> 500 or r.revenue <> 600 or r.ratio <> 1.2 or r.paid_back_on <> '2026-11-20' or r.expected_on is not null))
       or (r.code = 'MH1' and (r.revenue <> 766.67 or r.cost <> 1200))
       or (r.code = 'MH2' and (r.revenue <> 266.67 or r.expected_on <> '2026-12-19'))
       or (r.code = 'MH3' and (r.revenue <> 500 or r.expected_on is not null))
       or (r.code = 'MH4' and (r.revenue <> 266.67 or not r.estimated)) then
      raise exception 'CHECK FAILED: payback %', row_to_json(r);
    end if;
  end loop;
  select count(*) into n from equipment_payback(org_a, mh, at_);
  if n <> 5 then raise exception 'CHECK FAILED: payback rows for MH: %', n; end if;

  -- ── Buy or keep hiring in (12 months up to 30 November) ─────────────────────
  -- MH: 1 hire-in, peak 1, spend 200; buy at the cost price 1000 → 1000 ÷ (200 ÷ 12) = 60.0 months
  -- Cable: 2 hire-ins (100 + the expense's 50 = 150), peak 30; replacement value 20 × 30 = 600 → 48.0 months
  for r in select * from equipment_buy_or_hire(org_a, at_) loop
    if (r.item_id = mh and (r.hire_ins <> 1 or r.peak <> 1 or r.spend <> 200 or r.price_source <> 'cost' or r.cost_to_buy <> 1000 or r.months_to_pay_back <> 60.0))
       or (r.item_id = cab and (r.hire_ins <> 2 or r.peak <> 30 or r.spend <> 150 or r.price_source <> 'replacement' or r.cost_to_buy <> 600 or r.months_to_pay_back <> 48.0)) then
      raise exception 'CHECK FAILED: buy or hire %', row_to_json(r);
    end if;
  end loop;
  select count(*) into n from equipment_buy_or_hire(org_a, at_);
  if n <> 2 then raise exception 'CHECK FAILED: buy or hire rows: %', n; end if;

  -- ── Item card ───────────────────────────────────────────────────────────────
  out := item_money_card(mh, at_);
  if (out -> 'lifetime_revenue' ->> 'EUR')::numeric <> 1800 or (out -> 'payback' ->> 'ratio')::numeric <> 0.45
     or (out ->> 'owned')::int <> 3 or out -> 'next_bookings' is null or out ->> 'upcoming' is null then
    raise exception 'CHECK FAILED: item card %', out;
  end if;

  -- ── Overview tiles (this year up to 30 November) ────────────────────────────
  -- MH: revenue 1800; depreciation U1 1100 + U2 50 + U3 1100 + U4 600 = 2850; repairs 80; inspections 25;
  --     hire-in 200; loss 1200 → −2555 (worst)
  -- Cable: revenue 600; depreciation 100; hire-in 150; loss 120 → 230 (best); hire-in this year 300 + 50 = 350
  out := report_overview_k5(org_a, at_);
  if out -> 'best_earner_year' ->> 'item_id' <> cab::text or (out -> 'best_earner_year' ->> 'amount')::numeric <> 230
     or out -> 'worst_earner_year' ->> 'item_id' <> mh::text or (out -> 'worst_earner_year' ->> 'amount')::numeric <> -2555
     or (out -> 'hire_in_year' ->> 'EUR')::numeric <> 350 then
    raise exception 'CHECK FAILED: overview %', out;
  end if;
  reset role;

  -- ── Who may call ────────────────────────────────────────────────────────────
  foreach who in array array[a, m, v, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform * from equipment_money(org_a, '2026-11-01', '2026-12-01'); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: equipment_money for % (allowed: %)', who, ok; end if;
    begin perform * from equipment_unit_money(org_a, '2026-11-01', '2026-12-01'); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: equipment_unit_money for %', who; end if;
    begin perform * from equipment_payback(org_a); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: equipment_payback for %', who; end if;
    begin perform * from equipment_buy_or_hire(org_a); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: equipment_buy_or_hire for %', who; end if;
    begin perform item_money_card(mh); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: item_money_card for %', who; end if;
    begin perform report_overview_k5(org_a); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: report_overview_k5 for %', who; end if;
    reset role;
  end loop;
  -- Two-step sign-in set up but not done: refused; done: allowed
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    perform * from equipment_money(org_a, '2026-11-01', '2026-12-01');
    raise exception 'CHECK FAILED: equipment_money without the second step';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  perform * from equipment_money(org_a, '2026-11-01', '2026-12-01');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform * from equipment_money(org_a, '2026-11-01', '2026-12-01');
    raise exception 'CHECK FAILED: anonymous call';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Under a second for a year of 2,000 accepted quotes ──────────────────────
  alter table quotes disable trigger quotes_report_dates;
  insert into quotes (org_id, title, status, gig_id, issue_date, currency, discount_pct, body)
  select org_a, 'Load ' || i, 'accepted', null, date '2026-01-01' + (i % 330), 'EUR', 0, jsonb_build_object('phases', jsonb_build_array(jsonb_build_object(
      'id', 'p', 'sections', jsonb_build_array(jsonb_build_object('id', 's', 'lines', jsonb_build_array(
        jsonb_build_object('id', 'a', 'kind', 'rental', 'item_id', mh, 'qty', 1, 'factor', 1, 'unit_price', 10),
        jsonb_build_object('id', 'b', 'kind', 'rental', 'item_id', kit, 'qty', 1, 'factor', 1, 'unit_price', 30),
        jsonb_build_object('id', 'c', 'kind', 'rental', 'qty', 1, 'factor', 1, 'unit_price', 5)))))))
  from generate_series(1, 2000) i;
  alter table quotes enable trigger quotes_report_dates;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t0 := clock_timestamp();
  select count(*) into n from equipment_money(org_a, '2026-01-01', '2027-01-01');
  perform * from equipment_payback(org_a, null, at_);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  if ms > 2000 then raise exception 'CHECK FAILED: 2,000 quotes took % ms', round(ms); end if;
  reset role;

  raise exception 'ALL EQUIPMENT MONEY CHECKS PASSED (equipment_money % ms)', round(ms);
end $$;
