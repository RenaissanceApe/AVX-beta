-- Tasks T1 (docs/TOOLS_PLAN.md build order step 5; COMPETITOR_RESEARCH #6): who does what by when.
-- - tasks: on a gig, or for an organisation as a whole (T2 adds the organisation page and
--   templates). Title, notes, assignee, due date, a small checklist, open/done.
-- - On a gig: everyone on it reads; its managers and the organisation's admins and members create
--   and edit; crew may tick tasks done and tick checklist items (only those columns).
-- - Organisation tasks: members read; admins and members create and edit.
-- - A task can come from a rehearsal note (source_kind 'rehearsal_note').
-- - Assigning someone sends them a "task_assigned" notification.
-- Removing a task only marks it. Written without destructive statements.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisations(id) on delete cascade,
  gig_id uuid references public.gigs(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  assignee_id uuid references auth.users(id) on delete set null,
  due_on date,
  checklist jsonb not null default '[]'::jsonb
    check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 50 and octet_length(checklist::text) <= 20000),
  status text not null default 'open' check (status in ('open', 'done')),
  done_by uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  source_kind text check (source_kind in ('rehearsal_note')),
  source_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  check (gig_id is not null or org_id is not null),
  check ((source_kind is null) = (source_id is null))
);
create index if not exists tasks_gig_idx on public.tasks (gig_id) where removed_at is null;
create index if not exists tasks_org_idx on public.tasks (org_id) where removed_at is null;
create index if not exists tasks_assignee_idx on public.tasks (assignee_id) where removed_at is null and status = 'open';
create unique index if not exists tasks_source_uniq on public.tasks (source_kind, source_id) where source_id is not null and removed_at is null;

-- Who reads a task, who manages it, who may tick it
create or replace function private.task_can_read(p_gig uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_gig is not null then private.can_access_gig(p_gig) else private.is_org_member(p_org) end
$$;
create or replace function private.task_can_manage(p_gig uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_gig is not null then private.can_edit_tools(p_gig) else private.can_quote(p_org) end
$$;
create or replace function private.task_can_tick(p_gig uuid, p_org uuid, p_assignee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_assignee = auth.uid()
      or case when p_gig is not null then private.can_note_gig(p_gig) else private.can_quote(p_org) end
$$;
revoke execute on function private.task_can_read(uuid, uuid) from public, anon;
revoke execute on function private.task_can_manage(uuid, uuid) from public, anon;
revoke execute on function private.task_can_tick(uuid, uuid, uuid) from public, anon;
grant execute on function private.task_can_read(uuid, uuid) to authenticated;
grant execute on function private.task_can_manage(uuid, uuid) to authenticated;
grant execute on function private.task_can_tick(uuid, uuid, uuid) to authenticated;

alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select to authenticated
  using (private.task_can_read(gig_id, org_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (private.task_can_manage(gig_id, org_id) and removed_at is null and status = 'open');
create policy tasks_update on public.tasks for update to authenticated
  using (removed_at is null and private.task_can_tick(gig_id, org_id, assignee_id))
  with check (private.task_can_read(gig_id, org_id));
create policy mfa_required on public.tasks as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.tasks from authenticated;
grant update (title, notes, assignee_id, due_on, checklist, status, removed_at) on public.tasks to authenticated;

-- Runs as the caller (current_user tells a person from the service role)
create or replace function private.tasks_before() returns trigger
language plpgsql set search_path = '' as $$
declare v_gig_org uuid;
begin
  new.title := trim(new.title);
  new.notes := trim(coalesce(new.notes, ''));
  if current_user not in ('authenticated', 'anon') then return new; end if;
  -- Checklist items: { id, text (1–200), done }
  if exists (select 1 from jsonb_array_elements(new.checklist) e
              where jsonb_typeof(e) <> 'object' or char_length(trim(coalesce(e->>'text', ''))) not between 1 and 200
                 or jsonb_typeof(coalesce(e->'done', 'false'::jsonb)) <> 'boolean') then
    raise exception 'Checklist items need a text of up to 200 characters' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if new.gig_id is not null then
      select g.org_id into v_gig_org from public.gigs g where g.id = new.gig_id;
      new.org_id := v_gig_org;
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
    new.done_by := null; new.done_at := null;
    if new.source_kind = 'rehearsal_note' and not exists (
         select 1 from public.rehearsal_notes n where n.id = new.source_id and n.gig_id = new.gig_id and n.removed_at is null) then
      raise exception 'That rehearsal note is not on this gig' using errcode = '22023';
    end if;
    if (select count(*) from public.tasks t
         where t.removed_at is null and t.status = 'open'
           and (case when new.gig_id is not null then t.gig_id = new.gig_id else t.org_id = new.org_id and t.gig_id is null end)) >= 2000 then
      raise exception 'Task limit reached' using errcode = '54000';
    end if;
  else
    -- What a person who may only tick can change: status and the checklist's ticks
    if not private.task_can_manage(old.gig_id, old.org_id)
       and ((new.title, new.notes, new.assignee_id, new.due_on, new.removed_at) is distinct from (old.title, old.notes, old.assignee_id, old.due_on, old.removed_at)
            or (select coalesce(jsonb_agg(jsonb_build_object('id', e->'id', 'text', e->'text')), '[]'::jsonb) from jsonb_array_elements(new.checklist) e)
               is distinct from (select coalesce(jsonb_agg(jsonb_build_object('id', e->'id', 'text', e->'text')), '[]'::jsonb) from jsonb_array_elements(old.checklist) e)) then
      raise exception 'Only the gig''s managers can change this task' using errcode = '42501';
    end if;
    if new.status = 'done' and old.status = 'open' then new.done_by := auth.uid(); new.done_at := now();
    elsif new.status = 'open' then new.done_by := null; new.done_at := null;
    end if;
    if new.removed_at is not null and old.removed_at is null then new.removed_at := now(); end if;
    new.updated_at := now();
  end if;
  -- Assignees: someone on the gig, or a member of the organisation
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    if new.gig_id is not null and not exists (select 1 from public.gig_members m where m.gig_id = new.gig_id and m.user_id = new.assignee_id) then
      raise exception 'Assign tasks to people on this gig' using errcode = '22023';
    end if;
    if new.gig_id is null and not exists (select 1 from public.org_members m where m.org_id = new.org_id and m.user_id = new.assignee_id) then
      raise exception 'Assign tasks to members of the organisation' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
revoke execute on function private.tasks_before() from public, anon, authenticated;
create or replace trigger tasks_before before insert or update on public.tasks
  for each row execute function private.tasks_before();

-- Tell the person a task was given to (not when they gave it to themselves)
create or replace function private.tasks_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is null or new.assignee_id = auth.uid() or new.removed_at is not null then return null; end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then return null; end if;
  insert into public.notifications (user_id, gig_id, org_id, actor_id, kind, details)
  values (new.assignee_id, new.gig_id, new.org_id, auth.uid(), 'task_assigned',
          jsonb_build_object('task_id', new.id, 'title', new.title, 'due_on', new.due_on,
                             'gig_name', (select g.name from public.gigs g where g.id = new.gig_id)));
  return null;
end $$;
revoke execute on function private.tasks_notify() from public, anon, authenticated;
create or replace trigger tasks_notify after insert or update of assignee_id on public.tasks
  for each row execute function private.tasks_notify();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;
