-- Checks for migration 20270111000000 (upkeep U3: held invitations get a reminder and expire).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL HELD INVITE EXPIRY CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  org_a uuid; org_b uuid; res jsonb; n int; h_old uuid; h_new uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'hx-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'hx-m@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Expiry Co', a) returning id into org_a;
  insert into organisations (name, created_by) values ('Quiet Co', a) returning id into org_b;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');

  -- Held invitations of different ages (inserted as the server, to set created_at)
  insert into held_invites (org_id, email, created_at) values
    (org_a, 'd20@example.com', now() - interval '20 days'),
    (org_a, 'd15@example.com', now() - interval '15 days'),
    (org_a, 'd3@example.com',  now() - interval '3 days');
  insert into held_invites (org_id, email, created_at) values (org_a, 'd70@example.com', now() - interval '70 days') returning id into h_old;
  select id into h_new from held_invites where org_id = org_a and email = 'd3@example.com';
  -- A discarded one never counts
  insert into held_invites (org_id, email, status, created_at) values (org_b, 'gone@example.com', 'discarded', now() - interval '90 days');

  res := private.remind_held_invites();
  select count(*) into n from notifications where org_id = org_a and kind = 'held_invites_waiting' and user_id = a and (details ->> 'count')::int = 4;
  if n <> 1 then raise exception 'CHECK FAILED: admin not reminded once (%), %', n, res; end if;
  select count(*) into n from notifications where org_id = org_a and kind = 'held_invites_waiting' and user_id = m;
  if n <> 0 then raise exception 'CHECK FAILED: a member was reminded'; end if;
  select count(*) into n from notifications where org_id = org_b and kind = 'held_invites_waiting';
  if n <> 0 then raise exception 'CHECK FAILED: discarded invitation reminded'; end if;
  select count(*) into n from held_invites where org_id = org_a and reminded_at is not null;
  if n <> 3 then raise exception 'CHECK FAILED: % reminded, expected 3', n; end if;
  if (select reminded_at from held_invites where id = h_new) is not null then raise exception 'CHECK FAILED: 3-day-old reminded'; end if;
  -- Only the 70-day-old one expired; it is still held, not removed
  select count(*) into n from held_invites where org_id = org_a and expired_at is not null;
  if n <> 1 or (select expired_at from held_invites where id = h_old) is null then raise exception 'CHECK FAILED: expiry %', n; end if;
  if (select status from held_invites where id = h_old) <> 'held' then raise exception 'CHECK FAILED: expired not held'; end if;
  select count(*) into n from held_invites where org_id = org_b and expired_at is not null;
  if n <> 0 then raise exception 'CHECK FAILED: discarded invitation expired'; end if;

  -- A second night changes nothing
  res := private.remind_held_invites();
  select count(*) into n from notifications where org_id = org_a and kind = 'held_invites_waiting';
  if n <> 1 then raise exception 'CHECK FAILED: reminded twice (%)', res; end if;

  -- The admin can't clear the marks, but can still send or discard an expired invitation
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update held_invites set expired_at = null, reminded_at = null where id = h_old;
  select count(*) into n from held_invites where id = h_old and expired_at is not null and reminded_at is not null;
  if n <> 1 then raise exception 'CHECK FAILED: admin cleared the marks'; end if;
  update held_invites set expired_at = now() where id = h_new;
  if (select expired_at from held_invites where id = h_new) is not null then raise exception 'CHECK FAILED: admin set expired_at'; end if;
  update held_invites set status = 'sent', result = 'invited' where id = h_old;
  select count(*) into n from held_invites where id = h_old and status = 'sent' and expired_at is not null;
  if n <> 1 then raise exception 'CHECK FAILED: expired invitation not sendable'; end if;
  -- The reminder links to the members panel and only its owner sees it
  select count(*) into n from notifications where kind = 'held_invites_waiting';
  if n <> 1 then raise exception 'CHECK FAILED: admin sees % reminders', n; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from notifications where kind = 'held_invites_waiting';
  if n <> 0 then raise exception 'CHECK FAILED: member sees the reminder'; end if;
  reset role;

  -- Nobody runs the job through the API
  if has_function_privilege('authenticated', 'private.remind_held_invites()', 'execute')
     or has_function_privilege('anon', 'private.remind_held_invites()', 'execute') then
    raise exception 'CHECK FAILED: job callable through the API';
  end if;
  select count(*) into n from cron.job where jobname = 'avx-held-invites';
  if n <> 1 then raise exception 'CHECK FAILED: job not scheduled'; end if;

  raise exception 'ALL HELD INVITE EXPIRY CHECKS PASSED';
end $$;
