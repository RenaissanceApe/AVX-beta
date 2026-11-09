import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Anchor } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { barRigging } from '../../lib/rigging'
import { t } from '../../i18n'
import { colors } from '../ui'

// The gig's rigging, for the light plot's "Rigging: not checked" marks (docs/TOOLS_PLAN.md §5,
// "Prompting from other tools"). The checks use the hoist copies kept with each point.
export function useRigging(gigId) {
  const [rigging, setRigging] = useState(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('gig_show').select('rigging').eq('gig_id', gigId).maybeSingle()
    if (error) { logger.warn('rigging', error, { step: 'marker' }); return }
    setRigging(data?.rigging || {})
  }, [gigId])
  useEffect(() => { load() }, [load])
  return rigging
}

// Under a bar with weights on it: not checked, checked (with the busiest hoist's share of its
// WLL), or overloaded. One tap opens the rigging tool on that line (adding the tool to the gig
// for editors who don't have it yet).
export default function RiggingMarker({ gig, bar, bars, fixtures, rigging, canEdit, onToolsChanged }) {
  const [, setParams] = useSearchParams()
  if (rigging === null) return null
  const r = barRigging(bar, bars, fixtures, rigging, {})
  if (r.state === 'none') return null

  async function open() {
    if (canEdit) {
      const { error } = await supabase.from('gig_tools').insert({ gig_id: gig.id, tool: 'rigging' })
      if (!error) onToolsChanged?.()
      else if (error.code !== '23505') logger.warn('rigging', error, { step: 'addFromPlot' })
    }
    setParams(p => {
      const next = new URLSearchParams(p)
      next.set('tab', 'tools'); next.set('tool', 'rigging'); next.set('line', bar.id)
      return next
    })
  }

  const Icon = r.state === 'checked' ? CheckCircle2 : r.state === 'over' ? AlertTriangle : Anchor
  const colour = r.state === 'over' ? colors.danger : r.state === 'checked' ? colors.accentText : colors.warn
  const text = r.state === 'over' ? t('rig.marker.over') : r.state === 'checked' ? t('rig.marker.checked', { use: Math.round(r.maxUse * 100) }) : t('rig.marker.notChecked')
  return (
    <button type="button" onClick={open} aria-label={t('rig.marker.open', { text, bar: bar.name })}
      style={{ font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', color: colour, fontSize: '13px', fontWeight: 600 }}>
      <Icon size={13} aria-hidden="true" /> {text}
    </button>
  )
}
