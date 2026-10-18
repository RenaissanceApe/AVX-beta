-- Checks for migration 20261031000000 ("your network" picker).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL NETWORK CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  fp uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  org_a uuid; g1 uuid; g2 uuid; g3 uuid; n int; t text; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'n-a@avx.invalid', 'authenticated', 'authenticated'), (c1, 'n-c1@avx.invalid', 'authenticated', 'authenticated'),
    (c2, 'n-c2@avx.invalid', 'authenticated', 'authenticated'), (fp, 'n-fp@avx.invalid', 'authenticated', 'authenticated'),
    (s, 'n-s@avx.invalid', 'authenticated', 'authenticated');
  update profiles set full_name = 'Ana Admin' where id = a;
  update profiles set full_name = 'Carla Crew' where id = c1;
  update profiles set full_name = 'Duarte Crew', findable_by = 'crew' where id = c2;
  update profiles set full_name = 'Filipa Freelance PM' where id = fp;
  update profiles set full_name = 'Sara Stranger', findable_by = 'crew' where id = s;
  select findable_by into t from profiles where id = c1;
  if t <> 'managers' then raise exception 'CHECK FAILED: default is %', t; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Net Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Old gig', a, '2026-05-01', 'confirmed') returning id into g1;
  insert into gig_members (gig_id, user_id, role, function_title) values
    (g1, c1, 'crew', 'Sound'), (g1, c2, 'crew', 'Lights'), (g1, fp, 'pm', 'Production');
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'New gig', a, '2026-12-05', 'confirmed') returning id into g2;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Busy gig', a, '2026-12-05', 'confirmed') returning id into g3;
  insert into gig_members (gig_id, user_id, role) values (g3, c1, 'crew');

  -- The company sees everyone it worked with, with functions and who's booked
  select count(*) into n from network_search('', g2);
  if n <> 3 then raise exception 'CHECK FAILED: admin sees % people', n; end if;
  select * into r from network_search('carla', g2);
  if r.user_id <> c1 or not r.busy or r.already or r.functions <> array['Sound'] or r.gigs_together <> 2 then
    raise exception 'CHECK FAILED: Carla %', row_to_json(r);
  end if;
  select count(*) into n from network_search('sara', g2);
  if n <> 0 then raise exception 'CHECK FAILED: a stranger found'; end if;
  t := add_from_network('gig', g2, c2, 'crew', 'Lights', null);
  if t <> 'added' then raise exception 'CHECK FAILED: add returned %', t; end if;
  select already into r from network_search('duarte', g2);
  if not r.already then raise exception 'CHECK FAILED: not shown as already on the gig'; end if;
  begin
    perform add_from_network('gig', g2, s);
    raise exception 'CHECK FAILED: added a stranger';
  exception when insufficient_privilege then null; end;
  reset role;

  -- A freelance PM counts as crew: only people who chose "also other crew"
  perform set_config('request.jwt.claims', json_build_object('sub', fp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from network_search('', g1);
  if n <> 1 or (select user_id from network_search('', g1)) <> c2 then raise exception 'CHECK FAILED: freelance PM sees % people', n; end if;
  begin
    perform add_from_network('gig', g1, c1);
    raise exception 'CHECK FAILED: freelance PM added someone who isn''t findable by crew';
  exception when insufficient_privilege then null; end;
  select count(*) into n from network_search('', g2);
  if n <> 0 then raise exception 'CHECK FAILED: searched for a gig they don''t manage'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update profiles set findable_by = 'crew' where id = c1;
  begin
    update profiles set findable_by = 'everyone' where id = c1;
    raise exception 'CHECK FAILED: bad setting saved';
  exception when check_violation then null; end;
  select count(*) into n from network_search('', g2);
  if n <> 0 then raise exception 'CHECK FAILED: crew searched for a gig they don''t manage'; end if;
  begin
    perform add_from_network('gig', g2, c2);
    raise exception 'CHECK FAILED: crew added people';
  exception when others then
    if sqlerrm like 'CHECK FAILED%' then raise; end if;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', fp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from network_search('carla', g1);
  if n <> 1 then raise exception 'CHECK FAILED: setting change not respected'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from network_search('', null, org_a);
  if n <> 0 then raise exception 'CHECK FAILED: outsider searched'; end if;
  reset role;

  raise exception 'ALL NETWORK CHECKS PASSED';
end $$;
