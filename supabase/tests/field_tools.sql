-- Checks for migration 20261110000000 (field tools F1a: tools per gig, show model, input list).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL FIELD TOOL CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g1 uuid; g2 uuid; mic uuid; other_mic uuid; i1 uuid; i2 uuid; i3 uuid; n int; t text;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'ft-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'ft-m@avx.invalid', 'authenticated', 'authenticated'),
    (c, 'ft-c@avx.invalid', 'authenticated', 'authenticated'), (o, 'ft-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Tools Co', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'SM58', 5, a, 'bulk') returning id into mic;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  reset role;

  -- Another organisation's item can't be linked
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', o) returning id into org_b;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_b, 'Beta 58', 5, o, 'bulk') returning id into other_mic;
  reset role;

  -- The organisation's tools: the two of F1 by default; only known tools
  select array_to_string(field_tools, ',') into t from organisations where id = org_a;
  if t <> 'stage_plot,input_list' then raise exception 'CHECK FAILED: default tools %', t; end if;
  begin
    update organisations set field_tools = array['input_list', 'karaoke'] where id = org_a;
    raise exception 'CHECK FAILED: unknown tool';
  exception when check_violation then null; end;

  -- A member adds the input list to a draft gig, and the shared show model
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_tools (gig_id, tool) values (g1, 'input_list');
  insert into gig_show (gig_id, stage) values (g1, '{"width_m": 12, "depth_m": 8}');
  update gig_show set stage = stage || '{"trim_m": 7}' where gig_id = g1;
  select stage->>'trim_m' into t from gig_show where gig_id = g1;
  if t <> '7' then raise exception 'CHECK FAILED: show model not updated'; end if;
  insert into gig_inputs (gig_id, channel, source, mic, item_id, phantom) values (g1, 1, ' Kick in ', 'Beta 91', null, true) returning id into i1;
  insert into gig_inputs (gig_id, channel, source, mic, item_id) values (g1, 2, 'Snare', 'SM57', null) returning id into i2;
  insert into gig_inputs (gig_id, channel, source, mic, item_id) values (g1, 3, 'Vocal', 'SM58', mic) returning id into i3;
  select source into t from gig_inputs where id = i1;
  if t <> 'Kick in' then raise exception 'CHECK FAILED: source not trimmed (%)', t; end if;
  begin
    insert into gig_inputs (gig_id, channel, source) values (g1, 2, 'Second snare');
    raise exception 'CHECK FAILED: two inputs on one channel';
  exception when unique_violation then null; end;
  begin
    insert into gig_inputs (gig_id, channel, source, item_id) values (g1, 9, 'Guest', other_mic);
    raise exception 'CHECK FAILED: another company''s item linked';
  exception when check_violation then null; end;

  -- New order: vocal first
  n := order_inputs(g1, array[i3, i1, i2]);
  if n <> 3 then raise exception 'CHECK FAILED: % inputs renumbered', n; end if;
  select string_agg(source, ',' order by channel) into t from gig_inputs where gig_id = g1;
  if t <> 'Vocal,Kick in,Snare' then raise exception 'CHECK FAILED: order %', t; end if;
  reset role;

  -- Crew read, but don't change
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_inputs where gig_id = g1;
  if n <> 3 then raise exception 'CHECK FAILED: crew see % inputs', n; end if;
  select count(*) into n from gig_tools where gig_id = g1;
  if n <> 1 then raise exception 'CHECK FAILED: crew don''t see the tools'; end if;
  update gig_inputs set source = 'Hacked' where gig_id = g1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew changed an input'; end if;
  begin
    insert into gig_inputs (gig_id, channel, source) values (g1, 10, 'Crew line');
    raise exception 'CHECK FAILED: crew added an input';
  exception when insufficient_privilege then null; end;
  begin
    perform order_inputs(g1, array[i1]);
    raise exception 'CHECK FAILED: crew reordered';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Outsiders see nothing
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_inputs where gig_id = g1;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees inputs'; end if;
  select count(*) into n from gig_show where gig_id = g1;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees the show model'; end if;
  begin
    insert into gig_tools (gig_id, tool) values (g1, 'stage_plot');
    raise exception 'CHECK FAILED: outsider added a tool';
  exception when insufficient_privilege then null; end;
  reset role;

  -- A tool the organisation turned off can't be added
  update organisations set field_tools = array['input_list'] where id = org_a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into gig_tools (gig_id, tool) values (g1, 'stage_plot');
    raise exception 'CHECK FAILED: added a tool the organisation doesn''t use';
  exception when check_violation then null; end;
  reset role;

  raise exception 'ALL FIELD TOOL CHECKS PASSED';
end $$;
