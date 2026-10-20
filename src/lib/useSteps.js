import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { logger } from './logger'
import { activeSteps, stepCounts } from './inventory'

// A gig's equipment steps (docs/HELP.md, H5b): the steps its organisation uses, each line's
// planned / out / back (gig_dispatch_summary) and how many have reached each step.
//   { steps, lines, counts, loaded, reload }
// orgId undefined means "not known yet": nothing loads until it is (null: no organisation).
export function useGigSteps(gigId, orgId) {
  const [state, setState] = useState({ steps: activeSteps(null), lines: [], counts: {}, loaded: false })

  const reload = useCallback(async () => {
    if (!gigId || orgId === undefined) return
    const [sum, steps, org] = await Promise.all([
      supabase.rpc('gig_dispatch_summary', { p_gig: gigId }),
      supabase.rpc('gig_step_summary', { p_gig: gigId }),
      orgId ? supabase.from('organisations').select('equipment_steps').eq('id', orgId).maybeSingle() : Promise.resolve({ data: null }),
    ])
    if (sum.error) logger.error('steps', sum.error, { step: 'summary' })
    if (steps.error) logger.error('steps', steps.error, { step: 'steps' })
    setState({
      steps: activeSteps(org.data?.equipment_steps || null),
      lines: sum.data || [],
      counts: stepCounts(steps.data),
      loaded: true,
    })
  }, [gigId, orgId])

  useEffect(() => { reload() }, [reload])
  return { ...state, reload }
}
