-- Checks for migrations 20270102000000 / 20270102000001 (quote bin, #124): deleting a draft puts it
-- in Recently deleted, every reader skips it, the same people as before may remove and restore it,
-- the nightly clean-up erases what has been in the bin for more than 15 days, and a sent or
-- accepted quote is cancelled instead of deleted, and a declined one can be revised and sent again.
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL QUOTE BIN CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_o uuid; g uuid; g2 uuid; q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid; v uuid; n int; ver int; x numeric;
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
  -- a's draft on the gig (100 net), with a version and a client link
  insert into quotes (org_id, title, gig_id, body, client_company) values (org_a, 'Gala sound', g, body, 'Festival Lda') returning id into q1;
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
  select count(*) into n from private.report_quote_lines where quote_id = q1;
  if n <> 1 then raise exception 'CHECK FAILED: report lines before (%)', n; end if;
  select count(*) into n from client_quote_counts(org_a);
  if n <> 1 then raise exception 'CHECK FAILED: client counts before (%)', n; end if;

  -- ── a removes q1 ──────────────────────────────────────────────────────────
  perform remove_quote(q1);
  select count(*) into n from quotes where id = q1;
  if n <> 0 then raise exception 'CHECK FAILED: a removed quote is still listed'; end if;
  select count(*) into n from private.report_quote_lines where quote_id = q1;
  if n <> 0 then raise exception 'CHECK FAILED: a removed quote is in the reports'; end if;
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

  -- Readers that don't run as the reader skip it too (gig wrap-up, shared report links, chat cards, client chat).
  -- gig_finance counts accepted quotes, so the removed quote is made accepted for this check only.
  update quotes set status = 'accepted' where id = q1;
  select revenue into x from gig_finance(org_a, null, null, g);
  if x <> 0 then raise exception 'CHECK FAILED: gig_finance as the owner counts a removed quote (%)', x; end if;
  update quotes set status = 'draft' where id = q1;
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

  -- ── Restore: a gets q1 back, with its version and link ─────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform restore_quote(q1);
  select count(*) into n from quotes where id = q1 and title = 'Gala sound';
  if n <> 1 then raise exception 'CHECK FAILED: the restored quote is not back'; end if;
  select count(*) into n from private.report_quote_lines where quote_id = q1;
  if n <> 1 then raise exception 'CHECK FAILED: report lines after restore (%)', n; end if;
  select count(*) into n from removed_quotes(org_a);
  if n <> 1 then raise exception 'CHECK FAILED: the bin after restore (%)', n; end if;
  reset role;
  select count(*) into n from private.guest_resolve(qtok);
  if n <> 1 then raise exception 'CHECK FAILED: the client link doesn''t work after restore'; end if;

  -- ── Sent and accepted quotes are cancelled, not deleted ───────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Concert', a, '2026-12-20', 'confirmed') returning id into g2;
  insert into quotes (org_id, title, gig_id, status, body) values (org_a, 'Concert sound', g2, 'accepted', body) returning id into q4;
  select revenue into x from gig_finance(org_a, null, null, g2);
  if x <> 100 then raise exception 'CHECK FAILED: gig revenue before cancelling (%)', x; end if;
  -- Deleting a sent or accepted quote is refused
  begin
    perform remove_quote(q4);
    raise exception 'CHECK FAILED: an accepted quote was deleted';
  exception when invalid_parameter_value then null;
  end;
  update quotes set status = 'sent' where id = q4;
  begin
    perform remove_quote(q4);
    raise exception 'CHECK FAILED: a sent quote was deleted';
  exception when invalid_parameter_value then null;
  end;
  -- Only cancel_quote sets "cancelled"; a draft can't be cancelled
  begin
    update quotes set status = 'cancelled' where id = q4;
    raise exception 'CHECK FAILED: cancelled set by hand';
  exception when insufficient_privilege then null;
  end;
  begin
    perform cancel_quote(q3);
    raise exception 'CHECK FAILED: a draft was cancelled';
  exception when invalid_parameter_value then null;
  end;
  update quotes set status = 'accepted' where id = q4;
  reset role;
  -- The same people as for deleting: m (not the author, not an admin) can't cancel a's quote
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform cancel_quote(q4);
    raise exception 'CHECK FAILED: a member cancelled someone else''s quote';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ver := cancel_quote(q4);
  select count(*) into n from quotes where id = q4 and status = 'cancelled' and version = ver;
  if n <> 1 then raise exception 'CHECK FAILED: cancel_quote'; end if;
  -- Nothing else changes: the gig stays, but the quote no longer counts as revenue
  select count(*) into n from gigs where id = g2 and status = 'confirmed';
  if n <> 1 then raise exception 'CHECK FAILED: cancelling changed the gig'; end if;
  select revenue into x from gig_finance(org_a, null, null, g2);
  if x <> 0 then raise exception 'CHECK FAILED: a cancelled quote counts as revenue (%)', x; end if;
  select count(*) into n from removed_quotes(org_a) where id = q4;
  if n <> 0 then raise exception 'CHECK FAILED: a cancelled quote is in the bin'; end if;
  -- A cancelled quote can still be edited, and moved back with the status menu
  update quotes set title = 'Concert sound (off)' where id = q4;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: a cancelled quote can''t be edited'; end if;
  update quotes set status = 'accepted' where id = q4;
  select revenue into x from gig_finance(org_a, null, null, g2);
  if x <> 100 then raise exception 'CHECK FAILED: revenue after moving back (%)', x; end if;
  reset role;

  -- ── Declined quotes: deleted to the bin, or revised and sent again ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into quotes (org_id, title, status, body) values (org_a, 'Turned down', 'declined', body) returning id into q5;
  select count(*) into n from quotes where id = q5 and sent_at is not null and decided_at is not null;
  if n <> 1 then raise exception 'CHECK FAILED: a declined quote has its dates'; end if;
  perform remove_quote(q5);
  select count(*) into n from removed_quotes(org_a) where id = q5;
  if n <> 1 then raise exception 'CHECK FAILED: a declined quote did not go to the bin'; end if;
  perform restore_quote(q5);
  begin
    perform revise_quote(q3);
    raise exception 'CHECK FAILED: a draft was revised';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  -- Any member who may edit it may revise it; the old decline stops counting and the dates start afresh
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ver := revise_quote(q5);
  select count(*) into n from quotes where id = q5 and status = 'draft' and version = ver and sent_at is null and decided_at is null;
  if n <> 1 then raise exception 'CHECK FAILED: revise_quote'; end if;
  update quotes set status = 'sent' where id = q5;
  select count(*) into n from quotes where id = q5 and sent_at > now() - interval '1 minute' and decided_at is null;
  if n <> 1 then raise exception 'CHECK FAILED: a revised quote sent again is waiting afresh'; end if;
  reset role;

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
     or has_function_privilege('anon', 'public.restore_quote(uuid)', 'execute')
     or has_function_privilege('anon', 'public.cancel_quote(uuid)', 'execute')
     or has_function_privilege('anon', 'public.revise_quote(uuid)', 'execute') then
    raise exception 'CHECK FAILED: signed-out visitors can use the bin';
  end if;
  if has_function_privilege('authenticated', 'private.erase_removed_quotes()', 'execute') then
    raise exception 'CHECK FAILED: signed-in users can run the clean-up';
  end if;

  raise exception 'ALL QUOTE BIN CHECKS PASSED';
end $$;
