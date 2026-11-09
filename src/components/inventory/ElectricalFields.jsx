import { Plus, Trash2 } from 'lucide-react'
import { CONNECTORS, OUTPUT_PHASES, PHASES, ELECTRICAL_FIELDS, electricalProblems, newId } from '../../lib/power'
import { t } from '../../i18n'
import { input, label, btn, iconBtn, colors } from '../ui'
import { HintLabel } from '../help/HelpParts'

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }
const select = { ...input, cursor: 'pointer' }
const HINTS = { power_factor: 'power-factor', inrush_a: 'power-inrush', current_a: 'power-datasheet-amps', current_v: 'power-datasheet-amps' }

// The electrical part of the catalogue item form (P1): watts typical (max is the main form's
// power), power factor, inrush, the amps a datasheet gives instead of watts (D77) with their
// voltage, connectors, and for a distro its input and outputs (connector, phase, breaker, RCD).
// power_w comes from the main form, to check typical isn't above it.
export default function ElectricalFields({ form, setForm, powerW }) {
  const problems = electricalProblems({ ...form, power_w: powerW })
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))
  const setOut = (id, patch) => setForm(f => ({ ...f, outputs: f.outputs.map(o => (o.id === id ? { ...o, ...patch } : o)) }))
  const open = ELECTRICAL_FIELDS.some(f => String(form[f.key] || '').trim()) || form.connector_in || form.is_distro
  const err = key => problems[key] && <span id={`el-${key}-err`} style={{ display: 'block', fontSize: '13px', color: colors.danger, marginTop: '4px' }}>{t(`power.err.${problems[key]}`)}</span>

  return (
    <details open={Boolean(open)} style={{ border: '1px solid var(--line)', padding: '12px' }}>
      <summary style={{ cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>{t('power.itemSection')}</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{t('power.itemNote')}</p>
        <div style={grid}>
          {ELECTRICAL_FIELDS.map(f => {
            const id = `el-${f.key}`
            return (
              <div key={f.key}>
                {HINTS[f.key] ? <HintLabel htmlFor={id} hint={HINTS[f.key]}>{t(`power.field.${f.key}`)}</HintLabel> : <label style={label} htmlFor={id}>{t(`power.field.${f.key}`)}</label>}
                <input id={id} inputMode="decimal" value={form[f.key]} onChange={set(f.key)} aria-invalid={Boolean(problems[f.key])}
                  aria-describedby={problems[f.key] ? `${id}-err` : undefined} style={input} />
                {err(f.key)}
              </div>
            )
          })}
          {['connector_in', 'connector_out'].map(k => (
            <div key={k}>
              <label style={label} htmlFor={`el-${k}`}>{t(`power.field.${k}`)}</label>
              <select id={`el-${k}`} value={form[k]} onChange={set(k)} style={select}>
                <option value="">—</option>
                {CONNECTORS.map(c => <option key={c.id} value={c.id}>{t(`power.conn.${c.id}`)}</option>)}
              </select>
            </div>
          ))}
        </div>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' }}>
          <input type="checkbox" checked={form.is_distro} onChange={e => setForm(f => ({ ...f, is_distro: e.target.checked,
            outputs: e.target.checked && !f.outputs.length ? [{ id: newId('o'), label: '', connector: 'schuko', phase: 'L1', breaker_a: 16, rcd_ma: 30 }] : f.outputs }))} style={{ width: '20px', height: '20px' }} />
          {t('power.isDistro')}
        </label>
        {form.is_distro && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ width: '200px' }}>
              <label style={label} htmlFor="el-distro-in">{t('power.input')}</label>
              <select id="el-distro-in" value={form.distro_in} onChange={set('distro_in')} style={select}>
                <option value="">—</option>
                {CONNECTORS.map(c => <option key={c.id} value={c.id}>{t(`power.conn.${c.id}`)}</option>)}
              </select>
            </div>
            <ul aria-label={t('power.itemOutputs')} style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {form.outputs.map((o, i) => {
                const id = `el-o${i}`
                return (
                  <li key={o.id} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', borderTop: '1px solid var(--line)', paddingTop: '8px' }}>
                    <div style={{ width: '110px' }}>
                      <label style={label} htmlFor={`${id}-l`}>{t('power.outputLabel')}</label>
                      <input id={`${id}-l`} value={o.label} maxLength={30} placeholder={t('power.outputN', { n: i + 1 })} onChange={e => setOut(o.id, { label: e.target.value })} style={input} />
                    </div>
                    <div style={{ width: '150px' }}>
                      <label style={label} htmlFor={`${id}-c`}>{t('power.connector')}</label>
                      <select id={`${id}-c`} value={o.connector} onChange={e => setOut(o.id, { connector: e.target.value })} style={select}>
                        {CONNECTORS.map(c => <option key={c.id} value={c.id}>{t(`power.conn.${c.id}`)}</option>)}
                      </select>
                    </div>
                    <div style={{ width: '80px' }}>
                      <label style={label} htmlFor={`${id}-p`}>{t('power.phase')}</label>
                      <select id={`${id}-p`} value={o.phase} onChange={e => setOut(o.id, { phase: e.target.value })} style={select}>
                        {OUTPUT_PHASES.map(ph => <option key={ph} value={ph}>{ph}</option>)}
                      </select>
                    </div>
                    <div style={{ width: '80px' }}>
                      <label style={label} htmlFor={`${id}-b`}>{t('power.breaker')}</label>
                      <input id={`${id}-b`} type="number" min={1} max={6300} value={o.breaker_a ?? ''} onChange={e => setOut(o.id, { breaker_a: e.target.value === '' ? null : e.target.value })} style={input} />
                    </div>
                    <div style={{ width: '80px' }}>
                      <label style={label} htmlFor={`${id}-r`}>{t('power.rcd')}</label>
                      <input id={`${id}-r`} type="number" min={1} max={1000} value={o.rcd_ma ?? ''} onChange={e => setOut(o.id, { rcd_ma: e.target.value === '' ? null : e.target.value })} style={input} />
                    </div>
                    <button type="button" onClick={() => setForm(f => ({ ...f, outputs: f.outputs.filter(x => x.id !== o.id) }))}
                      aria-label={t('power.removeOutput', { name: o.label || t('power.outputN', { n: i + 1 }) })} style={iconBtn}><Trash2 size={14} aria-hidden="true" /></button>
                  </li>
                )
              })}
            </ul>
            {form.outputs.length === 0 && <p style={{ fontSize: '13px', color: 'var(--warn)' }}>{t('power.err.noOutputs')}</p>}
            {form.outputs.length < 48 && (
              <button type="button" onClick={() => setForm(f => ({ ...f, outputs: [...f.outputs, { id: newId('o'), label: '', connector: 'schuko', phase: PHASES[f.outputs.length % 3], breaker_a: 16, rcd_ma: 30 }] }))} style={{ ...btn, alignSelf: 'flex-start' }}>
                <Plus size={14} aria-hidden="true" /> {t('power.addOutput')}
              </button>
            )}
          </div>
        )}
      </div>
    </details>
  )
}
