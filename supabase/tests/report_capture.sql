-- Checks for migration 20261210000000 (K0: capture for reports).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL REPORT CAPTURE CHECKS PASSED"  → good
-- Written without destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_o uuid; cl uuid; cl2 uuid; cl_o uuid; g1 uuid; g2 uuid; g3 uuid;
  q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid; q6 uuid; q7 uuid; ver uuid;
  wh uuid; cable uuid; speaker uuid; u1 uuid;
  ts timestamptz; ts2 timestamptz; d date; n int; t text; j jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'rc-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'rc-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'rc-v@avx.invalid', 'authenticated', 'authenticated'), (c, 'rc-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'rc-o@avx.invalid', 'authenticated', 'authenticated');

  -- Another organisation with a client of its own
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', o) returning id into org_o;
  insert into clients (org_id, name) values (org_o, 'Their client') returning id into cl_o;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Capture Co', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');
  insert into clients (org_id, name) values (org_a, 'Festival Lda') returning id into cl;
  insert into clients (org_id, name) values (org_a, 'Venue SA') returning id into cl2;

  -- ── Quote dates on every status path ──
  insert into quotes (org_id, title) values (org_a, 'Draft') returning id into q1;
  select sent_at, decided_at into ts, ts2 from quotes where id = q1;
  if ts is not null or ts2 is not null then raise exception 'CHECK FAILED: a new draft has dates'; end if;

  -- Dates sent by the app are ignored
  update quotes set sent_at = '2020-01-01', decided_at = '2020-01-01' where id = q1;
  select sent_at, decided_at into ts, ts2 from quotes where id = q1;
  if ts is not null or ts2 is not null then raise exception 'CHECK FAILED: the app set the dates'; end if;

  -- draft → sent
  update quotes set status = 'sent' where id = q1;
  select sent_at, decided_at into ts, ts2 from quotes where id = q1;
  if ts is null or ts2 is not null then raise exception 'CHECK FAILED: draft → sent (% / %)', ts, ts2; end if;
  reset role;
  -- Pretend it was sent long ago, to see that sent_at never moves
  alter table quotes disable trigger user;
  update quotes set sent_at = '2026-01-05 10:00+00' where id = q1;
  alter table quotes enable trigger user;
  set local role authenticated;

  -- sent → accepted
  update quotes set status = 'accepted' where id = q1;
  select sent_at, decided_at into ts, ts2 from quotes where id = q1;
  if ts <> '2026-01-05 10:00+00' or ts2 is null then raise exception 'CHECK FAILED: sent → accepted (% / %)', ts, ts2; end if;
  -- accepted → sent: decision cleared, sent date kept
  update quotes set status = 'sent' where id = q1;
  select sent_at, decided_at into ts, ts2 from quotes where id = q1;
  if ts <> '2026-01-05 10:00+00' or ts2 is not null then raise exception 'CHECK FAILED: accepted → sent (% / %)', ts, ts2; end if;
  -- sent → declined, with a reason
  update quotes set status = 'declined', lost_reason = 'price', lost_note = 'Too dear' where id = q1;
  select decided_at, lost_reason into ts2, t from quotes where id = q1;
  if ts2 is null or t is distinct from 'price' then raise exception 'CHECK FAILED: sent → declined'; end if;
  -- An unknown reason is refused
  begin
    update quotes set lost_reason = 'weather' where id = q1;
    raise exception 'CHECK FAILED: unknown lost reason accepted';
  exception when check_violation then null;
  end;
  -- declined → draft: decision and reason cleared, sent date kept
  update quotes set status = 'draft' where id = q1;
  select sent_at, decided_at, lost_reason into ts, ts2, t from quotes where id = q1;
  if ts <> '2026-01-05 10:00+00' or ts2 is not null or t is not null then raise exception 'CHECK FAILED: declined → draft'; end if;
  -- A reason on a quote that isn't declined is not kept
  update quotes set lost_reason = 'scope' where id = q1;
  select lost_reason into t from quotes where id = q1;
  if t is not null then raise exception 'CHECK FAILED: reason kept on a draft'; end if;

  -- draft → accepted directly: both dates
  insert into quotes (org_id, title) values (org_a, 'Straight yes') returning id into q2;
  update quotes set status = 'accepted' where id = q2;
  select sent_at, decided_at into ts, ts2 from quotes where id = q2;
  if ts is null or ts2 is null then raise exception 'CHECK FAILED: draft → accepted'; end if;
  -- Created as sent (e.g. a copy made after sending)
  insert into quotes (org_id, title, status) values (org_a, 'Born sent', 'sent') returning id into q3;
  select sent_at, decided_at into ts, ts2 from quotes where id = q3;
  if ts is null or ts2 is not null then raise exception 'CHECK FAILED: insert as sent'; end if;

  -- The client declines through the link (send-quote and quote-public use the service role)
  insert into quote_versions (quote_id, version_no, snapshot) values (q3, 1, '{}') returning id into ver;
  reset role;
  insert into quote_shares (quote_id, org_id, version_id, token_hash, expires_at, status, responded_at, responder_note)
  values (q3, org_a, ver, repeat('a', 64), now() + interval '30 days', 'declined', now(), '  We went another way  ');
  perform set_config('request.jwt.claims', '', true);
  update quotes set status = 'declined' where id = q3;
  select decided_at, lost_note into ts2, t from quotes where id = q3;
  if ts2 is null or t is distinct from 'We went another way' then raise exception 'CHECK FAILED: link decline (% / %)', ts2, t; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- ── Backfill on fixtures (records made before this step) ──
  set local role authenticated;
  insert into quotes (org_id, title, client_id) values (org_a, 'Old linked', cl) returning id into q4;
  insert into quotes (org_id, title, client_id) values (org_a, 'Old plain', cl2) returning id into q5;
  insert into quotes (org_id, title) values (org_a, 'Old draft') returning id into q6;
  insert into quote_versions (quote_id, version_no, snapshot) values (q4, 1, '{}') returning id into ver;
  reset role;
  insert into quote_shares (quote_id, org_id, version_id, token_hash, expires_at, status, created_at, responded_at, responder_note) values
    (q4, org_a, ver, repeat('b', 64), now(), 'revoked', '2026-03-01 09:00+00', null, null),
    (q4, org_a, ver, repeat('c', 64), now(), 'accepted', '2026-03-04 09:00+00', '2026-03-06 15:00+00', 'Yes!');
  alter table quotes disable trigger user;
  update quotes set status = 'accepted', sent_at = null, decided_at = null where id = q4;
  update quotes set status = 'declined', sent_at = null, decided_at = null, updated_at = '2026-04-10 12:00+00' where id = q5;
  update quotes set status = 'draft', sent_at = null, decided_at = null where id = q6;
  alter table quotes enable trigger user;

  set local role authenticated;
  -- Gigs made before this step have no client
  insert into gigs (org_id, name, created_by, start_date) values (org_a, 'Accepted wins', a, '2026-12-01') returning id into g1;
  insert into gigs (org_id, name, created_by, start_date) values (org_a, 'Newest wins', a, '2026-12-02') returning id into g2;
  insert into gigs (org_id, name, created_by, start_date) values (org_a, 'No quote', a, '2026-12-03') returning id into g3;
  insert into quotes (org_id, title, client_id, gig_id) values (org_a, 'g1 newer draft', cl2, g1);
  insert into quotes (org_id, title, client_id, gig_id) values (org_a, 'g2 older', cl, g2) returning id into q6;
  insert into quotes (org_id, title, client_id, gig_id) values (org_a, 'g2 newer', cl2, g2) returning id into q7;
  reset role;
  -- Creation times are set by the database; move them as an old record would have them
  alter table quotes disable trigger user;
  update quotes set gig_id = g1, created_at = now() - interval '3 days' where id = q4; -- accepted, for client cl
  update quotes set created_at = now() - interval '2 days' where id = q6;
  update quotes set created_at = now() - interval '1 day' where id = q7;
  alter table quotes enable trigger user;
  select id into q6 from quotes where org_id = org_a and title = 'Old draft';
  select version into n from quotes where id = q4;

  perform private.report_capture_backfill(org_a);
  if (select version from quotes where id = q4) <> n then raise exception 'CHECK FAILED: backfill counted as an edit'; end if;

  select sent_at, decided_at into ts, ts2 from quotes where id = q4;
  if ts <> '2026-03-01 09:00+00' or ts2 <> '2026-03-06 15:00+00' then raise exception 'CHECK FAILED: backfill from links (% / %)', ts, ts2; end if;
  select sent_at, decided_at into ts, ts2 from quotes where id = q5;
  if ts <> '2026-04-10 12:00+00' or ts2 <> '2026-04-10 12:00+00' then raise exception 'CHECK FAILED: backfill from updated_at (% / %)', ts, ts2; end if;
  select sent_at, decided_at into ts, ts2 from quotes where id = q6;
  if ts is not null or ts2 is not null then raise exception 'CHECK FAILED: backfill dated a draft'; end if;
  select sent_at into ts from quotes where id = q1;
  if ts <> '2026-01-05 10:00+00' then raise exception 'CHECK FAILED: backfill moved a date it already had'; end if;
  if (select client_id from gigs where id = g1) is distinct from cl then raise exception 'CHECK FAILED: gig client from the accepted quote'; end if;
  if (select client_id from gigs where id = g2) is distinct from cl2 then raise exception 'CHECK FAILED: gig client from the newest quote'; end if;
  if (select client_id from gigs where id = g3) is not null then raise exception 'CHECK FAILED: gig with no quote got a client'; end if;

  -- ── Gig client: same organisation, admins and members only ──
  set local role authenticated;
  begin
    update gigs set client_id = cl_o where id = g3;
    raise exception 'CHECK FAILED: client of another organisation accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into gigs (org_id, name, created_by, client_id) values (org_a, 'Bad', a, cl_o);
    raise exception 'CHECK FAILED: new gig with another organisation''s client';
  exception when insufficient_privilege then null;
  end;
  update gigs set client_id = cl where id = g3;
  insert into gig_members (gig_id, user_id, role) values (g3, c, 'pm');
  reset role;

  -- A crew member who manages the gig can edit it but not set its client
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update gigs set venue = 'Coliseu' where id = g3;
  if (select venue from gigs where id = g3) is distinct from 'Coliseu' then raise exception 'CHECK FAILED: crew manager can''t edit the gig'; end if;
  begin
    update gigs set client_id = cl2 where id = g3;
    raise exception 'CHECK FAILED: crew manager set the client';
  exception when insufficient_privilege then null;
  end;
  -- Crew see no clients, quotes, items, movements or inspections
  select count(*) into n from clients where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: crew sees clients'; end if;
  select count(*) into n from quotes where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: crew sees quotes'; end if;
  reset role;

  -- ── Equipment costs ──
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into price_items (org_id, name, unit_price, created_by, tracking, cost_price, depreciation_months)
    values (org_a, 'XLR 10m', 2, m, 'bulk', 12.5, 36) returning id into cable;
  insert into price_items (org_id, name, unit_price, created_by, tracking, cost_price)
    values (org_a, 'Speaker', 60, m, 'serial', 900) returning id into speaker;
  begin
    update price_items set cost_price = -1 where id = cable;
    raise exception 'CHECK FAILED: negative cost price';
  exception when check_violation then null;
  end;
  insert into stock_movements (org_id, item_id, kind, quantity, to_location_id, unit_cost) values (org_a, cable, 'purchase', 50, wh, 12.5);
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, unit_cost) values (org_a, cable, 'sale', 5, wh, 20);
  insert into stock_movements (org_id, item_id, kind, quantity, from_location_id) values (org_a, cable, 'lost', 1, wh);
  begin
    insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, unit_cost) values (org_a, cable, 'lost', 1, wh, 12.5);
    raise exception 'CHECK FAILED: unit_cost on a lost row';
  exception when check_violation then null;
  end;
  begin
    insert into stock_movements (org_id, item_id, kind, quantity, from_location_id, to_location_id, unit_cost) values (org_a, cable, 'correction', 1, null, wh, 1);
    raise exception 'CHECK FAILED: unit_cost on a correction';
  exception when check_violation then null;
  end;
  insert into inspections (org_id, item_id, result, cost) values (org_a, cable, 'pass', 35);
  begin
    insert into inspections (org_id, item_id, result, cost) values (org_a, cable, 'pass', -5);
    raise exception 'CHECK FAILED: negative inspection cost';
  exception when check_violation then null;
  end;

  -- A unit sold or written off keeps its value and date; back in use clears both
  insert into stock_units (org_id, item_id, code, location_id, purchase_cost) values (org_a, speaker, 'SPK-RC1', wh, 900) returning id into u1;
  update stock_units set status = 'retired', disposal_value = 400 where id = u1;
  select disposed_on into d from stock_units where id = u1;
  if d is null or (select disposal_value from stock_units where id = u1) <> 400 then raise exception 'CHECK FAILED: disposal not kept'; end if;
  update stock_units set status = 'available', location_id = wh where id = u1;
  if (select disposal_value from stock_units where id = u1) is not null or (select disposed_on from stock_units where id = u1) is not null then
    raise exception 'CHECK FAILED: disposal kept on a unit back in use';
  end if;
  update stock_units set status = 'lost', disposal_value = 0, disposed_on = '2026-10-01' where id = u1;
  if (select disposed_on from stock_units where id = u1) <> '2026-10-01' then raise exception 'CHECK FAILED: chosen disposal date'; end if;
  reset role;

  -- Viewers and crew see none of the costs
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from price_items where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees items'; end if;
  select count(*) into n from stock_movements where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees movements'; end if;
  select count(*) into n from quotes where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees quotes'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from price_items where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: crew sees items'; end if;
  select count(*) into n from inspections where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: crew sees inspections'; end if;
  select count(*) into n from stock_units where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: crew sees units'; end if;
  reset role;

  -- ── Organisation export: the new columns ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select export_org_part(org_a, 'gigs') into j;
  if not exists (select 1 from jsonb_array_elements(j) e where e->>'name' = 'Accepted wins' and e->>'client' = 'Festival Lda') then
    raise exception 'CHECK FAILED: gig client in export';
  end if;
  select export_org_part(org_a, 'quotes') into j;
  if not exists (select 1 from jsonb_array_elements(j) e where e->>'title' = 'Born sent' and e ? 'sent_at' and e->>'lost_note' = 'We went another way') then
    raise exception 'CHECK FAILED: quote dates in export';
  end if;
  select export_org_part(org_a, 'items') into j;
  if not exists (select 1 from jsonb_array_elements(j) e where e->>'name' = 'XLR 10m' and (e->>'cost_price')::numeric = 12.5 and (e->>'depreciation_months')::int = 36) then
    raise exception 'CHECK FAILED: item costs in export';
  end if;
  select export_org_part(org_a, 'stock_movements') into j;
  if not exists (select 1 from jsonb_array_elements(j) e where e->>'kind' = 'sale' and (e->>'unit_cost')::numeric = 20) then
    raise exception 'CHECK FAILED: movement unit_cost in export';
  end if;
  select export_org_part(org_a, 'inspections') into j;
  if not exists (select 1 from jsonb_array_elements(j) e where (e->>'cost')::numeric = 35) then
    raise exception 'CHECK FAILED: inspection cost in export';
  end if;
  select export_org_part(org_a, 'units') into j;
  if not exists (select 1 from jsonb_array_elements(j) e where e->>'code' = 'SPK-RC1' and (e->>'disposal_value')::numeric = 0) then
    raise exception 'CHECK FAILED: unit disposal in export';
  end if;
  -- Parts that didn't change still come from the older export
  select export_org_part(org_a, 'clients') into j;
  if jsonb_array_length(j) <> 2 then raise exception 'CHECK FAILED: clients part (%)', jsonb_array_length(j); end if;

  -- The jobs import links the gig to a client of the same name (migration 20261210000001)
  perform import_jobs(org_a, 'gigs', jsonb_build_array(
    jsonb_build_object('_row', 2, 'ref', 'RC-1', 'name', 'Imported job', 'start_date', current_date + 10, 'client', 'festival lda'),
    jsonb_build_object('_row', 3, 'ref', 'RC-2', 'name', 'Unknown client job', 'start_date', current_date + 11, 'client', 'Nobody Lda')));
  if (select client_id from gigs where org_id = org_a and import_ref = 'RC-1') is distinct from cl then raise exception 'CHECK FAILED: import client'; end if;
  if (select client_id from gigs where org_id = org_a and import_ref = 'RC-2') is not null then raise exception 'CHECK FAILED: import invented a client'; end if;
  if (select description from gigs where org_id = org_a and import_ref = 'RC-2') not like 'Client: Nobody Lda%' then raise exception 'CHECK FAILED: import client name kept'; end if;
  -- The equipment import takes a cost price and write-off period (migration 20261210000002)
  perform run_import(org_a, 'items', '[{"name": "DMX 5m", "code": "DMX5RC", "quantity": 20, "location": "Warehouse", "unit_price": 3, "cost_price": 8.5, "depreciation_months": 48}]');
  if (select cost_price from price_items where org_id = org_a and code = 'DMX5RC') <> 8.5
     or (select depreciation_months from price_items where org_id = org_a and code = 'DMX5RC') <> 48 then raise exception 'CHECK FAILED: import item cost'; end if;
  if (select m.unit_cost from stock_movements m join price_items i on i.id = m.item_id where i.code = 'DMX5RC' and i.org_id = org_a and m.kind = 'purchase') <> 8.5 then
    raise exception 'CHECK FAILED: import opening stock cost';
  end if;
  reset role;

  -- Members can't export (admins only)
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform export_org_part(org_a, 'quotes');
    raise exception 'CHECK FAILED: member exported';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- The helper functions can't be called from the app
  if has_function_privilege('authenticated', 'private.report_capture_backfill(uuid)', 'execute')
     or has_function_privilege('authenticated', 'private.export_org_part_pre_k0(uuid, text, integer)', 'execute') then
    raise exception 'CHECK FAILED: helpers callable';
  end if;

  raise exception 'ALL REPORT CAPTURE CHECKS PASSED';
end $$;
