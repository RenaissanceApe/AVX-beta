-- Checks for migration 20261221000000_gig_finance.sql (step 10, gig finance overview).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL GIG FINANCE CHECKS PASSED (gig_finance … ms)"  → good
-- Who: a = admin of Finance Co (each gig's creator and PM), m = member (manages no gig), v = viewer,
-- c = crew on a gig (not in the organisation), x = admin of Other Co, s = member with two-step
-- sign-in set up; u1–u5 = crew on the festival.
-- The fixtures below are a verbatim copy of src/lib/analytics/gigFinanceFixtures.json (a Vitest
-- test checks the copy), so the database and the browser are held to the same expected numbers.
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  fx jsonb := $fixtures${
  "about": "Shared fixtures for gig finance (step 10, docs/BUSINESS.md). Checked by src/lib/analytics/gigFinance.test.js and, copied verbatim, by supabase/tests/gig_finance.sql (a Vitest test keeps the copy equal). People, categories and records are named by keys (\"pm\" is the gig's creator, added as its PM by the database); the database test gives them real ids. Change both twins together.",
  "factors": { "weekend": 1.5 },
  "recovers_vat": true,
  "categories": [
    { "key": "transport", "kind": "direct", "vat_recoverable": true },
    { "key": "meals", "kind": "direct", "vat_recoverable": false },
    { "key": "kit", "kind": "capital", "vat_recoverable": true }
  ],
  "rates": [
    { "function_title": "Lighting Op", "user": null, "day_rate": 200, "half_day_rate": null, "hour_rate": null },
    { "function_title": "FOH Engineer", "user": null, "day_rate": 999, "half_day_rate": null, "hour_rate": null },
    { "function_title": null, "user": "u4", "day_rate": null, "half_day_rate": null, "hour_rate": 30 },
    { "function_title": "Stagehand", "user": null, "day_rate": 120, "half_day_rate": null, "hour_rate": null, "removed": true }
  ],
  "gigs": [
    { "key": "G1", "name": "Festival", "start_date": "2026-11-06", "end_date": "2026-11-08", "status": "completed" },
    { "key": "G2", "name": "Estimate only", "start_date": "2026-11-20", "end_date": "2026-11-20", "status": "confirmed" },
    { "key": "G3", "name": "No quote yet", "start_date": "2026-11-25", "end_date": "2026-11-25", "status": "draft" },
    { "key": "G4", "name": "Loss maker", "start_date": "2026-11-28", "end_date": "2026-11-28", "status": "confirmed" },
    { "key": "G5", "name": "October gig", "start_date": "2026-10-30", "end_date": "2026-10-30", "status": "completed" }
  ],
  "quotes": [
    { "key": "QA", "gig": "G1", "status": "accepted", "currency": "EUR", "discount_pct": 10, "sent_at": "2026-10-01T10:00:00Z",
      "body": { "phases": [{ "id": "p1", "discount_pct": 0, "sections": [{ "id": "s1", "lines": [
        { "id": "a1", "kind": "rental", "description": "Line array", "qty": 4, "factor": 1, "unit_price": 1000 },
        { "id": "a2", "kind": "crew", "description": "Crew", "qty": 1, "factor": 1, "unit_price": 600 }
      ] }] }] } },
    { "key": "QB", "gig": "G1", "status": "accepted", "currency": "USD", "discount_pct": 0, "sent_at": "2026-10-02T10:00:00Z",
      "body": { "phases": [{ "id": "p1", "discount_pct": 0, "sections": [{ "id": "s1", "lines": [
        { "id": "b1", "kind": "rental", "description": "Extra", "qty": 1, "factor": 1, "unit_price": 100 }
      ] }] }] } },
    { "key": "QC", "gig": "G1", "status": "sent", "currency": "EUR", "discount_pct": 0, "sent_at": "2026-10-20T10:00:00Z",
      "body": { "phases": [{ "id": "p1", "discount_pct": 0, "sections": [{ "id": "s1", "lines": [
        { "id": "c1", "kind": "rental", "description": "Not counted", "qty": 1, "factor": 1, "unit_price": 5000 }
      ] }] }] } },
    { "key": "QD", "gig": "G2", "status": "draft", "currency": "EUR", "discount_pct": 0, "sent_at": null,
      "body": { "phases": [{ "id": "p1", "discount_pct": 0, "sections": [{ "id": "s1", "lines": [
        { "id": "d1", "kind": "rental", "description": "Draft never counts", "qty": 1, "factor": 1, "unit_price": 9000 }
      ] }] }] } },
    { "key": "QE", "gig": "G2", "status": "sent", "currency": "EUR", "discount_pct": 0, "sent_at": "2026-10-01T10:00:00Z",
      "body": { "phases": [{ "id": "p1", "discount_pct": 0, "sections": [{ "id": "s1", "lines": [
        { "id": "e1", "kind": "rental", "description": "Older offer", "qty": 1, "factor": 1, "unit_price": 1000 }
      ] }] }] } },
    { "key": "QF", "gig": "G2", "status": "sent", "currency": "EUR", "discount_pct": 0, "sent_at": "2026-10-05T10:00:00Z",
      "body": { "phases": [{ "id": "p1", "discount_pct": 20, "sections": [{ "id": "s1", "lines": [
        { "id": "f1", "kind": "rental", "description": "Newer offer", "qty": 1, "factor": 1, "unit_price": 1500 }
      ] }] }] } },
    { "key": "QG", "gig": "G4", "status": "accepted", "currency": "EUR", "discount_pct": 0, "sent_at": "2026-10-05T10:00:00Z",
      "body": { "phases": [{ "id": "p1", "discount_pct": 0, "sections": [{ "id": "s1", "lines": [
        { "id": "g1", "kind": "other", "description": "Small job", "qty": 1, "factor": 1, "unit_price": 100 }
      ] }] }] } },
    { "key": "QH", "gig": "G5", "status": "accepted", "currency": "EUR", "discount_pct": 0, "sent_at": "2026-10-05T10:00:00Z",
      "body": { "phases": [{ "id": "p1", "discount_pct": 0, "sections": [{ "id": "s1", "lines": [
        { "id": "h1", "kind": "other", "description": "October", "qty": 1, "factor": 1, "unit_price": 500 }
      ] }] }] } }
  ],
  "members": [
    { "gig": "G1", "user": "pm", "function_title": "Production Manager", "creator": true },
    { "gig": "G2", "user": "pm", "function_title": "Production Manager", "creator": true },
    { "gig": "G3", "user": "pm", "function_title": "Production Manager", "creator": true },
    { "gig": "G4", "user": "pm", "function_title": "Production Manager", "creator": true },
    { "gig": "G5", "user": "pm", "function_title": "Production Manager", "creator": true },
    { "gig": "G1", "user": "u1", "function_title": "FOH Engineer" },
    { "gig": "G1", "user": "u2", "function_title": "lighting op " },
    { "gig": "G1", "user": "u3", "function_title": "Rigger" },
    { "gig": "G1", "user": "u4", "function_title": null },
    { "gig": "G1", "user": "u5", "function_title": "Stagehand" }
  ],
  "fees": [
    { "gig": "G1", "user": "u1", "unit": "day", "rate": 300, "quantity": 3 },
    { "gig": "G1", "user": "u3", "unit": "fixed", "rate": 400, "quantity": 1 },
    { "gig": "G1", "user": "u5", "unit": "day", "rate": 150, "quantity": 2 }
  ],
  "time_entries": [
    { "gig": "G1", "user": "u1", "work_date": "2026-11-06", "status": "approved", "cost": 320 },
    { "gig": "G1", "user": "u1", "work_date": "2026-11-07", "status": "approved", "cost": 330 },
    { "gig": "G1", "user": "u1", "work_date": "2026-11-08", "status": "submitted", "cost": null },
    { "gig": "G1", "user": "u3", "work_date": "2026-11-06", "status": "approved", "cost": 20 },
    { "gig": "G1", "user": "u5", "work_date": "2026-11-06", "status": "approved", "cost": 999 }
  ],
  "subrentals": [
    { "key": "S1", "gig": "G1", "status": "confirmed", "quoted_total": 250, "lines": [] },
    { "key": "S2", "gig": "G1", "status": "returned", "quoted_total": null, "lines": [{ "quantity": 2, "unit_cost": 40 }, { "quantity": 1, "unit_cost": null }] },
    { "key": "S3", "gig": "G1", "status": "confirmed", "quoted_total": 500, "lines": [] },
    { "key": "S4", "gig": "G1", "status": "cancelled", "quoted_total": null, "lines": [{ "quantity": 1, "unit_cost": 100 }] },
    { "key": "S5", "gig": "G1", "status": "draft", "quoted_total": 999, "lines": [] },
    { "key": "S6", "gig": "G3", "status": "confirmed", "quoted_total": 100, "lines": [] },
    { "key": "S7", "gig": "G4", "status": "confirmed", "quoted_total": 300, "lines": [] }
  ],
  "repairs": [
    { "key": "R1", "gig": "G1", "charge_client": false, "cost": 120 },
    { "key": "R2", "gig": "G1", "charge_client": true, "cost": 300 },
    { "key": "R3", "gig": "G1", "charge_client": false, "cost": 200 }
  ],
  "expenses": [
    { "key": "X1", "gig": "G1", "status": "confirmed", "amount_net": 100, "vat_amount": 23, "currency": "EUR", "category": "transport" },
    { "key": "X2", "gig": "G1", "status": "confirmed", "amount_net": 50, "vat_amount": 6.5, "currency": "EUR", "category": "meals" },
    { "key": "X3", "gig": "G1", "status": "claimed", "amount_net": 70, "vat_amount": 0, "currency": "EUR", "category": null },
    { "key": "X4", "gig": "G1", "status": "confirmed", "amount_net": 1000, "vat_amount": 230, "currency": "EUR", "category": "kit" },
    { "key": "X5", "gig": "G1", "status": "confirmed", "amount_net": 40, "vat_amount": 0, "currency": "EUR", "category": null, "removed": true },
    { "key": "X6", "gig": "G1", "status": "confirmed", "amount_net": 30, "vat_amount": 0, "currency": "GBP", "category": null },
    { "key": "X7", "gig": "G1", "status": "confirmed", "amount_net": 450, "vat_amount": 103.5, "currency": "EUR", "category": "transport", "subrental": "S3" },
    { "key": "X8", "gig": "G1", "status": "confirmed", "amount_net": 150, "vat_amount": 34.5, "currency": "EUR", "category": "meals", "repair": "R3" },
    { "key": "X9", "gig": "G1", "status": "confirmed", "amount_net": 280, "vat_amount": 64.4, "currency": "EUR", "category": "transport", "crew_fee": "u5" }
  ],
  "expect": {
    "G1": { "revenue": 4140, "revenue_source": "accepted", "quotes": 2, "labour_planned": 2400, "labour_actual": 1350, "labour": 2150,
            "labour_estimated": 800, "people": 6, "people_missing": 2, "subrentals": 780, "repairs": 304.5, "repairs_charged": 300,
            "other_costs": 156.5, "cost": 3391, "estimated_cost": 800, "margin": 749, "margin_pct": 18.1,
            "other_currencies": { "revenue": { "USD": 100 }, "costs": { "GBP": 30 } } },
    "G2": { "revenue": 1200, "revenue_source": "estimate", "quotes": 1, "labour_planned": 0, "labour_actual": null, "labour": 0,
            "labour_estimated": 0, "people": 1, "people_missing": 1, "subrentals": 0, "repairs": 0, "repairs_charged": 0,
            "other_costs": 0, "cost": 0, "estimated_cost": 0, "margin": 1200, "margin_pct": 100, "other_currencies": null },
    "G3": { "revenue": 0, "revenue_source": "none", "quotes": 0, "labour_planned": 0, "labour_actual": null, "labour": 0,
            "labour_estimated": 0, "people": 1, "people_missing": 1, "subrentals": 100, "repairs": 0, "repairs_charged": 0,
            "other_costs": 0, "cost": 100, "estimated_cost": 0, "margin": -100, "margin_pct": null, "other_currencies": null },
    "G4": { "revenue": 100, "revenue_source": "accepted", "quotes": 1, "labour_planned": 0, "labour_actual": null, "labour": 0,
            "labour_estimated": 0, "people": 1, "people_missing": 1, "subrentals": 300, "repairs": 0, "repairs_charged": 0,
            "other_costs": 0, "cost": 300, "estimated_cost": 0, "margin": -200, "margin_pct": -200, "other_currencies": null },
    "G5": { "revenue": 500, "revenue_source": "accepted", "quotes": 1, "labour_planned": 0, "labour_actual": null, "labour": 0,
            "labour_estimated": 0, "people": 1, "people_missing": 1, "subrentals": 0, "repairs": 0, "repairs_charged": 0,
            "other_costs": 0, "cost": 0, "estimated_cost": 0, "margin": 500, "margin_pct": 100, "other_currencies": null }
  },
  "periods": [
    { "from": "2026-11-01", "until": "2026-12-01", "gigs": ["G1", "G2", "G3", "G4"] },
    { "from": "2026-10-01", "until": "2026-11-01", "gigs": ["G5"] },
    { "from": "2026-11-07", "until": "2026-11-21", "gigs": ["G2"] }
  ],
  "overview": { "at": "2026-11-05T12:00:00Z", "margin_this_month": 1749, "margin_pct_this_month": 32.2, "negative_margin": 1 }
}$fixtures$::jsonb;
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); x uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  u jsonb; ids jsonb := '{}'; org_a uuid; org_b uuid; sup uuid; item uuid; new_id uuid;
  e jsonb; k text; val jsonb; got jsonb; r record; ok boolean; who uuid; n integer; out jsonb;
  t0 timestamptz; ms numeric; claims_s_aal1 text; claims_s_aal2 text;
