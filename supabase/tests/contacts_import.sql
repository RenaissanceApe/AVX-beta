-- Checks for importing contacts (switching S2: 20261117000000_contacts.sql, switched on by the
-- hand-run 20261117000001_import_undo.sql). Run in the TEST project's SQL editor AFTER that
-- file has been run by hand. Rolls itself back; ends with
--   "ALL CONTACTS IMPORT CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); org_a uuid; res jsonb; b uuid; n int; t text; cl uuid;
begin
  insert into auth.users (id, email, aud, role) values (a, 'ci-a@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Contacts Import Co', a) returning id into org_a;
  insert into clients (org_id, name, email) values (org_a, 'Twin', 'one@twin.pt'), (org_a, 'Twin', 'two@twin.pt');

  -- Clients: two new, one bad e-mail, one without a name, and one of two "Twin"s told apart by e-mail
  res := run_import(org_a, 'clients', '[
    {"_row": 2, "name": "Festival Lda", "contact_name": "Ana", "email": "ana@fest.pt", "tax_id": "PT 501 234 567", "address": "Rua 1\n1000-001 Lisboa"},
    {"_row": 3, "name": "Joana Silva", "phone": "+351 912 345 678"},
    {"_row": 4, "name": "Bad mail", "email": "not-an-address"},
    {"_row": 5, "email": "x@y.pt"},
    {"_row": 6, "name": "twin", "email": "TWO@twin.pt", "phone": "222"}
  ]', 'clients.csv');
  b := (res ->> 'batch')::uuid;
  if (res ->> 'created')::int <> 2 or (res ->> 'updated')::int <> 1 or (res ->> 'skipped')::int <> 2 then raise exception 'CHECK FAILED: clients %', res; end if;
  if (res -> 'problems' -> 0 ->> 'message') not like 'Not an e-mail address%' then raise exception 'CHECK FAILED: problems %', res -> 'problems'; end if;
  select phone into t from clients where org_id = org_a and email = 'two@twin.pt';
  if t <> '222' then raise exception 'CHECK FAILED: wrong twin updated'; end if;
  select count(*) into n from import_batches where id = b and kind = 'clients';
  if n <> 1 then raise exception 'CHECK FAILED: batch kind'; end if;

  -- Twins without e-mail can't be told apart
  res := run_import(org_a, 'clients', '[{"name": "Twin", "phone": "333"}]');
  if (res ->> 'skipped')::int <> 1 or (res -> 'problems' -> 0 ->> 'message') not like 'Several contacts are called Twin%' then raise exception 'CHECK FAILED: twins %', res; end if;

  -- Again: the tax number written differently and a new name still match; an unchanged row stays
  res := run_import(org_a, 'clients', '[{"name": "Festival Produções Lda", "tax_id": "pt501234567"}, {"name": "JOANA SILVA", "phone": "+351 912 345 678"}]');
  if (res ->> 'updated')::int <> 1 or (res ->> 'unchanged')::int <> 1 then raise exception 'CHECK FAILED: re-import %', res; end if;
  select name into t from clients where org_id = org_a and contact_name = 'Ana';
  if t <> 'Festival Produções Lda' then raise exception 'CHECK FAILED: renamed by tax number (%)', t; end if;
  select count(*) into n from clients where org_id = org_a;
  if n <> 4 then raise exception 'CHECK FAILED: % clients', n; end if;

  -- Suppliers the same way
  res := run_import(org_a, 'suppliers', '[{"name": "Hire Co", "email": "hire@co.pt", "address": "Porto", "tax_id": "PT999"}]', 'suppliers.csv');
  if (res ->> 'created')::int <> 1 then raise exception 'CHECK FAILED: suppliers %', res; end if;
  select address into t from suppliers where org_id = org_a and name = 'Hire Co';
  if t <> 'Porto' then raise exception 'CHECK FAILED: supplier address'; end if;

  -- A preset for contacts
  insert into import_presets (org_id, kind, name, mapping) values (org_a, 'clients', 'Rentman contacts', '{"Naam": "name"}');

  -- Undo: a client now on a quote is in use, so the first import can't be undone
  select id into cl from clients where org_id = org_a and name = 'Joana Silva';
  insert into quotes (org_id, title, client_id) values (org_a, 'Q', cl);
  begin
    perform undo_import(b);
    raise exception 'CHECK FAILED: undo of clients in use';
  exception when foreign_key_violation then null; end;
  -- The suppliers import can, while no subrental uses the supplier
  res := undo_import((select id from import_batches where org_id = org_a and kind = 'suppliers'));
  if (res ->> 'removed')::int <> 1 then raise exception 'CHECK FAILED: undo suppliers %', res; end if;
  select count(*) into n from suppliers where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: supplier left'; end if;
  reset role;

  raise exception 'ALL CONTACTS IMPORT CHECKS PASSED';
end $$;
