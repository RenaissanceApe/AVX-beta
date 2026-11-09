-- Step 16 · E-signature (S11). A plain electronic signature: a drawn image, the signer's typed
-- name, the time and the SHA-256 of the exact text that was signed, plus a signed PDF kept with it.
-- Used for quote acceptance (through the quote-public Edge Function), delivery notes signed on site,
-- and later crew contracts (step 27) and the rigger's sign-off (RG4).
--
-- A signature can't be changed after signing: every signed field is frozen by a trigger that also
-- binds the service role. The only changes allowed are filling in the signed PDF once, marking the
-- signature removed (and back), and clearing created_by when that account is erased.
-- Signed-in users have no right to erase rows; files in the bucket can't be replaced or removed.
-- Tests: supabase/tests/signatures.sql

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.signatures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  kind text not null check (kind in ('quote_acceptance', 'delivery_note', 'crew_contract', 'rigging_signoff')),
  gig_id uuid references public.gigs(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete cascade,
  quote_share_id uuid references public.quote_shares(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  signer_name text not null check (char_length(btrim(signer_name)) between 1 and 200),
  signer_role text check (signer_role is null or char_length(signer_role) <= 200),
  signed_at timestamptz not null default now(),
  -- The exact text that was signed (canonical JSON: keys sorted, no spaces) and its SHA-256 (hex)
  document text not null check (char_length(document) between 2 and 2000000),
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  image_path text not null,
  image_sha256 text not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_path text,
  pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  check ((pdf_path is null) = (pdf_sha256 is null))
);
create index if not exists signatures_org_idx on public.signatures (org_id);
create index if not exists signatures_gig_idx on public.signatures (gig_id) where gig_id is not null;
create index if not exists signatures_quote_idx on public.signatures (quote_id) where quote_id is not null;
alter table public.signatures enable row level security;

-- ── Who sees and who collects ────────────────────────────────────────────────
-- See: quote acceptances = the quoting people (or the quote's gig managers); delivery notes and
-- rigging sign-offs = everyone on the gig; crew contracts = the organisation's admins (step 27 may widen).
create or replace function private.can_see_signature(p_org uuid, p_kind text, p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'quote_acceptance' then private.can_quote(p_org) or (p_gig is not null and private.can_manage_gig(p_gig))
    when 'delivery_note' then p_gig is not null and private.can_access_gig(p_gig)
    when 'rigging_signoff' then p_gig is not null and private.can_access_gig(p_gig)
    when 'crew_contract' then private.is_org_admin(p_org)
    else false end
$$;
-- Collect (sign on site), attach the signed PDF, mark removed: delivery notes = whoever may scan
-- gear out (can_dispatch); rigging = the gig's managers; contracts = admins; quote acceptances =
-- the quoting people, but a new acceptance only ever comes from the client's link (Edge Function).
create or replace function private.can_manage_signature(p_org uuid, p_kind text, p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'quote_acceptance' then private.can_quote(p_org)
    when 'delivery_note' then p_gig is not null and private.can_dispatch(p_gig)
    when 'rigging_signoff' then p_gig is not null and private.can_manage_gig(p_gig)
    when 'crew_contract' then private.is_org_admin(p_org)
    else false end
$$;
revoke execute on function private.can_see_signature(uuid, text, uuid), private.can_manage_signature(uuid, text, uuid) from public, anon;
grant execute on function private.can_see_signature(uuid, text, uuid), private.can_manage_signature(uuid, text, uuid) to authenticated;

-- ── Insert: fix the time, the signer account and the paths; check the hash and the target ──
create or replace function private.signatures_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.signed_at := now();
  new.created_at := now();
  new.created_by := auth.uid();
  new.removed_at := null;
  new.removed_by := null;
  new.pdf_path := null;
  new.pdf_sha256 := null;
  new.signer_name := btrim(new.signer_name);
  new.image_path := new.org_id::text || '/' || new.id::text || '/signature.png';
  if new.document_sha256 is distinct from encode(sha256(convert_to(new.document, 'UTF8')), 'hex') then
    raise exception 'The document hash does not match the document' using errcode = '23514';
  end if;
  if new.kind = 'quote_acceptance' and (new.quote_id is null or new.quote_share_id is null) then
    raise exception 'A quote acceptance needs its quote and link' using errcode = '23514';
  end if;
  if new.kind in ('delivery_note', 'rigging_signoff') and new.gig_id is null then
    raise exception 'This signature needs its gig' using errcode = '23514';
  end if;
  if new.gig_id is not null and not exists (select 1 from public.gigs g where g.id = new.gig_id and g.org_id = new.org_id) then
    raise exception 'The gig is not in this organisation' using errcode = '23514';
  end if;
  if new.quote_id is not null and not exists (select 1 from public.quotes q where q.id = new.quote_id and q.org_id = new.org_id) then
    raise exception 'The quote is not in this organisation' using errcode = '23514';
  end if;
  if new.quote_share_id is not null and not exists (select 1 from public.quote_shares s where s.id = new.quote_share_id and s.quote_id = new.quote_id) then
    raise exception 'The link is not for this quote' using errcode = '23514';
  end if;
  return new;
end $$;
create or replace trigger signatures_before_insert before insert on public.signatures
  for each row execute function private.signatures_before_insert();

-- ── Update: a signature can't be changed after signing ──────────────────────
create or replace function private.signatures_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.id, new.org_id, new.kind, new.gig_id, new.quote_id, new.quote_share_id, new.title, new.signer_name,
      new.signer_role, new.signed_at, new.document, new.document_sha256, new.image_path, new.image_sha256, new.created_at)
     is distinct from
     (old.id, old.org_id, old.kind, old.gig_id, old.quote_id, old.quote_share_id, old.title, old.signer_name,
      old.signer_role, old.signed_at, old.document, old.document_sha256, old.image_path, old.image_sha256, old.created_at) then
    raise exception 'A signature can''t be changed after signing' using errcode = '42501';
  end if;
  -- The signed PDF is filled in once, at its fixed path, and then stays
  if (new.pdf_path, new.pdf_sha256) is distinct from (old.pdf_path, old.pdf_sha256) then
    if old.pdf_path is not null or new.pdf_path is distinct from (old.org_id::text || '/' || old.id::text || '/signed.pdf') then
      raise exception 'A signature can''t be changed after signing' using errcode = '42501';
    end if;
  end if;
  -- The account that collected it may only be cleared (account erased)
  if new.created_by is distinct from old.created_by and new.created_by is not null then
    raise exception 'A signature can''t be changed after signing' using errcode = '42501';
  end if;
  -- Marking removed (and back) records who did it
  if new.removed_at is distinct from old.removed_at then
    new.removed_by := case when new.removed_at is null then null else auth.uid() end;
  elsif new.removed_by is distinct from old.removed_by and new.removed_by is not null then
    raise exception 'A signature can''t be changed after signing' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace trigger signatures_guard before update on public.signatures
  for each row execute function private.signatures_guard();

-- ── Row-level security ───────────────────────────────────────────────────────
create policy signatures_select on public.signatures for select to authenticated
  using (private.can_see_signature(org_id, kind, gig_id));
create policy signatures_insert on public.signatures for insert to authenticated
  with check (kind <> 'quote_acceptance' and private.can_manage_signature(org_id, kind, gig_id));
create policy signatures_update on public.signatures for update to authenticated
  using (private.can_manage_signature(org_id, kind, gig_id)) with check (private.can_manage_signature(org_id, kind, gig_id));
-- Signed-in users may read, add and mark; nobody but the database itself erases a signature
revoke all on public.signatures from anon, authenticated;
grant select, insert, update on public.signatures to authenticated;

-- ── Private bucket: <org id>/<signature id>/signature.png | signed.pdf ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 5242880, array['image/png', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/png', 'application/pdf'];

create or replace function private.can_read_signature_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.signatures s
                  where s.id = private.path_uuid(p_name, 2) and s.org_id = private.path_uuid(p_name, 1)
                    and private.can_see_signature(s.org_id, s.kind, s.gig_id))
$$;
-- The drawing: only by whoever collected it, within 15 minutes of signing. The signed PDF: once,
-- while the row has none, by someone who may manage it. No update or removal policies: a file
-- that is there can't be replaced.
create or replace function private.can_add_signature_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select split_part(p_name, '/', 4) = '' and exists (
    select 1 from public.signatures s
     where s.id = private.path_uuid(p_name, 2) and s.org_id = private.path_uuid(p_name, 1)
       and s.removed_at is null
       and ((split_part(p_name, '/', 3) = 'signature.png' and s.created_by = auth.uid() and s.created_at > now() - interval '15 minutes')
         or (split_part(p_name, '/', 3) = 'signed.pdf' and s.pdf_path is null and private.can_manage_signature(s.org_id, s.kind, s.gig_id))))
$$;
revoke execute on function private.can_read_signature_file(text), private.can_add_signature_file(text) from public, anon;
grant execute on function private.can_read_signature_file(text), private.can_add_signature_file(text) to authenticated;
create policy signatures_files_select on storage.objects for select to authenticated
  using (bucket_id = 'signatures' and private.can_read_signature_file(name));
create policy signatures_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures' and private.can_add_signature_file(name));
