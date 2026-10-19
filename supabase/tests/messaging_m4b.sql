-- Checks for migrations 20261105000000 + 20261105000001 (messaging M4b: clients and suppliers).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL MESSAGING M4B CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); mb uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  org_a uuid; q uuid; v uuid; sp uuid; sub uuid; qconv uuid; sconv uuid; tok text; old_tok text; j jsonb; n int; t text;
  qtok text := 'quote-link-token-for-m4b-tests-0001';
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'm4b-a@avx.invalid', 'authenticated', 'authenticated'), (mb, 'm4b-mb@avx.invalid', 'authenticated', 'authenticated'),
    (c, 'm4b-c@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('M4b Co', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, mb, 'member');
  reset role;

  -- A quote sent to a client (a share link), and a subrental with a supplier
  insert into quotes (org_id, number, title, created_by) values (org_a, 7, 'Gala dinner', a) returning id into q;
  insert into quote_versions (quote_id, org_id, version_no, snapshot, created_by) values (q, org_a, 1, '{}', a) returning id into v;
  insert into quote_shares (quote_id, org_id, version_id, token_hash, expires_at, created_by)
  values (q, org_a, v, encode(extensions.digest(qtok, 'sha256'), 'hex'), now() + interval '30 days', a);
  insert into suppliers (org_id, name, created_by) values (org_a, 'Hire Co', a) returning id into sp;
  -- The member makes the subrental (its author is whoever is signed in)
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  insert into subrentals (org_id, supplier_id, starts_at, ends_at, reference)
  values (org_a, sp, '2026-12-01', '2026-12-03', 'SR-1') returning id into sub;
  insert into subrental_lines (subrental_id, org_id, description, quantity, unit_cost, position) values (sub, org_a, 'Moving heads', 8, 20, 1);

  -- The client, with no account: reads and writes on the quote's link
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  j := guest_thread(qtok);
  if j->'about'->>'title' <> 'Gala dinner' or jsonb_array_length(j->'messages') <> 0 then raise exception 'CHECK FAILED: quote thread %', j; end if;
  perform guest_post(qtok, 'Marta (client)', 'Can we add a second screen?');
  begin
    perform guest_post(qtok, '', 'No name');
    raise exception 'CHECK FAILED: posted without a name';
  exception when invalid_parameter_value then null; end;
  if guest_thread('not-a-real-token-at-all-xxxxx') is not null then raise exception 'CHECK FAILED: unknown link opened a thread'; end if;
  -- Guests can't read the tables directly
  select count(*) into n from messages;
  if n <> 0 then raise exception 'CHECK FAILED: anon read % messages', n; end if;
  reset role;
  select id into qconv from conversations where kind = 'context' and context_type = 'quote' and context_id = q;
  select count(*) into n from messages where conversation_id = qconv and guest_name = 'Marta (client)' and author_id is null;
  if n <> 1 then raise exception 'CHECK FAILED: guest message not stored'; end if;
  select count(*) into n from notifications where user_id = a and kind = 'guest_message' and details->>'conversation_id' = qconv::text;
  if n <> 1 then raise exception 'CHECK FAILED: quote author not notified (%)', n; end if;

  -- Staff answer in the app; the client sees it with the writer's name
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if context_conversation('quote', q) <> qconv then raise exception 'CHECK FAILED: two client conversations for one quote'; end if;
  insert into messages (conversation_id, body) values (qconv, 'Yes, I''ll send a new version today.');
  reset role;
  j := guest_thread(qtok);
  if jsonb_array_length(j->'messages') <> 2 or (j->'messages'->1->>'guest')::boolean then raise exception 'CHECK FAILED: client view %', j->'messages'; end if;

  -- Crew (not in the organisation) can't open it
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from messages where conversation_id = qconv;
  if n <> 0 then raise exception 'CHECK FAILED: crew reads the client conversation'; end if;
  begin
    perform create_supplier_link(sub);
    raise exception 'CHECK FAILED: crew made a supplier link';
  exception when insufficient_privilege then null; end;
  reset role;

  -- A supplier link: the supplier sees the order (no prices) and the conversation
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  old_tok := create_supplier_link(sub);
  tok := create_supplier_link(sub);
  select count(*) into n from supplier_links where subrental_id = sub and revoked_at is null;
  if n <> 1 then raise exception 'CHECK FAILED: % working supplier links', n; end if;
  reset role;
  if guest_thread(old_tok) is not null then raise exception 'CHECK FAILED: the old supplier link still works'; end if;
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  j := guest_thread(tok);
  if j->'about'->>'reference' <> 'SR-1' or j->'about'->'lines'->0->>'quantity' <> '8' or j::text like '%unit_cost%' then
    raise exception 'CHECK FAILED: supplier view %', j->'about';
  end if;
  perform guest_post(tok, 'Rui at Hire Co', 'Confirmed for the 1st.');
  reset role;
  select id into sconv from conversations where kind = 'context' and context_type = 'supplier' and context_id = sub;
  -- The subrental's author is told (a member), not someone unrelated
  select count(*) into n from notifications where user_id = mb and kind = 'guest_message' and details->>'conversation_id' = sconv::text;
  if n <> 1 then raise exception 'CHECK FAILED: subrental author not notified'; end if;
  -- The internal team conversation stays separate from the supplier's
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if context_conversation('subrental', sub) = sconv then raise exception 'CHECK FAILED: team and supplier conversations are the same'; end if;
  -- Reading the supplier conversation clears the notification
  perform read_conversation(sconv);
  reset role;
  select count(*) into n from notifications where user_id = mb and kind = 'guest_message' and read_at is null;
  if n <> 0 then raise exception 'CHECK FAILED: notification not cleared by reading'; end if;

  -- Turning the link off stops it
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform revoke_supplier_link(sub);
  reset role;
  if guest_thread(tok) is not null then raise exception 'CHECK FAILED: revoked link still works'; end if;

  -- Rate limit: 20 guest messages an hour
  for n in 1..19 loop perform guest_post(qtok, 'Marta (client)', 'msg ' || n); end loop;
  begin
    perform guest_post(qtok, 'Marta (client)', 'one too many');
    raise exception 'CHECK FAILED: no rate limit';
  exception when program_limit_exceeded then null; end;

  -- Deleting an item, repair, subrental or quote deletes its conversations (part 1's triggers)
  select count(*) into n from pg_trigger where tgname = 'delete_context_conversations' and not tgisinternal;
  if n <> 4 then raise exception 'CHECK FAILED: % clean-up triggers (run part 1 by hand)', n; end if;

  raise exception 'ALL MESSAGING M4B CHECKS PASSED';
end $$;
