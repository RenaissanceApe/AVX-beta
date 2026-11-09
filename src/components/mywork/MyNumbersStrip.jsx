import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { formatMoney } from '../../lib/quotes'
import { localToday } from '../../lib/gigs'
import { myWorkTiles } from '../../lib/analytics/crewNumbers'
import { useI18n, fmt } from '../../i18n'
import { card, colors, mono, Section, SwipeRow, space } from '../ui'

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
    <Section id="my-numbers-strip" title={t('myNumbers.stripTitle')} link={{ to: '/me/numbers', label: t('myNumbers.open') }}>
      <SwipeRow label={t('myNumbers.stripTitle')} item="64%">
        {items.map(i => (
          <div key={i.key} style={{ ...card, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[1], height: '100%' }}>
            <div style={{ fontSize: '13px', color: colors.muted }}>{i.label}</div>
            <div style={{ ...mono, fontSize: '24px', lineHeight: '32px', fontWeight: 700, overflowWrap: 'anywhere' }}>{i.value}</div>
            {i.sub && <div style={{ fontSize: '13px', color: colors.muted }}>{i.sub}</div>}
          </div>
        ))}
      </SwipeRow>
    </Section>
  )
}
