-- Checks for migration 20270101000000_report_extras.sql (K9, report extras).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL REPORT EXTRAS CHECKS PASSED"  → good
-- Who: a = admin of Show Co (opted in to the weekly email), b = second admin (not opted in),
-- m = member, v = viewer, x = admin of Other Co (opted in, then mutes Other Co).
-- No destructive statements, so it can run through the Supabase connector.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  v uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g1 uuid; view_id uuid; link jsonb; link2 jsonb; out jsonb; n integer; ok boolean;
  at_ timestamptz := '2026-10-15 12:00+00';
begin
  insert into auth.users (id, email, aud, role)
  select t.i, 'k9-' || t.o || '@avx.invalid', 'authenticated', 'authenticated'
  from unnest(array[a, b, m, v, x]) with ordinality t(i, o);
  insert into profiles (id) select unnest(array[a, b, m, v, x]) on conflict (id) do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_b;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Show Co', a) returning id into org_a;
  reset role;
  update organisations set time_zone = 'Europe/Lisbon' where id = org_a;
  insert into org_members (org_id, user_id, role) values (org_a, b, 'admin'), (org_a, m, 'member'), (org_a, v, 'viewer');
  insert into gigs (org_id, name, status, created_by, start_date, end_date)
  values (org_a, 'October gig', 'confirmed', a, '2026-10-20', '2026-10-21') returning id into g1;

  -- ── 1. Weekly email ────────────────────────────────────────────────────────
  if (select weekly_numbers from profiles where id = a) then raise exception 'FAIL 1.1: weekly email must be off by default'; end if;
  update profiles set weekly_numbers = true where id in (a, x, m);
  -- Recipients: a for Show Co, x for Other Co; not b (not opted in), not m (not an admin)
  select count(*) into n from public.weekly_numbers_recipients() r where r.org_id in (org_a, org_b);
  if n <> 2 then raise exception 'FAIL 1.2: expected 2 recipients, got %', n; end if;
  if not exists (select 1 from public.weekly_numbers_recipients() r where r.user_id = a and r.org_id = org_a and r.org_name = 'Show Co') then
    raise exception 'FAIL 1.3: a should get Show Co''s email';
  end if;
  -- A muted organisation gets no email
  insert into org_mutes (user_id, org_id) values (x, org_b);
  if exists (select 1 from public.weekly_numbers_recipients() r where r.user_id = x) then raise exception 'FAIL 1.4: muted organisation still emailed'; end if;

  -- The numbers, counted as a: one gig this month (October); the caller's claims are put back
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  out := public.weekly_key_numbers(org_a, a, at_);
  if out is null or (out -> 'gigs_this_month' ->> 'total')::int <> 1 then raise exception 'FAIL 1.5: weekly numbers wrong: %', out -> 'gigs_this_month'; end if;
  if not (out ? 'follow_up' and out ? 'crew_to_pay' and out ? 'items_short_30' and out ? 'open_positions_14' and out ? 'best_earner_year') then
    raise exception 'FAIL 1.6: weekly numbers miss the K4–K8 parts';
  end if;
  if auth.uid() is distinct from v then raise exception 'FAIL 1.7: claims not put back (%)', auth.uid(); end if;
  if public.weekly_key_numbers(org_a, b, at_) is not null then raise exception 'FAIL 1.8: not opted in, yet numbers'; end if;
  if public.weekly_key_numbers(org_a, m, at_) is not null then raise exception 'FAIL 1.9: a member got the admin email'; end if;
  if public.weekly_key_numbers(org_a, x, at_) is not null then raise exception 'FAIL 1.10: another organisation''s admin got numbers'; end if;

  -- Once per person, organisation and week
  perform public.claim_weekly_numbers(a, org_a, '2026-10-12');
  begin
    perform public.claim_weekly_numbers(a, org_a, '2026-10-12');
    raise exception 'FAIL 1.11: second weekly email in the same week allowed';
  exception when sqlstate '54000' then null;
  end;
  perform public.claim_weekly_numbers(a, org_a, '2026-10-19');

  -- Only the service role may call the email functions
  if has_function_privilege('authenticated', 'public.weekly_key_numbers(uuid, uuid, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.weekly_key_numbers(uuid, uuid, timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.weekly_numbers_recipients()', 'execute')
     or has_function_privilege('authenticated', 'public.claim_weekly_numbers(uuid, uuid, date)', 'execute')
     or has_function_privilege('authenticated', 'private.report_claims_swap(text, text)', 'execute') then
    raise exception 'FAIL 1.12: email functions callable by signed-in users';
  end if;

  -- ── 2. Saved views ─────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into report_views (org_id, name, tab, query) values (org_a, 'Cash this year', 'money', 'view=cash&period=this_year') returning id into view_id;
  if (select user_id from report_views where id = view_id) <> a then raise exception 'FAIL 2.1: view not owned by its maker'; end if;
  update report_views set pinned = false where id = view_id;
  reset role;
  -- m (who sees money) can't see or change a's view
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if exists (select 1 from report_views where id = view_id) then raise exception 'FAIL 2.2: someone else''s saved view is visible'; end if;
  update report_views set name = 'Mine now' where id = view_id;
  insert into report_views (org_id, name, tab) values (org_a, 'Sales', 'sales');
  reset role;
  if (select name from report_views where id = view_id) <> 'Cash this year' then raise exception 'FAIL 2.3: someone else changed a saved view'; end if;
  -- A viewer (no money) may not save views
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into report_views (org_id, name, tab) values (org_a, 'Peek', 'money');
    raise exception 'FAIL 2.4: a viewer saved a view';
  exception when insufficient_privilege then null;
  end;
  reset role;
  -- Bad tab or a query with spaces is refused
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into report_views (org_id, name, tab, query) values (org_a, 'Bad', 'money', 'a=b c');
    raise exception 'FAIL 2.5: query with a space saved';
  exception when check_violation then null;
  end;
  -- Removed by marking; the user_id can't be changed
  update report_views set removed_at = now() where id = view_id;
  begin
    update report_views set user_id = m where id = view_id;
    raise exception 'FAIL 2.6: user_id changed';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if (select removed_at from report_views where id = view_id) is null then raise exception 'FAIL 2.7: view not marked removed'; end if;

  -- ── 3. Accountant link ─────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  link := public.create_report_link(org_a, 'Accountant 2026', '2026-01-01', '2027-01-01', 30);
  link2 := public.create_report_link(org_a, 'Second', '2026-01-01', '2026-07-01', 7);
  if length(link ->> 'token') < 30 then raise exception 'FAIL 3.1: token too short'; end if;
  -- Admins see the link but never its hash
  if not exists (select 1 from report_links where id = (link ->> 'id')::uuid) then raise exception 'FAIL 3.2: admin can''t list the link'; end if;
  begin
    perform token_hash from report_links;
    raise exception 'FAIL 3.3: hash readable';
  exception when insufficient_privilege then null;
  end;
  -- Bad input
  begin
    perform public.create_report_link(org_a, 'Too long', '2024-01-01', '2027-01-01', 30);
    raise exception 'FAIL 3.4: three-year period allowed';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.create_report_link(org_a, 'Forever', '2026-01-01', '2027-01-01', 365);
    raise exception 'FAIL 3.5: one-year expiry allowed';
  exception when sqlstate '22023' then null;
  end;
  reset role;
  if (select token_hash from report_links where id = (link ->> 'id')::uuid) <> encode(extensions.digest(link ->> 'token', 'sha256'), 'hex') then
    raise exception 'FAIL 3.6: stored hash is not the token''s SHA-256';
  end if;
  if exists (select 1 from report_links where token_hash = link ->> 'token') then raise exception 'FAIL 3.7: token stored in clear'; end if;

  -- Members, viewers and other organisations may not make, see or revoke links
  foreach n in array array[1, 2, 3] loop
    perform set_config('request.jwt.claims', json_build_object('sub', (array[m, v, x])[n], 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.create_report_link(org_a, 'Mine', '2026-01-01', '2027-01-01', 30);
      raise exception 'FAIL 3.8: non-admin % made a link', n;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.revoke_report_link((link ->> 'id')::uuid);
      raise exception 'FAIL 3.9: non-admin % revoked a link', n;
    exception when insufficient_privilege then null;
    end;
    if exists (select 1 from report_links where org_id = org_a) then raise exception 'FAIL 3.10: non-admin % sees links', n; end if;
    reset role;
  end loop;
  if has_function_privilege('authenticated', 'public.report_link_view(text, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.report_link_view(text, timestamptz)', 'execute') then
    raise exception 'FAIL 3.11: report_link_view callable without the service role';
  end if;

  -- The page: the year's numbers, counted as the admin who made it; views counted
  perform set_config('request.jwt.claims', '', true);
  out := public.report_link_view(encode(extensions.digest(link ->> 'token', 'sha256'), 'hex'), now());
  if out is null then raise exception 'FAIL 3.12: valid link shows nothing'; end if;
  if out ->> 'label' <> 'Accountant 2026' or out -> 'org' ->> 'name' <> 'Show Co' or out ->> 'from' <> '2026-01-01'
     or jsonb_typeof(out -> 'months') <> 'array' or jsonb_typeof(out -> 'cash') <> 'array' or jsonb_typeof(out -> 'spending') <> 'array' then
    raise exception 'FAIL 3.13: link page incomplete: %', out;
  end if;
  if (select views from report_links where id = (link ->> 'id')::uuid) <> 1 then raise exception 'FAIL 3.14: view not counted'; end if;
  if auth.uid() is not null then raise exception 'FAIL 3.15: claims not put back after the link page'; end if;
  -- Unknown or malformed hash: nothing
  if public.report_link_view(repeat('0', 64), now()) is not null or public.report_link_view('nope', now()) is not null then
    raise exception 'FAIL 3.16: unknown link shows something';
  end if;

  -- Expired: nothing (checked with the clock a day after expiry, then by moving the expiry)
  if public.report_link_view(encode(extensions.digest(link2 ->> 'token', 'sha256'), 'hex'), now() + interval '8 days') is not null then
    raise exception 'FAIL 3.17: expired link (clock) shows something';
  end if;
  update report_links set expires_at = now() - interval '1 minute' where id = (link2 ->> 'id')::uuid;
  if public.report_link_view(encode(extensions.digest(link2 ->> 'token', 'sha256'), 'hex'), now()) is not null then
    raise exception 'FAIL 3.18: expired link shows something';
  end if;

  -- Revoked: nothing
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.revoke_report_link((link ->> 'id')::uuid);
  reset role;
  if (select revoked_by from report_links where id = (link ->> 'id')::uuid) <> b then raise exception 'FAIL 3.19: revoke not recorded'; end if;
  if public.report_link_view(encode(extensions.digest(link ->> 'token', 'sha256'), 'hex'), now()) is not null then
    raise exception 'FAIL 3.20: revoked link shows something';
  end if;

  -- The maker is no longer an admin: nothing
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  link := public.create_report_link(org_a, 'Third', '2026-01-01', '2027-01-01', 30);
  reset role;
  update org_members set role = 'member' where org_id = org_a and user_id = a;
  if public.report_link_view(encode(extensions.digest(link ->> 'token', 'sha256'), 'hex'), now()) is not null then
    raise exception 'FAIL 3.21: link of a former admin shows something';
  end if;

  raise exception 'ALL REPORT EXTRAS CHECKS PASSED';
end $$;
