-- Field tools F4 (docs/FIELD_TOOLS.md): the sound system calculator.
-- 1. gig_show.system: the settings, the PA's sources and the listening positions
--    ({ temp_c, haas_ms, ear_m, sources: [{ id, name, kind, x, y, height, spl, angle, count,
--    extra_ms }], listeners: [{ id, name, x, y }] }). Results are worked out in the app.
-- 2. The calculator joins the default tools; organisations still on the F3 default get it too.
-- Same rights as the rest of the show model. Written without destructive statements.

alter table public.gig_show add column if not exists system jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gig_show_system_check') then
    alter table public.gig_show add constraint gig_show_system_check
      check (jsonb_typeof(system) = 'object' and pg_column_size(system) <= 32768);
  end if;
end $$;

alter table public.organisations alter column field_tools
  set default array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc'];
update public.organisations set field_tools = array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc']
 where field_tools = array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot'];
