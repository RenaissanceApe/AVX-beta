-- Organisation export (docs/SWITCHING.md, S5) with step 7: three more files, the crew rate card, its
-- factors and the fees agreed on gigs. Instead of writing the whole export function again, the
-- current one is renamed and the new one handles the new parts and hands every other part to it.
-- A later migration that changes an older part re-creates private.export_org_part_base.
-- Written without destructive statements.

alter function private.export_org_part_unchecked(uuid, text, integer) rename to export_org_part_base;

create or replace function private.export_org_part_unchecked(p_org uuid, p_part text, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb; v_lim constant integer := 5000; v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  case p_part
  when 'crew_rates' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select r.function_title, p.full_name as person, r.day_rate, r.half_day_rate, r.hour_rate, r.note, r.created_at
        from public.crew_rates r
        left join public.profiles p on p.id = r.user_id
       where r.org_id = p_org and r.removed_at is null
       order by r.function_title nulls last, p.full_name nulls first, r.id offset v_off limit v_lim) x;
  when 'crew_rate_factors' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select f.overtime, f.overtime_after_hours, f.weekend, f.night, f.holiday, f.updated_at
        from public.crew_rate_factors f
       where f.org_id = p_org and v_off = 0) x;
  when 'gig_crew_fees' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select coalesce(g.import_ref, g.id::text) as gig_ref, g.name as gig, p.full_name as name, m.function_title,
             f.unit, f.rate, f.quantity, round(f.rate * f.quantity, 2) as total, f.note, f.updated_at
        from public.gig_crew_fees f
        join public.gigs g on g.id = f.gig_id
        left join public.gig_members m on m.gig_id = f.gig_id and m.user_id = f.user_id
        left join public.profiles p on p.id = f.user_id
       where g.org_id = p_org and f.rate is not null
       order by g.start_date nulls last, g.name, p.full_name, f.user_id offset v_off limit v_lim) x;
  else
    return private.export_org_part_base(p_org, p_part, p_offset);
  end case;
  return coalesce(v_out, '[]'::jsonb);
end $$;
revoke execute on function private.export_org_part_unchecked(uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.export_org_part_base(uuid, text, integer) from public, anon, authenticated;
