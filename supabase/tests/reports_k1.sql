-- Checks for migration 20261220000000_reports_k1.sql (step K1, the reports engine).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL REPORTS K1 CHECKS PASSED"  → good
-- Who: a = admin of Report Co, m = member, v = viewer, c = crew on a gig (not in the organisation),
-- x = admin of Other Co, s = member with two-step sign-in set up.
-- The fixtures below are a verbatim copy of src/lib/analytics/fixtures.json (a Vitest test checks
-- the copy), so the database and the browser are held to the same expected numbers.
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  fx jsonb := $fixtures${
  "about": "Shared fixtures for the revenue rule (docs/ANALYTICS.md). Checked by src/lib/analytics/revenue.test.js and, copied verbatim, by supabase/tests/reports_k1.sql (a Vitest test keeps the copy equal). Change both twins together.",
  "gigs": [
    { "id": "a0000000-0000-4000-8000-000000000001", "name": "Last day of October", "start_date": "2026-10-31", "end_date": "2026-11-02", "status": "confirmed" },
    { "id": "a0000000-0000-4000-8000-000000000002", "name": "First of November", "start_date": "2026-11-01", "end_date": "2026-11-01", "status": "confirmed" },
    { "id": "a0000000-0000-4000-8000-000000000003", "name": "No date yet", "start_date": null, "end_date": null, "status": "draft" }
  ],
  "quotes": [
    { "id": "b0000000-0000-4000-8000-000000000001", "title": "Q1 discounts everywhere", "status": "accepted", "gig_id": "a0000000-0000-4000-8000-000000000001",
      "issue_date": "2026-09-01", "currency": "EUR", "discount_pct": 10, "client_company": "Alpha Events",
      "body": { "phases": [
        { "id": "p11", "name": "Show", "start_date": "2026-10-31", "discount_pct": 50, "sections": [{ "id": "s11", "name": "", "lines": [
          { "id": "l111", "kind": "rental", "description": "Speaker", "qty": 2, "factor": 1, "unit_price": 100 },
          { "id": "l112", "kind": "crew", "description": "FOH engineer", "qty": 1, "factor": 2, "unit_price": 300 },
          { "id": "l113", "kind": "comment", "description": "Note", "qty": 1, "factor": 1, "unit_price": 999 }
        ] }] },
        { "id": "p12", "name": "Extra day", "optional": true, "discount_pct": 0, "sections": [{ "id": "s12", "name": "", "lines": [
          { "id": "l121", "kind": "rental", "description": "Speaker", "qty": 9, "factor": 1, "unit_price": 100 }
        ] }] },
        { "id": "p13", "name": "Travel", "discount_pct": 0, "sections": [{ "id": "s13", "name": "", "lines": [
          { "id": "l131", "kind": "transport", "description": "Van", "qty": 120, "factor": 1, "unit_price": 0.45 }
        ] }] }
      ] } },
    { "id": "b0000000-0000-4000-8000-000000000002", "title": "Q2 rounding", "status": "accepted", "gig_id": "a0000000-0000-4000-8000-000000000002",
      "issue_date": "2026-10-20", "currency": "EUR", "discount_pct": 0, "client_name": "Beatriz",
      "body": { "phases": [
        { "id": "p21", "name": "", "discount_pct": 12.5, "sections": [{ "id": "s21", "name": "", "lines": [
          { "id": "l211", "kind": "other", "description": "Power", "qty": 3, "factor": 1, "unit_price": 33.33, "discount_pct": 5 },
          { "id": "l212", "kind": "sale", "description": "Gaffer tape", "qty": "2,5", "factor": 1, "unit_price": 10 }
        ] }] }
      ] } },
    { "id": "b0000000-0000-4000-8000-000000000003", "title": "Q3 no gig, dated by its first phase", "status": "accepted", "gig_id": null,
      "issue_date": "2026-09-15", "currency": "USD", "discount_pct": 0, "client_company": "Gamma Inc",
      "body": { "phases": [
        { "id": "p31", "name": "Option", "optional": true, "start_date": "2026-10-01", "discount_pct": 0, "sections": [{ "id": "s31", "name": "", "lines": [
          { "id": "l311", "kind": "rental", "description": "Screen", "qty": 1, "factor": 1, "unit_price": 500 }
        ] }] },
        { "id": "p32", "name": "Day 2", "start_date": "2026-11-15", "discount_pct": 0, "sections": [{ "id": "s32", "name": "", "lines": [
          { "id": "l321", "kind": "rental", "description": "LED wall", "qty": 1, "factor": 1, "unit_price": 1000 }
        ] }] },
        { "id": "p33", "name": "Day 1", "start_date": "2026-11-03", "discount_pct": 0, "sections": [{ "id": "s33", "name": "", "lines": [
          { "id": "l331", "kind": "crew", "description": "Tech", "qty": 1, "factor": 1, "unit_price": 250 }
        ] }] }
      ] } },
    { "id": "b0000000-0000-4000-8000-000000000004", "title": "Q4 no gig, no dates", "status": "accepted", "gig_id": null,
      "issue_date": "2026-11-30", "currency": "EUR", "discount_pct": 0,
      "body": { "phases": [
        { "id": "p41", "name": "", "discount_pct": 0, "sections": [{ "id": "s41", "name": "", "lines": [
          { "id": "l411", "kind": "crew", "description": "Free day", "qty": 1, "factor": 1, "unit_price": 200, "discount_pct": 100 },
          { "id": "l412", "kind": "other", "description": "Admin", "qty": 1, "factor": 1, "unit_price": 50 }
        ] }] }
      ] } },
    { "id": "b0000000-0000-4000-8000-000000000005", "title": "Q5 sent, not counted", "status": "sent", "gig_id": "a0000000-0000-4000-8000-000000000002",
      "issue_date": "2026-10-20", "currency": "EUR", "discount_pct": 0,
      "body": { "phases": [{ "id": "p51", "name": "", "discount_pct": 0, "sections": [{ "id": "s51", "name": "", "lines": [
        { "id": "l511", "kind": "rental", "description": "Desk", "qty": 1, "factor": 1, "unit_price": 700 }
      ] }] }] } },
    { "id": "b0000000-0000-4000-8000-000000000006", "title": "Q6 draft, not counted", "status": "draft", "gig_id": "a0000000-0000-4000-8000-000000000002",
      "issue_date": "2026-10-20", "currency": "EUR", "discount_pct": 0,
      "body": { "phases": [{ "id": "p61", "name": "", "discount_pct": 0, "sections": [{ "id": "s61", "name": "", "lines": [
        { "id": "l611", "kind": "rental", "description": "Desk", "qty": 1, "factor": 1, "unit_price": 800 }
      ] }] }] } },
    { "id": "b0000000-0000-4000-8000-000000000007", "title": "Q7 declined, not counted", "status": "declined", "gig_id": "a0000000-0000-4000-8000-000000000001",
      "issue_date": "2026-10-20", "currency": "EUR", "discount_pct": 0,
      "body": { "phases": [{ "id": "p71", "name": "", "discount_pct": 0, "sections": [{ "id": "s71", "name": "", "lines": [
        { "id": "l711", "kind": "rental", "description": "Desk", "qty": 1, "factor": 1, "unit_price": 900 }
      ] }] }] } },
    { "id": "b0000000-0000-4000-8000-000000000008", "title": "Q8 gig without a date, issued in December", "status": "accepted", "gig_id": "a0000000-0000-4000-8000-000000000003",
      "issue_date": "2026-12-01", "currency": "EUR", "discount_pct": 0,
      "body": { "phases": [{ "id": "p81", "name": "", "discount_pct": 0, "sections": [{ "id": "s81", "name": "", "lines": [
        { "id": "l811", "kind": "rental", "description": "Mic", "qty": 4, "factor": 1, "unit_price": 25 }
      ] }] }] } }
  ],
  "cases": [
    { "from": "2026-10-01", "until": "2026-11-01",
      "expect": { "lines": 3, "totals": { "EUR": 408.6 },
        "amounts": { "l111": 90, "l112": 270, "l131": 48.6 },
        "dates": { "b0000000-0000-4000-8000-000000000001": "2026-10-31" } } },
    { "from": "2026-11-01", "until": "2026-12-01",
      "expect": { "lines": 6, "totals": { "EUR": 155, "USD": 1250 },
        "amounts": { "l211": 83.12, "l212": 21.88, "l321": 1000, "l331": 250, "l411": 0, "l412": 50 },
        "dates": { "b0000000-0000-4000-8000-000000000002": "2026-11-01", "b0000000-0000-4000-8000-000000000003": "2026-11-03", "b0000000-0000-4000-8000-000000000004": "2026-11-30" },
        "phase_start": { "l321": "2026-11-15", "l331": "2026-11-03", "l211": null } } },
    { "from": "2026-12-01", "until": "2027-01-01",
      "expect": { "lines": 1, "totals": { "EUR": 100 }, "amounts": { "l811": 100 },
        "dates": { "b0000000-0000-4000-8000-000000000008": "2026-12-01" } } }
  ]
}$fixtures$::jsonb;
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); x uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g jsonb; q jsonb; cs jsonb; k text; val jsonb; n integer; amt numeric; d date;
  item uuid; wh uuid; g_eq uuid; who uuid; fn text; ok boolean; out jsonb; t0 timestamptz; ms numeric; r record;
  claims_s_aal1 text; claims_s_aal2 text;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'rk-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'rk-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'rk-v@avx.invalid', 'authenticated', 'authenticated'), (c, 'rk-c@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'rk-x@avx.invalid', 'authenticated', 'authenticated'), (s, 'rk-s@avx.invalid', 'authenticated', 'authenticated');
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), s, 'test', 'totp', 'verified', now(), now());
  claims_s_aal1 := json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal1')::text;
  claims_s_aal2 := json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text;

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Report Co', a) returning id into org_a;
  reset role;
  update organisations set time_zone = 'Europe/Lisbon' where id = org_a;
  update organisations set time_zone = 'America/New_York' where id = org_b;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer'), (org_a, s, 'member');

  -- ── The fixtures, entered as the admin ──────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for g in select * from jsonb_array_elements(fx -> 'gigs') loop
    insert into gigs (id, org_id, name, start_date, end_date, status, created_by)
    values ((g ->> 'id')::uuid, org_a, g ->> 'name', (g ->> 'start_date')::date, (g ->> 'end_date')::date, g ->> 'status', a);
  end loop;
  for q in select * from jsonb_array_elements(fx -> 'quotes') loop
    insert into quotes (id, org_id, title, status, gig_id, issue_date, currency, discount_pct, client_company, client_name, body)
    values ((q ->> 'id')::uuid, org_a, q ->> 'title', q ->> 'status', (q ->> 'gig_id')::uuid, (q ->> 'issue_date')::date,
            q ->> 'currency', (q ->> 'discount_pct')::numeric, q ->> 'client_company', q ->> 'client_name', q -> 'body');
  end loop;
  reset role;
  insert into gig_members (gig_id, user_id, role) values ('a0000000-0000-4000-8000-000000000002', c, 'crew');

  -- ── The revenue rule: the same expected numbers as revenue.test.js ──────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for cs in select * from jsonb_array_elements(fx -> 'cases') loop
    select count(*) into n from report_revenue_lines(org_a, (cs ->> 'from')::date, (cs ->> 'until')::date);
    if n <> (cs -> 'expect' ->> 'lines')::integer then
      raise exception 'CHECK FAILED: % lines from % (expected %)', n, cs ->> 'from', cs -> 'expect' ->> 'lines';
    end if;
    select count(distinct l.currency) into n from report_revenue_lines(org_a, (cs ->> 'from')::date, (cs ->> 'until')::date) l;
    if n <> (select count(*) from jsonb_object_keys(cs -> 'expect' -> 'totals')) then
      raise exception 'CHECK FAILED: currencies from %', cs ->> 'from';
    end if;
    for k, val in select * from jsonb_each(cs -> 'expect' -> 'totals') loop
      select coalesce(sum(l.amount), -1) into amt from report_revenue_lines(org_a, (cs ->> 'from')::date, (cs ->> 'until')::date) l where l.currency = k;
      if amt <> (val #>> '{}')::numeric then raise exception 'CHECK FAILED: % total from % is % (expected %)', k, cs ->> 'from', amt, val; end if;
    end loop;
    for k, val in select * from jsonb_each(cs -> 'expect' -> 'amounts') loop
      select l.amount into amt from report_revenue_lines(org_a, (cs ->> 'from')::date, (cs ->> 'until')::date) l where l.line_id = k;
      if amt is distinct from (val #>> '{}')::numeric then raise exception 'CHECK FAILED: line % is % (expected %)', k, amt, val; end if;
    end loop;
    for k, val in select * from jsonb_each(cs -> 'expect' -> 'dates') loop
      select count(*) into n from report_revenue_lines(org_a, (cs ->> 'from')::date, (cs ->> 'until')::date) l
       where l.quote_id = k::uuid and l.report_date <> (val #>> '{}')::date;
      if n > 0 then raise exception 'CHECK FAILED: report date of %', k; end if;
    end loop;
    for k, val in select * from jsonb_each(coalesce(cs -> 'expect' -> 'phase_start', '{}')) loop
      select l.phase_start into d from report_revenue_lines(org_a, (cs ->> 'from')::date, (cs ->> 'until')::date) l where l.line_id = k;
      if d is distinct from (val #>> '{}')::date then raise exception 'CHECK FAILED: phase start of %', k; end if;
    end loop;
  end loop;
  -- Each row carries its gig and client
  select * into r from report_revenue_lines(org_a, '2026-10-01', '2026-11-01') limit 1;
  if r.gig_name <> 'Last day of October' or r.gig_status <> 'confirmed' or r.client_name <> 'Alpha Events' then
    raise exception 'CHECK FAILED: gig and client on a line %', row_to_json(r);
  end if;
  begin
    perform * from report_revenue_lines(org_a, '2026-11-01', '2026-10-01');
    raise exception 'CHECK FAILED: backwards period accepted';
  exception when invalid_parameter_value then null; end;
  reset role;

  -- ── Who may call each function ──────────────────────────────────────────────
  foreach fn in array array['lines', 'equipment', 'overview'] loop
    foreach who in array array[a, m, v, c, x] loop
      perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
      set local role authenticated;
      begin
        if fn = 'lines' then perform * from report_revenue_lines(org_a, '2026-01-01', '2027-01-01');
        elsif fn = 'equipment' then perform * from equipment_report(org_a, '2026-01-01', '2027-01-01');
        else perform report_overview(org_a); end if;
        ok := true;
      exception when insufficient_privilege then ok := false; end;
      reset role;
      if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: % for % (allowed: %)', fn, who, ok; end if;
    end loop;
    -- Two-step sign-in set up but not done: refused; done: allowed
    perform set_config('request.jwt.claims', claims_s_aal1, true);
    set local role authenticated;
    begin
      if fn = 'lines' then perform * from report_revenue_lines(org_a, '2026-01-01', '2027-01-01');
      elsif fn = 'equipment' then perform * from equipment_report(org_a, '2026-01-01', '2027-01-01');
      else perform report_overview(org_a); end if;
      raise exception 'CHECK FAILED: % without the second step', fn;
    exception when insufficient_privilege then null; end;
    reset role;
    perform set_config('request.jwt.claims', claims_s_aal2, true);
    set local role authenticated;
    if fn = 'lines' then perform * from report_revenue_lines(org_a, '2026-01-01', '2027-01-01');
    elsif fn = 'equipment' then perform * from equipment_report(org_a, '2026-01-01', '2027-01-01');
    else perform report_overview(org_a); end if;
    reset role;
  end loop;
  -- Not signed in at all
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform * from report_revenue_lines(org_a, '2026-01-01', '2027-01-01');
    raise exception 'CHECK FAILED: anonymous call';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Month boundaries in the organisation's time zone ────────────────────────
  -- 1 November 00:30 UTC is already November in Lisbon, still 31 October in New York
  if private.org_today(org_a, '2026-11-01 00:30+00') <> '2026-11-01' then raise exception 'CHECK FAILED: today in Lisbon'; end if;
  if private.org_today(org_b, '2026-11-01 00:30+00') <> '2026-10-31' then raise exception 'CHECK FAILED: today in New York'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := report_overview(org_a, '2026-11-01 00:30+00');
  if out ->> 'today' <> '2026-11-01' or (out -> 'gigs_this_month' ->> 'total')::int <> 1
     or (out -> 'revenue_next_30' ->> 'EUR')::numeric <> 155 or (out -> 'revenue_next_30' ->> 'USD')::numeric <> 1250
     or (out -> 'waiting' ->> 'count')::int <> 1 or (out -> 'waiting' -> 'totals' ->> 'EUR')::numeric <> 700 then
    raise exception 'CHECK FAILED: overview in Lisbon %', out;
  end if;
  reset role;
  update organisations set time_zone = 'America/New_York' where id = org_a;
  set local role authenticated;
  out := report_overview(org_a, '2026-11-01 00:30+00');
  -- 31 October: the October gig, and the next 30 days run to 29 November (so Q4 on the 30th is out)
  if out ->> 'today' <> '2026-10-31' or (out -> 'gigs_this_month' ->> 'total')::int <> 1
     or (out -> 'revenue_next_30' ->> 'EUR')::numeric <> 513.6 then
    raise exception 'CHECK FAILED: overview in New York %', out;
  end if;
  reset role;
  update organisations set time_zone = 'Europe/Lisbon' where id = org_a;

  -- ── Equipment report: use, and revenue dated by the rule ────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into price_items (org_id, name, unit_price, created_by, tracking, replacement_value) values (org_a, 'Moving head', 80, a, 'bulk', 2000) returning id into item;
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, item, 'purchase', 2, wh);
  insert into gigs (org_id, name, start_date, end_date, status, created_by)
  values (org_a, 'Use gig', current_date - 10, current_date - 6, 'confirmed', a) returning id into g_eq;
  insert into gig_equipment (gig_id, item_id, quantity) values (g_eq, item, 1);
  -- Accepted long ago, but dated by its gig: counts in the last 20 days
  insert into quotes (org_id, title, status, gig_id, issue_date, currency, body)
  values (org_a, 'Use quote', 'accepted', g_eq, current_date - 200, 'EUR', jsonb_build_object('phases', jsonb_build_array(jsonb_build_object(
    'id', 'pe', 'sections', jsonb_build_array(jsonb_build_object('id', 'se', 'lines', jsonb_build_array(
      jsonb_build_object('id', 'le', 'kind', 'rental', 'item_id', item, 'qty', 3, 'factor', 1, 'unit_price', 100))))))));
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id) values (org_a, item, 'lost', 1, wh);
  select * into r from equipment_report(org_a, current_date - 20, current_date + 1) e where e.item_id = item;
  if r.owned <> 1 or r.revenue <> 300 or r.gigs <> 1 or r.lost <> 1 or r.lost_value <> 2000 or r.idle or r.use <= 0 or r.use > 1 then
    raise exception 'CHECK FAILED: equipment report %', row_to_json(r);
  end if;
  -- Other currencies aren't added in
  select * into r from equipment_report(org_a, current_date - 20, current_date + 1, 'USD') e where e.item_id = item;
  if r.revenue <> 0 then raise exception 'CHECK FAILED: equipment revenue in another currency'; end if;
  reset role;

  -- ── Each function under a second on 5,000 quotes ────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into quotes (org_id, title, status, issue_date, currency, discount_pct, body)
  select org_a, 'Load ' || i, case when i % 4 = 0 then 'sent' else 'accepted' end, date '2026-01-01' + (i % 365), 'EUR', i % 10,
         jsonb_build_object('phases', jsonb_build_array(
           jsonb_build_object('id', 'a' || i, 'discount_pct', i % 7, 'sections', jsonb_build_array(jsonb_build_object('id', 's', 'lines', jsonb_build_array(
             jsonb_build_object('id', 'l1', 'kind', 'rental', 'item_id', item, 'qty', 2, 'factor', 1, 'unit_price', 50),
             jsonb_build_object('id', 'l2', 'kind', 'crew', 'qty', 1, 'factor', 2, 'unit_price', 250),
             jsonb_build_object('id', 'l3', 'kind', 'comment', 'description', 'Note'))))),
           jsonb_build_object('id', 'b' || i, 'optional', true, 'sections', jsonb_build_array(jsonb_build_object('id', 's', 'lines', jsonb_build_array(
             jsonb_build_object('id', 'l4', 'kind', 'transport', 'qty', 100, 'factor', 1, 'unit_price', 0.5)))))))
  from generate_series(1, 5000) i;
  t0 := clock_timestamp();
  select count(*) into n from report_revenue_lines(org_a, '2026-01-01', '2027-01-01');
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  if n < 7500 or ms > 1000 then raise exception 'CHECK FAILED: revenue lines on 5,000 quotes: % rows in % ms', n, round(ms); end if;
  raise notice 'report_revenue_lines: % rows in % ms', n, round(ms);
  t0 := clock_timestamp();
  perform * from equipment_report(org_a, '2026-01-01', '2027-01-01');
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  if ms > 1000 then raise exception 'CHECK FAILED: equipment report on 5,000 quotes took % ms', round(ms); end if;
  raise notice 'equipment_report: % ms', round(ms);
  t0 := clock_timestamp();
  out := report_overview(org_a);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  if ms > 1000 then raise exception 'CHECK FAILED: overview on 5,000 quotes took % ms', round(ms); end if;
  raise notice 'report_overview: % ms', round(ms);
  reset role;

  raise exception 'ALL REPORTS K1 CHECKS PASSED';
end $$;
