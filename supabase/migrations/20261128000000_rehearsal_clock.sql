-- Rehearsal companion R2 (docs/TOOLS_PLAN.md §2): a more exact shared clock.
-- Until now the server stamped anchor_at when the change arrived, so the network delay (often
-- 50–150 ms, two to four frames) was added to every sync. Now the phone sends the server time of
-- its reading (it knows its offset to server_now()), and the server keeps it when it is within
-- 5 seconds of its own time; otherwise it uses its own, as before.
-- Written without destructive statements so it applies without manual confirmation.

create or replace function private.rehearsal_sessions_before() returns trigger
language plpgsql set search_path = '' as $$
declare v_sent timestamptz;
begin
  new.name := trim(new.name);
  if current_user not in ('authenticated', 'anon') then return new; end if;
  -- The time the phone says its reading was taken, when it's believable
  v_sent := case when new.anchor_at between now() - interval '5 seconds' and now() + interval '5 seconds'
                 then new.anchor_at else now() end;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.clock_set_by := auth.uid();
    new.anchor_at := v_sent;
    new.created_at := now();
    if (select count(*) from public.rehearsal_sessions s where s.gig_id = new.gig_id and s.removed_at is null) >= 200 then
      raise exception 'Rehearsal session limit reached' using errcode = '54000';
    end if;
    return new;
  end if;
  if (new.anchor_ms, new.running, new.clock) is distinct from (old.anchor_ms, old.running, old.clock) then
    new.anchor_at := case when new.anchor_at is distinct from old.anchor_at then v_sent else now() end;
    new.clock_set_by := auth.uid();
  else
    new.anchor_at := old.anchor_at;
  end if;
  if new.removed_at is not null and old.removed_at is null then
    if not (private.can_edit_tools(old.gig_id) or old.created_by = auth.uid()) then
      raise exception 'Only the gig''s managers or whoever started it can remove a session' using errcode = '42501';
    end if;
    new.removed_at := now();
  end if;
  if new.ended_at is not null and old.ended_at is null then new.ended_at := now(); end if;
  return new;
end $$;
revoke execute on function private.rehearsal_sessions_before() from public, anon, authenticated;
