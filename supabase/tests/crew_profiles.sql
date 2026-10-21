-- Checks for migration 20261122000000 (crew network N1: crew profiles).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL CREW PROFILE CHECKS PASSED"  → good
do $$
declare
  f uuid := gen_random_uuid(); c uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_c uuid; v jsonb; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (f, 'cp-f@avx.invalid', 'authenticated', 'authenticated'), (c, 'cp-c@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'cp-x@avx.invalid', 'authenticated', 'authenticated');
  -- c runs a company; f and x are freelancers
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Profile Co', c) returning id into org_c;
  reset role;

  -- f fills in a profile
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into crew_profiles (user_id, functions, base_place, base_country, base_lat, base_lng, languages, links, certificates)
  values (f, '{lighting_op,rigger,rigger}', ' Porto, Portugal ', 'PT', 41.15, -8.61, '{pt,en}', '{https://example.com/me}',
          '[{"name": " IPAF 3a ", "issuer": "", "expires_on": "2027-05-01"}]');
  select count(*) into n from crew_profiles where user_id = f and functions = '{lighting_op,rigger}' and base_place = 'Porto, Portugal'
     and certificates = '[{"name": "IPAF 3a", "expires_on": "2027-05-01"}]';
  if n <> 1 then raise exception 'CHECK FAILED: profile cleaned up'; end if;
  begin
    update crew_profiles set links = '{javascript:alert(1)}' where user_id = f;
    raise exception 'CHECK FAILED: bad link kept';
  exception when check_violation then null; end;
  begin
    update crew_profiles set certificates = '[{"issuer": "x"}]' where user_id = f;
    raise exception 'CHECK FAILED: certificate without a name';
  exception when invalid_parameter_value then null; end;
  -- Off: nobody else sees it
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if crew_profile(f) is not null then raise exception 'CHECK FAILED: switched-off profile seen'; end if;
  reset role;

  -- f switches it on (companies only, the default)
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update crew_profiles set enabled = true where user_id = f;
  if (crew_profile(f) ->> 'enabled')::boolean is not true then raise exception 'CHECK FAILED: own profile'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := crew_profile(f);
  if v ->> 'base_place' <> 'Porto, Portugal' or v ? 'base_lat' then raise exception 'CHECK FAILED: company view %', v; end if;
  -- The table itself stays private
  select count(*) into n from crew_profiles where user_id = f;
  if n <> 0 then raise exception 'CHECK FAILED: table readable by others'; end if;
  update crew_profiles set bio = 'hacked' where user_id = f;
  reset role;
  if exists (select 1 from crew_profiles where user_id = f and bio = 'hacked') then raise exception 'CHECK FAILED: edited by someone else'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if crew_profile(f) is not null then raise exception 'CHECK FAILED: crew saw a companies-only profile'; end if;
  reset role;

  -- Companies and crew: x sees it too
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update crew_profiles set visibility = 'crew' where user_id = f;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if crew_profile(f) is null then raise exception 'CHECK FAILED: crew could not see an open profile'; end if;
  reset role;
  -- Blocked: hidden both ways
  insert into user_blocks (user_id, blocked_id, active) values (f, x, true);
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if crew_profile(f) is not null then raise exception 'CHECK FAILED: blocked person saw the profile'; end if;
  reset role;

  -- Switching on needs a function and a base
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into crew_profiles (user_id, enabled) values (x, true);
    raise exception 'CHECK FAILED: empty profile switched on';
  exception when check_violation then null; end;
  reset role;

  -- Remove: cleared and off
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform clear_crew_profile();
  select count(*) into n from crew_profiles where user_id = f and not enabled and base_place is null and functions = '{}' and certificates = '[]';
  if n <> 1 then raise exception 'CHECK FAILED: profile not cleared'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if crew_profile(f) is not null then raise exception 'CHECK FAILED: cleared profile seen'; end if;
  reset role;

  -- Signed out
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform crew_profile(f);
    raise exception 'CHECK FAILED: anon read a profile';
  exception when insufficient_privilege then null; end;
  reset role;
  raise exception 'ALL CREW PROFILE CHECKS PASSED';
end $$;
