-- Checks for migrations 20261104000000 + 20261104000001 (messaging M4).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL MESSAGING M4 CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  mb uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; g0 uuid; g1 uuid; gd uuid; ch uuid; d uuid; call_id uuid; item uuid; ctx uuid; req uuid; n int; k int; t text; j jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'm4-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'm4-c@avx.invalid', 'authenticated', 'authenticated'),
    (f, 'm4-f@avx.invalid', 'authenticated', 'authenticated'), (mb, 'm4-mb@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'm4-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('M4 Co', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, mb, 'member');
  -- A past gig with a freelancer (so they're in the admin's network), a confirmed gig and a draft
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Old gig', a, '2026-05-01', 'completed') returning id into g0;
  insert into gig_members (gig_id, user_id, role, function_title) values (g0, f, 'crew', 'Rigger');
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig M4', a, '2026-12-01', 'confirmed') returning id into g1;
  insert into gig_members (gig_id, user_id, role, function_title) values (g1, c, 'crew', 'Sound');
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Draft', a, '2026-12-10', 'draft') returning id into gd;
  ch := gig_conversation(g1);

  -- Availability questions land in the direct conversation, and so do the answers
  insert into availability_requests (gig_id, person_id, message) values (g1, f, 'Free on the 1st?') returning id into req;
  reset role;
  select c2.id into d from conversations c2 where c2.kind = 'direct' and c2.direct_key = least(a::text, f::text) || ':' || greatest(a::text, f::text);
  if d is null then raise exception 'CHECK FAILED: no direct conversation for the question'; end if;
  select payload into j from messages where conversation_id = d and kind = 'system' order by created_at desc limit 1;
  if j->>'event' <> 'availability' or j->>'request_id' <> req::text then raise exception 'CHECK FAILED: question not posted %', j; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update availability_requests set status = 'available', reply_note = 'Yes!' where id = req;
  select payload->>'status' into t from messages where conversation_id = d and kind = 'system' and payload->>'event' = 'availability_answer';
  if t is distinct from 'available' then raise exception 'CHECK FAILED: answer not posted'; end if;
  reset role;

  -- Crew calls: only people you can message, only from the gig's managers; places run out
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform send_crew_call(g1, 'Rigger', 1, null, array[f]);
    raise exception 'CHECK FAILED: crew sent a crew call';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := send_crew_call(g1, 'Rigger', 1, 'Load-in 8h', array[f, mb, o, c]);
  if n <> 2 then raise exception 'CHECK FAILED: % invited (freelancer + member; not the stranger, not someone already on the gig)', n; end if;
  select id into call_id from crew_calls where gig_id = g1;
  reset role;
  select count(*) into n from notifications where kind = 'crew_call' and details->>'call_id' = call_id::text;
  if n <> 2 then raise exception 'CHECK FAILED: % crew call notifications', n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from crew_calls;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees crew calls'; end if;
  begin
    perform answer_crew_call(call_id, true);
    raise exception 'CHECK FAILED: outsider answered a crew call';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from crew_calls where id = call_id;
  if n <> 1 then raise exception 'CHECK FAILED: invitee cannot see the call'; end if;
  t := answer_crew_call(call_id, true);
  if t <> 'accepted' then raise exception 'CHECK FAILED: accept returned %', t; end if;
  reset role;
  select function_title into t from gig_members where gig_id = g1 and user_id = f;
  if t is distinct from 'Rigger' then raise exception 'CHECK FAILED: not added to the gig as Rigger'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := answer_crew_call(call_id, true);
  if t <> 'full' then raise exception 'CHECK FAILED: second accept for one place returned %', t; end if;
  reset role;
  select count(*) into n from notifications where user_id = a and kind = 'crew_call_answer';
  if n <> 1 then raise exception 'CHECK FAILED: % answer notifications for the manager', n; end if;

  -- The call sheet: only managers publish it; everyone on the gig is asked to confirm
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform publish_call_sheet(g1, 'Call sheet');
    raise exception 'CHECK FAILED: crew published the call sheet';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform publish_call_sheet(g1, '📋 Call sheet for Gig M4');
  reset role;
  select count(*) into n from messages where conversation_id = ch and needs_ack and payload->'card'->>'type' = 'callsheet';
  if n <> 1 then raise exception 'CHECK FAILED: call sheet not posted'; end if;
  select count(*) into n from notifications where kind = 'announcement' and gig_id = g1;
  if n <> 2 then raise exception 'CHECK FAILED: % call sheet notifications (sound + rigger)', n; end if;

  -- Schedule changes: gathered into one line; nothing for draft gigs
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_schedule (gig_id, day, start_time, title, created_by) values (g1, '2026-12-01', '08:00', 'Load-in', a), (g1, '2026-12-01', '18:00', 'Soundcheck', a);
  perform gig_conversation(gd);
  insert into gig_schedule (gig_id, day, start_time, title, created_by) values (gd, '2026-12-10', '09:00', 'Draft item', a);
  reset role;
  select count(*), max((payload->>'count')::int) into n, k from messages where conversation_id = ch and payload->>'event' = 'schedule';
  if n <> 1 or k <> 2 then raise exception 'CHECK FAILED: schedule posts % (count %)', n, k; end if;
  select count(*) into n from messages m join conversations c2 on c2.id = m.conversation_id where c2.gig_id = gd and m.payload->>'event' = 'schedule';
  if n <> 0 then raise exception 'CHECK FAILED: draft gig posted schedule changes'; end if;

  -- Conversations about one thing: the organisation's admins and members, nobody else
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Speaker', 10, a, 'serial') returning id into item;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ctx := context_conversation('item', item);
  if ctx <> context_conversation('item', item) then raise exception 'CHECK FAILED: two conversations for one item'; end if;
  insert into messages (conversation_id, body) values (ctx, 'Grille is loose');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform context_conversation('item', item);
    raise exception 'CHECK FAILED: crew opened an item conversation';
  exception when insufficient_privilege then null; end;
  select count(*) into n from messages where conversation_id = ctx;
  if n <> 0 then raise exception 'CHECK FAILED: crew reads an item conversation'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select title into t from my_inbox() where id = ctx;
  if t is distinct from 'Speaker' then raise exception 'CHECK FAILED: item conversation not in the inbox (%)', t; end if;
  reset role;

  raise exception 'ALL MESSAGING M4 CHECKS PASSED';
end $$;
