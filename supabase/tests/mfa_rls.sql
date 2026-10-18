-- Checks for migration 20261022000000 (two-step sign-in enforced by the database).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL MFA CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  org_a uuid; gig uuid; n int; res text;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'mfa-a@avx.invalid', 'authenticated', 'authenticated'),
    (b, 'mfa-b@avx.invalid', 'authenticated', 'authenticated');

  -- a (no authenticator) sets things up with an ordinary session
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('MFA Org', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, b, 'member');
  insert into gigs (org_id, name, created_by) values (org_a, 'MFA Gig', a) returning id into gig;
  select count(*) into n from org_member_list(org_a);
  if n <> 2 then raise exception 'CHECK FAILED: wrapper org_member_list returned % rows', n; end if;
  reset role;

  -- b turns on an authenticator
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
    values (gen_random_uuid(), b, 'AVX', 'totp', 'verified', now(), now(), 'TESTSECRET');

  -- b with only the password (aal1): nothing readable, nothing writable, no RPCs
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from gigs where id = gig;
  if n <> 0 then raise exception 'CHECK FAILED: aal1 session read gigs'; end if;
  select count(*) into n from organisations where id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: aal1 session read organisations'; end if;
  select count(*) into n from profiles where id = b;
  if n <> 0 then raise exception 'CHECK FAILED: aal1 session read own profile'; end if;
  begin
    insert into gigs (org_id, name, created_by) values (org_a, 'Sneaky', b);
    raise exception 'CHECK FAILED: aal1 session created a gig';
  exception when insufficient_privilege then null; end;
  begin
    perform org_member_list(org_a);
    raise exception 'CHECK FAILED: aal1 session listed members';
  exception when insufficient_privilege then null; end;
  begin
    perform account_deletion_plan();
    raise exception 'CHECK FAILED: aal1 session read the deletion plan';
  exception when insufficient_privilege then null; end;
  begin
    select invite_to_gig(gig, 'x@avx.invalid') into res;
    raise exception 'CHECK FAILED: aal1 session invited someone';
  exception when insufficient_privilege then null; end;
  reset role;

  -- b after the second step (aal2): normal access again
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from gigs where id = gig;
  if n <> 1 then raise exception 'CHECK FAILED: aal2 session cannot read gigs'; end if;
  select count(*) into n from org_member_list(org_a);
  if n <> 2 then raise exception 'CHECK FAILED: aal2 session cannot list members (%)', n; end if;
  insert into gigs (org_id, name, created_by) values (org_a, 'Allowed', b);
  reset role;

  -- a (no authenticator) is unaffected by b's choice
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from gigs where org_id = org_a;
  if n <> 2 then raise exception 'CHECK FAILED: user without authenticator lost access (% gigs)', n; end if;
  reset role;

  -- The originals are not reachable through the API
  if has_function_privilege('authenticated', 'private.delete_my_account_unchecked()', 'execute')
     or has_function_privilege('anon', 'public.invite_to_gig(uuid, text, text, text, time)', 'execute') then
    raise exception 'CHECK FAILED: function grants too wide';
  end if;

  raise exception 'ALL MFA CHECKS PASSED';
end $$;
