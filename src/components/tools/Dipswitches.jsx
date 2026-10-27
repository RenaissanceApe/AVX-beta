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
  const w = big ? 34 : 24, h = big ? 64 : 46
  const summary = switchesOn(address, layout)
  const describe = summary.length ? t('dip.onList', { list: summary.join(', ') }) : t('dip.allOff')
  return (
    <div role="group" aria-label={t('dip.label', { address, state: describe })}
      style={{ display: 'inline-flex', gap: big ? '6px' : '4px', padding: big ? '12px' : '8px', borderRadius: '10px', background: '#C8102E', maxWidth: '100%', overflowX: 'auto' }}>
      {order.map(i => {
        const isOn = on[i]
        const up = layout.onUp ? isOn : !isOn
        const fn = values[i] === 0
        const body = (
          <>
            <span aria-hidden="true" style={{ fontSize: big ? '11px' : '9px', color: '#fff', fontWeight: 700, opacity: 0.9 }}>{fn ? '—' : values[i]}</span>
            <span aria-hidden="true" style={{ position: 'relative', width: `${w}px`, height: `${h}px`, borderRadius: '5px', background: '#2A2A2A', display: 'block' }}>
              <span style={{ position: 'absolute', left: '3px', right: '3px', height: `${h / 2 - 3}px`, top: up ? '3px' : `${h / 2}px`, borderRadius: '3px', background: '#F4F4F4' }} />
            </span>
            <span aria-hidden="true" style={{ fontSize: big ? '13px' : '11px', color: '#fff', fontWeight: 800 }}>{i + 1}</span>
          </>
        )
        const style = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: onToggle && !fn ? 'pointer' : 'default' }
        return onToggle && !fn ? (
          <button key={i} type="button" onClick={() => onToggle(i)} aria-pressed={isOn} aria-label={t('dip.switch', { n: i + 1, value: values[i] })} style={style}>{body}</button>
        ) : (
          <span key={i} style={style}>{body}</span>
        )
      })}
      <span style={{ alignSelf: 'center', color: '#fff', fontSize: big ? '12px' : '10px', fontWeight: 800, writingMode: 'vertical-rl', transform: 'rotate(180deg)', marginLeft: '2px' }} aria-hidden="true">
        {layout.onUp ? '↑ ON' : '↓ ON'}
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
