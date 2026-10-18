-- Checks for migration 20261030000000 (suppliers, subrentals, cross-hire between organisations).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL SUBRENTAL CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_b uuid; wh uuid; g1 uuid; speaker uuid; s1 uuid; sb uuid; sr uuid; code text; code2 text;
  n int; t text; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 's-a@avx.invalid', 'authenticated', 'authenticated'), (b, 's-b@avx.invalid', 'authenticated', 'authenticated'),
    (o, 's-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Org B', b) returning id into org_b;
  code := partner_code(org_b);
  if code is null or code <> partner_code(org_b) then raise exception 'CHECK FAILED: code not stable'; end if;
  insert into suppliers (org_id, name) values (org_b, 'B''s own supplier') returning id into sb;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Org A', a) returning id into org_a;
  insert into stock_locations (org_id, name) values (org_a, 'Warehouse') returning id into wh;
  insert into price_items (org_id, name, unit_price, created_by, tracking) values (org_a, 'Speaker', 60, a, 'serial') returning id into speaker;
  insert into stock_units (org_id, item_id, location_id) values (org_a, speaker, wh), (org_a, speaker, wh);
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Gig 1', a, '2026-11-10', 'confirmed') returning id into g1;
  insert into gig_equipment (gig_id, item_id, quantity) values (g1, speaker, 4);

  -- Suppliers, linked only with a code
  insert into suppliers (org_id, name, partner_org_id) values (org_a, 'Hire Co', org_b) returning id into s1;
  select count(*) into n from suppliers where id = s1 and partner_org_id is null;
  if n <> 1 then raise exception 'CHECK FAILED: linked without a code'; end if;
  begin
    perform link_supplier(s1, partner_code(org_a));
    raise exception 'CHECK FAILED: linked to itself';
  exception when invalid_parameter_value then null; end;
  begin
    perform link_supplier(s1, 'P-NOPE');
    raise exception 'CHECK FAILED: unknown code';
  exception when invalid_parameter_value then null; end;
  t := link_supplier(s1, lower(code));
  if t <> 'Org B' then raise exception 'CHECK FAILED: link returned %', t; end if;
  update suppliers set partner_org_id = null where id = s1;
  perform link_supplier(s1, code);
  begin
    insert into subrentals (org_id, supplier_id, starts_at, ends_at) values (org_a, sb, '2026-11-08', '2026-11-13');
    raise exception 'CHECK FAILED: another organisation''s supplier';
  exception when check_violation then null; end;

  -- A request to the linked supplier
  insert into subrentals (org_id, supplier_id, gig_id, status, starts_at, ends_at, reference)
    values (org_a, s1, g1, 'requested', '2026-11-08', '2026-11-13', 'PO-12') returning id into sr;
  insert into subrental_lines (subrental_id, item_id, description, quantity, unit_cost) values (sr, speaker, 'Speaker', 2, 40);
  update subrentals set reply_note = 'self-approved', quoted_total = 1 where id = sr;
  select count(*) into n from subrentals where id = sr and reply_note is null and quoted_total is null;
  if n <> 1 then raise exception 'CHECK FAILED: requester wrote the answer'; end if;
  select owned into n from equipment_availability(org_a, array[speaker], '2026-11-09', '2026-11-11', null);
  if n <> 2 then raise exception 'CHECK FAILED: requested subrental counted (%)', n; end if;
  reset role;

  select count(*) into n from notifications where user_id = b and kind = 'hire_request';
  if n <> 1 then raise exception 'CHECK FAILED: supplier got % requests', n; end if;

  -- The supplier answers
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from subrentals;
  if n <> 0 then raise exception 'CHECK FAILED: supplier reads the subrental table'; end if;
  select * into r from incoming_hire_requests(org_b);
  if r.from_org <> 'Org A' or jsonb_array_length(r.lines) <> 1 or r.lines->0->>'quantity' <> '2' or r.lines->0 ? 'unit_cost' then
    raise exception 'CHECK FAILED: incoming request %', row_to_json(r);
  end if;
  perform answer_hire_request(sr, 'confirmed', 'Two ready', 80);
  begin
    perform answer_hire_request(sr, 'declined');
    raise exception 'CHECK FAILED: answered twice';
  exception when invalid_parameter_value then null; end;
  code2 := partner_code(org_b, true);
  if code2 = code then raise exception 'CHECK FAILED: new code is the same'; end if;
  reset role;

  select count(*) into n from notifications where user_id = a and kind = 'hire_answered';
  if n <> 1 then raise exception 'CHECK FAILED: requester got % answers', n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from incoming_hire_requests(org_b);
  if n <> 0 then raise exception 'CHECK FAILED: outsider sees requests'; end if;
  begin
    perform partner_code(org_a);
    raise exception 'CHECK FAILED: outsider read a code';
  exception when insufficient_privilege then null; end;
  select count(*) into n from org_partner_codes;
  if n <> 0 then raise exception 'CHECK FAILED: outsider reads codes'; end if;
  reset role;

  -- Confirmed gear hired in counts while it covers the period
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select status, reply_note, quoted_total into r from subrentals where id = sr;
  if r.status <> 'confirmed' or r.reply_note <> 'Two ready' or r.quoted_total <> 80 then raise exception 'CHECK FAILED: answer %', row_to_json(r); end if;
  select owned into n from equipment_availability(org_a, array[speaker], '2026-11-09', '2026-11-11', null);
  if n <> 4 then raise exception 'CHECK FAILED: hired-in not counted (%)', n; end if;
  select owned into n from equipment_availability(org_a, array[speaker], '2026-11-01', '2026-11-11', null);
  if n <> 2 then raise exception 'CHECK FAILED: hired-in counted outside its period (%)', n; end if;
  select available into n from gig_equipment_status(g1);
  if n <> 4 then raise exception 'CHECK FAILED: gig still short (%)', n; end if;
  update subrentals set status = 'returned' where id = sr;
  select owned into n from equipment_availability(org_a, array[speaker], '2026-11-09', '2026-11-11', null);
  if n <> 2 then raise exception 'CHECK FAILED: returned gear still counted'; end if;
  reset role;

  raise exception 'ALL SUBRENTAL CHECKS PASSED';
end $$;
