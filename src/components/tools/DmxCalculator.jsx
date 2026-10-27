import { useState } from 'react'
import {
  addressToSwitches, switchesToAddress, toAbsolute, fromAbsolute, blockAddresses, switchesOn,
  percentToDmx, dmxToPercent, toCoarseFine, fromCoarseFine, toHex, fromHex, readDipLayout, saveDipLayout,
} from '../../lib/dmxCalc'
import { t } from '../../i18n'
import { input, label, card, colors } from '../ui'
import Dipswitches, { DipLayoutForm } from './Dipswitches'

// The DMX calculator (docs/TOOLS_PLAN.md §3, D1): dipswitches for an address (and back), universe
// and absolute channels, addresses for a block of fixtures, and value conversions. Works offline;
// nothing is saved except the dipswitch layout, on this device.
export default function DmxCalculator() {
  const [layout, setLayout] = useState(readDipLayout)
  const changeLayout = l => { setLayout(l); saveDipLayout(l) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <AddressSection layout={layout} onLayout={changeLayout} />
      <BlockSection layout={layout} />
      <AbsoluteSection />
      <ValuesSection />
    </div>
  )
}

const num = (v, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min }
const Section = ({ id, title, children }) => (
  <section aria-labelledby={id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <h2 id={id} style={{ fontSize: '16px', fontWeight: 700 }}>{title}</h2>
    {children}
  </section>
)

function AddressSection({ layout, onLayout }) {
  const [address, setAddress] = useState(1)
  const toggle = i => {
    const on = addressToSwitches(address, layout)
    on[i] = !on[i]
    setAddress(switchesToAddress(on, layout))
  }
  return (
    <Section id="calc-dip" title={t('dip.title')}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="calc-address" style={label}>{t('dip.address')}</label>
          <input id="calc-address" type="number" inputMode="numeric" min={0} max={511} value={address}
            onChange={e => setAddress(num(e.target.value, 0, 511))} style={{ ...input, width: '110px', fontSize: '22px', fontFamily: 'var(--font-mono)' }} />
        </div>
        <p aria-live="polite" style={{ fontSize: '14px', paddingBottom: '10px' }}>
          {switchesOn(address, layout).length ? t('dip.onList', { list: switchesOn(address, layout).join(', ') }) : t('dip.allOff')}
        </p>
      </div>
      <div><Dipswitches address={address} layout={layout} onToggle={toggle} size="big" /></div>
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5 }}>{t('dip.tapHint')}</p>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>{t('dip.layout')}</summary>
        <div style={{ marginTop: '10px' }}><DipLayoutForm layout={layout} onChange={onLayout} idPrefix="calc" /></div>
        <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginTop: '8px' }}>{t('dip.layoutHint')}</p>
      </details>
    </Section>
  )
}

