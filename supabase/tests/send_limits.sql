-- Checks for migration 20261203000000 (send limits for invite, quote, digest and push).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL SEND LIMIT CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); x uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  org_a uuid; g uuid; n int; h text; i int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'sl-a@avx.invalid', 'authenticated', 'authenticated'), (m, 'sl-m@avx.invalid', 'authenticated', 'authenticated'),
    (x, 'sl-x@avx.invalid', 'authenticated', 'authenticated'), (r, 'sl-r@avx.invalid', 'authenticated', 'authenticated');
  -- Real sends on the test project mustn't trip the project cap during the checks
  update send_settings set daily_email_cap = 1000000 where id = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into organisations (name, created_by) values ('Limits Co', a) returning id into org_a;
  reset role;
  insert into org_members (org_id, user_id, role) values (org_a, m, 'member');
  insert into gigs (org_id, name, start_date, end_date, status, created_by) values (org_a, 'Limit Fest', '2026-12-10', '2026-12-11', 'confirmed', a) returning id into g;

  -- ── Invites (a is the organisation's admin) ────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Same address: 3 a day, then no
  for i in 1..3 loop perform claim_send('invite', org_a, null, ' Same@AVX.invalid '); end loop;
  begin
    perform claim_send('invite', org_a, null, 'same@avx.invalid');
    raise exception 'CHECK FAILED: 4th invite to the same address';
  exception when program_limit_exceeded then get stacked diagnostics h = pg_exception_hint;
    if h <> 'recipient_day' then raise exception 'CHECK FAILED: same address hint %', h; end if;
  end;
  -- Per user: 40 an hour (3 already), through a gig
  for i in 1..37 loop perform claim_send('invite', null, g, format('crew%s@avx.invalid', i)); end loop;
  begin
    perform claim_send('invite', null, g, 'crew-41@avx.invalid');
    raise exception 'CHECK FAILED: 41st invite in an hour';
  exception when program_limit_exceeded then get stacked diagnostics h = pg_exception_hint;
    if h <> 'user_hour' then raise exception 'CHECK FAILED: invite hour hint %', h; end if;
  end;
  -- Gig invites are counted for the gig's organisation
  reset role;
  select count(*) into n from send_log where kind = 'invite' and org_id = org_a and user_id = a;
  if n <> 40 then raise exception 'CHECK FAILED: invites logged %', n; end if;
  -- Addresses are stored as a hash only
  select count(*) into n from send_log where org_id = org_a
     and recipient_hash = encode(sha256(convert_to('same@avx.invalid', 'UTF8')), 'hex');
  if n <> 3 then raise exception 'CHECK FAILED: address hash %', n; end if;

  -- ── Quotes (m is a member: can quote, can't invite to the organisation) ───
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform claim_send('invite', org_a, null, 'nope@avx.invalid');
    raise exception 'CHECK FAILED: member claimed an organisation invite';
  exception when insufficient_privilege then null; end;
  for i in 1..5 loop perform claim_send('quote', org_a, null, 'client@avx.invalid'); end loop;
  begin
    perform claim_send('quote', org_a, null, 'client@avx.invalid');
    raise exception 'CHECK FAILED: 6th quote to the same address';
  exception when program_limit_exceeded then get stacked diagnostics h = pg_exception_hint;
    if h <> 'recipient_day' then raise exception 'CHECK FAILED: quote address hint %', h; end if;
  end;
  for i in 1..15 loop perform claim_send('quote', org_a, null, format('client%s@avx.invalid', i)); end loop;
  begin
    perform claim_send('quote', org_a, null, 'client-21@avx.invalid');
    raise exception 'CHECK FAILED: 21st quote in an hour';
  exception when program_limit_exceeded then get stacked diagnostics h = pg_exception_hint;
    if h <> 'user_hour' then raise exception 'CHECK FAILED: quote hour hint %', h; end if;
  end;
  -- Test pushes: 5 an hour
  for i in 1..5 loop perform claim_send('push_test'); end loop;
  begin
    perform claim_send('push_test');
    raise exception 'CHECK FAILED: 6th test push';
  exception when program_limit_exceeded then null; end;
  -- Kinds the app may not claim
  begin
    perform claim_send('digest');
    raise exception 'CHECK FAILED: app claimed a digest';
  exception when invalid_parameter_value then null; end;
  -- Nobody reads the log or the settings
  select count(*) into n from send_log;
  if n <> 0 then raise exception 'CHECK FAILED: send_log readable (%)', n; end if;
  update send_settings set daily_email_cap = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'CHECK FAILED: send_settings writable'; end if;
  -- The service-role entry point is closed to users
  begin
    perform claim_system_send('digest', m);
    raise exception 'CHECK FAILED: user claimed a system send';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Outsider and signed out ───────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform claim_send('invite', null, g, 'o1@avx.invalid');
    raise exception 'CHECK FAILED: outsider claimed a gig invite';
  exception when insufficient_privilege then null; end;
  begin
    perform claim_send('quote', org_a, null, 'o2@avx.invalid');
    raise exception 'CHECK FAILED: outsider claimed a quote';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform claim_send('push_test');
    raise exception 'CHECK FAILED: anon claimed';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── Digest and push (service role) ────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  set local role service_role;
  perform claim_system_send('digest', r);
  begin
    perform claim_system_send('digest', r);
    raise exception 'CHECK FAILED: second digest within 20 hours';
  exception when program_limit_exceeded then null; end;
  for i in 1..60 loop perform claim_system_send('push', r); end loop;
  begin
    perform claim_system_send('push', r);
    raise exception 'CHECK FAILED: 61st push in an hour';
  exception when program_limit_exceeded then get stacked diagnostics h = pg_exception_hint;
    if h <> 'recipient_hour' then raise exception 'CHECK FAILED: push hint %', h; end if;
  end;
  reset role;

  -- ── Project-wide daily email cap ──────────────────────────────────────────
  select count(*) into n from send_log where kind in ('invite', 'quote', 'digest') and created_at > now() - interval '1 day';
  update send_settings set daily_email_cap = n where id = 1;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  set local role service_role;
  begin
    perform claim_system_send('digest', m);
    raise exception 'CHECK FAILED: email past the project cap';
  exception when program_limit_exceeded then get stacked diagnostics h = pg_exception_hint;
    if h <> 'project_day' then raise exception 'CHECK FAILED: project cap hint %', h; end if;
  end;
  -- Pushes aren't emails: the cap doesn't stop them
  perform claim_system_send('push', m);
  reset role;

  raise exception 'ALL SEND LIMIT CHECKS PASSED';
end $$;
