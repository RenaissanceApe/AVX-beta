-- Checks for migrations 20261211000000 (a fee on a crew call) and 20261211000001 (a fee on Find
-- crew's and the job board's offers), step 7b.
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL CREW CALL FEE CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); f3 uuid := gen_random_uuid();
  k uuid := gen_random_uuid(); f4 uuid := gen_random_uuid(); f5 uuid := gen_random_uuid(); post uuid; app uuid;
  org_a uuid; g0 uuid; g uuid; call_id uuid; call2 uuid; call3 uuid; n int; t text; j jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'ccf-a@avx.invalid', 'authenticated', 'authenticated'), (f1, 'ccf-f1@avx.invalid', 'authenticated', 'authenticated'),
    (f2, 'ccf-f2@avx.invalid', 'authenticated', 'authenticated'), (f3, 'ccf-f3@avx.invalid', 'authenticated', 'authenticated'),
    (k, 'ccf-k@avx.invalid', 'authenticated', 'authenticated'), (f4, 'ccf-f4@avx.invalid', 'authenticated', 'authenticated'),
    (f5, 'ccf-f5@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Fee Co', a) returning id into org_a;
  -- A past gig puts the three freelancers in the admin's network; the new gig has one crew member
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Old gig', a, '2026-05-01', 'completed') returning id into g0;
  insert into gig_members (gig_id, user_id, role, function_title) values (g0, f1, 'crew', 'Rigger'), (g0, f2, 'crew', 'Rigger'), (g0, f3, 'crew', 'Rigger'), (g0, f4, 'crew', 'Rigger');
  insert into gigs (org_id, name, created_by, start_date, end_date, status) values (org_a, 'Fee gig', a, '2026-12-04', '2026-12-06', 'confirmed') returning id into g;
  insert into gig_members (gig_id, user_id, role, function_title) values (g, k, 'crew', 'Sound');
  reset role;

  -- Crew on the gig can't send a call, with or without a fee
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform send_crew_call(g, 'Rigger', 1, null, array[f1], 'day', 200, 3);
    raise exception 'CHECK FAILED: crew sent a crew call with a fee';
  exception when insufficient_privilege then null; end;
  reset role;

  -- The manager offers two places at 200 a day for 3 days
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform send_crew_call(g, 'Rigger', 1, null, array[f1], 'week', 200, 3);
    raise exception 'CHECK FAILED: unknown fee unit';
  exception when check_violation then null; end;
  begin
    perform send_crew_call(g, 'Rigger', 1, null, array[f1], 'day', -5, 3);
    raise exception 'CHECK FAILED: negative fee';
  exception when check_violation then null; end;
  n := send_crew_call(g, 'Rigger', 2, null, array[f1, f2], 'day', 200, 3);
  if n <> 2 then raise exception 'CHECK FAILED: % invited', n; end if;
  select id into call_id from crew_calls where gig_id = g and fee_rate = 200;
  if call_id is null then raise exception 'CHECK FAILED: fee not saved on the call'; end if;
  if (select fee_unit || ':' || fee_quantity from crew_calls where id = call_id) <> 'day:3.00' then raise exception 'CHECK FAILED: fee unit or quantity'; end if;
  -- A fixed fee counts once; the old five-argument call still works and has no fee
  n := send_crew_call(g, 'Stagehand', 1, null, array[f3], 'fixed', 450, 4);
  select id into call2 from crew_calls where gig_id = g and title = 'Stagehand';
  if (select fee_quantity from crew_calls where id = call2) <> 1 then raise exception 'CHECK FAILED: fixed fee counts once'; end if;
  reset role;

  -- The invitation shows the fee to each person called
  select m.payload into j from messages m join conversations c on c.id = m.conversation_id
   where c.kind = 'direct' and c.direct_key = least(a::text, f1::text) || ':' || greatest(a::text, f1::text)
     and m.payload->>'event' = 'crew_call' and m.payload->>'call_id' = call_id::text;
  if (j->'fee'->>'total')::numeric is distinct from 600 or j->'fee'->>'unit' <> 'day' then raise exception 'CHECK FAILED: invitation fee %', j; end if;
  select details into j from notifications where user_id = f2 and kind = 'crew_call' and details->>'call_id' = call_id::text;
  if (j->'fee'->>'rate')::numeric is distinct from 200 then raise exception 'CHECK FAILED: notification fee %', j; end if;

  -- The person called reads the call's fee and accepts: their fee on the gig is created
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select fee_rate from crew_calls where id = call_id) is distinct from 200 then raise exception 'CHECK FAILED: invitee cannot read the fee'; end if;
  t := answer_crew_call(call_id, true);
  if t <> 'accepted' then raise exception 'CHECK FAILED: accept returned %', t; end if;
  if (select unit || ':' || rate || ':' || quantity from gig_crew_fees where gig_id = g and user_id = f1) is distinct from 'day:200.00:3.00' then
    raise exception 'CHECK FAILED: accepted fee not created';
  end if;
  reset role;

  -- The second person: their own fee only, never the first one's
  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := answer_crew_call(call_id, true);
  select count(*) into n from gig_crew_fees where gig_id = g;
  if n <> 1 then raise exception 'CHECK FAILED: second person sees % fees', n; end if;
  if exists (select 1 from gig_crew_fees where user_id = f1) then raise exception 'CHECK FAILED: sees someone else''s fee'; end if;
  reset role;

  -- Crew already on the gig see no fees of others
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_crew_fees where gig_id = g;
  if n <> 0 then raise exception 'CHECK FAILED: crew see % fees', n; end if;
  if exists (select 1 from crew_calls where gig_id = g) then raise exception 'CHECK FAILED: crew see the calls'; end if;
  reset role;

  -- A fee the manager changed is kept when the person answers again; declining creates nothing
  update gig_crew_fees set rate = 260 where gig_id = g and user_id = f1;
  perform set_config('request.jwt.claims', json_build_object('sub', f3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := answer_crew_call(call2, false);
  reset role;
  if exists (select 1 from gig_crew_fees where gig_id = g and user_id = f3) then raise exception 'CHECK FAILED: declined call created a fee'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := answer_crew_call(call_id, true);
  reset role;
  if (select rate from gig_crew_fees where gig_id = g and user_id = f1) <> 260 then raise exception 'CHECK FAILED: existing fee overwritten'; end if;

  -- A call without a fee adds the person with no fee
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := send_crew_call(g, 'Lights', 1, null, array[f3]);
  select id into call3 from crew_calls where gig_id = g and title = 'Lights';
  if (select fee_rate from crew_calls where id = call3) is not null then raise exception 'CHECK FAILED: five-argument call has a fee'; end if;
  reset role;
  if exists (select 1 from messages where payload->>'call_id' = call3::text and payload ? 'fee') then raise exception 'CHECK FAILED: fee in a call without one'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', f3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := answer_crew_call(call3, true);
  reset role;
  if t <> 'accepted' or exists (select 1 from gig_crew_fees where gig_id = g and user_id = f3) then raise exception 'CHECK FAILED: no-fee call (%)', t; end if;

  -- Find crew: offering a place with a fee; the old five-argument call still works
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform contact_crew(g, f4, 'offer', 'Rigger', null, 'month', 100, 1);
    raise exception 'CHECK FAILED: Find crew offer with an unknown fee unit';
  exception when check_violation then null; end;
  t := contact_crew(g, f4, 'offer', 'Rigger', 'Can you?', 'day', 180, 2);
  select id into call_id from crew_calls where gig_id = g and fee_rate = 180;
  if call_id is null or (select fee_unit || ':' || fee_quantity from crew_calls where id = call_id) <> 'day:2.00' then raise exception 'CHECK FAILED: Find crew offer fee'; end if;
  reset role;
  select m.payload into j from messages m where m.payload->>'event' = 'crew_call' and m.payload->>'call_id' = call_id::text;
  if (j->'fee'->>'total')::numeric is distinct from 360 then raise exception 'CHECK FAILED: Find crew offer message %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', f4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := answer_crew_call(call_id, true);
  if (select rate from gig_crew_fees where gig_id = g and user_id = f4) is distinct from 180 then raise exception 'CHECK FAILED: Find crew fee not agreed'; end if;
  reset role;

  -- Job board: offering the place to an applicant with a fee
  insert into job_posts (org_id, gig_id, title, starts_on, ends_on, created_by) values (org_a, g, 'Runner', '2026-12-04', '2026-12-06', a) returning id into post;
  insert into job_applications (post_id, user_id, day_rate, currency) values (post, f5, 90, 'EUR') returning id into app;
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform answer_application(app, 'offer', null, 'day', 90, 3);
    raise exception 'CHECK FAILED: crew offered a job';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := answer_application(app, 'offer', 'Welcome', 'day', 90, 3);
  if t <> 'offered' then raise exception 'CHECK FAILED: offer returned %', t; end if;
  select id into call_id from crew_calls where gig_id = g and title = 'Runner';
  if (select fee_rate from crew_calls where id = call_id) is distinct from 90 then raise exception 'CHECK FAILED: job offer fee'; end if;
  -- The three-argument call still works (shortlisting, declining)
  t := answer_application(app, 'shortlist');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f5, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := answer_crew_call(call_id, true);
  if (select unit || ':' || rate || ':' || quantity from gig_crew_fees where gig_id = g and user_id = f5) is distinct from 'day:90.00:3.00' then
    raise exception 'CHECK FAILED: job offer fee not agreed';
  end if;
  reset role;

  raise exception 'ALL CREW CALL FEE CHECKS PASSED';
end $$;
