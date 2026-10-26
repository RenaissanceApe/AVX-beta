-- Rehearsal companion R1 (docs/TOOLS_PLAN.md §2): shared, time-stamped notes during rehearsals.
-- - rehearsal_sessions: a run on a gig ("Run-through 2") with a shared clock. The clock is an
--   anchor: at server time anchor_at it read anchor_ms (milliseconds since 00:00:00:00); while
--   running it advances with real time. Time of day, a stopwatch and (R2) camera or LTC sync all
--   just move the anchor, so every phone shows the same timecode.
-- - rehearsal_notes: a note at a timecode, by department, with priority, cue label, assignee and
--   open/done. client_id comes from the phone, so a note written offline and sent twice is kept
--   once.
-- - Photos on notes: private bucket rehearsal-photos, paths <gig>/<session>/<file>.
-- Everyone on the gig reads; crew, PMs and the organisation's admins and members write (viewers
-- only read). Removing a session or a note only marks it.
-- Written without destructive statements so it applies without manual confirmation.

-- Who may write: the gig's PMs and crew, its creator, the organisation's admins and members
create or replace function private.can_note_gig(p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gig_members m where m.gig_id = p_gig and m.user_id = auth.uid() and m.role in ('pm', 'crew'))
      or exists (select 1 from public.gigs g where g.id = p_gig and g.created_by = auth.uid())
      or exists (select 1 from public.gigs g join public.org_members om on om.org_id = g.org_id
                  where g.id = p_gig and om.user_id = auth.uid() and om.role in ('admin', 'member'))
$$;
revoke execute on function private.can_note_gig(uuid) from public, anon;
grant execute on function private.can_note_gig(uuid) to authenticated;

-- ── Sessions ─────────────────────────────────────────────────────────────────
create table if not exists public.rehearsal_sessions (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  fps numeric(6, 3) not null default 25 check (fps in (23.976, 24, 25, 29.97, 30)),
  frame_count text not null default 'ndf' check (frame_count in ('ndf', 'df')),
  clock text not null default 'time_of_day' check (clock in ('time_of_day', 'stopwatch', 'camera', 'ltc')),
  running boolean not null default true,
  anchor_at timestamptz not null default now(),
  anchor_ms bigint not null default 0 check (anchor_ms between 0 and 86400000 * 2),
  clock_set_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  removed_at timestamptz,
  check (frame_count = 'ndf' or fps = 29.97)
);
create index if not exists rehearsal_sessions_gig_idx on public.rehearsal_sessions (gig_id, created_at desc);
alter table public.rehearsal_sessions enable row level security;
create policy rehearsal_sessions_select on public.rehearsal_sessions for select to authenticated
  using (private.can_access_gig(gig_id));
create policy rehearsal_sessions_insert on public.rehearsal_sessions for insert to authenticated
  with check (private.can_note_gig(gig_id) and removed_at is null and ended_at is null);
create policy rehearsal_sessions_update on public.rehearsal_sessions for update to authenticated
  using (removed_at is null and private.can_note_gig(gig_id)) with check (private.can_note_gig(gig_id));
create policy mfa_required on public.rehearsal_sessions as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.rehearsal_sessions from authenticated;
grant update (name, fps, frame_count, clock, running, anchor_at, anchor_ms, ended_at, removed_at) on public.rehearsal_sessions to authenticated;

-- The server stamps who set the clock and when; only managers or the creator remove a session.
-- Runs as the caller (so current_user tells a person from the service role)
create or replace function private.rehearsal_sessions_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := trim(new.name);
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.clock_set_by := auth.uid();
    new.anchor_at := now();
    new.created_at := now();
    if (select count(*) from public.rehearsal_sessions s where s.gig_id = new.gig_id and s.removed_at is null) >= 200 then
      raise exception 'Rehearsal session limit reached' using errcode = '54000';
    end if;
    return new;
  end if;
  if (new.anchor_ms, new.running, new.clock) is distinct from (old.anchor_ms, old.running, old.clock) then
    -- The phone sends the reading it wants now; the server's own time is the anchor
    new.anchor_at := now();
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
create or replace trigger rehearsal_sessions_before before insert or update on public.rehearsal_sessions
  for each row execute function private.rehearsal_sessions_before();

-- ── Notes ────────────────────────────────────────────────────────────────────
create table if not exists public.rehearsal_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.rehearsal_sessions(id) on delete cascade,
  gig_id uuid not null references public.gigs(id) on delete cascade,
  client_id uuid not null,
  author_id uuid references auth.users(id) on delete set null,
  tc_ms bigint not null check (tc_ms between 0 and 86400000 * 2),
  written_at timestamptz not null default now(),
  department text not null default 'other'
    check (department in ('sound', 'lighting', 'video', 'stage', 'sm', 'production', 'other')),
  priority text not null default 'note' check (priority in ('note', 'fix', 'urgent')),
  cue text check (char_length(coalesce(cue, '')) <= 80),
  body text not null default '' check (char_length(body) <= 2000),
  photo_path text check (char_length(coalesce(photo_path, '')) <= 300),
  assignee_id uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'done')),
  done_by uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (client_id),
  check (char_length(trim(body)) > 0 or photo_path is not null)
);
create index if not exists rehearsal_notes_session_idx on public.rehearsal_notes (session_id, tc_ms);
create index if not exists rehearsal_notes_gig_idx on public.rehearsal_notes (gig_id) where removed_at is null and status = 'open';
alter table public.rehearsal_notes enable row level security;
create policy rehearsal_notes_select on public.rehearsal_notes for select to authenticated
  using (private.can_access_gig(gig_id));
