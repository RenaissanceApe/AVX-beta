-- Checks for migration 20270105000000 (step 16, e-signature): who sees and who collects a signature,
-- the document hash is checked, a signature can't be changed after signing (not even by the service
-- role), the signed PDF is filled in once, removal is by marking only, and the private bucket's rules.
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL SIGNATURE CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); c uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  org_a uuid; org_o uuid; g uuid; g_o uuid; q uuid; v uuid; sh uuid; s1 uuid := gen_random_uuid(); s2 uuid; n int; r record;
  doc text := '{"items":[{"name":"Speaker","qty":2}],"kind":"delivery_note"}';
  img text := repeat('a', 64);
  pdf text := repeat('b', 64);
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'sig-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'sig-m@avx.invalid', 'authenticated', 'authenticated'),
    (c, 'sig-c@avx.invalid', 'authenticated', 'authenticated'), (o, 'sig-o@avx.invalid', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Other Co', o) returning id into org_o;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_o, 'Their gig', o, '2026-12-01', 'confirmed') returning id into g_o;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Sign Co', a) returning id into org_a;
  insert into gigs (org_id, name, created_by, start_date, status) values (org_a, 'Festival', a, '2026-12-10', 'confirmed') returning id into g;
  insert into quotes (org_id, title, gig_id) values (org_a, 'Festival sound', g) returning id into q;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');
  insert into gig_members (gig_id, user_id, role) values (g, c, 'crew');
  insert into quote_versions (quote_id, org_id, version_no, snapshot, created_by) values (q, org_a, 1, '{}', a) returning id into v;
  insert into quote_shares (quote_id, org_id, version_id, token_hash, expires_at, created_by)
  values (q, org_a, v, repeat('c', 64), now() + interval '30 days', a) returning id into sh;

  -- ── Collecting a delivery note: a member may (they can scan gear out) ──────
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into signatures (id, org_id, kind, gig_id, title, signer_name, document, document_sha256, image_path, image_sha256, signed_at, created_by)
  values (s1, org_a, 'delivery_note', g, 'Delivery note', '  Ana Client ', doc, encode(sha256(convert_to(doc, 'UTF8')), 'hex'),
          'somewhere/else.png', img, '2020-01-01', o);
  select * into r from signatures where id = s1;
  if r.created_by is distinct from m then raise exception 'CHECK FAILED: created_by not the signed-in user'; end if;
  if r.signed_at < now() - interval '1 minute' then raise exception 'CHECK FAILED: the signing time was backdated'; end if;
  if r.image_path <> org_a || '/' || s1 || '/signature.png' then raise exception 'CHECK FAILED: image path not fixed (%)', r.image_path; end if;
  if r.signer_name <> 'Ana Client' then raise exception 'CHECK FAILED: name not trimmed'; end if;

  -- A hash that doesn't match the document is refused
  begin
    insert into signatures (org_id, kind, gig_id, title, signer_name, document, document_sha256, image_path, image_sha256)
    values (org_a, 'delivery_note', g, 'Delivery note', 'Ana', doc, repeat('0', 64), 'x', img);
    raise exception 'CHECK FAILED: a wrong document hash was accepted';
  exception when check_violation then null;
  end;
  -- Another organisation's gig is refused
  begin
    insert into signatures (org_id, kind, gig_id, title, signer_name, document, document_sha256, image_path, image_sha256)
    values (org_a, 'delivery_note', g_o, 'Delivery note', 'Ana', doc, encode(sha256(convert_to(doc, 'UTF8')), 'hex'), 'x', img);
    raise exception 'CHECK FAILED: a gig from another organisation was accepted';
  exception when check_violation or insufficient_privilege then null;
  end;
  -- A quote acceptance only ever comes from the client's link (the Edge Function)
  begin
    insert into signatures (org_id, kind, quote_id, quote_share_id, title, signer_name, document, document_sha256, image_path, image_sha256)
    values (org_a, 'quote_acceptance', q, sh, 'Quote', 'Fake client', doc, encode(sha256(convert_to(doc, 'UTF8')), 'hex'), 'x', img);
    raise exception 'CHECK FAILED: a member recorded a client''s acceptance';
  exception when insufficient_privilege then null;
  end;

  -- ── A signature can't be changed after signing ─────────────────────────────
  begin
    update signatures set signer_name = 'Someone else' where id = s1;
    raise exception 'CHECK FAILED: the signer''s name was changed';
  exception when insufficient_privilege then null;
  end;
  begin
    update signatures set document = '{}', document_sha256 = encode(sha256(convert_to('{}', 'UTF8')), 'hex') where id = s1;
    raise exception 'CHECK FAILED: the signed document was changed';
  exception when insufficient_privilege then null;
  end;
  begin
    update signatures set signed_at = now() - interval '1 day' where id = s1;
    raise exception 'CHECK FAILED: the signing time was changed';
  exception when insufficient_privilege then null;
  end;
  begin
    update signatures set image_sha256 = repeat('d', 64) where id = s1;
    raise exception 'CHECK FAILED: the drawing''s hash was changed';
  exception when insufficient_privilege then null;
  end;
  begin
    update signatures set created_by = a where id = s1;
    raise exception 'CHECK FAILED: who collected it was changed';
  exception when insufficient_privilege then null;
  end;

  -- The signed PDF: only at its own path, and only once
  begin
    update signatures set pdf_path = 'elsewhere.pdf', pdf_sha256 = pdf where id = s1;
    raise exception 'CHECK FAILED: the signed PDF was put at another path';
  exception when insufficient_privilege then null;
  end;
  update signatures set pdf_path = org_a || '/' || s1 || '/signed.pdf', pdf_sha256 = pdf where id = s1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK FAILED: the signed PDF could not be attached'; end if;
  begin
    update signatures set pdf_sha256 = repeat('e', 64) where id = s1;
    raise exception 'CHECK FAILED: the signed PDF was replaced';
  exception when insufficient_privilege then null;
  end;

  -- Storage: the drawing by its collector (within 15 minutes); no second PDF once attached
  if not private.can_add_signature_file(org_a || '/' || s1 || '/signature.png') then raise exception 'CHECK FAILED: the collector could not add the drawing'; end if;
  if private.can_add_signature_file(org_a || '/' || s1 || '/signed.pdf') then raise exception 'CHECK FAILED: a second PDF would be accepted'; end if;
  if private.can_add_signature_file(org_a || '/' || s1 || '/other.png') then raise exception 'CHECK FAILED: any file name accepted'; end if;
  if private.can_add_signature_file(org_a || '/' || s1 || '/x/signature.png') then raise exception 'CHECK FAILED: a deeper path accepted'; end if;
  if not private.can_read_signature_file(org_a || '/' || s1 || '/signature.png') then raise exception 'CHECK FAILED: the collector could not read the drawing'; end if;

  -- Marking removed records who did it
  update signatures set removed_at = now(), removed_by = a where id = s1;
  if (select removed_by from signatures where id = s1) is distinct from m then raise exception 'CHECK FAILED: removed_by not the user who marked it'; end if;
  update signatures set removed_at = null where id = s1;
  if (select removed_by from signatures where id = s1) is not null then raise exception 'CHECK FAILED: removed_by kept after restoring'; end if;

  -- ── Crew on the gig: see it, can't collect or mark ─────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from signatures where id = s1;
  if n <> 1 then raise exception 'CHECK FAILED: crew on the gig can''t see the delivery note'; end if;
  if not private.can_read_signature_file(org_a || '/' || s1 || '/signed.pdf') then raise exception 'CHECK FAILED: crew can''t open the signed PDF'; end if;
  if private.can_add_signature_file(org_a || '/' || s1 || '/signature.png') then raise exception 'CHECK FAILED: crew could add the drawing'; end if;
  begin
    insert into signatures (org_id, kind, gig_id, title, signer_name, document, document_sha256, image_path, image_sha256)
    values (org_a, 'delivery_note', g, 'Delivery note', 'Ana', doc, encode(sha256(convert_to(doc, 'UTF8')), 'hex'), 'x', img);
    raise exception 'CHECK FAILED: crew collected a delivery note';
  exception when insufficient_privilege then null;
  end;
  update signatures set removed_at = now() where id = s1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: crew marked a signature removed'; end if;

  -- ── Another company: sees nothing ──────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  select count(*) into n from signatures;
  if n <> 0 then raise exception 'CHECK FAILED: another company sees signatures'; end if;
  if private.can_read_signature_file(org_a || '/' || s1 || '/signed.pdf') then raise exception 'CHECK FAILED: another company could open the PDF'; end if;
  reset role;

  -- ── The service role (Edge Functions) records a client's acceptance, and is bound by the guard too ──
  perform set_config('request.jwt.claims', '', true);
  insert into signatures (org_id, kind, quote_id, quote_share_id, gig_id, title, signer_name, document, document_sha256, image_path, image_sha256)
  values (org_a, 'quote_acceptance', q, sh, g, 'Quote', 'Rui Client', doc, encode(sha256(convert_to(doc, 'UTF8')), 'hex'), 'x', img)
  returning id into s2;
  if (select created_by from signatures where id = s2) is not null then raise exception 'CHECK FAILED: a client''s acceptance has an account'; end if;
  begin
    update signatures set signer_name = 'Changed by the server' where id = s2;
    raise exception 'CHECK FAILED: the service role changed a signature';
  exception when insufficient_privilege then null;
  end;
  -- Erasing the collector's account only clears the link to it
  update signatures set created_by = null where id = s1;

  -- The quoting people see the client's acceptance; crew don't
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from signatures where id = s2;
  if n <> 1 then raise exception 'CHECK FAILED: a member can''t see the client''s acceptance'; end if;
  if not private.can_add_signature_file(org_a || '/' || s2 || '/signed.pdf') then raise exception 'CHECK FAILED: a member can''t attach the acceptance''s PDF'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into n from signatures where id = s2;
  if n <> 0 then raise exception 'CHECK FAILED: crew see a quote acceptance'; end if;
  reset role;

  -- ── Rights: signed-in users may read, add and mark; nobody else has any ────
  if (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'signatures' and grantee = 'authenticated')
     is distinct from 'INSERT,SELECT,UPDATE' then
    raise exception 'CHECK FAILED: signed-in users'' rights on signatures';
  end if;
  if exists (select 1 from information_schema.role_table_grants
             where table_schema = 'public' and table_name = 'signatures' and grantee = 'anon') then
    raise exception 'CHECK FAILED: anonymous users have rights on signatures';
  end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'signatures_files_%' and cmd not in ('SELECT', 'INSERT');
  if n <> 0 then raise exception 'CHECK FAILED: signature files can be replaced or removed'; end if;
  if (select public from storage.buckets where id = 'signatures') then raise exception 'CHECK FAILED: the bucket is public'; end if;

  raise exception 'ALL SIGNATURE CHECKS PASSED';
end $$;
