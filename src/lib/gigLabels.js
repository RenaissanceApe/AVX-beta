// An organisation's own gig statuses and gig types (docs/TOOLS_PLAN.md build order step 6, S1).
// Each status stands for one of the five built-in ones, which keep driving lists and archiving.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export const BASE_STATUSES = ['draft', 'confirmed', 'active', 'completed', 'archived']
export const LABEL_COLOURS = ['grey', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink', 'sky']
const VAR = { grey: '--muted', blue: '--info', green: '--accent-text', yellow: '--yellow', orange: '--orange', red: '--danger', purple: '--purple', pink: '--pink', sky: '--sky' }
const BASE_COLOUR = { draft: 'grey', confirmed: 'blue', active: 'green', completed: 'purple', archived: 'grey' }

// Text colour and tint for a badge, from the theme (readable in every theme)
export function labelStyle(colour) {
  const v = `var(${VAR[colour] || VAR.grey})`
  return { color: v, background: `color-mix(in srgb, ${v} 14%, transparent)` }
}

// Gig queries embed the organisation's status and type with the gig (any reader of the gig may
// read them): select('*, ' + GIG_LABELS_EMBED)
export const GIG_LABELS_EMBED = 'custom_status:custom_status_id(id, name, colour, base_status), gig_type:gig_type_id(id, name, colour)'

// What a gig shows: the organisation's status if it has one, else the built-in one
export function gigStatusLabel(gig, t, statuses) {
  const own = gig?.custom_status_id && (gig.custom_status?.id === gig.custom_status_id ? gig.custom_status : (statuses || []).find(s => s.id === gig.custom_status_id))
  return own
    ? { name: own.name, colour: own.colour, custom: true }
    : { name: t(`status.${gig?.status || 'draft'}`), colour: BASE_COLOUR[gig?.status] || 'grey', custom: false }
}

export const gigTypeOf = (gig, types) => (gig?.gig_type_id && (gig.gig_type?.id === gig.gig_type_id ? gig.gig_type : (types || []).find(x => x.id === gig.gig_type_id))) || null

// Starting set offered to an organisation with none yet (names come from i18n: labels.suggest.*)
export const SUGGESTED_STATUSES = [
  { key: 'option', base: 'draft', colour: 'yellow' },
  { key: 'confirmed', base: 'confirmed', colour: 'blue' },
  { key: 'onTheRoad', base: 'active', colour: 'green' },
  { key: 'done', base: 'completed', colour: 'purple' },
  { key: 'invoiced', base: 'completed', colour: 'sky' },
  { key: 'cancelled', base: 'archived', colour: 'red' },
]

export const sortLabels = list => [...(list || [])].sort((a, b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)))

// The lists for one organisation (none for personal gigs), kept per page
export function useGigLabels(orgId) {
  const [labels, setLabels] = useState({ statuses: [], types: [], loaded: !orgId })
  const load = useCallback(async () => {
    if (!orgId) return setLabels({ statuses: [], types: [], loaded: true })
    const [s, ty] = await Promise.all([
      supabase.from('gig_statuses').select('id, name, colour, base_status, position, created_at').eq('org_id', orgId).is('removed_at', null),
      supabase.from('gig_types').select('id, name, colour, position, created_at').eq('org_id', orgId).is('removed_at', null),
    ])
    setLabels({ statuses: sortLabels(s.data), types: sortLabels(ty.data), loaded: true })
  }, [orgId])
  useEffect(() => { load() }, [load])
  return { ...labels, reload: load }
}