create policy rehearsal_notes_insert on public.rehearsal_notes for insert to authenticated
  with check (private.can_note_gig(gig_id) and author_id = auth.uid() and removed_at is null and status = 'open');
create policy rehearsal_notes_update on public.rehearsal_notes for update to authenticated
  using (removed_at is null and private.can_note_gig(gig_id)) with check (private.can_note_gig(gig_id));
create policy mfa_required on public.rehearsal_notes as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.rehearsal_notes from authenticated;
grant update (department, priority, cue, body, photo_path, assignee_id, status, tc_ms, removed_at) on public.rehearsal_notes to authenticated;

-- Notes stay with their session's gig; the author edits the note, anyone who writes on the gig
-- may tick it done or reassign it; the author or a manager removes it
create or replace function private.rehearsal_notes_before() returns trigger
language plpgsql set search_path = '' as $$
declare v_session public.rehearsal_sessions;
begin
  new.body := trim(new.body);
  new.cue := nullif(trim(coalesce(new.cue, '')), '');
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    select * into v_session from public.rehearsal_sessions s where s.id = new.session_id;
    if v_session.id is null or v_session.removed_at is not null then
      raise exception 'This rehearsal session no longer exists' using errcode = 'P0002';
    end if;
    new.gig_id := v_session.gig_id;
    new.author_id := auth.uid();
    new.created_at := now();
    new.updated_at := now();
    new.done_by := null; new.done_at := null;
    if new.photo_path is not null and split_part(new.photo_path, '/', 1) <> new.gig_id::text then
      raise exception 'Photo is not from this gig' using errcode = '22023';
    end if;
    if new.assignee_id is not null
       and not exists (select 1 from public.gig_members m where m.gig_id = new.gig_id and m.user_id = new.assignee_id) then
      raise exception 'Assign notes to people on this gig' using errcode = '22023';
    end if;
    if (select count(*) from public.rehearsal_notes n where n.session_id = new.session_id) >= 2000 then
      raise exception 'Rehearsal note limit reached' using errcode = '54000';
    end if;
    return new;
  end if;
  if old.author_id is distinct from auth.uid() and not private.can_edit_tools(old.gig_id)
     and (new.department, new.priority, new.cue, new.body, new.photo_path, new.tc_ms)
         is distinct from (old.department, old.priority, old.cue, old.body, old.photo_path, old.tc_ms) then
    raise exception 'Only the author can change what a note says' using errcode = '42501';
  end if;
  if new.removed_at is not null and old.removed_at is null then
    if not (old.author_id = auth.uid() or private.can_edit_tools(old.gig_id)) then
      raise exception 'Only the author or the gig''s managers can remove a note' using errcode = '42501';
    end if;
    new.removed_at := now();
  end if;
  if new.photo_path is distinct from old.photo_path and new.photo_path is not null
     and split_part(new.photo_path, '/', 1) <> old.gig_id::text then
    raise exception 'Photo is not from this gig' using errcode = '22023';
  end if;
  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null
     and not exists (select 1 from public.gig_members m where m.gig_id = old.gig_id and m.user_id = new.assignee_id) then
    raise exception 'Assign notes to people on this gig' using errcode = '22023';
  end if;
  if new.status = 'done' and old.status = 'open' then
    new.done_by := auth.uid(); new.done_at := now();
  elsif new.status = 'open' then
    new.done_by := null; new.done_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.rehearsal_notes_before() from public, anon, authenticated;
create or replace trigger rehearsal_notes_before before insert or update on public.rehearsal_notes
  for each row execute function private.rehearsal_notes_before();

-- ── Live updates ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rehearsal_sessions') then
    alter publication supabase_realtime add table public.rehearsal_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rehearsal_notes') then
    alter publication supabase_realtime add table public.rehearsal_notes;
  end if;
end $$;

-- ── Photos ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rehearsal-photos', 'rehearsal-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
create policy rehearsal_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'rehearsal-photos' and private.can_access_gig(private.path_uuid(name, 1)));
create policy rehearsal_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rehearsal-photos' and private.can_note_gig(private.path_uuid(name, 1))
              and exists (select 1 from public.rehearsal_sessions s
                           where s.id = private.path_uuid(name, 2) and s.gig_id = private.path_uuid(name, 1)));

-- The server's clock, so phones can line up with the shared anchor (offset = server − phone)
create or replace function public.server_now() returns timestamptz
language sql stable set search_path = '' as $$ select now() $$;
revoke execute on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;
