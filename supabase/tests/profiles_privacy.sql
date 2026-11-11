-- Checks for migrations 20270120000000_profiles_privacy.sql and 20270120000001_profiles_privacy_columns.sql (issue #188).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL PROFILES PRIVACY CHECKS PASSED"  → good
-- Who: a = admin of Show Co, m = member of Show Co, c = freelance crew on Show Co's gig (not a member),
-- c2 = second crew on that gig, f = findable crew with a crew profile on, x = admin of Other Co,
-- s = stranger (no company, no gig, no conversation).
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  c2 uuid := gen_random_uuid(); f uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  s uuid := gen_random_uuid();
  org_a uuid; org_x uuid; gig uuid; conv uuid; n integer; v jsonb; t text; ok boolean;
begin
  insert into auth.users (id, email, aud, role)
  select u.i, 'pp-' || u.o || '@avx.invalid', 'authenticated', 'authenticated'
  from unnest(array[a, m, c, c2, f, x, s]) with ordinality u(i, o);
  insert into profiles (id) select unnest(array[a, m, c, c2, f, x, s]) on conflict (id) do nothing;
  update profiles set full_name = 'Ana Admin', phone = '+351 900 000 001' where id = a;
  update profiles set full_name = 'Mia Member' where id = m;
  update profiles set full_name = 'Carla Crew', phone = '+351 900 000 003', weekly_numbers = true where id = c;
  update profiles set full_name = 'Caio Crew' where id = c2;
  update profiles set full_name = 'Filipa Findable', phone = '+351 900 000 005', findable_by = 'crew' where id = f;
  update profiles set full_name = 'Xavier Other' where id = x;
  update profiles set full_name = 'Sara Stranger', phone = '+351 900 000 007' where id = s;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Show Co', a) returning id into org_a;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_x;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');
  insert into gigs (org_id, name, created_by) values (org_a, 'Privacy Gig', a) returning id into gig;
  insert into gig_members (gig_id, user_id, role) values (gig, c, 'crew'), (gig, c2, 'crew');
  insert into crew_profiles (user_id, functions, base_place, base_country, base_lat, base_lng, languages, enabled, visibility)
  values (f, '{rigger}', 'Porto, Portugal', 'PT', 41.15, -8.61, '{pt}', true, 'crew');

  -- ── 1. A stranger sees only themselves ──────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from profiles;
  if n <> 1 then raise exception 'FAIL 1.1: stranger sees % profiles, expected only their own', n; end if;
  select count(*) into n from profiles where id in (a, m, c, c2, f, x);
  if n <> 0 then raise exception 'FAIL 1.2: stranger sees % other profiles', n; end if;
  begin
    perform phone from profiles where id = s;
    raise exception 'FAIL 1.3: phone readable from the table';
  exception when insufficient_privilege then null; end;
  begin
    perform weekly_numbers, email_digest from profiles where id = s;
    raise exception 'FAIL 1.4: notification switches readable from the table';
  exception when insufficient_privilege then null; end;
  select count(*) into n from gig_crew_phones(gig);
  if n <> 0 then raise exception 'FAIL 1.5: stranger got % gig phones', n; end if;
  -- Their own full profile still comes back through my_profile()
  select phone into t from my_profile();
  if t is distinct from '+351 900 000 007' then raise exception 'FAIL 1.6: my_profile phone = %', t; end if;
  -- And they can still change their own settings, but nobody else's
  update profiles set phone = '+351 900 000 077', email_digest = false where id = s;
  update profiles set full_name = 'Hacked' where id = a;
  reset role;
  if not exists (select 1 from profiles where id = s and phone = '+351 900 000 077' and email_digest = false) then
    raise exception 'FAIL 1.7: own settings not saved';
  end if;
  if exists (select 1 from profiles where id = a and full_name = 'Hacked') then raise exception 'FAIL 1.8: edited someone else'; end if;

  -- ── 2. Org-mates and gig crew see what they need ────────────────────────────────────────
  -- m (member): org-mate a and the gig's crew c, c2; not f, x, s
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from profiles where id in (a, c, c2);
  if n <> 3 then raise exception 'FAIL 2.1: member sees % of admin + crew, expected 3', n; end if;
  select count(*) into n from profiles where id in (f, x, s);
  if n <> 0 then raise exception 'FAIL 2.2: member sees % unrelated profiles', n; end if;
  -- the crew list's phones
  select phone into t from gig_crew_phones(gig) where user_id = c;
  if t is distinct from '+351 900 000 003' then raise exception 'FAIL 2.3: crew phone for the company = %', t; end if;
  reset role;

  -- c (crew, not a member): co-crew c2 and the gig company's people a, m; not f, x, s
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from profiles where id in (c2, a, m);
  if n <> 3 then raise exception 'FAIL 2.4: crew sees % of co-crew + company, expected 3', n; end if;
  select count(*) into n from profiles where id in (f, x, s);
  if n <> 0 then raise exception 'FAIL 2.5: crew sees % unrelated profiles', n; end if;
  -- c and a (the gig's creator is on its crew) have phones; nobody outside the gig is listed
  select count(*) into n from gig_crew_phones(gig) where user_id in (c, a);
  if n <> 2 then raise exception 'FAIL 2.6: crew got % of the 2 gig phones', n; end if;
  select count(*) into n from gig_crew_phones(gig) where user_id in (f, s, x);
  if n <> 0 then raise exception 'FAIL 2.6b: gig phones list people outside the gig'; end if;
  select weekly_numbers into ok from my_profile();
  if ok is not true then raise exception 'FAIL 2.7: my_profile weekly_numbers'; end if;
  reset role;

  -- x (other company): sees nobody at Show Co
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from profiles where id in (a, m, c, c2);
  if n <> 0 then raise exception 'FAIL 2.8: other company sees % Show Co profiles', n; end if;
  select count(*) into n from gig_crew_phones(gig);
  if n <> 0 then raise exception 'FAIL 2.9: other company got gig phones'; end if;

  -- ── 3. Find crew still works (through its own functions, not the table) ─────────────────
  v := crew_profile(f);
  if v ->> 'name' is distinct from 'Filipa Findable' then raise exception 'FAIL 3.1: Find crew card name = %', v ->> 'name'; end if;
  if v ? 'phone' then raise exception 'FAIL 3.2: Find crew card shows a phone'; end if;
  select count(*) into n from profiles where id = f;
  if n <> 0 then raise exception 'FAIL 3.3: searcher reads the profile row before any contact'; end if;
  reset role;

  -- x contacts f (a notification to f, actor x): f now sees x's name
  insert into notifications (user_id, actor_id, kind, details) values (f, x, 'crew_contact', '{}'::jsonb);
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from profiles where id = x;
  if n <> 1 then raise exception 'FAIL 3.4: crew cannot see who contacted them'; end if;
  reset role;

  -- ── 4. A conversation you're both in ────────────────────────────────────────────────────
  insert into conversations (kind, direct_key) values ('direct', least(f::text, s::text) || ':' || greatest(f::text, s::text)) returning id into conv;
  insert into conversation_members (conversation_id, user_id) values (conv, f), (conv, s) on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from profiles where id = f;
  if n <> 1 then raise exception 'FAIL 4.1: conversation partner not visible'; end if;
  select count(*) into n from gig_crew_phones(gig);
  if n <> 0 then raise exception 'FAIL 4.2: conversation gave gig phones'; end if;
  reset role;

  raise exception 'ALL PROFILES PRIVACY CHECKS PASSED';
end $$;
