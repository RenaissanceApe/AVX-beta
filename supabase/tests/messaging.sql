-- Checks for migration 20261101000000 (messaging M1).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL MESSAGING CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); v uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; g1 uuid; ch uuid; d uuid; d2 uuid; m1 uuid; m2 uuid; n int; t text; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'mg-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'mg-c@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'mg-v@avx.invalid', 'authenticated', 'authenticated'), (o, 'mg-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Chat Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status, venue) values (org_a, 'Gig 1', a, '2026-11-10', 'confirmed', 'Lisboa') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew'), (g1, v, 'viewer');
  reset role;

  -- Crew talk in the gig channel; viewers read; outsiders don't
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ch := gig_conversation(g1);
  if ch <> gig_conversation(g1) then raise exception 'CHECK FAILED: two channels'; end if;
  insert into messages (conversation_id, body) values (ch, '  Hello crew  ') returning id into m1;
  select body into t from messages where id = m1;
  if t <> 'Hello crew' then raise exception 'CHECK FAILED: body not trimmed'; end if;
  begin
    insert into messages (conversation_id, kind, payload) values (ch, 'system', '{"event":"status"}');
    raise exception 'CHECK FAILED: crew wrote a system message';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from messages where conversation_id = ch;
  if n <> 1 then raise exception 'CHECK FAILED: viewer reads % messages', n; end if;
  begin
    insert into messages (conversation_id, body) values (ch, 'Can I?');
    raise exception 'CHECK FAILED: viewer posted';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from messages;
  if n <> 0 then raise exception 'CHECK FAILED: outsider reads messages'; end if;
  begin
    perform gig_conversation(g1);
    raise exception 'CHECK FAILED: outsider opened the channel';
  exception when insufficient_privilege then null; end;
  begin
    perform start_direct(c);
    raise exception 'CHECK FAILED: outsider messaged a stranger';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Unread, replies notify, collapsed into one notification
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select unread into n from my_conversations() where id = ch;
  if n <> 1 then raise exception 'CHECK FAILED: admin unread %', n; end if;
  insert into messages (conversation_id, body, reply_to) values (ch, 'Hi!', m1) returning id into m2;
  insert into messages (conversation_id, body, reply_to) values (ch, 'Doors at 18h', m1);
  select unread into n from my_conversations() where id = ch;
  if n <> 0 then raise exception 'CHECK FAILED: own messages unread %', n; end if;
  update gigs set venue = 'Porto' where id = g1;
  select count(*) into n from messages where conversation_id = ch and kind = 'system' and payload->>'venue' = 'Porto';
  if n <> 1 then raise exception 'CHECK FAILED: no system message for the venue'; end if;
  insert into gig_members (gig_id, user_id, role) values (g1, o, 'crew');
  reset role;

  select count(*) into n from notifications where user_id = c and kind = 'message' and read_at is null;
  if n <> 1 then raise exception 'CHECK FAILED: % message notifications for crew', n; end if;
  select (details->>'count')::int into n from notifications where user_id = c and kind = 'message' and read_at is null;
  if n <> 2 then raise exception 'CHECK FAILED: not collapsed (%)', n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select unread into n from my_conversations() where id = ch;
  if n <> 0 then raise exception 'CHECK FAILED: new member sees % old messages as unread', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select unread into n from my_conversations() where id = ch;
  if n <> 3 then raise exception 'CHECK FAILED: crew unread % (2 replies + system)', n; end if;
  perform read_conversation(ch);
  select unread into n from my_conversations() where id = ch;
  if n <> 0 then raise exception 'CHECK FAILED: still unread after reading'; end if;
  select count(*) into n from notifications where user_id = c and kind = 'message' and read_at is null;
  if n <> 0 then raise exception 'CHECK FAILED: notification not cleared'; end if;

  -- Direct conversations
  d := start_direct(a);
  if d <> start_direct(a) then raise exception 'CHECK FAILED: two direct conversations'; end if;
  insert into messages (conversation_id, body, reply_to) values (d, 'Free on the 14th?', m1);
  select reply_to into r from messages where conversation_id = d;
  if r.reply_to is not null then raise exception 'CHECK FAILED: reply to another conversation kept'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  d2 := start_direct(c);
  if d2 <> d then raise exception 'CHECK FAILED: other side opened a new conversation'; end if;
  select other_user, unread into r from my_conversations() where id = d;
  if r.other_user <> c or r.unread <> 1 then raise exception 'CHECK FAILED: direct for admin %', row_to_json(r); end if;
  perform read_conversation(d, true);
  reset role;
  select count(*) into n from notifications where user_id = a and kind = 'message' and read_at is null;
  if n <> 0 then raise exception 'CHECK FAILED: admin has % unread message notifications', n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into messages (conversation_id, body) values (d, 'Ping');
  reset role;
  select count(*) into n from notifications where user_id = a and kind = 'message' and read_at is null;
  if n <> 0 then raise exception 'CHECK FAILED: muted conversation notified'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from messages where conversation_id = d;
  if n <> 0 then raise exception 'CHECK FAILED: third person reads a direct conversation'; end if;
  begin
    insert into messages (conversation_id, body) values (d, 'Butting in');
    raise exception 'CHECK FAILED: third person posted in a direct conversation';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL MESSAGING CHECKS PASSED';
end $$;
