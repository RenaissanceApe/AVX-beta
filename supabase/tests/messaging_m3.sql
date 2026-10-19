-- Checks for migrations 20261103000000 + 20261103000001 (messaging M3).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL MESSAGING M3 CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); mb uuid := gen_random_uuid(); vw uuid := gen_random_uuid();
  snd uuid := gen_random_uuid(); lit uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; g1 uuid; ch_all uuid; ch_adm uuid; dep uuid; gch uuid; m1 uuid; m2 uuid; n int; t text; b boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'm3-a@avx.invalid', 'authenticated', 'authenticated'), (mb, 'm3-mb@avx.invalid', 'authenticated', 'authenticated'),
    (vw, 'm3-vw@avx.invalid', 'authenticated', 'authenticated'), (snd, 'm3-snd@avx.invalid', 'authenticated', 'authenticated'),
    (lit, 'm3-lit@avx.invalid', 'authenticated', 'authenticated'), (o, 'm3-o@avx.invalid', 'authenticated', 'authenticated');

  -- An organisation (admin, member, viewer) and a gig with a sound and a light technician
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('M3 Co', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, mb, 'member'), (org_a, vw, 'viewer');
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig M3', a, '2026-11-25', 'confirmed') returning id into g1;
  insert into gig_members (gig_id, user_id, role, function_title) values (g1, snd, 'crew', 'Sound'), (g1, lit, 'crew', 'Light');

  -- Organisation channels: admins make them; audiences and "admins only" are respected
  ch_all := save_org_channel(null, org_a, 'General');
  ch_adm := save_org_channel(null, org_a, 'Board', 'admins');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform save_org_channel(null, org_a, 'Mine');
    raise exception 'CHECK FAILED: a member made a channel';
  exception when insufficient_privilege then null; end;
  insert into messages (conversation_id, body) values (ch_all, 'Hello team');
  select count(*) into n from conversations where id = ch_adm;
  if n <> 0 then raise exception 'CHECK FAILED: member sees the admins channel'; end if;
  select count(*) into n from my_inbox() where kind = 'org';
  if n <> 1 then raise exception 'CHECK FAILED: member inbox has % org channels', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', vw, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from messages where conversation_id = ch_all;
  if n <> 1 then raise exception 'CHECK FAILED: viewer reads % messages', n; end if;
  begin
    insert into messages (conversation_id, body) values (ch_all, 'Me too');
    raise exception 'CHECK FAILED: viewer posted in an org channel';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Admin makes General "admins only", then archives it: nobody else can post
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform save_org_channel(ch_all, null, null, null, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into messages (conversation_id, body) values (ch_all, 'Still here?');
    raise exception 'CHECK FAILED: member posted in an admins-only channel';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Announcements: admin asks for a confirmation; everyone in the audience is told
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into messages (conversation_id, body, needs_ack) values (ch_all, 'New safety rules — please confirm', true) returning id into m1;
  perform pin_message(m1);
  reset role;
  select count(*) into n from notifications where kind = 'announcement' and details->>'message_id' = m1::text;
  if n <> 2 then raise exception 'CHECK FAILED: % announcement notifications (member + viewer)', n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from messages where conversation_id = ch_all and pinned_at is not null;
  if n <> 1 then raise exception 'CHECK FAILED: pin not visible'; end if;
  begin
    perform pin_message(m1, false);
    raise exception 'CHECK FAILED: member unpinned';
  exception when insufficient_privilege then null; end;
  begin
    perform announcement_status(m1);
    raise exception 'CHECK FAILED: member read the confirmation list';
  exception when insufficient_privilege then null; end;
  perform ack_message(m1);
  perform ack_message(m1);
  select count(*) into n from notifications where user_id = mb and kind = 'announcement' and read_at is null;
  if n <> 0 then raise exception 'CHECK FAILED: announcement notification not cleared by confirming'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform ack_message(m1);
    raise exception 'CHECK FAILED: outsider confirmed';
  exception when insufficient_privilege then null; end;
  select count(*) into n from search_messages('safety');
  if n <> 0 then raise exception 'CHECK FAILED: outsider found messages by search'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from announcement_status(m1);
  if n <> 2 then raise exception 'CHECK FAILED: confirmation list has % people', n; end if;
  select count(*) into n from announcement_status(m1) where acked_at is not null;
  if n <> 1 then raise exception 'CHECK FAILED: % confirmed', n; end if;
  -- Archived channels are read-only, even for admins
  perform save_org_channel(ch_adm, null, null, null, null, true);
  begin
    insert into messages (conversation_id, body) values (ch_adm, 'Anyone?');
    raise exception 'CHECK FAILED: posted in an archived channel';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Department channels: the sound people (and the gig's managers), nobody else
  perform set_config('request.jwt.claims', json_build_object('sub', snd, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_departments(g1);
  if n <> 1 then raise exception 'CHECK FAILED: sound tech sees % departments', n; end if;
  dep := department_channel(g1, 'Sound');
  begin
    perform department_channel(g1, 'light');
    raise exception 'CHECK FAILED: sound tech opened the light channel';
  exception when insufficient_privilege then null; end;
  insert into messages (conversation_id, body) values (dep, 'Line check at 14h') returning id into m2;
  begin
    insert into messages (conversation_id, body, needs_ack) values (dep, 'Confirm!', true);
    raise exception 'CHECK FAILED: crew sent an announcement';
  exception when insufficient_privilege then null; end;
  b := toggle_saved(m2);
  if not b then raise exception 'CHECK FAILED: not saved'; end if;
  select count(*) into n from saved_messages where saved;
  if n <> 1 then raise exception 'CHECK FAILED: saved list %', n; end if;
  select count(*) into n from search_messages('line check');
  if n <> 1 then raise exception 'CHECK FAILED: search found %', n; end if;
  select count(*) into n from search_messages('%%');
  if n <> 0 then raise exception 'CHECK FAILED: wildcard search not escaped'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', lit, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from messages where conversation_id = dep;
  if n <> 0 then raise exception 'CHECK FAILED: light tech reads the sound channel'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_departments(g1);
  if n <> 4 then raise exception 'CHECK FAILED: manager sees % departments (production manager, sound, light, managers)', n; end if;
  select count(*) into n from messages where conversation_id = dep;
  if n <> 1 then raise exception 'CHECK FAILED: manager cannot read the sound channel'; end if;
  -- Mentions in a department reach only its people
  insert into messages (conversation_id, body, mentions) values (dep, '@Light?', jsonb_build_array(jsonb_build_object('user', lit), jsonb_build_object('user', snd)));
  reset role;
  select count(*) into n from notifications where user_id = lit and kind = 'message';
  if n <> 0 then raise exception 'CHECK FAILED: someone outside the department was mentioned'; end if;
  select count(*) into n from notifications where user_id = snd and kind = 'message' and details->>'why' = 'mention';
  if n <> 1 then raise exception 'CHECK FAILED: department mention not delivered'; end if;

  -- Gig channel still works as before (M1/M2), and direct conversations can't carry announcements
  perform set_config('request.jwt.claims', json_build_object('sub', snd, 'role', 'authenticated')::text, true);
  set local role authenticated;
  gch := gig_conversation(g1);
  insert into messages (conversation_id, body) values (gch, 'All good');
  reset role;

  raise exception 'ALL MESSAGING M3 CHECKS PASSED';
end $$;
