-- Phase 4c: quote versions, sending a quote to the client (share links with accept /
-- decline), and crew positions to fill on a gig. Written without destructive
-- statements so it applies without manual confirmation.

-- ── Quote versions ───────────────────────────────────────────────────────────
-- A frozen copy of a quote (all client-facing fields + body) with a short note.
create table if not exists public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  version_no integer not null,
  note text check (char_length(coalesce(note, '')) <= 200),
  snapshot jsonb not null,
  total_net numeric(14,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (quote_id, version_no),
  constraint quote_versions_snapshot_check check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) < 600000)
);
create index if not exists quote_versions_quote_idx on public.quote_versions (quote_id, version_no desc);
alter table public.quote_versions enable row level security;

create policy quote_versions_select on public.quote_versions for select to authenticated
  using (private.can_quote(org_id));
create policy quote_versions_insert on public.quote_versions for insert to authenticated
  with check (private.can_quote(org_id));
create policy quote_versions_delete on public.quote_versions for delete to authenticated
  using (private.is_org_admin(org_id));

-- Numbering and ownership come from the database; the organisation always matches the quote
create or replace function private.quote_versions_before_insert() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  select org_id into new.org_id from quotes where id = new.quote_id;
  if new.org_id is null then
    raise exception 'Quote not found';
  end if;
  perform pg_advisory_xact_lock(hashtext('quote-version:' || new.quote_id::text));
  new.version_no := coalesce((select max(version_no) from quote_versions where quote_id = new.quote_id), 0) + 1;
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.created_at := now();
  return new;
end $$;
revoke execute on function private.quote_versions_before_insert() from public, anon, authenticated;
create or replace trigger quote_versions_before_insert before insert on public.quote_versions
  for each row execute function private.quote_versions_before_insert();

-- ── Share links sent to clients ──────────────────────────────────────────────
-- Created only by the send-quote Edge Function (service role). The link carries a
-- random token; only its SHA-256 hash is stored. The public quote-public function
-- looks shares up by hash and records accept / decline.
create table if not exists public.quote_shares (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  version_id uuid not null references public.quote_versions(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  sent_to text check (char_length(coalesce(sent_to, '')) <= 200),
  emailed boolean not null default false,
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'revoked')),
  expires_at timestamptz not null,
  viewed_at timestamptz,
  responded_at timestamptz,
  responder_name text check (char_length(coalesce(responder_name, '')) <= 200),
  responder_note text check (char_length(coalesce(responder_note, '')) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists quote_shares_quote_idx on public.quote_shares (quote_id, created_at desc);
alter table public.quote_shares enable row level security;

create policy quote_shares_select on public.quote_shares for select to authenticated
  using (private.can_quote(org_id));
-- Members may only revoke an open link; everything else is done by the Edge Functions
create policy quote_shares_update on public.quote_shares for update to authenticated
  using (private.can_quote(org_id) and status = 'open') with check (private.can_quote(org_id) and status = 'revoked');
revoke update on public.quote_shares from authenticated;
grant update (status) on public.quote_shares to authenticated;

-- ── Crew positions to fill on a gig ──────────────────────────────────────────
-- Roles the gig needs (e.g. "Sound technician × 2"), whether or not someone is
-- assigned yet. Created by hand or from an accepted quote's crew lines.
create table if not exists public.gig_positions (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  quantity integer not null default 1 check (quantity between 1 and 99),
  notes text check (char_length(coalesce(notes, '')) <= 500),
  source_quote_id uuid references public.quotes(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists gig_positions_gig_idx on public.gig_positions (gig_id, created_at);
alter table public.gig_positions enable row level security;

create policy gig_positions_select on public.gig_positions for select to authenticated
  using (private.can_access_gig(gig_id));
create policy gig_positions_insert on public.gig_positions for insert to authenticated
  with check (private.can_manage_gig(gig_id) and created_by = auth.uid());
create policy gig_positions_update on public.gig_positions for update to authenticated
  using (private.can_manage_gig(gig_id)) with check (private.can_manage_gig(gig_id));
create policy gig_positions_delete on public.gig_positions for delete to authenticated
  using (private.can_manage_gig(gig_id));
