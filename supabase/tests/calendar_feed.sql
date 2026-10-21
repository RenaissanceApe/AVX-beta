-- Checks for migration 20261120000000 (switching S4: calendar feed links).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL CALENDAR FEED CHECKS PASSED"  → good
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); t1 text; t2 text; t3 text; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'cf-a@avx.invalid', 'authenticated', 'authenticated'), (b, 'cf-b@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t1 := calendar_feed();
  t2 := calendar_feed();
  if t1 !~ '^[0-9a-f]{64}$' or t1 <> t2 then raise exception 'CHECK FAILED: same link each time (% / %)', t1, t2; end if;
  t3 := calendar_feed(true);
  if t3 = t1 then raise exception 'CHECK FAILED: new link not new'; end if;
  begin
    insert into calendar_feeds (user_id, token) values (a, repeat('a', 64));
    raise exception 'CHECK FAILED: direct insert';
  exception when insufficient_privilege or unique_violation then null; end;
  reset role;
  -- Someone else can't read it
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from calendar_feeds where user_id = a;
  if n <> 0 then raise exception 'CHECK FAILED: other people''s links visible'; end if;
  reset role;
  -- Signed out: no link
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform calendar_feed();
    raise exception 'CHECK FAILED: anon got a link';
  exception when insufficient_privilege then null; end;
  reset role;
  raise exception 'ALL CALENDAR FEED CHECKS PASSED';
end $$;
