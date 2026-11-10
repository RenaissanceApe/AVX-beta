import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { powerLabels } from '../lib/cables'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'
import usePowerPlan from '../components/power/usePowerPlan'
import LabelSheet from '../components/labels/LabelSheet'
import { AvxLoader } from '../components/ui'

// Labels for the gig's distros and cables (P2), on the shared sizes and the organisation's
// templates (U5): name, where it's fed from or goes, its outputs or length, the gig and a
// "Power" department band. /gig/:id/power/labels
export default function PowerLabelsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const p = usePowerPlan({ id })
  const [what, setWhat] = useState('cables')
  const [gig, setGig] = useState(null)

  useEffect(() => {
    let gone = false
    supabase.from('gigs').select('name, org_id, organisations(name)').eq('id', id).maybeSingle().then(({ data, error }) => {
      if (error) logger.warn('power', error, { step: 'labels-gig' })
      if (!gone) setGig(data || {})
    })
    return () => { gone = true }
  }, [id])

  const labels = useMemo(() => {
    if (!p.plan || !gig) return null
    return powerLabels({ distros: p.distros, cables: p.cables, supply: p.supply, tr: t })
      .filter(l => (what === 'cables' ? l.kind === 'cable' : l.kind === 'distro'))
      .map(l => ({ ...l, gig: gig.name || '' }))
  }, [p.plan, p.distros, p.cables, p.supply, gig, what, t])

  if (!labels) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AvxLoader size={26} color="#1EC878" /></div>

  return (
    <LabelSheet
      labels={labels}
      orgId={gig.org_id}
      orgName={gig.organisations?.name || ''}
      sizeKey={`avx.labels.size.power-${what}`}
      onBack={() => navigate(`/gig/${id}?tab=tools&tool=power`)}
      backLabel={t('callsheet.backToGig')}
      onPrint={() => track(`power:labels-${what}`)}
      empty={t(what === 'cables' ? 'cables.noCableLabels' : 'cables.noDistroLabels')}
      extra={(
        <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {t('cables.labelsWhat')}
          <select value={what} onChange={e => setWhat(e.target.value)} style={{ padding: '6px 8px', background: '#1a2230', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
            <option value="cables">{t('cables.labelsCables')}</option>
            <option value="distros">{t('cables.labelsDistros')}</option>
          </select>
        </label>
      )}
    />
  )
}
