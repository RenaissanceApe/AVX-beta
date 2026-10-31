-- Checks for migration 20261206000000 (contacts: quote counts per client, counted in the database).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL CLIENT QUOTE COUNTS CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_o uuid; g1 uuid; cl uuid; cl2 uuid; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'cqc-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'cqc-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'cqc-o@avx.invalid', 'authenticated', 'authenticated');

  -- Another organisation with a quote of its own
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', o) returning id into org_o;
  insert into quotes (org_id, title, client_company) values (org_o, 'Theirs', 'Their client');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Counts Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  insert into clients (org_id, name) values (org_a, 'Festival Lda') returning id into cl;
  insert into clients (org_id, name) values (org_a, 'No quotes yet') returning id into cl2;

  -- Two quotes for the client, two typed in only (company; person), one blank, one with no client
  insert into quotes (org_id, title, client_id) values (org_a, 'Q1', cl), (org_a, 'Q2', cl);
  insert into quotes (org_id, title, client_company) values (org_a, 'Q3', 'Big Venue');
  insert into quotes (org_id, title, client_name) values (org_a, 'Q4', 'Joana Silva');
  insert into quotes (org_id, title, client_company, client_name) values (org_a, 'Q5', '   ', ' ');
  insert into quotes (org_id, title) values (org_a, 'Q6');

  select quotes into n from client_quote_counts(org_a) where client_id = cl;
  if n is distinct from 2 then raise exception 'CHECK FAILED: client count (%)', n; end if;
  select quotes into n from client_quote_counts(org_a) where client_id is null;
  if n is distinct from 2 then raise exception 'CHECK FAILED: typed-in count (%)', n; end if;
  select count(*) into n from client_quote_counts(org_a) where client_id = cl2;
  if n <> 0 then raise exception 'CHECK FAILED: a client with no quotes has a row'; end if;
  select count(*) into n from client_quote_counts(org_a);
  if n <> 2 then raise exception 'CHECK FAILED: rows (%)', n; end if;

  -- Another organisation's quotes are not counted
  select count(*) into n from client_quote_counts(org_o);
  if n <> 0 then raise exception 'CHECK FAILED: counted another organisation'; end if;
  reset role;

  -- Crew on a gig don't see quotes, so nothing is counted for them
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from client_quote_counts(org_a);
  if n <> 0 then raise exception 'CHECK FAILED: crew sees quote counts'; end if;
  reset role;

  -- Signed-out visitors can't call it
  if has_function_privilege('anon', 'public.client_quote_counts(uuid)', 'execute') then
    raise exception 'CHECK FAILED: anon can count quotes';
  end if;

  raise exception 'ALL CLIENT QUOTE COUNTS CHECKS PASSED';
end $$;
