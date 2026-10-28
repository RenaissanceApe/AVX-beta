-- Checks for migration 20261201000000 (gig statuses and types, step 6 S1).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL GIG STATUS CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); k uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  org_a uuid; org_x uuid; opt uuid; pen uuid; conf uuid; inv uuid; fest uuid; other_type uuid; other_status uuid; g uuid; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'gs-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'gs-m@avx.invalid', 'authenticated', 'authenticated'),
    (k, 'gs-k@avx.invalid', 'authenticated', 'authenticated'), (x, 'gs-x@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Status Co', a) returning id into org_a;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', x) returning id into org_x;
  insert into gig_statuses (org_id, name, base_status) values (org_x, 'Theirs', 'confirmed') returning id into other_status;
  insert into gig_types (org_id, name) values (org_x, 'Theirs') returning id into other_type;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');

  -- The admin sets up statuses and types
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into gig_statuses (org_id, name, colour, base_status, position) values (org_a, ' Option ', 'yellow', 'draft', 1) returning id into opt;
  insert into gig_statuses (org_id, name, colour, base_status, position) values (org_a, 'Pencilled', 'orange', 'draft', 2) returning id into pen;
  insert into gig_statuses (org_id, name, colour, base_status, position) values (org_a, 'Confirmed', 'green', 'confirmed', 3) returning id into conf;
  insert into gig_statuses (org_id, name, colour, base_status, position) values (org_a, 'Invoiced', 'purple', 'completed', 4) returning id into inv;
  insert into gig_types (org_id, name, colour) values (org_a, 'Festival', 'blue') returning id into fest;
  if (select name from gig_statuses where id = opt) <> 'Option' then raise exception 'CHECK FAILED: name tidied'; end if;
  begin
    insert into gig_statuses (org_id, name, base_status) values (org_a, 'Bad', 'maybe');
    raise exception 'CHECK FAILED: unknown base status';
  exception when check_violation then null; end;

  -- A new gig takes the first status standing for its built-in one
  insert into gigs (org_id, name, status, created_by, gig_type_id) values (org_a, 'Festival gig', 'draft', a, fest) returning id into g;
  select * into r from gigs where id = g;
  if r.custom_status_id is distinct from opt or r.gig_type_id is distinct from fest then raise exception 'CHECK FAILED: new gig labels (%)', r.custom_status_id; end if;
  -- Choosing a custom status sets the built-in one
  update gigs set custom_status_id = conf where id = g;
  if (select status from gigs where id = g) <> 'confirmed' then raise exception 'CHECK FAILED: custom sets built-in'; end if;
  -- Changing the built-in status directly picks a matching custom one, or none
  update gigs set status = 'active' where id = g;
  if (select custom_status_id from gigs where id = g) is not null then raise exception 'CHECK FAILED: no custom for active'; end if;
  update gigs set status = 'draft' where id = g;
  if (select custom_status_id from gigs where id = g) is distinct from opt then raise exception 'CHECK FAILED: first draft status picked'; end if;
  update gigs set custom_status_id = pen where id = g;
  update gigs set name = 'Renamed' where id = g;
  if (select custom_status_id from gigs where id = g) is distinct from pen then raise exception 'CHECK FAILED: kept on other edits'; end if;
  -- Another organisation's status or type is refused
  begin
    update gigs set custom_status_id = other_status where id = g;
    raise exception 'CHECK FAILED: foreign status';
  exception when invalid_parameter_value or foreign_key_violation then null; end;
  begin
    update gigs set gig_type_id = other_type where id = g;
    raise exception 'CHECK FAILED: foreign type';
  exception when invalid_parameter_value or foreign_key_violation then null; end;
  -- A status that now stands for another built-in status moves its gigs
  update gig_statuses set base_status = 'confirmed' where id = pen;
  if (select status from gigs where id = g) <> 'confirmed' then raise exception 'CHECK FAILED: base change moves gigs'; end if;
  -- Removing a status or type takes it off its gigs; the built-in status stays
  update gig_statuses set removed_at = now() where id = pen;
  update gig_types set removed_at = now() where id = fest;
  select * into r from gigs where id = g;
  if r.custom_status_id is not null or r.gig_type_id is not null or r.status <> 'confirmed' then raise exception 'CHECK FAILED: removal'; end if;
  begin
    update gigs set custom_status_id = pen where id = g;
    raise exception 'CHECK FAILED: removed status used';
  exception when invalid_parameter_value then null; end;
  reset role;

  -- Members and crew on a gig read them; members can't change them; outsiders see nothing
  insert into gig_members (gig_id, user_id, role) values (g, k, 'crew');
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from gig_statuses where org_id = org_a) <> 4 then raise exception 'CHECK FAILED: member reads'; end if;
  begin
    insert into gig_statuses (org_id, name, base_status) values (org_a, 'Member status', 'draft');
    raise exception 'CHECK FAILED: member created a status';
  exception when insufficient_privilege then null; end;
  update gig_statuses set name = 'Hacked' where id = opt;
  reset role;
  if (select name from gig_statuses where id = opt) <> 'Option' then raise exception 'CHECK FAILED: member renamed'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from gig_statuses where org_id = org_a) <> 4 then raise exception 'CHECK FAILED: crew reads'; end if;
  if exists (select 1 from gig_statuses where org_id = org_x) then raise exception 'CHECK FAILED: crew reads other org'; end if;
  reset role;

  raise exception 'ALL GIG STATUS CHECKS PASSED';
end $$;
