-- Checks for migration 20261102000000 (messaging M2).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL MESSAGING M2 CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); s uuid := gen_random_uuid(); v uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; g1 uuid; g2 uuid; ch uuid; m1 uuid; m2 uuid; q uuid; n int; t text; b boolean; j jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'm2-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'm2-c@avx.invalid', 'authenticated', 'authenticated'),
    (s, 'm2-s@avx.invalid', 'authenticated', 'authenticated'), (v, 'm2-v@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'm2-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('M2 Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig M2', a, '2026-11-20', 'confirmed') returning id into g1;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Other gig', a, '2026-12-20', 'confirmed') returning id into g2;
  insert into gig_members (gig_id, user_id, role, function_title) values
    (g1, c, 'crew', 'Sound'), (g1, s, 'crew', ' sound '), (g1, v, 'viewer', null);
  insert into quotes (org_id, number, title) values (org_a, 1, 'Secret quote') returning id into q;
  ch := gig_conversation(g1);
  reset role;

  -- Files: crew upload and attach; a path outside the conversation or someone else's file is refused
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into storage.objects (bucket_id, name, owner_id) values ('message-files', ch || '/f1/rider.pdf', c::text);
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('message-files', gen_random_uuid() || '/f2/x.pdf', c::text);
    raise exception 'CHECK FAILED: uploaded to a conversation they are not in';
  exception when insufficient_privilege then null; end;
  insert into messages (conversation_id, body, attachments)
  values (ch, '📎 rider.pdf', jsonb_build_array(jsonb_build_object('path', ch || '/f1/rider.pdf', 'name', 'rider.pdf', 'type', 'application/pdf', 'size', 1200)))
  returning id into m1;
  select attachments->0->>'name' into t from messages where id = m1;
  if t <> 'rider.pdf' then raise exception 'CHECK FAILED: attachment not kept (%)', t; end if;
  begin
    insert into messages (conversation_id, body, attachments) values (ch, 'x', jsonb_build_array(jsonb_build_object('path', ch || '/nope/x.pdf')));
    raise exception 'CHECK FAILED: attached a file that does not exist';
  exception when invalid_parameter_value then null; end;
  -- Cards: only what the author can see
  insert into messages (conversation_id, body, payload) values (ch, 'Look', jsonb_build_object('card', jsonb_build_object('type', 'gig', 'id', g1)));
  begin
    insert into messages (conversation_id, body, payload) values (ch, 'Look', jsonb_build_object('card', jsonb_build_object('type', 'quote', 'id', q)));
    raise exception 'CHECK FAILED: crew shared a quote they cannot see';
  exception when insufficient_privilege then null; end;
  begin
    insert into messages (conversation_id, body, payload) values (ch, 'x', '{"event":"status"}');
    raise exception 'CHECK FAILED: free payload accepted';
  exception when insufficient_privilege then null; end;
  -- Crew can't mention groups; mentioning a person works
  insert into messages (conversation_id, body, mentions) values (ch, '@everyone hi', '[{"group":"everyone"}]') returning id into m2;
  select mentions into j from messages where id = m2;
  if j <> '[]'::jsonb then raise exception 'CHECK FAILED: crew group mention kept %', j; end if;
  insert into messages (conversation_id, body, mentions) values (ch, '@Sara cable?', jsonb_build_array(jsonb_build_object('user', s)));
  reset role;

  select count(*) into n from notifications where user_id = s and kind = 'message' and details->>'why' = 'mention';
  if n <> 1 then raise exception 'CHECK FAILED: mention not notified (%)', n; end if;
  select count(*) into n from notifications where user_id = v and kind = 'message';
  if n <> 0 then raise exception 'CHECK FAILED: viewer notified by crew @everyone'; end if;

  -- Managers mention a function group: both "Sound" people, once each, not the author
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into messages (conversation_id, body, mentions, reply_to) values (ch, '@sound line check', '[{"group":"fn:sound"},{"group":"crew"}]', m1);
  reset role;
  select (details->>'count')::int into n from notifications where user_id = c and kind = 'message' and read_at is null;
  if n <> 1 then raise exception 'CHECK FAILED: crew told % times (mention + reply should be one)', n; end if;
  select (details->>'count')::int into n from notifications where user_id = s and kind = 'message' and read_at is null;
  if n <> 2 then raise exception 'CHECK FAILED: Sara count %', n; end if;

  -- Viewers download files a message shows; outsiders don't
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'message-files' and name = ch || '/f1/rider.pdf';
  if n <> 1 then raise exception 'CHECK FAILED: viewer cannot open the attachment'; end if;
  begin
    perform react(m1, '👍');
    raise exception 'CHECK FAILED: viewer reacted';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'message-files';
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees files'; end if;
  select count(*) into n from message_reactions;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees reactions'; end if;
  reset role;

  -- Reactions toggle; only the author edits; edits keep history; removal clears everything
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  b := react(m1, '👍');
  if not b then raise exception 'CHECK FAILED: reaction not on'; end if;
  b := react(m1, '👍');
  if b then raise exception 'CHECK FAILED: reaction not toggled off'; end if;
  b := react(m1, '✅');
  begin
    perform react(m1, '💩');
    raise exception 'CHECK FAILED: odd emoji accepted';
  exception when check_violation then null; end;
  begin
    perform edit_message(m1, 'hijack');
    raise exception 'CHECK FAILED: edited someone else''s message';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform edit_message(m1, 'Rider v2 attached');
  select body, edited_at is not null into t, b from messages where id = m1;
  if t <> 'Rider v2 attached' or not b then raise exception 'CHECK FAILED: edit not saved'; end if;
  select count(*) into n from message_edits where message_id = m1 and body = '📎 rider.pdf';
  if n <> 1 then raise exception 'CHECK FAILED: edit history missing'; end if;
  begin
    update messages set body = 'direct write' where id = m1;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'CHECK FAILED: direct update allowed'; end if;
  exception when insufficient_privilege then null; end;
  perform remove_message(m1);
  select body, attachments, deleted_at is not null into t, j, b from messages where id = m1;
  if t <> '—' or j <> '[]'::jsonb or not b then raise exception 'CHECK FAILED: removal left content'; end if;
  select count(*) into n from message_edits where message_id = m1 and body <> '—';
  if n <> 0 then raise exception 'CHECK FAILED: old versions kept after removal'; end if;
  select count(*) into n from message_reactions where message_id = m1 and active;
  if n <> 0 then raise exception 'CHECK FAILED: reactions kept after removal'; end if;
  begin
    perform edit_message(m1, 'back from the dead');
    raise exception 'CHECK FAILED: edited a removed message';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'message-files' and name = ch || '/f1/rider.pdf';
  if n <> 0 then raise exception 'CHECK FAILED: file of a removed message still downloadable'; end if;
  reset role;

  raise exception 'ALL MESSAGING M2 CHECKS PASSED';
end $$;
