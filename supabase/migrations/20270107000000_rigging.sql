-- Rigging, first part (docs/TOOLS_PLAN.md §5, RG1; build order step 17).
-- 1. gig_show.rigging: the gig's truss lines, their loads and hang points, and the defaults to
--    check ({ settings: { cable_kg_m, dynamic_factor }, lines: [{ id, bar_id, name, length_m,
--    truss_kg_m, cable_kg_m, accessories_kg, loads: [{ id, name, kg, at_m, to_m }], points: [{ id,
--    at_m, hoist_model_id, hoist: { copy of the model }, over_people, motor_on_line }], checked:
--    { at, fingerprint } }] }). Results are worked out in the app. Same rights as the rest of the
--    show model.
-- 2. hoist_models: chain hoists with their class (D8, D8+, C1) and the manufacturer's WLL, never
--    derived. Rows without an organisation are AVX presets from the manufacturers' data sheets
--    (read-only, source noted); an organisation adds its own from a hoist's data plate. Every
--    model needs a second person's check before use (shown in the app). Removed by marking.
-- Adding the tool id 'rigging' to the tool lists needs a constraint change: that is in
-- 20270107000001_rigging_tool_checks.sql, run by hand. Written without destructive statements.

-- ── The gig's rigging ────────────────────────────────────────────────────────
alter table public.gig_show add column if not exists rigging jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gig_show_rigging_check') then
    alter table public.gig_show add constraint gig_show_rigging_check
      check (jsonb_typeof(rigging) = 'object' and pg_column_size(rigging) <= 65536);
  end if;
end $$;

