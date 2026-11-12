-- BF5 (issue 236): ticking one checklist item no longer sends the whole checklist.
-- Two people ticking items on the same task a moment apart used to overwrite each other: each
-- phone wrote back the whole list it had loaded. set_task_checklist_item sets one item's `done`
-- on the server, in one statement, so a tick only ever changes that item.
-- - Who may tick: the same rule as the tasks_update policy (private.task_can_tick: the assignee,
--   or someone who may write notes on the gig / quote for the organisation), on a task that isn't
--   removed, with the two-step sign-in check (private.mfa_ok) that every table here has.
-- - Items are found by their `id` (set by the app when the checklist is written).
-- - Returns the new checklist and the task's new updated_at, so an open edit form stays current.
-- Adds no table and no column. Written without destructive statements.

create or replace function public.set_task_checklist_item(p_task_id uuid, p_item_id text, p_done boolean)
returns table (checklist jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks%rowtype;
begin
  if auth.uid() is null or not private.mfa_ok() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_item_id is null or p_done is null then
    raise exception 'An item and a tick are needed' using errcode = '22023';
  end if;

  -- One statement: the row is locked while the item is set, and a tick that arrives at the same
  -- moment is applied to the list as the other one left it
  update public.tasks t
     set checklist = (select coalesce(jsonb_agg(case when e->>'id' = p_item_id then e || jsonb_build_object('done', p_done) else e end order by n), '[]'::jsonb)
                        from jsonb_array_elements(t.checklist) with ordinality as x(e, n)),
         updated_at = now()
   where t.id = p_task_id
     and t.removed_at is null
     and private.task_can_tick(t.gig_id, t.org_id, t.assignee_id)
     and exists (select 1 from jsonb_array_elements(t.checklist) e where e->>'id' = p_item_id)
  returning t.* into v_task;

  if not found then
    -- Say why without telling someone who can't see the task that it exists
    select * into v_task from public.tasks t where t.id = p_task_id;
    if v_task.id is null or not private.task_can_read(v_task.gig_id, v_task.org_id) then
      raise exception 'Task not found' using errcode = '42501';
    end if;
    if v_task.removed_at is not null then
      raise exception 'That task was removed' using errcode = 'P0002';
    end if;
    if not private.task_can_tick(v_task.gig_id, v_task.org_id, v_task.assignee_id) then
      raise exception 'You may not tick this task' using errcode = '42501';
    end if;
    raise exception 'That checklist item was removed' using errcode = 'P0002';
  end if;

  return query select v_task.checklist, v_task.updated_at;
end $$;

revoke execute on function public.set_task_checklist_item(uuid, text, boolean) from public, anon;
grant execute on function public.set_task_checklist_item(uuid, text, boolean) to authenticated;
