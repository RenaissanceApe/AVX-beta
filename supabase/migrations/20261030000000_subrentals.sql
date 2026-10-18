-- Inventory phase I6: subrental and cross-hire (docs/INVENTORY.md).
-- 1. Suppliers per organisation; a supplier can be linked to another organisation on AVX
--    with that organisation's cross-hire code.
-- 2. Subrentals: gear hired in from a supplier for a period (optionally for a gig), with
--    lines and costs. Confirmed subrentals add to what can go out during their period.
-- 3. Asking a linked supplier directly: a requested subrental appears in their Inventory,
--    and they confirm or decline it with a note and a price.
-- Written without destructive statements so it applies without manual confirmation.

-- ── Cross-hire codes ─────────────────────────────────────────────────────────
-- Kept apart from organisations so only these functions can set them
create table if not exists public.org_partner_codes (
  org_id uuid primary key references public.organisations(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
alter table public.org_partner_codes enable row level security;
create policy org_partner_codes_select on public.org_partner_codes for select to authenticated using (private.can_quote(org_id));
create policy mfa_required on public.org_partner_codes as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- The organisation's code (made on first use); admins can replace it, which unlinks no one
-- already linked but stops new links with the old code
create or replace function private.partner_code_unchecked(p_org uuid, p_new boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_code text;
begin
  if not private.can_quote(p_org) or (p_new and not private.is_org_admin(p_org)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_new then
    insert into public.org_partner_codes (org_id, code) values (p_org, private.short_code('P'))
    on conflict (org_id) do update set code = excluded.code, created_at = now();
  else
    insert into public.org_partner_codes (org_id, code) values (p_org, private.short_code('P'))
    on conflict (org_id) do nothing;
  end if;
  select c.code into v_code from public.org_partner_codes c where c.org_id = p_org;
  return v_code;
end $$;
create or replace function public.partner_code(p_org uuid, p_new boolean default false) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.partner_code_unchecked(p_org, p_new);
end $$;

-- ── Suppliers ────────────────────────────────────────────────────────────────
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 200),
  contact_name text check (char_length(coalesce(contact_name, '')) <= 120),
  email text check (char_length(coalesce(email, '')) <= 200),
  phone text check (char_length(coalesce(phone, '')) <= 60),
  notes text check (char_length(coalesce(notes, '')) <= 1000),
  partner_org_id uuid references public.organisations(id) on delete set null,
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (partner_org_id is distinct from org_id)
);
create index if not exists suppliers_org_idx on public.suppliers (org_id, name);
create index if not exists suppliers_partner_idx on public.suppliers (partner_org_id) where partner_org_id is not null;
alter table public.suppliers enable row level security;
create policy suppliers_select on public.suppliers for select to authenticated using (private.can_quote(org_id));
create policy suppliers_insert on public.suppliers for insert to authenticated with check (private.can_quote(org_id));
create policy suppliers_update on public.suppliers for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy mfa_required on public.suppliers as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- No delete rule: suppliers are archived

-- The link to another organisation is made only with its code (link_supplier); it can be
-- removed directly
create or replace function private.suppliers_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.created_by := old.created_by; new.created_at := old.created_at;
    if new.partner_org_id is not null and new.partner_org_id is distinct from old.partner_org_id
       and coalesce(current_setting('avx.partner', true), '') <> 'on' then
      new.partner_org_id := old.partner_org_id;
    end if;
  else
    new.partner_org_id := null;
    new.created_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  end if;
  new.name := trim(new.name);
  return new;
end $$;
create or replace trigger suppliers_before before insert or update on public.suppliers
  for each row execute function private.suppliers_before();

create or replace function private.link_supplier_unchecked(p_supplier uuid, p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_partner uuid; v_name text;
begin
  select s.org_id into v_org from public.suppliers s where s.id = p_supplier;
  if v_org is null or not private.can_quote(v_org) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select c.org_id, o.name into v_partner, v_name
    from public.org_partner_codes c join public.organisations o on o.id = c.org_id
   where upper(c.code) = upper(trim(p_code));
  if v_partner is null then raise exception 'Unknown cross-hire code' using errcode = '22023'; end if;
  if v_partner = v_org then raise exception 'That is your own code' using errcode = '22023'; end if;
  perform set_config('avx.partner', 'on', true);
  update public.suppliers set partner_org_id = v_partner where id = p_supplier;
  perform set_config('avx.partner', '', true);
  return v_name;
end $$;
create or replace function public.link_supplier(p_supplier uuid, p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.link_supplier_unchecked(p_supplier, p_code);
end $$;

-- ── Subrentals ───────────────────────────────────────────────────────────────
create table if not exists public.subrentals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  gig_id uuid references public.gigs(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'requested', 'confirmed', 'declined', 'returned', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reference text check (char_length(coalesce(reference, '')) <= 80),
  notes text check (char_length(coalesce(notes, '')) <= 1000),
  reply_note text check (char_length(coalesce(reply_note, '')) <= 1000),
  quoted_total numeric(12,2) check (quoted_total is null or quoted_total >= 0),
  answered_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists subrentals_org_idx on public.subrentals (org_id, starts_at desc);
create index if not exists subrentals_gig_idx on public.subrentals (gig_id) where gig_id is not null;
create index if not exists subrentals_supplier_idx on public.subrentals (supplier_id);
alter table public.subrentals enable row level security;
create policy subrentals_select on public.subrentals for select to authenticated using (private.can_quote(org_id));
create policy subrentals_insert on public.subrentals for insert to authenticated with check (private.can_quote(org_id));
create policy subrentals_update on public.subrentals for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy mfa_required on public.subrentals as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- No delete rule: subrentals are cancelled

create table if not exists public.subrental_lines (
  id uuid primary key default gen_random_uuid(),
  subrental_id uuid not null references public.subrentals(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  item_id uuid references public.price_items(id),
  description text not null check (char_length(trim(description)) between 1 and 200),
  quantity integer not null default 1 check (quantity between 1 and 100000),
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  position integer not null default 0
);
create index if not exists subrental_lines_parent_idx on public.subrental_lines (subrental_id, position);
create index if not exists subrental_lines_item_idx on public.subrental_lines (item_id) where item_id is not null;
alter table public.subrental_lines enable row level security;
create policy subrental_lines_select on public.subrental_lines for select to authenticated using (private.can_quote(org_id));
create policy subrental_lines_insert on public.subrental_lines for insert to authenticated with check (private.can_quote(org_id));
create policy subrental_lines_update on public.subrental_lines for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy subrental_lines_delete on public.subrental_lines for delete to authenticated using (private.can_quote(org_id));
create policy mfa_required on public.subrental_lines as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- Same organisation for the supplier, gig and items; the supplier's answer is written only
-- by answer_hire_request
create or replace function private.subrentals_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.created_by := old.created_by; new.created_at := old.created_at;
    if coalesce(current_setting('avx.partner', true), '') <> 'on' then
      new.reply_note := old.reply_note; new.quoted_total := old.quoted_total; new.answered_at := old.answered_at;
    end if;
  else
    new.reply_note := null; new.quoted_total := null; new.answered_at := null;
    new.created_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  end if;
  if not exists (select 1 from public.suppliers s where s.id = new.supplier_id and s.org_id = new.org_id) then
    raise exception 'Supplier not in this organisation' using errcode = '23514';
  end if;
  if new.gig_id is not null and not exists (select 1 from public.gigs g where g.id = new.gig_id and g.org_id = new.org_id) then
    raise exception 'Gig not in this organisation' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create or replace trigger subrentals_before before insert or update on public.subrentals
  for each row execute function private.subrentals_before();

create or replace function private.subrental_lines_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.subrental_id := old.subrental_id;
  end if;
  select s.org_id into new.org_id from public.subrentals s where s.id = new.subrental_id;
  if new.item_id is not null and not exists (select 1 from public.price_items i where i.id = new.item_id and i.org_id = new.org_id) then
    raise exception 'Item not in this organisation''s inventory' using errcode = '23514';
  end if;
  new.description := trim(new.description);
  return new;
end $$;
create or replace trigger subrental_lines_before before insert or update on public.subrental_lines
  for each row execute function private.subrental_lines_before();

-- A request to a supplier on AVX tells its admins; an answer tells whoever asked
create or replace function private.subrentals_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_partner uuid; v_supplier text; v_from text;
begin
  select s.partner_org_id, s.name into v_partner, v_supplier from public.suppliers s where s.id = new.supplier_id;
  if v_partner is not null and new.status = 'requested' and (tg_op = 'INSERT' or old.status is distinct from 'requested') then
    select o.name into v_from from public.organisations o where o.id = new.org_id;
    insert into public.notifications (user_id, org_id, actor_id, kind, details)
    select m.user_id, v_partner, auth.uid(), 'hire_request',
           jsonb_build_object('subrental_id', new.id, 'from_org', v_from, 'starts_at', new.starts_at, 'ends_at', new.ends_at)
      from public.org_members m where m.org_id = v_partner and m.role = 'admin';
  end if;
  if tg_op = 'UPDATE' and new.answered_at is distinct from old.answered_at and new.answered_at is not null then
    insert into public.notifications (user_id, org_id, gig_id, actor_id, kind, details)
    select distinct m.user_id, new.org_id, new.gig_id, auth.uid(), 'hire_answered',
           jsonb_build_object('subrental_id', new.id, 'supplier', v_supplier, 'answer', new.status)
      from public.org_members m
     where m.org_id = new.org_id and (m.role = 'admin' or m.user_id = new.created_by);
  end if;
  return null;
end $$;
create or replace trigger subrentals_after after insert or update on public.subrentals
  for each row execute function private.subrentals_after();

-- ── The supplier's side ──────────────────────────────────────────────────────
-- Requests from organisations that linked you as a supplier: who, when, what (no prices,
-- gigs or clients of theirs)
create or replace function private.incoming_hire_requests_unchecked(p_org uuid)
returns table(id uuid, from_org text, status text, starts_at timestamptz, ends_at timestamptz, reference text, notes text,
              reply_note text, quoted_total numeric, answered_at timestamptz, created_at timestamptz, lines jsonb)
language sql stable security definer set search_path = '' as $$
  select r.id, o.name, r.status, r.starts_at, r.ends_at, r.reference, r.notes, r.reply_note, r.quoted_total, r.answered_at, r.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity) order by l.position, l.description)
                     from public.subrental_lines l where l.subrental_id = r.id), '[]'::jsonb)
    from public.subrentals r
    join public.suppliers s on s.id = r.supplier_id
    join public.organisations o on o.id = r.org_id
   where s.partner_org_id = p_org and r.status <> 'draft' and private.can_quote(p_org)
   order by (r.status = 'requested') desc, r.starts_at desc
   limit 200
$$;
create or replace function public.incoming_hire_requests(p_org uuid)
returns table(id uuid, from_org text, status text, starts_at timestamptz, ends_at timestamptz, reference text, notes text,
              reply_note text, quoted_total numeric, answered_at timestamptz, created_at timestamptz, lines jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.incoming_hire_requests_unchecked(p_org);
end $$;

create or replace function private.answer_hire_request_unchecked(p_id uuid, p_answer text, p_note text, p_total numeric) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_partner uuid; v_status text;
begin
  select s.partner_org_id, r.status into v_partner, v_status
    from public.subrentals r join public.suppliers s on s.id = r.supplier_id where r.id = p_id;
  if v_partner is null or not private.can_quote(v_partner) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_answer not in ('confirmed', 'declined') or (p_total is not null and p_total < 0) then
    raise exception 'Invalid answer' using errcode = '22023';
  end if;
  if v_status <> 'requested' then
    raise exception 'This request was already answered or withdrawn' using errcode = '22023';
  end if;
  perform set_config('avx.partner', 'on', true);
  update public.subrentals set status = p_answer, reply_note = left(nullif(trim(coalesce(p_note, '')), ''), 1000),
         quoted_total = p_total, answered_at = now()
   where id = p_id;
  perform set_config('avx.partner', '', true);
end $$;
create or replace function public.answer_hire_request(p_id uuid, p_answer text, p_note text default null, p_total numeric default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.answer_hire_request_unchecked(p_id, p_answer, p_note, p_total);
end $$;

-- ── Availability counts what's hired in ──────────────────────────────────────
-- Confirmed subrentals that cover the whole period add their quantity of the item
create or replace function private.item_hired_in(p_item uuid, p_period tstzrange) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.quantity), 0)::integer
    from public.subrental_lines l join public.subrentals r on r.id = l.subrental_id
   where l.item_id = p_item and r.status = 'confirmed' and p_period is not null
     and tstzrange(r.starts_at, r.ends_at, '[)') @> p_period
$$;

create or replace function private.equipment_availability_unchecked(p_org uuid, p_items uuid[], p_from timestamptz, p_until timestamptz, p_exclude_gig uuid)
returns table(item_id uuid, owned integer, booked integer, available integer)
language sql stable security definer set search_path = '' as $$
  select i.id, o.owned, b.booked, o.owned - b.booked
  from public.price_items i
  cross join lateral (select private.item_owned(i.id) + private.item_hired_in(i.id, tstzrange(p_from, p_until, '[)')) as owned) o
  cross join lateral (select private.equipment_peak(i.id, tstzrange(p_from, p_until, '[)'), p_exclude_gig) as booked) b
  where i.org_id = p_org and private.can_quote(p_org) and i.tracking <> 'none'
    and (p_items is null or i.id = any(p_items)) and p_until > p_from
$$;

create or replace function private.gig_equipment_status_unchecked(p_gig uuid)
returns table(line_id uuid, item_id uuid, quantity integer, owned integer, booked_elsewhere integer, available integer,
              starts_at timestamptz, ends_at timestamptz, weight_kg numeric, power_w integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.can_manage_gig(p_gig) or private.can_quote((select g.org_id from public.gigs g where g.id = p_gig))) then return; end if;
  return query
    select e.id, e.item_id, e.quantity, o.owned, coalesce(private.equipment_peak(e.item_id, r.period, p_gig), 0),
           o.owned - coalesce(private.equipment_peak(e.item_id, r.period, p_gig), 0),
           lower(r.period), upper(r.period), i.weight_kg, i.power_w
    from public.gig_equipment e
    join public.price_items i on i.id = e.item_id
    left join public.reservations r on r.source_type = 'gig_equipment' and r.source_id = e.id::text and r.status <> 'cancelled'
    cross join lateral (select private.item_owned(e.item_id) + private.item_hired_in(e.item_id, r.period) as owned) o
    where e.gig_id = p_gig;
end $$;

revoke execute on function private.partner_code_unchecked(uuid, boolean) from public, anon, authenticated;
revoke execute on function private.suppliers_before() from public, anon, authenticated;
revoke execute on function private.link_supplier_unchecked(uuid, text) from public, anon, authenticated;
revoke execute on function private.subrentals_before() from public, anon, authenticated;
revoke execute on function private.subrental_lines_before() from public, anon, authenticated;
revoke execute on function private.subrentals_after() from public, anon, authenticated;
revoke execute on function private.incoming_hire_requests_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.answer_hire_request_unchecked(uuid, text, text, numeric) from public, anon, authenticated;
revoke execute on function private.item_hired_in(uuid, tstzrange) from public, anon, authenticated;
revoke execute on function public.partner_code(uuid, boolean) from public, anon;
revoke execute on function public.link_supplier(uuid, text) from public, anon;
revoke execute on function public.incoming_hire_requests(uuid) from public, anon;
revoke execute on function public.answer_hire_request(uuid, text, text, numeric) from public, anon;
grant execute on function public.partner_code(uuid, boolean) to authenticated;
grant execute on function public.link_supplier(uuid, text) to authenticated;
grant execute on function public.incoming_hire_requests(uuid) to authenticated;
grant execute on function public.answer_hire_request(uuid, text, text, numeric) to authenticated;
