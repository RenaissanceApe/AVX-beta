import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { inputValue, parseInput, displayValue } from '../lib/customFields'
import { useI18n } from '../i18n'
import { input, label as labelStyle, colors } from './ui'

const select = { ...input, cursor: 'pointer' }

// Inputs for an organisation's custom fields in a record's form (docs/TOOLS_PLAN.md step 6, S2).
//   values: { [fieldId]: value }   onChange(fieldId, value)  (value as stored, null when empty)
export function CustomFieldInputs({ fields, values, onChange, idPrefix, inputStyle = input }) {
  const { t } = useI18n()
  // What is typed, so "1," or a half-typed link stay on screen while the stored value follows
  const [raw, setRaw] = useState(() => Object.fromEntries((fields || []).map(f => [f.id, inputValue(f, values?.[f.id])])))
  if (!fields?.length) return null
  return fields.map(f => {
    const id = `${idPrefix}-cf-${f.id}`
    const v = f.id in raw ? raw[f.id] : inputValue(f, values?.[f.id])
    const set = typed => { setRaw(r => ({ ...r, [f.id]: typed })); onChange(f.id, parseInput(f, typed)) }
    if (f.kind === 'yes_no') {
      return (
        <fieldset key={f.id} style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={labelStyle}>{f.label}</legend>
          <div style={{ display: 'flex', gap: '14px', fontSize: '14px', flexWrap: 'wrap' }}>
            {[[true, t('custom.yes')], [false, t('custom.no')], [null, t('custom.unset')]].map(([val, text]) => (
              <label key={String(val)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="radio" name={id} checked={(v ?? null) === val} onChange={() => set(val)} /> {text}
              </label>
            ))}
          </div>
        </fieldset>
      )
    }
    return (
      <div key={f.id}>
        <label htmlFor={id} style={labelStyle}>{f.label}</label>
        {f.kind === 'choice' ? (
          <select id={id} value={v ?? ''} onChange={e => set(e.target.value)} style={{ ...inputStyle, ...select }}>
            <option value="">{t('custom.noChoice')}</option>
            {(f.choices || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <input id={id} style={inputStyle} value={v ?? ''} onChange={e => set(e.target.value)}
            type={f.kind === 'date' ? 'date' : f.kind === 'link' ? 'url' : 'text'}
            inputMode={f.kind === 'number' ? 'decimal' : undefined}
            placeholder={f.kind === 'link' ? 'https://' : undefined}
            maxLength={f.kind === 'link' ? 500 : 1000} />
        )}
      </div>
    )
  })
}

// A record's custom values for reading; nothing when none are filled in
export function CustomFieldList({ fields, values, title }) {
  const { t, fmt } = useI18n()
  const rows = (fields || []).map(f => ({ f, text: displayValue(f, values?.[f.id], { yesNo: [t('custom.yes'), t('custom.no')], date: d => fmt(d, 'd MMM yyyy') }) })).filter(r => r.text)
  if (!rows.length) return null
  return (
    <div>
      {title && <h3 style={{ fontSize: '13px', fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{title}</h3>}
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, max-content) minmax(0, 1fr)', gap: '4px 14px', fontSize: '14px', margin: 0 }}>
        {rows.map(({ f, text }) => (
          <div key={f.id} style={{ display: 'contents' }}>
            <dt style={{ color: colors.muted }}>{f.label}</dt>
            <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
              {f.kind === 'link'
                ? <a href={text} target="_blank" rel="noopener noreferrer" style={{ color: colors.accentText, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{text.replace(/^https?:\/\//i, '')} <ExternalLink size={12} aria-hidden="true" /></a>
                : text}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
