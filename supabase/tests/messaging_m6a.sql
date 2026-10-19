-- Checks for migration 20261107000000 (messaging M6a: reports, moderators, blocks, rate limits).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL MESSAGING M6A CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  org_a uuid; g1 uuid; gch uuid; dm uuid; m1 uuid; m2 uuid; m3 uuid; n int; t text; i int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'm6-a@avx.invalid', 'authenticated', 'authenticated'), (c1, 'm6-c1@avx.invalid', 'authenticated', 'authenticated'),
    (c2, 'm6-c2@avx.invalid', 'authenticated', 'authenticated');

  -- An organisation and a gig run by a, with two crew
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('M6 Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig M6', a, '2026-12-01', 'confirmed') returning id into g1;
  insert into gig_members (gig_id, user_id, role, function_title) values (g1, c1, 'crew', 'Sound'), (g1, c2, 'crew', 'Light');
  gch := gig_conversation(g1);
  reset role;

  -- c1 writes something; c2 reports it
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into messages (conversation_id, body) values (gch, 'Buy cheap watches here') returning id into m1;
  begin
    perform report_message(m1, 'spam');
    raise exception 'CHECK FAILED: reported own message';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform report_message(m1, 'spam', 'Not about the gig');
  perform report_message(m1, 'abuse');   -- a second report from the same person changes nothing
  select count(*) into n from message_reports where message_id = m1;
  if n <> 1 then raise exception 'CHECK FAILED: reporter sees % reports', n; end if;
  select count(*) into n from open_reports(gch);
  if n <> 0 then raise exception 'CHECK FAILED: crew sees open reports'; end if;
  begin
    perform moderate_message(m1, true);
    raise exception 'CHECK FAILED: crew moderated';
  exception when insufficient_privilege then null; end;
  begin
    perform report_message(m1, 'nonsense');
    raise exception 'CHECK FAILED: bad reason accepted';
  exception when insufficient_privilege or invalid_parameter_value then null; end;
  reset role;

  select count(*) into n from notifications where kind = 'message_report' and user_id = a and details->>'message_id' = m1::text;
  if n <> 1 then raise exception 'CHECK FAILED: % report notifications for the gig manager', n; end if;
  select count(*) into n from notifications where kind = 'message_report' and user_id in (c1, c2);
  if n <> 0 then raise exception 'CHECK FAILED: crew told about the report'; end if;

  -- The manager sees the report without who made it, and removes the message
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from message_reports;
  if n <> 0 then raise exception 'CHECK FAILED: manager reads report rows (who reported)'; end if;
  select reports, reasons[1] into n, t from open_reports(gch) where message_id = m1;
  if n <> 1 or t <> 'spam' then raise exception 'CHECK FAILED: open report % %', n, t; end if;
  perform moderate_message(m1, true);
  reset role;
  if (select deleted_at is null or removed_by is distinct from a or body <> '—' from messages where id = m1) then
    raise exception 'CHECK FAILED: message not removed by the moderator';
  end if;
  if (select outcome from message_reports where message_id = m1) <> 'removed' then raise exception 'CHECK FAILED: report not resolved'; end if;
  select count(*) into n from notifications where kind = 'message_report' and details->>'message_id' = m1::text and read_at is null;
  if n <> 0 then raise exception 'CHECK FAILED: report notification still open'; end if;
  select count(*) into n from notifications where kind = 'message_removed' and user_id = c1;
  if n <> 1 then raise exception 'CHECK FAILED: author not told about the removal'; end if;

  -- Keeping a reported message leaves it as it was
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into messages (conversation_id, body) values (gch, 'Doors at 18:00') returning id into m2;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform report_message(m2, 'other');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform moderate_message(m2, false);
  select count(*) into n from open_reports(gch);
  if n <> 0 then raise exception 'CHECK FAILED: kept report still open'; end if;
  reset role;
  if (select deleted_at is not null from messages where id = m2) then raise exception 'CHECK FAILED: kept message removed'; end if;

  -- Removing your own message still works, without the moderator mark
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform remove_message(m2);
  reset role;
  if (select deleted_at is null or removed_by is not null from messages where id = m2) then
    raise exception 'CHECK FAILED: own removal';
  end if;

  -- Blocking: no direct messages either way, and no mentions from them; unblocking restores it
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  dm := start_direct(c2);
  insert into messages (conversation_id, body) values (dm, 'Hi there');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform block_user(c1, true);
  select count(*) into n from my_blocks();
  if n <> 1 then raise exception 'CHECK FAILED: blocked list has %', n; end if;
  begin
    insert into messages (conversation_id, body) values (dm, 'Reply');
    raise exception 'CHECK FAILED: wrote to someone I blocked';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into messages (conversation_id, body) values (dm, 'Hello?');
    raise exception 'CHECK FAILED: blocked person wrote';
  exception when insufficient_privilege then null; end;
  select count(*) into n from user_blocks;
  if n <> 0 then raise exception 'CHECK FAILED: blocked person sees the block'; end if;
  reset role;
  select count(*) into i from notifications where kind = 'message' and user_id = c2;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into messages (conversation_id, body, mentions) values (gch, 'Ping', jsonb_build_array(jsonb_build_object('user', c2)));
  reset role;
  select count(*) into n from notifications where kind = 'message' and user_id = c2;
  if n <> i then raise exception 'CHECK FAILED: mention from a blocked person notified'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform block_user(c1, false);
  select count(*) into n from my_blocks();
  if n <> 0 then raise exception 'CHECK FAILED: still blocked'; end if;
  insert into messages (conversation_id, body) values (dm, 'Sorry, back') returning id into m3;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into messages (conversation_id, body, mentions) values (gch, 'Ping again', jsonb_build_array(jsonb_build_object('user', c2)));
  reset role;
  select count(*) into n from notifications where kind = 'message' and user_id = c2;
  if n <= i then raise exception 'CHECK FAILED: mention after unblocking did not notify'; end if;

  -- Moderators can't touch direct conversations
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform moderate_message(m3, true);
    raise exception 'CHECK FAILED: moderated a direct message';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Rate limit: at most 20 messages a minute per person
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    for i in 1..25 loop
      insert into messages (conversation_id, body) values (gch, 'Flood ' || i);
    end loop;
    raise exception 'CHECK FAILED: no rate limit';
  exception when program_limit_exceeded then null; end;
  reset role;

  raise exception 'ALL MESSAGING M6A CHECKS PASSED';
end $$;
