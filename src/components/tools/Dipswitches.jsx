import { addressToSwitches, switchValues, switchesOn } from '../../lib/dmxCalc'
import { t } from '../../i18n'
import { colors } from '../ui'

// A bank of DIP switches as the fixture shows it (docs/TOOLS_PLAN.md §3, D1): switch order, ON
// direction and values follow the person's layout. With onToggle, tapping a switch flips it.
export default function Dipswitches({ address, layout, onToggle, size = 'normal' }) {
  const on = addressToSwitches(address, layout)
  const values = switchValues(layout)
  const order = on.map((_, i) => i)
  if (!layout.firstLeft) order.reverse()
  const big = size === 'big'
  const h = big ? 64 : 46
  const summary = switchesOn(address, layout)
  const describe = summary.length ? t('dip.onList', { list: summary.join(', ') }) : t('dip.allOff')
  return (
    <div role="group" aria-label={t('dip.label', { address, state: describe })}
      style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: big ? '12px 10px 8px' : '8px 8px 6px', borderRadius: '10px', background: '#C8102E', width: '100%', maxWidth: big ? '460px' : '320px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: big ? '5px' : '3px' }}>
      {order.map(i => {
        const isOn = on[i]
        const up = layout.onUp ? isOn : !isOn
        const fn = values[i] === 0
        const body = (
          <>
            <span aria-hidden="true" style={{ fontSize: big ? '11px' : '9px', color: '#fff', fontWeight: 700, opacity: 0.9 }}>{fn ? '—' : values[i]}</span>
            <span aria-hidden="true" style={{ position: 'relative', width: '100%', height: `${h}px`, borderRadius: '5px', background: '#2A2A2A', display: 'block' }}>
              <span style={{ position: 'absolute', left: '3px', right: '3px', height: `${h / 2 - 3}px`, top: up ? '3px' : `${h / 2}px`, borderRadius: '3px', background: '#F4F4F4' }} />
            </span>
            <span aria-hidden="true" style={{ fontSize: big ? '13px' : '11px', color: '#fff', fontWeight: 800 }}>{i + 1}</span>
          </>
        )
        const style = { position: 'relative', flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: onToggle && !fn ? 'pointer' : 'default' }
        return onToggle && !fn ? (
          <button key={i} type="button" onClick={() => onToggle(i)} aria-pressed={isOn} style={style}>
            {body}
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{t('dip.switch', { n: i + 1, value: values[i] })}</span>
          </button>
        ) : (
          <span key={i} style={style}>{body}</span>
        )
      })}
      </div>
      <span style={{ color: '#fff', fontSize: big ? '12px' : '10px', fontWeight: 800, textAlign: layout.firstLeft ? 'left' : 'right' }} aria-hidden="true">
        {layout.onUp ? 'ON ↑' : 'ON ↓'}
      </span>
    </div>
  )
}

// The layout options: how this person's fixtures show their switches (kept on this device)
export function DipLayoutForm({ layout, onChange, idPrefix = 'dip' }) {
  const set = patch => onChange({ ...layout, ...patch })
  const select = { padding: '7px 10px', borderRadius: '8px', background: 'color-mix(in srgb, var(--shade) 40%, transparent)', color: 'var(--text)', border: `1px solid ${colors.border}`, fontSize: '13px' }
  const field = (id, text, control) => (
    <label htmlFor={`${idPrefix}-${id}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: colors.muted, fontWeight: 600 }}>
      {text}{control}
    </label>
  )
  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
      {field('switches', t('dip.switches'), (
        <select id={`${idPrefix}-switches`} value={layout.switches} onChange={e => set({ switches: Number(e.target.value) })} style={select}>
          <option value={9}>9</option><option value={10}>{t('dip.tenth')}</option>
        </select>
      ))}
      {field('order', t('dip.order'), (
        <select id={`${idPrefix}-order`} value={layout.msbFirst ? 'msb' : 'lsb'} onChange={e => set({ msbFirst: e.target.value === 'msb' })} style={select}>
          <option value="lsb">{t('dip.lsb')}</option><option value="msb">{t('dip.msb')}</option>
        </select>
      ))}
      {field('on', t('dip.onIs'), (
        <select id={`${idPrefix}-on`} value={layout.onUp ? 'up' : 'down'} onChange={e => set({ onUp: e.target.value === 'up' })} style={select}>
          <option value="up">{t('dip.up')}</option><option value="down">{t('dip.down')}</option>
        </select>
      ))}
      {field('side', t('dip.side'), (
        <select id={`${idPrefix}-side`} value={layout.firstLeft ? 'left' : 'right'} onChange={e => set({ firstLeft: e.target.value === 'left' })} style={select}>
          <option value="left">{t('dip.left')}</option><option value="right">{t('dip.right')}</option>
        </select>
      ))}
    </div>
  )
}
