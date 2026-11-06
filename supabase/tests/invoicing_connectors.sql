-- Checks for migration 20261223000000_invoicing_connectors.sql (invoicing program connectors, step 11b).
-- Run in the TEST project's SQL editor after invoices.sql passes. Rolls itself back; ends with
--   "ALL INVOICING CONNECTOR CHECKS PASSED"  → good
-- Who: a = admin of Link Co, m = member, v = viewer, x = admin of Other Co (another company).
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; org_b uuid; i1 uuid; who uuid; n integer; r record; out jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'ic-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'ic-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'ic-v@avx.invalid', 'authenticated', 'authenticated'), (x, 'ic-x@avx.invalid', 'authenticated', 'authenticated');

  -- ── The old names are gone, the new ones exist ─────────────────────────────
  if to_regclass('public.moloni_connections') is not null or to_regclass('public.invoicing_connections') is null then
    raise exception 'CHECK FAILED: table not renamed';
  end if;

  -- ── Setup ──────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Link Co', a) returning id into org_a;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');

  -- ── Status: manual (no row), then each program ─────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from invoicing_status(org_a);
  if n <> 0 then raise exception 'CHECK FAILED: status without a connection'; end if;
  reset role;

  -- What the Edge Function (service role) writes when an admin connects InvoiceXpress
  insert into invoicing_connections (org_id, provider, account, api_key, document_set_id, document_set_name, connected_at)
  values (org_a, 'invoicexpress', 'linkco', 'secret-key-123', 7, '2027', now());
  begin
    insert into invoicing_connections (org_id, provider) values (org_b, 'vendus');
    raise exception 'CHECK FAILED: unknown program accepted';
  exception when check_violation then null; end;

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from invoicing_status(org_a);
  if r.provider <> 'invoicexpress' or not r.connected or r.expired or not r.ready or r.account <> 'linkco' or r.document_set_name <> '2027' then
    raise exception 'CHECK FAILED: InvoiceXpress status %', row_to_json(r);
  end if;
  if row_to_json(r)::text like '%secret-key-123%' then raise exception 'CHECK FAILED: key in the status'; end if;
  reset role;

  -- Moloni: ready only with a company and series; an old sign-in is "expired"
  update invoicing_connections set provider = 'moloni', api_key = null, account = null, refresh_token = 'rt',
         refresh_expires_at = now() + interval '10 days', company_id = null, document_set_id = null where org_id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from invoicing_status(org_a);
  if r.provider <> 'moloni' or not r.connected or r.ready or r.account is not null then raise exception 'CHECK FAILED: Moloni without series %', row_to_json(r); end if;
  reset role;
  update invoicing_connections set company_id = 1, document_set_id = 2, refresh_expires_at = now() - interval '1 day' where org_id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from invoicing_status(org_a);
  if not r.expired or r.ready then raise exception 'CHECK FAILED: Moloni expired %', row_to_json(r); end if;
  reset role;

  -- TOConline: client secret stored but not yet signed in → not connected
  update invoicing_connections set provider = 'toconline', refresh_token = null, refresh_expires_at = null, company_id = null,
         document_set_id = null, account = 'client-id', api_key = 'client-secret',
         settings = '{"oauth_url": "https://app.toconline.pt/oauth", "api_url": "https://api.toconline.pt"}' where org_id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from invoicing_status(org_a);
  if r.provider <> 'toconline' or r.connected or r.ready or r.account is not null then raise exception 'CHECK FAILED: TOConline before sign-in %', row_to_json(r); end if;
  reset role;
  update invoicing_connections set refresh_token = 'rt2' where org_id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from invoicing_status(org_a);
  if not r.connected or r.expired or not r.ready then raise exception 'CHECK FAILED: TOConline signed in %', row_to_json(r); end if;
  reset role;

  -- ── Nobody in the app reads keys; viewers and other companies get no status ─
  foreach who in array array[a, m, v, x] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform * from invoicing_connections;
      raise exception 'CHECK FAILED: % reads invoicing keys', who;
    exception when insufficient_privilege then null; end;
    begin
      insert into invoicing_connections (org_id, provider) values (org_a, 'moloni');
      raise exception 'CHECK FAILED: % writes a connection', who;
    exception when insufficient_privilege then null; end;
    if who in (v, x) then
      begin
        perform * from invoicing_status(org_a);
        raise exception 'CHECK FAILED: % reads the invoicing status', who;
      exception when insufficient_privilege then null; end;
    end if;
    begin
      perform * from moloni_status(org_a);
      raise exception 'CHECK FAILED: % still runs moloni_status', who;
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;

  -- ── Invoices: the program fields are the Edge Function's ──────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into invoices (org_id, client_name, lines)
  values (org_a, 'Festival Lda', '[{"description": "Speakers", "qty": 1, "unit_price": 100, "vat_rate": 23}]') returning id into i1;
  begin
    update invoices set provider = 'moloni' where id = i1;
    raise exception 'CHECK FAILED: program set by hand';
  exception when insufficient_privilege then null; end;
  begin
    update invoices set provider_document_id = '1' where id = i1;
    raise exception 'CHECK FAILED: program id set by hand';
  exception when insufficient_privilege then null; end;
  reset role;

  -- The Edge Function marks it sent to TOConline
  update invoices set status = 'sent', provider = 'toconline', provider_document_id = '66' where id = i1;
  select * into r from invoices where id = i1;
  if r.status <> 'sent' or r.provider <> 'toconline' or r.provider_document_id <> '66' or r.sent_at is null then
    raise exception 'CHECK FAILED: sent to the program %', row_to_json(r);
  end if;
  -- Back to draft (by a member) forgets the program's draft
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update invoices set status = 'draft' where id = i1;
  reset role;
  select * into r from invoices where id = i1;
  if r.provider is not null or r.provider_document_id is not null then raise exception 'CHECK FAILED: draft keeps the program %', row_to_json(r); end if;
  -- Read back as issued
  update invoices set status = 'sent', provider = 'toconline', provider_document_id = '66' where id = i1;
  update invoices set status = 'issued', legal_number = 'FT 2027/3', pdf_url = 'https://app.toconline.pt/public-file/x' where id = i1;
  select * into r from invoices where id = i1;
  if r.status <> 'issued' or r.provider <> 'toconline' or r.legal_number <> 'FT 2027/3' then raise exception 'CHECK FAILED: issued %', row_to_json(r); end if;
  -- A new invoice can't arrive already in a program
  insert into invoices (org_id, client_name, lines, provider, provider_document_id)
  values (org_a, 'X', '[{"description": "A", "qty": 1, "unit_price": 1, "vat_rate": 23}]', 'moloni', '9') returning id into who;
  if (select provider from invoices where id = who) is not null then raise exception 'CHECK FAILED: new invoice with a program'; end if;

  -- ── Export ─────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  out := export_org_part(org_a, 'invoicing_connection');
  if jsonb_array_length(out) <> 1 or out -> 0 ->> 'program' <> 'toconline' then raise exception 'CHECK FAILED: export connection %', out; end if;
  if out::text like '%client-secret%' or out::text like '%rt2%' or out::text like '%client-id%' then raise exception 'CHECK FAILED: export has a key'; end if;
  out := export_org_part(org_a, 'invoicing_connection', 5000);
  if jsonb_array_length(out) <> 0 then raise exception 'CHECK FAILED: export connection page 2'; end if;
  out := export_org_part(org_a, 'invoices');
  if not exists (select 1 from jsonb_array_elements(out) e where e ->> 'program' = 'toconline' and e ->> 'legal_number' = 'FT 2027/3') then
    raise exception 'CHECK FAILED: export invoices program';
  end if;
  out := export_org_part(org_a, 'invoice_lines');
  if jsonb_array_length(out) <> 2 then raise exception 'CHECK FAILED: export lines (%)', jsonb_array_length(out); end if;
  out := export_org_part(org_a, 'gig_finance');
  if out is null then raise exception 'CHECK FAILED: older part'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    out := export_org_part(org_a, 'invoicing_connection');
    raise exception 'CHECK FAILED: member exports';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL INVOICING CONNECTOR CHECKS PASSED';
end $$;
