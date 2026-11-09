-- Checks for migration 20261227000000_sales_clients.sql (K4, sales and clients).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL SALES CLIENTS CHECKS PASSED"  → good
-- Who: a = admin of Sales Co, m = member, v = viewer, c = crew on a gig (not in the organisation),
-- x = admin of Other Co, s = member with two-step sign-in set up.
-- The clock is fixed with p_at at 2026-10-15 12:00 UTC (Lisbon, UTC+1 then): today is 15 October.
-- Quotes' sent and decided dates are written by hand with the dates trigger paused (inside this
-- transaction only). Every expected number is worked out in the comments next to it.
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); x uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  org_a uuid; org_b uuid; cl_alpha uuid; cl_beta uuid; cl_other uuid; t_concert uuid; f_channel uuid; f_note uuid; f_theirs uuid;
  g0 uuid; g1 uuid; g2 uuid; g3 uuid; g4 uuid; gb uuid;
  q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid; q6 uuid; q7 uuid; q8 uuid; qb uuid; ver uuid;
  at_ timestamptz := '2026-10-15 12:00+00';
  r record; ok boolean; who uuid; n integer; out jsonb;
  claims_s_aal1 text; claims_s_aal2 text;
begin
  insert into auth.users (id, email, aud, role)
  select t.i, 'k4-' || t.o || '@avx.invalid', 'authenticated', 'authenticated'
  from unnest(array[a, m, v, c, x, s]) with ordinality t(i, o);
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), s, 'test', 'totp', 'verified', now(), now());
  claims_s_aal1 := json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal1')::text;
  claims_s_aal2 := json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text;
  update profiles set full_name = 'Mia Member' where id = m;
  update profiles set full_name = 'Ana Admin' where id = a;

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Sales Co', a) returning id into org_a;
  reset role;
  update organisations set time_zone = 'Europe/Lisbon' where id = org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer'), (org_a, s, 'member');

  -- ── Fixtures (entered as the owner) ─────────────────────────────────────────
  insert into gig_types (org_id, name, colour, position) values (org_a, 'Concert', 'blue', 1) returning id into t_concert;
  insert into custom_fields (org_id, entity, label, kind, choices) values (org_a, 'client', 'Channel', 'choice', '["Web", "Referral"]') returning id into f_channel;
  insert into custom_fields (org_id, entity, label, kind) values (org_a, 'client', 'Note', 'text') returning id into f_note;
  insert into custom_fields (org_id, entity, label, kind, choices) values (org_b, 'client', 'Theirs', 'choice', '["A"]') returning id into f_theirs;
  insert into clients (org_id, name, custom_values) values (org_a, 'Alpha Lda', jsonb_build_object(f_channel, 'Web')) returning id into cl_alpha;
  insert into clients (org_id, name, custom_values) values (org_a, 'Beta SA', jsonb_build_object(f_channel, 'Referral')) returning id into cl_beta;
  insert into clients (org_id, name) values (org_b, 'Other client') returning id into cl_other;

  -- Gigs. Alpha: G0 last year (its first gig), G1 in September, G2 on 20 October (its next gig).
  -- Beta: G3 on 5 October (its first: new), G4 a draft in November (never its next gig).
  insert into gigs (org_id, name, start_date, end_date, status, created_by, client_id)
  values (org_a, 'Old show', '2025-05-01', '2025-05-01', 'completed', a, cl_alpha) returning id into g0;
  insert into gigs (org_id, name, start_date, end_date, status, created_by, client_id, gig_type_id)
  values (org_a, 'Concert', '2026-09-10', '2026-09-10', 'confirmed', a, cl_alpha, t_concert) returning id into g1;
  insert into gigs (org_id, name, start_date, end_date, status, created_by, client_id)
  values (org_a, 'Launch', '2026-10-20', '2026-10-20', 'confirmed', a, cl_alpha) returning id into g2;
  insert into gigs (org_id, name, start_date, end_date, status, created_by, client_id)
  values (org_a, 'Gala', '2026-10-05', '2026-10-05', 'confirmed', a, cl_beta) returning id into g3;
  insert into gigs (org_id, name, start_date, end_date, status, created_by, client_id)
  values (org_a, 'Maybe', '2026-11-01', '2026-11-01', 'draft', a, cl_beta) returning id into g4;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  insert into gigs (org_id, name, start_date, end_date, status, created_by, client_id)
  values (org_b, 'Theirs', '2026-09-10', '2026-09-10', 'confirmed', x, cl_other) returning id into gb;

  -- Quotes: one rental line each. The author is whoever's claims are set when it is inserted.
  alter table quotes disable trigger quotes_report_dates;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  -- Q1 Alpha (G1), accepted: 1000 less 10 % line discount = 900 (gross 1000, discount 100); 4 days
  insert into quotes (org_id, title, status, gig_id, client_id, issue_date, body, sent_at, decided_at)
  values (org_a, 'Q1', 'accepted', g1, cl_alpha, '2026-09-01', '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
    {"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":1000,"discount_pct":10}]}]}]}',
    '2026-09-01 10:00+00', '2026-09-05 10:00+00') returning id into q1;
  -- Q3 Beta (G3), accepted 300; decided 30 Sep 23:30 UTC = 1 October in Lisbon; 10 days
  insert into quotes (org_id, title, status, gig_id, client_id, issue_date, body, sent_at, decided_at)
  values (org_a, 'Q3', 'accepted', g3, cl_beta, '2026-09-20', '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
    {"id":"l","kind":"rental","qty":3,"factor":1,"unit_price":100},{"id":"n","kind":"comment","description":"Thanks"}]}]},
    {"id":"o","optional":true,"sections":[{"id":"s2","lines":[{"id":"l2","kind":"rental","qty":1,"factor":1,"unit_price":5000}]}]}]}',
    '2026-09-20 23:30+00', '2026-09-30 23:30+00') returning id into q3;
  -- Q6 Beta, sent 1 Oct, valid until 20 Oct (expiring soon), opened by the client: 400; follow up
  insert into quotes (org_id, title, status, client_id, issue_date, valid_until, body, sent_at)
  values (org_a, 'Q6', 'sent', cl_beta, '2026-10-01', '2026-10-20', '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
    {"id":"l","kind":"rental","qty":"4","factor":1,"unit_price":"100"}]}]}]}', '2026-10-01 09:00+00') returning id into q6;
  -- Q8 Alpha, a draft: never counted
  insert into quotes (org_id, title, status, client_id, body)
  values (org_a, 'Q8', 'draft', cl_alpha, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
    {"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":8888}]}]}]}') returning id into q8;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  -- Q2 Alpha (no gig), declined for price: 500; 10 days
  insert into quotes (org_id, title, status, client_id, issue_date, body, sent_at, decided_at, lost_reason)
  values (org_a, 'Q2', 'declined', cl_alpha, '2026-09-02', '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
    {"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":500}]}]}]}',
    '2026-09-02 10:00+00', '2026-09-12 10:00+00', 'price') returning id into q2;
  -- Q4 no client at all, declined (other): 200; 1 day
  insert into quotes (org_id, title, status, issue_date, body, sent_at, decided_at, lost_reason)
  values (org_a, 'Q4', 'declined', '2026-10-02', '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
    {"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":200}]}]}]}',
    '2026-10-02 10:00+00', '2026-10-03 10:00+00', 'other') returning id into q4;
  -- Q5 Alpha, sent 1 Sep, valid until 1 Oct: expired, out of the win rate and of the follow-ups: 700
  insert into quotes (org_id, title, status, client_id, issue_date, valid_until, body, sent_at)
  values (org_a, 'Q5', 'sent', cl_alpha, '2026-09-01', '2026-10-01', '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
    {"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":700}]}]}]}', '2026-09-01 10:00+00') returning id into q5;
  -- Q7 typed client "Gamma Ltd", sent 12 Oct, no validity: 100; too recent to follow up
  insert into quotes (org_id, title, status, client_company, issue_date, body, sent_at)
  values (org_a, 'Q7', 'sent', ' Gamma Ltd ', '2026-10-12', '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
    {"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":100}]}]}]}', '2026-10-12 10:00+00') returning id into q7;
  -- Other Co: an accepted quote of 9999 for its own client, never counted for Sales Co
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  insert into quotes (org_id, title, status, gig_id, client_id, issue_date, body, sent_at, decided_at)
  values (org_b, 'QB', 'accepted', gb, cl_other, '2026-09-01', '{"phases":[{"id":"p","sections":[{"id":"s","lines":[
    {"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":9999}]}]}]}', '2026-09-01 10:00+00', '2026-09-02 10:00+00') returning id into qb;
  alter table quotes enable trigger quotes_report_dates;
  -- Q6's link was opened by the client
  insert into quote_versions (quote_id, org_id, version_no, snapshot) values (q6, org_a, 99, '{}') returning id into ver;
  insert into quote_shares (quote_id, org_id, version_id, token_hash, expires_at, viewed_at)
  values (q6, org_a, ver, repeat('a', 64), '2026-12-01', '2026-10-02 08:00+00');

  if private.sales_quote_gross((select body from quotes where id = q3)) <> 300 then
    raise exception 'CHECK FAILED: gross leaves out optional phases and comments';
  end if;

  -- ── Waiting for an answer (as the member) ──────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from sales_waiting(org_a, 7, at_);
  if n <> 3 then raise exception 'CHECK FAILED: waiting count % (Q5, Q6, Q7)', n; end if;
  select * into r from sales_waiting(org_a, 7, at_) w where w.quote_id = q5;
  if not r.expired or r.follow_up or r.expiring or r.value <> 700 or r.days_waiting <> 44 then
    raise exception 'CHECK FAILED: expired Q5 %', row_to_json(r); end if;
  select * into r from sales_waiting(org_a, 7, at_) w where w.quote_id = q6;
  if r.expired or not r.follow_up or not r.expiring or not r.opened or r.value <> 400 or r.days_waiting <> 14
     or r.days_left <> 5 or r.client_name <> 'Beta SA' or r.author_name <> 'Mia Member' then
    raise exception 'CHECK FAILED: Q6 %', row_to_json(r); end if;
  select * into r from sales_waiting(org_a, 7, at_) w where w.quote_id = q7;
  if r.follow_up or r.opened or r.expiring or r.client_key <> 'name:gamma ltd' or r.client_name <> 'Gamma Ltd' then
    raise exception 'CHECK FAILED: Q7 %', row_to_json(r); end if;
  -- With 3 days, Q7 (sent exactly 3 days ago) needs a follow-up too
  if not (select w.follow_up from sales_waiting(org_a, 3, at_) w where w.quote_id = q7) then
    raise exception 'CHECK FAILED: follow-up after 3 days'; end if;
  begin perform * from sales_waiting(org_a, 0, at_); raise exception 'CHECK FAILED: 0 days accepted';
  exception when invalid_parameter_value then null; end;

  -- ── Win rate (decided 1 Sep – 1 Nov) ───────────────────────────────────────
  -- Decided: Q1 accepted 900, Q2 declined 500, Q3 accepted 300, Q4 declined 200 (Q5 expired, Q6 and
  -- Q7 waiting, Q8 draft, Other Co's quote: never). By count 2 / 4 = 0.5; by value 1200 / 1900 =
  -- 0.6316; days 4, 10, 10, 1 → median 7; average 1900 / 4 = 475; gross accepted 1000 + 300, discount 100.
  select * into r from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'total');
  if r.decided <> 4 or r.accepted <> 2 or r.declined <> 2 or r.value_accepted <> 1200 or r.value_declined <> 700
     or r.win_rate_count <> 0.5 or r.win_rate_value <> 0.6316 or r.median_days <> 7 or r.avg_value <> 475
     or r.gross_accepted <> 1300 or r.discount_accepted <> 100 then
    raise exception 'CHECK FAILED: win rate total %', row_to_json(r); end if;
  if (select count(*) from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'total')) <> 1 then
    raise exception 'CHECK FAILED: one currency, one row'; end if;
  -- Months in Lisbon: Q3 (30 Sep 23:30 UTC) counts in October
  if (select decided from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'month') w where w.group_key = '2026-09') <> 2
     or (select decided from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'month') w where w.group_key = '2026-10') <> 2 then
    raise exception 'CHECK FAILED: win rate by month in Lisbon'; end if;
  -- By client: Alpha 2 (1 won), Beta 1 (won), no client 1 (Q4)
  select * into r from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'client') w where w.group_key = cl_alpha::text;
  if r.decided <> 2 or r.win_rate_count <> 0.5 or r.group_label <> 'Alpha Lda' then raise exception 'CHECK FAILED: Alpha %', row_to_json(r); end if;
  if (select decided from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'client') w where w.group_key is null) <> 1 then
    raise exception 'CHECK FAILED: the quote with no client'; end if;
  -- By author: Mia (Q1, Q3) 1.0; Ana (Q2, Q4) 0
  if (select win_rate_count from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'author') w where w.group_key = m::text) <> 1
     or (select win_rate_count from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'author') w where w.group_key = a::text) <> 0
     or (select group_label from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'author') w where w.group_key = m::text) <> 'Mia Member' then
    raise exception 'CHECK FAILED: win rate by author'; end if;
  -- Lost reasons: price 1, other 1, none (the accepted ones) 2
  if (select declined from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'lost_reason') w where w.group_key = 'price') <> 1
     or (select declined from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'lost_reason') w where w.group_key = 'other') <> 1 then
    raise exception 'CHECK FAILED: lost reasons'; end if;
  -- Gig type: Concert (Q1) 1; a custom field of kind choice on clients: Web 2, Referral 1, none 1
  if (select decided from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'gig_type') w where w.group_key = t_concert::text) <> 1 then
    raise exception 'CHECK FAILED: by gig type'; end if;
  if (select decided from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'field:' || f_channel) w where w.group_key = 'Web') <> 2
     or (select decided from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'field:' || f_channel) w where w.group_key = 'Referral') <> 1
     or (select decided from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'field:' || f_channel) w where w.group_key is null) <> 1 then
    raise exception 'CHECK FAILED: by custom field'; end if;
  -- Every grouping adds up to the total
  foreach out in array array['"month"', '"quarter"', '"gig_type"', '"client"', '"author"', '"lost_reason"', to_jsonb('field:' || f_channel)]::jsonb[] loop
    if (select sum(w.decided) from sales_win_rate(org_a, '2026-09-01', '2026-11-01', out #>> '{}') w) <> 4
       or (select sum(w.value_accepted) from sales_win_rate(org_a, '2026-09-01', '2026-11-01', out #>> '{}') w) <> 1200 then
      raise exception 'CHECK FAILED: % does not add up', out; end if;
  end loop;
  -- A text field, another organisation's field or an unknown grouping: refused
  begin perform * from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'field:' || f_note); raise exception 'CHECK FAILED: text field accepted';
  exception when invalid_parameter_value then null; end;
  begin perform * from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'field:' || f_theirs); raise exception 'CHECK FAILED: other organisation''s field accepted';
  exception when invalid_parameter_value then null; end;
  begin perform * from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'colour'); raise exception 'CHECK FAILED: bad grouping accepted';
  exception when invalid_parameter_value then null; end;

  -- ── Clients (1 Sep – 1 Nov, today 15 Oct) ──────────────────────────────────
  -- Alpha: revenue 900 (Q1 on G1), 2 gigs in the period (G1, G2) → 450 each; quotes sent Q1, Q2, Q5 = 3;
  -- decided 2, won 1; by value 900 / 1400 = 0.6429; first 2025-05-01, last 2026-09-10, next 2026-10-20;
  -- returning, not new.
  select * into r from sales_clients(org_a, '2026-09-01', '2026-11-01', null, at_) k where k.client_key = cl_alpha::text;
  if r.revenue <> 900 or r.gigs <> 2 or r.avg_gig_value <> 450 or r.quotes <> 3 or r.decided <> 2 or r.accepted <> 1
     or r.win_rate_count <> 0.5 or r.win_rate_value <> 0.6429 or r.first_gig <> '2025-05-01' or r.last_gig <> '2026-09-10'
     or r.next_gig <> '2026-10-20' or r.is_new or not r.is_returning or r.client_id <> cl_alpha or r.client_name <> 'Alpha Lda' then
    raise exception 'CHECK FAILED: Alpha %', row_to_json(r); end if;
  -- Beta: revenue 300, 1 gig (the draft doesn't count, nor is it the next gig), quotes Q3, Q6; new
  select * into r from sales_clients(org_a, '2026-09-01', '2026-11-01', null, at_) k where k.client_key = cl_beta::text;
  if r.revenue <> 300 or r.gigs <> 1 or r.quotes <> 2 or r.win_rate_count <> 1 or r.next_gig is not null
     or r.first_gig <> '2026-10-05' or not r.is_new or r.is_returning then
    raise exception 'CHECK FAILED: Beta %', row_to_json(r); end if;
  -- Gamma, typed only: one quote, no revenue
  select * into r from sales_clients(org_a, '2026-09-01', '2026-11-01', null, at_) k where k.client_key = 'name:gamma ltd';
  if r.quotes <> 1 or r.revenue <> 0 or r.client_id is not null or r.currency <> 'EUR' then raise exception 'CHECK FAILED: Gamma %', row_to_json(r); end if;
  -- Another organisation's client never counted
  if exists (select 1 from sales_clients(org_a, '2026-09-01', '2026-11-01', null, at_) k where k.client_key = cl_other::text or k.revenue >= 9999) then
    raise exception 'CHECK FAILED: Other Co''s client counted'; end if;
  -- One client only (the Contacts card)
  if exists (select 1 from sales_clients(org_a, '2026-09-01', '2026-11-01', cl_beta, at_) k where k.client_key <> cl_beta::text)
     or (select count(*) from sales_clients(org_a, '2026-09-01', '2026-11-01', cl_beta, at_)) <> 1 then
    raise exception 'CHECK FAILED: one client'; end if;

  -- ── Tiles (15 Oct) ─────────────────────────────────────────────────────────
  -- Follow-ups: Q6 only (400). Win rate over 90 days: the four decided quotes. Top client this year:
  -- Alpha 900 of 1200 = 0.75.
  out := report_overview_k4(org_a, at_);
  if (out -> 'follow_up' ->> 'count')::int <> 1 or (out -> 'follow_up' -> 'totals' ->> 'EUR')::numeric <> 400
     or (out -> 'win_rate_90' ->> 'by_count')::numeric <> 0.5 or (out -> 'win_rate_90' ->> 'by_value')::numeric <> 0.6316
     or (out -> 'win_rate_90' ->> 'decided')::int <> 4
     or out -> 'top_client_year' ->> 'key' <> cl_alpha::text or (out -> 'top_client_year' ->> 'amount')::numeric <> 900
     or (out -> 'top_client_year' ->> 'share')::numeric <> 0.75 or out -> 'top_client_year' ->> 'name' <> 'Alpha Lda' then
    raise exception 'CHECK FAILED: tiles %', out; end if;
  reset role;

  -- ── Who may call ───────────────────────────────────────────────────────────
  -- a admin and m member: yes; v viewer, c crew on a gig, x other organisation: no
  foreach who in array array[a, m, v, c, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform * from sales_waiting(org_a, 7, at_); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: sales_waiting for % (allowed: %)', who, ok; end if;
    begin perform * from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'author'); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: sales_win_rate for % (allowed: %)', who, ok; end if;
    begin perform * from sales_clients(org_a, '2026-09-01', '2026-11-01', null, at_); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: sales_clients for % (allowed: %)', who, ok; end if;
    begin perform report_overview_k4(org_a, at_); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: report_overview_k4 for % (allowed: %)', who, ok; end if;
    begin perform * from private.sales_quotes(org_a); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: sales_quotes for % (allowed: %)', who, ok; end if;
    reset role;
  end loop;
  -- Other Co's admin sees only their own quote in their own report
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select decided from sales_win_rate(org_b, '2026-09-01', '2026-11-01', 'total')) <> 1 then
    raise exception 'CHECK FAILED: Other Co''s own win rate'; end if;
  reset role;
  -- Two-step sign-in set up but not done: refused; done: allowed
  perform set_config('request.jwt.claims', claims_s_aal1, true);
  set local role authenticated;
  begin
    perform * from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'total');
    raise exception 'CHECK FAILED: sales_win_rate without the second step';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', claims_s_aal2, true);
  set local role authenticated;
  perform * from sales_win_rate(org_a, '2026-09-01', '2026-11-01', 'total');
  perform * from sales_clients(org_a, '2026-09-01', '2026-11-01');
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform * from sales_waiting(org_a);
    raise exception 'CHECK FAILED: anonymous call';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL SALES CLIENTS CHECKS PASSED';
end $$;
