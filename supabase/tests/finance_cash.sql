-- Checks for migration 20261226000000_finance_cash.sql (K3, money: cash, spending and forecast).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL FINANCE CASH CHECKS PASSED"  → good
-- Who: a = admin of Cash Co, m = member, v = viewer, c = crew on a gig (not in the organisation),
-- x = admin of Other Co, s = member with two-step sign-in set up.
-- The clock is fixed with p_at at 2026-10-15 12:00 UTC (Lisbon, UTC+1 then) unless a check says so;
-- the forecast uses today's date, because quotes' decided dates are always the moment they change.
-- Every expected number is worked out by hand in the comments next to it.
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); x uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  org_a uuid; org_b uuid; cl_alpha uuid; cl_beta uuid; sup uuid; g_a uuid;
  cat_hire uuid; cat_rent uuid; cat_soft uuid; cat_meals uuid; cat_b uuid;
  i1 uuid; i2 uuid; i3 uuid; i4 uuid; i5 uuid; i6 uuid; i7 uuid; cn uuid; pr uuid; r1 uuid; r2 uuid;
  t_rent uuid; t_rev uuid;
  at_ timestamptz := '2026-10-15 12:00+00';
  today date; gq1 uuid; gq2 uuid; gq3 uuid; gq4 uuid;
  r record; ok boolean; who uuid; n integer; out jsonb; got numeric; key text; tot numeric;
  claims_s_aal1 text; claims_s_aal2 text;
  ln jsonb := '[{"id": "a", "kind": "rental", "description": "Speakers", "qty": 1, "unit_price": 100, "vat_rate": 23}]';
