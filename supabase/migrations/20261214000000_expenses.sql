-- Build order step 9b (docs/BUSINESS.md, docs/ANALYTICS.md): expenses.
-- 1. private.can_see_finance(org): who sees money (D23: the organisation's admins and members).
--    Expenses use it now; every money report later.
-- 2. org_finance_settings: whether the organisation recovers VAT (default yes).
-- 3. expense_categories: per organisation, each of a kind (direct, overhead, capital, tax_other);
--    capital ones are spread over a number of months; a category can mark its VAT as not
--    recoverable (meals, hotels, passenger cars). A starter list is made on first use.
-- 4. expenses: the ledger. A link to a gig and to at most one of a subrental, a repair, a crew fee
--    or a stock purchase, with one live expense per linked record (each cost counted once).
-- 5. Expense claims: anyone on a gig adds what they paid (with the receipt); the gig's managers
--    approve or send it back; approved claims are "to reimburse" until paid.
-- 6. expense_recurrences: rent, insurance, leasing… A daily job drafts each one on its date, once.
-- 7. The private expense-receipts bucket (<org>/<expense>/<file>).
-- 8. supplier_spend(org, from, until) for Contacts.
-- Written without destructive statements so it applies without manual confirmation.

-- ── Who sees money ───────────────────────────────────────────────────────────
create or replace function private.can_see_finance(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m
                  where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('admin', 'member'))
$$;
revoke execute on function private.can_see_finance(uuid) from public, anon;
grant execute on function private.can_see_finance(uuid) to authenticated;

-- ── Settings ─────────────────────────────────────────────────────────────────
create table if not exists public.org_finance_settings (
  org_id uuid primary key references public.organisations(id) on delete cascade,
  recovers_vat boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.org_finance_settings enable row level security;
create policy org_finance_settings_select on public.org_finance_settings for select to authenticated
  using (private.can_see_finance(org_id));
create policy org_finance_settings_insert on public.org_finance_settings for insert to authenticated
  with check (private.is_org_admin(org_id));
create policy org_finance_settings_update on public.org_finance_settings for update to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy mfa_required on public.org_finance_settings as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.org_finance_settings from authenticated;
grant update (recovers_vat) on public.org_finance_settings to authenticated;

create or replace function private.org_finance_settings_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.org_id := old.org_id; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.org_finance_settings_before() from public, anon, authenticated;
create or replace trigger org_finance_settings_before before insert or update on public.org_finance_settings
  for each row execute function private.org_finance_settings_before();

-- ── Categories ───────────────────────────────────────────────────────────────
-- A starter category keeps its starter_key and no name until renamed, so it shows in the
-- reader's language.
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  starter_key text check (starter_key ~ '^[a-z_]{1,40}$'),
  name text check (char_length(trim(name)) between 1 and 80),
  kind text not null check (kind in ('direct', 'overhead', 'capital', 'tax_other')),
  spread_months integer check (spread_months between 1 and 600),
  vat_recoverable boolean not null default true,
  sort integer not null default 0,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (name is not null or starter_key is not null),
  check ((kind = 'capital') = (spread_months is not null))
);
create index if not exists expense_categories_org_idx on public.expense_categories (org_id, sort);
create unique index if not exists expense_categories_starter_key on public.expense_categories (org_id, starter_key)
  where starter_key is not null;
alter table public.expense_categories enable row level security;
create policy expense_categories_select on public.expense_categories for select to authenticated
  using (private.can_see_finance(org_id) or private.is_org_member(org_id));
create policy expense_categories_insert on public.expense_categories for insert to authenticated
  with check (private.is_org_admin(org_id));
create policy expense_categories_update on public.expense_categories for update to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy mfa_required on public.expense_categories as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.expense_categories from authenticated;
grant update (name, kind, spread_months, vat_recoverable, sort, archived_at) on public.expense_categories to authenticated;
-- Categories are archived, never removed

create or replace function private.expense_categories_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := nullif(trim(new.name), '');
  if new.kind <> 'capital' then new.spread_months := null; end if;
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.created_at := now(); new.starter_key := null;
    if (select count(*) from public.expense_categories c where c.org_id = new.org_id) >= 200 then
      raise exception 'Category limit reached' using errcode = '54000';
    end if;
  else
    new.id := old.id; new.org_id := old.org_id; new.starter_key := old.starter_key;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if new.archived_at is not null and old.archived_at is null then new.archived_at := now(); end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke execute on function private.expense_categories_before() from public, anon, authenticated;
create or replace trigger expense_categories_before before insert or update on public.expense_categories
  for each row execute function private.expense_categories_before();

-- The starter list, made once per organisation by the first person who sees money to open Expenses
create or replace function public.ensure_expense_categories(p_org uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer;
begin
  if not private.can_see_finance(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.expense_categories c where c.org_id = p_org) then return 0; end if;
  insert into public.expense_categories (org_id, starter_key, kind, spread_months, vat_recoverable, sort)
  select p_org, s.key, s.kind, s.months, s.vat, s.sort
    from (values
      ('hire_in', 'direct', null::integer, true, 10), ('freelance_crew', 'direct', null, true, 20),
      ('transport_fuel', 'direct', null, true, 30), ('tolls_parking', 'direct', null, true, 40),
      ('travel_accommodation', 'direct', null, false, 50), ('meals_jobs', 'direct', null, false, 60),
      ('consumables', 'direct', null, true, 70), ('repairs_parts', 'direct', null, true, 80),
      ('rent_utilities', 'overhead', null, true, 110), ('insurance', 'overhead', null, true, 120),
      ('vehicle_running', 'overhead', null, true, 130), ('software', 'overhead', null, true, 140),
      ('phone_internet', 'overhead', null, true, 150), ('accountant_legal', 'overhead', null, true, 160),
      ('marketing', 'overhead', null, true, 170), ('bank_fees', 'overhead', null, true, 180),
      ('office_supplies', 'overhead', null, true, 190),
      ('equipment', 'capital', 60, true, 210), ('vehicles', 'capital', 48, true, 220), ('computers', 'capital', 36, true, 230),
      ('taxes_fees', 'tax_other', null, true, 310), ('fines', 'tax_other', null, true, 320), ('other', 'tax_other', null, true, 330)
    ) as s(key, kind, months, vat, sort)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.ensure_expense_categories(uuid) from public, anon;
grant execute on function public.ensure_expense_categories(uuid) to authenticated;

-- ── Recurring costs ──────────────────────────────────────────────────────────
-- The n-th draft is due on starts_on + n periods (a 31st falls back to the month's last day,
-- then returns to the 31st). drafted counts the ones made so far.
create table if not exists public.expense_recurrences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 300),
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text check (char_length(supplier_name) <= 200),
  category_id uuid references public.expense_categories(id) on delete set null,
  amount_net numeric(12,2) not null check (amount_net between -10000000 and 10000000),
  vat_rate numeric(5,2) not null default 23 check (vat_rate between 0 and 100),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  paid_how text check (paid_how in ('transfer', 'card', 'cash', 'direct_debit', 'other')),
  notes text check (char_length(notes) <= 1000),
  every text not null check (every in ('month', 'quarter', 'year')),
  starts_on date not null,
  ends_on date,
  drafted integer not null default 0 check (drafted >= 0),
  next_on date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists expense_recurrences_due_idx on public.expense_recurrences (next_on) where removed_at is null;
create index if not exists expense_recurrences_org_idx on public.expense_recurrences (org_id);
alter table public.expense_recurrences enable row level security;
create policy expense_recurrences_select on public.expense_recurrences for select to authenticated
  using (private.can_see_finance(org_id));
create policy expense_recurrences_insert on public.expense_recurrences for insert to authenticated
  with check (private.can_see_finance(org_id) and removed_at is null);
create policy expense_recurrences_update on public.expense_recurrences for update to authenticated
  using (removed_at is null and private.can_see_finance(org_id)) with check (private.can_see_finance(org_id));
create policy mfa_required on public.expense_recurrences as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke insert, update on public.expense_recurrences from authenticated;
grant insert (org_id, description, supplier_id, supplier_name, category_id, amount_net, vat_rate, currency, paid_how, notes,
              every, starts_on, ends_on) on public.expense_recurrences to authenticated;
grant update (description, supplier_id, supplier_name, category_id, amount_net, vat_rate, currency, paid_how, notes, ends_on,
              removed_at) on public.expense_recurrences to authenticated;

create or replace function private.add_periods(p_start date, p_every text, p_n integer) returns date
language sql immutable set search_path = '' as $$
  select (p_start + make_interval(months => p_n * case p_every when 'month' then 1 when 'quarter' then 3 else 12 end))::date
$$;
revoke execute on function private.add_periods(date, text, integer) from public, anon, authenticated;

-- Security definer: checks the supplier and category belong to the organisation whoever saves
create or replace function private.finance_refs_ok(p_org uuid, p_supplier uuid, p_category uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (p_supplier is null or exists (select 1 from public.suppliers s where s.id = p_supplier and s.org_id = p_org))
     and (p_category is null or exists (select 1 from public.expense_categories c where c.id = p_category and c.org_id = p_org))
$$;
revoke execute on function private.finance_refs_ok(uuid, uuid, uuid) from public, anon;
grant execute on function private.finance_refs_ok(uuid, uuid, uuid) to authenticated;

create or replace function private.expense_recurrences_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.description := trim(new.description);
  new.supplier_name := nullif(trim(new.supplier_name), '');
  new.notes := nullif(trim(new.notes), '');
  if not private.finance_refs_ok(new.org_id, new.supplier_id, new.category_id) then
    raise exception 'Supplier or category of another organisation' using errcode = '42501';
  end if;
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.created_at := now(); new.drafted := 0; new.next_on := new.starts_on;
    if (select count(*) from public.expense_recurrences r where r.org_id = new.org_id and r.removed_at is null) >= 200 then
      raise exception 'Recurring limit reached' using errcode = '54000';
    end if;
  else
    new.id := old.id; new.org_id := old.org_id; new.every := old.every; new.starts_on := old.starts_on;
    new.drafted := old.drafted; new.next_on := old.next_on; new.created_by := old.created_by; new.created_at := old.created_at;
    if new.removed_at is not null and old.removed_at is null then new.removed_at := now(); end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke execute on function private.expense_recurrences_before() from public, anon, authenticated;
create or replace trigger expense_recurrences_before before insert or update on public.expense_recurrences
  for each row execute function private.expense_recurrences_before();

-- ── The ledger ───────────────────────────────────────────────────────────────
-- status: draft (made by a recurring cost, to confirm), confirmed (counts), claimed (a claim
-- waiting for the gig's managers), returned (a claim sent back with a note).
-- A claim (claimed_by set) that is confirmed and has no paid_on is "to reimburse".
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),  -- the app sets it, so the receipt can be uploaded first
  org_id uuid not null references public.organisations(id) on delete cascade,
  status text not null default 'confirmed' check (status in ('draft', 'confirmed', 'claimed', 'returned')),
  spent_on date not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text check (char_length(supplier_name) <= 200),
  description text not null check (char_length(trim(description)) between 1 and 300),
  category_id uuid references public.expense_categories(id) on delete set null,
  amount_net numeric(12,2) not null check (amount_net between -10000000 and 10000000),
  vat_rate numeric(5,2) not null default 23 check (vat_rate between 0 and 100),
  vat_amount numeric(12,2) not null default 0 check (abs(vat_amount) <= 10000000),
  total numeric(13,2) generated always as (amount_net + vat_amount) stored,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  invoice_number text check (char_length(invoice_number) <= 80),
  due_on date,
  paid_on date,
  paid_how text check (paid_how in ('transfer', 'card', 'cash', 'direct_debit', 'other')),
  notes text check (char_length(notes) <= 1000),
  receipt_path text check (char_length(receipt_path) <= 300),
  receipt_name text check (char_length(receipt_name) <= 200),
  -- what it is for: a gig, and at most one record whose planned cost it replaces
  gig_id uuid references public.gigs(id) on delete set null,
  subrental_id uuid references public.subrentals(id) on delete set null,
  repair_id uuid references public.repairs(id) on delete set null,
  crew_fee_user_id uuid references auth.users(id) on delete set null, -- with gig_id: that person's gig_crew_fees row
  stock_movement_id bigint references public.stock_movements(id) on delete set null, -- a bulk purchase
  stock_unit_id uuid references public.stock_units(id) on delete set null,          -- a unit bought
  recurrence_id uuid references public.expense_recurrences(id) on delete set null,
  recurrence_due date,
  claimed_by uuid references auth.users(id) on delete set null,
  review_note text check (char_length(review_note) <= 500),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  check (num_nonnulls(subrental_id, repair_id, crew_fee_user_id, stock_movement_id, stock_unit_id) <= 1),
  check (crew_fee_user_id is null or gig_id is not null),
  check (paid_on is null or paid_how is not null or claimed_by is not null),
  check (status in ('draft', 'confirmed') or claimed_by is not null)
);
create index if not exists expenses_org_idx on public.expenses (org_id, spent_on) where removed_at is null;
create index if not exists expenses_gig_idx on public.expenses (gig_id) where gig_id is not null;
create index if not exists expenses_supplier_idx on public.expenses (supplier_id) where supplier_id is not null;
create index if not exists expenses_claimed_idx on public.expenses (claimed_by) where claimed_by is not null;
-- Each cost counted once: one live expense per linked record
create unique index if not exists expenses_one_subrental on public.expenses (subrental_id) where subrental_id is not null and removed_at is null;
create unique index if not exists expenses_one_repair on public.expenses (repair_id) where repair_id is not null and removed_at is null;
create unique index if not exists expenses_one_crew_fee on public.expenses (gig_id, crew_fee_user_id) where crew_fee_user_id is not null and removed_at is null;
create unique index if not exists expenses_one_movement on public.expenses (stock_movement_id) where stock_movement_id is not null and removed_at is null;
create unique index if not exists expenses_one_unit on public.expenses (stock_unit_id) where stock_unit_id is not null and removed_at is null;
-- A recurring cost drafts each date once (a removed draft is not made again)
create unique index if not exists expenses_one_per_recurrence on public.expenses (recurrence_id, recurrence_due) where recurrence_id is not null;

-- Claims on a gig are seen by whoever made them and by the gig's managers
create or replace function private.can_see_claim(p_claimed_by uuid, p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_claimed_by is not null
     and (p_claimed_by = auth.uid() or (p_gig is not null and private.can_manage_gig(p_gig)))
$$;
revoke execute on function private.can_see_claim(uuid, uuid) from public, anon;
grant execute on function private.can_see_claim(uuid, uuid) to authenticated;

alter table public.expenses enable row level security;
create policy expenses_select on public.expenses for select to authenticated
  using (private.can_see_finance(org_id) or private.can_see_claim(claimed_by, gig_id));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (removed_at is null and (private.can_see_finance(org_id)
    or (claimed_by = (select auth.uid()) and gig_id is not null and private.can_access_gig(gig_id))));
create policy expenses_update on public.expenses for update to authenticated
  using (removed_at is null and (private.can_see_finance(org_id)
    or (claimed_by = (select auth.uid()) and status in ('claimed', 'returned'))))
  with check (private.can_see_finance(org_id) or (claimed_by = (select auth.uid()) and status in ('claimed', 'returned')));
create policy mfa_required on public.expenses as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke insert, update on public.expenses from authenticated;
grant insert (id, org_id, status, spent_on, supplier_id, supplier_name, description, category_id, amount_net, vat_rate, vat_amount,
              currency, invoice_number, due_on, paid_on, paid_how, notes, receipt_path, receipt_name, gig_id, subrental_id, repair_id,
              crew_fee_user_id, stock_movement_id, stock_unit_id, claimed_by) on public.expenses to authenticated;
grant update (status, spent_on, supplier_id, supplier_name, description, category_id, amount_net, vat_rate, vat_amount, currency,
              invoice_number, due_on, paid_on, paid_how, notes, receipt_path, receipt_name, gig_id, subrental_id, repair_id,
              crew_fee_user_id, stock_movement_id, stock_unit_id, removed_at) on public.expenses to authenticated;
-- Expenses are only ever marked removed (removed_at)

-- Security definer: the linked records must belong to the expense's organisation (and to its gig).
-- Fills the gig from a linked subrental or repair. Returns the gig to use.
create or replace function private.expense_links_gig(p_org uuid, p_gig uuid, p_subrental uuid, p_repair uuid,
  p_crew_user uuid, p_movement bigint, p_unit uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_gig uuid;
begin
  if p_gig is not null then
    select g.org_id into v_org from public.gigs g where g.id = p_gig;
    if v_org is distinct from p_org then raise exception 'Gig of another organisation' using errcode = '42501'; end if;
  end if;
  if p_subrental is not null then
    select s.org_id, s.gig_id into v_org, v_gig from public.subrentals s where s.id = p_subrental;
  elsif p_repair is not null then
    select r.org_id, r.gig_id into v_org, v_gig from public.repairs r where r.id = p_repair;
  elsif p_crew_user is not null then
    select f.org_id, f.gig_id into v_org, v_gig from public.gig_crew_fees f where f.gig_id = p_gig and f.user_id = p_crew_user;
  elsif p_movement is not null then
    select m.org_id into v_org from public.stock_movements m where m.id = p_movement and m.kind = 'purchase';
  elsif p_unit is not null then
    select u.org_id into v_org from public.stock_units u where u.id = p_unit;
  else
    return p_gig;
  end if;
  if v_org is distinct from p_org then raise exception 'Linked record not found in this organisation' using errcode = '42501'; end if;
  if v_gig is not null and p_gig is not null and v_gig <> p_gig then
    raise exception 'Linked record belongs to another gig' using errcode = '22023';
  end if;
  return coalesce(p_gig, v_gig);
end $$;
revoke execute on function private.expense_links_gig(uuid, uuid, uuid, uuid, uuid, bigint, uuid) from public, anon;
grant execute on function private.expense_links_gig(uuid, uuid, uuid, uuid, uuid, bigint, uuid) to authenticated;

-- Runs as the caller (so decide_expense_claim and the recurring job, which run as the owner, pass
-- straight through the status rules).
create or replace function private.expenses_before() returns trigger
language plpgsql set search_path = '' as $$
declare v_me uuid := auth.uid(); v_fin boolean;
begin
  new.description := trim(new.description);
  new.supplier_name := nullif(trim(new.supplier_name), '');
  new.invoice_number := nullif(trim(new.invoice_number), '');
  new.notes := nullif(trim(new.notes), '');
  if new.supplier_id is not null then new.supplier_name := null; end if;
  if new.receipt_path is null then new.receipt_name := null; end if;
  if new.receipt_path is not null and new.receipt_path not like new.org_id::text || '/' || new.id::text || '/%' then
    raise exception 'Receipt belongs to another expense' using errcode = '22023';
  end if;
  if not private.finance_refs_ok(new.org_id, new.supplier_id, new.category_id) then
    raise exception 'Supplier or category of another organisation' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' or (new.gig_id, new.subrental_id, new.repair_id, new.crew_fee_user_id, new.stock_movement_id, new.stock_unit_id)
       is distinct from (old.gig_id, old.subrental_id, old.repair_id, old.crew_fee_user_id, old.stock_movement_id, old.stock_unit_id) then
    new.gig_id := private.expense_links_gig(new.org_id, new.gig_id, new.subrental_id, new.repair_id,
                                            new.crew_fee_user_id, new.stock_movement_id, new.stock_unit_id);
  end if;
  if current_user not in ('authenticated', 'anon') then
    new.updated_at := clock_timestamp();
    return new;
  end if;
  v_fin := private.can_see_finance(new.org_id);
  if tg_op = 'INSERT' then
    new.created_by := v_me; new.created_at := now();
    new.recurrence_id := null; new.recurrence_due := null;
    new.review_note := null; new.decided_by := null; new.decided_at := null;
    if new.claimed_by is not null then
      if new.claimed_by <> v_me then raise exception 'A claim is your own' using errcode = '42501'; end if;
      new.status := 'claimed';
    else
      new.status := 'confirmed';
    end if;
  else
    new.id := old.id; new.org_id := old.org_id; new.claimed_by := old.claimed_by;
    new.recurrence_id := old.recurrence_id; new.recurrence_due := old.recurrence_due;
    new.review_note := old.review_note; new.decided_by := old.decided_by; new.decided_at := old.decided_at;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if new.removed_at is not null and old.removed_at is null then new.removed_at := now(); end if;
    -- Only a draft can be confirmed here; a returned claim goes back for approval when its owner edits it
    if old.status = 'draft' and new.status = 'confirmed' and v_fin then
      null;
    elsif old.status = 'returned' and old.claimed_by = v_me and new.removed_at is null then
      new.status := 'claimed';
    else
      new.status := old.status;
    end if;
  end if;
  -- A pending claim links only to its gig; its owner can't mark it paid
  if new.status in ('claimed', 'returned') then
    if num_nonnulls(new.subrental_id, new.repair_id, new.crew_fee_user_id, new.stock_movement_id, new.stock_unit_id) > 0 then
      raise exception 'A claim links only to its gig' using errcode = '22023';
    end if;
    if new.gig_id is null then raise exception 'A claim needs a gig' using errcode = '22023'; end if;
    if not v_fin then new.paid_on := null; new.paid_how := null; end if;
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.expenses e where e.org_id = new.org_id and e.created_at > now() - interval '1 day') >= 2000 then
    raise exception 'Too many expenses today' using errcode = '54000';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke execute on function private.expenses_before() from public, anon, authenticated;
create or replace trigger expenses_before before insert or update on public.expenses
  for each row execute function private.expenses_before();

-- ── Claims: notifications and approval ───────────────────────────────────────
-- The gig's approvers (PMs and creator, else the organisation's admins) hear about a new or
-- re-sent claim
create or replace function private.expenses_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_gig text;
begin
  if v_me is null or new.claimed_by is null or new.status <> 'claimed' or new.removed_at is not null then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'claimed' then return null; end if;
  select g.name into v_gig from public.gigs g where g.id = new.gig_id;
  insert into public.notifications (user_id, org_id, actor_id, kind, details)
  select a, new.org_id, v_me, 'expense_claimed',
         jsonb_build_object('expense_id', new.id, 'gig_id', new.gig_id, 'gig_name', v_gig, 'description', left(new.description, 120),
                            'total', new.amount_net + new.vat_amount, 'currency', new.currency)
    from private.gig_approvers(new.gig_id) a where a <> v_me;
  return null;
end $$;
revoke execute on function private.expenses_notify() from public, anon, authenticated;
create or replace trigger expenses_notify after insert or update on public.expenses
  for each row execute function private.expenses_notify();

-- The gig's managers (or anyone who sees money) approve a claim, or send it back with a note.
-- Nobody approves their own claim, except an organisation admin.
create or replace function public.decide_expense_claim(p_expense uuid, p_approve boolean, p_note text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_e public.expenses; v_me uuid := auth.uid(); v_note text := nullif(trim(p_note), ''); v_gig text;
begin
  select * into v_e from public.expenses where id = p_expense for update;
  if not found or v_e.removed_at is not null or v_e.claimed_by is null
     or not (private.can_manage_gig(v_e.gig_id) or private.can_see_finance(v_e.org_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_e.status = 'confirmed' then return 'already'; end if;
  if v_e.status <> 'claimed' then raise exception 'Not waiting for approval' using errcode = '22023'; end if;
  if v_e.claimed_by = v_me and not private.is_org_admin(v_e.org_id) then
    raise exception 'You cannot approve your own claim' using errcode = '42501';
  end if;
  if char_length(v_note) > 500 then raise exception 'Note too long' using errcode = '22023'; end if;
  if not p_approve and v_note is null then raise exception 'A note is needed' using errcode = '22023'; end if;
  update public.expenses set status = case when p_approve then 'confirmed' else 'returned' end,
         review_note = v_note, decided_by = v_me, decided_at = now()
   where id = p_expense;
  select g.name into v_gig from public.gigs g where g.id = v_e.gig_id;
  if v_e.claimed_by <> v_me then
    insert into public.notifications (user_id, org_id, actor_id, kind, details)
    values (v_e.claimed_by, v_e.org_id, v_me, case when p_approve then 'expense_approved' else 'expense_returned' end,
            jsonb_build_object('expense_id', v_e.id, 'gig_id', v_e.gig_id, 'gig_name', v_gig, 'description', left(v_e.description, 120),
                               'total', v_e.total, 'currency', v_e.currency, 'note', v_note));
  end if;
  return case when p_approve then 'approved' else 'returned' end;
end $$;
revoke execute on function public.decide_expense_claim(uuid, boolean, text) from public, anon;
grant execute on function public.decide_expense_claim(uuid, boolean, text) to authenticated;

-- ── Recurring drafts ─────────────────────────────────────────────────────────
-- Every morning: each recurring cost due by today (the organisation's time zone) gets its
-- draft, at most 24 a run per cost; the unique index makes each date once. The admins get one
-- notification per organisation.
create or replace function private.draft_recurring_expenses() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_today date; v_made integer := 0; v_n integer; v_due date; v_orgs jsonb := '{}'::jsonb; v_org text;
begin
  for r in select x.*, coalesce(o.time_zone, 'Europe/Lisbon') as tz
             from public.expense_recurrences x join public.organisations o on o.id = x.org_id
            where x.removed_at is null and x.next_on <= current_date + 1
            order by x.next_on for update of x skip locked loop
    v_today := (now() at time zone r.tz)::date;
    v_n := 0;
    v_due := r.next_on;
    while v_due <= v_today and (r.ends_on is null or v_due <= r.ends_on) and v_n < 24 loop
      insert into public.expenses (org_id, status, spent_on, due_on, supplier_id, supplier_name, description, category_id,
                                   amount_net, vat_rate, vat_amount, currency, paid_how, notes, recurrence_id, recurrence_due)
      values (r.org_id, 'draft', v_due, v_due, r.supplier_id, r.supplier_name, r.description, r.category_id,
              r.amount_net, r.vat_rate, round(r.amount_net * r.vat_rate / 100, 2), r.currency, r.paid_how, r.notes, r.id, v_due)
      on conflict do nothing;
      if found then
        v_made := v_made + 1;
        v_orgs := jsonb_set(v_orgs, array[r.org_id::text], to_jsonb(coalesce((v_orgs->>r.org_id::text)::integer, 0) + 1));
      end if;
      v_n := v_n + 1;
      v_due := private.add_periods(r.starts_on, r.every, r.drafted + v_n);
    end loop;
    if v_n > 0 then
      update public.expense_recurrences set drafted = r.drafted + v_n, next_on = v_due where id = r.id;
    end if;
  end loop;
  for v_org in select jsonb_object_keys(v_orgs) loop
    insert into public.notifications (user_id, org_id, kind, details)
    select m.user_id, v_org::uuid, 'expense_drafted', jsonb_build_object('count', (v_orgs->>v_org)::integer)
      from public.org_members m where m.org_id = v_org::uuid and m.role = 'admin';
  end loop;
  return v_made;
end $$;
revoke execute on function private.draft_recurring_expenses() from public, anon, authenticated;

-- Someone who sees money can run it for their organisation (e.g. right after adding a recurring
-- cost that started in the past); the job runs it for everyone every morning
create or replace function public.draft_recurring_expenses_now(p_org uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.can_see_finance(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return private.draft_recurring_expenses();
end $$;
revoke execute on function public.draft_recurring_expenses_now(uuid) from public, anon;
grant execute on function public.draft_recurring_expenses_now(uuid) to authenticated;

select cron.schedule('avx-recurring-expenses', '47 5 * * *', 'select private.draft_recurring_expenses()');

-- ── Receipts ─────────────────────────────────────────────────────────────────
-- Private bucket; paths are <org id>/<expense id>/<file>. Whoever sees money reads and adds them;
-- the owner of a claim adds to their claim while it waits, and reads it with the gig's managers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

create or replace function private.can_read_receipt(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_see_finance(private.path_uuid(p_name, 1))
      or exists (select 1 from public.expenses e
                  where e.id = private.path_uuid(p_name, 2) and e.org_id = private.path_uuid(p_name, 1)
                    and private.can_see_claim(e.claimed_by, e.gig_id))
$$;
-- A claim's owner may add the file before the claim is saved (the app makes the id first): the
-- expense either doesn't exist yet or is their own waiting claim; the gig check is on the claim.
create or replace function private.can_add_receipt(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_see_finance(private.path_uuid(p_name, 1))
      or (private.is_org_member(private.path_uuid(p_name, 1)) or exists (
            select 1 from public.gig_members m join public.gigs g on g.id = m.gig_id
             where m.user_id = auth.uid() and g.org_id = private.path_uuid(p_name, 1)))
     and not exists (select 1 from public.expenses e where e.id = private.path_uuid(p_name, 2)
                      and not (e.claimed_by = auth.uid() and e.status in ('claimed', 'returned') and e.org_id = private.path_uuid(p_name, 1)))
$$;
revoke execute on function private.can_read_receipt(text), private.can_add_receipt(text) from public, anon;
grant execute on function private.can_read_receipt(text), private.can_add_receipt(text) to authenticated;
create policy expense_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and (private.can_read_receipt(name) or owner_id = auth.uid()::text));
create policy expense_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and private.can_add_receipt(name));

-- ── Supplier spend (Contacts) ────────────────────────────────────────────────
-- Confirmed expenses per supplier and currency in a period; runs with the reader's rights
create or replace function public.supplier_spend(p_org uuid, p_from date default null, p_until date default null)
returns table (supplier_id uuid, supplier_name text, currency text, expenses integer, net numeric, total numeric, unpaid numeric)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.can_see_finance(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
    select e.supplier_id, coalesce(s.name, e.supplier_name), e.currency, count(*)::integer,
           sum(e.amount_net), sum(e.total), coalesce(sum(e.total) filter (where e.paid_on is null), 0)
      from public.expenses e left join public.suppliers s on s.id = e.supplier_id
     where e.org_id = p_org and e.removed_at is null and e.status = 'confirmed'
       and (e.supplier_id is not null or e.supplier_name is not null)
       and (p_from is null or e.spent_on >= p_from) and (p_until is null or e.spent_on <= p_until)
     group by e.supplier_id, coalesce(s.name, e.supplier_name), e.currency
     order by sum(e.total) desc;
end $$;
revoke execute on function public.supplier_spend(uuid, date, date) from public, anon;
grant execute on function public.supplier_spend(uuid, date, date) to authenticated;
