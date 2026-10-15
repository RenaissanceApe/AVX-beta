-- Phase 4: quotes, built from phases → sections → lines, plus reusable templates.
-- Modelled on how Rentman structures a project financially (subprojects → groups →
-- equipment / crew functions / costs), without any inventory.
--
-- A quote's content lives in one jsonb document (`body`), saved as a whole. That keeps
-- editing, duplicating and templating simple; `version` guards against two people
-- overwriting each other (the app saves with "where version = <what I loaded>").
--
-- body = { "phases": [ { id, name, start_date, end_date, discount_pct, optional,
--            "sections": [ { id, name,
--               "lines": [ { id, kind, description, details, qty, unit, factor,
--                            unit_price, discount_pct } ] } ] } ] }
-- kind: rental | sale | crew | transport | other | comment
--
-- Only organisation admins and members see or edit quotes; viewers and gig crew don't.
-- Written without destructive statements so it applies without manual confirmation.

-- ── Company details printed on quotes ────────────────────────────────────────
alter table public.organisations add column if not exists legal_name text;
alter table public.organisations add column if not exists tax_id text;
alter table public.organisations add column if not exists address text;
alter table public.organisations add column if not exists email text;
alter table public.organisations add column if not exists phone text;
alter table public.organisations add column if not exists website text;
alter table public.organisations add column if not exists quote_terms text;
alter table public.organisations add column if not exists default_vat_rate numeric(5,2) not null default 23;
alter table public.organisations add column if not exists quote_validity_days integer not null default 30;
alter table public.organisations add constraint organisations_quote_settings_check check (
  char_length(coalesce(legal_name, '')) <= 200 and char_length(coalesce(tax_id, '')) <= 40
  and char_length(coalesce(address, '')) <= 500 and char_length(coalesce(email, '')) <= 200
  and char_length(coalesce(phone, '')) <= 60 and char_length(coalesce(website, '')) <= 200
  and char_length(coalesce(quote_terms, '')) <= 5000
  and default_vat_rate between 0 and 100 and quote_validity_days between 1 and 365) not valid;
alter table public.organisations validate constraint organisations_quote_settings_check;

-- ── Who may work on quotes ───────────────────────────────────────────────────
create or replace function private.can_quote(p_org uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from org_members where org_id = p_org and user_id = auth.uid() and role in ('admin', 'member'))
$$;
revoke execute on function private.can_quote(uuid) from public, anon;
grant execute on function private.can_quote(uuid) to authenticated;

-- ── Quotes ───────────────────────────────────────────────────────────────────
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  gig_id uuid references public.gigs(id) on delete set null,
  number integer not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),
  language text not null default 'pt' check (language in ('pt', 'en')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  client_name text,
  client_company text,
  client_email text,
  client_address text,
  client_tax_id text,
  issue_date date not null default current_date,
  valid_until date,
  intro text,
  terms text,
  vat_rate numeric(5,2) not null default 23 check (vat_rate between 0 and 100),
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  show_line_prices boolean not null default true,
  body jsonb not null default '{"phases": []}',
  total_net numeric(14,2) not null default 0, -- written by the app on save, for lists
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number),
  constraint quotes_text_check check (
    char_length(trim(title)) between 1 and 200
    and char_length(coalesce(client_name, '')) <= 200 and char_length(coalesce(client_company, '')) <= 200
    and char_length(coalesce(client_email, '')) <= 200 and char_length(coalesce(client_address, '')) <= 500
    and char_length(coalesce(client_tax_id, '')) <= 40
    and char_length(coalesce(intro, '')) <= 5000 and char_length(coalesce(terms, '')) <= 5000),
  constraint quotes_body_check check (
    jsonb_typeof(body) = 'object' and jsonb_typeof(body->'phases') = 'array' and pg_column_size(body) < 500000),
  constraint quotes_dates_check check (valid_until is null or valid_until >= issue_date)
);
create index if not exists quotes_org_idx on public.quotes (org_id, number desc);
create index if not exists quotes_gig_idx on public.quotes (gig_id) where gig_id is not null;
alter table public.quotes enable row level security;

create policy quotes_select on public.quotes for select to authenticated
  using (private.can_quote(org_id));
create policy quotes_insert on public.quotes for insert to authenticated
  with check (private.can_quote(org_id));
create policy quotes_update on public.quotes for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy quotes_delete on public.quotes for delete to authenticated
  using (private.is_org_admin(org_id) or created_by = auth.uid());

-- Numbering, authorship and the edit counter are set by the database, not the app.
create or replace function private.quotes_before_write() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.gig_id is not null and not exists (select 1 from gigs where id = new.gig_id and org_id = new.org_id) then
    raise exception 'That gig belongs to another organisation';
  end if;
  if tg_op = 'INSERT' then
    -- One number sequence per organisation; the lock stops two quotes getting the same number
    perform pg_advisory_xact_lock(hashtext('quote-number:' || new.org_id::text));
    new.number := coalesce((select max(number) from quotes where org_id = new.org_id), 0) + 1;
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
revoke execute on function private.quotes_before_write() from public, anon, authenticated;
create or replace trigger quotes_before_write before insert or update on public.quotes
  for each row execute function private.quotes_before_write();

-- ── Templates ────────────────────────────────────────────────────────────────
-- A template is a reusable set of phases/sections/lines (no client, no dates):
-- start a new quote from it, or add it to an existing quote as a building block.
create table if not exists public.quote_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text check (char_length(coalesce(description, '')) <= 500),
  body jsonb not null default '{"phases": []}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_templates_body_check check (
    jsonb_typeof(body) = 'object' and jsonb_typeof(body->'phases') = 'array' and pg_column_size(body) < 500000)
);
create index if not exists quote_templates_org_idx on public.quote_templates (org_id, name);
alter table public.quote_templates enable row level security;

create policy quote_templates_select on public.quote_templates for select to authenticated
  using (private.can_quote(org_id));
create policy quote_templates_insert on public.quote_templates for insert to authenticated
  with check (private.can_quote(org_id) and created_by = auth.uid());
create policy quote_templates_update on public.quote_templates for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy quote_templates_delete on public.quote_templates for delete to authenticated
  using (private.is_org_admin(org_id) or created_by = auth.uid());