function BlockSection({ layout }) {
  const [form, setForm] = useState({ count: 8, footprint: 16, universe: 1, start: 1 })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const rows = blockAddresses(form)
  const fields = [['count', 1, 1024], ['footprint', 1, 512], ['universe', 0, 32767], ['start', 1, 512]]
  return (
    <Section id="calc-block" title={t('dip.blockTitle')}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {fields.map(([k, min, max]) => (
          <div key={k} style={{ flex: '1 1 110px' }}>
            <label htmlFor={`calc-${k}`} style={label}>{t(`dip.block.${k}`)}</label>
            <input id={`calc-${k}`} type="number" inputMode="numeric" min={min} max={max} value={form[k]}
              onChange={e => set(k, e.target.value)} onBlur={e => set(k, num(e.target.value, min, max))} style={input} />
          </div>
        ))}
      </div>
      <div tabIndex={0} role="region" aria-label={t('dip.blockTitle')} style={{ overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: colors.muted, fontSize: '11px', textTransform: 'uppercase' }}>
              <th style={{ padding: '4px 6px' }}>#</th><th style={{ padding: '4px 6px' }}>{t('dip.block.universe')}</th>
              <th style={{ padding: '4px 6px' }}>{t('dip.channels')}</th><th style={{ padding: '4px 6px' }}>{t('dip.switchesOn')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.n} style={{ borderTop: `1px solid ${colors.border}` }}>
                <td style={{ padding: '4px 6px' }}>{r.n}</td>
                <td style={{ padding: '4px 6px' }}>{r.universe}{r.jumped && <span style={{ color: 'var(--warn)', fontSize: '11px' }}> · {t('dip.newUniverse')}</span>}</td>
                <td style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.address}–{r.end}</td>
                <td style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)' }}>{r.address <= 511 ? switchesOn(r.address, layout).join(' ') || '—' : t('dip.over511')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function AbsoluteSection() {
  const [zeroBased, setZeroBased] = useState(false)
  const [ua, setUa] = useState({ universe: 2, address: 1 })
  const [abs, setAbs] = useState(1024)
  const absolute = toAbsolute(Number(ua.universe), Number(ua.address), { zeroBased })
  const back = fromAbsolute(Number(abs), { zeroBased })
  return (
    <Section id="calc-abs" title={t('dip.absTitle')}>
      <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' }}>
        <input type="checkbox" checked={zeroBased} onChange={e => setZeroBased(e.target.checked)} /> {t('dip.zeroBased')}
      </label>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 100px' }}>
          <label htmlFor="calc-u" style={label}>{t('dip.block.universe')}</label>
          <input id="calc-u" type="number" inputMode="numeric" value={ua.universe} onChange={e => setUa(x => ({ ...x, universe: e.target.value }))} style={input} />
        </div>
        <div style={{ flex: '1 1 100px' }}>
          <label htmlFor="calc-a" style={label}>{t('dip.address')}</label>
          <input id="calc-a" type="number" inputMode="numeric" value={ua.address} onChange={e => setUa(x => ({ ...x, address: e.target.value }))} style={input} />
        </div>
        <p aria-live="polite" style={{ flex: '1 1 140px', paddingBottom: '10px', fontSize: '14px' }}>
          {absolute ? t('dip.isAbsolute', { n: absolute }) : t('dip.invalid')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 100px' }}>
          <label htmlFor="calc-abs-in" style={label}>{t('dip.absolute')}</label>
          <input id="calc-abs-in" type="number" inputMode="numeric" value={abs} onChange={e => setAbs(e.target.value)} style={input} />
        </div>
        <p aria-live="polite" style={{ flex: '2 1 200px', paddingBottom: '10px', fontSize: '14px' }}>
          {back ? t('dip.isUniverseAddress', back) : t('dip.invalid')}
        </p>
      </div>
    </Section>
  )
}

function ValuesSection() {
  const [pct, setPct] = useState(50)
  const [val, setVal] = useState(128)
  const [wide, setWide] = useState(32768)
  const [hex, setHex] = useState('FF')
  const cf = toCoarseFine(wide)
  const fromH = fromHex(hex)
  const row = (id, text, value, onChange, out, width = '110px') => (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div>
        <label htmlFor={id} style={label}>{text}</label>
        <input id={id} value={value} onChange={e => onChange(e.target.value)} inputMode={id === 'calc-hex' ? 'text' : 'numeric'} style={{ ...input, width }} />
      </div>
      <p aria-live="polite" style={{ paddingBottom: '10px', fontSize: '14px', fontFamily: 'var(--font-mono)' }}>{out}</p>
    </div>
  )
  return (
    <Section id="calc-values" title={t('dip.valuesTitle')}>
      {row('calc-pct', t('dip.percent'), pct, setPct, `= ${percentToDmx(pct)} · 0x${toHex(percentToDmx(pct))}`)}
      {row('calc-val', t('dip.value'), val, setVal, `= ${dmxToPercent(val)} % · 0x${toHex(val)}`)}
      {row('calc-16', t('dip.sixteen'), wide, setWide, t('dip.coarseFine', { coarse: cf.coarse, fine: cf.fine, back: fromCoarseFine(cf.coarse, cf.fine) }))}
      {row('calc-hex', t('dip.hex'), hex, setHex, fromH === null ? t('dip.invalid') : `= ${fromH} · ${dmxToPercent(fromH)} %`)}
    </Section>
  )
}
