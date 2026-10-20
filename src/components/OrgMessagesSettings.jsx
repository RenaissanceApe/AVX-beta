import { useEffect, useState } from 'react'
import { Download, Loader2, MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { formatSize } from '../lib/messages'
import { useI18n } from '../i18n'
import { btn, input, label, colors } from './ui'
import { DangerConfirmModal } from './DangerConfirm'

export const RETENTION_PERIODS = [90, 180, 365, 730]

// Whether moving from one period to another can delete messages (keeping them longer, or for
// ever, never does)
export const shortensRetention = (from, to) => to != null && (from == null || to < from)

// Organisation settings → Messages (docs/MESSAGING.md, M6b): how much the organisation's
// conversations are used, how long they keep messages, and a download of all of them.
export default function OrgMessagesSettings({ org }) {
  const { t, fmt } = useI18n()
  const { notify } = useToast()
  const [days, setDays] = useState(undefined)
  const [stats, setStats] = useState(null)
  const [pending, setPending] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    supabase.from('organisations').select('message_retention_days').eq('id', org.id).maybeSingle()
      .then(({ data }) => setDays(data?.message_retention_days ?? null))
    supabase.rpc('org_message_stats', { p_org: org.id }).then(({ data, error }) => {
      if (error) return logger.error('org', error, { step: 'messageStats' })
      setStats(data?.[0] || null)
    })
  }, [org.id])

  // "90 days", for sentences (the list shows "For 90 days")
  const periodName = d => t(`orgMessages.span.${d}`)

  async function save(next) {
    setBusy(true)
    const { error } = await supabase.rpc('set_message_retention', { p_org: org.id, p_days: next })
    setBusy(false)
    if (error) {
      logger.error('org', error, { step: 'retention' })
      throw error
    }
    track(next == null ? 'org:retentionOff' : 'org:retentionSet')
    setDays(next)
    setPending(undefined)
    notify(next == null ? t('orgMessages.savedKeep') : t('orgMessages.saved', { period: periodName(next) }), 'success')
  }

  function choose(value) {
    const next = value === '' ? null : Number(value)
    if (next === days) return
    // A shorter period deletes messages: confirm it like a deletion
    if (shortensRetention(days, next)) return setPending(next)
    save(next).catch(err => notify(userMessage(err), 'error'))
  }

  async function impact() {
    const { data, error } = await supabase.rpc('retention_preview', { p_org: org.id, p_days: pending })
    if (error) throw error
    const row = data?.[0] || { messages: 0, files: 0 }
    return [
      t('orgMessages.impactNow', { count: Number(row.messages), period: periodName(pending) }),
      t('orgMessages.impactFiles', { count: Number(row.files) }),
      t('orgMessages.impactNightly', { period: periodName(pending) }),
    ]
  }

  async function exportAll() {
    setExporting(true)
    try {
      const { data, error } = await supabase.rpc('export_org_messages', { p_org: org.id })
      if (error) throw error
      const file = { organisation: org.name, exported_at: new Date().toISOString(), conversations: data || [] }
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `avx-${org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'organisation'}-messages-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      track('org:messagesExported')
    } catch (err) {
      logger.error('org', err, { step: 'exportMessages' })
      notify(t('orgMessages.exportFailed', { reason: userMessage(err) }), 'error')
    } finally {
      setExporting(false)
    }
  }

  const hint = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
  return (
    <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <span style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 0 }}><MessageSquare size={13} /> {t('orgMessages.title')}</span>
      {stats && (
        <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6 }}>
          {t('orgMessages.usage', { messages: Number(stats.messages), conversations: Number(stats.conversations) })}
          {' · '}{t('orgMessages.usage30', { messages: Number(stats.messages_30d), people: Number(stats.writers_30d) })}
          {Number(stats.files) > 0 && <>{' · '}{t('orgMessages.usageFiles', { count: Number(stats.files), size: formatSize(Number(stats.file_bytes)) })}</>}
          {stats.oldest && <>{' · '}{t('orgMessages.oldest', { date: fmt(stats.oldest, 'd MMM yyyy') })}</>}
        </p>
      )}
      <div>
        <label style={label} htmlFor="org-retention">{t('orgMessages.keepFor')}</label>
        <select id="org-retention" value={days == null ? '' : String(days)} disabled={days === undefined || busy}
          onChange={e => choose(e.target.value)} style={input}>
          <option value="">{t('orgMessages.keep')}</option>
          {RETENTION_PERIODS.map(d => <option key={d} value={d}>{t(`orgMessages.period.${d}`)}</option>)}
        </select>
      </div>
      <p style={hint}>{t('orgMessages.hint')}</p>
      <div>
        <button type="button" onClick={exportAll} disabled={exporting} style={btn}>
          {exporting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />} {t('orgMessages.export')}
        </button>
        <p style={{ ...hint, marginTop: '6px' }}>{t('orgMessages.exportHint')}</p>
      </div>
      {pending !== undefined && (
        <DangerConfirmModal title={t('orgMessages.confirmTitle', { period: periodName(pending) })} name={org.name}
          intro={t('orgMessages.confirmIntro', { period: periodName(pending) })} confirmLabel={t('orgMessages.confirmButton')}
          loadImpact={impact} onConfirm={() => save(pending)} onClose={() => setPending(undefined)} />
      )}
    </div>
  )
}
