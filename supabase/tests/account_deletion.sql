-- Checks for 20261104000002_account_deletion_activity.sql: someone on a gig can delete their account.
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL ACCOUNT DELETION CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  org_a uuid; g1 uuid; ch uuid; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'del-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'del-c@avx.invalid', 'authenticated', 'authenticated');

  -- A gig with a crew member who has written in its chat and has been notified
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Del Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Del gig', a, '2026-12-01', 'confirmed') returning id into g1;
  insert into gig_members (gig_id, user_id, role, function_title) values (g1, c, 'crew', 'Sound');
  ch := gig_conversation(g1);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into messages (conversation_id, body) values (ch, 'See you there');

  -- They delete their account
  perform delete_my_account();
  reset role;

  select count(*) into n from auth.users where id = c;
  if n <> 0 then raise exception 'CHECK FAILED: account not deleted'; end if;
  select count(*) into n from gig_members where user_id = c;
  if n <> 0 then raise exception 'CHECK FAILED: still on the gig'; end if;
  select count(*) into n from gig_activity where gig_id = g1 and action = 'member_removed' and actor_id is null;
  if n <> 1 then raise exception 'CHECK FAILED: removal not logged without an actor (%)', n; end if;
  select count(*) into n from messages where conversation_id = ch and author_id is null and body = 'See you there';
  if n <> 1 then raise exception 'CHECK FAILED: their message did not stay with the gig'; end if;

  -- The organisation's admin is untouched
  select count(*) into n from auth.users where id = a;
  if n <> 1 then raise exception 'CHECK FAILED: someone else was deleted'; end if;

  raise exception 'ALL ACCOUNT DELETION CHECKS PASSED';
end $$;
