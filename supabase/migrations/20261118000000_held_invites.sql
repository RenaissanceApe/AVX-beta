-- Switching S3a (docs/SWITCHING.md): crew imported as invitations held until an admin sends them.
-- 1. held_invites: one person to invite to the organisation (e-mail, name, phone, functions,
--    role), kept until an admin sends or discards it. Nobody is e-mailed by an import.
-- 2. import_crew(org, rows, file): adds the rows as held invitations. Re-importing updates the
--    held ones (matched by e-mail) instead of doubling; people already in the organisation or
--    already invited are left out with a note.
-- 3. Sending goes through the existing invitation (send-invite / invite_to_org); the app then
--    marks the held invitation as sent with the outcome. Discarding marks it discarded. Nothing
--    is ever removed, so an import needs no undo: discard what shouldn't be sent.
-- Organisation admins only (as for invitations).
-- Written without destructive statements so it applies without manual confirmation.

create table if not exists public.held_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  full_name text check (char_length(coalesce(full_name, '')) <= 120),
  phone text check (char_length(coalesce(phone, '')) <= 60),
  functions text check (char_length(coalesce(functions, '')) <= 200),
  notes text check (char_length(coalesce(notes, '')) <= 500),
  role text not null default 'viewer' check (role in ('admin', 'member', 'viewer')),
  status text not null default 'held' check (status in ('held', 'sent', 'discarded')),
  result text check (result in ('added', 'invited', 'already_member')),
  import_file text check (char_length(coalesce(import_file, '')) <= 200),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  check ((status = 'sent') = (sent_at is not null))
);
-- One held invitation per person at a time
create unique index if not exists held_invites_one_held on public.held_invites (org_id, email) where status = 'held';
create index if not exists held_invites_org_idx on public.held_invites (org_id, status, created_at desc);
alter table public.held_invites enable row level security;
create policy held_invites_select on public.held_invites for select to authenticated using (private.is_org_admin(org_id));
create policy held_invites_update on public.held_invites for update to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy mfa_required on public.held_invites as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Added only by import_crew; never deleted (discarded instead)

-- Only the role, the details and the status change; sent and discarded ones stay as they are
create or replace function private.held_invites_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id; new.org_id := old.org_id; new.email := old.email; new.created_by := old.created_by;
  new.created_at := old.created_at; new.import_file := old.import_file;
  if old.status <> 'held' then
    raise exception 'This invitation was already %', old.status using errcode = '22023';
  end if;
  if new.status = 'sent' then
    new.sent_at := now(); new.sent_by := auth.uid();
  else
    new.sent_at := null; new.sent_by := null; new.result := null;
  end if;
  return new;
end $$;
revoke execute on function private.held_invites_before() from public, anon, authenticated;
create or replace trigger held_invites_before before update on public.held_invites
  for each row execute function private.held_invites_before();

-- "Freelancer", "Medewerker", "Admin"… → a role
create or replace function private.import_role(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p is null or trim(p) = '' then null
    when lower(trim(p)) in ('admin', 'administrator', 'beheerder', 'administrador', 'owner', 'eigenaar', 'dono') then 'admin'
    when lower(trim(p)) in ('member', 'membro', 'staff', 'employee', 'medewerker', 'werknemer', 'funcionario', 'funcionário', 'office', 'kantoor', 'escritorio', 'escritório', 'planner', 'manager') then 'member'
    when lower(trim(p)) in ('viewer', 'crew', 'freelancer', 'freelance', 'zzp', 'zzp''er', 'technician', 'technicus', 'tecnico', 'técnico', 'equipa', 'staff crew', 'observador', 'leitor', 'lezer') then 'viewer'
    else 'unknown'
  end
$$;
revoke execute on function private.import_role(text) from public, anon, authenticated;

-- Rows: [{ _row, email, full_name, phone, functions, notes, role }]. Returns { created, updated,
-- unchanged, skipped, problems: [{ row, message, level }] } like run_import.
create or replace function public.import_crew(p_org uuid, p_rows jsonb, p_file text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; v_n integer := 0; v_line integer; v_email text; v_role text; v_held public.held_invites; v_new jsonb; v_cur jsonb;
  c_created integer := 0; c_updated integer := 0; c_same integer := 0; c_skipped integer := 0; v_problems jsonb := '[]'::jsonb;
  v_msg text; v_level text;
begin
  perform private.require_mfa();
  if not private.is_org_admin(p_org) then raise exception 'Only organisation admins can invite people' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'Up to 2000 people per import' using errcode = '54000'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    v_line := coalesce(nullif(r ->> '_row', '')::integer, v_n);
    v_msg := null; v_level := 'skip';
    begin
      v_email := lower(private.import_text(r, 'email'));
      if v_email is null then raise exception 'The e-mail address is missing' using errcode = '22023'; end if;
      if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Not an e-mail address: %', v_email using errcode = '22023'; end if;
      v_role := private.import_role(private.import_text(r, 'role'));
      if v_role = 'unknown' then raise exception 'Unknown role: %', private.import_text(r, 'role') using errcode = '22023'; end if;
      if exists (select 1 from public.org_members m join auth.users u on u.id = m.user_id where m.org_id = p_org and lower(u.email) = v_email) then
        v_msg := 'Already a member: ' || v_email; v_level := 'note'; c_same := c_same + 1;
      elsif exists (select 1 from public.org_invites i where i.org_id = p_org and lower(i.email) = v_email) then
        v_msg := 'Already invited: ' || v_email; v_level := 'note'; c_same := c_same + 1;
      else
        v_new := jsonb_strip_nulls(jsonb_build_object(
          'full_name', left(private.import_text(r, 'full_name'), 120), 'phone', left(private.import_text(r, 'phone'), 60),
          'functions', left(private.import_text(r, 'functions'), 200), 'notes', left(private.import_text(r, 'notes'), 500), 'role', v_role));
        select * into v_held from public.held_invites h where h.org_id = p_org and h.email = v_email and h.status = 'held';
        if v_held.id is null then
          insert into public.held_invites (org_id, email, full_name, phone, functions, notes, role, import_file)
          values (p_org, v_email, v_new ->> 'full_name', v_new ->> 'phone', v_new ->> 'functions', v_new ->> 'notes',
            coalesce(v_new ->> 'role', 'viewer'), left(p_file, 200));
          c_created := c_created + 1;
        else
          v_cur := to_jsonb(v_held);
          if private.import_diff(v_cur, v_new) is null then
            c_same := c_same + 1;
          else
            update public.held_invites h set full_name = coalesce(v_new ->> 'full_name', h.full_name), phone = coalesce(v_new ->> 'phone', h.phone),
              functions = coalesce(v_new ->> 'functions', h.functions), notes = coalesce(v_new ->> 'notes', h.notes), role = coalesce(v_new ->> 'role', h.role)
             where h.id = v_held.id;
            c_updated := c_updated + 1;
          end if;
        end if;
      end if;
    exception when others then
      c_skipped := c_skipped + 1; v_msg := left(sqlerrm, 300); v_level := 'skip';
    end;
    if v_msg is not null and jsonb_array_length(v_problems) < 1000 then
      v_problems := v_problems || jsonb_build_object('row', v_line, 'message', v_msg, 'level', v_level);
    end if;
  end loop;
  return jsonb_build_object('created', c_created, 'updated', c_updated, 'unchanged', c_same, 'skipped', c_skipped, 'problems', v_problems);
end $$;
revoke execute on function public.import_crew(uuid, jsonb, text) from public, anon;
grant execute on function public.import_crew(uuid, jsonb, text) to authenticated;
