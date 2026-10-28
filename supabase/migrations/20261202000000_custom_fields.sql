-- Build order step 6, S2 (docs/TOOLS_PLAN.md; COMPETITOR_RESEARCH #12): custom fields. An
-- organisation adds its own fields ("PO number", "Venue capacity", "Insurance checked") to gigs,
-- clients, suppliers and catalogue items.
-- - custom_fields: label, kind (text, number, date, yes/no, choice, link), choices, order; at most
--   40 per kind of record. Admins manage them; members, and anyone on one of the organisation's
--   gigs, read them. Removing only marks a field; its values stay but are no longer shown.
-- - custom_values (jsonb, field id → value) on gigs, clients, suppliers and price_items, checked on
--   every save: only the organisation's own current fields for that record, each value of its kind.
--   Values of removed fields are kept untouched.
-- Written without destructive statements.

create table if not exists public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  entity text not null check (entity in ('gig', 'client', 'supplier', 'item')),
  label text not null check (char_length(trim(label)) between 1 and 60),
  kind text not null check (kind in ('text', 'number', 'date', 'yes_no', 'choice', 'link')),
  choices jsonb not null default '[]'::jsonb
    check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) <= 30 and octet_length(choices::text) <= 4000),
  position integer not null default 0 check (position between 0 and 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists custom_fields_org_idx on public.custom_fields (org_id, entity, position) where removed_at is null;

alter table public.custom_fields enable row level security;
create policy custom_fields_select on public.custom_fields for select to authenticated
  using (private.is_org_member(org_id) or (entity = 'gig' and private.on_gig_in_org(org_id)));
create policy custom_fields_insert on public.custom_fields for insert to authenticated
  with check (private.is_org_admin(org_id) and removed_at is null);
create policy custom_fields_update on public.custom_fields for update to authenticated
  using (removed_at is null and private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy mfa_required on public.custom_fields as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.custom_fields from authenticated;
grant update (label, choices, position, removed_at) on public.custom_fields to authenticated;

-- Runs as the caller: tidy, check the choices, stamp, keep the limit
create or replace function private.custom_fields_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.label := trim(new.label);
  if exists (select 1 from jsonb_array_elements(new.choices) e
              where jsonb_typeof(e) <> 'string' or char_length(trim(e #>> '{}')) not between 1 and 80) then
    raise exception 'Choices need a text of up to 80 characters' using errcode = '22023';
  end if;
  if new.kind = 'choice' and jsonb_array_length(new.choices) = 0 then
    raise exception 'A choice field needs at least one choice' using errcode = '22023';
  end if;
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    if (select count(*) from public.custom_fields f where f.org_id = new.org_id and f.entity = new.entity and f.removed_at is null) >= 40 then
      raise exception 'Field limit reached' using errcode = '54000';
    end if;
  else
    new.org_id := old.org_id; new.entity := old.entity; new.kind := old.kind;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if new.removed_at is not null and old.removed_at is null then new.removed_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.custom_fields_before() from public, anon, authenticated;
create or replace trigger custom_fields_before before insert or update on public.custom_fields
  for each row execute function private.custom_fields_before();

alter table public.gigs add column if not exists custom_values jsonb not null default '{}'::jsonb
  check (jsonb_typeof(custom_values) = 'object' and octet_length(custom_values::text) <= 20000);
alter table public.clients add column if not exists custom_values jsonb not null default '{}'::jsonb
  check (jsonb_typeof(custom_values) = 'object' and octet_length(custom_values::text) <= 20000);
alter table public.suppliers add column if not exists custom_values jsonb not null default '{}'::jsonb
  check (jsonb_typeof(custom_values) = 'object' and octet_length(custom_values::text) <= 20000);
alter table public.price_items add column if not exists custom_values jsonb not null default '{}'::jsonb
  check (jsonb_typeof(custom_values) = 'object' and octet_length(custom_values::text) <= 20000);

-- Checks the values a save sets or changes: the organisation's own current fields for this kind of
-- record, each value of its kind. Values of removed fields that were already there pass untouched.
-- Security definer: it reads the field list whoever saves (freelance PMs included).
create or replace function private.custom_values_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_entity text := tg_argv[0]; v_key text; v_val jsonb; v_field record;
begin
  if tg_op = 'UPDATE' and new.custom_values is not distinct from old.custom_values then return new; end if;
  for v_key, v_val in select * from jsonb_each(new.custom_values) loop
    -- Unchanged values (including those of removed fields) are left as they were
    if tg_op = 'UPDATE' and old.custom_values -> v_key is not distinct from v_val then continue; end if;
    select f.kind, f.choices into v_field from public.custom_fields f
     where f.id::text = v_key and f.org_id = new.org_id and f.entity = v_entity and f.removed_at is null;
    if not found then raise exception 'Unknown field' using errcode = '22023'; end if;
    if jsonb_typeof(v_val) = 'null' then continue; end if;
    if not (case v_field.kind
      when 'text' then jsonb_typeof(v_val) = 'string' and char_length(v_val #>> '{}') <= 1000
      when 'link' then jsonb_typeof(v_val) = 'string' and char_length(v_val #>> '{}') <= 500 and (v_val #>> '{}') ~* '^https?://'
      when 'number' then jsonb_typeof(v_val) = 'number'
      when 'yes_no' then jsonb_typeof(v_val) = 'boolean'
      when 'date' then jsonb_typeof(v_val) = 'string' and (v_val #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
      when 'choice' then jsonb_typeof(v_val) = 'string' and v_field.choices ? (v_val #>> '{}')
      else false end) then
      raise exception 'Value does not fit the field' using errcode = '22023';
    end if;
  end loop;
  return new;
end $$;
revoke execute on function private.custom_values_before() from public, anon, authenticated;
create or replace trigger gigs_custom_values before insert or update of custom_values on public.gigs
  for each row execute function private.custom_values_before('gig');
create or replace trigger clients_custom_values before insert or update of custom_values on public.clients
  for each row execute function private.custom_values_before('client');
create or replace trigger suppliers_custom_values before insert or update of custom_values on public.suppliers
  for each row execute function private.custom_values_before('supplier');
create or replace trigger price_items_custom_values before insert or update of custom_values on public.price_items
  for each row execute function private.custom_values_before('item');
