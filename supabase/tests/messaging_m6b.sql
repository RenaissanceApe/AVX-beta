-- Checks for migration 20261108000000 (messaging M6b: retention, export, usage counts).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL MESSAGING M6B CHECKS PASSED"  → good
-- If 20261108000001_message_retention_delete.sql has been run, it also checks the deletion.
do $$
declare
  a uuid := gen_random_uuid(); mb uuid := gen_random_uuid(); c1 uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g1 uuid; gch uuid; ch uuid; dm uuid; old_m uuid; new_m uuid; old_dm uuid; n bigint; f bigint; j jsonb; d integer;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'm6b-a@avx.invalid', 'authenticated', 'authenticated'), (mb, 'm6b-mb@avx.invalid', 'authenticated', 'authenticated'),
    (c1, 'm6b-c1@avx.invalid', 'authenticated', 'authenticated'), (o, 'm6b-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('M6b Co', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, mb, 'member');
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig M6b', a, '2026-12-05', 'confirmed') returning id into g1;
  insert into gig_members (gig_id, user_id, role, function_title) values (g1, c1, 'crew', 'Sound');
  gch := gig_conversation(g1);
  ch := save_org_channel(null, org_a, 'General');
  dm := start_direct(c1);
  insert into messages (conversation_id, body) values (gch, 'Old gig message') returning id into old_m;
  insert into messages (conversation_id, body) values (ch, 'Fresh channel message') returning id into new_m;
  insert into messages (conversation_id, body) values (dm, 'Old private message') returning id into old_dm;
  reset role;
  -- Make two of them a year old
  update messages set created_at = now() - interval '400 days' where id in (old_m, old_dm);

  -- Another organisation, not ours
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', o) returning id into org_b;
  reset role;

  -- Only admins choose a period, from the allowed ones
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform set_message_retention(org_a, 365);
    raise exception 'CHECK FAILED: member set retention';
  exception when insufficient_privilege then null; end;
  select count(*) into n from org_message_stats(org_a);
  if n <> 0 then raise exception 'CHECK FAILED: member sees usage counts'; end if;
  begin
    perform export_org_messages(org_a);
    raise exception 'CHECK FAILED: member exported';
  exception when insufficient_privilege then null; end;
  begin
    perform retention_due(10);
    raise exception 'CHECK FAILED: a user listed messages due for deletion';
  exception when insufficient_privilege then null; end;
  begin
    select count(*) into n from job_keys;
    raise exception 'CHECK FAILED: a user reads job keys';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform set_message_retention(org_a, 7);
    raise exception 'CHECK FAILED: odd period accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform set_message_retention(org_b, 90);
    raise exception 'CHECK FAILED: set retention on someone else''s organisation';
  exception when insufficient_privilege then null; end;

  -- Preview: a 1-year period would delete the old gig message now, never the direct one
  select messages, files into n, f from retention_preview(org_a, 365);
  if n <> 1 then raise exception 'CHECK FAILED: preview counts % messages', n; end if;

  -- Usage counts and export cover the organisation's conversations, not direct ones
  select messages into n from org_message_stats(org_a);
  if n <> 2 then raise exception 'CHECK FAILED: stats count % messages', n; end if;
  j := export_org_messages(org_a);
  if jsonb_array_length(j) <> 2 then raise exception 'CHECK FAILED: export has % conversations', jsonb_array_length(j); end if;
  if j::text like '%Old private message%' then raise exception 'CHECK FAILED: export includes a direct conversation'; end if;

  perform set_message_retention(org_a, 365);
  reset role;
  if (select message_retention_days <> 365 or message_retention_set_by <> a from organisations where id = org_a) then
    raise exception 'CHECK FAILED: period not saved';
  end if;

  -- Due for deletion: the old gig message only
  select count(*) into n from retention_due(2000) r where r.id in (old_m, new_m, old_dm);
  if n <> 1 or not exists (select 1 from retention_due(2000) r where r.id = old_m) then
    raise exception 'CHECK FAILED: due list wrong (%)', n;
  end if;

  -- The deletion itself (only once the hand-run file is in place)
  if exists (select 1 from pg_proc where proname = 'retention_delete') then
    execute 'select public.retention_delete($1)' into d using array[old_m, new_m, old_dm];
    if d <> 1 then raise exception 'CHECK FAILED: deleted % messages', d; end if;
    if not exists (select 1 from messages where id = new_m) or not exists (select 1 from messages where id = old_dm)
       or exists (select 1 from messages where id = old_m) then
      raise exception 'CHECK FAILED: the wrong messages were deleted';
    end if;
  end if;

  -- Back to keeping everything
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform set_message_retention(org_a, null);
  reset role;
  select count(*) into n from retention_due(2000) r where r.id in (old_m, new_m, old_dm);
  if n <> 0 then raise exception 'CHECK FAILED: still due after keeping everything'; end if;

  raise exception 'ALL MESSAGING M6B CHECKS PASSED';
end $$;