begin
  insert into auth.users (id, email, aud, role)
  select t.i, 'fc-' || t.o || '@avx.invalid', 'authenticated', 'authenticated'
  from unnest(array[a, m, v, c, x, s]) with ordinality t(i, o);
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
  insert into organisations (name, created_by) values ('Cash Co', a) returning id into org_a;
  reset role;
  update organisations set time_zone = 'Europe/Lisbon' where id = org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer'), (org_a, s, 'member');

  -- ── Fixtures (entered as the owner) ─────────────────────────────────────────
  insert into org_finance_settings (org_id, recovers_vat) values (org_a, true)
  on conflict (org_id) do update set recovers_vat = true;
  insert into expense_categories (org_id, name, kind, vat_recoverable) values (org_a, 'Hire', 'direct', true) returning id into cat_hire;
  insert into expense_categories (org_id, name, kind, vat_recoverable) values (org_a, 'Rent', 'overhead', true) returning id into cat_rent;
  insert into expense_categories (org_id, name, kind, vat_recoverable) values (org_a, 'Software', 'overhead', true) returning id into cat_soft;
  insert into expense_categories (org_id, name, kind, vat_recoverable) values (org_a, 'Meals', 'direct', false) returning id into cat_meals;
  insert into expense_categories (org_id, name, kind, vat_recoverable) values (org_b, 'Theirs', 'overhead', true) returning id into cat_b;
  insert into clients (org_id, name) values (org_a, 'Alpha Lda') returning id into cl_alpha;
  insert into clients (org_id, name) values (org_a, 'Beta SA') returning id into cl_beta;
  insert into suppliers (org_id, name) values (org_a, 'Hire Co') returning id into sup;
  insert into gigs (org_id, name, status, created_by, start_date, end_date)
  values (org_a, 'Cash gig', 'confirmed', a, '2026-10-02', '2026-10-03') returning id into g_a;
  insert into gig_members (gig_id, user_id, role) values (g_a, c, 'crew');

  -- ── Invoices, credit note and payments (as the member) ─────────────────────
  -- Each "Speakers" line is 100 + 23 % VAT = 123
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- I1 Alpha 1230, due 31 Aug, 230 paid → 1000 left, 45 days overdue on 15 Oct (31–60)
  insert into invoices (org_id, client_id, client_name, lines, issue_date, due_date)
  values (org_a, cl_alpha, 'Alpha Lda', jsonb_set(ln, '{0,qty}', '10'), '2026-08-01', '2026-08-31') returning id into i1;
  -- I2 Alpha deposit 369, paid in full → not open
  insert into invoices (org_id, client_id, client_name, scope, deposit_pct, lines, issue_date, due_date)
  values (org_a, cl_alpha, 'Alpha Lda', 'deposit', 30, jsonb_set(ln, '{0,qty}', '3'), '2026-09-10', '2026-10-14') returning id into i2;
  -- I3 Alpha 246, due 14 Oct, credit note 123 → 123 left; overdue only once 15 Oct has begun in Lisbon
  insert into invoices (org_id, client_id, client_name, lines, issue_date, due_date)
  values (org_a, cl_alpha, 'Alpha Lda', jsonb_set(ln, '{0,qty}', '2'), '2026-09-14', '2026-10-14') returning id into i3;
  -- I4 Beta 615, due 1 Jul, unpaid (a removed payment doesn't count) → 106 days (over 90)
  insert into invoices (org_id, client_id, client_name, lines, issue_date, due_date)
  values (org_a, cl_beta, 'Beta SA', jsonb_set(ln, '{0,qty}', '5'), '2026-06-01', '2026-07-01') returning id into i4;
  -- I5 Beta 123 due 20 Nov; I6 Beta 246 due 30 Oct (within 30 days)
  insert into invoices (org_id, client_id, client_name, lines, issue_date, due_date)
  values (org_a, cl_beta, 'Beta SA', ln, '2026-10-01', '2026-11-20') returning id into i5;
  insert into invoices (org_id, client_id, client_name, lines, issue_date, due_date)
  values (org_a, cl_beta, 'Beta SA', jsonb_set(ln, '{0,qty}', '2'), '2026-10-01', '2026-10-30') returning id into i6;
  -- I7 Beta in pounds 123, due 30 Sep → kept apart
  insert into invoices (org_id, client_id, client_name, currency, lines, issue_date, due_date)
  values (org_a, cl_beta, 'Beta SA', 'GBP', ln, '2026-09-01', '2026-09-30') returning id into i7;
  -- A draft never counts
  insert into invoices (org_id, client_id, client_name, lines, issue_date, due_date)
  values (org_a, cl_beta, 'Beta SA', jsonb_set(ln, '{0,qty}', '50'), '2026-10-01', '2026-10-02');
  update invoices set status = 'sent' where id in (i1, i2, i3, i4, i5, i6, i7);
  update invoices set status = 'issued', legal_number = 'FT 2026/' || number where id in (i1, i2, i3, i4, i5, i6, i7);
  insert into invoices (org_id, kind, credited_invoice_id, client_id, client_name, lines, issue_date)
  values (org_a, 'credit_note', i3, cl_alpha, 'Alpha Lda', ln, '2026-09-30') returning id into cn;
  update invoices set status = 'sent' where id = cn;
  update invoices set status = 'issued', legal_number = 'NC 2026/1' where id = cn;
  insert into invoice_payments (org_id, invoice_id, paid_on, amount, method) values (org_a, i1, '2026-09-01', 230, 'transfer');
  insert into invoice_payments (org_id, invoice_id, paid_on, amount, method) values (org_a, i2, '2026-09-20', 369, 'mbway');
  insert into invoice_payments (org_id, invoice_id, paid_on, amount, method) values (org_a, i4, '2026-09-05', 15, 'cash') returning id into pr;
  update invoice_payments set removed_at = now() where id = pr;
  reset role;
  if (select status from invoices where id = i2) <> 'paid' or (select status from invoices where id = i1) <> 'issued' then
    raise exception 'CHECK FAILED: fixture statuses';
  end if;

  -- ── Expenses (as the owner, so dates and statuses are as written) ──────────
  insert into expenses (org_id, status, spent_on, due_on, paid_on, paid_how, supplier_id, supplier_name, description, category_id,
                        amount_net, vat_rate, vat_amount, currency, gig_id, claimed_by) values
    -- paid in September: 246
    (org_a, 'confirmed', '2026-09-10', null, '2026-09-15', 'transfer', sup, null, 'Hire-in', cat_hire, 200, 23, 46, 'EUR', null, null),
    -- unpaid, due 20 Oct: 615 (in the 14-day tile)
    (org_a, 'confirmed', '2026-10-01', '2026-10-20', null, null, null, 'Landlord', 'Rent October', cat_rent, 500, 23, 115, 'EUR', null, null),
    -- unpaid, due 30 Nov: 123
    (org_a, 'confirmed', '2026-10-31', '2026-11-30', null, null, null, null, 'Licence', cat_soft, 100, 23, 23, 'EUR', null, null),
    -- unpaid and late (due 1 Sep): 61.5, counted in October and in the tile
    (org_a, 'confirmed', '2026-08-25', '2026-09-01', null, null, null, 'Landlord', 'Rent August extra', cat_rent, 50, 23, 11.5, 'EUR', null, null),
    -- an approved claim to reimburse: 49.2 (meals: VAT is cost)
    (org_a, 'confirmed', '2026-10-02', null, null, null, null, null, 'Dinner', cat_meals, 40, 23, 9.2, 'EUR', g_a, c),
    -- a claim still waiting: never counted
    (org_a, 'claimed', '2026-10-02', null, null, null, null, null, 'Taxi', cat_meals, 30, 23, 6.9, 'EUR', g_a, c),
    -- removed: never counted
    (org_a, 'confirmed', '2026-10-05', '2026-10-06', null, null, null, null, 'Removed', cat_rent, 999, 23, 229.77, 'EUR', null, null);
  update expenses set removed_at = now() where org_id = org_a and description = 'Removed';

  -- Recurring R1: monthly from 5 Sep, 100 + 23 % = 123. 5 Sep drafted and confirmed (paid 6 Sep),
  -- 5 Oct drafted, still a draft. The counter is one behind on purpose: 5 Oct must still count once.
  insert into expense_recurrences (org_id, description, category_id, amount_net, vat_rate, every, starts_on, drafted, next_on)
  values (org_a, 'Cloud storage', cat_soft, 100, 23, 'month', '2026-09-05', 1, '2026-10-05') returning id into r1;
  insert into expenses (org_id, status, spent_on, due_on, paid_on, paid_how, description, category_id, amount_net, vat_rate, vat_amount,
                        recurrence_id, recurrence_due) values
    (org_a, 'confirmed', '2026-09-05', '2026-09-05', '2026-09-06', 'card', 'Cloud storage', cat_soft, 100, 23, 23, r1, '2026-09-05'),
    (org_a, 'draft', '2026-10-05', '2026-10-05', null, null, 'Cloud storage', cat_soft, 100, 23, 23, r1, '2026-10-05');
  -- Recurring R2: quarterly from 1 Oct, its 1 Oct draft removed → not made again, next is January
  insert into expense_recurrences (org_id, description, category_id, amount_net, vat_rate, every, starts_on, drafted, next_on)
  values (org_a, 'Insurance', cat_rent, 1000, 0, 'quarter', '2026-10-01', 1, '2027-01-01') returning id into r2;
  insert into expenses (org_id, status, spent_on, due_on, description, category_id, amount_net, vat_rate, vat_amount,
                        recurrence_id, recurrence_due, removed_at)
  values (org_a, 'draft', '2026-10-01', '2026-10-01', 'Insurance', cat_rent, 1000, 0, 0, r2, '2026-10-01', now());
  -- A removed recurring cost: never projected
  insert into expense_recurrences (org_id, description, amount_net, vat_rate, every, starts_on, drafted, next_on, removed_at)
  values (org_a, 'Old phone', 30, 23, 'month', '2026-09-01', 0, '2026-09-01', now());

  -- ── Cash report (as the member, 15 Oct) ────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  create temp table k3 as select * from cash_report(org_a, '2026-06-01', '2026-11-01', 3, at_);

  -- Invoiced per month, with VAT: Jun 615, Aug 1230, Sep 246 + deposit 369 (EUR) and 123 (GBP), Oct 123 + 246 = 369
  for r in select * from (values ('2026-06-01', '', 'EUR', 615), ('2026-08-01', '', 'EUR', 1230), ('2026-09-01', '', 'EUR', 246),
                                 ('2026-09-01', 'deposit', 'EUR', 369), ('2026-09-01', '', 'GBP', 123), ('2026-10-01', '', 'EUR', 369))
                         t(mo, gk, cur, amt) loop
    select k.amount into got from k3 k where k.section = 'invoiced' and k.month = r.mo::date and k.group_key = r.gk and k.currency = r.cur;
    if got is distinct from r.amt then raise exception 'CHECK FAILED: invoiced % % %: %', r.mo, r.gk, r.cur, got; end if;
  end loop;
  if (select count(*) from k3 where section = 'invoiced') <> 6 then raise exception 'CHECK FAILED: invoiced rows (a draft counted?)'; end if;
  -- Credit notes: Sep 123
  if (select sum(amount) from k3 where section = 'credited') <> 123 or (select month from k3 where section = 'credited') <> '2026-09-01' then
    raise exception 'CHECK FAILED: credited';
  end if;
  -- Received: Sep 230 + 369 = 599 (a partial payment counts; the removed 15 doesn't)
  if (select sum(amount) from k3 where section = 'received') <> 599 then
    raise exception 'CHECK FAILED: received %', (select sum(amount) from k3 where section = 'received');
  end if;
  -- Paid out: Sep 246 (hire) + 123 (recurring, paid 6 Sep) = 369
  if (select amount from k3 where section = 'paid_out' and month = '2026-09-01') <> 369
     or (select count(*) from k3 where section = 'paid_out') <> 1 then
    raise exception 'CHECK FAILED: paid out';
  end if;
  -- Overdue by age: 0–30 I3 123 (Lisbon is already on the 15th), 31–60 I1 1000, over 90 I4 615; GBP 0–30 I7 123
  for r in select * from (values ('0_30', 'EUR', 123), ('31_60', 'EUR', 1000), ('90_plus', 'EUR', 615), ('0_30', 'GBP', 123))
                         t(gk, cur, amt) loop
    select k.amount into got from k3 k where k.section = 'overdue' and k.group_key = r.gk and k.currency = r.cur;
    if got is distinct from r.amt then raise exception 'CHECK FAILED: overdue % %: %', r.gk, r.cur, got; end if;
  end loop;
  if exists (select 1 from k3 where section = 'overdue' and group_key = '61_90') then raise exception 'CHECK FAILED: 61–90 not empty'; end if;
  -- Expected in: Oct overdue 1000 + 123 + 615 = 1738, Oct due 246 (I6), Nov due 123 (I5); GBP Oct overdue 123
  for r in select * from (values ('2026-10-01', 'overdue', 'EUR', 1738), ('2026-10-01', 'due', 'EUR', 246),
                                 ('2026-11-01', 'due', 'EUR', 123), ('2026-10-01', 'overdue', 'GBP', 123))
                         t(mo, gk, cur, amt) loop
    select k.amount into got from k3 k where k.section = 'expected_in' and k.month = r.mo::date and k.group_key = r.gk and k.currency = r.cur;
    if got is distinct from r.amt then raise exception 'CHECK FAILED: expected in % % %: %', r.mo, r.gk, r.cur, got; end if;
  end loop;
  -- Expected out: Oct unpaid 615 + 61.5 = 676.5, claims 49.2, recurring 123 (the 5 Oct draft, once);
  -- Nov unpaid 123, recurring 123 (projected 5 Nov); Dec recurring 123 (5 Dec). Insurance: nothing (removed draft, next in Jan)
  for r in select * from (values ('2026-10-01', 'unpaid', 676.5), ('2026-10-01', 'claims', 49.2), ('2026-10-01', 'recurring', 123),
                                 ('2026-11-01', 'unpaid', 123), ('2026-11-01', 'recurring', 123), ('2026-12-01', 'recurring', 123))
                         t(mo, gk, amt) loop
    select k.amount into got from k3 k where k.section = 'expected_out' and k.month = r.mo::date and k.group_key = r.gk and k.currency = 'EUR';
    if got is distinct from r.amt then raise exception 'CHECK FAILED: expected out % %: %', r.mo, r.gk, got; end if;
  end loop;
  if (select count(*) from k3 where section = 'expected_out') <> 6 then raise exception 'CHECK FAILED: expected out rows'; end if;
  -- Recurring list: only Cloud storage, 123 in each of the three months
  if (select count(*) from k3 where section = 'recurring') <> 3
     or exists (select 1 from k3 where section = 'recurring' and (group_key <> r1::text or amount <> 123 or label <> 'Cloud storage')) then
    raise exception 'CHECK FAILED: recurring list';
  end if;
  -- Position: Oct 1738 + 246 − (676.5 + 49.2 + 123) = 1135.3; Nov 123 − 246 = −123; Dec −123; GBP Oct 123, Nov 0, Dec 0
  for r in select * from (values ('2026-10-01', 'EUR', 1135.3), ('2026-11-01', 'EUR', -123), ('2026-12-01', 'EUR', -123),
                                 ('2026-10-01', 'GBP', 123), ('2026-11-01', 'GBP', 0), ('2026-12-01', 'GBP', 0))
                         t(mo, cur, amt) loop
    select k.amount into got from k3 k where k.section = 'position' and k.month = r.mo::date and k.currency = r.cur;
    if got is distinct from r.amt then raise exception 'CHECK FAILED: position % %: %', r.mo, r.cur, got; end if;
  end loop;
  -- Six months ahead: the recurring cost counts once per date (Oct draft + Nov–Mar projected = 6)
  select count(*), sum(amount) into n, got from cash_report(org_a, '2026-10-01', '2026-11-01', 6, at_) where section = 'recurring';
  if n <> 6 or got <> 738 then raise exception 'CHECK FAILED: six months of recurring: % rows, %', n, got; end if;
  -- Insurance's January date shows once the window reaches it: 1000
  select sum(amount) into got from cash_report(org_a, '2026-10-01', '2026-11-01', 4, at_) where section = 'recurring' and group_key = r2::text;
  if got is distinct from 1000::numeric then raise exception 'CHECK FAILED: quarterly recurring %', got; end if;

  -- Overdue by the organisation's date: at 23:30 in Lisbon on 14 Oct (22:30 UTC) I3 isn't overdue yet;
  -- at 00:30 on the 15th (23:30 UTC on the 14th) it is, though it is still the 14th in UTC
  select coalesce(sum(amount), 0) into got from cash_report(org_a, '2026-10-01', '2026-11-01', 3, '2026-10-14 22:30+00')
   where section = 'overdue' and group_key = '0_30' and currency = 'EUR';
  if got <> 0 then raise exception 'CHECK FAILED: I3 overdue too early (%)', got; end if;
  select coalesce(sum(amount), 0) into got from cash_report(org_a, '2026-10-01', '2026-11-01', 3, '2026-10-14 23:30+00')
   where section = 'overdue' and group_key = '0_30' and currency = 'EUR';
  if got <> 123 then raise exception 'CHECK FAILED: I3 not overdue by the organisation''s date (%)', got; end if;

  -- Bad arguments
  begin
    perform * from cash_report(org_a, '2026-10-01', '2026-09-01');
    raise exception 'CHECK FAILED: bad period accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform * from cash_report(org_a, '2026-10-01', '2026-11-01', 0);
    raise exception 'CHECK FAILED: zero months accepted';
  exception when invalid_parameter_value then null; end;

  -- ── Client balance ─────────────────────────────────────────────────────────
  -- Alpha: invoiced 1230 + 369 + 246 = 1845 (deposits 369), credited 123, paid 599, balance 1123 (all overdue), oldest due 31 Aug, 2 open
  select * into r from client_balance(org_a, null, at_) b where b.client_id = cl_alpha and b.currency = 'EUR';
  if r.invoiced <> 1845 or r.deposits <> 369 or r.credited <> 123 or r.paid <> 599 or r.balance <> 1123 or r.overdue <> 1123
     or r.oldest_due <> '2026-08-31' or r.open_invoices <> 2 or r.client_name <> 'Alpha Lda' then
    raise exception 'CHECK FAILED: Alpha balance %', row_to_json(r);
  end if;
  -- Balance = invoiced − credited − paid
  if r.balance <> r.invoiced - r.credited - r.paid then raise exception 'CHECK FAILED: balance doesn''t add up'; end if;
  -- Beta EUR: 615 + 123 + 246 = 984, nothing paid, overdue 615, oldest 1 Jul, 3 open; GBP 123 apart
  select * into r from client_balance(org_a, cl_beta, at_) b where b.currency = 'EUR';
  if r.invoiced <> 984 or r.paid <> 0 or r.balance <> 984 or r.overdue <> 615 or r.oldest_due <> '2026-07-01' or r.open_invoices <> 3 then
    raise exception 'CHECK FAILED: Beta balance %', row_to_json(r);
  end if;
  select count(*) into n from client_balance(org_a, cl_beta, at_);
  if n <> 2 or (select b.balance from client_balance(org_a, cl_beta, at_) b where b.currency = 'GBP') <> 123 then
    raise exception 'CHECK FAILED: Beta in two currencies';
  end if;
  -- Same as the open invoices of the cash report
  if (select sum(balance) from client_balance(org_a, null, at_) where currency = 'EUR')
     <> (select sum(amount) from k3 where section = 'expected_in' and currency = 'EUR') then
    raise exception 'CHECK FAILED: client balances and expected in differ';
  end if;

  -- ── Spending, 1 Sep – 1 Nov ────────────────────────────────────────────────
  -- Confirmed only: hire 200 (246), recurring Sep 100 (123), rent Oct 500 (615), licence 100 (123),
  -- dinner 49.2 (VAT is cost). Cost 949.2, with VAT 1156.2, 5 expenses. Drafts, claims waiting, removed: out
  select * into r from spending(org_a, '2026-09-01', '2026-11-01', 'total');
  if r.amount <> 949.2 or r.total <> 1156.2 or r.items <> 5 then raise exception 'CHECK FAILED: spending total %', row_to_json(r); end if;
  select amount into got from spending(org_a, '2026-09-01', '2026-11-01', 'category') where group_key = cat_rent::text;
  if got <> 500 then raise exception 'CHECK FAILED: spending on rent %', got; end if;
  select amount into got from spending(org_a, '2026-09-01', '2026-11-01', 'category') where group_key = cat_soft::text;
  if got <> 200 then raise exception 'CHECK FAILED: spending on software %', got; end if;
  select amount into got from spending(org_a, '2026-09-01', '2026-11-01', 'supplier') where group_key = 'name:Landlord';
  if got <> 500 then raise exception 'CHECK FAILED: spending by typed supplier %', got; end if;
  select amount into got from spending(org_a, '2026-09-01', '2026-11-01', 'gig') where group_key = g_a::text;
  if got <> 49.2 then raise exception 'CHECK FAILED: spending by gig %', got; end if;
  -- Every grouping adds up to the total
  foreach key in array array['category', 'kind', 'supplier', 'gig', 'month'] loop
    select sum(amount) into tot from spending(org_a, '2026-09-01', '2026-11-01', key);
    if tot <> 949.2 then raise exception 'CHECK FAILED: spending by % adds up to %', key, tot; end if;
  end loop;
  begin
    perform * from spending(org_a, '2026-09-01', '2026-11-01', 'colour');
    raise exception 'CHECK FAILED: bad grouping accepted';
  exception when invalid_parameter_value then null; end;

  -- ── Budgets and targets ────────────────────────────────────────────────────
  insert into finance_targets (org_id, kind, category_id, amount) values (org_a, 'budget', cat_rent, 400) returning id into t_rent;
  insert into finance_targets (org_id, kind, amount) values (org_a, 'revenue', 1000) returning id into t_rev;
  if (select created_by from finance_targets where id = t_rent) <> m then raise exception 'CHECK FAILED: target author'; end if;
  begin
    insert into finance_targets (org_id, kind, category_id, amount) values (org_a, 'budget', cat_rent, 500);
    raise exception 'CHECK FAILED: second live budget for a category';
  exception when unique_violation then null; end;
  begin
    insert into finance_targets (org_id, kind, category_id, amount) values (org_a, 'budget', cat_b, 500);
    raise exception 'CHECK FAILED: another organisation''s category';
  exception when invalid_parameter_value then null; end;
  begin
    insert into finance_targets (org_id, kind, amount) values (org_a, 'budget', 500);
    raise exception 'CHECK FAILED: budget without a category';
  exception when check_violation then null; end;
  -- 1–16 Oct is 15 of October's 31 days: rent target 400 × 15/31 = 193.55, actual 500
  select * into r from target_progress(org_a, '2026-10-01', '2026-10-16') t where t.target_id = t_rent;
  if r.target <> 193.55 or r.actual <> 500 or r.monthly <> 400 or r.category_name <> 'Rent' then
    raise exception 'CHECK FAILED: rent budget %', row_to_json(r);
  end if;
  -- August: revenue target 1000, nothing accepted
  select * into r from target_progress(org_a, '2026-08-01', '2026-09-01') t where t.target_id = t_rev;
  if r.target <> 1000 or r.actual <> 0 then raise exception 'CHECK FAILED: revenue target %', row_to_json(r); end if;
  -- Removed by marking; then a new one may be set
  update finance_targets set removed_at = now() where id = t_rent;
  insert into finance_targets (org_id, kind, category_id, amount) values (org_a, 'budget', cat_rent, 450);
  if (select count(*) from target_progress(org_a, '2026-10-01', '2026-11-01') where kind = 'budget') <> 1 then
    raise exception 'CHECK FAILED: removed budget still shown';
  end if;
  reset role;

  -- The viewer and the other company can't read or set targets
  foreach who in array array[v, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    if exists (select 1 from finance_targets where org_id = org_a) then raise exception 'CHECK FAILED: % reads targets', who; end if;
    begin
      insert into finance_targets (org_id, kind, amount, currency) values (org_a, 'revenue', 1, 'USD');
      raise exception 'CHECK FAILED: % sets a target', who;
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;

  -- ── Overview tiles, 15 Oct ─────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := report_overview(org_a, at_);
  -- overdue now 1738 (4 invoices with GBP), cash in 30 days 246 (I6; I5 is due after 14 Nov),
  -- unpaid expenses due in 14 days 615 + 61.5 + 49.2 = 725.7 (late ones and the claim included)
  if (out -> 'overdue_now' ->> 'EUR')::numeric <> 1738 or (out -> 'overdue_now' ->> 'GBP')::numeric <> 123
     or (out ->> 'overdue_count')::integer <> 4 or (out -> 'cash_in_30' ->> 'EUR')::numeric <> 246
     or (out -> 'expenses_due_14' ->> 'EUR')::numeric <> 725.7 or not out ? 'revenue_next_3m' or not out ? 'operating_result_year' then
    raise exception 'CHECK FAILED: overview tiles %', out;
  end if;
  reset role;

  -- ── Forecast (today's date) ────────────────────────────────────────────────
  today := private.org_today(org_a);
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values
    (org_a, 'Tomorrow', 'confirmed', a, today + 1, today + 1) returning id into gq1;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values
    (org_a, 'In 40 days', 'confirmed', a, today + 40, today + 41) returning id into gq2;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values
    (org_a, 'Yesterday', 'completed', a, today - 1, today - 1) returning id into gq3;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values
    (org_a, 'Maybe', 'draft', a, today + 10, today + 10) returning id into gq4;
  insert into quotes (org_id, title, status, gig_id, issue_date, valid_until, currency, discount_pct, body) values
    (org_a, 'F1', 'accepted', gq1, today - 20, null, 'EUR', 0, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[{"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":1000}]}]}]}'),
    (org_a, 'F2', 'accepted', gq2, today - 20, null, 'EUR', 0, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[{"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":500}]}]}]}'),
    (org_a, 'F3', 'accepted', gq3, today - 20, null, 'EUR', 0, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[{"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":700}]}]}]}'),
    (org_a, 'Lost', 'declined', null, today - 20, null, 'EUR', 0, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[{"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":100}]}]}]}'),
    (org_a, 'W1', 'sent', gq4, today - 5, null, 'EUR', 0, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[{"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":300}]}]}]}'),
    (org_a, 'W2', 'sent', null, today - 30, null, 'EUR', 0, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[{"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":200}]}]}]}'),
    (org_a, 'Expired', 'sent', null, today - 30, today - 1, 'EUR', 0, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[{"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":900}]}]}]}'),
    (org_a, 'Draft', 'draft', gq1, today - 5, null, 'EUR', 0, '{"phases":[{"id":"p","sections":[{"id":"s","lines":[{"id":"l","kind":"rental","qty":1,"factor":1,"unit_price":5000}]}]}]}');
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Confirmed 1000 + 500 (yesterday's 700 is past); waiting 300 + 200 in 2 quotes (expired and draft out);
  -- win rate 3 of 4 by count, 2200 of 2300 by value — beside the waiting quotes, not multiplied in
  select sum(f.confirmed) as conf, sum(f.waiting) as wait into r from revenue_forecast(org_a, 3) f where f.currency = 'EUR';
  if r.conf <> 1500 then raise exception 'CHECK FAILED: forecast confirmed %', row_to_json(r); end if;
  if r.wait <> 500 then raise exception 'CHECK FAILED: forecast waiting %', row_to_json(r); end if;
  select max(f.win_rate_count) as wc, max(f.win_rate_value) as wv, count(*) as n, sum(f.waiting_quotes) as wq
    into r from revenue_forecast(org_a, 3) f where f.currency = 'EUR';
  if r.wc <> 0.75 or r.wv <> 0.9565 or r.n <> 3 or r.wq <> 2 then raise exception 'CHECK FAILED: forecast rate %', row_to_json(r); end if;
  -- The tile: accepted revenue from today to three months ahead
  out := report_overview(org_a);
  if (out -> 'revenue_next_3m' ->> 'EUR')::numeric <> 1500 then raise exception 'CHECK FAILED: revenue tile %', out -> 'revenue_next_3m'; end if;
  reset role;

  -- ── Who may call ───────────────────────────────────────────────────────────
  -- a admin and m member: yes; v viewer, c crew on the gig, x other organisation: no
  foreach who in array array[a, m, v, c, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform * from cash_report(org_a, '2026-10-01', '2026-11-01'); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: cash_report for % (allowed: %)', who, ok; end if;
    begin perform * from spending(org_a, '2026-10-01', '2026-11-01'); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: spending for % (allowed: %)', who, ok; end if;
    begin perform * from client_balance(org_a, cl_alpha); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: client_balance for % (allowed: %)', who, ok; end if;
    begin perform * from revenue_forecast(org_a); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: revenue_forecast for % (allowed: %)', who, ok; end if;
    begin perform * from target_progress(org_a, '2026-10-01', '2026-11-01'); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: target_progress for % (allowed: %)', who, ok; end if;
    begin perform report_overview(org_a); ok := true;
    exception when insufficient_privilege then ok := false; end;
    if ok <> (who in (a, m)) then raise exception 'CHECK FAILED: report_overview for % (allowed: %)', who, ok; end if;
    -- The helpers run as the reader: others see no invoices or recurring costs through them
    if who not in (a, m) then
      if exists (select 1 from private.open_invoices(org_a, '2026-10-15')) then raise exception 'CHECK FAILED: open_invoices for %', who; end if;
      if exists (select 1 from private.recurring_ahead(org_a, '2027-01-01')) then raise exception 'CHECK FAILED: recurring_ahead for %', who; end if;
    end if;
    reset role;
  end loop;
  -- Two-step sign-in set up but not done: refused; done: allowed
  perform set_config('request.jwt.claims', claims_s_aal1, true);
  set local role authenticated;
  begin
    perform * from cash_report(org_a, '2026-10-01', '2026-11-01');
    raise exception 'CHECK FAILED: cash_report without the second step';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', claims_s_aal2, true);
  set local role authenticated;
  perform * from cash_report(org_a, '2026-10-01', '2026-11-01');
  perform * from client_balance(org_a);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform * from client_balance(org_a, cl_alpha);
    raise exception 'CHECK FAILED: anonymous call';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL FINANCE CASH CHECKS PASSED';
end $$;
