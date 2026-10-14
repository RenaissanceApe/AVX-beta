-- Access-rule smoke test. Run in the Supabase SQL editor (or via the MCP execute_sql tool).
-- It creates throwaway users and data, checks who can see and do what, then ALWAYS
-- rolls everything back by ending with an exception:
--   "ALL CHECKS PASSED"  → good
--   "CHECK FAILED: ..."  → an access rule is broken
do $$
declare
  a uuid := gen_random_uuid();   -- org admin / gig creator
  b uuid := gen_random_uuid();   -- crew member added by email
  c uuid := gen_random_uuid();   -- invited before having an account
  x uuid := gen_random_uuid();   -- outsider
  org_a uuid; gig_a uuid; n int; r text;

begin
  insert into auth.users (id, email, aud, role) values
    (a, 'rls-a@avx.invalid', 'authenticated', 'authenticated'),
    (b, 'rls-b@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'rls-x@avx.invalid', 'authenticated', 'authenticated');

  -- ── A: creates org + gig, adds crew ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('RLS Org', a) returning id into org_a;
  insert into gigs (org_id, name, created_by) values (org_a, 'RLS Gig', a) returning id into gig_a;
  select count(*) into n from org_members where org_id = org_a and user_id = a and role = 'admin';
  if n <> 1 then raise exception 'CHECK FAILED: creator not made org admin'; end if;
  select count(*) into n from gig_members where gig_id = gig_a and user_id = a and role = 'pm';
  if n <> 1 then raise exception 'CHECK FAILED: creator not made gig PM'; end if;
  insert into storage.objects (bucket_id, name, owner_id) values ('gig-assets', gig_a || '/test.pdf', a::text);
  r := invite_to_gig(gig_a, 'rls-b@avx.invalid', 'crew', 'FOH', '14:00');
  if r <> 'added' then raise exception 'CHECK FAILED: existing user not added (%)', r; end if;
  r := invite_to_gig(gig_a, 'RLS-C@avx.invalid');
  if r <> 'invited' then raise exception 'CHECK FAILED: pending invite not created (%)', r; end if;
  insert into feed_posts (gig_id, user_id, content) values (gig_a, a, 'hello crew');
  reset role;

  -- ── B: crew ──
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gigs where id = gig_a;
  if n <> 1 then raise exception 'CHECK FAILED: crew cannot see their gig'; end if;
  select count(*) into n from feed_posts where gig_id = gig_a;
  if n <> 1 then raise exception 'CHECK FAILED: crew cannot see the feed'; end if;
  select count(*) into n from storage.objects where name like gig_a || '/%';
  if n <> 1 then raise exception 'CHECK FAILED: crew cannot read gig files'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('gig-assets', gig_a || '/evil.pdf');
    raise exception 'CHECK FAILED: crew could upload files';
  exception when insufficient_privilege then null; end;
  begin
    insert into org_members (org_id, user_id, role) values (org_a, b, 'admin');
    raise exception 'CHECK FAILED: crew could make themselves org admin';
  exception when insufficient_privilege then null; end;
  begin
    r := invite_to_gig(gig_a, 'someone@avx.invalid');
    raise exception 'CHECK FAILED: crew could invite people';
  exception when raise_exception then
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;
  reset role;

  -- ── X: outsider ──
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select (select count(*) from gigs where id = gig_a) + (select count(*) from organisations where id = org_a)
       + (select count(*) from feed_posts where gig_id = gig_a) + (select count(*) from storage.objects where name like gig_a || '/%')
    into n;
  if n <> 0 then raise exception 'CHECK FAILED: outsider can see % private rows', n; end if;
  begin
    insert into gig_members (gig_id, user_id) values (gig_a, x);
    raise exception 'CHECK FAILED: outsider could join a gig';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── C: signs up after being invited ──
  insert into auth.users (id, email, aud, role) values (c, 'rls-c@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gigs where id = gig_a;
  if n <> 1 then raise exception 'CHECK FAILED: pending invite not claimed on sign-up'; end if;
  reset role;

  -- ── Organisation members ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := invite_to_org(org_a, 'rls-x@avx.invalid', 'member');
  if r <> 'added' then raise exception 'CHECK FAILED: existing user not added to org (%)', r; end if;
  select count(*) into n from org_member_list(org_a);
  if n <> 2 then raise exception 'CHECK FAILED: org member list has % rows', n; end if;
  begin
    update org_members set role = 'member' where org_id = org_a and user_id = a;
    raise exception 'CHECK FAILED: last admin could be demoted';
  exception when raise_exception then
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gigs where id = gig_a;
  if n <> 1 then raise exception 'CHECK FAILED: new org member cannot see org gigs'; end if;
  begin
    r := invite_to_org(org_a, 'someone@avx.invalid');
    raise exception 'CHECK FAILED: non-admin could invite to org';
  exception when raise_exception then
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;
  reset role;

  -- ── Schedule and activity log ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_schedule (gig_id, day, start_time, title, created_by) values (gig_a, '2026-11-01', '08:00', 'Load-in', a);
  select count(*) into n from gig_activity where gig_id = gig_a and action = 'schedule_insert';
  if n <> 1 then raise exception 'CHECK FAILED: schedule change not logged'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_schedule where gig_id = gig_a;
  if n <> 1 then raise exception 'CHECK FAILED: crew cannot see the schedule'; end if;
  select count(*) into n from gig_activity where gig_id = gig_a;
  if n = 0 then raise exception 'CHECK FAILED: crew cannot see activity'; end if;
  begin
    insert into gig_schedule (gig_id, day, start_time, title, created_by) values (gig_a, '2026-11-01', '09:00', 'x', b);
    raise exception 'CHECK FAILED: crew could edit the schedule';
  exception when insufficient_privilege then null; end;
  begin
    insert into gig_activity (gig_id, action) values (gig_a, 'fake');
    raise exception 'CHECK FAILED: activity log is writable';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL CHECKS PASSED';
end $$;