begin
  insert into auth.users (id, email, aud, role)
  select t.i, 'gf-' || t.o || '@avx.invalid', 'authenticated', 'authenticated'
  from unnest(array[a, m, v, c, x, s]) with ordinality t(i, o);
  u := jsonb_build_object('pm', a);
  foreach k in array array['u1', 'u2', 'u3', 'u4', 'u5'] loop
    new_id := gen_random_uuid();
    insert into auth.users (id, email, aud, role) values (new_id, 'gf-' || k || '@avx.invalid', 'authenticated', 'authenticated');
    u := u || jsonb_build_object(k, new_id);
  end loop;
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
  insert into organisations (name, created_by) values ('Finance Co', a) returning id into org_a;
  reset role;
  update organisations set time_zone = 'Europe/Lisbon' where id = org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer'), (org_a, s, 'member');

  -- ── The fixtures (entered as the owner; the creator a becomes each gig's PM) ─
  insert into crew_rate_factors (org_id, weekend) values (org_a, (fx -> 'factors' ->> 'weekend')::numeric)
  on conflict (org_id) do update set weekend = excluded.weekend;
  insert into org_finance_settings (org_id, recovers_vat) values (org_a, (fx ->> 'recovers_vat')::boolean)
  on conflict (org_id) do update set recovers_vat = excluded.recovers_vat;
  for e in select * from jsonb_array_elements(fx -> 'categories') loop
    insert into expense_categories (org_id, name, kind, spread_months, vat_recoverable)
    values (org_a, e ->> 'key', e ->> 'kind', case when e ->> 'kind' = 'capital' then 60 end, (e ->> 'vat_recoverable')::boolean)
    returning id into new_id;
    ids := ids || jsonb_build_object('cat:' || (e ->> 'key'), new_id);
  end loop;
  for e in select * from jsonb_array_elements(fx -> 'rates') loop
    insert into crew_rates (org_id, function_title, user_id, day_rate, half_day_rate, hour_rate, removed_at)
    values (org_a, e ->> 'function_title', (u ->> (e ->> 'user'))::uuid, (e ->> 'day_rate')::numeric,
            (e ->> 'half_day_rate')::numeric, (e ->> 'hour_rate')::numeric, case when (e ->> 'removed')::boolean then now() end);
  end loop;
  for e in select * from jsonb_array_elements(fx -> 'gigs') loop
    insert into gigs (org_id, name, start_date, end_date, status, created_by)
    values (org_a, e ->> 'name', (e ->> 'start_date')::date, (e ->> 'end_date')::date, e ->> 'status', a) returning id into new_id;
    ids := ids || jsonb_build_object(e ->> 'key', new_id);
  end loop;
  -- The fixtures' own sent dates (the trigger would stamp them all with this transaction's time)
  alter table quotes disable trigger quotes_report_dates;
  for e in select * from jsonb_array_elements(fx -> 'quotes') loop
    insert into quotes (org_id, title, status, gig_id, issue_date, currency, discount_pct, sent_at, body)
    values (org_a, e ->> 'key', e ->> 'status', (ids ->> (e ->> 'gig'))::uuid, '2026-10-01', e ->> 'currency',
            (e ->> 'discount_pct')::numeric, (e ->> 'sent_at')::timestamptz, e -> 'body');
  end loop;
  alter table quotes enable trigger quotes_report_dates;
  for e in select * from jsonb_array_elements(fx -> 'members') loop
    if (e ->> 'creator')::boolean then
      if not exists (select 1 from gig_members gm where gm.gig_id = (ids ->> (e ->> 'gig'))::uuid and gm.user_id = a
                       and gm.function_title = e ->> 'function_title') then
        raise exception 'CHECK FAILED: the creator is not the PM of %', e ->> 'gig';
      end if;
    else
      insert into gig_members (gig_id, user_id, role, function_title)
      values ((ids ->> (e ->> 'gig'))::uuid, (u ->> (e ->> 'user'))::uuid, 'crew', e ->> 'function_title');
    end if;
  end loop;
  for e in select * from jsonb_array_elements(fx -> 'fees') loop
    insert into gig_crew_fees (gig_id, user_id, org_id, unit, rate, quantity)
    values ((ids ->> (e ->> 'gig'))::uuid, (u ->> (e ->> 'user'))::uuid, org_a, e ->> 'unit', (e ->> 'rate')::numeric, (e ->> 'quantity')::numeric);
  end loop;
  for e in select * from jsonb_array_elements(fx -> 'time_entries') loop
    insert into time_entries (gig_id, user_id, org_id, work_date, start_time, end_time, status, cost)
    values ((ids ->> (e ->> 'gig'))::uuid, (u ->> (e ->> 'user'))::uuid, org_a, (e ->> 'work_date')::date, '09:00', '18:00',
            e ->> 'status', (e ->> 'cost')::numeric);
  end loop;
  insert into suppliers (org_id, name) values (org_a, 'Hire Co') returning id into sup;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Moving head', 80, a, 'bulk') returning id into item;
  perform set_config('avx.partner', 'on', true); -- lets the supplier's price be set below
  for e in select * from jsonb_array_elements(fx -> 'subrentals') loop
    insert into subrentals (org_id, supplier_id, gig_id, status, starts_at, ends_at)
    values (org_a, sup, (ids ->> (e ->> 'gig'))::uuid, e ->> 'status', '2026-11-01 09:00+00', '2026-11-30 18:00+00')
    returning id into new_id;
    update subrentals set quoted_total = (e ->> 'quoted_total')::numeric where id = new_id;
    insert into subrental_lines (subrental_id, org_id, description, quantity, unit_cost, position)
    select new_id, org_a, 'Line', (l ->> 'quantity')::integer, (l ->> 'unit_cost')::numeric, o::integer
    from jsonb_array_elements(e -> 'lines') with ordinality t(l, o);
    ids := ids || jsonb_build_object(e ->> 'key', new_id);
  end loop;
  perform set_config('avx.partner', '', true);
  for e in select * from jsonb_array_elements(fx -> 'repairs') loop
    insert into repairs (org_id, item_id, gig_id, status, problem, cost, charge_client)
    values (org_a, item, (ids ->> (e ->> 'gig'))::uuid, 'done', 'Broken', (e ->> 'cost')::numeric, (e ->> 'charge_client')::boolean)
    returning id into new_id;
    ids := ids || jsonb_build_object(e ->> 'key', new_id);
  end loop;
  for e in select * from jsonb_array_elements(fx -> 'expenses') loop
    insert into expenses (org_id, status, spent_on, description, category_id, amount_net, vat_amount, currency,
                          gig_id, subrental_id, repair_id, crew_fee_user_id, removed_at, claimed_by)
    values (org_a, e ->> 'status', '2026-11-06', e ->> 'key', (ids ->> ('cat:' || (e ->> 'category')))::uuid,
            (e ->> 'amount_net')::numeric, (e ->> 'vat_amount')::numeric, e ->> 'currency', (ids ->> (e ->> 'gig'))::uuid,
            (ids ->> (e ->> 'subrental'))::uuid, (ids ->> (e ->> 'repair'))::uuid, (u ->> (e ->> 'crew_fee'))::uuid,
            case when (e ->> 'removed')::boolean then now() end,
            case when e ->> 'status' in ('claimed', 'returned') then (u ->> 'u1')::uuid end);
  end loop;

  -- ── The totals: the same expected numbers as gigFinance.test.js ─────────────
  -- Read by m, a member who doesn't manage these gigs: labour totals still count every fee and
  -- approved day, while m can't read anyone's fee or hours directly
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if exists (select 1 from gig_crew_fees) or exists (select 1 from time_entries) then
    raise exception 'CHECK FAILED: a member who does not manage the gig reads fees or hours';
  end if;
  for k, val in select * from jsonb_each(fx -> 'expect') loop
    select to_jsonb(f) into got from gig_finance(org_a, null, null, (ids ->> k)::uuid) f;
    if got is null then raise exception 'CHECK FAILED: no row for %', k; end if;
    for e in select jsonb_build_object('key', j.key, 'value', j.value) from jsonb_each(val) j loop
      if (got -> (e ->> 'key')) is distinct from (e -> 'value')
         and not (jsonb_typeof(e -> 'value') = 'number' and jsonb_typeof(got -> (e ->> 'key')) = 'number'
                  and (got ->> (e ->> 'key'))::numeric = (e ->> 'value')::numeric) then
        raise exception 'CHECK FAILED: % % is % (expected %)', k, e ->> 'key', got -> (e ->> 'key'), e -> 'value';
      end if;
    end loop;
  end loop;
  -- Periods: gigs starting in [from, until)
  for e in select * from jsonb_array_elements(fx -> 'periods') loop
    select coalesce(jsonb_agg(f.gig_name order by f.gig_name), '[]') into got from gig_finance(org_a, (e ->> 'from')::date, (e ->> 'until')::date) f;
    select coalesce(jsonb_agg(g.name order by g.name), '[]') into out
    from jsonb_array_elements_text(e -> 'gigs') gk(key) join gigs g on g.id = (ids ->> gk.key)::uuid;
    if got <> out then raise exception 'CHECK FAILED: gigs from % are % (expected %)', e ->> 'from', got, out; end if;
  end loop;
  -- Every gig, and a gig of another organisation gives nothing
  select count(*) into n from gig_finance(org_a, null, null);
  if n <> jsonb_array_length(fx -> 'gigs') then raise exception 'CHECK FAILED: every gig gives % rows', n; end if;
  begin
    perform * from gig_finance(org_a, '2026-12-01', '2026-11-01');
    raise exception 'CHECK FAILED: backwards period accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform * from gig_finance(org_a, '2026-12-01', null);
    raise exception 'CHECK FAILED: half a period accepted';
  exception when invalid_parameter_value then null; end;
  -- Overview tiles: margin this month and gigs with a negative margin
  out := report_overview(org_a, (fx -> 'overview' ->> 'at')::timestamptz);
  if (out -> 'margin_this_month' ->> 'EUR')::numeric <> (fx -> 'overview' ->> 'margin_this_month')::numeric
     or (out ->> 'margin_pct_this_month')::numeric <> (fx -> 'overview' ->> 'margin_pct_this_month')::numeric
     or (out ->> 'negative_margin')::int <> (fx -> 'overview' ->> 'negative_margin')::int
     or out -> 'gigs_this_month' is null then
    raise exception 'CHECK FAILED: overview tiles %', out;
  end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_finance(org_b, null, null, (ids ->> 'G1')::uuid);
  if n <> 0 then raise exception 'CHECK FAILED: another organisation''s gig through its own organisation'; end if;
  reset role;

  -- ── Who sees money ──────────────────────────────────────────────────────────
  -- a admin and m member: yes; v viewer, c crew on the gig, x other organisation: no
  insert into gig_members (gig_id, user_id, role) values ((ids ->> 'G1')::uuid, c, 'crew');
  foreach who in array array[a, m, v, c, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform * from gig_finance(org_a, '2026-11-01', '2026-12-01');
      ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: gig_finance for % (allowed: %)', who, ok; end if;
    begin
      perform * from private.gig_labour(org_a, array[(ids ->> 'G1')::uuid]);
      ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: gig_labour for % (allowed: %)', who, ok; end if;
    reset role;
  end loop;
  -- The labour helper never reaches another organisation's gig through the reader's own
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from private.gig_labour(org_b, array[(ids ->> 'G1')::uuid]);
  if n <> 0 then raise exception 'CHECK FAILED: gig_labour across organisations'; end if;
  reset role;
  -- Two-step sign-in set up but not done: refused; done: allowed
  perform set_config('request.jwt.claims', claims_s_aal1, true);
  set local role authenticated;
  begin
    perform * from gig_finance(org_a, '2026-11-01', '2026-12-01');
    raise exception 'CHECK FAILED: gig_finance without the second step';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', claims_s_aal2, true);
  set local role authenticated;
  perform * from gig_finance(org_a, '2026-11-01', '2026-12-01');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform * from gig_finance(org_a, '2026-11-01', '2026-12-01');
    raise exception 'CHECK FAILED: anonymous call';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Organisation export: the gig_finance file (admins) ──────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := export_org_part(org_a, 'gig_finance', 0);
  if jsonb_array_length(out) <> jsonb_array_length(fx -> 'gigs')
     or not exists (select 1 from jsonb_array_elements(out) o where o ->> 'gig' = 'Festival' and (o ->> 'margin')::numeric = 749) then
    raise exception 'CHECK FAILED: export file %', out;
  end if;
  out := export_org_part(org_a, 'expenses', 0); -- older parts still go through
  if jsonb_array_length(out) < 1 then raise exception 'CHECK FAILED: expenses file after the wrap'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    out := export_org_part(org_a, 'gig_finance', 0);
    raise exception 'CHECK FAILED: a member exports';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Under a second on 300 gigs with 5 people each ───────────────────────────
  insert into gigs (org_id, name, start_date, end_date, status, created_by)
  select org_a, 'Load ' || i, date '2027-01-01' + (i % 28), date '2027-01-01' + (i % 28) + 2, 'confirmed', a
  from generate_series(1, 300) i;
  insert into gig_members (gig_id, user_id, role, function_title)
  select g.id, (u ->> uk.key)::uuid, 'crew', 'Lighting Op'
  from gigs g cross join unnest(array['u1', 'u2', 'u3', 'u4', 'u5']) uk(key)
  where g.org_id = org_a and g.name like 'Load %';
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t0 := clock_timestamp();
  select count(*) into n from gig_finance(org_a, '2027-01-01', '2027-02-01');
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  if n <> 300 or ms > 1000 then raise exception 'CHECK FAILED: 300 gigs: % rows in % ms', n, round(ms); end if;
  raise notice 'gig_finance: % rows in % ms', n, round(ms);
  reset role;

  raise exception 'ALL GIG FINANCE CHECKS PASSED (gig_finance % ms)', round(ms);
end $$;
