// Expenses on a gig's Crew tab (step 9b). Anyone on the gig claims what they paid themselves (with
// the receipt) and sees their own claims; the gig's managers approve or send back; those who see
// money also see every cost linked to the gig and add one.
import { useCallback, useEffect, useState } from 'react'
import { Receipt, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { localToday } from '../../lib/gigs'
import { EXPENSE_SELECT } from '../../lib/expenses'
import { useI18n } from '../../i18n'
import { btn, colors } from '../ui'
import EmptyState from '../EmptyState'
import { ExpenseRow, ClaimActions, Totals } from './ExpenseParts'
import ExpenseForm from './ExpenseForm'

export default function GigExpenses({ gig, isPM, orgRole, userId, nameOf }) {
  const { t, lang } = useI18n()
  const [list, setList] = useState(null)
  const [categories, setCategories] = useState([])
  const [editing, setEditing] = useState(null) // expense | 'claim' | 'new'
  const canSee = orgRole === 'admin' || orgRole === 'member'
  const today = localToday()

  const load = useCallback(async () => {
    const [e, c] = await Promise.all([
      supabase.from('expenses').select(EXPENSE_SELECT).eq('gig_id', gig.id).is('removed_at', null).order('spent_on').limit(500),
      canSee ? supabase.from('expense_categories').select('*').eq('org_id', gig.org_id) : { data: [] },
    ])
    if (e.error) logger.error('expenses', e.error, { step: 'gig' })
    setList(e.data || [])
    setCategories(c.data || [])
  }, [gig.id, gig.org_id, canSee])
  useEffect(() => { if (gig.org_id) load() }, [load, gig.org_id])

  if (!gig.org_id || !list) return null
  const mine = list.filter(e => e.claimed_by === userId)
  const waiting = list.filter(e => e.status === 'claimed' && e.claimed_by !== userId && (isPM || canSee))
  const costs = canSee ? list.filter(e => e.status === 'confirmed') : []
  const names = Object.fromEntries(list.filter(e => e.claimed_by).map(e => [e.claimed_by, nameOf(e.claimed_by)]))
  const open = e => (canSee || (e.claimed_by === userId && e.status !== 'confirmed') ? () => setEditing(e) : undefined)
  const presetGig = { gig_id: gig.id, gigs: [{ id: gig.id, name: gig.name, start_date: gig.start_date }] }

  return (
    // On the gig page's Crew tab: a section on the page ground, not a card (DESIGN.md "One box deep"; DR2)
    <section aria-labelledby="gig-expenses" className="avx-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <h3 id="gig-expenses" className="avx-section__title" style={{ flex: '1 1 160px' }}>
          {t('expenses.gigTitle')}
        </h3>
        <button type="button" onClick={() => setEditing('claim')} style={btn}><Plus size={14} /> {t('expenses.newClaim')}</button>
        {canSee && <button type="button" onClick={() => setEditing('new')} style={btn}><Plus size={14} /> {t('expenses.add')}</button>}
      </div>
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, margin: 0 }}>{canSee ? t('expenses.gigIntroFinance') : t('expenses.gigIntro')}</p>

      {waiting.length > 0 && (
        <div>
          <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '4px 0 0', color: 'var(--warn)' }}>{t('expenses.toApprove', { count: waiting.length })}</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {waiting.map(e => (
              <ExpenseRow key={e.id} e={e} categories={categories} names={names} today={today} details onOpen={open(e)}>
                <ClaimActions e={e} onDone={load} />
              </ExpenseRow>
            ))}
          </ul>
        </div>
      )}

      {mine.length > 0 && (
        <div>
          <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '4px 0 0' }}>{t('expenses.yourClaims')}</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {mine.map(e => (
              <ExpenseRow key={e.id} e={e} categories={categories} names={names} today={today} details onOpen={open(e)}>
                {e.status === 'returned' && e.review_note && <span style={{ flexBasis: '100%', fontSize: '12px', color: colors.danger }}>{t('expenses.returnedNote', { note: e.review_note })}</span>}
              </ExpenseRow>
            ))}
          </ul>
        </div>
      )}

      {canSee && (
        costs.length > 0 ? (
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '4px 0 0', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span>{t('expenses.gigCosts')}</span><span>{t('expenses.netShort')} <Totals list={costs} lang={lang} what="net" /></span>
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {costs.filter(e => e.claimed_by !== userId).map(e => <ExpenseRow key={e.id} e={e} categories={categories} names={names} today={today} onOpen={open(e)} />)}
            </ul>
          </div>
        ) : !waiting.length && !mine.length && <EmptyState compact icon={<Receipt size={24} />} title={t('expenses.gigNone')} body={t('expenses.gigNoneBody')} guide="office-expenses" />
      )}
      {!canSee && !mine.length && !waiting.length && <EmptyState compact icon={<Receipt size={24} />} title={t('expenses.gigNoneClaims')} body={t('expenses.gigNoneClaimsBody')} action={t('expenses.newClaim')} onAction={() => setEditing('claim')} />}

      {editing && (
        <ExpenseForm orgId={gig.org_id} expense={typeof editing === 'object' ? editing : null} claim={editing === 'claim'}
          preset={presetGig} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </section>
  )
}
