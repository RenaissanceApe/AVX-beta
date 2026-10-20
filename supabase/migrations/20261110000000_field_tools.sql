-- Field tools F1a (docs/FIELD_TOOLS.md): a Tools tab on each gig, the tools each organisation
-- uses, the gig's shared show model and the first tool, the input list.
-- 1. organisations.field_tools: which tools the company uses (admins choose).
-- 2. gig_tools: which tools a gig uses (its Tools tab lists only these).
-- 3. gig_show: one shared description of the show per gig (stage size, trim height…) that every
--    tool reads and adds to.
-- 4. gig_inputs: the input list, one row per channel, optionally linked to a catalogue item (the
--    mic or DI) so it can become equipment on the gig.
-- The gig's managers and the organisation's admins and members edit; everyone on the gig reads.
-- Written without destructive statements so it applies without manual confirmation.

-- ── Which tools an organisation uses ─────────────────────────────────────────
alter table public.organisations add column if not exists field_tools text[] not null
  default array['stage_plot', 'input_list'];
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_field_tools_check') then
    alter table public.organisations add constraint organisations_field_tools_check check (
      field_tools <@ array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc']);
  end if;
end $$;

-- Who edits a gig's tools: its managers and the organisation's admins and members
create or replace function private.can_edit_tools(p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_gig(p_gig) or private.can_quote((select g.org_id from public.gigs g where g.id = p_gig))
$$;
-- Who reads them: also everyone on the gig
create or replace function private.can_see_tools(p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_access_gig(p_gig) or private.can_edit_tools(p_gig)
$$;
revoke execute on function private.can_edit_tools(uuid) from public, anon;
revoke execute on function private.can_see_tools(uuid) from public, anon;
grant execute on function private.can_edit_tools(uuid) to authenticated;
grant execute on function private.can_see_tools(uuid) to authenticated;

-- ── The tools a gig uses ─────────────────────────────────────────────────────
create table if not exists public.gig_tools (
  gig_id uuid not null references public.gigs(id) on delete cascade,
  tool text not null check (tool in ('stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc')),
  added_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (gig_id, tool)
);
alter table public.gig_tools enable row level security;
create policy gig_tools_select on public.gig_tools for select to authenticated using (private.can_see_tools(gig_id));
create policy gig_tools_insert on public.gig_tools for insert to authenticated with check (private.can_edit_tools(gig_id));
create policy gig_tools_delete on public.gig_tools for delete to authenticated using (private.can_edit_tools(gig_id));
create policy mfa_required on public.gig_tools as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- Only tools the organisation uses can be added (a gig without an organisation can use any)
create or replace function private.gig_tools_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_tools text[];
begin
  select o.field_tools into v_tools from public.gigs g join public.organisations o on o.id = g.org_id where g.id = new.gig_id;
  if v_tools is not null and not (new.tool = any(v_tools)) then
    raise exception 'Your organisation doesn''t use this tool' using errcode = '23514';
  end if;
  new.added_by := auth.uid();
  new.created_at := now();
  return new;
end $$;
revoke execute on function private.gig_tools_before() from public, anon, authenticated;
create or replace trigger gig_tools_before before insert on public.gig_tools
  for each row execute function private.gig_tools_before();

-- ── The shared show model ────────────────────────────────────────────────────
-- stage: { width_m, depth_m, trim_m, notes } and whatever later tools add; kept small
create table if not exists public.gig_show (
  gig_id uuid primary key references public.gigs(id) on delete cascade,
  stage jsonb not null default '{}'::jsonb check (jsonb_typeof(stage) = 'object' and pg_column_size(stage) <= 65536),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.gig_show enable row level security;
create policy gig_show_select on public.gig_show for select to authenticated using (private.can_see_tools(gig_id));
create policy gig_show_insert on public.gig_show for insert to authenticated with check (private.can_edit_tools(gig_id));
create policy gig_show_update on public.gig_show for update to authenticated
  using (private.can_edit_tools(gig_id)) with check (private.can_edit_tools(gig_id));
create policy mfa_required on public.gig_show as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

create or replace function private.gig_show_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.gig_id := old.gig_id; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.gig_show_before() from public, anon, authenticated;
create or replace trigger gig_show_before before insert or update on public.gig_show
  for each row execute function private.gig_show_before();

-- ── The input list ───────────────────────────────────────────────────────────
create table if not exists public.gig_inputs (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  channel integer not null check (channel between 1 and 512),
  source text not null check (char_length(trim(source)) between 1 and 120),
  mic text check (char_length(coalesce(mic, '')) <= 120),
  stand text check (char_length(coalesce(stand, '')) <= 60),
  phantom boolean not null default false,
  stage_box text check (char_length(coalesce(stage_box, '')) <= 40),
  notes text check (char_length(coalesce(notes, '')) <= 300),
  item_id uuid references public.price_items(id) on delete set null,
  plot_ref text check (char_length(coalesce(plot_ref, '')) <= 64),
  checked boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gig_inputs_channel_unique unique (gig_id, channel) deferrable initially immediate
);
create index if not exists gig_inputs_gig_idx on public.gig_inputs (gig_id, channel);
alter table public.gig_inputs enable row level security;
create policy gig_inputs_select on public.gig_inputs for select to authenticated using (private.can_see_tools(gig_id));
create policy gig_inputs_insert on public.gig_inputs for insert to authenticated with check (private.can_edit_tools(gig_id));
create policy gig_inputs_update on public.gig_inputs for update to authenticated
  using (private.can_edit_tools(gig_id)) with check (private.can_edit_tools(gig_id));
create policy gig_inputs_delete on public.gig_inputs for delete to authenticated using (private.can_edit_tools(gig_id));
create policy mfa_required on public.gig_inputs as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- A linked item must be the gig's organisation's own
create or replace function private.gig_inputs_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.gig_id := old.gig_id; new.created_by := old.created_by; new.created_at := old.created_at;
  else
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  if new.item_id is not null and not exists (
    select 1 from public.price_items i join public.gigs g on g.org_id = i.org_id where i.id = new.item_id and g.id = new.gig_id
  ) then
    raise exception 'Item not in this organisation''s catalogue' using errcode = '23514';
  end if;
  new.source := trim(new.source);
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.gig_inputs_before() from public, anon, authenticated;
create or replace trigger gig_inputs_before before insert or update on public.gig_inputs
  for each row execute function private.gig_inputs_before();

-- Put the inputs in a new order: channels 1, 2, 3… in the order given (ids not listed keep
-- their place after them)
create or replace function public.order_inputs(p_gig uuid, p_ids uuid[]) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  perform private.require_mfa();
  if not private.can_edit_tools(p_gig) then
    raise exception 'Not allowed to change this gig''s tools' using errcode = '42501';
  end if;
  with wanted as (
    select i.id, row_number() over (order by coalesce(array_position(p_ids, i.id), 100000 + i.channel), i.channel) as ch
      from public.gig_inputs i where i.gig_id = p_gig
  )
  update public.gig_inputs i set channel = w.ch from wanted w where i.id = w.id and i.channel is distinct from w.ch;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.order_inputs(uuid, uuid[]) from public, anon;
grant execute on function public.order_inputs(uuid, uuid[]) to authenticated;
