-- Checks for migration 20261118000000 (switching S3a: crew imported as held invitations).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL HELD INVITE CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); k uuid := gen_random_uuid();
  org_a uuid; res jsonb; n int; t text; h uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'hi-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'hi-m@avx.invalid', 'authenticated', 'authenticated'),
    (k, 'hi-known@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Held Co', a) returning id into org_a;
  perform invite_to_org(org_a, 'hi-m@avx.invalid', 'member');
  perform invite_to_org(org_a, 'pending@avx.invalid', 'viewer');

  -- Five people: two new, a member, someone already invited, a bad e-mail, an unknown role
  res := import_crew(org_a, '[
    {"_row": 2, "email": "Rui@Example.com", "full_name": "Rui Costa", "phone": "+351 912", "functions": "Sound engineer", "role": "Freelancer"},
    {"_row": 3, "email": "ana@example.com", "full_name": "Ana", "role": "Medewerker"},
    {"_row": 4, "email": "hi-m@avx.invalid"},
    {"_row": 5, "email": "pending@avx.invalid"},
    {"_row": 6, "email": "not-mail"},
    {"_row": 7, "email": "x@example.com", "role": "Astronaut"}
  ]', 'crew.csv');
  if (res ->> 'created')::int <> 2 or (res ->> 'unchanged')::int <> 2 or (res ->> 'skipped')::int <> 2 then raise exception 'CHECK FAILED: import %', res; end if;
  select role into t from held_invites where org_id = org_a and email = 'rui@example.com';
  if t <> 'viewer' then raise exception 'CHECK FAILED: freelancer role %', t; end if;
  select role into t from held_invites where org_id = org_a and email = 'ana@example.com';
  if t <> 'member' then raise exception 'CHECK FAILED: employee role %', t; end if;
  -- Nobody got an invitation or a membership out of it
  select count(*) into n from org_invites where org_id = org_a and email in ('rui@example.com', 'ana@example.com');
  if n <> 0 then raise exception 'CHECK FAILED: import invited people'; end if;

  -- Again with a new phone: updated, not doubled
  res := import_crew(org_a, '[{"email": "rui@example.com", "phone": "+351 913"}, {"email": "ana@example.com", "full_name": "Ana"}]');
  if (res ->> 'updated')::int <> 1 or (res ->> 'unchanged')::int <> 1 then raise exception 'CHECK FAILED: re-import %', res; end if;
  select count(*) into n from held_invites where org_id = org_a;
  if n <> 2 then raise exception 'CHECK FAILED: % held', n; end if;

  -- Sending marks it sent with the outcome; after that it can't change
  select id into h from held_invites where org_id = org_a and email = 'rui@example.com';
  update held_invites set status = 'sent', result = 'invited', email = 'other@example.com' where id = h;
  select count(*) into n from held_invites where id = h and status = 'sent' and sent_at is not null and sent_by = a and email = 'rui@example.com';
  if n <> 1 then raise exception 'CHECK FAILED: sent not recorded'; end if;
  begin
    update held_invites set status = 'held' where id = h;
    raise exception 'CHECK FAILED: sent invitation changed';
  exception when invalid_parameter_value then null; end;
  -- Once sent, the same person can be held again (a new import), but only once at a time
  res := import_crew(org_a, '[{"email": "rui@example.com"}]');
  if (res ->> 'created')::int <> 1 then raise exception 'CHECK FAILED: re-hold after send %', res; end if;
  -- Discarding
  update held_invites set status = 'discarded' where org_id = org_a and email = 'ana@example.com';
  select count(*) into n from held_invites where org_id = org_a and status = 'discarded' and result is null;
  if n <> 1 then raise exception 'CHECK FAILED: discard'; end if;
  -- Nobody adds rows directly
  begin
    insert into held_invites (org_id, email) values (org_a, 'direct@example.com');
    raise exception 'CHECK FAILED: direct insert';
  exception when insufficient_privilege then null; end;
  reset role;

  -- A member (not an admin) can't import or see them
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from held_invites where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: member sees held invitations'; end if;
  begin
    perform import_crew(org_a, '[{"email": "y@example.com"}]');
    raise exception 'CHECK FAILED: member imported';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL HELD INVITE CHECKS PASSED';
end $$;
