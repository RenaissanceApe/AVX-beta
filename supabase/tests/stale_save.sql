-- Checks for migration 20261209000000 (stale-save guard).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL STALE SAVE CHECKS PASSED"  → good
-- The app saves edit forms with "where updated_at = <what I opened>". These checks play two
-- people, A and B, editing the same gig, schedule item and price-list item.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); k uuid := gen_random_uuid();
  org_a uuid; g uuid; s uuid; p uuid; opened timestamptz; after_b timestamptz; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'ss-a@avx.invalid', 'authenticated', 'authenticated'), (b, 'ss-b@avx.invalid', 'authenticated', 'authenticated'),
    (k, 'ss-k@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Stale Co', a) returning id into org_a;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, b, 'admin');
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_a, 'Gig', current_date, current_date, 'confirmed', a) returning id into g;
  insert into gig_members (gig_id, user_id, role) values (g, a, 'pm'), (g, b, 'pm'), (g, k, 'crew');
  insert into gig_schedule (gig_id, day, start_time, title, created_by) values (g, current_date, '09:00', 'Load-in', a) returning id into s;
  insert into price_items (org_id, name, unit_price, created_by) values (org_a, 'Speaker', 10, a) returning id into p;

  -- Gig: A and B both open it; B saves first; A's save with the old stamp changes nothing
  select updated_at into opened from gigs where id = g;
  if opened is null then raise exception 'CHECK FAILED: gigs.updated_at filled for existing rows'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update gigs set name = 'B''s name' where id = g and updated_at = opened;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: first save goes through'; end if;
  select updated_at into after_b from gigs where id = g;
  if after_b <= opened then raise exception 'CHECK FAILED: gig save moves updated_at on'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  update gigs set name = 'A''s name' where id = g and updated_at = opened;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: stale gig save refused'; end if;
  if (select name from gigs where id = g) <> 'B''s name' then raise exception 'CHECK FAILED: B''s gig changes kept'; end if;
  -- With the fresh stamp (after reloading) A's save goes through
  update gigs set name = 'A''s name' where id = g and updated_at = after_b;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: save after reload'; end if;
  -- Nobody can pin the stamp to dodge the guard
  update gigs set updated_at = opened where id = g;
  if (select updated_at from gigs where id = g) <= after_b then raise exception 'CHECK FAILED: gig stamp set by the server'; end if;
  -- Crew can't edit the gig: same stamp, nothing written (the app reports "no permission")
  select updated_at into opened from gigs where id = g;
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  update gigs set name = 'Crew name' where id = g and updated_at = opened;
  get diagnostics n = row_count;
  if n <> 0 or (select updated_at from gigs where id = g) <> opened then raise exception 'CHECK FAILED: crew gig edit'; end if;

  -- Schedule item: same story
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select updated_at into opened from gig_schedule where id = s;
  if opened is null then raise exception 'CHECK FAILED: gig_schedule.updated_at filled'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  update gig_schedule set title = 'Load-in (B)' where id = s and updated_at = opened;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: first schedule save'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  update gig_schedule set title = 'Load-in (A)' where id = s and updated_at = opened;
  get diagnostics n = row_count;
  if n <> 0 or (select title from gig_schedule where id = s) <> 'Load-in (B)' then raise exception 'CHECK FAILED: stale schedule save refused'; end if;

  -- Price-list item: same story
  select updated_at into opened from price_items where id = p;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  update price_items set unit_price = 12 where id = p and updated_at = opened;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: first price save'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  -- The app also sends its own clock as updated_at; the server's stamp wins
  update price_items set unit_price = 11, updated_at = opened where id = p and updated_at = opened;
  get diagnostics n = row_count;
  if n <> 0 or (select unit_price from price_items where id = p) <> 12 then raise exception 'CHECK FAILED: stale price save refused'; end if;
  if (select updated_at from price_items where id = p) <= opened then raise exception 'CHECK FAILED: price stamp moved on'; end if;
  reset role;

  -- The trigger function isn't callable by app users
  if has_function_privilege('authenticated', 'private.touch_updated_at()', 'execute') then
    raise exception 'CHECK FAILED: touch_updated_at locked down';
  end if;

  raise exception 'ALL STALE SAVE CHECKS PASSED';
end $$;
