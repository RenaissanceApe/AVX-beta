import { useEffect, useState } from 'react'
import { Plus, Wrench } from 'lucide-react'
import { logger } from '../../lib/logger'
import { useI18n, translate } from '../../i18n'
import { btn, colors } from '../ui'
import { Hint } from '../help/HelpParts'
import { formatMoney } from '../../lib/quotes'
import { repairLine, repairsToBill } from '../../lib/payments'
import { loadChargedRepairs } from '../../lib/invoiceApi'

// In a gig's invoice draft (step 12): the gig's repairs marked "charge the client" that no other
// invoice bills yet, each with "Add to invoice". The line starts at the repair's cost (editable in
// the draft) and points to the repair, so saving the draft bills it once.
export default function ChargedRepairs({ gigId, invoiceId, lines, language, currency, vatRate, onAdd }) {
  const { t, lang } = useI18n()
  const [repairs, setRepairs] = useState(null)
  useEffect(() => {
    let live = true
    loadChargedRepairs(gigId)
      .then(rs => { if (live) setRepairs(rs) })
      .catch(error => { logger.error('payments', error, { step: 'charged_repairs' }); if (live) setRepairs([]) })
    return () => { live = false }
  }, [gigId])

  const free = repairsToBill(repairs || [], { invoiceId, lines })
  if (!free.length) return null
  const name = r => [r.item?.name, r.unit?.code].filter(Boolean).join(' ')
  const label = r => translate(language, 'invoice.repairLine', { item: name(r), problem: r.problem })
  return (
    <section aria-labelledby="inv-repairs" style={{ border: `1px solid ${colors.border}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <h3 id="inv-repairs" style={{ fontSize: '13px', fontWeight: 700, margin: 0, display: 'flex', gap: '6px', alignItems: 'center' }}>
        <Wrench size={14} aria-hidden="true" /> {t('invoice.repairsTitle', { count: free.length })} <Hint id="invoice-repairs" />
      </h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {free.map(r => (
          <li key={r.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '4px 0', fontSize: '13px' }}>
            <span style={{ flex: '1 1 180px', minWidth: 0 }}>
              {name(r)} · {r.problem}
              {r.cost != null && <span style={{ color: colors.muted }}> · {t('invoice.repairCost', { amount: formatMoney(r.cost, currency || 'EUR', lang) })}</span>}
            </span>
            <button type="button" onClick={() => onAdd(repairLine(r, { vatRate, label }))} style={{ ...btn, padding: '6px 10px' }}>
              <Plus size={14} /> {t('invoice.addRepair')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
