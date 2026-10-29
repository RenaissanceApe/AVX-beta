-- Checks for migration 20261205000000 (no double sends: quote send keys, invite email claims).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL NO DOUBLE SEND CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); k uuid := gen_random_uuid();
  org_a uuid; g uuid; q uuid; ver uuid; n int; ok boolean;
begin
  insert into auth.users (id, email, aud, role) values (a, 'nd-a@avx.invalid', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('No Double Co', a) returning id into org_a;
  insert into quotes (org_id, title) values (org_a, 'Twice') returning id into q;
  insert into quote_versions (quote_id, org_id, snapshot) values (q, org_a, '{"title":"Twice"}') returning id into ver;
  reset role;
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_a, 'Twice Fest', '2026-12-10', '2026-12-11', 'confirmed', a) returning id into g;

  -- ── Quotes: one share per send key ─────────────────────────────────────────
  insert into quote_shares (quote_id, org_id, version_id, token_hash, sent_to, expires_at, created_by, request_key)
    values (q, org_a, ver, repeat('a', 64), 'client@avx.invalid', now() + interval '30 days', a, k);
  begin
    insert into quote_shares (quote_id, org_id, version_id, token_hash, sent_to, expires_at, created_by, request_key)
      values (q, org_a, ver, repeat('b', 64), 'client@avx.invalid', now() + interval '30 days', a, k);
    raise exception 'CHECK FAILED: second share with the same send key';
  exception when unique_violation then null; end;
  -- Without a key (older app versions) any number of shares are fine
  insert into quote_shares (quote_id, org_id, version_id, token_hash, expires_at, created_by)
    values (q, org_a, ver, repeat('c', 64), now() + interval '30 days', a), (q, org_a, ver, repeat('d', 64), now() + interval '30 days', a);
  -- A new key is a new send
  insert into quote_shares (quote_id, org_id, version_id, token_hash, expires_at, created_by, request_key)
    values (q, org_a, ver, repeat('e', 64), now() + interval '30 days', a, gen_random_uuid());
  select count(*) into n from quote_shares where quote_id = q;
  if n <> 4 then raise exception 'CHECK FAILED: shares %', n; end if;

  -- ── Invites: the email is claimed once ─────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform invite_to_org(org_a, 'new@avx.invalid', 'member');
  perform invite_to_gig(g, 'crew@avx.invalid', 'crew', null, null);
  -- Users can't claim or release (only send-invite, with the service role)
  begin
    perform claim_invite_email('org', org_a, 'new@avx.invalid');
    raise exception 'CHECK FAILED: user claimed an invite email';
  exception when insufficient_privilege then null; end;
  begin
    perform release_invite_email('org', org_a, 'new@avx.invalid');
    raise exception 'CHECK FAILED: user released an invite email';
  exception when insufficient_privilege then null; end;
  reset role;

  set local role service_role;
  -- First claim wins, the second (a double-click or retry) doesn't; address case and spaces don't matter
  if not claim_invite_email('org', org_a, 'new@avx.invalid') then raise exception 'CHECK FAILED: first org claim'; end if;
  if claim_invite_email('org', org_a, ' NEW@avx.invalid ') then raise exception 'CHECK FAILED: second org claim'; end if;
  if not claim_invite_email('gig', g, 'crew@avx.invalid') then raise exception 'CHECK FAILED: first gig claim'; end if;
  if claim_invite_email('gig', g, 'crew@avx.invalid') then raise exception 'CHECK FAILED: second gig claim'; end if;
  -- The email failed: released, so a retry can send it
  perform release_invite_email('org', org_a, 'new@avx.invalid');
  if not claim_invite_email('org', org_a, 'new@avx.invalid') then raise exception 'CHECK FAILED: claim after release'; end if;
  -- No invite (already signed up, or never invited): nothing to email
  if claim_invite_email('org', org_a, 'nobody@avx.invalid') then raise exception 'CHECK FAILED: claim without an invite'; end if;
  begin
    perform claim_invite_email('team', org_a, 'new@avx.invalid');
    raise exception 'CHECK FAILED: unknown kind';
  exception when invalid_parameter_value then null; end;
  reset role;

  -- After 10 minutes the invite can be emailed again
  update gig_invites set emailed_at = now() - interval '11 minutes' where gig_id = g;
  set local role service_role;
  ok := claim_invite_email('gig', g, 'crew@avx.invalid');
  reset role;
  if not ok then raise exception 'CHECK FAILED: claim after 10 minutes'; end if;

  raise exception 'ALL NO DOUBLE SEND CHECKS PASSED';
end $$;
