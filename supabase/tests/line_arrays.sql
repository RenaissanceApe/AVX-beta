-- Checks for migration 20270109000000 (RG3 line arrays: the second person's check of a speaker's
-- rigging data, and arrays kept in gig_show.rigging).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL LINE ARRAY CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; g1 uuid; item uuid; res jsonb; r jsonb; t text;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'la-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'la-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'la-v@avx.invalid', 'authenticated', 'authenticated'), (o, 'la-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Array Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member') on conflict do nothing;
  insert into org_members (org_id, user_id, role) values (org_a, v, 'viewer') on conflict do nothing;

  -- A types the rigging data, trying to mark it checked at once: it's stored as not checked, typed by A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into price_items (org_id, created_by, name, kind, unit, speaker_type, speaker_preset, rigging)
  values (org_a, a, 'K2', 'rental', 'day', 'line_array', 'l-acoustics-k2',
    '{"frame_limits": "K2-BUMP 16 / 24", "source": "K2 OM v4.0", "checked": true, "checked_by": "00000000-0000-0000-0000-000000000000"}')
  returning id into item;
  select rigging into r from price_items where id = item;
  if (r ->> 'checked')::boolean then raise exception 'CHECK FAILED: typed data arrived checked'; end if;
  if r ? 'checked_by' then raise exception 'CHECK FAILED: a made-up checker was kept'; end if;
  if r ->> 'entered_by' is distinct from a::text then raise exception 'CHECK FAILED: typist not kept (%)', r ->> 'entered_by'; end if;

  -- …and can't check it themselves
  begin
    perform mark_speaker_rigging_checked(item, 'fp1');
    raise exception 'CHECK FAILED: the typist checked their own data';
  exception when insufficient_privilege then null; end;
  -- A plain update can't mark it checked either
  update price_items set rigging = rigging || '{"checked": true}' where id = item;
  select rigging into r from price_items where id = item;
  if (r ->> 'checked')::boolean then raise exception 'CHECK FAILED: plain update marked it checked'; end if;
  reset role;

  -- A viewer (can't edit the catalogue) can't check it
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform mark_speaker_rigging_checked(item, 'fp1');
    raise exception 'CHECK FAILED: a viewer checked the data';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Someone outside the organisation can't
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform mark_speaker_rigging_checked(item, 'fp1');
    raise exception 'CHECK FAILED: an outsider checked the data';
  exception when insufficient_privilege then null; end;
  reset role;

  -- A second person who can edit the catalogue checks it
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := mark_speaker_rigging_checked(item, 'fp1');
  if not (res ->> 'checked')::boolean or res ->> 'checked_by' is distinct from m::text or res ->> 'checked_frames' <> 'fp1' then
    raise exception 'CHECK FAILED: sign-off not stored (%)', res;
  end if;
  -- Saving the item with the same rigging data keeps the check
  update price_items set name = 'K2 (L-Acoustics)', rigging = rigging where id = item;
  select rigging into r from price_items where id = item;
  if not (r ->> 'checked')::boolean then raise exception 'CHECK FAILED: unchanged save lost the check'; end if;
  -- Faking another checker on a checked row is ignored
  update price_items set rigging = rigging || jsonb_build_object('checked_by', o) where id = item;
  select rigging into r from price_items where id = item;
  if r ->> 'checked_by' is distinct from m::text then raise exception 'CHECK FAILED: checker could be changed'; end if;
  -- Changing the data clears the check, and the editor becomes the typist
  update price_items set rigging = rigging || '{"frame_limits": "K2-BUMP 16 / 25"}' where id = item;
  select rigging into r from price_items where id = item;
  if (r ->> 'checked')::boolean or r ? 'checked_by' then raise exception 'CHECK FAILED: changed data kept its check'; end if;
  if r ->> 'entered_by' is distinct from m::text then raise exception 'CHECK FAILED: new typist not kept'; end if;
  reset role;

  -- Data typed before this migration (no typist) can't be checked until someone saves it
  perform set_config('avx.rigging_signoff', 'on', true);
  update price_items set rigging = rigging - 'entered_by' where id = item;
  perform set_config('avx.rigging_signoff', 'off', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform mark_speaker_rigging_checked(item, null);
    raise exception 'CHECK FAILED: data without a typist was checked';
  exception when invalid_parameter_value then null; end;
  update price_items set rigging = rigging where id = item;
  select rigging ->> 'entered_by' into t from price_items where id = item;
  if t is distinct from a::text then raise exception 'CHECK FAILED: first save did not record the typist (%)', t; end if;
  reset role;

  -- Arrays are kept in the gig's rigging, beside the truss lines
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_show (gig_id, rigging) values (g1,
    '{"lines": [], "arrays": [{"id": "a1", "name": "Main L", "count": 12, "splays": [0, 0.25, 1, 2]}]}')
  on conflict (gig_id) do update set rigging = excluded.rigging;
  select rigging -> 'arrays' -> 0 ->> 'name' into t from gig_show where gig_id = g1;
  if t is distinct from 'Main L' then raise exception 'CHECK FAILED: array not kept'; end if;
  reset role;

  raise exception 'ALL LINE ARRAY CHECKS PASSED';
end $$;
