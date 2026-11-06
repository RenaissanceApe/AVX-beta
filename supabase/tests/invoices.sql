-- Checks for migration 20261222000000_invoices.sql (invoices, step 11).
-- (Updated in step 11b: moloni_status / moloni_connections became invoicing_status / invoicing_connections;
-- in step 12: paid is set by recording a payment.)
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL INVOICE CHECKS PASSED"  → good
-- Who: a = admin of Bill Co, m = member, v = viewer, c = crew on the gig (not in the organisation),
-- x = admin of Other Co (another company).
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g_a uuid; cl_a uuid; cl_b uuid; q_a uuid; q_b uuid;
  i1 uuid; i2 uuid; cn uuid; who uuid; n integer; r record; out jsonb; body jsonb; lines jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'in-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'in-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'in-v@avx.invalid', 'authenticated', 'authenticated'), (c, 'in-c@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'in-x@avx.invalid', 'authenticated', 'authenticated');

  -- ── VAT per line: old quotes get their single rate ─────────────────────────
  body := '{"phases": [{"id": "p1", "sections": [{"id": "s1", "lines": [
            {"id": "l1", "kind": "rental", "qty": 1, "unit_price": 10},
            {"id": "l2", "kind": "comment", "description": "note"},
            {"id": "l3", "kind": "crew", "qty": 1, "unit_price": 10, "vat_rate": 6}]}]}]}';
  body := private.with_line_vat(body, 23);
  if body #>> '{phases,0,sections,0,lines,0,vat_rate}' <> '23' or body #> '{phases,0,sections,0,lines,1}' ? 'vat_rate'
     or body #>> '{phases,0,sections,0,lines,2,vat_rate}' <> '6' then
    raise exception 'CHECK FAILED: with_line_vat %', body;
  end if;
  if private.with_line_vat('{"phases": "x"}', 23) <> '{"phases": "x"}'::jsonb then raise exception 'CHECK FAILED: odd body changed'; end if;

  -- ── Setup ──────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Bill Co', a) returning id into org_a;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Bill gig', 'confirmed', a, '2027-03-03', '2027-03-05') returning id into g_a;
  insert into clients (org_id, name, tax_id, address) values (org_a, 'Festival Lda', '501234567', 'Rua 1, Lisboa') returning id into cl_a;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  insert into clients (org_id, name) values (org_b, 'Their client') returning id into cl_b;
  insert into quotes (org_id, title, status) values (org_b, 'Their quote', 'accepted') returning id into q_b;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');
  insert into gig_members (gig_id, user_id, role) values (g_a, c, 'crew');
  update organisations set time_zone = 'Europe/Lisbon' where id = org_a;

  -- ── A member makes invoices ────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into quotes (org_id, title, status, gig_id, client_id) values (org_a, 'Gala', 'accepted', g_a, cl_a) returning id into q_a;
  lines := '[{"id": "a", "kind": "rental", "description": "Speakers", "qty": 2, "unit_price": 100, "discount_pct": 10, "vat_rate": 23},
             {"id": "b", "kind": "other", "description": "Catering", "qty": 1, "unit_price": 50, "vat_rate": 6},
             {"id": "c", "kind": "transport", "description": "Van", "qty": 1, "unit_price": 20, "vat_rate": 0, "vat_exemption": "M40"}]';
  -- The number can't be given
  begin
    insert into invoices (org_id, number, client_name, lines) values (org_a, 77, 'Festival Lda', lines);
    raise exception 'CHECK FAILED: number given by hand';
  exception when insufficient_privilege then null; end;
  insert into invoices (org_id, quote_id, gig_id, client_id, client_name, client_tax_id, lines, issue_date, due_date)
  values (org_a, q_a, g_a, cl_a, 'Festival Lda', '501234567', lines, '2026-10-01', '2026-10-31') returning id into i1;
  select * into r from invoices where id = i1;
  if r.number <> 1 or r.status <> 'draft' or r.created_by <> m then raise exception 'CHECK FAILED: new invoice %', row_to_json(r); end if;
  -- 180 at 23 %, 50 at 6 %, 20 at 0 %
  if r.net <> 250 or r.vat <> 44.4 or r.total <> 294.4 then raise exception 'CHECK FAILED: totals % % %', r.net, r.vat, r.total; end if;
  insert into invoices (org_id, quote_id, client_name, scope, deposit_pct, lines)
  values (org_a, q_a, 'Festival Lda', 'deposit', 30, '[{"description": "Deposit 30%", "qty": 1, "unit_price": 54, "vat_rate": 23, "kind": "deposit"}]') returning id into i2;
  if (select number from invoices where id = i2) <> 2 then raise exception 'CHECK FAILED: second number'; end if;
  -- The number, totals and Moloni's document can't be changed by hand
  begin
    update invoices set number = 9 where id = i1;
    raise exception 'CHECK FAILED: number changed';
  exception when insufficient_privilege then null; end;
  begin
    update invoices set total = 1 where id = i1;
    raise exception 'CHECK FAILED: total changed';
  exception when insufficient_privilege then null; end;
  begin
    update invoices set moloni_document_id = 1 where id = i1;
    raise exception 'CHECK FAILED: Moloni id set by hand';
  exception when insufficient_privilege then null; end;
  -- Bad lines and links
  begin
    insert into invoices (org_id, client_name, lines) values (org_a, 'X', '[{"description": "", "qty": 1, "unit_price": 1, "vat_rate": 23}]');
    raise exception 'CHECK FAILED: empty description';
  exception when invalid_parameter_value then null; end;
  begin
    insert into invoices (org_id, client_name, lines) values (org_a, 'X', '[{"description": "Refund", "qty": 1, "unit_price": -5, "vat_rate": 23}]');
    raise exception 'CHECK FAILED: negative invoice';
  exception when invalid_parameter_value then null; end;
  begin
    insert into invoices (org_id, client_id, client_name, lines) values (org_a, cl_b, 'X', '[]');
    raise exception 'CHECK FAILED: client of another organisation';
  exception when insufficient_privilege then null; end;
  begin
    insert into invoices (org_id, quote_id, client_name, lines) values (org_a, q_b, 'X', '[]');
    raise exception 'CHECK FAILED: quote of another organisation';
  exception when others then   -- the other quote is hidden, or refused
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;
  reset role;

  -- ── Viewers, crew and other companies see and do nothing ───────────────────
  foreach who in array array[v, c, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from invoices where org_id = org_a;
    if n <> 0 then raise exception 'CHECK FAILED: % sees invoices', who; end if;
    begin
      insert into invoices (org_id, client_name, lines) values (org_a, 'Sneaky', '[]');
      raise exception 'CHECK FAILED: % adds an invoice', who;
    exception when insufficient_privilege then null; end;
    update invoices set notes = 'x' where id = i1;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'CHECK FAILED: % changes an invoice', who; end if;
    begin
      perform * from invoicing_status(org_a);
      raise exception 'CHECK FAILED: % reads the invoicing status', who;
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;

  -- ── Status and locks ───────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update invoices set status = 'issued', legal_number = 'FT 1' where id = i1;
    raise exception 'CHECK FAILED: draft straight to issued';
  exception when invalid_parameter_value then null; end;
  update invoices set status = 'sent' where id = i1;
  if (select sent_at from invoices where id = i1) is null then raise exception 'CHECK FAILED: sent_at'; end if;
  begin
    update invoices set lines = '[]' where id = i1;
    raise exception 'CHECK FAILED: sent invoice changed';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    update invoices set removed_at = now() where id = i1;
    raise exception 'CHECK FAILED: sent invoice removed';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    update invoices set status = 'issued' where id = i1;
    raise exception 'CHECK FAILED: issued without a number';
  exception when invalid_parameter_value then null; end;
  update invoices set status = 'issued', legal_number = ' FT 2026/12 ', pdf_url = 'https://moloni.pt/x.pdf' where id = i1;
  select * into r from invoices where id = i1;
  if r.legal_number <> 'FT 2026/12' or r.issued_at is null or r.issue_date <> '2026-10-01' then raise exception 'CHECK FAILED: issued %', row_to_json(r); end if;
  update invoices set legal_number = 'FT 2026/99', issue_date = '2026-01-01' where id = i1;
  if (select legal_number from invoices where id = i1) <> 'FT 2026/12' or (select issue_date from invoices where id = i1) <> '2026-10-01' then
    raise exception 'CHECK FAILED: issued number changed';
  end if;
  begin
    update invoices set pdf_url = 'http://insecure' where id = i1;
    raise exception 'CHECK FAILED: http PDF link';
  exception when check_violation then null; end;
  -- Paid follows the payments (step 12): a payment of the whole amount, then removed
  insert into invoice_payments (org_id, invoice_id, paid_on, amount) values (org_a, i1, '2026-10-02', 294.4) returning id into who;
  if (select paid_on from invoices where id = i1) <> '2026-10-02' then raise exception 'CHECK FAILED: paid date'; end if;
  update invoice_payments set removed_at = now() where id = who;
  if (select paid_on from invoices where id = i1) is not null then raise exception 'CHECK FAILED: paid date kept'; end if;
  -- A draft is removed by marking it; then it's frozen
  update invoices set removed_at = now() where id = i2;
  begin
    update invoices set notes = 'back' where id = i2;
    raise exception 'CHECK FAILED: removed invoice changed';
  exception when object_not_in_prerequisite_state then null; end;

  -- ── Credit notes ───────────────────────────────────────────────────────────
  begin
    insert into invoices (org_id, kind, credited_invoice_id, client_name, scope, lines)
    values (org_a, 'credit_note', i2, 'Festival Lda', 'credit', '[{"description": "Back", "qty": 1, "unit_price": 1, "vat_rate": 23}]');
    raise exception 'CHECK FAILED: credit note on a draft';
  exception when invalid_parameter_value then null; end;
  begin
    insert into invoices (org_id, kind, credited_invoice_id, client_name, scope, lines)
    values (org_a, 'credit_note', i1, 'Festival Lda', 'credit', '[{"description": "Too much", "qty": 1, "unit_price": 300, "vat_rate": 23}]');
    raise exception 'CHECK FAILED: credit note over the invoice';
  exception when invalid_parameter_value then null; end;
  insert into invoices (org_id, kind, credited_invoice_id, quote_id, client_name, scope, currency, lines)
  values (org_a, 'credit_note', i1, q_a, 'Festival Lda', 'credit', 'USD', '[{"description": "Speaker broke", "qty": 1, "unit_price": 50, "vat_rate": 23}]') returning id into cn;
  select * into r from invoices where id = cn;
  if r.number <> 3 or r.total <> 61.5 or r.currency <> 'EUR' then raise exception 'CHECK FAILED: credit note %', row_to_json(r); end if;
  begin
    insert into invoices (org_id, kind, credited_invoice_id, client_name, scope, lines)
    values (org_a, 'credit_note', i1, 'Festival Lda', 'credit', '[{"description": "Again", "qty": 1, "unit_price": 200, "vat_rate": 23}]');
    raise exception 'CHECK FAILED: second credit note over what is left';
  exception when invalid_parameter_value then null; end;
  update invoices set status = 'sent' where id = cn;
  update invoices set status = 'issued', legal_number = 'NC 2026/1' where id = cn;
  begin
    update invoices set status = 'paid' where id = cn;
    raise exception 'CHECK FAILED: credit note paid';
  exception when invalid_parameter_value then null; end;

  -- ── Totals per quote, gig and client ───────────────────────────────────────
  select * into r from invoice_summary(org_a, 'quote', array[q_a]);
  if r.invoiced <> 294.4 or r.credited <> 61.5 or r.outstanding <> 232.9 or r.overdue <> 232.9 or r.paid <> 0
     or r.invoiced_net <> 200 or r.to_issue <> 0 or r.invoices <> 1 or r.last_issue <> '2026-10-01' then
    raise exception 'CHECK FAILED: quote summary %', row_to_json(r);
  end if;
  select count(*) into n from invoice_summary(org_a, 'gig', null);
  if n <> 1 then raise exception 'CHECK FAILED: gig summary'; end if;
  select count(*) into n from invoice_summary(org_a, 'client', array[cl_a]);
  if n <> 1 then raise exception 'CHECK FAILED: client summary'; end if;
  select count(*) into n from invoicing_status(org_a);
  if n <> 0 then raise exception 'CHECK FAILED: invoicing status without a connection'; end if;
  begin
    perform * from invoicing_connections;
    raise exception 'CHECK FAILED: member reads invoicing keys';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Overdue reminders: once, then a week later ─────────────────────────────
  n := private.remind_overdue_invoices();
  if n < 1 then raise exception 'CHECK FAILED: no overdue reminder'; end if;
  select count(*) into n from notifications where kind = 'invoice_overdue' and details ->> 'invoice_id' = i1::text;
  if n <> 2 then raise exception 'CHECK FAILED: reminded % people (admin and the quote''s author)', n; end if;
  perform private.remind_overdue_invoices();
  select count(*) into n from notifications where kind = 'invoice_overdue' and details ->> 'invoice_id' = i1::text;
  if n <> 2 then raise exception 'CHECK FAILED: reminded twice in a day'; end if;

  -- ── Export ─────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := export_org_part(org_a, 'invoices');
  if jsonb_array_length(out) <> 3 then raise exception 'CHECK FAILED: export invoices (%)', jsonb_array_length(out); end if;
  if not exists (select 1 from jsonb_array_elements(out) e where e ->> 'credits' = 'FT 2026/12' and e ->> 'kind' = 'credit_note') then
    raise exception 'CHECK FAILED: export credit note';
  end if;
  out := export_org_part(org_a, 'invoice_lines');
  if jsonb_array_length(out) <> 4 then raise exception 'CHECK FAILED: export lines (%)', jsonb_array_length(out); end if;
  out := export_org_part(org_a, 'gig_finance');
  if out is null then raise exception 'CHECK FAILED: older part'; end if;
  reset role;

  raise exception 'ALL INVOICE CHECKS PASSED';
end $$;
