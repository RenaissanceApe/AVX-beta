-- Checks for migration 20270126000000 (rigging RG2: the second person's check of truss tables).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL TRUSS CHECK CHECKS PASSED"  → good
do $$
declare
  x uuid := gen_random_uuid(); y uuid := gen_random_uuid(); u uuid := gen_random_uuid();
  x_aal2 text; y_aal2 text; u_aal2 text; m1 uuid; m2 uuid; n int; t text;
  sha text := repeat('ab', 32); sha2 text := repeat('cd', 32);
begin
  insert into auth.users (id, email, aud, role) values
    (x, 'tc-x@avx.invalid', 'authenticated', 'authenticated'), (y, 'tc-y@avx.invalid', 'authenticated', 'authenticated'),
    (u, 'tc-u@avx.invalid', 'authenticated', 'authenticated');
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), x, 'test', 'totp', 'verified', now(), now()),
         (gen_random_uuid(), u, 'test', 'totp', 'verified', now(), now());
  update public.profiles set full_name = 'Checker X' where id = x;
  update public.profiles set full_name = 'Plain U' where id = u;
  insert into private.avx_admins (user_id) values (x), (y);
  x_aal2 := json_build_object('sub', x, 'role', 'authenticated', 'aal', 'aal2')::text;
  y_aal2 := json_build_object('sub', y, 'role', 'authenticated', 'aal', 'aal2')::text;
  u_aal2 := json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal2')::text;

  -- Someone who isn't an AVX admin can't mark a table
  perform set_config('request.jwt.claims', u_aal2, true);
  set local role authenticated;
  begin
    perform public.mark_truss_table('prolyte-h30v', '2015-03-18', sha, 'checked', 20);
    raise exception 'CHECK FAILED: a plain user marked a table';
  exception when insufficient_privilege then null; end;
  -- …nor write the table directly
  begin
    insert into public.truss_table_checks (table_id, edition, source_sha256, status, rows_checked, checked_by_name)
    values ('prolyte-h30v', '2015-03-18', sha, 'checked', 20, 'Plain U');
    raise exception 'CHECK FAILED: a plain user inserted a mark';
  exception when insufficient_privilege then null; end;
  reset role;

  -- An AVX admin without two-step sign-in can't mark either
  perform set_config('request.jwt.claims', y_aal2, true);
  set local role authenticated;
  begin
    perform public.mark_truss_table('prolyte-h30v', '2015-03-18', sha, 'checked', 20);
    raise exception 'CHECK FAILED: an admin without two-step sign-in marked a table';
  exception when insufficient_privilege then null; end;
  reset role;

  -- An admin signed in with the first step only can't mark
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    perform public.mark_truss_table('prolyte-h30v', '2015-03-18', sha, 'checked', 20);
    raise exception 'CHECK FAILED: an admin at aal1 marked a table';
  exception when insufficient_privilege then null; end;
  reset role;

  -- The admin with two-step sign-in marks a table checked; their name and the date are kept
  perform set_config('request.jwt.claims', x_aal2, true);
  set local role authenticated;
  begin
    perform public.mark_truss_table('prolyte-h30v', '2015-03-18', sha, 'checked', null);
    raise exception 'CHECK FAILED: checked without comparing rows';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.mark_truss_table('prolyte-h40v', '2015-03-18', sha, 'blocked', null, '  ');
    raise exception 'CHECK FAILED: blocked without a reason';
  exception when invalid_parameter_value then null; end;
  m1 := public.mark_truss_table('prolyte-h30v', '2015-03-18', upper(sha), 'checked', 18);
  select checked_by_name || '|' || source_sha256 || '|' || (checked_by = x)::text into t from public.truss_table_checks where id = m1;
  if t <> 'Checker X|' || sha || '|true' then raise exception 'CHECK FAILED: mark kept as %', t; end if;
  -- A second mark for the same document waits until the first is taken back
  begin
    perform public.mark_truss_table('prolyte-h30v', '2015-03-18', sha, 'blocked', null, 'second thoughts');
    raise exception 'CHECK FAILED: two active marks for one document';
  exception when unique_violation then null; end;
  -- A new edition (another document) needs its own check, and can have one
  m2 := public.mark_truss_table('prolyte-h30v', '2022-06-08', sha2, 'blocked', null, 'values differ on row 7 m');
  -- The admin can't edit a mark directly, not even through the API
  begin
    update public.truss_table_checks set status = 'blocked' where id = m1;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'CHECK FAILED: a mark was edited'; end if;
  exception when insufficient_privilege then null; end;
  reset role;

  -- Not even the table owner can edit a mark: only take it back
  begin
    update public.truss_table_checks set rows_checked = 1 where id = m1;
    raise exception 'CHECK FAILED: a mark was edited by the owner';
  exception when insufficient_privilege then null; end;

  -- Everyone signed in reads the marks
  perform set_config('request.jwt.claims', u_aal2, true);
  set local role authenticated;
  select count(*) into n from public.truss_table_checks where id in (m1, m2);
  if n <> 2 then raise exception 'CHECK FAILED: a signed-in user sees % marks', n; end if;
  begin
    perform public.withdraw_truss_mark(m1, 'not mine');
    raise exception 'CHECK FAILED: a plain user took a mark back';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Nobody signed out reads them
  set local role anon;
  begin
    select count(*) into n from public.truss_table_checks;
    if n > 0 then raise exception 'CHECK FAILED: signed-out visitors see marks'; end if;
  exception when insufficient_privilege then null; end;
  reset role;

  -- Taking a mark back: needs a reason, keeps who and when, and then a new mark is possible
  perform set_config('request.jwt.claims', x_aal2, true);
  set local role authenticated;
  begin
    perform public.withdraw_truss_mark(m1, '');
    raise exception 'CHECK FAILED: taken back without a reason';
  exception when invalid_parameter_value then null; end;
  perform public.withdraw_truss_mark(m1, 'row 12 m differs from the document');
  select withdrawn_by_name || '|' || (withdrawn_at is not null)::text || '|' || status into t from public.truss_table_checks where id = m1;
  if t <> 'Checker X|true|checked' then raise exception 'CHECK FAILED: taking back kept as %', t; end if;
  begin
    perform public.withdraw_truss_mark(m1, 'again');
    raise exception 'CHECK FAILED: a mark was taken back twice';
  exception when invalid_parameter_value then null; end;
  perform public.mark_truss_table('prolyte-h30v', '2015-03-18', sha, 'blocked', null, 'row 12 m differs');
  select count(*) into n from public.truss_table_checks where table_id = 'prolyte-h30v';
  if n <> 3 then raise exception 'CHECK FAILED: history has % marks, expected 3', n; end if;
  reset role;

  -- A mark that was taken back can't be changed again, even by the owner
  begin
    update public.truss_table_checks set withdrawn_note = 'rewritten' where id = m1;
    raise exception 'CHECK FAILED: a withdrawn mark was rewritten';
  exception when insufficient_privilege then null; end;

  raise exception 'ALL TRUSS CHECK CHECKS PASSED';
end $$;
