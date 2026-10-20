import { useState } from 'react'
import { ChevronUp, ChevronDown, Copy, Trash2, Plus, AlignLeft, ChevronLeft, ChevronRight, LayoutTemplate, ListPlus } from 'lucide-react'
import { PricePickerModal } from './PriceList'
import { useI18n } from '../../i18n'
import { iconBtn, input, label, colors } from '../ui'
import { Hint, HintLabel } from '../help/HelpParts'
import {
  LINE_KINDS, UNITS, emptyLine, emptySection, lineTotal, sectionTotal, phaseTotals, formatMoney, move, newId, lineFromPriceItem,
} from '../../lib/quotes'

// One phase of a quote (like a Rentman subproject): its own dates and discount, and
// sections (like equipment / function groups) holding the priced lines.
export default function PhaseEditor({ phase, index, count, currency, priceItems = [], onChange, onMove, onDuplicate, onRemove, onSaveTemplate }) {
  const { t, lang } = useI18n()
  const totals = phaseTotals(phase)
  const set = changes => onChange({ ...phase, ...changes })
  const setSections = sections => set({ sections })
  const updateSection = (i, next) => setSections(phase.sections.map((s, j) => (j === i ? next : s)))

  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      <div className="q-phase-head">
        <div style={{ flex: '2 1 220px' }}>
          <label style={label} htmlFor="ph-name">{t('quote.phaseName')}</label>
          <input id="ph-name" value={phase.name} onChange={e => set({ name: e.target.value })} placeholder={t('quote.phaseNamePlaceholder')} maxLength={120} style={input} />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={label} htmlFor="ph-start">{t('quote.from')}</label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input id="ph-start" type="date" value={phase.start_date || ''} onChange={e => set({ start_date: e.target.value || null })} style={{ ...input, flex: 3 }} />
            <input type="time" value={phase.start_time || ''} onChange={e => set({ start_time: e.target.value || null })} aria-label={t('quote.startTime')} title={t('quote.timeOptional')} style={{ ...input, flex: 2, padding: '10px 6px' }} />
          </div>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={label} htmlFor="ph-end">{t('quote.to')}</label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input id="ph-end" type="date" value={phase.end_date || ''} min={phase.start_date || undefined} onChange={e => set({ end_date: e.target.value || null })} style={{ ...input, flex: 3 }} />
            <input type="time" value={phase.end_time || ''} onChange={e => set({ end_time: e.target.value || null })} aria-label={t('quote.endTime')} title={t('quote.timeOptional')} style={{ ...input, flex: 2, padding: '10px 6px' }} />
          </div>
        </div>
        <div style={{ flex: '0 1 100px' }}>
          <HintLabel htmlFor="ph-disc" hint="discount">{t('quote.discountPct')}</HintLabel>
          <input id="ph-disc" type="number" min="0" max="100" step="0.5" value={phase.discount_pct} onChange={e => set({ discount_pct: e.target.value })} style={input} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', margin: '10px 0 18px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: colors.soft, cursor: 'pointer', marginRight: 'auto' }}>
          <input type="checkbox" checked={phase.optional} onChange={e => set({ optional: e.target.checked })} style={{ accentColor: colors.accent }} />
          {t('quote.optionalPhase')}
        </label>
        <button onClick={() => onMove(-1)} disabled={index === 0} aria-label={t('quote.movePhaseLeft')} title={t('quote.movePhaseLeft')} style={iconBtn}><ChevronLeft size={16} /></button>
        <button onClick={() => onMove(1)} disabled={index === count - 1} aria-label={t('quote.movePhaseRight')} title={t('quote.movePhaseRight')} style={iconBtn}><ChevronRight size={16} /></button>
        <button onClick={onDuplicate} aria-label={t('quote.duplicatePhase')} title={t('quote.duplicatePhase')} style={iconBtn}><Copy size={15} /></button>
        <button onClick={onSaveTemplate} aria-label={t('quote.savePhaseTemplate')} title={t('quote.savePhaseTemplate')} style={iconBtn}><LayoutTemplate size={15} /></button>
        <button onClick={onRemove} aria-label={t('quote.removePhase')} title={t('quote.removePhase')} style={{ ...iconBtn, color: colors.danger }}><Trash2 size={15} /></button>
      </div>

      {phase.sections.map((section, i) => (
        <SectionEditor key={section.id} section={section} currency={currency} priceItems={priceItems}
          first={i === 0} last={i === phase.sections.length - 1}
          onChange={next => updateSection(i, next)}
          onMove={delta => setSections(move(phase.sections, i, delta))}
          onRemove={() => {
            if (section.lines.length && !window.confirm(t('quote.confirmRemoveSection', { name: section.name || t('quote.untitledSection') }))) return
            setSections(phase.sections.filter((_, j) => j !== i))
          }} />
      ))}

      <button onClick={() => setSections([...phase.sections, emptySection()])} className="q-add-section">
        <Plus size={14} /> {t('quote.addSection')}
      </button>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '18px', flexWrap: 'wrap', fontSize: '13px', color: colors.soft, marginTop: '14px' }}>
        <span>{t('quote.phaseSubtotal')}: <strong style={{ color: 'var(--text)' }}>{formatMoney(totals.gross, currency, lang)}</strong></span>
        {totals.discount > 0 && <span>{t('quote.discount')}: <strong style={{ color: 'var(--text)' }}>−{formatMoney(totals.discount, currency, lang)}</strong></span>}
        <span>{t('quote.phaseTotal')}: <strong style={{ color: colors.accentText }}>{formatMoney(totals.net, currency, lang)}</strong></span>
      </div>
    </div>
  )
}

