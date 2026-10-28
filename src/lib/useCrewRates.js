// The organisation's crew rate card and factors (step 7). Only admins and members can read them;
// for anyone else both come back empty.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DEFAULT_FACTORS } from './crewRates'

export function useRateCard(orgId) {
  const [state, setState] = useState({ rates: [], factors: DEFAULT_FACTORS, hasFactors: false, loaded: !orgId })
  const load = useCallback(async () => {
    if (!orgId) return setState({ rates: [], factors: DEFAULT_FACTORS, hasFactors: false, loaded: true })
    const [r, f] = await Promise.all([
      supabase.from('crew_rates').select('id, function_title, user_id, day_rate, half_day_rate, hour_rate, note, created_at')
        .eq('org_id', orgId).is('removed_at', null).order('function_title', { nullsFirst: false }).order('created_at'),
      supabase.from('crew_rate_factors').select('overtime, overtime_after_hours, weekend, night, holiday').eq('org_id', orgId).maybeSingle(),
    ])
    setState({ rates: r.data || [], factors: f.data || DEFAULT_FACTORS, hasFactors: !!f.data, loaded: true })
  }, [orgId])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

// People who have been on the organisation's gigs, and the function titles used there, for the
// rate card's suggestions
export function useOrgCrewPeople(orgId) {
  const [state, setState] = useState({ people: [], titles: [] })
  useEffect(() => {
    if (!orgId) return
    let live = true
    ;(async () => {
      const { data } = await supabase.from('gig_members').select('user_id, function_title, gigs!inner(org_id)').eq('gigs.org_id', orgId).limit(2000)
      const ids = [...new Set((data || []).map(m => m.user_id))]
      const titles = [...new Set((data || []).map(m => m.function_title?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
      const { data: people } = ids.length ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] }
      if (live) setState({ people: (people || []).filter(p => p.full_name).sort((a, b) => a.full_name.localeCompare(b.full_name)), titles })
    })()
    return () => { live = false }
  }, [orgId])
  return state
}
