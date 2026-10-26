-- Checks for migration 20261124000000 (crew network N3: the job board).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL JOB BOARD CHECKS PASSED"  → good
do $$
declare
  c uuid := gen_random_uuid(); f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); f3 uuid := gen_random_uuid();
  org_c uuid; g uuid; p_rig uuid; p_light uuid; p3 uuid; a1 uuid; a2 uuid; res jsonb; n int; t text; call uuid;
  c_aal2 text; d1 date := current_date + 20;
begin
  insert into auth.users (id, email, aud, role) values
    (c, 'jb-c@avx.invalid', 'authenticated', 'authenticated'), (f1, 'jb-f1@avx.invalid', 'authenticated', 'authenticated'),
    (f2, 'jb-f2@avx.invalid', 'authenticated', 'authenticated'), (f3, 'jb-f3@avx.invalid', 'authenticated', 'authenticated');
  c_aal2 := json_build_object('sub', c, 'role', 'authenticated', 'aal', 'aal2')::text;
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Jobs Co', c) returning id into org_c;
  reset role;
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_c, 'Porto Fest', d1, d1 + 1, 'confirmed', c) returning id into g;
  insert into gig_members (gig_id, user_id, role) values (g, c, 'pm');
  insert into crew_profiles (user_id, enabled, functions, base_place, base_country, base_lat, base_lng, travel_scope, travel_km) values
    (f1, true, '{rigger}', 'Porto, Portugal', 'PT', 41.15, -8.61, 'km', 50),
    (f2, true, '{rigger,lighting_op}', 'Braga, Portugal', 'PT', 41.55, -8.42, 'country', null);

  -- Posting needs two-step sign-in switched on
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  begin
    perform publish_job(g, '{"title": "Rigger"}');
    raise exception 'CHECK FAILED: posted without two-step sign-in';
  exception when insufficient_privilege then null; end;
  reset role;
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), c, 'test', 'totp', 'verified', now(), now());
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  p_rig := publish_job(g, '{"title": "Rigger", "function_key": "rigger", "quantity": 1, "place": "Porto, Portugal", "country": "PT", "lat": 41.149, "lng": -8.611, "languages": ["pt"], "pay_mode": "ask_rate"}');
  p_light := publish_job(g, jsonb_build_object('title', 'Lighting op', 'function_key', 'lighting_op', 'place', 'Porto, Portugal', 'country', 'PT', 'lat', 41.15, 'lng', -8.61,
             'pay_mode', 'fixed', 'pay_amount', 180, 'pay_per', 'day'));
  p3 := publish_job(g, '{"title": "Runner", "function_key": "runner"}');
  select count(*) into n from job_posts where id = p_rig and starts_on = d1 and ends_on = d1 + 1 and lat = 41.15;
  if n <> 1 then raise exception 'CHECK FAILED: gig dates and rounded place'; end if;
  -- Unverified organisations: 3 open posts at most
  begin
    perform publish_job(g, '{"title": "Stagehand"}');
    raise exception 'CHECK FAILED: fourth open post';
  exception when program_limit_exceeded then null; end;
  perform close_job(p3, 'closed');
  reset role;

  -- f1 (rigger, 50 km from Porto) sees the rigger post only; with "all" also lighting
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := list_jobs();
  if (res->>'total')::int <> 1 or res->'results'->0->>'id' <> p_rig::text or (res->'results'->0->>'km')::int > 1 then raise exception 'CHECK FAILED: matching jobs %', res; end if;
  res := list_jobs(true);
  if (res->>'total')::int <> 2 then raise exception 'CHECK FAILED: all open jobs %', res; end if;
  select count(*) into n from job_posts;
  if n <> 0 then raise exception 'CHECK FAILED: posts table readable by crew'; end if;
  -- Applying: the rate is asked for on this post
  begin
    perform apply_job(p_rig, 'Hi');
    raise exception 'CHECK FAILED: applied without the asked rate';
  exception when invalid_parameter_value then null; end;
  a1 := apply_job(p_rig, 'IPAF, 9 years', 180, 'EUR');
  begin
    perform apply_job(p_rig, 'again', 170);
    raise exception 'CHECK FAILED: applied twice';
  exception when unique_violation then null; end;
  res := list_jobs();
  if res->'results'->0->>'my_status' <> 'applied' then raise exception 'CHECK FAILED: my status %', res; end if;
  reset role;
  if not private.can_message(f1, c) then raise exception 'CHECK FAILED: applicant cannot write to the poster'; end if;
  select count(*) into n from messages m join conversations k on k.id = m.conversation_id
   where m.author_id = f1 and m.payload->>'event' = 'job_application' and (m.payload->>'rate')::numeric = 180;
  if n <> 1 then raise exception 'CHECK FAILED: application message'; end if;
  select count(*) into n from notifications where user_id = c and kind = 'job_application';
  if n <> 1 then raise exception 'CHECK FAILED: poster notified'; end if;

  -- f2 applies to lighting (fixed fee, no rate needed); f3 has no profile
  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  a2 := apply_job(p_light, 'grandMA3');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := list_jobs();
  if (res->>'needs_profile')::boolean is not true then raise exception 'CHECK FAILED: no profile, no board'; end if;
  begin
    perform apply_job(p_rig, 'me', 100);
    raise exception 'CHECK FAILED: applied without a profile';
  exception when insufficient_privilege then null; end;
  select count(*) into n from job_applications;
  if n <> 0 then raise exception 'CHECK FAILED: others'' applications visible'; end if;
  reset role;

  -- The company: decline f2, offer f1; f1 accepts and the post is filled
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  select count(*) into n from job_applications;
  if n <> 2 then raise exception 'CHECK FAILED: company sees % applications', n; end if;
  t := answer_application(a2, 'decline', 'Filled locally, thanks');
  if t <> 'declined' then raise exception 'CHECK FAILED: decline'; end if;
  t := answer_application(a1, 'offer', 'See you there');
  reset role;
  select count(*) into n from notifications where user_id = f2 and kind = 'job_declined';
  if n <> 1 then raise exception 'CHECK FAILED: declined applicant told'; end if;
  select k.id into call from crew_calls k join crew_call_answers x on x.call_id = k.id where k.gig_id = g and x.user_id = f1;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := answer_crew_call(call, true);
  reset role;
  select count(*) into n from job_applications where id = a1 and status = 'accepted';
  if t <> 'accepted' or n <> 1 then raise exception 'CHECK FAILED: accepted offer (%)', t; end if;
  select count(*) into n from job_posts where id = p_rig and status = 'filled';
  if n <> 1 then raise exception 'CHECK FAILED: post filled'; end if;

  -- Reading: my applications, and a post's applicants (company only)
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := my_job_applications();
  if jsonb_array_length(res) <> 1 or res->0->>'status' <> 'accepted' or res->0->'post'->>'org_name' <> 'Jobs Co' then raise exception 'CHECK FAILED: my applications %', res; end if;
  begin
    perform job_applicants(p_rig);
    raise exception 'CHECK FAILED: applicant read the applicants';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  res := job_applicants(p_light);
  if jsonb_array_length(res) <> 1 or res->0->>'status' <> 'declined' or res->0->'profile'->>'base_place' <> 'Braga, Portugal' or res->0 ? 'worked_with' is not true then raise exception 'CHECK FAILED: applicants %', res; end if;
  reset role;

  -- Signed out
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform list_jobs();
    raise exception 'CHECK FAILED: anon listed jobs';
  exception when insufficient_privilege then null; end;
  reset role;
  raise exception 'ALL JOB BOARD CHECKS PASSED';
end $$;
