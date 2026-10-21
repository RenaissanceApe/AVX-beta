import { useState } from 'react'
import { Archive, Download, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { buildOrgExport, slug } from '../lib/orgExport'
import { useI18n } from '../i18n'
import { btn, label, colors } from './ui'

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

  const hint = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
  return (
    <section aria-labelledby="org-export-title" style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <span id="org-export-title" style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 0 }}><Archive size={13} /> {t('orgExport.title')}</span>
      <p style={hint}>{t('orgExport.hint')}</p>
      <div>
        <button type="button" onClick={download} disabled={!!progress} style={btn}>
          {progress ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
          {' '}{progress ? t('orgExport.progress', { done: progress.done, total: progress.total }) : t('orgExport.button')}
        </button>
        <p style={{ ...hint, marginTop: '6px' }} role="status">{progress ? t('orgExport.wait') : t('orgExport.keepSafe')}</p>
      </div>
    </section>
  )
}
