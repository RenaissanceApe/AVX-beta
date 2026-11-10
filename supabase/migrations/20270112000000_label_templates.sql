-- U5: label templates (docs/PENDING.md D31). For each organisation and label size (small 50 × 25 mm,
-- medium 100 × 50 mm, large A6 / 4 × 6 in), which fields go on the label. With no row, the app uses
-- the defaults in src/lib/labels.js. Add-only: a new table, its policies and a trigger.
--
-- Who: everyone in the organisation reads them (anyone printing labels, also a gig's power labels);
-- admins and members (who manage the catalogue) save them. Rows are never removed by the app:
-- "Back to the defaults" saves the default fields.

create table if not exists public.label_templates (
  org_id uuid not null references public.organisations(id) on delete cascade,
  size text not null check (size in ('small', 'medium', 'large')),
  fields text[] not null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (org_id, size),
  constraint label_templates_fields_check check (
    cardinality(fields) between 1 and 7
    and fields <@ array['name', 'code', 'qr', 'org', 'gig', 'contents', 'department']::text[])
);
alter table public.label_templates enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'label_templates' and policyname = 'label_templates_select') then
    create policy label_templates_select on public.label_templates for select to authenticated
      using (private.is_org_member(org_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'label_templates' and policyname = 'label_templates_insert') then
    create policy label_templates_insert on public.label_templates for insert to authenticated
      with check (private.can_quote(org_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'label_templates' and policyname = 'label_templates_update') then
    create policy label_templates_update on public.label_templates for update to authenticated
      using (private.can_quote(org_id)) with check (private.can_quote(org_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'label_templates' and policyname = 'mfa_required') then
    create policy mfa_required on public.label_templates as restrictive for all to authenticated
      using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
  end if;
end $$;
-- No policy for removing rows

-- A template stays with its organisation and size; who saved it and when are set here
create or replace function private.label_templates_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id;
    new.size := old.size;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.label_templates_before() from public, anon, authenticated;
create or replace trigger label_templates_before before insert or update on public.label_templates
  for each row execute function private.label_templates_before();
