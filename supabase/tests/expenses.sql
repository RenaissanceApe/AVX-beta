-- Checks for migrations 20261214000000 and 20261214000001 (expenses, step 9b).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL EXPENSE CHECKS PASSED"  → good
-- Who: a = admin of Cost Co, m = member, v = viewer, c = crew on the gig (not in the organisation),
-- p = freelance PM of the gig, x = admin of Other Co (another company).
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); p uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g_a uuid; g_b uuid; sup_a uuid; sup_b uuid; cat_a uuid; cat_b uuid;
  sub_a uuid; sub_b uuid; item_a uuid; rep_a uuid; unit_a uuid; mov_a bigint;
  e1 uuid := gen_random_uuid(); e2 uuid; cl uuid := gen_random_uuid(); rec uuid;
  n integer; res text; r record; out jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'ex-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'ex-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'ex-v@avx.invalid', 'authenticated', 'authenticated'), (c, 'ex-c@avx.invalid', 'authenticated', 'authenticated'),
    (p, 'ex-p@avx.invalid', 'authenticated', 'authenticated'), (x, 'ex-x@avx.invalid', 'authenticated', 'authenticated');
  insert into profiles (id, full_name) values (c, 'Carla Crew')
    on conflict (id) do update set full_name = excluded.full_name;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Cost Co', a) returning id into org_a;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Cost gig', 'confirmed', a, '2027-03-03', '2027-03-05') returning id into g_a;
  insert into suppliers (org_id, name) values (org_a, 'Hire House') returning id into sup_a;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_b, 'Other gig', 'confirmed', x, '2027-03-02', '2027-03-02') returning id into g_b;
  insert into suppliers (org_id, name) values (org_b, 'Their supplier') returning id into sup_b;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');
  insert into gig_members (gig_id, user_id, role, function_title) values (g_a, c, 'crew', 'FOH engineer'), (g_a, p, 'pm', 'Production manager');
  -- Records to link (made as the owner)
  insert into subrentals (org_id, supplier_id, gig_id, starts_at, ends_at) values (org_a, sup_a, g_a, '2027-03-03', '2027-03-05') returning id into sub_a;
  insert into subrentals (org_id, supplier_id, starts_at, ends_at) values (org_b, sup_b, '2027-03-03', '2027-03-05') returning id into sub_b;
  insert into price_items (org_id, name, unit_price, tracking) values (org_a, 'Speaker', 1, 'bulk') returning id into item_a;
  insert into repairs (org_id, item_id, problem, gig_id) values (org_a, item_a, 'Blown driver', g_a) returning id into rep_a;
  insert into gig_crew_fees (gig_id, user_id, unit, rate, quantity) values (g_a, c, 'day', 250, 3);

  -- ── Who sees money ──────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := ensure_expense_categories(org_a);
  if n < 20 then raise exception 'CHECK FAILED: starter categories made (%)', n; end if;
  if ensure_expense_categories(org_a) <> 0 then raise exception 'CHECK FAILED: starter list made twice'; end if;
  select id into cat_a from expense_categories where org_id = org_a and starter_key = 'hire_in';
  begin
    insert into expense_categories (org_id, name, kind) values (org_a, 'Mine', 'direct');
    raise exception 'CHECK FAILED: member added a category';
  exception when insufficient_privilege then null; end;
  -- A member adds an expense; VAT amount and total are kept
  insert into expenses (id, org_id, spent_on, supplier_id, description, category_id, amount_net, vat_rate, vat_amount, invoice_number, due_on)
  values (e1, org_a, '2026-11-03', sup_a, ' Cables ', cat_a, 100, 23, 23, ' FT 2026/12 ', '2026-12-03');
  select * into r from expenses where id = e1;
  if r.status <> 'confirmed' or r.total <> 123 or r.description <> 'Cables' or r.invoice_number <> 'FT 2026/12' or r.created_by <> m then
    raise exception 'CHECK FAILED: member adds an expense %', row_to_json(r);
  end if;
  -- A receipt path must be the expense's own
  begin
    update expenses set receipt_path = org_a || '/' || gen_random_uuid() || '/r.jpg' where id = e1;
    raise exception 'CHECK FAILED: receipt of another expense';
  exception when invalid_parameter_value then null; end;
  update expenses set receipt_path = org_a || '/' || e1 || '/r.jpg', receipt_name = 'r.jpg' where id = e1;
  -- Paid needs how (unless it's a claim)
  begin
    update expenses set paid_on = '2026-11-04' where id = e1;
    raise exception 'CHECK FAILED: paid without how';
  exception when check_violation then null; end;
  update expenses set paid_on = '2026-11-04', paid_how = 'transfer' where id = e1;
  -- Status can't be set by hand
  update expenses set status = 'draft' where id = e1;
  if (select status from expenses where id = e1) <> 'confirmed' then raise exception 'CHECK FAILED: status set by hand'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from expenses where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: viewer reads expenses'; end if;
  begin
    insert into expenses (org_id, spent_on, description, amount_net) values (org_a, '2026-11-03', 'Nope', 1);
    raise exception 'CHECK FAILED: viewer adds an expense';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from expenses where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: another company reads expenses'; end if;
  begin
    perform supplier_spend(org_a);
    raise exception 'CHECK FAILED: another company reads supplier spend';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Links: another organisation's records refused ──────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into expenses (org_id, spent_on, description, amount_net, subrental_id) values (org_a, '2026-11-03', 'Theirs', 1, sub_b);
    raise exception 'CHECK FAILED: linked another organisation''s subrental';
  exception when insufficient_privilege then null; end;
  begin
    insert into expenses (org_id, spent_on, description, amount_net, gig_id) values (org_a, '2026-11-03', 'Theirs', 1, g_b);
    raise exception 'CHECK FAILED: linked another organisation''s gig';
  exception when insufficient_privilege then null; end;
  begin
    insert into expenses (org_id, spent_on, description, amount_net, supplier_id) values (org_a, '2026-11-03', 'Theirs', 1, sup_b);
    raise exception 'CHECK FAILED: another organisation''s supplier';
  exception when insufficient_privilege then null; end;
  begin
    insert into expenses (org_id, spent_on, description, amount_net, subrental_id, repair_id) values (org_a, '2026-11-03', 'Two', 1, sub_a, rep_a);
    raise exception 'CHECK FAILED: two records linked';
  exception when check_violation then null; end;
  -- A subrental fills in its gig
  insert into expenses (org_id, spent_on, description, amount_net, subrental_id) values (org_a, '2026-11-03', 'Hire-in', 400, sub_a) returning id into e2;
  if (select gig_id from expenses where id = e2) is distinct from g_a then raise exception 'CHECK FAILED: subrental gig filled in'; end if;
  -- One live expense per linked record
  begin
    insert into expenses (org_id, spent_on, description, amount_net, subrental_id) values (org_a, '2026-11-03', 'Again', 400, sub_a);
    raise exception 'CHECK FAILED: second expense for one subrental';
  exception when unique_violation then null; end;
  update expenses set removed_at = now() where id = e2;
  insert into expenses (org_id, spent_on, description, amount_net, subrental_id) values (org_a, '2026-11-03', 'Again', 410, sub_a);
  -- Crew fee and repair links
  insert into expenses (org_id, spent_on, description, amount_net, gig_id, crew_fee_user_id) values (org_a, '2027-03-06', 'Carla fee', 750, g_a, c);
  begin
    insert into expenses (org_id, spent_on, description, amount_net, gig_id, crew_fee_user_id) values (org_a, '2027-03-06', 'Twice', 750, g_a, c);
    raise exception 'CHECK FAILED: second expense for one crew fee';
  exception when unique_violation then null; end;
  begin
    insert into expenses (org_id, spent_on, description, amount_net, gig_id, crew_fee_user_id) values (org_a, '2027-03-06', 'No fee', 750, g_a, m);
    raise exception 'CHECK FAILED: linked a crew fee that doesn''t exist';
  exception when insufficient_privilege then null; end;
  insert into expenses (org_id, spent_on, description, amount_net, repair_id) values (org_a, '2026-11-03', 'Driver', 80, rep_a);
  begin
    insert into expenses (org_id, spent_on, description, amount_net, repair_id) values (org_a, '2026-11-03', 'Driver again', 80, rep_a);
    raise exception 'CHECK FAILED: second expense for one repair';
  exception when unique_violation then null; end;
  -- Admin manages categories
  insert into expense_categories (org_id, name, kind, spread_months) values (org_a, 'Trucks', 'capital', 60) returning id into cat_b;
  update expense_categories set kind = 'overhead' where id = cat_b;
  if (select spread_months from expense_categories where id = cat_b) is not null then raise exception 'CHECK FAILED: spread months kept off capital'; end if;
  reset role;

  -- ── Claims ──────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Crew can't add ledger expenses, only their own claims on a gig they're on
  begin
    insert into expenses (org_id, spent_on, description, amount_net) values (org_a, '2027-03-04', 'Ledger', 10);
    raise exception 'CHECK FAILED: crew added a ledger expense';
  exception when insufficient_privilege then null; end;
  begin
    insert into expenses (org_id, spent_on, description, amount_net, gig_id, claimed_by) values (org_b, '2027-03-02', 'Not my gig', 10, g_b, c);
    raise exception 'CHECK FAILED: claim on a gig they''re not on';
  exception when insufficient_privilege then null; end;
  insert into expenses (id, org_id, spent_on, description, amount_net, vat_rate, vat_amount, gig_id, claimed_by, paid_on)
  values (cl, org_a, '2027-03-04', 'Fuel', 40, 23, 9.2, g_a, c, '2027-03-04');
  select * into r from expenses where id = cl;
  if r.status <> 'claimed' or r.paid_on is not null then raise exception 'CHECK FAILED: claim saved as waiting, unpaid %', row_to_json(r); end if;
  select count(*) into n from expenses where org_id = org_a;
  if n <> 1 then raise exception 'CHECK FAILED: crew reads only their own claim (%)', n; end if;
  begin
    update expenses set subrental_id = sub_a where id = cl;
    raise exception 'CHECK FAILED: claim linked to a subrental';
  exception when invalid_parameter_value then null; end;
  begin
    perform decide_expense_claim(cl, true);
    raise exception 'CHECK FAILED: crew approved their own claim';
  exception when insufficient_privilege then null; end;
  reset role;
  select count(*) into n from notifications where kind = 'expense_claimed' and details->>'expense_id' = cl::text and user_id in (a, p);
  if n <> 2 then raise exception 'CHECK FAILED: approvers told of the claim (%)', n; end if;

  -- The freelance PM manages the gig: reads the claim (not the ledger), sends it back, then approves
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from expenses where org_id = org_a;
  if n <> 1 then raise exception 'CHECK FAILED: PM reads only the gig''s claims (%)', n; end if;
  begin
    perform decide_expense_claim(cl, false, '  ');
    raise exception 'CHECK FAILED: sent back without a note';
  exception when invalid_parameter_value then null; end;
  res := decide_expense_claim(cl, false, 'Receipt missing');
  if res <> 'returned' then raise exception 'CHECK FAILED: sent back (%)', res; end if;
  update expenses set amount_net = 99 where id = cl;
  if (select amount_net from expenses where id = cl) <> 40 then raise exception 'CHECK FAILED: PM edited a claim'; end if;
  reset role;
  if not exists (select 1 from notifications where user_id = c and kind = 'expense_returned' and details->>'note' = 'Receipt missing') then
    raise exception 'CHECK FAILED: claimant told it was sent back';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update expenses set receipt_path = org_a || '/' || cl || '/fuel.jpg', receipt_name = 'fuel.jpg' where id = cl;
  if (select status from expenses where id = cl) <> 'claimed' then raise exception 'CHECK FAILED: edited claim sent again'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := decide_expense_claim(cl, true);
  if res <> 'approved' or (select status from expenses where id = cl) <> 'confirmed' then raise exception 'CHECK FAILED: approved (%)', res; end if;
  if decide_expense_claim(cl, true) <> 'already' then raise exception 'CHECK FAILED: approved twice'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update expenses set amount_net = 400 where id = cl;
  if (select amount_net from expenses where id = cl) <> 40 then raise exception 'CHECK FAILED: approved claim changed by its owner'; end if;
  reset role;

  -- To reimburse: an approved claim with no paid date; the member marks it paid
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from expenses where claimed_by is not null and status = 'confirmed' and paid_on is null and removed_at is null;
  if n <> 1 then raise exception 'CHECK FAILED: one claim to reimburse (%)', n; end if;
  update expenses set paid_on = '2027-03-10' where id = cl;
  select count(*) into n from supplier_spend(org_a) where supplier_id = sup_a;
  if n <> 1 then raise exception 'CHECK FAILED: supplier spend'; end if;
  reset role;

  -- ── Recurring drafts made once ─────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into expense_recurrences (org_id, description, amount_net, vat_rate, every, starts_on)
  values (org_a, 'Warehouse rent', 1000, 23, 'month', (current_date - interval '2 months')::date - 1) returning id into rec;
  if (select next_on from expense_recurrences where id = rec) <> (current_date - interval '2 months')::date - 1 then
    raise exception 'CHECK FAILED: next date starts at the start';
  end if;
  n := draft_recurring_expenses_now(org_a);
  if (select count(*) from expenses where recurrence_id = rec) <> 3 then
    raise exception 'CHECK FAILED: three monthly drafts (% made)', (select count(*) from expenses where recurrence_id = rec);
  end if;
  if exists (select 1 from expenses where recurrence_id = rec and (status <> 'draft' or vat_amount <> 230)) then
    raise exception 'CHECK FAILED: drafts with VAT';
  end if;
  n := draft_recurring_expenses_now(org_a);
  if (select count(*) from expenses where recurrence_id = rec) <> 3 then raise exception 'CHECK FAILED: drafts made twice'; end if;
  -- Removing a draft doesn't bring it back
  update expenses set removed_at = now() where recurrence_id = rec and recurrence_due = (select min(recurrence_due) from expenses where recurrence_id = rec);
  begin
    update expense_recurrences set next_on = '2000-01-01' where id = rec;
    raise exception 'CHECK FAILED: next date moved by hand';
  exception when insufficient_privilege then null; end;
  n := draft_recurring_expenses_now(org_a);
  if (select count(*) from expenses where recurrence_id = rec) <> 3 then raise exception 'CHECK FAILED: removed draft made again'; end if;
  -- Confirm a draft
  update expenses set status = 'confirmed' where recurrence_id = rec and removed_at is null and recurrence_due = (select max(recurrence_due) from expenses where recurrence_id = rec);
  if (select count(*) from expenses where recurrence_id = rec and status = 'confirmed') <> 1 then raise exception 'CHECK FAILED: draft confirmed'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if exists (select 1 from expense_recurrences where id = rec) then raise exception 'CHECK FAILED: viewer reads recurring costs'; end if;
  begin
    perform draft_recurring_expenses_now(org_a);
    raise exception 'CHECK FAILED: viewer ran the drafts';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Export ──────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := export_org_part(org_a, 'expenses');
  if jsonb_array_length(out) <> 7 then raise exception 'CHECK FAILED: export expenses (%)', jsonb_array_length(out); end if;
  out := export_org_part(org_a, 'expense_recurrences');
  if jsonb_array_length(out) <> 1 then raise exception 'CHECK FAILED: export recurring'; end if;
  out := export_org_part(org_a, 'expense_categories');
  if jsonb_array_length(out) < 21 then raise exception 'CHECK FAILED: export categories'; end if;
  out := export_org_part(org_a, 'leave_settings');
  if out is null then raise exception 'CHECK FAILED: older part'; end if;
  reset role;

  raise exception 'ALL EXPENSE CHECKS PASSED';
end $$;
