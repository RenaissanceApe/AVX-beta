-- Field tools F3 (docs/FIELD_TOOLS.md): the light plot.
-- 1. gig_show.lighting: the gig's bars (trusses, pipes, ladders, floor positions) and power
--    supply ({ bars: [{ id, name, kind, x, y, length, rotation, height, phase }], supply: { volts,
--    phases, amps } }). A fixture hangs on a bar when its position is the bar's name.
-- 2. gig_fixtures gains its place on the plot (plot_x, plot_y in metres; both empty = spaced
--    along its bar), a symbol, and its power and weight. Power and weight are copied from the
--    catalogue item when not given, so everyone on the gig sees the same totals.
-- 3. The light plot joins the default tools; organisations still on the F2 default get it too.
-- Written without destructive statements so it applies without manual confirmation.

-- ── Bars and supply ──────────────────────────────────────────────────────────
alter table public.gig_show add column if not exists lighting jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gig_show_lighting_check') then
    alter table public.gig_show add constraint gig_show_lighting_check
      check (jsonb_typeof(lighting) = 'object' and pg_column_size(lighting) <= 65536);
  end if;
end $$;

-- ── Fixtures on the plot ─────────────────────────────────────────────────────
alter table public.gig_fixtures add column if not exists plot_x numeric(6,2);
alter table public.gig_fixtures add column if not exists plot_y numeric(6,2);
alter table public.gig_fixtures add column if not exists symbol text;
alter table public.gig_fixtures add column if not exists power_w integer;
alter table public.gig_fixtures add column if not exists weight_kg numeric(7,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gig_fixtures_plot_check') then
    alter table public.gig_fixtures add constraint gig_fixtures_plot_check check (
      (plot_x is null) = (plot_y is null)
      and (plot_x is null or plot_x between -20 and 60)
      and (plot_y is null or plot_y between -20 and 50));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gig_fixtures_symbol_check') then
    alter table public.gig_fixtures add constraint gig_fixtures_symbol_check check (symbol is null or symbol in
      ('spot', 'wash', 'beam', 'profile', 'par', 'blinder', 'strobe', 'batten', 'haze', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gig_fixtures_power_check') then
    alter table public.gig_fixtures add constraint gig_fixtures_power_check check (
      (power_w is null or power_w between 0 and 20000) and (weight_kg is null or weight_kg between 0 and 2000));
  end if;
end $$;

-- Same rules as before, plus: power and weight come from the catalogue item when not given
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
  -- A new fixture takes what wasn't typed; a fixture given another item takes the new item's
  -- figures unless they were changed in the same edit
  if new.item_id is not null and tg_op = 'INSERT' then
    select coalesce(new.power_w, i.power_w), coalesce(new.weight_kg, i.weight_kg::numeric(7,2))
      into new.power_w, new.weight_kg from public.price_items i where i.id = new.item_id;
  elsif new.item_id is not null and new.item_id is distinct from old.item_id then
    select case when new.power_w is not distinct from old.power_w then coalesce(i.power_w, new.power_w) else new.power_w end,
           case when new.weight_kg is not distinct from old.weight_kg then coalesce(i.weight_kg::numeric(7,2), new.weight_kg) else new.weight_kg end
      into new.power_w, new.weight_kg from public.price_items i where i.id = new.item_id;
  end if;
  new.name := trim(new.name);
  new.fixture_type := trim(new.fixture_type);
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.gig_fixtures_before() from public, anon, authenticated;

-- ── The light plot is offered by default ─────────────────────────────────────
alter table public.organisations alter column field_tools set default array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot'];
update public.organisations set field_tools = array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot']
 where field_tools = array['stage_plot', 'input_list', 'patch', 'dmx_patch'];
