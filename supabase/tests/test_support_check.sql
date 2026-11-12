-- Checks for supabase/tests/support/test_support.sql (TEST project only; run that file first).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL TEST SUPPORT CHECKS PASSED"  → good
do $$
declare
  e uuid := gen_random_uuid();   -- an e2e test account
  e2 uuid := gen_random_uuid();  -- another e2e test account
  p uuid := gen_random_uuid();   -- a real person
  org_e uuid; org_mixed uuid; org_p uuid; n int; ok boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (e, 'e2e-admin-tscheck-x@example.com', 'authenticated', 'authenticated'),
    (e2, 'e2e-member-tscheck-x@example.com', 'authenticated', 'authenticated'),
    (p, 'someone-tscheck@avx.invalid', 'authenticated', 'authenticated');

  -- A real person: every function refuses them
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Real Co', p) returning id into org_p;
  ok := false;
  begin perform test_support.installed(); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'CHECK FAILED: a non-e2e account could call installed()'; end if;
  ok := false;
  begin perform test_support.make_me_avx_admin(); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'CHECK FAILED: a non-e2e account could become an AVX admin'; end if;
  ok := false;
  begin perform test_support.run_recurring_expenses(org_p); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'CHECK FAILED: a non-e2e account could run a job for its organisation'; end if;
  reset role;
  select count(*) into n from private.avx_admins where user_id = p;
  if n <> 0 then raise exception 'CHECK FAILED: the real person became an AVX admin'; end if;

  -- The e2e account: installed, and can make itself an AVX admin
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if test_support.installed() is null then raise exception 'CHECK FAILED: installed() returned nothing'; end if;
  perform test_support.make_me_avx_admin();
  insert into organisations (name, created_by) values ('E2E Co', e) returning id into org_e;
  insert into organisations (name, created_by) values ('Mixed Co', e) returning id into org_mixed;
  reset role;
  select count(*) into n from private.avx_admins where user_id = e;
  if n <> 1 then raise exception 'CHECK FAILED: the e2e account did not become an AVX admin'; end if;

  -- Its own all-e2e organisation: the jobs run
  insert into org_members (org_id, user_id, role) values (org_e, e2, 'member') on conflict do nothing;
  set local role authenticated;
  perform test_support.run_recurring_expenses(org_e);
  perform test_support.run_overdue_invoice_reminders(org_e);
  perform test_support.run_held_invite_reminders(org_e);
  perform test_support.run_maintenance_reminders(org_e);
  perform * from test_support.email_summary_candidates(org_e);

  -- An organisation the e2e account doesn't admin (the real person's): refused
  ok := false;
  begin perform test_support.run_recurring_expenses(org_p); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'CHECK FAILED: an e2e account ran a job for an organisation it is not admin of'; end if;
  reset role;

  -- An organisation with a real person in it: refused, even for its e2e admin
  insert into org_members (org_id, user_id, role) values (org_mixed, p, 'member') on conflict do nothing;
  set local role authenticated;
  ok := false;
  begin perform test_support.run_overdue_invoice_reminders(org_mixed); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'CHECK FAILED: a job ran for an organisation with a non-e2e member'; end if;
  ok := false;
  begin perform * from test_support.email_summary_candidates(org_mixed); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'CHECK FAILED: the summary list opened for an organisation with a non-e2e member'; end if;

  -- An unknown kind is refused
  ok := false;
  begin perform test_support.expire('organisation', org_e); exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'CHECK FAILED: expire() accepted an unknown kind'; end if;
  reset role;

  -- Signed out (anon): no access at all
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  ok := false;
  begin perform test_support.installed(); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'CHECK FAILED: a signed-out caller reached test_support'; end if;
  reset role;

  raise exception 'ALL TEST SUPPORT CHECKS PASSED';
end $$;
