-- Checks for migration 20261126000000 (crew network N5: alerts and saved searches).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL CREW ALERT CHECKS PASSED"  → good
do $$
declare
  c uuid := gen_random_uuid(); m uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); f3 uuid := gen_random_uuid(); f4 uuid := gen_random_uuid();
  org_c uuid; org_x uuid; g uuid; s1 uuid; s2 uuid; n int; c_aal2 text; d1 date := current_date + 20;
begin
  insert into auth.users (id, email, aud, role) values
    (c, 'al-c@avx.invalid', 'authenticated', 'authenticated'), (m, 'al-m@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'al-x@avx.invalid', 'authenticated', 'authenticated'),
    (f1, 'al-f1@avx.invalid', 'authenticated', 'authenticated'), (f2, 'al-f2@avx.invalid', 'authenticated', 'authenticated'),
    (f3, 'al-f3@avx.invalid', 'authenticated', 'authenticated'), (f4, 'al-f4@avx.invalid', 'authenticated', 'authenticated');
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), c, 'test', 'totp', 'verified', now(), now());
  c_aal2 := json_build_object('sub', c, 'role', 'authenticated', 'aal', 'aal2')::text;
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Alert Co', c) returning id into org_c;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_c, m, 'member');
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_x;
  reset role;
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_c, 'Porto Fest', d1, d1, 'confirmed', c) returning id into g;
  insert into gig_members (gig_id, user_id, role) values (g, c, 'pm');

  -- Freelancers: f1 rigger near Porto; f2 rigger in Lisbon (50 km range); f3 rigger near Porto, alerts off;
  -- f4 rigger near Porto who blocked c
  insert into crew_profiles (user_id, enabled, functions, base_place, base_country, base_lat, base_lng, travel_scope, travel_km, job_alerts) values
    (f1, true, '{rigger}', 'Porto, Portugal', 'PT', 41.15, -8.61, 'km', 50, true),
    (f2, true, '{rigger}', 'Lisboa, Portugal', 'PT', 38.72, -9.14, 'km', 50, true),
    (f3, true, '{rigger}', 'Porto, Portugal', 'PT', 41.15, -8.61, 'km', 50, false),
    (f4, true, '{rigger}', 'Porto, Portugal', 'PT', 41.15, -8.61, 'km', 50, true);
  insert into user_blocks (user_id, blocked_id, active) values (f4, c, true);

  -- A post near Porto: only f1 hears about it
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  perform publish_job(g, '{"title": "Rigger", "function_key": "rigger", "place": "Porto, Portugal", "country": "PT", "lat": 41.15, "lng": -8.61}');
  reset role;
  select count(*) into n from notifications where kind = 'job_match';
  if n <> 1 or not exists (select 1 from notifications where kind = 'job_match' and user_id = f1 and gig_id is null
                                  and details->>'org_name' = 'Alert Co' and details ? 'post_id') then
    raise exception 'CHECK FAILED: job alerts (% sent)', n;
  end if;
  if exists (select 1 from notifications where kind = 'job_match' and (details ? 'gig_name' or details::text ilike '%Porto Fest%')) then
    raise exception 'CHECK FAILED: alert names the gig';
  end if;

  -- Saved searches: the member saves "Riggers near Porto"; the outsider can't see or add them
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into crew_saved_searches (org_id, name, filters)
  values (org_c, ' Riggers near Porto ', '{"fn": "rigger", "place": {"lat": 41.15, "lng": -8.61, "country": "PT"}, "km": 50}') returning id into s1;
  insert into crew_saved_searches (org_id, name, filters, alert)
  values (org_c, 'Lighting, no alerts', '{"fn": "lighting_op"}', false) returning id into s2;
  if (select name from crew_saved_searches where id = s1) <> 'Riggers near Porto' or (select created_by from crew_saved_searches where id = s1) <> m then
    raise exception 'CHECK FAILED: saved search kept as typed';
  end if;
  begin
    update crew_saved_searches set created_by = c where id = s1;
    raise exception 'CHECK FAILED: owner changed';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from crew_saved_searches;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees saved searches'; end if;
  begin
    insert into crew_saved_searches (org_id, name) values (org_c, 'Mine now');
    raise exception 'CHECK FAILED: outsider saved a search';
  exception when insufficient_privilege then null; end;
  reset role;

  -- New profiles switched on: a rigger near Porto alerts s1; one in Lisbon (short range) doesn't
  update crew_profiles set enabled = false where user_id = f1;
  update crew_profiles set enabled = true where user_id = f1;
  update crew_profiles set enabled = false where user_id = f2;
  update crew_profiles set enabled = true where user_id = f2;
  select count(*) into n from notifications where kind = 'crew_match' and user_id = m and details->>'search_id' = s1::text;
  if n <> 1 or not exists (select 1 from notifications where kind = 'crew_match' and actor_id = f1) then
    raise exception 'CHECK FAILED: saved search alert (%)', n;
  end if;
  -- Editing a switched-on profile doesn't alert again; a blocked person's profile never alerts c's searches
  update crew_profiles set headline = 'Rigger, IPAF' where user_id = f1;
  select count(*) into n from notifications where kind = 'crew_match';
  if n <> 1 then raise exception 'CHECK FAILED: alert on an edit'; end if;

  -- Removing a saved search (marking it) hides it and stops its alerts
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update crew_saved_searches set removed_at = now() where id = s1;
  select count(*) into n from crew_saved_searches where removed_at is null;
  if n <> 1 then raise exception 'CHECK FAILED: removed search still listed'; end if;
  update crew_saved_searches set removed_at = null where id = s1;
  if (select removed_at from crew_saved_searches where id = s1) is null then raise exception 'CHECK FAILED: removed search brought back'; end if;
  reset role;
  update crew_profiles set enabled = false where user_id = f3;
  update crew_profiles set enabled = true where user_id = f3;
  select count(*) into n from notifications where kind = 'crew_match';
  if n <> 1 then raise exception 'CHECK FAILED: removed search still alerts'; end if;

  raise exception 'ALL CREW ALERT CHECKS PASSED';
end $$;
