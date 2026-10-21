-- Field tools F1b (docs/FIELD_TOOLS.md): the stage plot. One row per thing on stage (a drum
-- kit, a vocal mic, a monitor, a riser…), placed in metres on the stage drawn from the gig's
-- shared show model (gig_show.stage: width_m, depth_m). Symbols that make sound carry their
-- channels to the input list (gig_inputs.plot_ref = "<plot item id>:<n>").
-- x: metres from the left of the stage as the audience sees it; y: metres from the front edge.
-- Same rights as the input list: the gig's managers and the organisation's admins and members
-- edit, everyone on the gig reads.
-- Written without destructive statements so it applies without manual confirmation.

create table if not exists public.gig_plot_items (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z_]{1,29}$'),
  label text check (char_length(coalesce(label, '')) <= 60),
  x numeric(6, 2) not null check (x between 0 and 100),
  y numeric(6, 2) not null check (y between 0 and 100),
  rotation smallint not null default 0 check (rotation in (0, 90, 180, 270)),
  item_id uuid references public.price_items(id) on delete set null,
  notes text check (char_length(coalesce(notes, '')) <= 200),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gig_plot_items_gig_idx on public.gig_plot_items (gig_id);
alter table public.gig_plot_items enable row level security;
create policy gig_plot_items_select on public.gig_plot_items for select to authenticated using (private.can_see_tools(gig_id));
create policy gig_plot_items_insert on public.gig_plot_items for insert to authenticated with check (private.can_edit_tools(gig_id));
create policy gig_plot_items_update on public.gig_plot_items for update to authenticated
  using (private.can_edit_tools(gig_id)) with check (private.can_edit_tools(gig_id));
create policy gig_plot_items_delete on public.gig_plot_items for delete to authenticated using (private.can_edit_tools(gig_id));
create policy mfa_required on public.gig_plot_items as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- A linked item must be the organisation's own; a plot keeps to 300 things
create or replace function private.gig_plot_items_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.gig_id := old.gig_id; new.created_by := old.created_by; new.created_at := old.created_at;
  else
    if (select count(*) from public.gig_plot_items p where p.gig_id = new.gig_id) >= 300 then
      raise exception 'A stage plot holds up to 300 things' using errcode = '54000';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  if new.item_id is not null and not exists (
    select 1 from public.price_items i join public.gigs g on g.org_id = i.org_id where i.id = new.item_id and g.id = new.gig_id
  ) then
    raise exception 'Item not in this organisation''s catalogue' using errcode = '23514';
  end if;
  new.label := nullif(trim(coalesce(new.label, '')), '');
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.gig_plot_items_before() from public, anon, authenticated;
create or replace trigger gig_plot_items_before before insert or update on public.gig_plot_items
  for each row execute function private.gig_plot_items_before();
