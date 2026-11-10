-- Checks for migration 20261119000000 (switching S3b: upcoming jobs, their equipment, open quotes),
-- and 20270116000000 (IM4: the history import, the last block before the viewer's).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL JOBS IMPORT CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); v uuid := gen_random_uuid(); org_a uuid; res jsonb; n int; t text; g uuid; q record;
  d1 text := (current_date + 10)::text; d2 text := (current_date + 12)::text; past text := (current_date - 30)::text;
  past2 text := (current_date - 29)::text; old text := (current_date - interval '11 years')::date::text; h1 uuid; h2 uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'ij-a@avx.invalid', 'authenticated', 'authenticated'), (v, 'ij-v@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Jobs Co', a) returning id into org_a;
  perform invite_to_org(org_a, 'ij-v@avx.invalid', 'viewer');
  perform run_import(org_a, 'locations', '[{"name": "Warehouse"}]');
  perform run_import(org_a, 'items', '[
    {"name": "XLR 10 m", "code": "XLR10", "quantity": 40, "location": "Warehouse", "unit_price": 2},
    {"name": "Speaker", "code": "SPK", "tracking": "serial", "unit_price": 40},
    {"name": "Sound engineer", "code": "SE", "kind": "crew", "unit_price": 250}
  ]');
  insert into clients (org_id, name, contact_name, email) values (org_a, 'Festival Lda', 'Ana', 'ana@fest.pt');

  -- Jobs: two upcoming, one past, one cancelled, one bad status, one without a date
  res := import_jobs(org_a, 'gigs', jsonb_build_array(
    jsonb_build_object('_row', 2, 'ref', 'P-101', 'name', 'Summer Festival', 'start_date', d1, 'end_date', d2, 'venue', 'Parque', 'status', 'Bevestigd', 'client', 'Festival Lda'),
    jsonb_build_object('_row', 3, 'ref', 'P-102', 'name', 'Corporate', 'start_date', d1, 'status', 'Optie'),
    jsonb_build_object('_row', 4, 'ref', 'P-090', 'name', 'Old show', 'start_date', past),
    jsonb_build_object('_row', 5, 'ref', 'P-103', 'name', 'Called off', 'start_date', d1, 'status', 'Geannuleerd'),
    jsonb_build_object('_row', 6, 'ref', 'P-104', 'name', 'Weird', 'start_date', d1, 'status', 'Maybe'),
    jsonb_build_object('_row', 7, 'ref', 'P-105', 'name', 'No date')), 'jobs.csv');
  if (res ->> 'created')::int <> 2 or (res ->> 'unchanged')::int <> 2 or (res ->> 'skipped')::int <> 2 then raise exception 'CHECK FAILED: jobs %', res; end if;
  select id, status into g, t from gigs where org_id = org_a and import_ref = 'P-101';
  if t <> 'confirmed' then raise exception 'CHECK FAILED: status %', t; end if;
  select description into t from gigs where id = g;
  if t not like 'Client: Festival Lda%' then raise exception 'CHECK FAILED: description %', t; end if;
  select count(*) into n from gig_members where gig_id = g and user_id = a and role = 'pm';
  if n <> 1 then raise exception 'CHECK FAILED: importer not the gig''s manager'; end if;
  -- Again, with a new venue: updated by its number, not doubled
  res := import_jobs(org_a, 'gigs', jsonb_build_array(jsonb_build_object('ref', 'p-101', 'name', 'Summer Festival', 'venue', 'Estádio'),
    jsonb_build_object('ref', 'P-102', 'name', 'Corporate', 'start_date', d1, 'status', 'Optie')));
  if (res ->> 'updated')::int <> 1 or (res ->> 'unchanged')::int <> 1 then raise exception 'CHECK FAILED: jobs again %', res; end if;
  select count(*) into n from gigs where org_id = org_a;
  if n <> 2 then raise exception 'CHECK FAILED: % gigs', n; end if;

  -- Equipment lines: by job number or name, item by code or name; quantity updated on re-import
  res := import_jobs(org_a, 'gig_equipment', '[
    {"_row": 2, "gig_ref": "P-101", "item_code": "XLR10", "quantity": 12},
    {"_row": 3, "gig": "Summer Festival", "item": "Speaker", "quantity": 4},
    {"_row": 4, "gig_ref": "P-999", "item_code": "XLR10"},
    {"_row": 5, "gig_ref": "P-101", "item_code": "NOPE"},
    {"_row": 6, "gig_ref": "P-101", "item_code": "SE"}
  ]');
  if (res ->> 'created')::int <> 2 or (res ->> 'skipped')::int <> 3 then raise exception 'CHECK FAILED: equipment %', res; end if;
  res := import_jobs(org_a, 'gig_equipment', '[{"gig_ref": "P-101", "item_code": "XLR10", "quantity": 16}, {"gig_ref": "P-101", "item_code": "SPK", "quantity": 4}]');
  if (res ->> 'updated')::int <> 1 or (res ->> 'unchanged')::int <> 1 then raise exception 'CHECK FAILED: equipment again %', res; end if;
  select quantity into n from gig_equipment where gig_id = g and item_name = 'XLR 10 m';
  if n <> 16 then raise exception 'CHECK FAILED: quantity %', n; end if;

  -- Quotes: two quotes from four lines (one from the price list, one typed), a line with nothing
  res := import_jobs(org_a, 'quotes', '[
    {"_row": 2, "quote_ref": "Q-7", "title": "Festival audio", "client": "festival lda", "section": "Audio", "item_code": "SPK", "quantity": 4, "factor": 2},
    {"_row": 3, "quote_ref": "Q-7", "section": "Audio", "description": "Delivery", "unit_price": 80},
    {"_row": 4, "quote_ref": "Q-7", "section": "Crew", "item_code": "SE", "quantity": 1, "factor": 2, "discount_pct": 10},
    {"_row": 5, "quote_ref": "Q-8", "title": "Small job", "client": "Someone new", "description": "Speakers", "quantity": 2, "unit_price": 50},
    {"_row": 6, "quote_ref": "Q-9", "title": "Broken"},
    {"_row": 7}
  ]', 'quotes.csv');
  if (res ->> 'created')::int <> 2 or (res ->> 'skipped')::int <> 2 then raise exception 'CHECK FAILED: quotes %', res; end if;
  select * into q from quotes where org_id = org_a and import_ref = 'Q-7';
  if q.status <> 'draft' or q.client_email <> 'ana@fest.pt' or q.client_id is null then raise exception 'CHECK FAILED: quote client %', row_to_json(q); end if;
  -- 4 × 2 × 40 + 80 + 2 × 250 × 0.9 = 320 + 80 + 450
  if q.total_net <> 850 then raise exception 'CHECK FAILED: total %', q.total_net; end if;
  if jsonb_array_length(q.body -> 'phases' -> 0 -> 'sections') <> 2 or jsonb_array_length(q.body -> 'phases' -> 0 -> 'sections' -> 0 -> 'lines') <> 2 then
    raise exception 'CHECK FAILED: sections %', q.body;
  end if;
  if (q.body -> 'phases' -> 0 -> 'sections' -> 1 -> 'lines' -> 0 ->> 'kind') <> 'crew' then raise exception 'CHECK FAILED: crew line'; end if;
  select client_company into t from quotes where org_id = org_a and import_ref = 'Q-8';
  if t <> 'Someone new' then raise exception 'CHECK FAILED: typed client %', t; end if;
  -- Same file again: unchanged; once sent, a quote is left as it is
  res := import_jobs(org_a, 'quotes', '[{"quote_ref": "Q-8", "title": "Small job", "description": "Speakers", "quantity": 2, "unit_price": 50}]');
  if (res ->> 'unchanged')::int <> 1 then raise exception 'CHECK FAILED: quote again %', res; end if;
  update quotes set status = 'sent' where org_id = org_a and import_ref = 'Q-8';
  res := import_jobs(org_a, 'quotes', '[{"quote_ref": "Q-8", "title": "Small job", "description": "Speakers", "quantity": 3, "unit_price": 50}]');
  if (res ->> 'unchanged')::int <> 1 or (res -> 'problems' -> 0 ->> 'message') not like 'Quote already sent%' then raise exception 'CHECK FAILED: sent quote %', res; end if;

  -- ── IM4 · History: past jobs chosen in the check come in as completed gigs that book nothing ──
  res := import_jobs(org_a, 'gigs', jsonb_build_array(
    jsonb_build_object('_row', 2, 'ref', 'H-1', 'name', 'Last summer', 'start_date', past, 'end_date', past2, 'venue', 'Porto', 'client', 'Festival Lda', 'status', 'Afgerond', '_history', 'completed'),
    jsonb_build_object('_row', 3, 'ref', 'H-2', 'name', 'Called off then', 'start_date', past, 'status', 'Geannuleerd', '_history', 'cancelled'),
    jsonb_build_object('_row', 4, 'ref', 'H-3', 'name', 'Called off, not chosen', 'start_date', past, 'status', 'Geannuleerd', '_history', 'completed'),
    jsonb_build_object('_row', 5, 'ref', 'H-4', 'name', 'Ancient', 'start_date', old, '_history', 'completed'),
    jsonb_build_object('_row', 6, 'ref', 'H-5', 'name', 'Not chosen', 'start_date', past)), 'history.csv');
  if (res ->> 'created')::int <> 2 or (res ->> 'unchanged')::int <> 3 or (res ->> 'skipped')::int <> 0 then raise exception 'CHECK FAILED: history jobs %', res; end if;
  if not (res -> 'problems' @> '[{"row": 4, "message": "Cancelled job left out: Called off, not chosen"}]'
      and res -> 'problems' @> '[{"row": 5, "message": "Too old to import: Ancient"}]'
      and res -> 'problems' @> '[{"row": 6, "message": "Past job left out: Not chosen"}]') then
    raise exception 'CHECK FAILED: history notes %', res -> 'problems';
  end if;
  select id into h1 from gigs where org_id = org_a and import_ref = 'H-1' and status = 'completed' and from_history and client_id is not null
    and venue = 'Porto' and start_date = past::date and end_date = past2::date;
  select id into h2 from gigs where org_id = org_a and import_ref = 'H-2' and status = 'cancelled' and from_history;
  if h1 is null or h2 is null then raise exception 'CHECK FAILED: past gigs not as in the file'; end if;
  -- Nobody on them, nothing booked, nobody told
  select count(*) into n from gig_members where gig_id in (h1, h2);
  if n <> 0 then raise exception 'CHECK FAILED: % people on past gigs', n; end if;
  select count(*) into n from reservations where gig_id in (h1, h2);
  if n <> 0 then raise exception 'CHECK FAILED: % reservations for past gigs', n; end if;
  select count(*) into n from notifications where gig_id in (h1, h2);
  if n <> 0 then raise exception 'CHECK FAILED: % notifications for past gigs', n; end if;
  -- Again: matched by the old number, not doubled; a gig already in AVX is never made a past one
  res := import_jobs(org_a, 'gigs', jsonb_build_array(
    jsonb_build_object('ref', 'h-1', 'name', 'Last summer', 'start_date', past, 'end_date', past2, 'venue', 'Braga', '_history', 'completed'),
    jsonb_build_object('ref', 'P-101', 'name', 'Summer Festival', 'start_date', past, '_history', 'completed')));
  if (res ->> 'updated')::int <> 1 or (res ->> 'unchanged')::int <> 1 or (res -> 'problems' -> 0 ->> 'message') not like 'Already in AVX%' then
    raise exception 'CHECK FAILED: history again %', res;
  end if;
  select count(*) into n from gigs where org_id = org_a and import_ref ilike 'h-%';
  if n <> 2 then raise exception 'CHECK FAILED: % past gigs after a second import', n; end if;
  select venue || '/' || status into t from gigs where id = h1;
  if t <> 'Braga/completed' then raise exception 'CHECK FAILED: past gig again %', t; end if;
  select status || '/' || from_history::text into t from gigs where id = g;
  if t <> 'confirmed/false' then raise exception 'CHECK FAILED: real gig turned into %', t; end if;
  -- Equipment for a past gig is refused: no line, no reservation
  res := import_jobs(org_a, 'gig_equipment', '[{"_row": 2, "gig_ref": "H-1", "item_code": "XLR10", "quantity": 2}]');
  if (res ->> 'skipped')::int <> 1 or (res -> 'problems' -> 0 ->> 'message') not like 'Past job: equipment%' then raise exception 'CHECK FAILED: past gig equipment %', res; end if;
  select count(*) into n from gig_equipment where gig_id = h1;
  if n <> 0 then raise exception 'CHECK FAILED: equipment on a past gig'; end if;
  select count(*) into n from reservations where gig_id = h1;
  if n <> 0 then raise exception 'CHECK FAILED: a past gig books stock'; end if;

  -- Quotes with their status and dates: kept as the file gives them, for the reports
  res := import_jobs(org_a, 'quotes', jsonb_build_array(
    jsonb_build_object('_row', 2, 'quote_ref', 'QH-1', 'title', 'Won one', 'status', 'accepted', 'issue_date', '2024-03-01', 'sent_date', '2024-03-02', 'decided_date', '2024-03-20', 'description', 'PA', 'unit_price', 100),
    jsonb_build_object('_row', 3, 'quote_ref', 'QH-2', 'title', 'Too dear', 'status', 'Afgewezen', 'issue_date', '2024-05-01', 'lost_reason', 'Te duur', 'description', 'PA'),
    jsonb_build_object('_row', 4, 'quote_ref', 'QH-3', 'title', 'Went quiet', 'status', 'declined', 'issue_date', '2024-06-01', 'decided_date', '2024-06-30', 'lost_reason', 'They went quiet', 'description', 'PA'),
    jsonb_build_object('_row', 5, 'quote_ref', 'QH-4', 'title', 'Waiting', 'status', 'sent', 'issue_date', '2026-01-10', 'description', 'PA'),
    jsonb_build_object('_row', 6, 'quote_ref', 'QH-5', 'title', 'Ancient', 'status', 'accepted', 'issue_date', old, 'description', 'PA'),
    jsonb_build_object('_row', 7, 'quote_ref', 'QH-6', 'title', 'Backwards', 'status', 'accepted', 'sent_date', '2024-03-20', 'decided_date', '2024-03-02', 'description', 'PA'),
    jsonb_build_object('_row', 8, 'quote_ref', 'QH-7', 'title', 'Future', 'status', 'accepted', 'decided_date', d1, 'description', 'PA'),
    jsonb_build_object('_row', 9, 'quote_ref', 'QH-8', 'title', 'Maybe', 'status', 'Maybe', 'description', 'PA')), 'history-quotes.csv');
  if (res ->> 'created')::int <> 4 or (res ->> 'unchanged')::int <> 1 or (res ->> 'skipped')::int <> 3 then raise exception 'CHECK FAILED: history quotes %', res; end if;
  if not (res -> 'problems' @> '[{"row": 6, "message": "Too old to import: Ancient"}]'
      and res -> 'problems' @> '[{"row": 7, "message": "The quote is decided before it was sent"}]'
      and res -> 'problems' @> '[{"row": 8, "message": "A date is after today"}]'
      and res -> 'problems' @> '[{"row": 9, "message": "Unknown quote status: Maybe"}]') then
    raise exception 'CHECK FAILED: history quote messages %', res -> 'problems';
  end if;
  select * into q from quotes where org_id = org_a and import_ref = 'QH-1';
  if q.status <> 'accepted' or (q.sent_at at time zone 'Europe/Lisbon')::date <> '2024-03-02' or (q.decided_at at time zone 'Europe/Lisbon')::date <> '2024-03-20' then
    raise exception 'CHECK FAILED: accepted quote dates % % %', q.status, q.sent_at, q.decided_at;
  end if;
  select * into q from quotes where org_id = org_a and import_ref = 'QH-2';
  if q.status <> 'declined' or q.lost_reason <> 'price' or q.lost_note is not null or (q.sent_at at time zone 'Europe/Lisbon')::date <> '2024-05-01'
     or (q.decided_at at time zone 'Europe/Lisbon')::date <> '2024-05-01' then
    raise exception 'CHECK FAILED: declined quote % % % %', q.lost_reason, q.lost_note, q.sent_at, q.decided_at;
  end if;
  select * into q from quotes where org_id = org_a and import_ref = 'QH-3';
  if q.lost_reason <> 'other' or q.lost_note <> 'They went quiet' or (q.decided_at at time zone 'Europe/Lisbon')::date <> '2024-06-30' then
    raise exception 'CHECK FAILED: other reason % %', q.lost_reason, q.lost_note;
  end if;
  select * into q from quotes where org_id = org_a and import_ref = 'QH-4';
  if q.status <> 'sent' or (q.sent_at at time zone 'Europe/Lisbon')::date <> '2026-01-10' or q.decided_at is not null then
    raise exception 'CHECK FAILED: sent quote dates % %', q.sent_at, q.decided_at;
  end if;
  -- Once the import is done, the app's own quotes get today's dates again (dates it sends are ignored)
  insert into quotes (org_id, title, status, sent_at) values (org_a, 'Typed by hand', 'sent', '2020-01-01') returning * into q;
  if q.sent_at < now() - interval '1 minute' then raise exception 'CHECK FAILED: app quote kept the dates it sent %', q.sent_at; end if;
  -- Again: an accepted quote is left as it is, not doubled; a draft imported earlier gets its history
  res := import_jobs(org_a, 'quotes', '[
    {"quote_ref": "QH-1", "title": "Won one", "status": "accepted", "description": "PA", "unit_price": 100},
    {"quote_ref": "Q-7", "title": "Festival audio", "status": "Aceite", "issue_date": "2025-11-01", "decided_date": "2025-11-15", "description": "PA"}
  ]');
  if (res ->> 'unchanged')::int <> 1 or (res ->> 'updated')::int <> 1 then raise exception 'CHECK FAILED: history quotes again %', res; end if;
  select count(*) into n from quotes where org_id = org_a and import_ref ilike 'qh-1';
  if n <> 1 then raise exception 'CHECK FAILED: % QH-1 quotes', n; end if;
  select * into q from quotes where org_id = org_a and import_ref = 'Q-7';
  if q.status <> 'accepted' or (q.decided_at at time zone 'Europe/Lisbon')::date <> '2025-11-15' or q.sent_at is null then
    raise exception 'CHECK FAILED: draft given its history % % %', q.status, q.sent_at, q.decided_at;
  end if;
  reset role;

  -- A viewer can't import
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform import_jobs(org_a, 'gigs', jsonb_build_array(jsonb_build_object('name', 'X', 'start_date', d1)));
    raise exception 'CHECK FAILED: viewer imported';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL JOBS IMPORT CHECKS PASSED';
end $$;
