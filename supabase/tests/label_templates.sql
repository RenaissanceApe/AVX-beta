-- Checks for migration 20270112000000 (U5: label templates).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL LABEL TEMPLATE CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_o uuid; n int; t text; ok boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'lt-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'lt-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'lt-v@avx.invalid', 'authenticated', 'authenticated'), (o, 'lt-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Label Co', a) returning id into org_a;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', o) returning id into org_o;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer') on conflict do nothing;

  -- An admin saves a template; who and when are set by the database
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into label_templates (org_id, size, fields, updated_by, updated_at)
    values (org_a, 'small', array['name', 'qr'], o, '2020-01-01');
  select updated_by = a and updated_at > now() - interval '1 minute' into ok from label_templates where org_id = org_a and size = 'small';
  if not ok then raise exception 'CHECK FAILED: saver or time not set by the database'; end if;
  -- Unknown fields, no fields and unknown sizes are refused
  begin
    insert into label_templates (org_id, size, fields) values (org_a, 'medium', array['name', 'price']);
    raise exception 'CHECK FAILED: unknown field accepted';
  exception when check_violation then null; end;
  begin
    insert into label_templates (org_id, size, fields) values (org_a, 'medium', array[]::text[]);
    raise exception 'CHECK FAILED: empty template accepted';
  exception when check_violation then null; end;
  begin
    insert into label_templates (org_id, size, fields) values (org_a, 'huge', array['name']);
    raise exception 'CHECK FAILED: unknown size accepted';
  exception when check_violation then null; end;
  reset role;

  -- A member saves (upsert) another size and changes the first; it can't move to another org or size
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into label_templates (org_id, size, fields) values (org_a, 'large', array['name', 'qr', 'gig', 'contents'])
    on conflict (org_id, size) do update set fields = excluded.fields;
  insert into label_templates (org_id, size, fields) values (org_a, 'small', array['name', 'code', 'qr'])
    on conflict (org_id, size) do update set fields = excluded.fields;
  select fields = array['name', 'code', 'qr'] and updated_by = m into ok from label_templates where org_id = org_a and size = 'small';
  if not ok then raise exception 'CHECK FAILED: member could not update the template'; end if;
  update label_templates set size = 'medium' where org_id = org_a and size = 'small';
  select count(*) into n from label_templates where org_id = org_a and size = 'small';
  if n <> 1 then raise exception 'CHECK FAILED: a template changed size'; end if;
  reset role;

  -- A viewer reads them but can't save
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from label_templates where org_id = org_a;
  if n <> 2 then raise exception 'CHECK FAILED: viewer sees % templates', n; end if;
  begin
    insert into label_templates (org_id, size, fields) values (org_a, 'medium', array['name']);
    raise exception 'CHECK FAILED: viewer saved a template';
  exception when insufficient_privilege then null; end;
  update label_templates set fields = array['qr'] where org_id = org_a and size = 'small';
  select fields = array['name', 'code', 'qr'] into ok from label_templates where org_id = org_a and size = 'small';
  if not ok then raise exception 'CHECK FAILED: viewer changed a template'; end if;
  reset role;

  -- Another organisation sees nothing and can't write into this one
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from label_templates where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees % templates', n; end if;
  begin
    insert into label_templates (org_id, size, fields) values (org_a, 'medium', array['name']);
    raise exception 'CHECK FAILED: outsider saved a template';
  exception when insufficient_privilege then null; end;
  select string_agg(size, ',') into t from label_templates;
  if t is not null then raise exception 'CHECK FAILED: outsider sees %', t; end if;
  reset role;

  raise exception 'ALL LABEL TEMPLATE CHECKS PASSED';
end $$;
