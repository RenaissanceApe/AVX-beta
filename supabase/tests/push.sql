-- Checks for migration 20261106000000_push.sql (push notifications).
-- Run in the TEST project's SQL editor. Rolls itself back; ends with
--   "ALL PUSH CHECKS PASSED"  → good
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); n int; queued_before int; queued_after int;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'push-a@avx.invalid', 'authenticated', 'authenticated'), (b, 'push-b@avx.invalid', 'authenticated', 'authenticated');

  -- A device turns notifications on; only its owner sees it
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform save_push_subscription('https://push.example.invalid/a1', 'BKey-p256dh', 'auth-secret', 'Chrome on Android');
  perform save_push_subscription('https://push.example.invalid/a1', 'BKey-p256dh-2', 'auth-secret-2', 'Chrome on Android');
  select count(*) into n from push_subscriptions;
  if n <> 1 then raise exception 'CHECK FAILED: % subscriptions for one device', n; end if;
  -- Nobody signed in reads the push keys
  begin
    select count(*) into n from push_keys;
    raise exception 'CHECK FAILED: a user read the push keys';
  exception when insufficient_privilege then null; end;
  begin
    insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (b, 'https://push.example.invalid/x', 'k', 'a');
    raise exception 'CHECK FAILED: wrote a subscription for someone else';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from push_subscriptions;
  if n <> 0 then raise exception 'CHECK FAILED: another user sees the subscription'; end if;
  perform remove_push_subscription('https://push.example.invalid/a1');
  reset role;
  select count(*) into n from push_subscriptions where user_id = a and revoked_at is null;
  if n <> 1 then raise exception 'CHECK FAILED: another user turned off the device'; end if;

  -- A notification for someone with a device asks send-push to deliver it (when keys exist)
  insert into push_keys (public_key, private_key, function_url)
  values ('test-public', 'test-private', 'https://push-test.example.invalid/functions/v1/send-push')
  on conflict (id) do nothing;
  select count(*) into queued_before from net.http_request_queue;
  insert into notifications (user_id, kind, details) values (a, 'message', '{"count": 1}');
  insert into notifications (user_id, kind, details) values (b, 'message', '{"count": 1}');
  select count(*) into queued_after from net.http_request_queue;
  if queued_after - queued_before <> 1 then raise exception 'CHECK FAILED: % push requests (only the person with a device)', queued_after - queued_before; end if;

  -- Turning the device off stops it
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform remove_push_subscription('https://push.example.invalid/a1');
  reset role;
  select count(*) into queued_before from net.http_request_queue;
  insert into notifications (user_id, kind, details) values (a, 'message', '{"count": 1}');
  select count(*) into queued_after from net.http_request_queue;
  if queued_after <> queued_before then raise exception 'CHECK FAILED: push asked for a device that was turned off'; end if;

  raise exception 'ALL PUSH CHECKS PASSED';
end $$;