-- ── Hoist models ─────────────────────────────────────────────────────────────
create table if not exists public.hoist_models (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisations(id) on delete cascade, -- null: an AVX preset
  brand text not null check (length(brand) between 1 and 60),
  model text not null check (length(model) between 1 and 80),
  class text not null check (class in ('D8', 'D8+', 'C1')),
  wll_kg numeric(8,1) check (wll_kg is null or wll_kg between 1 and 50000),
  falls smallint check (falls is null or falls between 1 and 8),
  self_weight_kg numeric(7,1) check (self_weight_kg is null or self_weight_kg between 0 and 5000),
  chain_kg_m numeric(6,2) check (chain_kg_m is null or chain_kg_m between 0 and 100),
  speed_m_min numeric(5,1) check (speed_m_min is null or speed_m_min between 0 and 100),
  source text not null default '' check (length(source) <= 500), -- data sheet URL, or "data plate"
  source_date text not null default '' check (length(source_date) <= 80), -- edition / revision / date
  notes text not null default '' check (length(notes) <= 1000),
  needs_check boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists hoist_models_org_idx on public.hoist_models (org_id, brand, model);
alter table public.hoist_models enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hoist_models' and policyname = 'hoist_models_select') then
    create policy hoist_models_select on public.hoist_models for select to authenticated
      using (org_id is null or private.is_org_member(org_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hoist_models' and policyname = 'hoist_models_insert') then
    create policy hoist_models_insert on public.hoist_models for insert to authenticated
      with check (org_id is not null and private.can_quote(org_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hoist_models' and policyname = 'hoist_models_update') then
    create policy hoist_models_update on public.hoist_models for update to authenticated
      using (org_id is not null and private.can_quote(org_id)) with check (org_id is not null and private.can_quote(org_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hoist_models' and policyname = 'mfa_required') then
    create policy mfa_required on public.hoist_models as restrictive for all to authenticated
      using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
  end if;
end $$;
-- A model is removed by marking removed_at (no policy for removing rows)

-- Who made it and when can't be changed; nor can a model move to another organisation; a model
-- typed in by someone always starts as needing a check
create or replace function private.hoist_models_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.created_by := old.created_by; new.created_at := old.created_at;
    new.needs_check := old.needs_check or new.wll_kg is distinct from old.wll_kg or new.class is distinct from old.class;
  else
    if (select count(*) from public.hoist_models m where m.org_id = new.org_id) >= 200 then
      raise exception 'An organisation keeps up to 200 hoist models' using errcode = '54000';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
    new.needs_check := true;
    new.removed_at := null;
  end if;
  return new;
end $$;
revoke execute on function private.hoist_models_before() from public, anon, authenticated;
create or replace trigger hoist_models_before before insert or update on public.hoist_models
  for each row execute function private.hoist_models_before();

-- ── Presets (from the manufacturers' own documents, opened 2026-11-09) ──────
-- Chainmaster D8+ (CHAINMASTER GmbH product data sheets, chainmaster.de):
--   500 kg: DS_CH_D8PLUS_SK_030-76U_500kg_4m_1f-400V-50Hz_DC.pdf, rev 1.1, 18.10.2024
--   1000 kg: DS_CH_D8PLUS_SK_070-76U_1000kg_4m_1f_400V-50Hz_DC.pdf, rev 1.1, 18.10.2024
--   2000 kg: DS_CH_D8PLUS_SK_070-78U_2000kg_4m_2f_400V-50Hz_DC.pdf, rev 1.1, 02.06.2025
-- CM Lodestar D8+ (Columbus McKinnon): no D8+ data sheet could be reached on cmco.com this
-- session, so these ship WITHOUT values; type them from the manufacturer's data sheet or the data
-- plate before use (docs/notes/S12.md).
insert into public.hoist_models (id, org_id, brand, model, class, wll_kg, falls, self_weight_kg, chain_kg_m, speed_m_min, source, source_date, notes, needs_check, created_by)
values
  ('5e120000-0000-4000-8000-000000000501', null, 'Chainmaster', 'D8+ 500 kg, 4 m/min (SK030/76U, CM-960505)', 'D8+', 500, 1, 20, 0.59, 4,
   'https://chainmaster.de/wp-content/uploads/2024/10/DS_CH_D8PLUS_SK_030-76U_500kg_4m_1f-400V-50Hz_DC.pdf', 'Rev. 1.1, 18.10.2024',
   'Weight approx., without chain, incl. single hole suspension plate, hook tackle and direct control. Chain P5.4 x 15 mm.', true, null),
  ('5e120000-0000-4000-8000-000000001001', null, 'Chainmaster', 'D8+ 1000 kg, 4 m/min (SK070/76U, CM-961004)', 'D8+', 1000, 1, 37, 1.3, 4,
   'https://chainmaster.de/wp-content/uploads/2024/10/DS_CH_D8PLUS_SK_070-76U_1000kg_4m_1f_400V-50Hz_DC.pdf', 'Rev. 1.1, 18.10.2024',
   'Weight approx., without chain, incl. single hole suspension plate, hook tackle and direct control. Chain P7.4 x 21.1 mm.', true, null),
  ('5e120000-0000-4000-8000-000000002001', null, 'Chainmaster', 'D8+ 2000 kg, 4 m/min, 2 falls (SK070/78U, CM-962002)', 'D8+', 2000, 2, 42, 1.3, 4,
   'https://chainmaster.de/wp-content/uploads/2025/06/DS_CH_D8PLUS_SK_070-78U_2000kg_4m_2f_400V-50Hz_DC.pdf', 'Rev. 1.1, 02.06.2025',
   'Weight approx., without chain, incl. single hole suspension plate, hook block and direct control. Chain P7.4 x 21.1 mm; chain weight is per metre of chain.', true, null),
  ('5e120000-0000-4000-8000-000000010501', null, 'CM Lodestar', 'D8+ 0.5 t', 'D8+', null, null, null, null, null,
   '', '', 'No values: the manufacturer''s D8+ data sheet could not be reached. Add your own model with the values from the data sheet or the data plate.', true, null),
  ('5e120000-0000-4000-8000-000000011001', null, 'CM Lodestar', 'D8+ 1 t', 'D8+', null, null, null, null, null,
   '', '', 'No values: the manufacturer''s D8+ data sheet could not be reached. Add your own model with the values from the data sheet or the data plate.', true, null),
  ('5e120000-0000-4000-8000-000000012001', null, 'CM Lodestar', 'D8+ 2 t', 'D8+', null, null, null, null, null,
   '', '', 'No values: the manufacturer''s D8+ data sheet could not be reached. Add your own model with the values from the data sheet or the data plate.', true, null)
on conflict (id) do nothing;
