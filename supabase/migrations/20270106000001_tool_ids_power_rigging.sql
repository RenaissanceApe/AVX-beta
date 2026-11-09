-- Tools, part 2 (S09 power, S12 rigging): two new gig tools, 'power' and 'rigging'.
-- RUN BY HAND in the SQL editor: first the test project, then production. Changing a check means
-- replacing it, which the connector may not run; hence this small file (as 20261229000000).
-- 1. Organisations and gigs may use the two new tools.
-- 2. New organisations get them; organisations still on the previous default get them too.

alter table public.organisations drop constraint if exists organisations_field_tools_check;
alter table public.organisations add constraint organisations_field_tools_check check (
  field_tools <@ array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc', 'power', 'rigging']);

alter table public.gig_tools drop constraint if exists gig_tools_tool_check;
alter table public.gig_tools add constraint gig_tools_tool_check check (
  tool in ('stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc', 'power', 'rigging'));

alter table public.organisations alter column field_tools
  set default array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc', 'power', 'rigging'];
update public.organisations set field_tools = array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc', 'power', 'rigging']
 where field_tools = array['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc'];
