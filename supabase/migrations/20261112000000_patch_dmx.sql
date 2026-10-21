-- Field tools F2 (docs/FIELD_TOOLS.md): the audio patch and the DMX patch.
-- 1. gig_show.audio: the gig's stage boxes ({ boxes: [{ name, inputs, split }] }). Which socket an
--    input line uses stays on the line (gig_inputs.stage_box, e.g. "SB1-03").
-- 2. gig_fixtures: the lighting fixtures, one row each, with their DMX universe, start address
--    and footprint (how many channels they take), position and optional catalogue item.
-- 3. The two tools join the default list; organisations still on the old default get them too.
-- Same rights as the other tools: the gig's managers and the organisation's admins and members
-- edit, everyone on the gig reads.
-- Written without destructive statements so it applies without manual confirmation.

-- ── Stage boxes ──────────────────────────────────────────────────────────────
alter table public.gig_show add column if not exists audio jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gig_show_audio_check') then
    alter table public.gig_show add constraint gig_show_audio_check
      check (jsonb_typeof(audio) = 'object' and pg_column_size(audio) <= 32768);
  end if;
end $$;

-- ── Fixtures ─────────────────────────────────────────────────────────────────
create table if not exists public.gig_fixtures (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  fixture_type text not null check (char_length(trim(fixture_type)) between 1 and 80),
  mode text check (char_length(coalesce(mode, '')) <= 40),
  footprint smallint not null check (footprint between 1 and 512),
  universe smallint not null default 1 check (universe between 1 and 256),
  address smallint check (address between 1 and 512),
  position text check (char_length(coalesce(position, '')) <= 60),
  item_id uuid references public.price_items(id) on delete set null,
  notes text check (char_length(coalesce(notes, '')) <= 200),
  sort integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A fixture can't run past channel 512 of its universe
  check (address is null or address + footprint - 1 <= 512)
);
create index if not exists gig_fixtures_gig_idx on public.gig_fixtures (gig_id, universe, address);
alter table public.gig_fixtures enable row level security;
create policy gig_fixtures_select on public.gig_fixtures for select to authenticated using (private.can_see_tools(gig_id));
create policy gig_fixtures_insert on public.gig_fixtures for insert to authenticated with check (private.can_edit_tools(gig_id));
create policy gig_fixtures_update on public.gig_fixtures for update to authenticated
  using (private.can_edit_tools(gig_id)) with check (private.can_edit_tools(gig_id));
create policy gig_fixtures_delete on public.gig_fixtures for delete to authenticated using (private.can_edit_tools(gig_id));
create policy mfa_required on public.gig_fixtures as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- A linked item must be the organisation's own; a gig keeps to 1000 fixtures. Overlapping
-- addresses are allowed (shown as a warning): two fixtures on one address is sometimes meant.
create or replace function private.gig_fixtures_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.gig_id := old.gig_id; new.created_by := old.created_by; new.created_at := old.created_at;
  else
    if (select count(*) from public.gig_fixtures f where f.gig_id = new.gig_id) >= 1000 then
      raise exception 'A DMX patch holds up to 1000 fixtures' using errcode = '54000';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  if new.item_id is not null and not exists (
    select 1 from public.price_items i join public.gigs g on g.org_id = i.org_id where i.id = new.item_id and g.id = new.gig_id
  ) then
    raise exception 'Item not in this organisation''s catalogue' using errcode = '23514';
  end if;
  new.name := trim(new.name);
  new.fixture_type := trim(new.fixture_type);
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.gig_fixtures_before() from public, anon, authenticated;
create or replace trigger gig_fixtures_before before insert or update on public.gig_fixtures
  for each row execute function private.gig_fixtures_before();

-- ── The new tools are offered by default ─────────────────────────────────────
alter table public.organisations alter column field_tools set default array['stage_plot', 'input_list', 'patch', 'dmx_patch'];
update public.organisations set field_tools = array['stage_plot', 'input_list', 'patch', 'dmx_patch']
 where field_tools = array['stage_plot', 'input_list'];
