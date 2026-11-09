import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { selectAll } from '../../lib/selectAll'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../../lib/offline'
import { sourcesOf } from '../../lib/systemCalc'
import {
  supplyOf, distrosOf, manualOf, assignOf, figuresMap, marginOf, figuresOf, gatherLoads, powerPlan, planWarnings,
} from '../../lib/power'

const ITEM_FIELDS = 'id, name, power_w, power_typical_w, power_factor, inrush_a, current_a, current_v, connector_in, distro'

// Everything the power tool, its report and the light plot need for one gig (P1): the plan saved in
// gig_show.power, the fixtures, the sound system's sources and the gig's equipment, worked out.
// Editors who can read the catalogue refresh the copy of the items' figures kept in the plan, so
// crew see the same numbers. Offline, the last copy saved on this device is used.
export default function usePowerPlan(gig, { canEdit = false } = {}) {
  const [data, setData] = useState(null) // { power, system, fixtures, equipment }
  const [savedAt, setSavedAt] = useState(null)
  const [catalogue, setCatalogue] = useState([]) // distros in the catalogue (editors)

  const load = useCallback(async () => {
    const [showRes, fxRes, eqRes] = await Promise.all([
      supabase.from('gig_show').select('power, system').eq('gig_id', gig.id).maybeSingle(),
      supabase.from('gig_fixtures').select('id, name, fixture_type, position, power_w, item_id').eq('gig_id', gig.id).order('name').order('id'),
      supabase.from('gig_equipment').select('item_id, item_name, quantity, category').eq('gig_id', gig.id),
    ])
    if (showRes.error && isNetworkError(showRes.error)) {
      const snap = loadSnapshot(`power.${gig.id}`)
      setData(snap?.data || { power: {}, system: {}, fixtures: [], equipment: [] })
      setSavedAt(snap?.savedAt || null)
      return
    }
    for (const [step, r] of [['show', showRes], ['fixtures', fxRes], ['equipment', eqRes]]) if (r.error) logger.error('power', r.error, { step })
    const next = { power: showRes.data?.power || {}, system: showRes.data?.system || {}, fixtures: fxRes.data || [], equipment: eqRes.data || [] }
    setData(next)
    setSavedAt(null)
    saveSnapshot(`power.${gig.id}`, next)
  }, [gig.id])
  useEffect(() => { load() }, [load])

  async function save(patch) {
    const power = { ...(data?.power || {}), ...patch }
    setData(d => ({ ...d, power }))
    const { error } = await supabase.from('gig_show').upsert({ gig_id: gig.id, power })
    if (error) { logger.error('power', error, { step: 'save' }); load() }
    return error
  }

  // Editors: the catalogue's figures for the items this gig uses, and the catalogue's distros
  const itemIds = useMemo(() => {
    if (!data) return []
    const ids = new Set()
    for (const f of data.fixtures) if (f.item_id) ids.add(f.item_id)
    for (const s of sourcesOf(data.system)) if (s.item_id) ids.add(s.item_id)
    for (const e of data.equipment) if (e.item_id) ids.add(e.item_id)
    for (const d of distrosOf(data.power)) if (d.item_id) ids.add(d.item_id)
    return [...ids].sort()
  }, [data])
  const idsKey = itemIds.join(',')
  useEffect(() => {
    if (!canEdit || !gig.org_id || !data || savedAt) return
    let gone = false
    Promise.all([
      itemIds.length ? supabase.from('price_items').select(ITEM_FIELDS).in('id', itemIds) : Promise.resolve({ data: [] }),
      selectAll(() => supabase.from('price_items').select(ITEM_FIELDS).eq('org_id', gig.org_id).not('distro', 'is', null).is('archived_at', null).order('name').order('id')),
    ]).then(([items, distros]) => {
      if (gone) return
      if (items.error || distros.error) return logger.warn('power', items.error || distros.error, { step: 'catalogue' })
      setCatalogue(distros.data || [])
      const figures = {}
      for (const it of [...(items.data || []), ...(distros.data || [])]) {
        if (itemIds.includes(it.id)) figures[it.id] = figuresOf(it)
      }
      if (JSON.stringify(figures) !== JSON.stringify(figuresMap(data.power))) save({ figures })
    })
    return () => { gone = true }
    // data.power changes on every save; only refresh when the items used change
  }, [canEdit, gig.org_id, idsKey, Boolean(data), savedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const worked = useMemo(() => {
    if (!data) return null
    const supply = supplyOf(data.power)
    const distros = distrosOf(data.power)
    const manual = manualOf(data.power)
    const assign = assignOf(data.power)
    const sources = sourcesOf(data.system)
    const loads = gatherLoads({ fixtures: data.fixtures, sources, equipment: data.equipment, manual, figures: figuresMap(data.power) })
    const plan = powerPlan({ supply, distros, loads, assign, margin: marginOf(data.power) })
    return { supply, distros, manual, assign, loads, plan, margin: marginOf(data.power), warnings: planWarnings(plan, distros, supply) }
  }, [data])

  return { data, savedAt, catalogue, save, reload: load, ...(worked || {}) }
}

// Has this gig a power plan yet? (a supply saved, a distro or a typed load)
export const hasPlan = power => Boolean(power && (power.supply || (power.distros || []).length || (power.manual || []).length))
