import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, BadgeCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { formatMoney } from '../../lib/quotes'
import { moneyLines } from '../../lib/analytics/tiles'
import { useI18n, fmt } from '../../i18n'
import { btn, colors, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { Hint } from '../help/HelpParts'
import { PaidModal } from '../gig/LabourCost'

// Crew to pay (K8) at Expenses → Crew to pay: agreed fees on gigs that are over and not marked paid
// (public.crew_to_pay). Admins see everyone; members see the gigs they manage. "Mark paid" records
// the expense linked to the fee, as the labour panel does.
export default function CrewToPay({ orgId, isAdmin }) {
  const { t, lang } = useI18n()
  const [rows, setRows] = useState(null)
  const [paying, setPaying] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('crew_to_pay', { p_org: orgId })
    if (error) logger.error('expenses', error, { step: 'crewToPay' })
    setRows(data || [])
  }, [orgId])
  useEffect(() => { load() }, [load])

  if (!rows) return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><AvxLoader size={22} color={colors.accentText} /></div>
  const totals = {}
  rows.forEach(r => { totals[r.currency] = (totals[r.currency] || 0) + Number(r.amount || 0) })
  const estimated = rows.filter(r => r.estimated).length

  return (
    <section aria-labelledby="crew-pay-title" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <h2 id="crew-pay-title" className="avx-section__title">
        <Users size={16} color="var(--accent-text)" aria-hidden="true" /> {t('crewPay.title')}
        {/* The intro sits behind ⓘ (DESIGN.md rule 4); members see which gigs they cover */}
        {isAdmin ? <Hint id="crew-to-pay" /> : <Hint text={t('crewPay.introMember')} label={t('crewPay.title')} />}
      </h2>
      {rows.length === 0 ? (
        <EmptyState compact icon={<BadgeCheck size={26} />} title={t('crewPay.emptyTitle')} body={t('crewPay.emptyBody')} guide="office-expenses" />
      ) : (
        <>
          <p style={{ margin: 0, fontSize: '14px' }}>
            {t('crewPay.total', { count: rows.length })}: <strong>{moneyLines(totals).map(l => formatMoney(l.amount, l.currency, lang)).join(' · ')}</strong>
            {estimated > 0 && <span style={{ display: 'block', fontSize: '13px', color: colors.muted }}>{t('crewPay.estimated', { count: estimated })}</span>}
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
            {rows.map(r => (
              <li key={`${r.gig_id}-${r.user_id}`} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${colors.border}`, fontSize: '14px' }}>
                <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{r.person_name || '—'}</span>
                  {r.function_title && <span style={{ color: colors.muted }}> · {r.function_title}</span>}
                  <span style={{ display: 'block', fontSize: '13px', color: colors.muted }}>
                    <Link to={`/gig/${r.gig_id}?tab=crew`} style={{ color: colors.accentText }}>{r.gig_name}</Link>
                    {' · '}{t('crewPay.ended', { date: fmt(r.end_date || r.start_date, 'd MMM yyyy'), count: r.days_waiting })}
                  </span>
                </span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                  {formatMoney(r.amount, r.currency, lang)}
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 400, color: colors.muted }}>{t(r.estimated ? 'crewPay.agreedFee' : 'crewPay.invoice')}</span>
                </span>
                <button type="button" onClick={() => setPaying(r)} style={{ ...btn, padding: '4px 8px', fontSize: '13px' }} aria-label={t('labour.markPaidFor', { name: r.person_name || '—' })}>
                  <BadgeCheck size={13} aria-hidden="true" /> {t('labour.markPaid')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {paying && (
        <PaidModal gig={{ id: paying.gig_id, name: paying.gig_name }} line={{ member: { user_id: paying.user_id }, total: paying.fee_total }}
          name={paying.person_name || '—'} invoice={paying.expense_id ? { id: paying.expense_id } : null} paidOn={null}
          onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load() }} />
      )}
    </section>
  )
}