function SectionEditor({ section, currency, priceItems, first, last, onChange, onMove, onRemove }) {
  const { t, lang } = useI18n()
  const [picking, setPicking] = useState(false)
  const setLines = lines => onChange({ ...section, lines })
  const updateLine = (i, next) => setLines(section.lines.map((l, j) => (j === i ? next : l)))

  return (
    <section className="q-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <input value={section.name} onChange={e => onChange({ ...section, name: e.target.value })} aria-label={t('quote.sectionName')}
          placeholder={t('quote.sectionNamePlaceholder')} maxLength={120}
          style={{ ...input, fontWeight: 700, background: 'transparent', border: '1px solid transparent', padding: '6px 8px', flex: 1 }} />
        <span style={{ fontSize: '13px', fontWeight: 700, color: colors.soft, whiteSpace: 'nowrap' }}>{formatMoney(sectionTotal(section), currency, lang)}</span>
        <button onClick={() => onMove(-1)} disabled={first} aria-label={t('quote.moveUp')} title={t('quote.moveUp')} style={iconBtn}><ChevronUp size={15} /></button>
        <button onClick={() => onMove(1)} disabled={last} aria-label={t('quote.moveDown')} title={t('quote.moveDown')} style={iconBtn}><ChevronDown size={15} /></button>
        <button onClick={onRemove} aria-label={t('quote.removeSection')} title={t('quote.removeSection')} style={iconBtn}><Trash2 size={14} /></button>
      </div>

      {section.lines.length > 0 && (
        <div className="q-line q-line-head">
          <span className="q-kind">{t('quote.col.kind')}</span>
          <span className="q-desc">{t('quote.col.description')}</span>
          <span className="q-qty">{t('quote.col.qty')}</span>
          <span className="q-unit">{t('quote.col.unit')}</span>
          <span className="q-factor">{t('quote.col.factor')} <Hint id="factor" label={t('quote.col.factor')} /></span>
          <span className="q-price">{t('quote.col.price')}</span>
          <span className="q-disc">{t('quote.col.discount')}</span>
          <span className="q-total">{t('quote.col.total')}</span>
          <span className="q-actions" />
        </div>
      )}
      {section.lines.map((line, i) => (
        <LineEditor key={line.id} line={line} currency={currency} first={i === 0} last={i === section.lines.length - 1}
          onChange={next => updateLine(i, next)}
          onMove={delta => setLines(move(section.lines, i, delta))}
          onDuplicate={() => setLines([...section.lines.slice(0, i + 1), { ...line, id: newId() }, ...section.lines.slice(i + 1)])}
          onRemove={() => setLines(section.lines.filter((_, j) => j !== i))} />
      ))}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
        {LINE_KINDS.map(kind => (
          <button key={kind} onClick={() => setLines([...section.lines, emptyLine(kind)])} className="q-add-line">
            <Plus size={12} /> {t(`lineKind.${kind}`)}
          </button>
        ))}
        <button onClick={() => setPicking(true)} className="q-add-line" style={{ color: colors.accentText, borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)' }}>
          <ListPlus size={12} /> {t('prices.fromList')}
        </button>
      </div>
      {picking && (
        <PricePickerModal items={priceItems} onClose={() => setPicking(false)}
          onPick={picked => { setLines([...section.lines, ...picked.map(lineFromPriceItem)]); setPicking(false) }} />
      )}
    </section>
  )
}

function LineEditor({ line, currency, first, last, onChange, onMove, onDuplicate, onRemove }) {
  const { t, lang } = useI18n()
  const [showDetails, setShowDetails] = useState(!!line.details)
  const set = changes => onChange({ ...line, ...changes })
  const isComment = line.kind === 'comment'

  return (
    <div className="q-line-wrap">
      <div className={`q-line${isComment ? ' q-comment' : ''}`}>
        <Cell className="q-kind" label={t('quote.col.kind')}>
          <select value={line.kind} onChange={e => set({ kind: e.target.value })} aria-label={t('quote.col.kind')} style={{ ...input, padding: '7px 6px', cursor: 'pointer' }}>
            {LINE_KINDS.map(k => <option key={k} value={k}>{t(`lineKind.${k}`)}</option>)}
          </select>
        </Cell>
        <Cell className="q-desc" label={t('quote.col.description')}>
          <input value={line.description} onChange={e => set({ description: e.target.value })} aria-label={t('quote.col.description')}
            placeholder={isComment ? t('quote.commentPlaceholder') : t('quote.descriptionPlaceholder')} maxLength={300} style={{ ...input, padding: '7px 9px' }} />
        </Cell>
        {!isComment && (
          <>
            <Cell className="q-qty" label={t('quote.col.qty')}>
              <input type="number" step="any" min="0" value={line.qty} onChange={e => set({ qty: e.target.value })} aria-label={t('quote.col.qty')} style={numInput} />
            </Cell>
            <Cell className="q-unit" label={t('quote.col.unit')}>
              <select value={line.unit} onChange={e => set({ unit: e.target.value })} aria-label={t('quote.col.unit')} style={{ ...input, padding: '7px 4px', cursor: 'pointer' }}>
                {UNITS.map(u => <option key={u} value={u}>{t(`unit.${u}`, { count: Number(line.qty) })}</option>)}
              </select>
            </Cell>
            <Cell className="q-factor" label={t('quote.col.factor')}>
              <input type="number" step="any" min="0" value={line.factor} onChange={e => set({ factor: e.target.value })} aria-label={t('quote.col.factor')} title={t('quote.factorHint')} style={numInput} />
            </Cell>
            <Cell className="q-price" label={t('quote.col.price')}>
              <input type="number" step="0.01" min="0" value={line.unit_price} onChange={e => set({ unit_price: e.target.value })} aria-label={t('quote.col.price')} style={numInput} />
            </Cell>
            <Cell className="q-disc" label={t('quote.col.discount')}>
              <input type="number" step="0.5" min="0" max="100" value={line.discount_pct} onChange={e => set({ discount_pct: e.target.value })} aria-label={t('quote.col.discount')} style={numInput} />
            </Cell>
            <Cell className="q-total" label={t('quote.col.total')}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '13px', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoney(lineTotal(line), currency, lang)}</span>
            </Cell>
          </>
        )}
        <span className="q-actions" style={{ display: 'flex' }}>
          <button onClick={() => setShowDetails(s => !s)} aria-label={t('quote.lineDetails')} title={t('quote.lineDetails')} aria-pressed={showDetails} style={{ ...iconBtn, color: line.details ? colors.accentText : colors.muted }}><AlignLeft size={14} /></button>
          <LineMenu first={first} last={last} onMove={onMove} onDuplicate={onDuplicate} onRemove={onRemove} />
        </span>
      </div>
      {showDetails && (
        <textarea value={line.details} onChange={e => set({ details: e.target.value })} aria-label={t('quote.lineDetails')}
          placeholder={t('quote.detailsPlaceholder')} rows={2} maxLength={1000}
          style={{ ...input, marginTop: '4px', fontSize: '13px', resize: 'vertical', lineHeight: 1.5 }} />
      )}
    </div>
  )
}

