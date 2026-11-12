import { AlertTriangle, CheckCircle2, CircleHelp, Trash2 } from 'lucide-react'
import { bridle, BRIDLE_LIMITS, WARN_ANGLE } from '../../lib/bridle'
import { t } from '../../i18n'
import { input, label, iconBtn, card, colors } from '../ui'
import { HintLabel } from '../help/HelpParts'
import { NumberField, TextField } from './RigFields'

const legColour = s => (s === 'over' ? colors.danger : s === 'near' ? colors.warn : s === 'ok' ? colors.accentText : colors.muted)
const LEG_ICON = { ok: CheckCircle2, near: AlertTriangle, over: AlertTriangle, noWll: CircleHelp }

// One bridle (RG2): two legs from two beam points to a pick point. Used in the pocket tools (the
// leg WLLs typed) and in a gig's rigging tool (each leg picks its weakest piece from the gig's
// hardware list). `value` holds span, rise, mode, leg1/leg2 or x/depth, load and wll1/wll2 or
// hw1/hw2.
export default function BridleCard({ value, onChange, hardware = null, canEdit = true, idPrefix, onRemove }) {
  const byId = Object.fromEntries((hardware || []).map(h => [h.id, h]))
  const wll = n => (hardware ? byId[value[`hw${n}`]]?.wll_kg ?? null : value[`wll${n}`])
  const r = bridle({ ...value, wll1: wll(1), wll2: wll(2) })
  const f = k => `${idPrefix}-${k}`
  const small = { fontSize: '13px', lineHeight: 1.5 }
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px', alignItems: 'end' }

  return (
    <article aria-labelledby={f('title')} style={{ ...card, padding: '12px', borderColor: r.over || r.overAngle ? 'var(--danger)' : undefined }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '8px' }}>
        <h4 id={f('title')} style={{ fontSize: '16px', fontWeight: 700 }}>{value.name || t('bridle.title')}</h4>
        {onRemove && canEdit && <button type="button" onClick={onRemove} aria-label={t('inputs.remove', { name: value.name || t('bridle.title') })} style={{ ...iconBtn, marginLeft: 'auto' }}><Trash2 size={14} /></button>}
      </div>
      {canEdit && (
        <>
          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 8px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px' }}>
            <legend style={{ ...label, marginBottom: '4px' }}>{t('bridle.setBy')}</legend>
            {['legs', 'point'].map(m => (
              <label key={m} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="radio" name={f('mode')} checked={value.mode === m} onChange={() => onChange({ mode: m })} /> {t(`bridle.mode.${m}`)}
              </label>
            ))}
          </fieldset>
          <div style={grid}>
            {hardware && <TextField id={f('name')} text={t('bridle.name')} value={value.name || ''} onSave={v => onChange({ name: v })} />}
            <NumberField id={f('span')} hint="bridle-span" text={t('bridle.span')} value={value.span} range={BRIDLE_LIMITS.span} step={0.1} onSave={v => onChange({ span: v })} />
            <NumberField id={f('rise')} hint="bridle-rise" text={t('bridle.rise')} value={value.rise} range={BRIDLE_LIMITS.rise} step={0.1} onSave={v => onChange({ rise: v })} />
            {value.mode === 'point' ? (
              <>
                <NumberField id={f('x')} text={t('bridle.x')} value={value.x} empty range={[0, BRIDLE_LIMITS.span[1]]} step={0.1} onSave={v => onChange({ x: v })} />
                <NumberField id={f('depth')} hint="bridle-depth" text={t('bridle.depth')} value={value.depth} empty range={BRIDLE_LIMITS.depth} step={0.1} onSave={v => onChange({ depth: v })} />
              </>
            ) : (
              <>
                <NumberField id={f('leg1')} text={t('bridle.leg1')} value={value.leg1} empty range={BRIDLE_LIMITS.leg} step={0.05} onSave={v => onChange({ leg1: v })} />
                <NumberField id={f('leg2')} text={t('bridle.leg2')} value={value.leg2} empty range={BRIDLE_LIMITS.leg} step={0.05} onSave={v => onChange({ leg2: v })} />
              </>
            )}
            <NumberField id={f('load')} hint="bridle-load" text={t('bridle.load')} value={value.load} range={BRIDLE_LIMITS.load} step={1} onSave={v => onChange({ load: v })} />
            {[1, 2].map(n => (hardware ? (
              <div key={n} style={{ gridColumn: 'span 2' }}>
                <HintLabel htmlFor={f(`hw${n}`)} hint="bridle-hardware">{t('bridle.hardware', { n })}</HintLabel>
                <select id={f(`hw${n}`)} value={value[`hw${n}`] || ''} onChange={e => onChange({ [`hw${n}`]: e.target.value || null })} style={{ ...input, appearance: 'auto' }}>
                  <option value="">{t('bridle.noHardware')}</option>
                  {hardware.map(h => <option key={h.id} value={h.id}>{h.name || t(`hw.kind.${h.kind}`)}{h.wll_kg ? ` · ${t('rig.wllKg', { kg: h.wll_kg })}` : ''}</option>)}
                </select>
              </div>
            ) : (
              <NumberField key={n} id={f(`wll${n}`)} hint="bridle-hardware" text={t('bridle.wll', { n })} value={value[`wll${n}`] ?? null} empty range={BRIDLE_LIMITS.wll} step={1} onSave={v => onChange({ [`wll${n}`]: v })} />
            )))}
          </div>
        </>
      )}

      {r.problem ? (
        <p role="status" style={{ ...small, color: colors.warn, marginTop: '8px' }}>{t(`bridle.problem.${r.problem}`)}</p>
      ) : (
        <div style={{ marginTop: '8px' }}>
          <BridleSvg span={value.span} rise={value.rise || 0} pick={r.pick} warn={r.overAngle} />
          <p style={{ ...small, fontWeight: 700 }}>{t('bridle.angle', { deg: r.included })}</p>
          {r.overAngle && (
            <p role="alert" style={{ ...small, color: colors.danger, display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
              <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: '3px' }} /> {t('bridle.overAngle', { max: WARN_ANGLE })}
            </p>
          )}
          <p style={{ ...small, color: colors.soft }}>{t('bridle.pickAt', { x: r.pick.x, depth: r.pick.depth })}</p>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {r.legs.map((l, i) => {
              const Icon = LEG_ICON[l.status]
              return (
                <li key={i} style={small}>
                  <strong>{t('bridle.legN', { n: i + 1 })}</strong>{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{t('bridle.legLine', { m: l.length, deg: l.angle, kg: l.tension })}</span>
                  <span style={{ display: 'flex', gap: '4px', alignItems: 'center', color: legColour(l.status) }}>
                    <Icon size={13} aria-hidden="true" /> {t(`bridle.leg.${l.status}`, { use: l.use !== null ? Math.round(l.use * 100) : 0, wll: l.wll })}
                  </span>
                </li>
              )
            })}
          </ul>
          <p style={{ ...small, color: colors.soft, marginTop: '4px' }}>{t('bridle.horizontal', { kg: r.horizontal })}</p>
        </div>
      )}
      <p style={{ ...small, color: colors.muted, marginTop: '6px' }}>{t('bridle.aid')}</p>
    </article>
  )
}

