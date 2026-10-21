-- Checks for migration 20261117000000 (switching S2: the contacts directory).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL CONTACTS CHECKS PASSED"  → good
-- Importing contacts is checked by supabase/tests/contacts_import.sql, after the hand-run file
-- 20261117000001_import_undo.sql.
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_o uuid; g1 uuid; cl uuid; other_cl uuid; q1 uuid; q2 uuid; q3 uuid; res jsonb; n int; t text;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'ct-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'ct-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'ct-o@avx.invalid', 'authenticated', 'authenticated');

  -- Another organisation with a client of its own
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', o) returning id into org_o;
  insert into clients (org_id, name) values (org_o, 'Their client') returning id into other_cl;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Contacts Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');

  -- A client: trimmed, timestamps and author set by the database
  insert into clients (org_id, name, contact_name, email, tax_id, created_by) values (org_a, '  Festival Lda  ', 'Ana', 'ana@fest.pt', 'PT 501 234 567', o) returning id into cl;
  select name into t from clients where id = cl;
  if t <> 'Festival Lda' then raise exception 'CHECK FAILED: name not trimmed (%)', t; end if;
  select count(*) into n from clients where id = cl and created_by = a;
  if n <> 1 then raise exception 'CHECK FAILED: author not set'; end if;
  begin
    insert into clients (org_id, name) values (org_a, '   ');
    raise exception 'CHECK FAILED: empty name';
  exception when check_violation then null; end;
  update clients set org_id = org_o where id = cl;
  select count(*) into n from clients where id = cl and org_id = org_a;
  if n <> 1 then raise exception 'CHECK FAILED: client moved organisation'; end if;
  -- Can't see the other organisation's clients
  select count(*) into n from clients where id = other_cl;
  if n <> 0 then raise exception 'CHECK FAILED: other org client visible'; end if;
  -- No rule allows removing a client: they're archived instead
  select count(*) into n from pg_policies where tablename = 'clients' and permissive = 'PERMISSIVE' and cmd not in ('SELECT', 'INSERT', 'UPDATE');
  if n <> 0 then raise exception 'CHECK FAILED: clients can be deleted'; end if;

  -- Suppliers have an address and a tax number now
  insert into suppliers (org_id, name, address, tax_id) values (org_a, 'Hire Co', 'Rua 1', 'PT999');
  begin
    insert into suppliers (org_id, name, tax_id) values (org_a, 'Long', repeat('9', 41));
    raise exception 'CHECK FAILED: long tax number';
  exception when check_violation then null; end;

  -- Quotes link to a client of the same organisation only
  insert into quotes (org_id, title, client_id, client_company) values (org_a, 'Q linked', cl, 'Festival Lda') returning id into q1;
  begin
    insert into quotes (org_id, title, client_id) values (org_a, 'Q wrong', other_cl);
    raise exception 'CHECK FAILED: quote linked to another org client';
  exception when insufficient_privilege or foreign_key_violation then null; end;

  -- Filling the directory from quotes: two quotes for one new company, one for an existing
  -- client (by name, any capitals), one with only a person's name, one with no client
  insert into quotes (org_id, title, client_company, client_name, client_email, client_tax_id) values (org_a, 'Q2', 'Big Venue', 'Rui', 'rui@venue.pt', 'PT1') returning id into q2;
  insert into quotes (org_id, title, client_company, client_email) values (org_a, 'Q3', ' big venue ', 'new@venue.pt') returning id into q3;
  insert into quotes (org_id, title, client_company) values (org_a, 'Q4', 'FESTIVAL LDA');
  insert into quotes (org_id, title, client_name, client_email) values (org_a, 'Q5', 'Joana Silva', 'joana@mail.pt');
  insert into quotes (org_id, title) values (org_a, 'Q6');
  res := clients_from_quotes(org_a);
  if (res ->> 'created')::int <> 2 or (res ->> 'linked')::int <> 4 then raise exception 'CHECK FAILED: from quotes %', res; end if;
  select count(*) into n from quotes where org_id = org_a and client_id = (select client_id from quotes where id = q2) and id in (q2, q3);
  if n <> 2 then raise exception 'CHECK FAILED: one company, two clients'; end if;
  select lower(c.name) into t from clients c join quotes q on q.client_id = c.id where q.id = q2;
  if t <> 'big venue' then raise exception 'CHECK FAILED: client name (%)', t; end if;
  select contact_name into t from clients where org_id = org_a and name = 'Joana Silva';
  if t is not null then raise exception 'CHECK FAILED: a person is their own contact'; end if;
  select count(*) into n from quotes where org_id = org_a and title = 'Q4' and client_id = cl;
  if n <> 1 then raise exception 'CHECK FAILED: existing client not used'; end if;
  res := clients_from_quotes(org_a);
  if (res ->> 'created')::int <> 0 or (res ->> 'linked')::int <> 0 then raise exception 'CHECK FAILED: second run %', res; end if;
  begin
    perform clients_from_quotes(org_o);
    raise exception 'CHECK FAILED: filled another org';
  exception when insufficient_privilege then null; end;

  -- Importing contacts says it isn't switched on until the hand-run file has run
  if not exists (select 1 from pg_constraint where conname = 'import_batches_kind_check' and pg_get_constraintdef(oid) like '%clients%') then
    begin
      perform run_import(org_a, 'clients', '[{"name": "X"}]');
      raise exception 'CHECK FAILED: contacts import ran before it was switched on';
    exception when feature_not_supported then null; end;
  end if;
  reset role;

  -- Crew on a gig don't see clients
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from clients where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: crew sees clients'; end if;
  begin
    insert into clients (org_id, name) values (org_a, 'Crew client');
    raise exception 'CHECK FAILED: crew added a client';
  exception when insufficient_privilege then null; end;
  begin
    perform clients_from_quotes(org_a);
    raise exception 'CHECK FAILED: crew filled clients';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL CONTACTS CHECKS PASSED';
end $$;
