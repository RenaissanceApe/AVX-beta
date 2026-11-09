import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { useWorkspace } from '../../lib/WorkspaceContext'
import { periodRange, todayIn } from '../../lib/analytics/periods'
import { formatMoney } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { card, colors, label, AvxLoader } from '../ui'
import { Hint } from '../help/HelpParts'

// K4: a client's numbers in Contacts (public.sales_clients for one client, the last 12 months; gig
// dates over all time). Only those who see money get an answer; for anyone else the card stays hidden.
export default function ClientNumbers({ orgId, clientId }) {
  const { t, lang, fmt } = useI18n()
  const timeZone = useWorkspace().orgs.find(o => o.id === orgId)?.time_zone
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let cancelled = false
    const range = periodRange('last_12_months', { today: todayIn(timeZone) })
    supabase.rpc('sales_clients', { p_org: orgId, p_from: range.from, p_until: range.asOf || range.until, p_client: clientId }).then(({ data, error }) => {
      if (cancelled) return
      if (error && error.code !== '42501') logger.error('contacts', error, { step: 'clientNumbers', clientId })
      setRows(error ? [] : data || [])
    })
    return () => { cancelled = true }
  }, [orgId, clientId, timeZone])

  if (rows === null) return <AvxLoader size={16} color={colors.accentText} label={t('common.loading')} />
  if (!rows.length) return null
  // Counts and gig dates are the same on every row; money per currency, the biggest first
  const first = rows[0]
  const money = rows.filter(r => Number(r.revenue) !== 0 || rows.length === 1)
  const day = d => (d ? fmt(d, 'd MMM yyyy') : '—')
  const pct = v => (v == null ? '—' : `${Math.round(Number(v) * 100)}%`)
  const item = (key, value) => (
    <div key={key} style={{ minWidth: 0 }}>
      <dt style={{ fontSize: '11px', color: colors.muted }}>{t(`sales.card.${key}`)}</dt>
      <dd style={{ margin: 0, fontSize: '14px', fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</dd>
    </div>
  )
  return (
    <section aria-labelledby="cl-numbers" style={{ ...card, padding: '12px 14px', marginTop: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <h2 id="cl-numbers" style={{ ...label, marginBottom: 0 }}>{t('sales.card.title')}</h2>
        <Hint id="client-numbers" label={t('sales.card.title')} />
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px', margin: 0 }}>
        {item('revenue', money.map(r => formatMoney(Number(r.revenue) || 0, r.currency, lang)).join(' · '))}
        {item('margin', money.map(r => `${formatMoney(Number(r.gross_margin) || 0, r.currency, lang)}${r.margin_pct != null ? ` (${Number(r.margin_pct).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')}%)` : ''}`).join(' · '))}
        {item('gigs', String(first.gigs))}
        {item('avgGig', money.map(r => (r.avg_gig_value == null ? '—' : formatMoney(Number(r.avg_gig_value), r.currency, lang))).join(' · '))}
        {item('quotes', String(first.quotes))}
        {item('winRate', first.decided ? t('sales.card.winOf', { pct: pct(first.win_rate_count), count: Number(first.decided) }) : '—')}
        {item('firstGig', day(first.first_gig))}
        {item('lastGig', day(first.last_gig))}
        {item('nextGig', day(first.next_gig))}
      </dl>
      <p style={{ fontSize: '13px', color: colors.muted, margin: '8px 0 0', lineHeight: 1.5 }}>
        {t('sales.card.note')} <Link to={`/org/${orgId}/reports?tab=sales&view=clients`} style={{ color: colors.accentText }}>{t('sales.card.allClients')}</Link>
      </p>
    </section>
  )
}
