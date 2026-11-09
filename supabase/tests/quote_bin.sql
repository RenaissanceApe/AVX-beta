-- Checks for migration 20270102000000 (quote bin, #124): removing a quote puts it in Recently
-- deleted, every reader skips it, the same people as before may remove and restore it, and the
-- nightly clean-up erases what has been in the bin for more than 15 days.
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL QUOTE BIN CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_o uuid; g uuid; q1 uuid; q2 uuid; q3 uuid; v uuid; n int; x numeric;
  qtok text := 'quotebintoken_abcdefghijklmnop';
  body jsonb := '{"phases": [{"id": "p1", "sections": [{"id": "s1", "lines": [{"id": "l1", "kind": "rental", "qty": 1, "unit_price": 100}]}]}]}';
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'qbin-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'qbin-m@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'qbin-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', o) returning id into org_o;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Bin Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gala', a, '2026-12-10', 'confirmed') returning id into g;
  -- a's accepted quote on the gig (100 net), with a version and a client link
  insert into quotes (org_id, title, gig_id, status, body, client_company) values (org_a, 'Gala sound', g, 'accepted', body, 'Festival Lda') returning id into q1;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');
  insert into quote_versions (quote_id, org_id, version_no, snapshot, created_by) values (q1, org_a, 1, '{}', a) returning id into v;
  insert into quote_shares (quote_id, org_id, version_id, token_hash, expires_at, created_by)
  values (q1, org_a, v, encode(extensions.digest(qtok, 'sha256'), 'hex'), now() + interval '30 days', a);

  -- m's own draft
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into quotes (org_id, title) values (org_a, 'Small job') returning id into q2;

  -- ── Who may remove: an admin or the quote's author (as before) ─────────────
  begin
    perform remove_quote(q1);
    raise exception 'CHECK FAILED: a member removed someone else''s quote';
  exception when insufficient_privilege then null;
  end;
  begin
    update quotes set removed_at = now() where id = q1;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'CHECK FAILED: a member set removed_at by hand'; end if;
  exception when insufficient_privilege then null;  -- the row check refuses it
  end;
  reset role;
  -- The app can no longer erase a quote directly: signed-in users keep only these rights
  if (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'quotes' and grantee = 'authenticated')
     is distinct from 'INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE' then
    raise exception 'CHECK FAILED: signed-in users'' rights on quotes';
  end if;

  -- Before: the quote counts everywhere
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from quotes where org_id = org_a;
  if n <> 2 then raise exception 'CHECK FAILED: quotes before (%)', n; end if;
  select revenue into x from gig_finance(org_a, null, null, g);
  if x <> 100 then raise exception 'CHECK FAILED: gig revenue before (%)', x; end if;
  select count(*) into n from client_quote_counts(org_a);
  if n <> 1 then raise exception 'CHECK FAILED: client counts before (%)', n; end if;

  -- ── a removes q1 ──────────────────────────────────────────────────────────
  perform remove_quote(q1);
  select count(*) into n from quotes where id = q1;
  if n <> 0 then raise exception 'CHECK FAILED: a removed quote is still listed'; end if;
  select count(*) into n from private.report_quote_lines where quote_id = q1;
  if n <> 0 then raise exception 'CHECK FAILED: a removed quote is in the reports'; end if;
  select revenue into x from gig_finance(org_a, null, null, g);
  if x <> 0 then raise exception 'CHECK FAILED: a removed quote counts as gig revenue (%)', x; end if;
  select count(*) into n from client_quote_counts(org_a);
  if n <> 0 then raise exception 'CHECK FAILED: a removed quote is counted for its client'; end if;
  -- Removing it twice is refused
  begin
    perform remove_quote(q1);
    raise exception 'CHECK FAILED: removed the same quote twice';
  exception when insufficient_privilege then null;
  end;
  -- Editing a quote in the bin isn't possible
  update quotes set title = 'Edited' where id = q1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: a quote in the bin was edited'; end if;
  reset role;

  -- Readers that don't run as the reader skip it too (gig wrap-up, shared report links, chat cards, client chat)
  select revenue into x from gig_finance(org_a, null, null, g);
  if x <> 0 then raise exception 'CHECK FAILED: gig_finance as the owner counts a removed quote (%)', x; end if;
  select count(*) into n from private.report_quote_lines where quote_id = q1;
  if n <> 0 then raise exception 'CHECK FAILED: report_quote_lines as the owner shows a removed quote'; end if;
  if private.can_see_card('quote', q1) then raise exception 'CHECK FAILED: a chat card shows a removed quote'; end if;
  select count(*) into n from private.guest_resolve(qtok);
  if n <> 0 then raise exception 'CHECK FAILED: the client link still opens a chat on a removed quote'; end if;
  -- Its versions and links are kept while it waits in the bin
  select count(*) into n from quote_versions where quote_id = q1;
  if n <> 1 then raise exception 'CHECK FAILED: versions of a removed quote went'; end if;
  select count(*) into n from quote_shares where quote_id = q1 and status = 'open';
  if n <> 1 then raise exception 'CHECK FAILED: links of a removed quote changed'; end if;

  -- ── The bin ───────────────────────────────────────────────────────────────
  -- m removes their own quote; m sees only theirs, a sees both, nobody else sees any
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform remove_quote(q2);
  select count(*) into n from removed_quotes(org_a);
  if n <> 1 then raise exception 'CHECK FAILED: the member''s bin (%)', n; end if;
  begin
    perform restore_quote(q1);
    raise exception 'CHECK FAILED: a member restored someone else''s quote';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from removed_quotes(org_a);
  if n <> 2 then raise exception 'CHECK FAILED: the admin''s bin (%)', n; end if;
  select count(*) into n from removed_quotes(org_a) where erase_at = removed_at + interval '15 days';
  if n <> 2 then raise exception 'CHECK FAILED: erase date'; end if;
  -- A new quote gets a new number, never one still in the bin
  insert into quotes (org_id, title) values (org_a, 'Next') returning id into q3;
  select count(*) into n from quotes where id = q3 and number = 3;
  if n <> 1 then raise exception 'CHECK FAILED: a new quote reused a number from the bin'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from removed_quotes(org_a);
    raise exception 'CHECK FAILED: another organisation read the bin';
  exception when insufficient_privilege then null;
  end;
  begin
    perform restore_quote(q1);
    raise exception 'CHECK FAILED: another organisation restored a quote';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- ── Restore: a gets q1 back, with its version, link and revenue ────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform restore_quote(q1);
  select count(*) into n from quotes where id = q1 and title = 'Gala sound' and status = 'accepted';
  if n <> 1 then raise exception 'CHECK FAILED: the restored quote is not back'; end if;
  select revenue into x from gig_finance(org_a, null, null, g);
  if x <> 100 then raise exception 'CHECK FAILED: gig revenue after restore (%)', x; end if;
  select count(*) into n from removed_quotes(org_a);
  if n <> 1 then raise exception 'CHECK FAILED: the bin after restore (%)', n; end if;
  reset role;
  select count(*) into n from private.guest_resolve(qtok);
  if n <> 1 then raise exception 'CHECK FAILED: the client link doesn''t work after restore'; end if;

  -- ── The nightly clean-up ──────────────────────────────────────────────────
  -- q2 has been in the bin for 16 days; q1 is removed again today and stays
  update quotes set removed_at = now() - interval '16 days' where id = q2;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform remove_quote(q1);
  reset role;
  n := private.erase_removed_quotes();
  if n < 1 then raise exception 'CHECK FAILED: the clean-up erased nothing'; end if;
  select count(*) into n from quotes where id = q2;
  if n <> 0 then raise exception 'CHECK FAILED: a quote 16 days in the bin was not erased'; end if;
  select count(*) into n from quotes where id = q1;
  if n <> 1 then raise exception 'CHECK FAILED: the clean-up erased a quote removed today'; end if;
  select count(*) into n from cron.job where jobname = 'avx-quote-bin';
  if n <> 1 then raise exception 'CHECK FAILED: the clean-up is not scheduled'; end if;

  -- ── Who may call what ─────────────────────────────────────────────────────
  if has_function_privilege('anon', 'public.removed_quotes(uuid)', 'execute')
     or has_function_privilege('anon', 'public.remove_quote(uuid)', 'execute')
     or has_function_privilege('anon', 'public.restore_quote(uuid)', 'execute') then
    raise exception 'CHECK FAILED: signed-out visitors can use the bin';
  end if;
  if has_function_privilege('authenticated', 'private.erase_removed_quotes()', 'execute') then
    raise exception 'CHECK FAILED: signed-in users can run the clean-up';
  end if;

  raise exception 'ALL QUOTE BIN CHECKS PASSED';
end $$;
