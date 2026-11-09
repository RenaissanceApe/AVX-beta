import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { suggestPlacement, DEFAULT_RESERVE } from '../../lib/powerBalance'
import { placeLabel, ampsLine } from '../../lib/powerPdf'
import { track } from '../../lib/usage'
import { t } from '../../i18n'
import { Modal, btn, btnPrimary, input, label, card, colors } from '../ui'
import { HintLabel } from '../help/HelpParts'

const small = { fontSize: '13px', color: colors.muted, lineHeight: 1.5 }

// The placement suggestion (P2): balance the phases, or fill each output up to a reserve of its
// breaker. Everything it would change is listed before it's applied; nothing changes until then.
export default function BalanceModal({ p, onApply, onClose }) {
  const { loads, distros, supply, assign, plan } = p
  const [mode, setMode] = useState('balance')
  const [reserve, setReserve] = useState(DEFAULT_RESERVE)
  const [movePlugged, setMovePlugged] = useState(false)
  const s = useMemo(() => suggestPlacement({ loads, distros, supply, assign, plan, mode, reserve, movePlugged }), [loads, distros, supply, assign, plan, mode, reserve, movePlugged])
  const nameOf = key => loads.find(l => l.key === key)?.name || '—'

  return (
    <Modal title={t('balance.title')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={small}>{t('balance.note')}</p>
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <legend style={{ ...label, marginBottom: '4px' }}>{t('balance.how')}</legend>
          {['balance', 'reserve'].map(m => (
            <label key={m} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px' }}>
              <input type="radio" name="balance-mode" value={m} checked={mode === m} onChange={() => setMode(m)} style={{ width: '20px', height: '20px', flexShrink: 0 }} />
              <span><strong>{t(`balance.mode.${m}`)}</strong><br /><span style={small}>{t(`balance.modeNote.${m}`)}</span></span>
            </label>
          ))}
        </fieldset>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ width: '130px' }}>
            <HintLabel htmlFor="bal-reserve" hint="power-reserve">{t('balance.reserve')}</HintLabel>
            <input id="bal-reserve" type="number" min={10} max={100} step={5} value={reserve} onChange={e => { const v = Math.round(Number(e.target.value)); if (v >= 10 && v <= 100) setReserve(v) }} style={input} />
          </div>
          <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', flex: '1 1 200px' }}>
            <input type="checkbox" checked={movePlugged} onChange={e => setMovePlugged(e.target.checked)} style={{ width: '20px', height: '20px' }} /> {t('balance.movePlugged')}
          </label>
        </div>

        <section aria-labelledby="bal-result" style={{ ...card, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 id="bal-result" style={{ fontSize: '14px', fontWeight: 700 }}>{t('balance.result')}</h3>
          <p style={{ fontSize: '13px' }}>{t('balance.before', { amps: ampsLine(s.before, supply.phases) })}{supply.phases === 3 ? ` · ${t('power.balance', { pct: s.balanceBefore })}` : ''}</p>
          <p style={{ fontSize: '13px' }}><strong>{t('balance.after', { amps: ampsLine(s.after, supply.phases) })}{supply.phases === 3 ? ` · ${t('power.balance', { pct: s.balanceAfter })}` : ''}</strong></p>
          {s.moves.length === 0 ? <p style={small}>{t('balance.nothing')}</p> : (
            <ul aria-label={t('balance.moves', { count: s.moves.length })} style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto' }}>
              {s.moves.map(m => (
                <li key={m.key} style={{ fontSize: '13px', borderTop: '1px solid var(--line)', paddingTop: '4px' }}>
                  <strong>{nameOf(m.key)}</strong>: {placeLabel(m.from, distros, supply, t)} → {placeLabel(m.to, distros, supply, t)}
                </li>
              ))}
            </ul>
          )}
          {s.unplaced.length > 0 && <p style={{ fontSize: '13px', color: 'var(--warn)' }}>{t('balance.unplaced', { count: s.unplaced.length, names: s.unplaced.slice(0, 8).map(nameOf).join(', ') })}</p>}
        </section>
        <p style={small}>{t('power.estimate')}</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btn}>{t('common.cancel')}</button>
          <button type="button" disabled={!s.moves.length} onClick={() => { track(`power:suggest-${mode}`); onApply(s.assign) }} style={btnPrimary}><Check size={14} aria-hidden="true" /> {t('balance.apply', { count: s.moves.length })}</button>
        </div>
      </div>
    </Modal>
  )
}
