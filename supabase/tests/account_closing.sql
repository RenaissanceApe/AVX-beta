-- Checks for 20270121000000_account_closing.sql (issue #195): someone who made, asked, claimed,
-- reported or decided something in an organisation they don't solely own can close their account.
-- The row stays, its "who" column becomes empty, and a plain update still can't change who it was.
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL ACCOUNT CLOSING CHECKS PASSED"  → good
-- Each kind of row is made by its own person, so a failure names every kind that still blocks.
do $$
declare
  a uuid := gen_random_uuid();              -- the organisation's other admin, who stays
  u uuid[] := '{}';                          -- one person per kind of row; each closes their account
  k text[] := '{}'; t text[] := '{}'; c text[] := '{}'; r text[] := '{}'; w uuid[] := '{}';
  org uuid; gig uuid; item_bulk uuid; item_serial uuid; sup uuid; inv uuid;
  v_id text; v_exp text; v_who uuid; i int; n int; failed text := '';
begin
  insert into auth.users (id, email, aud, role) values (a, 'acx-admin@avx.invalid', 'authenticated', 'authenticated');
  for i in 1..35 loop
    u := u || gen_random_uuid();
    insert into auth.users (id, email, aud, role) values (u[i], 'acx-' || i || '@avx.invalid', 'authenticated', 'authenticated');
  end loop;

  -- An organisation with a gig, two stock items and a supplier, made by the admin who stays
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Acx Co', a) returning id into org;
  insert into gigs (org_id, name, created_by, start_date, status) values (org, 'Acx gig', a, '2027-03-01', 'confirmed') returning id into gig;
  reset role;
  insert into price_items (org_id, name, kind, tracking) values (org, 'Acx cable', 'rental', 'bulk') returning id into item_bulk;
  insert into price_items (org_id, name, kind, tracking) values (org, 'Acx desk', 'rental', 'serial') returning id into item_serial;
  insert into suppliers (org_id, name) values (org, 'Acx supplier') returning id into sup;
  insert into invoices (org_id, number, lines) values (org, 1, '[{"description": "Acx day", "qty": 1, "unit_price": 100, "vat_rate": 0}]')
    returning id into inv;
  update invoices set status = 'sent' where id = inv;
  update invoices set status = 'issued', legal_number = 'ACX 1' where id = inv;
  -- Everyone else is a second admin, so the organisation stays when they leave
  insert into org_members (org_id, user_id, role) select org, x, 'admin' from unnest(u) x;

  -- One row of each kind, made as that person (the triggers fill in who made it)
  i := 1;  perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into clients (org_id, name) values (org, 'Acx client') returning id::text into v_id;
  k := k || 'client'::text; t := t || 'clients'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 2;  perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into quotes (org_id, number, title) values (org, 9001, 'Acx quote') returning id::text into v_id;
  k := k || 'quote'::text; t := t || 'quotes'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 3;  perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into availability_requests (gig_id, org_id, person_id) values (gig, org, a) returning id::text into v_id;
  k := k || 'availability request'::text; t := t || 'availability_requests'::text; c := c || 'asked_by'::text; r := r || v_id; w := w || u[i];

  i := 4;  perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into crew_rates (org_id, user_id, day_rate, created_by) values (org, a, 300, u[i]) returning id::text into v_id;
  k := k || 'crew rate'::text; t := t || 'crew_rates'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 5;  perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into crew_unavailability (org_id, user_id, start_date, end_date, status, created_by, decided_by, decided_at)
    values (org, a, '2027-04-01', '2027-04-02', 'approved', u[i], u[i], now()) returning id::text into v_id;
  k := k || 'leave (made)'::text || 'leave (decided)'::text; t := t || 'crew_unavailability'::text || 'crew_unavailability'::text;
  c := c || 'created_by'::text || 'decided_by'::text; r := r || v_id || v_id; w := w || u[i] || u[i];

  i := 6;  perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into custom_fields (org_id, entity, label, kind, created_by) values (org, 'gig', 'Acx field', 'text', u[i]) returning id::text into v_id;
  k := k || 'custom field'::text; t := t || 'custom_fields'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 7;  perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into expense_categories (org_id, name, kind, created_by) values (org, 'Acx category', 'direct', u[i]) returning id::text into v_id;
  k := k || 'expense category'::text; t := t || 'expense_categories'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 8;  perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into expense_recurrences (org_id, description, amount_net, every, starts_on, next_on, created_by)
    values (org, 'Acx rent', 100, 'month', '2027-01-01', '2027-01-01', u[i]) returning id::text into v_id;
  k := k || 'recurring expense'::text; t := t || 'expense_recurrences'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 9;  perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into expenses (org_id, spent_on, description, amount_net, gig_id, status, claimed_by, created_by, decided_by, decided_at)
    values (org, '2027-02-01', 'Acx taxi', 20, gig, 'claimed', u[i], u[i], u[i], now()) returning id::text into v_id;
  v_exp := v_id;   -- a claim still waiting: it becomes a draft when its claimant leaves
  k := k || 'expense (claimed)'::text || 'expense (made)'::text || 'expense (decided)'::text;
  t := t || 'expenses'::text || 'expenses'::text || 'expenses'::text;
  c := c || 'claimed_by'::text || 'created_by'::text || 'decided_by'::text; r := r || v_id || v_id || v_id; w := w || u[i] || u[i] || u[i];

  i := 10; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into fixture_types (org_id, item_id, name) values (org, item_serial, 'Acx spot') returning id::text into v_id;
  k := k || 'fixture type'::text; t := t || 'fixture_types'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 11; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into gig_equipment (gig_id, org_id, item_id, item_name, quantity) values (gig, org, item_bulk, 'x', 2) returning id::text into v_id;
  k := k || 'planned equipment'::text; t := t || 'gig_equipment'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 12; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into gig_fixtures (gig_id, name, fixture_type, footprint) values (gig, 'Acx 1', 'Spot', 16) returning id::text into v_id;
  k := k || 'patched fixture'::text; t := t || 'gig_fixtures'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 13; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into gig_inputs (gig_id, channel, source) values (gig, 1, 'Kick') returning id::text into v_id;
  k := k || 'input'::text; t := t || 'gig_inputs'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 14; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into gig_types (org_id, name, created_by) values (org, 'Acx type', u[i]) returning id::text into v_id;
  k := k || 'gig type'::text; t := t || 'gig_types'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 15; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into gig_statuses (org_id, name, base_status, created_by) values (org, 'Acx status', 'confirmed', u[i]) returning id::text into v_id;
  k := k || 'gig status'::text; t := t || 'gig_statuses'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 16; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into gig_plot_items (gig_id, kind, x, y) values (gig, 'riser', 1, 1) returning id::text into v_id;
  k := k || 'stage plot item'::text; t := t || 'gig_plot_items'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 17; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into held_invites (org_id, email) values (org, 'acx-held@avx.invalid') returning id::text into v_id;
  k := k || 'held invite'::text; t := t || 'held_invites'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 18; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into hoist_models (org_id, brand, model, class, wll_kg) values (org, 'Acx', 'H1', 'D8', 500) returning id::text into v_id;
  k := k || 'hoist model'::text; t := t || 'hoist_models'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 19; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into invoices (org_id, number) values (org, 9002) returning id::text into v_id;
  k := k || 'invoice'::text; t := t || 'invoices'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 20; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into invoice_payments (org_id, invoice_id, paid_on, amount) values (org, inv, current_date, 10) returning id::text into v_id;
  k := k || 'invoice payment'::text; t := t || 'invoice_payments'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 21; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into org_holidays (org_id, day, name, created_by) values (org, '2027-12-25', 'Acx day', u[i]) returning id::text into v_id;
  k := k || 'holiday'::text; t := t || 'org_holidays'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 22; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into repairs (org_id, item_id, problem) values (org, item_bulk, 'Acx broken') returning id::text into v_id;
  k := k || 'repair'::text; t := t || 'repairs'::text; c := c || 'reported_by'::text; r := r || v_id; w := w || u[i];

  i := 23; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into stock_units (org_id, item_id, code) values (org, item_serial, 'ACX-1') returning id::text into v_id;
  k := k || 'stock unit'::text; t := t || 'stock_units'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 24; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into subrentals (org_id, supplier_id, starts_at, ends_at) values (org, sup, '2027-03-01', '2027-03-02') returning id::text into v_id;
  k := k || 'subrental'::text; t := t || 'subrentals'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 25; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into suppliers (org_id, name) values (org, 'Acx supplier 2') returning id::text into v_id;
  k := k || 'supplier'::text; t := t || 'suppliers'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 26; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into task_templates (org_id, name, created_by) values (org, 'Acx template', u[i]) returning id::text into v_id;
  k := k || 'task template'::text; t := t || 'task_templates'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 27; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into time_entries (gig_id, org_id, user_id, work_date, start_time, end_time, created_by)
    values (gig, org, a, '2027-03-01', '09:00', '17:00', u[i]) returning id::text into v_id;
  k := k || 'time entry'::text; t := t || 'time_entries'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  -- Rows without a "keep it honest" trigger on their maker, checked so they keep working
  i := 28; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into gigs (org_id, name, created_by, start_date, status) values (org, 'Acx gig 2', u[i], '2027-05-01', 'draft') returning id::text into v_id;
  k := k || 'gig'::text; t := t || 'gigs'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 29; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into price_items (org_id, name, kind, created_by) values (org, 'Acx item', 'rental', u[i]) returning id::text into v_id;
  k := k || 'item'::text; t := t || 'price_items'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  i := 30; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into tasks (org_id, title, created_by) values (org, 'Acx task', u[i]) returning id::text into v_id;
  k := k || 'task'::text; t := t || 'tasks'::text; c := c || 'created_by'::text; r := r || v_id; w := w || u[i];

  -- Rows in states whose triggers refuse other changes (marked "special": not used for the update checks)
  i := 31; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into held_invites (org_id, email) values (org, 'acx-sent@avx.invalid') returning id::text into v_id;
  update held_invites set status = 'sent' where id::text = v_id;
  k := k || 'sent invite, made (special)'::text || 'sent invite, sent (special)'::text;
  t := t || 'held_invites'::text || 'held_invites'::text; c := c || 'created_by'::text || 'sent_by'::text;
  r := r || v_id || v_id; w := w || u[i] || u[i];

  i := 32; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into invoices (org_id, number) values (org, 9003) returning id::text into v_id;
  update invoices set removed_at = now() where id::text = v_id;
  k := k || 'removed invoice, made (special)'::text || 'removed invoice, updated (special)'::text;
  t := t || 'invoices'::text || 'invoices'::text; c := c || 'created_by'::text || 'updated_by'::text;
  r := r || v_id || v_id; w := w || u[i] || u[i];

  i := 33; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into invoice_payments (org_id, invoice_id, paid_on, amount) values (org, inv, current_date, 5) returning id::text into v_id;
  update invoice_payments set removed_at = now() where id::text = v_id;
  k := k || 'removed payment, made (special)'::text || 'removed payment, removed (special)'::text;
  t := t || 'invoice_payments'::text || 'invoice_payments'::text; c := c || 'created_by'::text || 'removed_by'::text;
  r := r || v_id || v_id; w := w || u[i] || u[i];

  i := 34; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into quotes (org_id, number, title) values (org, 9002, 'Acx cancelled quote') returning id::text into v_id;
  perform set_config('avx.cancel_quote', 'on', true);
  update quotes set status = 'cancelled' where id::text = v_id;
  perform set_config('avx.cancel_quote', 'off', true);
  k := k || 'cancelled quote, made (special)'::text || 'cancelled quote, updated (special)'::text;
  t := t || 'quotes'::text || 'quotes'::text; c := c || 'created_by'::text || 'updated_by'::text;
  r := r || v_id || v_id; w := w || u[i] || u[i];

  i := 35; perform set_config('request.jwt.claims', json_build_object('sub', u[i], 'role', 'authenticated')::text, true);
  insert into repairs (org_id, item_id, problem, status) values (org, item_bulk, 'Acx done', 'done') returning id::text into v_id;
  k := k || 'closed repair (special)'::text; t := t || 'repairs'::text; c := c || 'reported_by'::text; r := r || v_id; w := w || u[i];

  -- Every row says who made it
  for i in 1..array_length(k, 1) loop
    execute format('select count(*) from public.%I where id::text = $1 and %I = $2', t[i], c[i]) into n using r[i], w[i];
    if n <> 1 then raise exception 'CHECK FAILED (setup): % does not name its person in %', k[i], c[i]; end if;
  end loop;

  -- While they're here, the admin can't change who it was with a plain update
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  for i in 1..array_length(k, 1) loop
    if t[i] in ('gigs', 'price_items', 'tasks') or k[i] like '%(special)' then continue; end if;
    begin   -- a refusal is fine too: it still can't be changed
      set local role authenticated;
      execute format('update public.%I set %I = $1 where id::text = $2', t[i], c[i]) using a, r[i];
      reset role;
    exception when others then null;
    end;
    execute format('select count(*) from public.%I where id::text = $1 and %I = $2', t[i], c[i]) into n using r[i], w[i];
    if n <> 1 then failed := failed || k[i] || ' (changed to someone else), '; end if;
    begin   -- nor clear it while the person still has an account
      set local role authenticated;
      execute format('update public.%I set %I = null where id::text = $1', t[i], c[i]) using r[i];
      reset role;
    exception when others then null;
    end;
    execute format('select count(*) from public.%I where id::text = $1 and %I = $2', t[i], c[i]) into n using r[i], w[i];
    if n <> 1 then failed := failed || k[i] || ' (cleared while they still have an account), '; end if;
  end loop;

  -- Each person closes their account
  foreach v_who in array (select array_agg(distinct x) from unnest(w) x) loop
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_who, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform delete_my_account();
      reset role;
    exception when others then
      failed := failed || (select string_agg(k[j], ' + ') from generate_subscripts(w, 1) j where w[j] = v_who)
                       || ' (could not close: ' || sqlerrm || '), ';
    end;
  end loop;
  reset role;

  -- Their rows stay, with the "who" column empty
  for i in 1..array_length(k, 1) loop
    select count(*) into n from auth.users where id = w[i];
    if n <> 0 then continue; end if;   -- already reported above
    execute format('select count(*) from public.%I where id::text = $1 and %I is null', t[i], c[i]) into n using r[i];
    if n <> 1 then failed := failed || k[i] || ' (row gone or still names someone), '; end if;
  end loop;

  -- An empty "who" can't be filled in with someone else either
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  for i in 1..array_length(k, 1) loop
    if t[i] in ('gigs', 'price_items', 'tasks') or k[i] like '%(special)' then continue; end if;
    select count(*) into n from auth.users where id = w[i];
    if n <> 0 then continue; end if;   -- already reported above
    begin   -- a refusal is fine too: it still can't be changed
      set local role authenticated;
      execute format('update public.%I set %I = $1 where id::text = $2', t[i], c[i]) using a, r[i];
      reset role;
    exception when others then null;
    end;
    execute format('select count(*) from public.%I where id::text = $1 and %I is null', t[i], c[i]) into n using r[i];
    if n <> 1 then failed := failed || k[i] || ' (filled in with someone else), '; end if;
  end loop;

  -- The waiting claim went back to finance as a draft
  select count(*) into n from expenses where id::text = v_exp and status = 'draft' and claimed_by is null;
  if n <> 1 then failed := failed || 'waiting claim (not a draft after its claimant left), '; end if;

  -- The admin who stayed is untouched
  select count(*) into n from auth.users where id = a;
  if n <> 1 then raise exception 'CHECK FAILED: the admin who stayed was removed'; end if;
  select count(*) into n from organisations where id = org;
  if n <> 1 then raise exception 'CHECK FAILED: the organisation was removed'; end if;

  if failed <> '' then raise exception 'CHECK FAILED: %', failed; end if;
  raise exception 'ALL ACCOUNT CLOSING CHECKS PASSED';
end $$;
