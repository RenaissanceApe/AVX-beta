-- Checks for migration 20261111000000 (field tools F1b: the stage plot).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL STAGE PLOT CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_b uuid; g1 uuid; wedge uuid; other uuid; p1 uuid; n int; t text;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'sp-a@avx.invalid', 'authenticated', 'authenticated'), (c, 'sp-c@avx.invalid', 'authenticated', 'authenticated'),
    (o, 'sp-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Plot Co', a) returning id into org_a;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Wedge', 30, a, 'serial') returning id into wedge;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'draft') returning id into g1;
  insert into gig_members (gig_id, user_id, role) values (g1, c, 'crew');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', o) returning id into org_b;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_b, 'Their wedge', 30, o, 'serial') returning id into other;
  reset role;

  -- The production manager draws: a drum kit, a wedge from the catalogue
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_show (gig_id, stage) values (g1, '{"width_m": 10, "depth_m": 6}');
  insert into gig_plot_items (gig_id, kind, label, x, y) values (g1, 'drum_kit', '  Drums  ', 5, 4) returning id into p1;
  insert into gig_plot_items (gig_id, kind, x, y, rotation, item_id) values (g1, 'wedge', 5, 0.5, 180, wedge);
  select label into t from gig_plot_items where id = p1;
  if t <> 'Drums' then raise exception 'CHECK FAILED: label not trimmed (%)', t; end if;
  update gig_plot_items set x = 6.25, rotation = 90 where id = p1;
  begin
    insert into gig_plot_items (gig_id, kind, x, y, rotation) values (g1, 'wedge', 1, 1, 45);
    raise exception 'CHECK FAILED: odd rotation';
  exception when check_violation then null; end;
  begin
    insert into gig_plot_items (gig_id, kind, x, y) values (g1, 'Bad Kind!', 1, 1);
    raise exception 'CHECK FAILED: odd kind';
  exception when check_violation then null; end;
  begin
    insert into gig_plot_items (gig_id, kind, x, y, item_id) values (g1, 'wedge', 1, 1, other);
    raise exception 'CHECK FAILED: another company''s item';
  exception when check_violation then null; end;
  -- The plot's channels go to the input list, remembering where they came from
  insert into gig_inputs (gig_id, channel, source, plot_ref) values (g1, 1, 'Kick', p1::text || ':0'), (g1, 2, 'Snare', p1::text || ':1');
  select count(*) into n from gig_inputs where gig_id = g1 and plot_ref like p1::text || ':%';
  if n <> 2 then raise exception 'CHECK FAILED: % inputs from the plot', n; end if;
  reset role;

  -- Crew read, but don't move things
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_plot_items where gig_id = g1;
  if n <> 2 then raise exception 'CHECK FAILED: crew see % things', n; end if;
  update gig_plot_items set x = 0 where gig_id = g1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew moved something'; end if;
  begin
    insert into gig_plot_items (gig_id, kind, x, y) values (g1, 'vocal_mic', 2, 2);
    raise exception 'CHECK FAILED: crew drew';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Outsiders see nothing
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_plot_items where gig_id = g1;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees the plot'; end if;
  reset role;

  raise exception 'ALL STAGE PLOT CHECKS PASSED';
end $$;
