-- Checks for migration 20270111000001 (upkeep U3: the nightly clean-up). RUN BY HAND in the TEST
-- project's SQL editor after applying that migration by hand (it removes rows, so neither the
-- migration nor this test goes through the connector). Rolls itself back; ends with
--   "ALL DATA RETENTION CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); org_a uuid; res jsonb; n int;
begin
  insert into auth.users (id, email, aud, role) values (a, 'dr-a@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Retention Co', a) returning id into org_a;
  reset role;

  insert into crew_search_log (org_id, searched_by, results, created_at) values
    (org_a, a, 1, now() - interval '31 days'), (org_a, a, 2, now() - interval '29 days'), (org_a, a, 3, now());
  insert into notifications (user_id, org_id, kind, details, read_at, created_at) values
    (a, org_a, 'test_old_read',   '{}', now() - interval '13 months', now() - interval '14 months'),
    (a, org_a, 'test_recent_read','{}', now() - interval '11 months', now() - interval '2 years'),
    (a, org_a, 'test_unread',     '{}', null,                          now() - interval '3 years'),
    (a, org_a, 'test_new',        '{}', null,                          now());

  res := private.run_data_retention();

  select count(*) into n from crew_search_log where org_id = org_a;
  if n <> 2 or exists (select 1 from crew_search_log where org_id = org_a and results = 1) then
    raise exception 'CHECK FAILED: search log kept % rows (%)', n, res;
  end if;
  if exists (select 1 from notifications where user_id = a and kind = 'test_old_read') then
    raise exception 'CHECK FAILED: a notification read 13 months ago is still there';
  end if;
  select count(*) into n from notifications where user_id = a and kind in ('test_recent_read', 'test_unread', 'test_new');
  if n <> 3 then raise exception 'CHECK FAILED: removed a recent or unread notification (% left)', n; end if;

  if has_function_privilege('authenticated', 'private.run_data_retention()', 'execute')
     or has_function_privilege('anon', 'private.run_data_retention()', 'execute') then
    raise exception 'CHECK FAILED: clean-up callable through the API';
  end if;
  select count(*) into n from cron.job where jobname = 'avx-data-retention';
  if n <> 1 then raise exception 'CHECK FAILED: clean-up not scheduled'; end if;

  raise exception 'ALL DATA RETENTION CHECKS PASSED';
end $$;
