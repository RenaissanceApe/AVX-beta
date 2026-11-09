-- Upkeep U3 (docs/DATA_MAP.md, open item 2), part 2: the nightly clean-up that removes old rows.
-- RUN BY HAND in the SQL editor (it deletes rows, so it never goes through the connector):
-- first on the test project, then on production after the owner's yes. Needs
-- 20270111000000_held_invite_expiry.sql first (its indexes make the deletes quick).
--
-- Keeps (owner's decision, 2026-11-09):
-- - crew_search_log: 30 days. It is only read for the last day's search limit.
-- - notifications: read ones for 12 months after they were read. Unread ones are never removed.
-- private.run_data_retention() removes at most 50,000 rows of each per night, so a first run on a
-- large table doesn't hold locks for long; the rest goes on the following nights.
-- pg_cron runs it every night at 04:11 UTC. Returns { search_log, notifications } (rows removed).

create or replace function private.run_data_retention() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_log integer; v_notif integer;
begin
  delete from public.crew_search_log
   where id in (select l.id from public.crew_search_log l
                 where l.created_at < now() - interval '30 days' limit 50000);
  get diagnostics v_log = row_count;

  delete from public.notifications
   where id in (select n.id from public.notifications n
                 where n.read_at is not null and n.read_at < now() - interval '12 months' limit 50000);
  get diagnostics v_notif = row_count;

  return jsonb_build_object('search_log', v_log, 'notifications', v_notif);
end $$;
revoke execute on function private.run_data_retention() from public, anon, authenticated;

select cron.schedule('avx-data-retention', '11 4 * * *', 'select private.run_data_retention()');
