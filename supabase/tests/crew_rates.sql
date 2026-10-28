-- Checks for migration 20261203000000 (crew rates, step 7).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL CREW RATE CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); k uuid := gen_random_uuid(); k2 uuid := gen_random_uuid();
  pm uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; org_x uuid; g uuid; r_fn uuid; r_person uuid; n integer;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'cr-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'cr-m@avx.invalid', 'authenticated', 'authenticated'),
    (k, 'cr-k@avx.invalid', 'authenticated', 'authenticated'), (k2, 'cr-k2@avx.invalid', 'authenticated', 'authenticated'),
    (pm, 'cr-pm@avx.invalid', 'authenticated', 'authenticated'), (x, 'cr-x@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_x;
  insert into crew_rates (org_id, function_title, day_rate) values (org_x, 'Rigger', 999);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Rates Co', a) returning id into org_a;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');

  -- The admin sets up the rate card and the factors
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into crew_rates (org_id, function_title, day_rate, half_day_rate) values (org_a, ' FOH engineer ', 300, 180) returning id into r_fn;
  insert into crew_rates (org_id, user_id, function_title, day_rate) values (org_a, k, 'FOH engineer', 350) returning id into r_person;
  if (select function_title from crew_rates where id = r_fn) <> 'FOH engineer' then raise exception 'CHECK FAILED: tidied'; end if;
  begin
    insert into crew_rates (org_id, function_title, day_rate) values (org_a, 'foh ENGINEER', 1);
    raise exception 'CHECK FAILED: duplicate rate';
  exception when unique_violation then null; end;
  begin
    insert into crew_rates (org_id, function_title) values (org_a, 'Rigger');
    raise exception 'CHECK FAILED: rate without an amount';
  exception when check_violation then null; end;
  begin update crew_rates set function_title = 'Other' where id = r_fn; raise exception 'CHECK FAILED: function changed';
  exception when insufficient_privilege then null; end;
  update crew_rates set day_rate = 320 where id = r_fn;
  insert into crew_rate_factors (org_id, weekend) values (org_a, 1.25);
  begin update crew_rate_factors set weekend = 9 where org_id = org_a; raise exception 'CHECK FAILED: factor range';
  exception when check_violation then null; end;
  if exists (select 1 from crew_rates where org_id = org_x) then raise exception 'CHECK FAILED: other org rates visible'; end if;

  -- A gig with two crew and a freelance PM
  insert into gigs (org_id, name, status, created_by, start_date, end_date) values (org_a, 'Rates gig', 'confirmed', a, '2026-12-04', '2026-12-06') returning id into g;
  reset role;
  insert into gig_members (gig_id, user_id, role, function_title) values (g, k, 'crew', 'FOH engineer'), (g, k2, 'crew', 'Rigger'), (g, pm, 'pm', 'Production manager');

  -- The freelance PM agrees fees; only people on the gig get one
  perform set_config('request.jwt.claims', json_build_object('sub', pm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_crew_fees (gig_id, user_id, unit, rate, quantity) values (g, k, 'day', 350, 3);
  insert into gig_crew_fees (gig_id, user_id, unit, rate, quantity) values (g, k2, 'fixed', 500, 4);
  if (select quantity from gig_crew_fees where gig_id = g and user_id = k2) <> 1 then raise exception 'CHECK FAILED: fixed counts once'; end if;
  if (select org_id from gig_crew_fees where gig_id = g and user_id = k) <> org_a then raise exception 'CHECK FAILED: org filled'; end if;
  begin
    insert into gig_crew_fees (gig_id, user_id, rate) values (g, x, 100);
    raise exception 'CHECK FAILED: fee for someone not on the gig';
  exception when invalid_parameter_value then null; end;
  -- A freelance PM doesn't see the organisation's rate card
  if exists (select 1 from crew_rates where org_id = org_a) then raise exception 'CHECK FAILED: PM reads rate card'; end if;
  update gig_crew_fees set rate = null where gig_id = g and user_id = k2;
  reset role;

  -- Crew see only their own fee and no rates
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from gig_crew_fees where gig_id = g;
  if n <> 1 then raise exception 'CHECK FAILED: crew see % fees', n; end if;
  if exists (select 1 from crew_rates) or exists (select 1 from crew_rate_factors) then raise exception 'CHECK FAILED: crew read rates'; end if;
  begin
    update gig_crew_fees set rate = 9999 where gig_id = g and user_id = k;
    if (select rate from gig_crew_fees where gig_id = g and user_id = k) = 9999 then raise exception 'CHECK FAILED: crew raised own fee'; end if;
  end;
  reset role;

  -- Members read the rate card but don't change it
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from crew_rates where org_id = org_a) <> 2 then raise exception 'CHECK FAILED: member reads rates'; end if;
  update crew_rates set day_rate = 1 where id = r_fn;
  if (select day_rate from crew_rates where id = r_fn) <> 320 then raise exception 'CHECK FAILED: member changed a rate'; end if;
  reset role;

  -- Removing a rate keeps it out of the card and frees its slot
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update crew_rates set removed_at = now() where id = r_person;
  insert into crew_rates (org_id, user_id, function_title, day_rate) values (org_a, k, 'FOH engineer', 360);
  reset role;

  raise exception 'ALL CREW RATE CHECKS PASSED';
end $$;

-- Migration 20261203000001: the export has the rate card, the factors and the gig fees, and the
-- older parts still work
--   "ALL CREW RATE EXPORT CHECKS PASSED"  → good
do $$
declare a uuid := gen_random_uuid(); k uuid := gen_random_uuid(); org_a uuid; g uuid; out jsonb;
begin
  insert into auth.users (id, email, aud, role) values (a, 'crx-a@avx.invalid', 'authenticated', 'authenticated'), (k, 'crx-k@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Export Rates Co', a) returning id into org_a;
  insert into crew_rates (org_id, function_title, day_rate) values (org_a, 'Rigger', 250);
  insert into crew_rate_factors (org_id, overtime) values (org_a, 1.5);
  insert into gigs (org_id, name, status, created_by) values (org_a, 'Export rates gig', 'draft', a) returning id into g;
  reset role;
  insert into gig_members (gig_id, user_id, role, function_title) values (g, k, 'crew', 'Rigger');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_crew_fees (gig_id, user_id, unit, rate, quantity) values (g, k, 'day', 250, 2);
  out := public.export_org_part(org_a, 'crew_rates', 0);
  if out->0->>'function_title' <> 'Rigger' then raise exception 'CHECK FAILED rates: %', out; end if;
  out := public.export_org_part(org_a, 'crew_rate_factors', 0);
  if (out->0->>'overtime')::numeric <> 1.5 then raise exception 'CHECK FAILED factors: %', out; end if;
  out := public.export_org_part(org_a, 'gig_crew_fees', 0);
  if (out->0->>'total')::numeric <> 500 or out->0->>'function_title' <> 'Rigger' then raise exception 'CHECK FAILED fees: %', out; end if;
  out := public.export_org_part(org_a, 'gigs', 0);
  if out->0->>'name' <> 'Export rates gig' then raise exception 'CHECK FAILED older part: %', out; end if;
  begin
    out := public.export_org_part(org_a, 'nonsense', 0);
    raise exception 'CHECK FAILED: unknown part';
  exception when invalid_parameter_value then null; end;
  reset role;
  raise exception 'ALL CREW RATE EXPORT CHECKS PASSED';
end $$;