// A schematic side view: the two beam points, the legs and the pick point (to scale)
function BridleSvg({ span, rise, pick, warn }) {
  const top = -Math.max(0, rise), bottom = pick.depth
  const pad = Math.max(span, bottom - top) * 0.08
  const vb = [-pad, top - pad, span + 2 * pad, bottom - top + 2 * pad]
  const w = Math.max(span, bottom - top) / 120
  return (
    <svg viewBox={vb.join(' ')} role="img" aria-label={t('bridle.drawing')} style={{ width: '100%', maxWidth: '280px', height: 'auto', maxHeight: '160px', display: 'block', marginBottom: '6px' }}>
      <line x1={-pad} y1={0} x2={pad * 0.6} y2={0} stroke="var(--line)" strokeWidth={w * 3} />
      <line x1={span - pad * 0.6} y1={-rise} x2={span + pad} y2={-rise} stroke="var(--line)" strokeWidth={w * 3} />
      <polyline points={`0,0 ${pick.x},${pick.depth} ${span},${-rise}`} fill="none" stroke={warn ? 'var(--danger)' : 'var(--text)'} strokeWidth={w * 1.5} />
      <circle cx={pick.x} cy={pick.depth} r={w * 3} fill="var(--text)" />
      <circle cx={0} cy={0} r={w * 2.5} fill="var(--text)" />
      <circle cx={span} cy={-rise} r={w * 2.5} fill="var(--text)" />
    </svg>
  )
}
