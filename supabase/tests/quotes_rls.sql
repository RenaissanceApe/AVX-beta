-- Access-rule test for quotes and quote templates. Run in the Supabase SQL editor
-- (test project). Like rls_smoke.sql it rolls everything back by ending with an exception:
--   "ALL QUOTE CHECKS PASSED"  → good
--   "CHECK FAILED: ..."        → a rule is broken
do $$
declare
  a uuid := gen_random_uuid();   -- org admin
  m uuid := gen_random_uuid();   -- org member
  v uuid := gen_random_uuid();   -- org viewer
  x uuid := gen_random_uuid();   -- outsider
  org_a uuid; org_x uuid; gig_x uuid; q1 uuid; q2 uuid; n int; num int; ver int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'q-a@avx.invalid', 'authenticated', 'authenticated'),
    (m, 'q-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'q-v@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'q-x@avx.invalid', 'authenticated', 'authenticated');

  -- ── Outsider has their own org and gig ──
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Org', x) returning id into org_x;
  insert into gigs (org_id, name, created_by) values (org_x, 'Other Gig', x) returning id into gig_x;
  reset role;

  -- ── Admin: creates the org, adds a member and a viewer, writes quotes ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Quote Org', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');

  insert into quotes (org_id, title, number, version) values (org_a, 'First', 999, 42) returning id, number, version into q1, num, ver;
  if num <> 1 or ver <> 1 then raise exception 'CHECK FAILED: numbering/version not set by the database (%/%)', num, ver; end if;
  insert into quotes (org_id, title) values (org_a, 'Second') returning id, number into q2, num;
  if num <> 2 then raise exception 'CHECK FAILED: second quote should be number 2 (got %)', num; end if;

  update quotes set title = 'First v2', number = 50 where id = q1 returning number, version into num, ver;
  if num <> 1 or ver <> 2 then raise exception 'CHECK FAILED: update changed the number or did not bump version'; end if;
  -- Optimistic concurrency: an update against an old version matches nothing
  update quotes set title = 'stale' where id = q1 and version = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: stale update was applied'; end if;

  begin
    update quotes set gig_id = gig_x where id = q1;
    raise exception 'CHECK FAILED: quote linked to another org''s gig';
  exception when raise_exception then
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;

  insert into quote_templates (org_id, name, created_by) values (org_a, 'Conference basic', a);
  update organisations set legal_name = 'Quote Org Lda', default_vat_rate = 23 where id = org_a;
  reset role;

  -- ── Member: full access to quotes, cannot delete someone else's quote ──
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from quotes where org_id = org_a;
  if n <> 2 then raise exception 'CHECK FAILED: member cannot see quotes'; end if;
  select count(*) into n from quote_templates where org_id = org_a;
  if n <> 1 then raise exception 'CHECK FAILED: member cannot see templates'; end if;
  update quotes set status = 'sent' where id = q2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: member cannot edit quotes'; end if;
  delete from quotes where id = q2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: member deleted the admin''s quote'; end if;
  update organisations set legal_name = 'hacked' where id = org_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: member changed company details'; end if;
  reset role;

  -- ── Viewer: no quotes at all ──
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from quotes where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: viewer can see quotes'; end if;
  select count(*) into n from quote_templates where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: viewer can see templates'; end if;
  begin
    insert into quotes (org_id, title) values (org_a, 'Viewer quote');
    raise exception 'CHECK FAILED: viewer created a quote';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Outsider: nothing ──
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from quotes where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: outsider can see quotes'; end if;
  begin
    insert into quotes (org_id, title) values (org_a, 'Intruder');
    raise exception 'CHECK FAILED: outsider created a quote';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Admin can delete ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from quotes where id = q2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: admin cannot delete a quote'; end if;
  reset role;

  raise exception 'ALL QUOTE CHECKS PASSED';
end $$;
