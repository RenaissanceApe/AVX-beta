// The expense linked to a subrental, repair, crew fee or stock purchase (step 9b): its actual amount,
// or a button to record the supplier's invoice. Only for those who see money.
import { useCallback, useEffect, useState } from 'react'
import { Receipt, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useWorkspace } from '../../lib/WorkspaceContext'
import { formatMoney } from '../../lib/quotes'
import { EXPENSE_SELECT } from '../../lib/expenses'
import { useI18n } from '../../i18n'
import { btn, colors } from '../ui'
import ExpenseForm from './ExpenseForm'

const COLUMN = { subrental: 'subrental_id', repair: 'repair_id', stock_movement: 'stock_movement_id', stock_unit: 'stock_unit_id' }

export default function LinkedExpense({ orgId, kind, id, preset = {}, planned = null }) {
  const { t, lang } = useI18n()
  const { roleIn } = useWorkspace()
  const canSee = ['admin', 'member'].includes(roleIn(orgId))
  const [expense, setExpense] = useState(undefined)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    if (!canSee || !id) return
    const { data } = await supabase.from('expenses').select(EXPENSE_SELECT).eq(COLUMN[kind], id).is('removed_at', null).maybeSingle()
    setExpense(data || null)
  }, [canSee, kind, id])
  useEffect(() => { load() }, [load])

  if (!canSee || expense === undefined) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13px' }}>
      <Receipt size={14} color="var(--accent-text)" aria-hidden="true" />
      {expense ? (
        <>
          <span style={{ flex: '1 1 160px' }}>
            {t('expenses.linkedActual', { amount: formatMoney(expense.amount_net, expense.currency, lang) })}
            {planned != null && Number(planned) !== Number(expense.amount_net) && (
              <span style={{ color: colors.muted }}> · {t('expenses.linkedPlanned', { amount: formatMoney(planned, 'EUR', lang) })}</span>
            )}
          </span>
          <button type="button" onClick={() => setOpen(true)} style={{ ...btn, padding: '5px 10px', fontSize: '13px' }}>{t('expenses.open')}</button>
        </>
      ) : (
        <>
          <span style={{ flex: '1 1 160px', color: colors.muted }}>{t('expenses.linkedNone')}</span>
          <button type="button" onClick={() => setOpen(true)} style={{ ...btn, padding: '5px 10px', fontSize: '13px' }}><Plus size={12} /> {t('expenses.addInvoice')}</button>
        </>
      )}
      {open && (
        <ExpenseForm orgId={orgId} expense={expense || null} onClose={() => setOpen(false)} onSaved={load}
          preset={{ ...preset, link_kind: kind, link_id: id, amount_net: preset.amount_net ?? planned ?? undefined }} />
      )}
    </div>
  )
}
