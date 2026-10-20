import { useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { TOOLS, ALL_TOOL_IDS } from '../lib/tools'
import { useI18n } from '../i18n'
import { label, colors } from './ui'

// Organisation settings → Field tools (docs/FIELD_TOOLS.md): the tools the company uses on its
// gigs. A tool turned off is no longer offered; gigs that already use it keep what they made.
export default function OrgToolsSettings({ org }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [chosen, setChosen] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('organisations').select('field_tools').eq('id', org.id).maybeSingle()
      .then(({ data }) => setChosen(data?.field_tools || []))
  }, [org.id])

  async function toggle(id, on) {
    const next = ALL_TOOL_IDS.filter(x => (x === id ? on : chosen.includes(x)))
    setBusy(true)
    const { error } = await supabase.from('organisations').update({ field_tools: next }).eq('id', org.id)
    setBusy(false)
    if (error) {
      logger.error('org', error, { step: 'fieldTools' })
      return notify(userMessage(error), 'error')
    }
    track('org:fieldTools')
    setChosen(next)
  }

  if (!chosen) return null
  return (
    <section aria-labelledby="org-tools" style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${colors.border}` }}>
      <h3 id="org-tools" style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px' }}><Wrench size={13} /> {t('orgTools.title')}</h3>
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t('orgTools.hint')}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {TOOLS.map(tool => (
          <li key={tool.id}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={chosen.includes(tool.id)} disabled={busy} onChange={e => toggle(tool.id, e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
              {t(`tools.name.${tool.id}`)}
              {!tool.ready && <span style={{ fontSize: '12px', color: colors.muted }}>· {t('orgTools.soon')}</span>}
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
