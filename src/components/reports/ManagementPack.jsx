import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { packMonths, downloadPack } from '../../lib/analytics/managementPack'
import { todayIn } from '../../lib/analytics/periods'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { useI18n, fmt } from '../../i18n'
import { Hint } from '../help/HelpParts'
import { btn, colors, input, AvxLoader } from '../ui'

// Reports → Overview: the monthly management pack (K9) as a PDF, for a whole month already over
export default function ManagementPack({ orgId, orgName, timeZone }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const months = packMonths(todayIn(timeZone || 'UTC'))
  const [month, setMonth] = useState(months[0])
  const [busy, setBusy] = useState(false)
  const monthLabel = m => fmt(`${m}-01`, 'MMMM yyyy')

  const download = async () => {
    setBusy(true)
    try {
      await downloadPack({ orgId, orgName, month, t, lang, monthLabel: monthLabel(month) })
    } catch (error) {
      logger.error('reports', error, { step: 'pack' })
      notify(userMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="rp-pack" className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <h2 id="rp-pack" style={{ font: '700 16px/24px var(--font-mono)', margin: 0 }}>{t('reports.pack.title')}</h2>
        <Hint id="management-pack" label={t('reports.pack.title')} />
      </div>
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, margin: 0 }}>{t('reports.pack.intro')}</p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <label htmlFor="pack-month" style={{ fontSize: '13px' }}>{t('reports.pack.month')}</label>
        <select id="pack-month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...input, width: 'auto', minWidth: '160px', cursor: 'pointer' }}>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <button type="button" onClick={download} disabled={busy} style={{ ...btn, padding: '7px 12px' }}>
          {busy ? <AvxLoader size={14} /> : <FileDown size={14} aria-hidden="true" />} {t('reports.pack.download')}
        </button>
      </div>
    </section>
  )
}
