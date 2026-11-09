import { useState } from 'react'
import { Archive, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { buildOrgExport, slug } from '../lib/orgExport'
import { useI18n } from '../i18n'
import { btn, colors, AvxLoader } from './ui'

// Organisation settings → Your data (docs/SWITCHING.md, S5): everything the organisation holds as
// CSV files in one zip, so an admin can keep a copy or take it to another tool.
export default function OrgExportSettings({ org }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [progress, setProgress] = useState(null)

  async function download() {
    setProgress({ done: 0, total: 1 })
    try {
      const date = new Date().toISOString().slice(0, 10)
      const { blob, counts } = await buildOrgExport({
        rpc: (fn, args) => supabase.rpc(fn, args),
        org,
        readme: t('orgExport.readme', { org: org.name, date }),
        onProgress: (done, total) => setProgress({ done, total }),
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `avx-${slug(org.name)}-${date}.zip`
      a.click()
      URL.revokeObjectURL(url)
      const rows = Object.entries(counts).filter(([k]) => k !== 'messages').reduce((n, [, v]) => n + v, 0)
      notify(t('orgExport.done', { rows, messages: counts.messages }), 'success')
      track('org:exported')
    } catch (err) {
      logger.error('org', err, { step: 'exportAll' })
      notify(t('orgExport.failed', { reason: userMessage(err) }), 'error')
    } finally {
      setProgress(null)
    }
  }

  const hint = { fontSize: '13px', color: colors.muted, lineHeight: 1.5 }
  return (
    <section aria-labelledby="org-export-title" style={{ marginTop: 'var(--space-section)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h3 id="org-export-title" style={{ font: '700 16px/24px var(--font-mono)', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><Archive size={16} aria-hidden="true" /> {t('orgExport.title')}</h3>
      <p style={hint}>{t('orgExport.hint')}</p>
      <div>
        <button type="button" onClick={download} disabled={!!progress} style={btn}>
          {progress ? <AvxLoader size={14} /> : <Download size={14} />}
          {' '}{progress ? t('orgExport.progress', { done: progress.done, total: progress.total }) : t('orgExport.button')}
        </button>
        <p style={{ ...hint, marginTop: '6px' }} role="status">{progress ? t('orgExport.wait') : t('orgExport.keepSafe')}</p>
      </div>
    </section>
  )
}
