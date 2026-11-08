import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { formatMoney } from '../../lib/quotes'
import { localToday } from '../../lib/gigs'
import { myWorkTiles } from '../../lib/analytics/crewNumbers'
import { useI18n, fmt } from '../../i18n'
import { card, colors, mono } from '../ui'

// Crew numbers on My work (K8): earned this month, not yet paid, the booked days in the next 30
// days. Only the person's own gigs (public.my_gig_numbers). Hidden until a gig has a fee or hours.
export function useMyGigNumbers(args = {}, enabled = true) {
  const [state, setState] = useState({ rows: null, error: null })
  const key = JSON.stringify(args)
  useEffect(() => {
    if (!enabled) return
    let live = true
    supabase.rpc('my_gig_numbers', JSON.parse(key)).then(({ data, error }) => {
      if (!live) return
      if (error) logger.error('crewNumbers', error, { step: 'gigs' })
      setState({ rows: data || [], error: error || null })
    })
    return () => { live = false }
  }, [key, enabled])
  return state
}

export default function MyNumbersStrip() {
  const { t, lang } = useI18n()
  const { rows } = useMyGigNumbers()
  if (!rows || !rows.some(r => r.fee_total != null || r.earned != null)) return null
  const tiles = myWorkTiles(rows, localToday())
  const items = [
    { key: 'earned', label: t('myNumbers.tile.earnedThisMonth'), value: formatMoney(tiles.earnedThisMonth, 'EUR', lang) },
    { key: 'unpaid', label: t('myNumbers.tile.notYetPaid'), value: formatMoney(tiles.notYetPaid.amount, 'EUR', lang),
      sub: t('myNumbers.tileSub.gigs', { count: tiles.notYetPaid.count }) },
    { key: 'next', label: t('myNumbers.tile.nextDays'), value: String(tiles.nextDays),
      sub: tiles.nextDate ? t('myNumbers.tileSub.from', { date: fmt(tiles.nextDate, 'd MMM') }) : t('myNumbers.tileSub.none') },
  ]
  return (
    <section aria-labelledby="my-numbers-strip" style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <h2 id="my-numbers-strip" style={{ fontSize: '14px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Wallet size={15} color="var(--accent-text)" aria-hidden="true" /> {t('myNumbers.stripTitle')}
        </h2>
        <Link to="/me/numbers" style={{ fontSize: '13px', color: colors.accentText, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
          {t('myNumbers.open')} <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
        {items.map(i => (
          <li key={i.key} style={{ ...card, padding: '10px 12px', minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: colors.muted }}>{i.label}</div>
            <div style={{ ...mono, fontSize: '18px', fontWeight: 700 }}>{i.value}</div>
            {i.sub && <div style={{ fontSize: '11px', color: colors.muted }}>{i.sub}</div>}
          </li>
        ))}
      </ul>
    </section>
  )
}
