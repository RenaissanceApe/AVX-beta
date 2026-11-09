-- Rigging, first part (RG1): the rigging tool joins the tool lists.
-- RUN BY HAND (SQL editor), on the test project and then production, after
-- 20270107000000_rigging.sql: widening a check constraint means replacing it, which the
-- connector never runs. Safe to run twice. Until it has run, the rigging tool can't be added to a
-- gig (everything else in RG1 works).
-- 1. 'rigging' becomes an allowed tool for organisations and gigs.
-- 2. It joins the default tools; organisations still on the F4 default get it too.

alter table public.organisations drop constraint if exists organisations_field_tools_check;
alter table public.organisations add constraint organisations_field_tools_check check (
  field_tools <@ array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc', 'rigging']);

alter table public.gig_tools drop constraint if exists gig_tools_tool_check;
alter table public.gig_tools add constraint gig_tools_tool_check check (
  tool in ('stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc', 'rigging'));

alter table public.organisations alter column field_tools
  set default array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc', 'rigging'];
update public.organisations set field_tools = array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc', 'rigging']
 where field_tools = array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc'];
