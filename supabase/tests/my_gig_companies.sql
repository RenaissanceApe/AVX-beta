-- Checks for migration 20261023000000 (company names for "My work").
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL MY_GIG_COMPANIES CHECKS PASSED"  → good
do $$
declare a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid(); org_a uuid; org_b uuid; gig uuid; n int; nm text;
begin
  insert into auth.users (id, email, aud, role) values (a, 'mgc-a@avx.invalid','authenticated','authenticated'), (c, 'mgc-c@avx.invalid','authenticated','authenticated'), (o, 'mgc-o@avx.invalid','authenticated','authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Company A', a) returning id into org_a;
  insert into organisations (name, created_by) values ('Company B', a) returning id into org_b;
  insert into gigs (org_id, name, created_by) values (org_a, 'G', a) returning id into gig;
  insert into gig_members (gig_id, user_id, role) values (gig, c, 'crew');
  reset role;
  -- Crew on one of Company A's gigs: can't read the company itself, but gets its name (and only that one)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from organisations where id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: crew can read the org row'; end if;
  select count(*), max(name) into n, nm from my_gig_companies();
  if n <> 1 or nm <> 'Company A' then raise exception 'CHECK FAILED: got % rows (%)', n, nm; end if;
  reset role;
  -- Someone on no gigs sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from my_gig_companies();
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees companies'; end if;
  reset role;
  raise exception 'ALL MY_GIG_COMPANIES CHECKS PASSED';
end $$;