// One field of a line. On narrow screens the column headings are hidden, so each
// field shows its own small label instead.
function Cell({ className, label, children }) {
  return (
    <div className={`q-cell ${className}`}>
      <span className="q-cell-label" aria-hidden="true">{label}</span>
      {children}
    </div>
  )
}

function LineMenu({ first, last, onMove, onDuplicate, onRemove }) {
  const { t } = useI18n()
  return (
    <>
      <button onClick={() => onMove(-1)} disabled={first} aria-label={t('quote.moveUp')} title={t('quote.moveUp')} style={iconBtn} className="q-hide-narrow"><ChevronUp size={14} /></button>
      <button onClick={() => onMove(1)} disabled={last} aria-label={t('quote.moveDown')} title={t('quote.moveDown')} style={iconBtn} className="q-hide-narrow"><ChevronDown size={14} /></button>
      <button onClick={onDuplicate} aria-label={t('quote.duplicateLine')} title={t('quote.duplicateLine')} style={iconBtn}><Copy size={13} /></button>
      <button onClick={onRemove} aria-label={t('quote.removeLine')} title={t('quote.removeLine')} style={iconBtn}><Trash2 size={13} /></button>
    </>
  )
}

const numInput = { ...input, padding: '7px 6px', textAlign: 'right' }

