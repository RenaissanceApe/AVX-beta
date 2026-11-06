-- Checks for migration 20261224000000_repair_charges_payments.sql (step 12: repairs charged to the
-- client, payments against invoices).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL PAYMENT CHECKS PASSED"  → good
-- Who: a = admin of Pay Co, m = member, v = viewer, c = crew on the gig (not in the organisation),
-- x = admin of Other Co (another company).
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g_a uuid; item uuid; r1 uuid; r2 uuid; r3 uuid;
  i1 uuid; i2 uuid; i3 uuid; cn uuid; p1 uuid; p2 uuid; who uuid; n integer; r record; out jsonb;
  ln jsonb := '[{"id": "a", "kind": "rental", "description": "Speakers", "qty": 1, "unit_price": 100, "vat_rate": 23}]';
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'pay-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'pay-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'pay-v@avx.invalid', 'authenticated', 'authenticated'), (c, 'pay-c@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'pay-x@avx.invalid', 'authenticated', 'authenticated');

  -- ── Setup ──────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Pay Co', a) returning id into org_a;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Pay gig', 'confirmed', a, '2026-09-03', '2026-09-05') returning id into g_a;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Moving head', 80, a, 'bulk') returning id into item;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');
  insert into gig_members (gig_id, user_id, role) values (g_a, c, 'crew');
  update organisations set time_zone = 'Europe/Lisbon' where id = org_a;

  -- ── Charged repairs: billed once ───────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into repairs (item_id, quantity, gig_id, problem, cost, charge_client) values (item, 1, g_a, 'Lens cracked', 150, true) returning id into r1;
  insert into repairs (item_id, quantity, gig_id, problem, cost, charge_client) values (item, 1, g_a, 'Worn fan', 40, false) returning id into r2;
  -- The invoice link can't be given by hand
  insert into repairs (item_id, quantity, gig_id, problem, cost, charge_client) values (item, 1, g_a, 'Dented', 60, true) returning id into r3;
  insert into invoices (org_id, gig_id, client_name, lines, issue_date, due_date)
  values (org_a, g_a, 'Festival Lda', ln, '2026-09-10', '2026-10-10') returning id into i1;
  update repairs set invoice_id = i1, problem = 'Dented badly' where id = r3;
  if (select invoice_id from repairs where id = r3) is not null then raise exception 'CHECK FAILED: invoice link set by hand'; end if;

  update invoices set lines = ln || jsonb_build_array(jsonb_build_object('id', 'rep', 'kind', 'repair', 'description', 'Repair: lens',
                       'qty', 1, 'unit_price', 150, 'vat_rate', 23, 'repair_id', r1)) where id = i1;
  if (select invoice_id from repairs where id = r1) is distinct from i1 then raise exception 'CHECK FAILED: repair not linked'; end if;
  if (select lines -> 1 ->> 'kind' from invoices where id = i1) <> 'repair' then raise exception 'CHECK FAILED: repair line kind'; end if;
  -- A billed repair stays charged to the client, and its link can't be cleared by hand
  update repairs set charge_client = false, invoice_id = null where id = r1;
  select * into r from repairs where id = r1;
  if not r.charge_client or r.invoice_id is distinct from i1 then raise exception 'CHECK FAILED: billed repair changed %', row_to_json(r); end if;
  -- Not twice
  insert into invoices (org_id, gig_id, client_name, lines) values (org_a, g_a, 'Festival Lda', ln) returning id into i2;
  begin
    update invoices set lines = jsonb_build_array(jsonb_build_object('description', 'Again', 'qty', 1, 'unit_price', 150, 'vat_rate', 23, 'repair_id', r1)) where id = i2;
    raise exception 'CHECK FAILED: repair billed twice';
  exception when unique_violation then null; end;
  -- Only repairs charged to the client
  begin
    update invoices set lines = jsonb_build_array(jsonb_build_object('description', 'Fan', 'qty', 1, 'unit_price', 40, 'vat_rate', 23, 'repair_id', r2)) where id = i2;
    raise exception 'CHECK FAILED: uncharged repair billed';
  exception when invalid_parameter_value then null; end;
  -- Taking the line out frees it; removing the draft frees it too
  update invoices set lines = ln where id = i1;
  if (select invoice_id from repairs where id = r1) is not null then raise exception 'CHECK FAILED: repair not freed by the line'; end if;
  update invoices set lines = jsonb_build_array(jsonb_build_object('description', 'Lens', 'qty', 1, 'unit_price', 150, 'vat_rate', 23, 'repair_id', r1)) where id = i2;
  if (select invoice_id from repairs where id = r1) is distinct from i2 then raise exception 'CHECK FAILED: repair on the second draft'; end if;
  update invoices set removed_at = now() where id = i2;
  if (select invoice_id from repairs where id = r1) is not null then raise exception 'CHECK FAILED: repair not freed by removing'; end if;
  update invoices set lines = ln || jsonb_build_array(jsonb_build_object('id', 'rep', 'kind', 'repair', 'description', 'Repair: lens',
                       'qty', 1, 'unit_price', 150, 'vat_rate', 23, 'repair_id', r1)) where id = i1;
  if (select total from invoices where id = i1) <> 307.5 then raise exception 'CHECK FAILED: invoice total with the repair'; end if;
  reset role;

  -- ── Payments only on issued invoices ───────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into invoice_payments (org_id, invoice_id, paid_on, amount) values (org_a, i1, '2026-09-12', 10);
    raise exception 'CHECK FAILED: payment on a draft';
  exception when invalid_parameter_value then null; end;
  update invoices set status = 'sent' where id = i1;
  update invoices set status = 'issued', legal_number = 'FT 2026/30' where id = i1;
  -- Paid can't be set by hand any more
  begin
    update invoices set status = 'paid' where id = i1;
    raise exception 'CHECK FAILED: paid set by hand';
  exception when invalid_parameter_value then null; end;

  -- Partial, then the rest: paid on the last payment's date
  insert into invoice_payments (org_id, invoice_id, paid_on, amount, method, note)
  values (org_a, i1, '2026-09-20', 100, 'transfer', '  first part  ') returning id into p1;
  select * into r from invoice_payments where id = p1;
  if r.created_by <> m or r.note <> 'first part' then raise exception 'CHECK FAILED: payment row %', row_to_json(r); end if;
  if (select status from invoices where id = i1) <> 'issued' then raise exception 'CHECK FAILED: partly paid turned paid'; end if;
  begin
    insert into invoice_payments (org_id, invoice_id, paid_on, amount) values (org_a, i1, '2026-09-21', 207.51);
    raise exception 'CHECK FAILED: overpayment';
  exception when invalid_parameter_value then null; end;
  begin
    insert into invoice_payments (org_id, invoice_id, paid_on, amount) values (org_a, i1, private.org_today(org_a) + 2, 1);
    raise exception 'CHECK FAILED: payment in the future';
  exception when invalid_parameter_value then null; end;
  begin
    insert into invoice_payments (org_id, invoice_id, paid_on, amount, method) values (org_a, i1, '2026-09-21', 1, 'bitcoin');
    raise exception 'CHECK FAILED: unknown method';
  exception when check_violation then null; end;
  begin
    insert into invoice_payments (org_id, invoice_id, paid_on, amount) values (org_a, i1, '2026-09-21', 0);
    raise exception 'CHECK FAILED: zero payment';
  exception when check_violation then null; end;
  select * into r from invoice_summary(org_a, 'gig', array[g_a]);
  if r.paid <> 100 or r.outstanding <> 207.5 or r.overdue <> 207.5 or r.last_paid <> '2026-09-20' then
    raise exception 'CHECK FAILED: partial summary %', row_to_json(r);
  end if;
  insert into invoice_payments (org_id, invoice_id, paid_on, amount, method) values (org_a, i1, '2026-10-02', 207.5, 'mbway') returning id into p2;
  select * into r from invoices where id = i1;
  if r.status <> 'paid' or r.paid_on <> '2026-10-02' then raise exception 'CHECK FAILED: paid %', row_to_json(r); end if;
  -- The paid date follows the payments
  update invoices set paid_on = '2026-01-01' where id = i1;
  if (select paid_on from invoices where id = i1) <> '2026-10-02' then raise exception 'CHECK FAILED: paid date changed by hand'; end if;
  select * into r from invoice_summary(org_a, 'gig', array[g_a]);
  if r.paid <> 307.5 or r.outstanding <> 0 or r.overdue <> 0 then raise exception 'CHECK FAILED: paid summary %', row_to_json(r); end if;
  -- A payment can't be edited, only removed; removing one makes it issued again
  begin
    update invoice_payments set amount = 1 where id = p2;
    raise exception 'CHECK FAILED: payment edited';
  exception when insufficient_privilege then null; end;
  update invoice_payments set removed_at = now() where id = p2;
  select * into r from invoices where id = i1;
  if r.status <> 'issued' or r.paid_on is not null then raise exception 'CHECK FAILED: unpaid after removing %', row_to_json(r); end if;
  begin
    update invoice_payments set removed_at = null where id = p2;
    raise exception 'CHECK FAILED: removed payment brought back';
  exception when object_not_in_prerequisite_state then null; end;
  if (select removed_by from invoice_payments where id = p2) <> m then raise exception 'CHECK FAILED: removed_by'; end if;

  -- A credit note for the rest covers it
  insert into invoices (org_id, kind, credited_invoice_id, client_name, scope, lines)
  values (org_a, 'credit_note', i1, 'Festival Lda', 'credit', '[{"description": "Goodwill", "qty": 1, "unit_price": 168.70, "vat_rate": 23}]') returning id into cn;
  begin
    insert into invoice_payments (org_id, invoice_id, paid_on, amount) values (org_a, cn, '2026-10-03', 1);
    raise exception 'CHECK FAILED: payment on a credit note';
  exception when invalid_parameter_value then null; end;
  update invoices set status = 'sent' where id = cn;
  update invoices set status = 'issued', legal_number = 'NC 2026/2' where id = cn;
  -- 307.50 − 207.50 (168.70 + 23 %) = 100.00, already paid
  if (select status from invoices where id = i1) <> 'paid' then raise exception 'CHECK FAILED: credit note didn''t cover the rest'; end if;
  reset role;

  -- ── Overdue reminders skip what is covered and say what is left ────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into invoices (org_id, gig_id, client_name, lines, issue_date, due_date)
  values (org_a, g_a, 'Festival Lda', ln, '2026-09-01', '2026-09-30') returning id into i3;
  update invoices set status = 'sent' where id = i3;
  update invoices set status = 'issued', legal_number = 'FT 2026/31' where id = i3;
  insert into invoice_payments (org_id, invoice_id, paid_on, amount, method) values (org_a, i3, '2026-10-05', 23, 'multibanco');
  reset role;
  perform private.remind_overdue_invoices();
  select count(*) into n from notifications where kind = 'invoice_overdue' and details ->> 'invoice_id' = i1::text;
  if n <> 0 then raise exception 'CHECK FAILED: reminded about a paid invoice'; end if;
  if coalesce((select (details ->> 'left')::numeric from notifications
                 where kind = 'invoice_overdue' and details ->> 'invoice_id' = i3::text limit 1), 0) <> 100 then
    raise exception 'CHECK FAILED: reminder without what is left';
  end if;

  -- ── Viewers, crew and other companies see and record nothing ───────────────
  foreach who in array array[v, c, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from invoice_payments where org_id = org_a;
    if n <> 0 then raise exception 'CHECK FAILED: % sees payments', who; end if;
    begin
      insert into invoice_payments (org_id, invoice_id, paid_on, amount) values (org_a, i3, '2026-10-06', 1);
      raise exception 'CHECK FAILED: % records a payment', who;
    exception when insufficient_privilege then null; end;
    update invoice_payments set removed_at = now() where invoice_id = i3;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'CHECK FAILED: % removes a payment', who; end if;
    begin
      perform * from payments_by_month(org_a);
      raise exception 'CHECK FAILED: % reads payments by month', who;
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;
  -- Another company can't put a payment on our invoice from its own organisation
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into invoice_payments (org_id, invoice_id, paid_on, amount) values (org_b, i3, '2026-10-06', 1);
    raise exception 'CHECK FAILED: payment from another organisation';
  exception when insufficient_privilege then null; end;
  reset role;
  -- Anonymous
  set local role anon;
  begin
    perform * from invoice_payments;
    raise exception 'CHECK FAILED: anonymous reads payments';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Paid per month, export ─────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from payments_by_month(org_a, '2026-09-01', '2026-10-01');
  if r.month <> '2026-09-01' or r.amount <> 100 or r.payments <> 1 or r.currency <> 'EUR' then raise exception 'CHECK FAILED: September %', row_to_json(r); end if;
  select * into r from payments_by_month(org_a, '2026-10-01', '2026-11-01');
  if r.amount <> 23 or r.payments <> 1 then raise exception 'CHECK FAILED: October (removed payment counted?) %', row_to_json(r); end if;
  out := export_org_part(org_a, 'invoice_payments');
  if jsonb_array_length(out) <> 3 then raise exception 'CHECK FAILED: export payments (%)', jsonb_array_length(out); end if;
  out := export_org_part(org_a, 'invoices');
  if jsonb_array_length(out) < 4 then raise exception 'CHECK FAILED: older export part'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform export_org_part(org_a, 'invoice_payments');
    raise exception 'CHECK FAILED: member exports payments';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL PAYMENT CHECKS PASSED';
end $$;
