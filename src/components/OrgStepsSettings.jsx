import { useEffect, useState } from 'react'
import { ListChecks } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { STEPS, OPTIONAL_STEPS, activeSteps } from '../lib/inventory'
import { useI18n } from '../i18n'
import { label, colors } from './ui'

// Organisation settings → Equipment steps (docs/HELP.md, H5b): which steps between the
// warehouse and back the organisation uses. Scanning out (loaded) and in (returned) are always on.
export default function OrgStepsSettings({ org }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [chosen, setChosen] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('organisations').select('equipment_steps').eq('id', org.id).maybeSingle()
      .then(({ data }) => setChosen(activeSteps(data?.equipment_steps || null)))
  }, [org.id])

  async function toggle(step, on) {
    const next = STEPS.filter(s => (s === step ? on : chosen.includes(s)))
    setBusy(true)
    const { error } = await supabase.from('organisations').update({ equipment_steps: next }).eq('id', org.id)
    setBusy(false)
    if (error) {
      logger.error('org', error, { step: 'equipmentSteps' })
      return notify(userMessage(error), 'error')
    }
    track('org:equipmentSteps')
    setChosen(next)
  }

  if (!chosen) return null
  return (
    <section aria-labelledby="org-steps" style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${colors.border}` }}>
      <h3 id="org-steps" style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px' }}><ListChecks size={13} /> {t('orgSteps.title')}</h3>
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t('orgSteps.hint')}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {STEPS.map(step => {
          const fixed = !OPTIONAL_STEPS.includes(step)
          return (
            <li key={step}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: fixed ? 'default' : 'pointer', color: fixed ? colors.soft : 'var(--text)' }}>
                <input type="checkbox" checked={chosen.includes(step)} disabled={fixed || busy} onChange={e => toggle(step, e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                {t(`steps.name.${step}`)}
                {fixed && <span style={{ fontSize: '12px', color: colors.muted }}>· {t('orgSteps.always')}</span>}
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
