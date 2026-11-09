-- Line arrays, RG3 (docs/TOOLS_PLAN.md §5; build order step 18).
-- The arrays themselves live in gig_show.rigging (key "arrays", next to RG1's truss lines), so
-- they need no new column: same rights, same offline copy, same 64 KB limit.
-- What this adds is the second person's check of a speaker's rigging data (PENDING D73), the way
-- truss tables are checked (docs/TRUSS_DATA.md):
-- 1. price_items.rigging keeps who last typed it (entered_by). Any change to the rigging data
--    clears the check; the check fields can't be written by a plain update.
-- 2. mark_speaker_rigging_checked(item, frames): someone who can edit the catalogue, and who is
--    not the person who typed the data, marks it checked. "frames" is a fingerprint of the
--    bumper limits AVX shows beside the data (src/data/lineArrays.js); if those change, the app
--    shows the check as out of date.
-- Written without destructive statements: only create or replace / if not exists.

-- ── 1. Keep the check honest ────────────────────────────────────────────────
create or replace function private.price_items_rigging_before() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_meta constant text[] := array['checked', 'checked_by', 'checked_at', 'checked_name', 'checked_frames', 'entered_by'];
  v_new jsonb;
  v_old jsonb;
begin
  if new.rigging is null or jsonb_typeof(new.rigging) <> 'object' then return new; end if;
  -- The sign-off function sets this for its own update only
  if coalesce(current_setting('avx.rigging_signoff', true), '') = 'on' then return new; end if;

  v_new := new.rigging - v_meta;
  v_old := case when tg_op = 'UPDATE' and old.rigging is not null and jsonb_typeof(old.rigging) = 'object'
                then old.rigging - v_meta end;

  if v_old is null or v_new is distinct from v_old then
    -- New or changed data: not checked, typed by whoever saved it
    new.rigging := v_new || jsonb_build_object('checked', false, 'entered_by', auth.uid());
  else
    -- Same data: keep the stored check exactly as it was (a plain update can't mark it checked)
    new.rigging := v_new || jsonb_strip_nulls(jsonb_build_object(
      'checked', coalesce((old.rigging ->> 'checked')::boolean, false),
      'checked_by', old.rigging -> 'checked_by',
      'checked_at', old.rigging -> 'checked_at',
      'checked_name', old.rigging -> 'checked_name',
      'checked_frames', old.rigging -> 'checked_frames',
      -- Data typed before this migration has no author: whoever saves it first counts as the
      -- typist (that only narrows who may check it)
      'entered_by', coalesce(old.rigging -> 'entered_by', to_jsonb(auth.uid()))));
  end if;
  return new;
end $$;

create or replace trigger price_items_rigging_before before insert or update of rigging on public.price_items
  for each row execute function private.price_items_rigging_before();

-- ── 2. The sign-off ─────────────────────────────────────────────────────────
create or replace function public.mark_speaker_rigging_checked(p_item uuid, p_frames text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item public.price_items;
  v_name text;
  v_out jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_item from public.price_items where id = p_item;
  if not found or not private.can_quote(v_item.org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_item.rigging is null or jsonb_typeof(v_item.rigging) <> 'object' then
    raise exception 'no rigging data' using errcode = '22023', hint = 'rigging_missing';
  end if;
  if v_item.rigging ->> 'entered_by' is null then
    raise exception 'who typed the rigging data is not known' using errcode = '22023', hint = 'rigging_author_unknown';
  end if;
  if v_item.rigging ->> 'entered_by' = auth.uid()::text then
    raise exception 'a second person must check the rigging data' using errcode = '42501', hint = 'rigging_same_person';
  end if;
  select nullif(trim(full_name), '') into v_name from public.profiles where id = auth.uid();

  perform set_config('avx.rigging_signoff', 'on', true);
  update public.price_items
     set rigging = rigging || jsonb_strip_nulls(jsonb_build_object(
           'checked', true, 'checked_by', auth.uid(), 'checked_at', now(),
           'checked_name', left(v_name, 80), 'checked_frames', left(p_frames, 200)))
   where id = p_item
   returning rigging into v_out;
  perform set_config('avx.rigging_signoff', 'off', true);
  return v_out;
end $$;

revoke all on function public.mark_speaker_rigging_checked(uuid, text) from public, anon;
grant execute on function public.mark_speaker_rigging_checked(uuid, text) to authenticated;
