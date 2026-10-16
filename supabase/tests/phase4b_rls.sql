-- Checks for migration 20261020000000 (branding, price list, numbering, deletion notices).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL PHASE 4B CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); v uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  org_a uuid; gig_a uuid; gig_b uuid; num int; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'b-a@avx.invalid', 'authenticated', 'authenticated'),
    (m, 'b-m@avx.invalid', 'authenticated', 'authenticated'),
    (v, 'b-v@avx.invalid', 'authenticated', 'authenticated'),
    (c, 'b-c@avx.invalid', 'authenticated', 'authenticated');

  -- Admin: numbering continues from "next number"; branding validation
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Brand Org', a) returning id into org_a;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member'), (org_a, v, 'viewer');
  update organisations set quote_next_number = 143, quote_number_prefix = '' where id = org_a;
  insert into quotes (org_id, title) values (org_a, 'A') returning number into num;
  if num <> 143 then raise exception 'CHECK FAILED: next number not honoured (%)', num; end if;
  insert into quotes (org_id, title) values (org_a, 'B') returning number into num;
  if num <> 144 then raise exception 'CHECK FAILED: numbering did not continue (%)', num; end if;
  insert into org_branding (org_id, header_image, brand_color) values (org_a, 'data:image/svg+xml;base64,PHN2Zy8+', '#32FF32');
  begin
    update org_branding set header_image = 'javascript:alert(1)' where org_id = org_a;
    raise exception 'CHECK FAILED: non-image header accepted';
  exception when check_violation then null; end;
  insert into price_items (org_id, name, unit_price, created_by) values (org_a, 'Coluna', 60, a);
  insert into gigs (org_id, name, created_by) values (org_a, 'Gig A', a) returning id into gig_a;
  insert into gigs (org_id, name, created_by) values (org_a, 'Gig B', a) returning id into gig_b;
  insert into gig_members (gig_id, user_id, role) values (gig_a, c, 'crew'), (gig_b, c, 'crew');
  reset role;

  -- Member: sees branding but can't change it; shares the price list
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from org_branding where org_id = org_a;
  if n <> 1 then raise exception 'CHECK FAILED: member cannot see branding'; end if;
  update org_branding set brand_color = '#000000' where org_id = org_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: member changed branding'; end if;
  insert into price_items (org_id, name, unit_price, created_by) values (org_a, 'Sub', 80, m);
  -- Members cannot delete gigs they didn't create
  delete from gigs where id = gig_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: member deleted a gig'; end if;
  reset role;

  -- Viewer: no prices
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from price_items where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: viewer sees prices'; end if;
  reset role;

  -- Admin deletes one gig: crew get a notice
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from gigs where id = gig_a;
  reset role;
  select count(*) into n from notifications where user_id = c and kind = 'gig_deleted' and details->>'gig_name' = 'Gig A';
  if n <> 1 then raise exception 'CHECK FAILED: crew not told about deleted gig (%)', n; end if;

  -- Admin deletes the organisation: one org notice per member, no per-gig noise
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from organisations where id = org_a;
  reset role;
  select count(*) into n from notifications where user_id in (m, v) and kind = 'org_deleted';
  if n <> 2 then raise exception 'CHECK FAILED: members not told about deleted org (%)', n; end if;
  select count(*) into n from notifications where user_id = c and kind = 'gig_deleted' and details->>'gig_name' = 'Gig B';
  if n <> 0 then raise exception 'CHECK FAILED: per-gig notices sent during org deletion (%)', n; end if;
  select count(*) into n from quotes where org_id = org_a;
  if n <> 0 then raise exception 'CHECK FAILED: quotes left behind'; end if;

  raise exception 'ALL PHASE 4B CHECKS PASSED';
end $$;
