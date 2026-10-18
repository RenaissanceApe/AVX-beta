-- Checks for migration 20261022000001 (anonymous usage counts).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL USAGE CHECKS PASSED"  → good
do $$
declare u uuid := gen_random_uuid(); cnt int; ok boolean;
begin
  insert into auth.users (id, email, aud, role) values (u, 'usage@avx.invalid', 'authenticated', 'authenticated');
  -- Signed out: can't count anything
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform track_usage(array['view:dashboard']);
    raise exception 'CHECK FAILED: anon could call track_usage';
  exception when insufficient_privilege then null; end;
  reset role;
  -- Signed in: valid names are counted, anything else is ignored; raw counts stay private
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform track_usage(array['view:test-a', 'view:test-a', 'BAD EVENT; x', 'quote:sent']);
  begin
    perform 1 from private.usage_daily;
    raise exception 'CHECK FAILED: users can read the raw counts';
  exception when insufficient_privilege then null; end;
  reset role;
  select d.n into cnt from private.usage_daily d where d.day = current_date and d.event = 'view:test-a';
  if cnt <> 2 then raise exception 'CHECK FAILED: count is %', cnt; end if;
  select not exists (select 1 from private.usage_daily d where d.event ilike 'bad%') into ok;
  if not ok then raise exception 'CHECK FAILED: bad event stored'; end if;
  raise exception 'ALL USAGE CHECKS PASSED';
end $$;
