import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { formatMoney } from '../../lib/quotes'
import { moneyLines } from '../../lib/analytics/tiles'
import { useI18n } from '../../i18n'
import { card, label, colors } from '../ui'
import { Hint } from '../help/HelpParts'

// The numbers card on the item page (K5): lifetime revenue, payback, use over 12 months and the
// next bookings, from public.item_money_card. Shown only to those who see money; anyone else (or a
// failed call) gets no card.
export default function ItemMoneyCard({ orgId, item }) {
  const { t, lang, fmt } = useI18n()
  const [data, setData] = useState(null)
  useEffect(() => {
    let cancelled = false
    setData(null)
    supabase.rpc('item_money_card', { p_item: item.id }).then(({ data: d, error }) => {
      if (cancelled) return
      if (error && error.code !== '42501') logger.error('inventory', error, { step: 'item_money_card' })
      setData(error ? false : d)
    })
    return () => { cancelled = true }
  }, [item.id])
  if (!data) return null

  const money = (v, c = 'EUR') => formatMoney(Number(v) || 0, c, lang)
  const revenue = moneyLines(data.lifetime_revenue)
  const p = data.payback
  const payback = !p ? t('itemMoney.noCost')
    : p.paid_back_on ? t('itemMoney.paidBack', { pct: Math.round(Number(p.ratio) * 100), date: fmt(p.paid_back_on, 'd MMM yyyy') })
      : p.expected_on ? t('itemMoney.expected', { pct: Math.round(Number(p.ratio) * 100), date: fmt(p.expected_on, 'MMM yyyy') })
        : t('itemMoney.noPace', { pct: Math.round(Number(p.ratio) * 100) })
  const facts = [
    [t('itemMoney.lifetime'), revenue.map(l => money(l.amount, l.currency)).join(' · ')],
    [t('itemMoney.payback'), <>{payback}{p?.estimated ? ` (${t('reports.estimate')})` : ''}{p ? <span style={{ color: colors.muted }}> · {t('itemMoney.cost', { amount: money(p.cost) })}</span> : null}</>],
    [t('itemMoney.use12'), data.use_12m == null ? '—' : `${Math.round(Number(data.use_12m) * 100)}%`],
    [t('itemMoney.next'), (data.next_bookings || []).length === 0 ? t('itemMoney.noBookings') : (
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {data.next_bookings.map((b, i) => (
          <li key={i}>{fmt(b.starts_at, 'd MMM')} · {b.gig_id ? <Link to={`/gig/${b.gig_id}?tab=equipment`} style={{ color: 'var(--text)' }}>{b.gig_name}</Link> : '—'} × {b.quantity}</li>
        ))}
        {data.upcoming > data.next_bookings.length && <li style={{ color: colors.muted }}>{t('itemMoney.more', { count: data.upcoming - data.next_bookings.length })}</li>}
      </ul>
    )],
  ]
  return (
    <section aria-labelledby="item-money" style={{ ...card, marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <h2 id="item-money" style={{ fontSize: '15px', fontWeight: 700, margin: 0, flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {t('itemMoney.title')} <Hint id="item-money" />
        </h2>
        <Link to={`/org/${orgId}/reports?tab=equipment&view=payback`} style={{ fontSize: '13px', color: colors.accentText, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <BarChart3 size={14} aria-hidden="true" /> {t('itemMoney.report')}
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px 16px' }}>
        {facts.map(([k, v]) => (
          <div key={k} style={{ minWidth: 0 }}>
            <div style={{ ...label, marginBottom: '2px' }}>{k}</div>
            <div style={{ fontSize: '14px', overflowWrap: 'anywhere' }}>{v}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
