-- Checks for migration 20270103000000 (A1: speaker specs and rigging data on catalogue items).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL SPEAKER SPEC CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); v uuid := gen_random_uuid(); org_a uuid; res jsonb; n int; r record;
begin
  insert into auth.users (id, email, aud, role) values (a, 'spk-a@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'spk-v@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Speaker Co', a) returning id into org_a;

  -- Typed by hand: the specs and rigging data are kept
  insert into price_items (org_id, created_by, name, kind, unit, speaker_type, sensitivity_db, max_spl_db, dispersion_h, dispersion_v,
    freq_low_hz, freq_high_hz, impedance_ohm, amp_channels, speaker_preset, spec_source, rigging)
  values (org_a, a, 'Top box', 'rental', 'day', 'point_source', 99.5, 136, 90, 40, 55, 20000, 8, 2, 'demo-top', 'Datasheet v1',
    '{"cog": "as printed", "source": "Rigging manual 1.0"}');
  select * into r from price_items where org_id = org_a and name = 'Top box';
  if r.sensitivity_db <> 99.5 or r.dispersion_v <> 40 or r.amp_channels <> 2 or r.rigging ->> 'cog' <> 'as printed' then
    raise exception 'CHECK FAILED: specs not kept %', row_to_json(r);
  end if;

  -- Out-of-range values are refused
  begin update price_items set sensitivity_db = 150 where id = r.id; raise exception 'CHECK FAILED: sensitivity 150';
  exception when check_violation then null; end;
  begin update price_items set freq_low_hz = 30000 where id = r.id; raise exception 'CHECK FAILED: low above high';
  exception when check_violation then null; end;
  begin update price_items set speaker_type = 'horn' where id = r.id; raise exception 'CHECK FAILED: unknown type';
  exception when check_violation then null; end;
  begin update price_items set rigging = '[1, 2]' where id = r.id; raise exception 'CHECK FAILED: rigging not an object';
  exception when check_violation then null; end;
  begin update price_items set amp_channels = 0 where id = r.id; raise exception 'CHECK FAILED: 0 amp channels';
  exception when check_violation then null; end;
  begin update price_items set speaker_preset = 'Bad Preset!' where id = r.id; raise exception 'CHECK FAILED: preset id';
  exception when check_violation then null; end;

  -- The import creates items with specs, updates only the cells given, and refuses a bad row
  res := run_import(org_a, 'items', '[
    {"_row": 2, "name": "Array box", "code": "ARR", "speaker_type": "line_array", "max_spl_db": 140, "dispersion_h": 110,
     "freq_low_hz": 60, "freq_high_hz": 18000, "speaker_preset": "demo-array", "spec_source": "Spec sheet 2.0",
     "rigging": {"frame_limits": "as printed"}},
    {"_row": 3, "name": "Bad box", "code": "BAD", "impedance_ohm": 500}
  ]', 'speakers.csv');
  if (res ->> 'created')::int <> 1 or (res ->> 'skipped')::int <> 1 then raise exception 'CHECK FAILED: import %', res; end if;
  if (res -> 'problems' -> 0 ->> 'message') not like '%price_items_speaker_check%' then
    raise exception 'CHECK FAILED: bad row message %', res -> 'problems';
  end if;
  select * into r from price_items where org_id = org_a and code = 'ARR';
  if r.speaker_type <> 'line_array' or r.max_spl_db <> 140 or r.speaker_preset <> 'demo-array' or r.rigging ->> 'frame_limits' <> 'as printed' then
    raise exception 'CHECK FAILED: imported specs %', row_to_json(r);
  end if;
  res := run_import(org_a, 'items', '[{"code": "ARR", "sensitivity_db": 101}]');
  if (res ->> 'updated')::int <> 1 then raise exception 'CHECK FAILED: re-import %', res; end if;
  select * into r from price_items where org_id = org_a and code = 'ARR';
  if r.sensitivity_db <> 101 or r.max_spl_db <> 140 or r.spec_source <> 'Spec sheet 2.0' then
    raise exception 'CHECK FAILED: update lost cells %', row_to_json(r);
  end if;

  -- Undo puts the old value back
  perform undo_import((res ->> 'batch')::uuid);
  select sensitivity_db into r from price_items where org_id = org_a and code = 'ARR';
  if r.sensitivity_db is not null then raise exception 'CHECK FAILED: undo kept %', r.sensitivity_db; end if;

  -- A viewer of the organisation doesn't see or change the catalogue
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, v, 'viewer');
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from price_items where org_id = org_a and speaker_type is not null;
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees % speaker items', n; end if;
  update price_items set sensitivity_db = 90 where org_id = org_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: viewer changed % items', n; end if;

  reset role;
  raise exception 'ALL SPEAKER SPEC CHECKS PASSED';
end $$;
