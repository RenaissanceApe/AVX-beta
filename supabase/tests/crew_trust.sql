-- Checks for migration 20261125000000 (crew network N4: trust).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL CREW TRUST CHECKS PASSED"  → good
do $$
declare
  c uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); f3 uuid := gen_random_uuid(); f4 uuid := gen_random_uuid();
  org_c uuid; g uuid; g2 uuid; p1 uuid; v_id uuid; cert uuid; proof uuid; rep uuid; conv uuid;
  res jsonb; n int; t text; c_aal2 text; x_aal2 text; d1 date := current_date + 20;
begin
  insert into auth.users (id, email, aud, role) values
    (c, 'tr-c@avx.invalid', 'authenticated', 'authenticated'), (x, 'tr-x@avx.invalid', 'authenticated', 'authenticated'),
    (f1, 'tr-f1@avx.invalid', 'authenticated', 'authenticated'), (f2, 'tr-f2@avx.invalid', 'authenticated', 'authenticated'),
    (f3, 'tr-f3@avx.invalid', 'authenticated', 'authenticated'), (f4, 'tr-f4@avx.invalid', 'authenticated', 'authenticated');
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), c, 'test', 'totp', 'verified', now(), now());
  c_aal2 := json_build_object('sub', c, 'role', 'authenticated', 'aal', 'aal2')::text;
  x_aal2 := json_build_object('sub', x, 'role', 'authenticated', 'aal', 'aal2')::text;

  -- An organisation can't mark itself verified
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  insert into organisations (name, created_by, tax_id) values ('Trust Co', c, 'PT500000000') returning id into org_c;
  update organisations set verified_at = now(), verified_name = 'Me', posting_suspended_at = null where id = org_c;
  reset role;
  if (select verified_at from organisations where id = org_c) is not null then raise exception 'CHECK FAILED: self-verified'; end if;
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_c, 'Lisbon Expo', d1, d1 + 1, 'confirmed', c) returning id into g;
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_c, 'Old show', current_date - 30, current_date - 30, 'completed', c) returning id into g2;
  insert into gig_members (gig_id, user_id, role) values (g, c, 'pm'), (g2, c, 'pm');

  -- VIES: checked request, then the answer from the service role
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  begin
    perform start_vies_check(org_c, 'US', '123456');
    raise exception 'CHECK FAILED: non-EU country accepted';
  exception when invalid_parameter_value then null; end;
  res := start_vies_check(org_c, 'pt', 'PT 500 000 000');
  if res->>'country' <> 'PT' or res->>'vat_number' <> '500000000' then raise exception 'CHECK FAILED: number cleaned %', res; end if;
  v_id := (res->>'id')::uuid;
  begin
    perform record_vies_result(v_id, true, 'X');
    raise exception 'CHECK FAILED: a person recorded a VIES answer';
  exception when insufficient_privilege then null; end;
  reset role;
  t := record_vies_result(v_id, true, 'TRUST CO LDA', 'Porto');
  if t <> 'verified' or (select verified_name from organisations where id = org_c) <> 'TRUST CO LDA'
     or (select verified_method from organisations where id = org_c) <> 'vies' then
    raise exception 'CHECK FAILED: VIES verification';
  end if;

  -- AVX admins: only with two-step sign-in switched on
  insert into private.avx_admins (user_id) values (x);
  perform set_config('request.jwt.claims', x_aal2, true);
  set local role authenticated;
  if not am_avx_admin() then raise exception 'CHECK FAILED: am_avx_admin'; end if;
  begin
    perform trust_queue();
    raise exception 'CHECK FAILED: AVX admin without two-step sign-in';
  exception when insufficient_privilege then null; end;
  reset role;
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), x, 'test', 'totp', 'verified', now(), now());
  perform set_config('request.jwt.claims', x_aal2, true);
  set local role authenticated;
  perform revoke_verification(org_c, 'test');
  reset role;
  if (select verified_at from organisations where id = org_c) is not null then raise exception 'CHECK FAILED: revoke'; end if;

  -- Manual check
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  v_id := request_manual_verification(org_c, 'Registered in Portugal, see our website');
  begin
    perform request_manual_verification(org_c, 'again');
    raise exception 'CHECK FAILED: asked twice';
  exception when unique_violation then null; end;
  begin
    perform trust_queue();
    raise exception 'CHECK FAILED: queue open to a company admin';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', x_aal2, true);
  set local role authenticated;
  res := trust_queue();
  if jsonb_array_length(res->'verifications') <> 1 then raise exception 'CHECK FAILED: queue %', res; end if;
  perform decide_verification(v_id, true, 'Trust Co, Lda');
  if trust_queue_count() <> 0 then raise exception 'CHECK FAILED: count after deciding'; end if;
  reset role;
  if (select verified_method from organisations where id = org_c) <> 'manual' then raise exception 'CHECK FAILED: manual verification'; end if;

  -- Certificates get ids; marks can't be typed in
  insert into crew_profiles (user_id, enabled, functions, base_place, base_country, base_lat, base_lng, travel_scope, certificates) values
    (f1, true, '{rigger}', 'Lisboa, Portugal', 'PT', 38.72, -9.14, 'country', '[{"name": "IPAF 3a", "expires_on": "2030-01-01"}]'),
    (f2, true, '{rigger}', 'Lisboa, Portugal', 'PT', 38.72, -9.14, 'country', '[]'),
    (f3, true, '{rigger}', 'Lisboa, Portugal', 'PT', 38.72, -9.14, 'country', '[]'),
    (f4, true, '{rigger}', 'Lisboa, Portugal', 'PT', 38.72, -9.14, 'country', '[]');
  select (certificates->0->>'id')::uuid into cert from crew_profiles where user_id = f1;
  if cert is null then raise exception 'CHECK FAILED: certificate id'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update crew_profiles set suspended_at = now(),
         certificates = jsonb_build_array(jsonb_build_object('id', cert, 'name', 'IPAF 3a', 'expires_on', '2030-01-01', 'verified', true,
                                                             'confirmed_by', '[{"name": "Fake"}]'))
   where user_id = f1;
  reset role;
  select certificates->0 into res from crew_profiles where user_id = f1;
  if res->>'id' <> cert::text or res ? 'verified' or res ? 'confirmed_by' or (select suspended_at from crew_profiles where user_id = f1) is not null then
    raise exception 'CHECK FAILED: marks typed in %', res;
  end if;

  -- Confirming: only a company that has worked with them
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  begin
    perform confirm_certificate(org_c, f1, cert);
    raise exception 'CHECK FAILED: confirmed by a stranger';
  exception when insufficient_privilege then null; end;
  reset role;
  insert into gig_members (gig_id, user_id, role) values (g2, f1, 'crew');
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  res := confirm_certificate(org_c, f1, cert);
  if res->'confirmed_by'->0->>'name' <> 'Trust Co' then raise exception 'CHECK FAILED: confirmation %', res; end if;
  reset role;
  -- Editing the certificate drops the mark; changing it back brings it back
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update crew_profiles set certificates = jsonb_build_array(jsonb_build_object('id', cert, 'name', 'IPAF 3b', 'expires_on', '2030-01-01')) where user_id = f1;
  reset role;
  if (select certificates->0 ? 'confirmed_by' from crew_profiles where user_id = f1) then raise exception 'CHECK FAILED: mark kept after edit'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update crew_profiles set certificates = jsonb_build_array(jsonb_build_object('id', cert, 'name', 'IPAF 3a', 'expires_on', '2030-01-01')) where user_id = f1;
  reset role;
  if not (select certificates->0 ? 'confirmed_by' from crew_profiles where user_id = f1) then raise exception 'CHECK FAILED: mark back'; end if;

  -- Proofs: the file first, then the request; an AVX admin checks it
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform submit_certificate_proof(cert, f1 || '/' || cert || '/ipaf.pdf');
    raise exception 'CHECK FAILED: proof without a file';
  exception when invalid_parameter_value then null; end;
  reset role;
  insert into storage.objects (bucket_id, name, owner_id) values ('certificate-proofs', f1 || '/' || cert || '/ipaf.pdf', f1::text);
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  proof := submit_certificate_proof(cert, f1 || '/' || cert || '/ipaf.pdf');
  reset role;
  if not (select (certificates->0->>'proof_pending')::boolean from crew_profiles where user_id = f1) then raise exception 'CHECK FAILED: proof pending'; end if;
  -- Nobody else reads the file
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'certificate-proofs';
  if n <> 0 then raise exception 'CHECK FAILED: proof readable by a company'; end if;
  reset role;
  perform set_config('request.jwt.claims', x_aal2, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'certificate-proofs' and name like f1 || '/%';
  if n <> 1 then raise exception 'CHECK FAILED: AVX admin reads the proof'; end if;
  perform review_certificate_proof(proof, true);
  reset role;
  select certificates->0 into res from crew_profiles where user_id = f1;
  if not (res->>'verified')::boolean or res ? 'proof_pending' then raise exception 'CHECK FAILED: proof verified %', res; end if;

  -- Reports on a profile: hidden from the reporter at once; three people hide it from everyone
  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform report_network('profile', f1, 'fake', 'Not a real person');
  begin
    perform report_network('profile', f1, 'spam');
    raise exception 'CHECK FAILED: reported twice';
  exception when unique_violation then null; end;
  reset role;
  if private.can_see_crew_profile(f2, f1) then raise exception 'CHECK FAILED: reporter still sees the profile'; end if;
  if not private.can_see_crew_profile(c, f1) then raise exception 'CHECK FAILED: others no longer see it'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', f3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform report_network('profile', f1, 'fake');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform report_network('profile', f1, 'abuse');
  reset role;
  if private.can_see_crew_profile(c, f1) then raise exception 'CHECK FAILED: three reports did not hide the profile'; end if;
  select id into rep from network_reports where target_user = f1 and reporter_id = f2;
  perform set_config('request.jwt.claims', x_aal2, true);
  set local role authenticated;
  res := trust_queue();
  if jsonb_array_length(res->'reports') <> 3 then raise exception 'CHECK FAILED: reports in the queue'; end if;
  perform decide_network_report(rep, false);
  reset role;
  if not private.can_see_crew_profile(c, f1) or exists (select 1 from network_reports where target_user = f1 and status = 'open') then
    raise exception 'CHECK FAILED: keeping lifts the suspension';
  end if;

  -- Reports on job posts: three people suspend the organisation's posting
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  p1 := publish_job(g, '{"title": "Rigger", "function_key": "rigger"}');
  begin
    perform report_network('job', p1, 'spam');
    raise exception 'CHECK FAILED: reported own post';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform report_network('job', p1, 'discrimination');
  res := list_jobs(true);
  if (res->>'total')::int <> 0 then raise exception 'CHECK FAILED: reporter still sees the post'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := list_jobs(true);
  if (res->>'total')::int <> 1 or res->'results'->0->>'verified_name' <> 'Trust Co, Lda' then raise exception 'CHECK FAILED: post with verified name %', res; end if;
  perform report_network('job', p1, 'spam');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform report_network('job', p1, 'spam');
  reset role;
  if (select posting_suspended_at from organisations where id = org_c) is null then raise exception 'CHECK FAILED: posting not suspended'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := list_jobs(true);
  if (res->>'total')::int <> 0 then raise exception 'CHECK FAILED: suspended organisation still listed'; end if;
  reset role;
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  begin
    perform publish_job(g, '{"title": "Stagehand"}');
    raise exception 'CHECK FAILED: posted while suspended';
  exception when insufficient_privilege then null; end;
  reset role;
  select id into rep from network_reports where target_post = p1 limit 1;
  perform set_config('request.jwt.claims', x_aal2, true);
  set local role authenticated;
  perform decide_network_report(rep, true);
  perform lift_suspension('org', org_c);
  reset role;
  if (select status from job_posts where id = p1) <> 'closed' or (select posting_suspended_at from organisations where id = org_c) is not null then
    raise exception 'CHECK FAILED: removing the post and lifting the suspension';
  end if;

  -- Contact settings: only companies they've worked with
  update crew_profiles set contact_from = 'known' where user_id = f2;
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  begin
    perform contact_crew(g, f2, 'availability');
    raise exception 'CHECK FAILED: contacted someone who only takes known companies';
  exception when insufficient_privilege then null; end;
  t := contact_crew(g, f3, 'availability');
  reset role;
  update crew_profiles set contact_from = 'any' where user_id = f2;

  -- A stranger's first messages carry no files until the other person writes
  conv := private.ensure_direct(c, f4);
  insert into storage.objects (bucket_id, name, owner_id) values ('message-files', conv || '/a/rider.pdf', c::text);
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  begin
    insert into messages (conversation_id, body, attachments) values (conv, 'Rider', jsonb_build_array(jsonb_build_object('path', conv || '/a/rider.pdf')));
    raise exception 'CHECK FAILED: file to a stranger';
  exception when insufficient_privilege then null; end;
  insert into messages (conversation_id, body) values (conv, 'Hello');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', f4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into messages (conversation_id, body) values (conv, 'Hi');
  reset role;
  perform set_config('request.jwt.claims', c_aal2, true);
  set local role authenticated;
  insert into messages (conversation_id, body, attachments) values (conv, 'Rider', jsonb_build_array(jsonb_build_object('path', conv || '/a/rider.pdf')));
  reset role;

  raise exception 'ALL CREW TRUST CHECKS PASSED';
end $$;
