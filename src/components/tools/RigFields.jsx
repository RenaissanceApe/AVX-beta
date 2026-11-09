import { input, label } from '../ui'
import { HintLabel } from '../help/HelpParts'

// Small form fields shared by the rigging tool's truss lines (RG1) and line arrays (RG3)
// A number saved when the field is left, within its limits; `empty` lets it be cleared (null)
export function NumberField({ id, text, hint, value, range, step, disabled, placeholder, empty, onSave }) {
  const [min, max] = range
  return (
    <div style={{ minWidth: '96px' }}>
      {hint ? <HintLabel htmlFor={id} hint={hint}>{text}</HintLabel> : <label style={label} htmlFor={id}>{text}</label>}
      <input id={id} type="number" min={min} max={max} step={step} defaultValue={value ?? ''} key={`${id}${value}`} disabled={disabled} placeholder={placeholder} style={input}
        onBlur={e => {
          if (e.target.value === '') { if (empty && value !== null) onSave(null); return }
          const v = Math.min(max, Math.max(min, Number(e.target.value)))
          if (Number.isFinite(v) && v !== value) onSave(v)
        }} />
    </div>
  )
}

export function TextField({ id, text, value, onSave, max = 40, span = 2 }) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={label} htmlFor={id}>{text}</label>
      <input id={id} maxLength={max} defaultValue={value} key={`${id}${value}`} style={input}
        onBlur={e => { const v = e.target.value.trim(); if (v !== value) onSave(v) }} />
    </div>
  )
}

export function Check({ id, text, hint, checked, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minHeight: '40px' }}>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {hint ? <HintLabel htmlFor={id} hint={hint}>{text}</HintLabel> : <label htmlFor={id} style={{ fontSize: '13px' }}>{text}</label>}
    </div>
  )
}
