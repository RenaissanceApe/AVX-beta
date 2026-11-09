-- Checks for 20270105000001_signatures_keep_gig.sql (run BY HAND in the TEST project's SQL editor,
-- not through the connector: it erases rows inside a transaction it rolls back). A gig with a
-- signature can't be erased; the same gig's organisation can, and takes the signature with it.
-- Ends with "ALL KEEP-GIG CHECKS PASSED".
do $$
declare
  a uuid := gen_random_uuid(); org_a uuid; g uuid; g2 uuid; n int;
  doc text := '{"kind":"delivery_note"}';
begin
  insert into auth.users (id, email, aud, role) values (a, 'keepgig-a@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Keep Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Signed gig', a, '2026-12-10', 'confirmed') returning id into g;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Unsigned gig', a, '2026-12-11', 'confirmed') returning id into g2;
  insert into signatures (org_id, kind, gig_id, title, signer_name, document, document_sha256, image_path, image_sha256)
  values (org_a, 'delivery_note', g, 'Delivery note', 'Ana', doc, encode(sha256(convert_to(doc, 'UTF8')), 'hex'), 'x', repeat('a', 64));
  update signatures set removed_at = now() where gig_id = g;  -- hidden ones count too

  begin
    delete from gigs where id = g;
    raise exception 'CHECK FAILED: a gig with a signature was erased';
  exception when insufficient_privilege then null;
  end;
  delete from gigs where id = g2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: a gig without signatures could not be erased'; end if;
  reset role;

  delete from organisations where id = org_a;
  if exists (select 1 from signatures where org_id = org_a) then raise exception 'CHECK FAILED: signatures outlived their organisation'; end if;

  raise exception 'ALL KEEP-GIG CHECKS PASSED';
end $$;
