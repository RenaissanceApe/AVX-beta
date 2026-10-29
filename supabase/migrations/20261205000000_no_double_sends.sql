-- No double sends: a double-click, a slow network retry or a page refresh mustn't email the same
-- quote or invite twice. (Push notifications already claim pushed_at before sending.)

-- ── Quotes: one share per send ──────────────────────────────────────────────
-- The app makes a key for each send and sends it again on a retry. send-quote stores it with the
-- link; a second request with the same key finds the first one and sends nothing.
-- Rows without a key (older app versions) aren't affected.
alter table public.quote_shares add column if not exists request_key uuid;
create unique index if not exists quote_shares_request_key_idx
  on public.quote_shares (quote_id, request_key) where request_key is not null;

-- ── Invites: emailed at most once every 10 minutes ─────────────────────────
alter table public.org_invites add column if not exists emailed_at timestamptz;
alter table public.gig_invites add column if not exists emailed_at timestamptz;

-- send-invite (service role) asks just before emailing. True for the first caller only; two
-- requests at the same moment wait on the row, and the second sees it already claimed. False too
-- when the invite is gone (the person signed up in the meantime).
create or replace function public.claim_invite_email(p_kind text, p_target uuid, p_email text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email)); v_rows integer;
begin
  if p_kind = 'org' then
    update public.org_invites set emailed_at = now()
      where org_id = p_target and email = v_email
        and (emailed_at is null or emailed_at < now() - interval '10 minutes');
  elsif p_kind = 'gig' then
    update public.gig_invites set emailed_at = now()
      where gig_id = p_target and email = v_email
        and (emailed_at is null or emailed_at < now() - interval '10 minutes');
  else
    raise exception 'Invalid kind' using errcode = '22023';
  end if;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

-- The email failed: let a retry send it
create or replace function public.release_invite_email(p_kind text, p_target uuid, p_email text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email));
begin
  if p_kind = 'org' then
    update public.org_invites set emailed_at = null where org_id = p_target and email = v_email;
  elsif p_kind = 'gig' then
    update public.gig_invites set emailed_at = null where gig_id = p_target and email = v_email;
  else
    raise exception 'Invalid kind' using errcode = '22023';
  end if;
end $$;

revoke execute on function public.claim_invite_email(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.release_invite_email(text, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_invite_email(text, uuid, text) to service_role;
grant execute on function public.release_invite_email(text, uuid, text) to service_role;
