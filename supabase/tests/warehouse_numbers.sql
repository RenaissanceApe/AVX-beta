-- Checks for migration 20261231000000_warehouse_numbers.sql (K6, warehouse and upkeep numbers).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL WAREHOUSE NUMBERS CHECKS PASSED"  → good
-- Who: a = admin of Store Co, m = member, v = viewer, x = admin of Other Co.
-- The clock is fixed with p_at at 2026-10-15 12:00 UTC (Lisbon); the period is October 2026.
-- Every expected number is worked out by hand in the comments next to it.
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; org_b uuid; wh uuid; cli uuid; sup1 uuid; sup2 uuid;
  g0 uuid; g1 uuid; g2 uuid; g3 uuid; g4 uuid; gb uuid;
  mic uuid; spk uuid; cab uuid; s1 uuid; s2 uuid; sr uuid; mv bigint; d_in bigint;
  at_ timestamptz := '2026-10-15 12:00+00';
  p_from date := '2026-10-01'; p_until date := '2026-11-01';
  out jsonb; it jsonb; who uuid; n integer;
begin
  insert into auth.users (id, email, aud, role)
  select t.i, 'k6-' || t.o || '@avx.invalid', 'authenticated', 'authenticated'
  from unnest(array[a, m, v, x]) with ordinality t(i, o);

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Store Co', a) returning id into org_a;
  reset role;
  update organisations set time_zone = 'Europe/Lisbon' where id = org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');

  -- ── Items (as the owner) ───────────────────────────────────────────────────
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into clients (org_id, name) values (org_a, 'Client One') returning id into cli;
  -- Mic: bulk, replacement 100, inspected every 6 months (never inspected)
  insert into price_items (org_id, name, category, unit_price, created_by, tracking, replacement_value, inspection_months)
  values (org_a, 'Mic', 'Audio', 10, a, 'bulk', 100, 6) returning id into mic;
  -- Speaker: serial, replacement 500, inspected every 12 months
  insert into price_items (org_id, name, category, unit_price, created_by, tracking, replacement_value, inspection_months)
  values (org_a, 'Speaker', 'Audio', 50, a, 'serial', 500, 12) returning id into spk;
  -- Old cable: bulk, only ever booked in June 2025
  insert into price_items (org_id, name, category, unit_price, created_by, tracking)
  values (org_a, 'Old cable', 'Cables', 1, a, 'bulk') returning id into cab;

  -- Past stock from the ledger: 10 mics bought 1 Sep 2026, 4 lost 10 Oct → 10 owned until 9 Oct, 6 from 10 Oct
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id) values (org_a, mic, 'purchase', 10, wh) returning id into mv;
  update stock_movements set created_at = '2026-09-01 10:00+00' where id = mv;
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id) values (org_a, mic, 'lost', 4, wh) returning id into mv;
  update stock_movements set created_at = '2026-10-10 10:00+00' where id = mv;
  -- 5 old cables at 2 each, 1 Jan 2025 (60 months by default)
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id, unit_cost) values (org_a, cab, 'purchase', 5, wh, 2) returning id into mv;
  update stock_movements set created_at = '2025-01-01 10:00+00' where id = mv;
  -- Speakers: S1 1200 over 60 months from 1 Jan 2025; S2 no cost, lost 8 Oct 2026 after going out on g1
  insert into stock_units (org_id, item_id, code, location_id, purchase_date, purchase_cost, depreciation_months)
  values (org_a, spk, 'SPK1', wh, '2025-01-01', 1200, 60) returning id into s1;
  insert into stock_units (org_id, item_id, code, location_id, purchase_date) values (org_a, spk, 'SPK2', wh, '2025-01-01') returning id into s2;

  -- ── Gigs ───────────────────────────────────────────────────────────────────
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'June gig', 'confirmed', a, '2025-06-10', '2025-06-10') returning id into g0;
  insert into gigs (org_id, name, status, created_by, start_date, end_date, client_id) values (org_a, 'Gig one', 'confirmed', a, '2026-10-05', '2026-10-06', cli) returning id into g1;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Gig two', 'confirmed', a, '2026-10-12', '2026-10-13') returning id into g2;
  begin
    insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Gig three', 'cancelled', a, '2026-10-20', '2026-10-20') returning id into g3;
  exception when check_violation then
    raise exception 'PART 1 OF K7 NOT APPLIED: run 20261229000000_gig_cancelled_status.sql by hand first';
  end;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Gig four', 'confirmed', a, '2026-10-20', '2026-10-21') returning id into g4;
  -- Other Co: never counted
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_b, 'Their gig', 'confirmed', x, '2026-10-12', '2026-10-12') returning id into gb;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- Equipment (Lisbon times): 5 old cables June 2025; 8 mics 5–6 Oct; 9 mics 12–13 Oct; 20 mics on the
  -- cancelled gig (left out); 7 mics 20–21 Oct
  insert into gig_equipment (gig_id, org_id, item_id, item_name, quantity, planned_from, planned_until) values
    (g0, org_a, cab, 'Old cable', 5, '2025-06-10 08:00+01', '2025-06-11 00:00+01'),
    (g1, org_a, mic, 'Mic', 8, '2026-10-05 08:00+01', '2026-10-07 00:00+01'),
    (g2, org_a, mic, 'Mic', 9, '2026-10-12 08:00+01', '2026-10-14 00:00+01'),
    (g3, org_a, mic, 'Mic', 20, '2026-10-20 08:00+01', '2026-10-21 00:00+01'),
    (g4, org_a, mic, 'Mic', 7, '2026-10-20 08:00+01', '2026-10-22 00:00+01');

  -- ── Suppliers and hire requests (times fixed, so the trigger is off while they go in) ─────────
  insert into suppliers (org_id, name) values (org_a, 'Hire Co') returning id into sup1;
  insert into suppliers (org_id, name) values (org_a, 'Other Hire') returning id into sup2;
  alter table subrentals disable trigger user;
  -- A: 3 mics for g2 covering only 12 Oct (a subrental covering part of a period), 90; asked 1 Oct, confirmed 24 h later
  insert into subrentals (org_id, supplier_id, gig_id, status, starts_at, ends_at, quoted_total, requested_at, decided_at, created_at)
  values (org_a, sup1, g2, 'confirmed', '2026-10-12 00:00+01', '2026-10-13 00:00+01', 90, '2026-10-01 10:00+00', '2026-10-02 10:00+00', '2026-09-30 10:00+00')
  returning id into sr;
  insert into subrental_lines (subrental_id, org_id, item_id, description, quantity, unit_cost) values (sr, org_a, mic, 'Mic', 3, 30);
  -- B: declined by the supplier on AVX after 6 h
  insert into subrentals (org_id, supplier_id, status, starts_at, ends_at, requested_at, answered_at, created_at)
  values (org_a, sup2, 'declined', '2026-10-20 00:00+01', '2026-10-21 00:00+01', '2026-10-05 10:00+00', '2026-10-05 16:00+00', '2026-10-05 09:00+00');
  -- C: still waiting; D: a draft (left out)
  insert into subrentals (org_id, supplier_id, status, starts_at, ends_at, requested_at, created_at)
  values (org_a, sup1, 'requested', '2026-10-25 00:00+01', '2026-10-26 00:00+01', '2026-10-10 10:00+00', '2026-10-10 10:00+00');
  insert into subrentals (org_id, supplier_id, status, starts_at, ends_at, created_at)
  values (org_a, sup2, 'draft', '2026-10-25 00:00+01', '2026-10-26 00:00+01', '2026-10-10 10:00+00');
  alter table subrentals enable trigger user;

  -- ── Scans (times fixed, so the trigger is off) ─────────────────────────────
  alter table gig_dispatch disable trigger user;
  insert into gig_dispatch (gig_id, org_id, item_id, direction, quantity, created_at) values
    (g1, org_a, mic, 'out', 8, '2026-10-03 10:00+00'),
    (g1, org_a, mic, 'in', 6, '2026-10-07 10:00+00'),
    (g2, org_a, mic, 'out', 6, '2026-10-12 09:00+00'),
    (g3, org_a, mic, 'out', 1, '2026-10-04 10:00+00');   -- cancelled gig: left out
  insert into gig_dispatch (gig_id, org_id, item_id, unit_id, direction, quantity, created_at) values
    (g1, org_a, spk, s2, 'out', 1, '2026-10-03 10:05+00');
  -- An undone scan: 2 mics back on g1, undone (left out)
  insert into gig_dispatch (gig_id, org_id, item_id, direction, quantity, created_at, undone_at)
  values (g1, org_a, mic, 'in', 2, '2026-10-07 10:05+00', '2026-10-07 10:06+00');
  -- S2's return scan, undone: it never came back from g1
  insert into gig_dispatch (gig_id, org_id, item_id, unit_id, direction, quantity, created_at)
  values (g1, org_a, spk, s2, 'in', 1, '2026-10-07 10:10+00') returning id into d_in;
  update gig_dispatch set undone_at = '2026-10-07 10:11+00' where id = d_in;
  alter table gig_dispatch enable trigger user;
  update stock_units set status = 'lost', disposed_on = '2026-10-08' where id = s2;

  -- ── Repairs (dates fixed, so the trigger is off) ───────────────────────────
  alter table repairs disable trigger user;
  -- R1: 1 mic from g1 (Client One), reported 7 Oct, repaired 9 Oct (2 days), 50, charged to the client
  insert into repairs (org_id, item_id, quantity, gig_id, status, problem, cost, charge_client, created_at, closed_at)
  values (org_a, mic, 1, g1, 'done', 'Dented grille', 50, true, '2026-10-07 10:00+00', '2026-10-09 10:00+00');
  -- R2: S1, no gig, open, 30
  insert into repairs (org_id, item_id, unit_id, quantity, status, problem, cost, created_at)
  values (org_a, spk, s1, 1, 'open', 'Rattle', 30, '2026-10-10 10:00+00');
  -- R3: September (left out)
  insert into repairs (org_id, item_id, quantity, status, problem, cost, created_at, closed_at)
  values (org_a, mic, 1, 'done', 'Old', 10, '2026-09-10 10:00+00', '2026-09-11 10:00+00');
  alter table repairs enable trigger user;
  update stock_units set status = 'repair' where id = s1;

  -- ── Inspections ────────────────────────────────────────────────────────────
  -- S1 passed 1 Sep 2025 → due 1 Sep 2026, overdue; failed 2 Oct 2026 (cost 15; its repair is the open R2)
  insert into inspections (org_id, item_id, unit_id, done_on, result) values (org_a, spk, s1, '2025-09-01', 'pass');
  insert into inspections (org_id, item_id, unit_id, done_on, result, cost) values (org_a, spk, s1, '2026-10-02', 'fail', 15);

  -- ════ Demand ══════════════════════════════════════════════════════════════
  set local role authenticated;
  out := warehouse_demand(org_a, p_from, p_until, at_);
  select e into it from jsonb_array_elements(out -> 'items') e where e ->> 'item_id' = mic::text;
  -- Mic: busiest moment 12 Oct 08:00 Lisbon, 9 booked against 6 owned (the ledger: 4 lost 10 Oct) and 3
  -- hired in → 0 short then. Over stock: 12, 13 (9 > 6), 20, 21 (7 > 6) = 4 days; still short after
  -- hire-in: 13 (the subrental ended), 20, 21 = 3; worst gap 3 (13 Oct); 5–6 Oct: 8 ≤ 10, fine.
  -- The cancelled gig's 20 are left out. Hired in once, 3 units.
  if it is null or (it ->> 'peak_booked')::int <> 9 or (it ->> 'owned_at_peak')::int <> 6 or (it ->> 'hired_at_peak')::int <> 3
     or (it ->> 'short_at_peak')::int <> 0 or (it ->> 'days_over')::int <> 4 or (it ->> 'days_short')::int <> 3
     or (it ->> 'max_short')::int <> 3 or it ->> 'first_short' <> '2026-10-13' or it ->> 'peak_day' <> '2026-10-12'
     or (it ->> 'hire_ins')::int <> 1 or (it ->> 'hired_units')::int <> 3 or (it ->> 'owned')::int <> 6 or (it ->> 'idle')::boolean then
    raise exception 'CHECK FAILED: mic demand %', it;
  end if;
  -- Past stock: on 5 Oct the ledger says 10 were owned (before the loss)
  out := warehouse_demand(org_a, '2026-10-05', '2026-10-07', at_);
  select e into it from jsonb_array_elements(out -> 'items') e where e ->> 'item_id' = mic::text;
  if (it ->> 'peak_booked')::int <> 8 or (it ->> 'owned_at_peak')::int <> 10 or (it ->> 'days_over')::int <> 0 then
    raise exception 'CHECK FAILED: past stock from the ledger %', it;
  end if;
  out := warehouse_demand(org_a, p_from, p_until, at_);
  -- Speaker: no booking ever, 1 owned (S2 lost) → idle; book value S1: 1200 − 20 × 21 months − 20 × 15/31 = 770.32
  select e into it from jsonb_array_elements(out -> 'items') e where e ->> 'item_id' = spk::text;
  if not (it ->> 'idle')::boolean or (it ->> 'owned')::int <> 1 or (it ->> 'book_value')::numeric <> 770.32
     or (it ->> 'peak_booked')::int <> 0 or it ->> 'last_confirmed' is not null then
    raise exception 'CHECK FAILED: speaker idle %', it;
  end if;
  -- Old cable: last confirmed booking ended 11 Jun 2025 (more than 12 months ago) → idle;
  -- book value 10 − 10/60 × (21 + 15/31) = 6.42
  select e into it from jsonb_array_elements(out -> 'items') e where e ->> 'item_id' = cab::text;
  if not (it ->> 'idle')::boolean or it ->> 'last_confirmed' <> '2025-06-11' or (it ->> 'book_value')::numeric <> 6.42 then
    raise exception 'CHECK FAILED: old cable idle %', it;
  end if;
  if jsonb_array_length(out -> 'items') <> 3 then raise exception 'CHECK FAILED: demand rows %', out -> 'items'; end if;

  -- ════ Suppliers ═══════════════════════════════════════════════════════════
  -- A (g2, 12 Oct), B (20 Oct), C (25 Oct); the draft left out. Answers 24 h and 6 h → median 15.
  -- Spend: A's 90 (Hire Co).
  out := warehouse_suppliers(org_a, p_from, p_until, at_);
  if (out #>> '{totals,requests}')::int <> 3 or (out #>> '{totals,confirmed}')::int <> 1 or (out #>> '{totals,declined}')::int <> 1
     or (out #>> '{totals,waiting}')::int <> 1 or (out #>> '{totals,answered}')::int <> 2
     or (out #>> '{totals,median_answer_hours}')::numeric <> 15 or (out #>> '{totals,spend}')::numeric <> 90 then
    raise exception 'CHECK FAILED: supplier totals %', out -> 'totals';
  end if;
  select e into it from jsonb_array_elements(out -> 'suppliers') e where e ->> 'supplier_id' = sup1::text;
  if (it ->> 'requests')::int <> 2 or (it ->> 'spend')::numeric <> 90 or (it ->> 'median_answer_hours')::numeric <> 24 then
    raise exception 'CHECK FAILED: Hire Co %', it;
  end if;

  -- ════ Damage, loss and inspections ════════════════════════════════════════
  -- Repairs opened in October: R1, R2 (R3 in September; the failed inspection's repair was not
  -- opened, R2 already open). Cost 80, charged 50, median 2 days.
  out := warehouse_damage(org_a, p_from, p_until, at_);
  if (out #>> '{repairs,count}')::int <> 2 or (out #>> '{repairs,open}')::int <> 1 or (out #>> '{repairs,done}')::int <> 1
     or (out #>> '{repairs,median_days}')::numeric <> 2 or (out #>> '{repairs,cost}')::numeric <> 80
     or (out #>> '{repairs,charged}')::numeric <> 50 or (out #>> '{repairs,charged_count}')::int <> 1 then
    raise exception 'CHECK FAILED: repairs %', out -> 'repairs';
  end if;
  -- Losses: S2 (500, on g1, its return undone) + 4 mics (400) = 900
  if (out #>> '{losses,units}')::int <> 1 or (out #>> '{losses,on_gigs}')::int <> 1 or (out #>> '{losses,bulk}')::int <> 4
     or (out #>> '{losses,value}')::numeric <> 900 then
    raise exception 'CHECK FAILED: losses %', out -> 'losses';
  end if;
  -- Per gig and client: g1 has R1 (50, charged 50) and S2 (500), for Client One
  select e into it from jsonb_array_elements(out -> 'by_gig') e where e ->> 'gig_id' = g1::text;
  if (it ->> 'repairs')::int <> 1 or (it ->> 'cost')::numeric <> 50 or (it ->> 'lost')::int <> 1 or (it ->> 'lost_value')::numeric <> 500
     or it ->> 'client' <> 'Client One' or jsonb_array_length(out -> 'by_gig') <> 1 then
    raise exception 'CHECK FAILED: damage per gig %', out -> 'by_gig';
  end if;
  select e into it from jsonb_array_elements(out -> 'by_client') e where e ->> 'client_id' = cli::text;
  if (it ->> 'repairs')::int <> 1 or (it ->> 'lost')::int <> 1 then raise exception 'CHECK FAILED: damage per client %', out -> 'by_client'; end if;
  -- Inspections: S1 overdue (due 1 Sep), the mic never inspected (due now; not overdue); S2 lost (not due).
  -- Done in October: 1, failed 1, cost 15
  if (out #>> '{inspections,overdue}')::int <> 1 or (out #>> '{inspections,never}')::int <> 1 or (out #>> '{inspections,due_now}')::int <> 2
     or (out #>> '{inspections,done}')::int <> 1 or (out #>> '{inspections,failed}')::int <> 1 or (out #>> '{inspections,cost}')::numeric <> 15 then
    raise exception 'CHECK FAILED: inspections %', out -> 'inspections';
  end if;

  -- ════ Dispatch ════════════════════════════════════════════════════════════
  -- g1: planned 8, out 8 mics + 1 speaker = 9, back 6 (the undone 2 left out), missing 2 + 1 = 3, left
  -- 3 Oct for 5 Oct = 2 days. g2: planned 9, out 6 (3 short), nothing back, missing 6, left the same
  -- day. g4: planned 7, nothing out. g3 cancelled and Other Co left out.
  out := warehouse_dispatch(org_a, p_from, p_until, at_);
  if (out #>> '{totals,gigs}')::int <> 3 or (out #>> '{totals,planned}')::int <> 24 or (out #>> '{totals,out}')::int <> 15
     or (out #>> '{totals,back}')::int <> 6 or (out #>> '{totals,short_out}')::int <> 10 or (out #>> '{totals,missing}')::int <> 9
     or (out #>> '{totals,gigs_missing}')::int <> 2 or (out #>> '{totals,median_lead_days}')::numeric <> 1 then
    raise exception 'CHECK FAILED: dispatch totals %', out -> 'totals';
  end if;
  select e into it from jsonb_array_elements(out -> 'gigs') e where e ->> 'gig_id' = g1::text;
  if (it ->> 'back')::int <> 6 or (it ->> 'missing')::int <> 3 or (it ->> 'lead_days')::int <> 2 then
    raise exception 'CHECK FAILED: dispatch g1 %', it;
  end if;
  -- Scans per day: 3 Oct 2, 7 Oct 1 (two undone left out), 12 Oct 1; the cancelled gig's 4 Oct left out
  if (out #>> '{totals,scans}')::int <> 4 or jsonb_array_length(out -> 'scans_by_day') <> 3
     or out #>> '{totals,busiest_day,day}' <> '2026-10-03' then
    raise exception 'CHECK FAILED: scans per day %', out -> 'scans_by_day';
  end if;

  -- ════ Overview tiles ══════════════════════════════════════════════════════
  -- From 15 Oct, 30 days: the mic is short 20–21 Oct → 1 item. S1 in repair → 1. S1 overdue → 1; mic never → 1.
  out := report_overview_k6(org_a, at_);
  if (out ->> 'items_short_30')::int <> 1 or (out ->> 'units_in_repair')::int <> 1 or (out ->> 'inspections_overdue')::int <> 1
     or (out ->> 'never_inspected')::int <> 1 then
    raise exception 'CHECK FAILED: tiles %', out;
  end if;
  reset role;

  -- ════ Who may ═════════════════════════════════════════════════════════════
  -- The member sees the same, money included
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (warehouse_suppliers(org_a, p_from, p_until, at_) #>> '{totals,spend}')::numeric <> 90 then
    raise exception 'CHECK FAILED: member sees the spend';
  end if;
  perform warehouse_demand(org_a, p_from, p_until, at_);
  perform warehouse_damage(org_a, p_from, p_until, at_);
  perform warehouse_dispatch(org_a, p_from, p_until, at_);
  perform report_overview_k6(org_a, at_);
  reset role;
  -- Viewer, another organisation's admin: refused everywhere
  foreach who in array array[v, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform warehouse_demand(org_a, p_from, p_until, at_); raise exception 'CHECK FAILED: demand for an outsider';
    exception when insufficient_privilege then null; end;
    begin perform warehouse_suppliers(org_a, p_from, p_until, at_); raise exception 'CHECK FAILED: suppliers for an outsider';
    exception when insufficient_privilege then null; end;
    begin perform warehouse_damage(org_a, p_from, p_until, at_); raise exception 'CHECK FAILED: damage for an outsider';
    exception when insufficient_privilege then null; end;
    begin perform warehouse_dispatch(org_a, p_from, p_until, at_); raise exception 'CHECK FAILED: dispatch for an outsider';
    exception when insufficient_privilege then null; end;
    begin perform report_overview_k6(org_a, at_); raise exception 'CHECK FAILED: tiles for an outsider';
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;
  -- Anonymous
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin perform report_overview_k6(org_a, at_); raise exception 'CHECK FAILED: anonymous call';
  exception when insufficient_privilege then null; end;
  reset role;
  -- Too long a period
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform warehouse_demand(org_a, '2025-01-01', '2026-11-01', at_); raise exception 'CHECK FAILED: 22 months of demand';
  exception when invalid_parameter_value then null; end;

  -- ════ When a request was sent and answered (the trigger) ══════════════════
  insert into subrentals (org_id, supplier_id, status, starts_at, ends_at) values (org_a, sup1, 'draft', '2026-12-01 00:00+00', '2026-12-02 00:00+00')
  returning id into sr;
  update subrentals set requested_at = '2020-01-01' where id = sr;
  if (select requested_at from subrentals where id = sr) is not null then raise exception 'CHECK FAILED: requested_at written by hand'; end if;
  update subrentals set status = 'requested' where id = sr;
  if (select requested_at from subrentals where id = sr) is null then raise exception 'CHECK FAILED: requested_at not set'; end if;
  update subrentals set status = 'confirmed' where id = sr;
  if (select decided_at from subrentals where id = sr) is null then raise exception 'CHECK FAILED: decided_at not set'; end if;
  reset role;

  raise exception 'ALL WAREHOUSE NUMBERS CHECKS PASSED';
end $$;
