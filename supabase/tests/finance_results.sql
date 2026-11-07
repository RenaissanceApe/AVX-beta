-- Checks for migration 20261225000000_finance_results.sql (K2, money: results and margins).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL FINANCE RESULTS CHECKS PASSED (finance_results … ms)"  → good
-- Who: a = admin of Money Co (each gig's creator and PM), p = member and second PM of the tour,
-- m = member (manages no gig), v = viewer, c = crew on a gig (not in the organisation),
-- x = admin of Other Co, s = member with two-step sign-in set up; u1–u3 = crew.
-- Every expected number is worked out by hand in the comments next to it.
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); p uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); x uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  org_a uuid; org_b uuid; sup uuid; loc uuid; cl_alpha uuid; cl_beta uuid; t_concert uuid;
  cat_hire uuid; cat_cons uuid; cat_rent uuid; cat_soft uuid; cat_fees uuid; cat_kit uuid;
  g0 uuid; g1 uuid; g2 uuid; g3 uuid; i1 uuid; i2 uuid; i3 uuid; s3 uuid; u4 uuid;
  mv bigint; e jsonb; k text; got jsonb; r record; ok boolean; who uuid; n integer; out jsonb; total jsonb;
  t0 timestamptz; ms numeric; claims_s_aal1 text; claims_s_aal2 text;
  checks jsonb;
