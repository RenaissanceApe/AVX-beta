-- Upkeep U3 (docs/DATA_MAP.md, open items 2 and 3), part 1: held invitations get a reminder and
-- an expiry; indexes for the nightly clean-up in 20270111000001_retention_cleanup.sql (run by hand).
-- Only adds: no destructive statements, so it applies through the connector.
--
-- - held_invites.reminded_at: when the organisation's admins were reminded about it (once).
-- - held_invites.expired_at: when it was marked expired. An expired invitation keeps its status
--   'held' (the status check isn't widened, which would need a constraint swap): it is not
--   removed, the admins can still send or discard it, and the app shows it as expired.
-- - private.remind_held_invites(), every night at 06:53 UTC:
--   * held invitations older than 14 days that were never reminded about: one notification per
--     organisation to each admin ('held_invites_waiting', with how many are held in all), then
--     reminded_at is set;
--   * held invitations older than 60 days: expired_at is set.
-- - Only that function sets reminded_at / expired_at: private.held_invites_before keeps them as
--   they were on any other update (re-import, role change, send, discard).

-- ── The columns ──────────────────────────────────────────────────────────────
alter table public.held_invites add column if not exists reminded_at timestamptz;
alter table public.held_invites add column if not exists expired_at timestamptz;
create index if not exists held_invites_waiting_idx on public.held_invites (created_at) where status = 'held';

-- ── The update trigger: as before, plus the two columns are the nightly job's ─
create or replace function private.held_invites_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id; new.org_id := old.org_id; new.email := old.email; new.created_by := old.created_by;
  new.created_at := old.created_at; new.import_file := old.import_file;
  if coalesce(current_setting('avx.held_upkeep', true), 'off') <> 'on' then
    new.reminded_at := old.reminded_at; new.expired_at := old.expired_at;
  end if;
  if old.status <> 'held' then
    raise exception 'This invitation was already %', old.status using errcode = '22023';
  end if;
  if new.status = 'sent' then
    new.sent_at := now(); new.sent_by := auth.uid();
  else
    new.sent_at := null; new.sent_by := null; new.result := null;
  end if;
  return new;
end $$;
revoke execute on function private.held_invites_before() from public, anon, authenticated;

-- ── The nightly reminder and expiry ──────────────────────────────────────────
-- Returns { reminded: organisations reminded, expired: invitations marked expired }.
create or replace function private.remind_held_invites() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_orgs integer := 0; v_expired integer := 0;
begin
  perform set_config('avx.held_upkeep', 'on', true);

  for r in
    select h.org_id, o.name as org_name, array_agg(h.id) as ids
      from public.held_invites h join public.organisations o on o.id = h.org_id
     where h.status = 'held' and h.reminded_at is null and h.expired_at is null
       and h.created_at < now() - interval '14 days'
     group by h.org_id, o.name
     limit 2000
  loop
    insert into public.notifications (user_id, org_id, kind, details)
    select m.user_id, r.org_id, 'held_invites_waiting',
           jsonb_build_object('count', (select count(*) from public.held_invites h
                                         where h.org_id = r.org_id and h.status = 'held'),
                              'org_name', r.org_name)
      from public.org_members m where m.org_id = r.org_id and m.role = 'admin';
    update public.held_invites set reminded_at = now() where id = any (r.ids);
    v_orgs := v_orgs + 1;
  end loop;

  update public.held_invites set expired_at = now()
   where status = 'held' and expired_at is null and created_at < now() - interval '60 days';
  get diagnostics v_expired = row_count;

  perform set_config('avx.held_upkeep', 'off', true);
  return jsonb_build_object('reminded', v_orgs, 'expired', v_expired);
end $$;
revoke execute on function private.remind_held_invites() from public, anon, authenticated;

select cron.schedule('avx-held-invites', '53 6 * * *', 'select private.remind_held_invites()');

-- ── Indexes for the clean-up in 20270111000001 (harmless on their own) ───────
create index if not exists notifications_read_idx on public.notifications (read_at) where read_at is not null;
create index if not exists crew_search_log_created_idx on public.crew_search_log (created_at);
