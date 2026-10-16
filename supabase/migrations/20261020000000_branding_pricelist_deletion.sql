-- Phase 4b: quote branding, price list, quote numbering, and notices when a gig or
-- organisation is deleted. Written without destructive statements so it applies
-- without manual confirmation.

-- ── Quote numbering and per-quote header fields ──────────────────────────────
alter table public.organisations add column if not exists quote_number_prefix text not null default 'Q';
alter table public.organisations add column if not exists quote_next_number integer;
alter table public.organisations add constraint organisations_quote_numbering_check check (
  char_length(quote_number_prefix) <= 10 and (quote_next_number is null or quote_next_number between 1 and 999999)) not valid;
alter table public.organisations validate constraint organisations_quote_numbering_check;

alter table public.quotes add column if not exists payment_terms text;
alter table public.quotes add column if not exists manager_name text;
alter table public.quotes add constraint quotes_header_fields_check check (
  char_length(coalesce(payment_terms, '')) <= 500 and char_length(coalesce(manager_name, '')) <= 120) not valid;
alter table public.quotes validate constraint quotes_header_fields_check;

-- New quotes continue from the highest number used, or from the organisation's
-- "next number" when that is higher (e.g. carrying on from an older numbering).
create or replace function private.quotes_before_write() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.gig_id is not null and not exists (select 1 from gigs where id = new.gig_id and org_id = new.org_id) then
    raise exception 'That gig belongs to another organisation';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('quote-number:' || new.org_id::text));
    new.number := greatest(
      coalesce((select max(number) from quotes where org_id = new.org_id), 0) + 1,
      coalesce((select quote_next_number from organisations where id = new.org_id), 1));
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
  else
    new.org_id := old.org_id;
    new.number := old.number;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
    new.version := old.version + 1;
  end if;
  return new;
end $$;

-- ── Branding (kept out of organisations so lists stay light) ─────────────────
-- header_image is a data: URL (PNG, JPEG or SVG) shown at the top of every quote page.
-- It is only ever rendered through <img>, so an SVG cannot run scripts.
create table if not exists public.org_branding (
  org_id uuid primary key references public.organisations(id) on delete cascade,
  header_image text,
  brand_color text not null default '#1EC878',
  updated_at timestamptz not null default now(),
  constraint org_branding_check check (
    (header_image is null or (char_length(header_image) <= 450000
      and header_image ~ '^data:image/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$'))
    and brand_color ~ '^#[0-9A-Fa-f]{6}$')
);
alter table public.org_branding enable row level security;
create policy org_branding_select on public.org_branding for select to authenticated
  using (private.is_org_member(org_id));
create policy org_branding_insert on public.org_branding for insert to authenticated
  with check (private.is_org_admin(org_id));
create policy org_branding_update on public.org_branding for update to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy org_branding_delete on public.org_branding for delete to authenticated
  using (private.is_org_admin(org_id));

-- ── Price list ───────────────────────────────────────────────────────────────
create table if not exists public.price_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  kind text not null default 'rental' check (kind in ('rental', 'sale', 'crew', 'transport', 'other')),
  unit text not null default 'unit' check (unit in ('unit', 'day', 'hour', 'km', 'set', 'lump')),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  category text,
  details text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_items_text_check check (
    char_length(trim(name)) between 1 and 200 and char_length(coalesce(category, '')) <= 80
    and char_length(coalesce(details, '')) <= 1000)
);
create index if not exists price_items_org_idx on public.price_items (org_id, category, name);
alter table public.price_items enable row level security;
create policy price_items_select on public.price_items for select to authenticated
  using (private.can_quote(org_id));
create policy price_items_insert on public.price_items for insert to authenticated
  with check (private.can_quote(org_id) and created_by = auth.uid());
create policy price_items_update on public.price_items for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy price_items_delete on public.price_items for delete to authenticated
  using (private.can_quote(org_id));

-- ── Tell people when a gig or organisation they belong to is deleted ─────────
-- The notice is not linked to the gig/org (it is gone), so it survives the cascade.
create or replace function private.notify_before_delete() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if tg_table_name = 'gigs' then
    -- Skip when the whole organisation is being deleted: members get one notice for that
    if old.org_id is null or exists (select 1 from organisations where id = old.org_id) then
      insert into notifications (user_id, actor_id, kind, details)
      select gm.user_id, auth.uid(), 'gig_deleted',
             jsonb_build_object('gig_name', old.name, 'start_date', old.start_date)
      from gig_members gm
      where gm.gig_id = old.id and gm.user_id is distinct from auth.uid();
    end if;
  elsif tg_table_name = 'organisations' then
    insert into notifications (user_id, actor_id, kind, details)
    select om.user_id, auth.uid(), 'org_deleted', jsonb_build_object('org_name', old.name)
    from org_members om
    where om.org_id = old.id and om.user_id is distinct from auth.uid();
  end if;
  return old;
end $$;
revoke execute on function private.notify_before_delete() from public, anon, authenticated;
create or replace trigger notify_before_delete before delete on public.gigs
  for each row execute function private.notify_before_delete();
create or replace trigger notify_before_delete before delete on public.organisations
  for each row execute function private.notify_before_delete();
