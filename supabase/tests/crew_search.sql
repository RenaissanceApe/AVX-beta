-- Checks for migration 20261123000000 (crew network N2: crew search and contact).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL CREW SEARCH CHECKS PASSED"  → good
do $$
declare
  c uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); f3 uuid := gen_random_uuid(); f4 uuid := gen_random_uuid(); f5 uuid := gen_random_uuid();
  org_c uuid; g uuid; other uuid; res jsonb; n int; t text;
begin
  insert into auth.users (id, email, aud, role) values
    (c, 'cs-c@avx.invalid', 'authenticated', 'authenticated'), (x, 'cs-x@avx.invalid', 'authenticated', 'authenticated'),
    (f1, 'cs-f1@avx.invalid', 'authenticated', 'authenticated'), (f2, 'cs-f2@avx.invalid', 'authenticated', 'authenticated'),
    (f3, 'cs-f3@avx.invalid', 'authenticated', 'authenticated'), (f4, 'cs-f4@avx.invalid', 'authenticated', 'authenticated'),
    (f5, 'cs-f5@avx.invalid', 'authenticated', 'authenticated');
  update profiles set full_name = 'Rui Porto' where id = f1;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Search Co', c) returning id into org_c;
  reset role;
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_c, 'Porto Fest', '2026-11-10', '2026-11-11', 'confirmed', c) returning id into g;
  insert into gig_members (gig_id, user_id, role) values (g, c, 'pm');
  -- f4 is booked elsewhere on those dates
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_c, 'Other job', '2026-11-11', '2026-11-12', 'confirmed', c) returning id into other;
  insert into gig_members (gig_id, user_id, role) values (other, f4, 'crew');

  -- Profiles: f1 rigger in Porto; f2 lighting in Lisbon, travels anywhere; f3 switched off;
  -- f4 rigger in Porto but busy; f5 rigger in Porto who blocked c
  insert into crew_profiles (user_id, enabled, functions, base_place, base_country, base_lat, base_lng, travel_scope, travel_km, languages, certificates) values
    (f1, true, '{rigger}', 'Porto, Portugal', 'PT', 41.15, -8.61, 'km', 50, '{en,pt}', '[{"name": "IPAF 3a", "expires_on": "2027-05-01"}]'),
    (f2, true, '{lighting_op}', 'Lisboa, Portugal', 'PT', 38.72, -9.14, 'world', null, '{pt}', '[]'),
    (f3, false, '{rigger}', 'Porto, Portugal', 'PT', 41.15, -8.61, 'km', 50, '{pt}', '[]'),
    (f4, true, '{rigger}', 'Porto, Portugal', 'PT', 41.16, -8.60, 'km', 50, '{pt}', '[]'),
    (f5, true, '{rigger}', 'Porto, Portugal', 'PT', 41.15, -8.61, 'km', 50, '{pt}', '[]');
  insert into user_blocks (user_id, blocked_id, active) values (f5, c, true);

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Riggers near Porto: f1 and f4 (not f3: off; not f5: blocked)
  res := search_crew(org_c, '{rigger}', null, '{}', null, 41.15, -8.61, 50, 'PT');
  select count(*) into n from jsonb_array_elements(res->'results') r where (r->>'user_id')::uuid in (f1, f4);
  if (res->>'total')::int <> 2 or n <> 2 then raise exception 'CHECK FAILED: riggers near Porto %', res; end if;
  if (res->'results'->0) ? 'base_lat' then raise exception 'CHECK FAILED: coordinates returned'; end if;
  -- Anyone near Porto also finds f2, who travels anywhere, 274 km away
  res := search_crew(org_c, '{}', null, '{}', null, 41.15, -8.61, 50, 'PT');
  select count(*) into n from jsonb_array_elements(res->'results') r where (r->>'user_id')::uuid = f2 and (r->>'km')::int between 260 and 290;
  if (res->>'total')::int <> 3 or n <> 1 then raise exception 'CHECK FAILED: travels anywhere %', res; end if;
  -- Dates: f4 is busy; "only free" leaves f1
  res := search_crew(org_c, '{rigger}', null, '{}', null, 41.15, -8.61, 50, 'PT', '2026-11-10', '2026-11-11');
  if res->'results'->0->>'user_id' <> f1::text or (res->'results'->0->>'free')::boolean is not true
     or (res->'results'->1->>'free')::boolean is not false then raise exception 'CHECK FAILED: free first %', res; end if;
  res := search_crew(org_c, '{rigger}', null, '{}', null, 41.15, -8.61, 50, 'PT', '2026-11-10', '2026-11-11', true);
  if (res->>'total')::int <> 1 then raise exception 'CHECK FAILED: only free %', res; end if;
  -- Languages, words and certificates
  res := search_crew(org_c, '{}', null, '{en}');
  if (res->>'total')::int <> 1 then raise exception 'CHECK FAILED: speaks English %', res; end if;
  res := search_crew(org_c, '{}', 'rui');
  if (res->>'total')::int <> 1 then raise exception 'CHECK FAILED: name search %', res; end if;
  res := search_crew(org_c, '{}', null, '{}', 'ipaf', null, null, null, null, '2027-06-01', '2027-06-01');
  if (res->>'total')::int <> 0 then raise exception 'CHECK FAILED: expired certificate counted %', res; end if;

  -- Contact: ask f1 about the dates, offer f2 a place
  t := contact_crew(g, f1, 'availability', null, 'Free on the 10th?');
  select count(*) into n from availability_requests where gig_id = g and person_id = f1 and status = 'pending';
  if t <> 'availability' or n <> 1 then raise exception 'CHECK FAILED: availability asked'; end if;
  begin
    perform contact_crew(g, f1, 'availability');
    raise exception 'CHECK FAILED: asked twice';
  exception when unique_violation then null; end;
  perform contact_crew(g, f2, 'offer', 'Lighting operator', 'Two days, Porto');
  select count(*) into n from crew_call_answers a join crew_calls k on k.id = a.call_id where k.gig_id = g and a.user_id = f2;
  if n <> 1 then raise exception 'CHECK FAILED: offer sent'; end if;
  begin
    perform contact_crew(g, f5, 'availability');
    raise exception 'CHECK FAILED: contacted someone who blocked us';
  exception when insufficient_privilege then null; end;
  begin
    perform contact_crew(g, f3, 'availability');
    raise exception 'CHECK FAILED: contacted a switched-off profile';
  exception when insufficient_privilege then null; end;
  reset role;
  -- f1 can now write back to c
  if not private.can_message(f1, c) then raise exception 'CHECK FAILED: no way to reply'; end if;
  select count(*) into n from crew_search_log where org_id = org_c;
  if n < 7 then raise exception 'CHECK FAILED: searches not counted (%)', n; end if;

  -- Someone outside the organisation can't search on its behalf or contact for its gig
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform search_crew(org_c);
    raise exception 'CHECK FAILED: outsider searched';
  exception when insufficient_privilege then null; end;
  begin
    perform contact_crew(g, f1, 'availability');
    raise exception 'CHECK FAILED: outsider contacted';
  exception when insufficient_privilege then null; end;
  reset role;
  -- Signed out
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform search_crew(org_c);
    raise exception 'CHECK FAILED: anon searched';
  exception when insufficient_privilege then null; end;
  reset role;
  raise exception 'ALL CREW SEARCH CHECKS PASSED';
end $$;