begin
  insert into auth.users (id, email, aud, role)
  select t.i, 'fr-' || t.o || '@avx.invalid', 'authenticated', 'authenticated'
  from unnest(array[a, p, m, v, c, x, s, u1, u2, u3]) with ordinality t(i, o);
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), s, 'test', 'totp', 'verified', now(), now());
  claims_s_aal1 := json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal1')::text;
  claims_s_aal2 := json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text;
  update profiles set full_name = 'Ana Admin' where id = a;
  update profiles set full_name = 'Pedro PM' where id = p;

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Money Co', a) returning id into org_a;
  reset role;
  update organisations set time_zone = 'Europe/Lisbon' where id = org_a;
  insert into org_members (org_id, user_id, role) values (org_a, p, 'member'), (org_a, m, 'member'), (org_a, v, 'viewer'), (org_a, s, 'member');

  -- ── Fixtures (entered as the owner) ─────────────────────────────────────────
  insert into crew_rate_factors (org_id) values (org_a) on conflict (org_id) do nothing; -- normal day 10 hours
  insert into org_finance_settings (org_id, recovers_vat) values (org_a, true)
  on conflict (org_id) do update set recovers_vat = true;
  insert into expense_categories (org_id, name, kind, spread_months, vat_recoverable) values (org_a, 'Hire', 'direct', null, true) returning id into cat_hire;
  insert into expense_categories (org_id, name, kind, spread_months, vat_recoverable) values (org_a, 'Consumables', 'direct', null, true) returning id into cat_cons;
  insert into expense_categories (org_id, name, kind, spread_months, vat_recoverable) values (org_a, 'Rent', 'overhead', null, true) returning id into cat_rent;
  insert into expense_categories (org_id, name, kind, spread_months, vat_recoverable) values (org_a, 'Software', 'overhead', null, true) returning id into cat_soft;
  insert into expense_categories (org_id, name, kind, spread_months, vat_recoverable) values (org_a, 'Fees', 'tax_other', null, true) returning id into cat_fees;
  insert into expense_categories (org_id, name, kind, spread_months, vat_recoverable) values (org_a, 'Kit', 'capital', 12, true) returning id into cat_kit;
  insert into crew_rates (org_id, function_title, day_rate) values (org_a, 'Lighting Op', 200);
  insert into clients (org_id, name) values (org_a, 'Alpha Lda') returning id into cl_alpha;
  insert into clients (org_id, name) values (org_a, 'Beta SA') returning id into cl_beta;
  insert into gig_types (org_id, name, colour, position) values (org_a, 'Concert', 'blue', 1) returning id into t_concert;
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into loc;
  insert into suppliers (org_id, name) values (org_a, 'Hire Co') returning id into sup;
  -- I1: sold, cost price 20, bulk, written off over 6 months; I2: sold, no cost price; I3: units, cost price 300 over 10 months
  insert into price_items (org_id, name, unit_price, created_by, tracking, cost_price, depreciation_months)
  values (org_a, 'Gaffer tape', 50, a, 'bulk', 20, 6) returning id into i1;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Cable', 80, a, 'bulk') returning id into i2;
  insert into price_items (org_id, name, unit_price, created_by, tracking, cost_price, depreciation_months)
  values (org_a, 'Console', 500, a, 'serial', 300, 10) returning id into i3;

  -- Gigs (a, the creator, becomes each one's PM). G0 last year; G1 a tour across two months (counts in
  -- October, its start); G2 in November; G3 in November with only a sent quote.
  insert into gigs (org_id, name, start_date, end_date, status, created_by)
  values (org_a, 'Last year', '2025-11-05', '2025-11-05', 'completed', a) returning id into g0;
  insert into gigs (org_id, name, start_date, end_date, status, created_by, client_id)
  values (org_a, 'Tour', '2026-10-30', '2026-11-02', 'confirmed', a, cl_alpha) returning id into g1;
  insert into gigs (org_id, name, start_date, end_date, status, created_by, client_id, gig_type_id)
  values (org_a, 'Gala', '2026-11-10', '2026-11-10', 'completed', a, cl_beta, t_concert) returning id into g2;
  insert into gigs (org_id, name, start_date, end_date, status, created_by)
  values (org_a, 'Pitch', '2026-11-20', '2026-11-20', 'draft', a) returning id into g3;
  insert into gig_members (gig_id, user_id, role, function_title) values
    (g1, p, 'pm', 'Production Manager'), (g1, u3, 'crew', 'Rigger'),
    (g2, u1, 'crew', 'FOH Engineer'), (g2, u2, 'crew', 'Lighting Op');
  -- Fees: u3 6 hours × 25 = 150 (agreed); u1 a day at 300 (agreed); u2 none → rate card 200 (estimate)
  insert into gig_crew_fees (gig_id, user_id, org_id, unit, rate, quantity) values
    (g1, u3, org_a, 'hour', 25, 6), (g2, u1, org_a, 'day', 300, 1);
  -- u1's approved day: 8 hours, cost 280 (actual)
  insert into time_entries (gig_id, user_id, org_id, work_date, start_time, end_time, status, cost, split)
  values (g2, u1, org_a, '2026-11-10', '09:00', '17:00', 'approved', 280, '{"normal": 8, "worked": 8}');

  -- Quotes (accepted count; sent only as the gig's estimate; drafts never)
  alter table quotes disable trigger quotes_report_dates;
  insert into quotes (org_id, title, status, gig_id, issue_date, currency, discount_pct, client_id, body) values
    (org_a, 'Q0', 'accepted', g0, '2025-10-01', 'EUR', 0, null, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
      {"id":"l01","kind":"rental","qty":1,"factor":1,"unit_price":300}]}]}]}'),
    (org_a, 'QA', 'accepted', g1, '2026-10-01', 'EUR', 0, cl_alpha, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
      {"id":"la1","kind":"rental","qty":2,"factor":1,"unit_price":500},
      {"id":"la2","kind":"crew","qty":1,"factor":1,"unit_price":400}]}]}]}'),
    (org_a, 'QB', 'accepted', g2, '2026-10-01', 'EUR', 0, cl_beta, jsonb_build_object('phases', jsonb_build_array(jsonb_build_object(
      'id', 'p', 'sections', jsonb_build_array(jsonb_build_object('id', 's', 'lines', jsonb_build_array(
        jsonb_build_object('id', 'lb1', 'kind', 'sale', 'item_id', i1, 'qty', '3', 'factor', 1, 'unit_price', 50),
        jsonb_build_object('id', 'lb2', 'kind', 'transport', 'qty', 120, 'factor', 1, 'unit_price', 0.5),
        jsonb_build_object('id', 'lb3', 'kind', 'other', 'qty', 1, 'factor', 1, 'unit_price', 40)))))))),
    (org_a, 'QB2', 'accepted', g2, '2026-10-01', 'USD', 0, cl_beta, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
      {"id":"lu1","kind":"rental","qty":1,"factor":1,"unit_price":200}]}]}]}'),
    -- No gig: dated by its first phase (15 November)
    (org_a, 'QC', 'accepted', null, '2026-10-01', 'EUR', 0, cl_beta, jsonb_build_object('phases', jsonb_build_array(jsonb_build_object(
      'id', 'p', 'start_date', '2026-11-15', 'sections', jsonb_build_array(jsonb_build_object('id', 's', 'lines', jsonb_build_array(
        jsonb_build_object('id', 'lc1', 'kind', 'sale', 'item_id', i2, 'qty', 1, 'factor', 1, 'unit_price', 80),
        jsonb_build_object('id', 'lc2', 'kind', 'rental', 'qty', 1, 'factor', 1, 'unit_price', 100)))))))),
    (org_a, 'QD', 'sent', g3, '2026-10-01', 'EUR', 0, null, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
      {"id":"ld1","kind":"rental","qty":1,"factor":1,"unit_price":100}]}]}]}'),
    (org_a, 'QE', 'draft', g2, '2026-10-01', 'EUR', 0, null, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
      {"id":"le1","kind":"rental","qty":1,"factor":1,"unit_price":9999}]}]}]}');
  alter table quotes enable trigger quotes_report_dates;

  -- Subrentals: G3's (300); one with no gig (70, 12 November); one with no gig and an expense (S3: 500
  -- planned, the expense's 450 counts instead)
  perform set_config('avx.partner', 'on', true);
  insert into subrentals (org_id, supplier_id, gig_id, status, starts_at, ends_at)
  values (org_a, sup, g3, 'confirmed', '2026-11-20 09:00+00', '2026-11-20 23:00+00') returning id into s3;
  update subrentals set quoted_total = 300 where id = s3;
  insert into subrentals (org_id, supplier_id, gig_id, status, starts_at, ends_at)
  values (org_a, sup, null, 'confirmed', '2026-11-12 09:00+00', '2026-11-13 09:00+00') returning id into s3;
  update subrentals set quoted_total = 70 where id = s3;
  insert into subrentals (org_id, supplier_id, gig_id, status, starts_at, ends_at)
  values (org_a, sup, null, 'returned', '2026-11-14 09:00+00', '2026-11-15 09:00+00') returning id into s3;
  update subrentals set quoted_total = 500 where id = s3;
  perform set_config('avx.partner', '', true);
  -- Repairs on G2: 50 not charged (counts), 999 charged to the client (doesn't)
  insert into repairs (org_id, item_id, gig_id, status, problem, cost, charge_client) values
    (org_a, i1, g2, 'done', 'Fader', 50, false), (org_a, i1, g2, 'done', 'Dropped', 999, true);

  -- Units of I3: U1 600 over 6 months from September; U2 no cost (the item's 300 over 10 months,
  -- an estimate) from November; U3 1200 over 12 months from January, retired 20 October; U4 bought
  -- with a capital expense (counted once, through the expense)
  insert into stock_units (org_id, item_id, code, location_id, purchase_date, purchase_cost, depreciation_months)
  values (org_a, i3, 'U1', loc, '2026-09-10', 600, 6);
  insert into stock_units (org_id, item_id, code, location_id, purchase_date) values (org_a, i3, 'U2', loc, '2026-11-01');
  insert into stock_units (org_id, item_id, code, location_id, purchase_date, purchase_cost, depreciation_months, status, disposed_on)
  values (org_a, i3, 'U3', loc, '2026-01-01', 1200, 12, 'retired', '2026-10-20');
  insert into stock_units (org_id, item_id, code, location_id, purchase_date, purchase_cost, depreciation_months)
  values (org_a, i3, 'U4', loc, '2026-11-05', 5000, 12) returning id into u4;
  -- Bulk purchase of I1: 10 × 6 = 60 over 6 months from 3 November
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id, unit_cost)
  values (org_a, i1, 'purchase', 10, loc, 6) returning id into mv;
  update stock_movements set created_at = '2026-11-03 10:00+00' where id = mv;

  -- Expenses
  insert into expenses (org_id, status, spent_on, description, category_id, amount_net, vat_amount, currency, gig_id, subrental_id, stock_unit_id, removed_at) values
    (org_a, 'confirmed', '2026-11-10', 'G2 van', cat_hire, 100, 23, 'EUR', g2, null, null, null),          -- gig expense 100
    (org_a, 'confirmed', '2026-11-10', 'G2 hotel', null, 30, 0, 'GBP', g2, null, null, null),               -- GBP 30, apart
    (org_a, 'confirmed', '2026-11-14', 'S3 invoice', cat_hire, 450, 103.5, 'EUR', null, s3, null, null),     -- replaces S3's 500
    (org_a, 'confirmed', '2026-11-08', 'Tape', cat_cons, 25, 5.75, 'EUR', null, null, null, null),           -- direct, no gig
    (org_a, 'confirmed', '2026-11-01', 'Rent Nov', cat_rent, 1000, 0, 'EUR', null, null, null, null),
    (org_a, 'confirmed', '2026-10-01', 'Rent Oct', cat_rent, 1000, 0, 'EUR', null, null, null, null),
    (org_a, 'confirmed', '2026-11-03', 'App', cat_soft, 50, 11.5, 'EUR', null, null, null, null),
    (org_a, 'confirmed', '2026-11-04', 'Stamp duty', cat_fees, 20, 0, 'EUR', null, null, null, null),
    (org_a, 'confirmed', '2026-11-04', 'Domain', cat_soft, 10, 0, 'USD', null, null, null, null),           -- USD overhead
    (org_a, 'draft', '2026-11-02', 'Draft rent', cat_rent, 500, 0, 'EUR', null, null, null, null),           -- not counted
    (org_a, 'confirmed', '2026-11-02', 'Removed', cat_rent, 700, 0, 'EUR', null, null, null, now()),         -- not counted
    (org_a, 'confirmed', '2026-10-15', 'Lights', cat_kit, 1200, 276, 'EUR', null, null, null, null),         -- 100 a month from October
    (org_a, 'confirmed', '2026-11-05', 'Console U4', cat_kit, 1200, 276, 'EUR', null, null, u4, null);       -- 100 a month from November

  -- ── Expected results ────────────────────────────────────────────────────────
  -- November (2026-11-01 → 2026-12-01), EUR:
  --   revenue  QB 150 + 60 + 40 + QC 80 + 100 = 430 (rental 100, sale 230, transport 60, other 40)
  --   labour   G2: u1 280 actual + u2 200 rate card = 480 (estimate 200, planned 300 + 200 = 500, actual 280);
  --            days G2 3 + G3 1 = 4, hours 30 + 10 = 40, approved 8
  --   subrentals G3 300; repairs 50; gig expenses 100; other direct 70 + 450 + 25 = 545; cogs 3 × 20 = 60 (1 line missing)
  --   direct 1535; gross margin −1105 (−257.0 %); overheads 1000 + 50 + 20 = 1070
  --   depreciation 100 (Lights) + 100 (U1) + 30 (U2, estimate) + 100 (Console U4) + 10 (bulk) = 340
  --   operating −2515; estimated 200 + 30 = 230; gigs G2, G3; both negative; G3 without an accepted quote
  -- USD: revenue 200, overheads 10 → operating 190. GBP: gig expenses 30 → gross −30.
  -- October (2026-10-01 → 2026-11-01), EUR: the tour's 1400 (rental 1000, crew 400); labour 150 agreed;
  --   days 3 × 4 = 12, hours 10 × 4 × 2 + 6 = 86; overheads 1000; depreciation 100 (Lights) + 100 (U1)
  --   + 100 (U3) = 300; gross 1250 (89.3 %), operating −50.
  checks := $j$[
    { "from": "2026-11-01", "until": "2026-12-01", "group": "total", "key": "total", "currency": "EUR",
      "expect": { "revenue": 430, "revenue_rental": 100, "revenue_sale": 230, "revenue_crew": 0, "revenue_transport": 60, "revenue_other": 40,
                  "labour": 480, "labour_estimated": 200, "labour_planned": 500, "labour_actual": 280,
                  "days_planned": 4, "hours_planned": 40, "hours_actual": 8,
                  "subrentals": 300, "repairs": 50, "gig_expenses": 100, "other_direct": 545, "cogs": 60, "cogs_missing": 1,
                  "direct_costs": 1535, "gross_margin": -1105, "margin_pct": -257.0, "overheads": 1070,
                  "depreciation": 340, "depreciation_estimated": 30, "operating_result": -2515, "estimated": 230,
                  "gigs": 2, "gigs_negative": 2, "gigs_without_accepted": 1 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "total", "key": "total", "currency": "USD",
      "expect": { "revenue": 200, "revenue_rental": 200, "direct_costs": 0, "gross_margin": 200, "margin_pct": 100.0,
                  "overheads": 10, "depreciation": 0, "operating_result": 190, "gigs": 0 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "total", "key": "total", "currency": "GBP",
      "expect": { "revenue": 0, "gig_expenses": 30, "direct_costs": 30, "gross_margin": -30, "margin_pct": null, "operating_result": -30 } },
    { "from": "2026-10-01", "until": "2026-11-01", "group": "total", "key": "total", "currency": "EUR",
      "expect": { "revenue": 1400, "revenue_rental": 1000, "revenue_crew": 400, "labour": 150, "labour_estimated": 0, "labour_planned": 150,
                  "labour_actual": null, "days_planned": 12, "hours_planned": 86, "hours_actual": 0, "cogs": 0,
                  "direct_costs": 150, "gross_margin": 1250, "margin_pct": 89.3, "overheads": 1000, "depreciation": 300,
                  "operating_result": -50, "gigs": 1, "gigs_negative": 0 } },
    { "from": "2026-10-01", "until": "2026-12-01", "group": "month", "key": "2026-10", "currency": "EUR",
      "expect": { "revenue": 1400, "depreciation": 300, "operating_result": -50 } },
    { "from": "2026-10-01", "until": "2026-12-01", "group": "month", "key": "2026-11", "currency": "EUR",
      "expect": { "revenue": 430, "depreciation": 340, "operating_result": -2515 } },
    { "from": "2026-10-01", "until": "2027-01-01", "group": "quarter", "key": "2026-Q4", "currency": "EUR",
      "expect": { "revenue": 1830, "direct_costs": 1685, "overheads": 2070, "depreciation": 980, "operating_result": -2905 } },
    { "from": "2026-01-01", "until": "2027-01-01", "group": "year", "key": "2026", "currency": "EUR",
      "expect": { "revenue": 1830, "gigs": 3 } },
    { "from": "2026-11-01", "until": "2026-11-16", "group": "total", "key": "total", "currency": "EUR",
      "expect": { "depreciation": 170, "depreciation_estimated": 15, "gigs": 1 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "kind", "key": "rental", "currency": "EUR",
      "expect": { "revenue": 100, "subrentals": 300, "repairs": 50, "other_direct": 70, "direct_costs": 420, "gross_margin": -320 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "kind", "key": "sale", "currency": "EUR",
      "expect": { "revenue": 230, "cogs": 60, "cogs_missing": 1, "gross_margin": 170 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "kind", "key": "crew", "currency": "EUR",
      "expect": { "revenue": 0, "labour": 480, "hours_actual": 8 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "kind", "key": "other", "currency": "EUR",
      "expect": { "revenue": 40, "gig_expenses": 100, "other_direct": 475 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "kind", "key": null, "currency": "EUR",
      "expect": { "revenue": 0, "overheads": 1070, "depreciation": 340, "operating_result": -1410, "gigs": 2 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "gig", "key": "G2", "currency": "EUR",
      "expect": { "group_label": "Gala", "revenue": 250, "labour": 480, "labour_planned": 500, "labour_actual": 280,
                  "hours_planned": 30, "hours_actual": 8, "days_planned": 3, "repairs": 50, "gig_expenses": 100, "cogs": 60,
                  "gross_margin": -440, "gigs": 1, "gigs_negative": 1 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "gig", "key": "G3", "currency": "EUR",
      "expect": { "revenue": 0, "subrentals": 300, "gross_margin": -300, "gigs_without_accepted": 1 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "gig", "key": null, "currency": "EUR",
      "expect": { "revenue": 180, "cogs_missing": 1, "other_direct": 545, "overheads": 1070 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "client", "key": "BETA", "currency": "EUR",
      "expect": { "group_label": "Beta SA", "revenue": 430, "labour": 480 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "status", "key": "base:completed", "currency": "EUR",
      "expect": { "revenue": 250, "labour": 480 } },
    { "from": "2026-11-01", "until": "2026-12-01", "group": "gig_type", "key": "CONCERT", "currency": "EUR",
      "expect": { "group_label": "Concert", "revenue": 250 } },
    { "from": "2026-10-01", "until": "2026-11-01", "group": "pm", "key": "A", "currency": "EUR",
      "expect": { "group_label": "Ana Admin", "revenue": 700, "labour": 75, "hours_planned": 43, "gigs": 1 } },
    { "from": "2026-10-01", "until": "2026-11-01", "group": "pm", "key": "P", "currency": "EUR",
      "expect": { "group_label": "Pedro PM", "revenue": 700, "labour": 75, "gigs": 1 } },
    { "from": "2026-10-01", "until": "2026-11-01", "group": "pm", "key": null, "currency": "EUR",
      "expect": { "revenue": 0, "overheads": 1000, "depreciation": 300 } }
  ]$j$::jsonb;

  -- ── The figures, read by m (a member who manages none of the gigs) ──────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for e in select * from jsonb_array_elements(checks) loop
    k := case e ->> 'key' when 'G2' then g2::text when 'G3' then g3::text when 'BETA' then cl_beta::text
                          when 'CONCERT' then t_concert::text when 'A' then a::text when 'P' then p::text else e ->> 'key' end;
    select to_jsonb(f) into got
    from finance_results(org_a, (e ->> 'from')::date, (e ->> 'until')::date, e ->> 'group') f
    where f.group_key is not distinct from k and f.currency = e ->> 'currency';
    if got is null then raise exception 'CHECK FAILED: no % row % % from %', e ->> 'group', e ->> 'key', e ->> 'currency', e ->> 'from'; end if;
    for r in select j.key, j.value from jsonb_each(e -> 'expect') j loop
      if (got -> r.key) is distinct from r.value
         and not (jsonb_typeof(r.value) = 'number' and jsonb_typeof(got -> r.key) = 'number' and (got ->> r.key)::numeric = (r.value #>> '{}')::numeric) then
        raise exception 'CHECK FAILED: % % % % is % (expected %)', e ->> 'group', e ->> 'key', e ->> 'currency', r.key, got -> r.key, r.value;
      end if;
    end loop;
  end loop;
  -- Overheads by category, biggest first
  select f.overheads_by_category into got from finance_results(org_a, '2026-11-01', '2026-12-01') f where f.currency = 'EUR';
  if jsonb_array_length(got) <> 3 or got -> 0 ->> 'name' <> 'Rent' or (got -> 0 ->> 'amount')::numeric <> 1000
     or (got -> 2 ->> 'amount')::numeric <> 20 then
    raise exception 'CHECK FAILED: overheads by category %', got;
  end if;
  -- Every grouping adds up to the total, in each currency (nothing lost, nothing counted twice)
  foreach k in array array['month', 'quarter', 'year', 'gig', 'gig_type', 'status', 'client', 'kind', 'pm'] loop
    for r in
      select t.currency, t.revenue, t.direct_costs, t.overheads, t.depreciation, t.operating_result,
             sum(g.revenue) as g_rev, sum(g.direct_costs) as g_dir, sum(g.overheads) as g_ovh,
             sum(g.depreciation) as g_dep, sum(g.operating_result) as g_op
      from finance_results(org_a, '2026-10-01', '2026-12-01', 'total') t
      join finance_results(org_a, '2026-10-01', '2026-12-01', k) g on g.currency = t.currency
      group by t.currency, t.revenue, t.direct_costs, t.overheads, t.depreciation, t.operating_result
    loop
      if abs(r.revenue - r.g_rev) > 0.02 or abs(r.direct_costs - r.g_dir) > 0.02 or abs(r.overheads - r.g_ovh) > 0.02
         or abs(r.depreciation - r.g_dep) > 0.02 or abs(r.operating_result - r.g_op) > 0.02 then
        raise exception 'CHECK FAILED: % rows don''t add up to the total in % (%)', k, r.currency, to_jsonb(r);
      end if;
    end loop;
  end loop;
  -- Results revenue is the Revenue tab's (report_revenue_lines), per currency
  for r in select l.currency, sum(l.amount) as amount from report_revenue_lines(org_a, '2026-10-01', '2026-12-01') l group by l.currency loop
    select f.revenue into ms from finance_results(org_a, '2026-10-01', '2026-12-01') f where f.currency = r.currency;
    if ms is distinct from r.amount then raise exception 'CHECK FAILED: % revenue % vs revenue lines %', r.currency, ms, r.amount; end if;
  end loop;
  -- The view's new quantity (text "3" read as a number)
  select l.qty into ms from private.report_quote_lines l where l.org_id = org_a and l.line_id = 'lb1';
  if ms is distinct from 3::numeric then raise exception 'CHECK FAILED: qty %', ms; end if;
  -- Bad arguments
  begin
    perform * from finance_results(org_a, '2026-12-01', '2026-11-01');
    raise exception 'CHECK FAILED: backwards period accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform * from finance_results(org_a, '2026-11-01', '2026-12-01', 'weekday');
    raise exception 'CHECK FAILED: unknown grouping accepted';
  exception when invalid_parameter_value then null; end;

  -- ── Overview tiles, on 25 November (Lisbon) ─────────────────────────────────
  -- This month 1–25 November: EUR 430, USD 200; same days last year: G0's 300.
  -- This year to 25 November, EUR: revenue 1830; direct 150 + 1535 = 1685; gross 145 → 7.9 %;
  -- overheads 2070; depreciation: U3 January–October 1000, U1 September and October 200, Lights
  -- October 100, November's 340 × 25/30 = 283.33 → 1583.33; operating 145 − 2070 − 1583.33 = −3508.33.
  out := report_overview(org_a, '2026-11-25T12:00:00Z');
  if (out -> 'revenue_this_month' ->> 'EUR')::numeric <> 430 or (out -> 'revenue_this_month' ->> 'USD')::numeric <> 200
     or (out -> 'revenue_month_last_year' ->> 'EUR')::numeric <> 300 or out -> 'revenue_month_last_year' ? 'USD'
     or (out ->> 'margin_pct_year')::numeric <> 7.9
     or (out -> 'operating_result_year' ->> 'EUR')::numeric <> -3508.33 or (out -> 'operating_result_year' ->> 'USD')::numeric <> 190
     or (out ->> 'negative_margin_year')::int <> 2
     or out -> 'gigs_this_month' is null or out -> 'margin_this_month' is null then
    raise exception 'CHECK FAILED: overview tiles %', out;
  end if;
  reset role;
  -- Another organisation's admin gets nothing of org_a through their own organisation
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from finance_results(org_b, '2026-10-01', '2026-12-01', 'gig') f where f.revenue <> 0 or f.direct_costs <> 0;
  if n <> 0 then raise exception 'CHECK FAILED: another organisation sees money'; end if;
  select count(*) into n from private.gig_labour_hours(org_b, array[g1, g2]);
  if n <> 0 then raise exception 'CHECK FAILED: gig_labour_hours across organisations'; end if;
  reset role;

  -- ── Who may call ────────────────────────────────────────────────────────────
  -- a admin and m member: yes; v viewer, c crew on the gig, x other organisation: no
  insert into gig_members (gig_id, user_id, role) values (g2, c, 'crew');
  foreach who in array array[a, m, v, c, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform * from finance_results(org_a, '2026-11-01', '2026-12-01', 'gig');
      ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: finance_results for % (allowed: %)', who, ok; end if;
    begin
      perform * from private.gig_labour_hours(org_a, array[g2]);
      ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: gig_labour_hours for % (allowed: %)', who, ok; end if;
    begin
      perform * from private.depreciation_lines(org_a, '2026-11-01', '2026-12-01');
      ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: depreciation_lines for % (allowed: %)', who, ok; end if;
    begin
      perform report_overview(org_a);
      ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: report_overview for % (allowed: %)', who, ok; end if;
    reset role;
  end loop;
  -- Two-step sign-in set up but not done: refused; done: allowed
  perform set_config('request.jwt.claims', claims_s_aal1, true);
  set local role authenticated;
  begin
    perform * from finance_results(org_a, '2026-11-01', '2026-12-01');
    raise exception 'CHECK FAILED: finance_results without the second step';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', claims_s_aal2, true);
  set local role authenticated;
  perform * from finance_results(org_a, '2026-11-01', '2026-12-01');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform * from finance_results(org_a, '2026-11-01', '2026-12-01');
    raise exception 'CHECK FAILED: anonymous call';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Under a second for a month of 300 gigs with 5 people each ───────────────
  insert into gigs (org_id, name, start_date, end_date, status, created_by)
  select org_a, 'Load ' || i, date '2027-01-01' + (i % 28), date '2027-01-01' + (i % 28) + 2, 'confirmed', a
  from generate_series(1, 300) i;
  insert into gig_members (gig_id, user_id, role, function_title)
  select g.id, uk.id, 'crew', 'Lighting Op'
  from gigs g cross join unnest(array[u1, u2, u3, p, c]) uk(id)
  where g.org_id = org_a and g.name like 'Load %';
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t0 := clock_timestamp();
  select count(*) into n from finance_results(org_a, '2027-01-01', '2027-02-01', 'gig');
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  if n < 300 or ms > 1000 then raise exception 'CHECK FAILED: 300 gigs: % rows in % ms', n, round(ms); end if;
  reset role;

  raise exception 'ALL FINANCE RESULTS CHECKS PASSED (finance_results % ms)', round(ms);
end $$;
