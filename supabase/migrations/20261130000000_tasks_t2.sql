-- Tasks T2 (docs/TOOLS_PLAN.md build order step 5): the organisation's own tasks, checklist
-- templates, and repairs as tasks.
-- - task_templates: a named checklist (and notes) an organisation reuses for tasks, e.g.
--   "Load-out", "Van check". Members read; admins and members (who quote) manage. Removing only
--   marks it. At most 200 per organisation.
-- - tasks.repair_id: a task made from a repair (inventory maintenance), on the organisation, once
--   per repair. Set when the task is made, never changed after.
-- Written without destructive statements.

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  notes text not null default '' check (char_length(notes) <= 2000),
  items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 50 and octet_length(items::text) <= 20000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists task_templates_org_idx on public.task_templates (org_id) where removed_at is null;

alter table public.task_templates enable row level security;
create policy task_templates_select on public.task_templates for select to authenticated
  using (private.is_org_member(org_id));
create policy task_templates_insert on public.task_templates for insert to authenticated
  with check (private.can_quote(org_id) and removed_at is null);
create policy task_templates_update on public.task_templates for update to authenticated
  using (removed_at is null and private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy mfa_required on public.task_templates as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.task_templates from authenticated;
grant update (name, notes, items, removed_at) on public.task_templates to authenticated;

-- Runs as the caller: tidy the text, check the items (texts of 1–200 characters), keep the limit
create or replace function private.task_templates_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := trim(new.name);
  new.notes := trim(coalesce(new.notes, ''));
  if exists (select 1 from jsonb_array_elements(new.items) e
              where jsonb_typeof(e) <> 'string' or char_length(trim(e #>> '{}')) not between 1 and 200) then
    raise exception 'Checklist items need a text of up to 200 characters' using errcode = '22023';
  end if;
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    if (select count(*) from public.task_templates t where t.org_id = new.org_id and t.removed_at is null) >= 200 then
      raise exception 'Template limit reached' using errcode = '54000';
    end if;
  else
    new.org_id := old.org_id; new.created_by := old.created_by; new.created_at := old.created_at;
    if new.removed_at is not null and old.removed_at is null then new.removed_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.task_templates_before() from public, anon, authenticated;
create or replace trigger task_templates_before before insert or update on public.task_templates
  for each row execute function private.task_templates_before();

-- ── Repairs as tasks ─────────────────────────────────────────────────────────
alter table public.tasks add column if not exists repair_id uuid references public.repairs(id) on delete set null;
create unique index if not exists tasks_repair_uniq on public.tasks (repair_id) where repair_id is not null and removed_at is null;

-- Runs as the caller: a repair task belongs to the repair's organisation, not to a gig
create or replace function private.tasks_repair_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.repair_id is null or current_user not in ('authenticated', 'anon') then return new; end if;
  if new.gig_id is not null or not exists (
       select 1 from public.repairs r where r.id = new.repair_id and r.org_id = new.org_id) then
    raise exception 'That repair is not in this organisation' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function private.tasks_repair_check() from public, anon, authenticated;
create or replace trigger tasks_repair_check before insert on public.tasks
  for each row execute function private.tasks_repair_check();
