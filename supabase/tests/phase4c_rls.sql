-- Checks for migration 20261021000000 (quote versions, share links, gig positions).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL PHASE 4C CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); o uuid := gen_random_uuid(); pm uuid := gen_random_uuid();
  org_a uuid; org_x uuid; q uuid; gig uuid; ver uuid; sh uuid; n int; vno int; forced uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'c-a@avx.invalid', 'authenticated', 'authenticated'),
    (m, 'c-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'c-v@avx.invalid', 'authenticated', 'authenticated'),
    (c, 'c-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'c-o@avx.invalid', 'authenticated', 'authenticated'),
    (pm, 'c-pm@avx.invalid', 'authenticated', 'authenticated');

  -- Outsider's own organisation (used to try forcing a version into the wrong org)
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Org', o) returning id into org_x;
  reset role;

  -- Admin sets up the org, a quote and a gig
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Versions Org', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');
  insert into quotes (org_id, title) values (org_a, 'Q') returning id into q;
  insert into gigs (org_id, name, created_by) values (org_a, 'Gig', a) returning id into gig;
  insert into gig_members (gig_id, user_id, role) values (gig, c, 'crew'), (gig, pm, 'pm');
  reset role;

  -- Member: versions are numbered by the database and always belong to the quote's org
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into quote_versions (quote_id, org_id, note, snapshot) values (q, org_a, 'first', '{"title":"Q"}') returning id, version_no into ver, vno;
  if vno <> 1 then raise exception 'CHECK FAILED: first version is %', vno; end if;
  insert into quote_versions (quote_id, org_id, version_no, note, snapshot) values (q, org_a, 99, 'second', '{"title":"Q"}') returning version_no into vno;
  if vno <> 2 then raise exception 'CHECK FAILED: version number not assigned by db (%)', vno; end if;
  begin
    insert into quote_versions (quote_id, org_id, snapshot) values (q, org_x, '{}');
    -- the trigger replaces org_x with org_a, so this succeeds but lands in org_a
  exception when insufficient_privilege then null; end;
  select count(*) into n from quote_versions where org_id = org_x;
  if n <> 0 then raise exception 'CHECK FAILED: version stored under another org'; end if;
  -- Users can't create share links themselves
  begin
    insert into quote_shares (quote_id, org_id, version_id, token_hash, expires_at)
      values (q, org_a, ver, repeat('a', 64), now() + interval '30 days');
    raise exception 'CHECK FAILED: member created a share directly';
  exception when insufficient_privilege then null; end;
  reset role;

  -- The Edge Function (service role) creates the share
  insert into quote_shares (quote_id, org_id, version_id, token_hash, expires_at, created_by)
    values (q, org_a, ver, repeat('b', 64), now() + interval '30 days', m) returning id into sh;
  begin
    insert into quote_shares (quote_id, org_id, version_id, token_hash, expires_at)
      values (q, org_a, ver, 'not-a-hash', now());
    raise exception 'CHECK FAILED: malformed token hash accepted';
  exception when check_violation then null; end;

  -- Member: sees the share, can't fake a response, can revoke
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from quote_shares where quote_id = q;
  if n <> 1 then raise exception 'CHECK FAILED: member cannot see the share'; end if;
  begin
    update quote_shares set responder_name = 'Fake' where id = sh;
    raise exception 'CHECK FAILED: member edited a response';
  exception when insufficient_privilege then null; end;
  begin
    update quote_shares set status = 'accepted' where id = sh;
    raise exception 'CHECK FAILED: member accepted on the client''s behalf';
  exception when insufficient_privilege then null; end;
  update quote_shares set status = 'revoked' where id = sh;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: member could not revoke'; end if;
  update quote_shares set status = 'revoked' where id = sh;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: revoked link updated again'; end if;
  -- A plain member is not a gig manager
  begin
    insert into gig_positions (gig_id, title, created_by) values (gig, 'Rigger', m);
    raise exception 'CHECK FAILED: member (non-manager) added a position';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Viewer: no versions, no shares
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from quote_versions where quote_id = q;
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees versions'; end if;
  select count(*) into n from quote_shares where quote_id = q;
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees shares'; end if;
  reset role;

  -- Gig PM adds positions; admin too
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_positions (gig_id, title, quantity, created_by) values (gig, 'Sound technician', 2, pm);
  begin
    insert into gig_positions (gig_id, title, quantity, created_by) values (gig, 'Too many', 100, pm);
    raise exception 'CHECK FAILED: quantity over 99 accepted';
  exception when check_violation then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_positions (gig_id, title, created_by, source_quote_id) values (gig, 'Rigger', a, q);
  reset role;

  -- Crew: sees positions, can't add or change them
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_positions where gig_id = gig;
  if n <> 2 then raise exception 'CHECK FAILED: crew sees % positions', n; end if;
  begin
    insert into gig_positions (gig_id, title, created_by) values (gig, 'Crew lead', c);
    raise exception 'CHECK FAILED: crew added a position';
  exception when insufficient_privilege then null; end;
  update gig_positions set quantity = 5 where gig_id = gig;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew changed a position'; end if;
  select count(*) into n from quote_versions where quote_id = q;
  if n <> 0 then raise exception 'CHECK FAILED: crew sees quote versions'; end if;
  reset role;

  -- Outsider: nothing
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from quote_versions where quote_id = q;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees versions'; end if;
  select count(*) into n from quote_shares where quote_id = q;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees shares'; end if;
  select count(*) into n from gig_positions where gig_id = gig;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees positions'; end if;
  reset role;

  raise exception 'ALL PHASE 4C CHECKS PASSED';
end $$;