// Layout for the line grid: one row on wide screens, two rows on phones.
export const QUOTE_EDITOR_CSS = `
  .q-header { position: sticky; top: var(--safe-top); }
  /* Phones (portrait) and short landscape screens: don't pin the tall header over the fields */
  @media (max-width: 760px), (max-height: 560px) { .q-header { position: static; } }
  .q-cell { min-width: 0; }
  .q-cell-label { display: none; }
  .q-phase-head { display: flex; gap: 10px; flex-wrap: wrap; }
  .q-section { background: color-mix(in srgb, var(--fg) min(100%, calc(2.5% * var(--line-k))), transparent); border: 1px solid color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent); border-radius: 14px; padding: 12px; margin-bottom: 12px; }
  .q-line { display: grid; grid-template-columns: 112px minmax(140px,1fr) 64px 82px 58px 92px 58px 96px auto; gap: 6px; align-items: center; }
  .q-line.q-comment { grid-template-columns: 112px 1fr auto; }
  .q-line-head { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); padding: 0 2px 4px; }
  .q-line-head .q-total, .q-line-head .q-qty, .q-line-head .q-factor, .q-line-head .q-price, .q-line-head .q-disc { text-align: right; }
  .q-line-wrap { padding: 4px 0; border-top: 1px solid color-mix(in srgb, var(--fg) min(100%, calc(4% * var(--line-k))), transparent); }
  .q-add-line, .q-add-section { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
    background: transparent; color: var(--soft); border: 1px dashed color-mix(in srgb, var(--fg) min(100%, calc(14% * var(--line-k))), transparent); }
  .q-add-section { padding: 9px 14px; font-size: 13px; width: 100%; justify-content: center; }
  .q-add-line:hover, .q-add-section:hover { color: var(--accent-text); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  /* Tablets and phones in landscape: tighter columns, no up/down buttons (lines still move on desktop) */
  @media (min-width: 761px) and (max-width: 1060px) {
    .q-line { grid-template-columns: 100px minmax(100px,1fr) 50px 70px 48px 74px 48px 82px auto; gap: 4px; }
    .q-line.q-comment { grid-template-columns: 100px 1fr auto; }
    .q-hide-narrow { display: none !important; }
  }
  @media (max-width: 760px) {
    .q-line-head { display: none; }
    .q-line { grid-template-columns: 1.25fr 1fr 1fr 1fr; grid-template-areas: "kind desc desc desc" "qty unit factor price" "disc total total actions"; }
    .q-line.q-comment { grid-template-columns: 1.25fr 1fr 1fr 1fr; grid-template-areas: "kind desc desc desc" ". . . actions"; }
    .q-kind { grid-area: kind; } .q-desc { grid-area: desc; } .q-qty { grid-area: qty; } .q-unit { grid-area: unit; }
    .q-factor { grid-area: factor; } .q-price { grid-area: price; } .q-disc { grid-area: disc; } .q-total { grid-area: total; }
    .q-actions { grid-area: actions; justify-content: flex-end; }
    .q-hide-narrow { display: none !important; }
    .q-line-wrap { padding: 10px 0; }
    .q-line { row-gap: 8px; align-items: end; }
    .q-cell-label { display: block; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 0 0 3px 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .q-total .q-cell-label { text-align: right; }
  }
`
