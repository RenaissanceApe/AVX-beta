// An organisation's own fields on gigs, clients, suppliers and catalogue items (docs/TOOLS_PLAN.md
// build order step 6, S2). Values live in each record's custom_values, keyed by field id; the
// database checks each value against its field.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export const FIELD_ENTITIES = ['gig', 'client', 'supplier', 'item']
export const FIELD_KINDS = ['text', 'number', 'date', 'yes_no', 'choice', 'link']

const sorted = list => [...(list || [])].sort((a, b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)))

export function useCustomFields(orgId, entity) {
  const [state, setState] = useState({ fields: [], loaded: !orgId })
  const load = useCallback(async () => {
    if (!orgId) return setState({ fields: [], loaded: true })
    let q = supabase.from('custom_fields').select('id, entity, label, kind, choices, position, created_at').eq('org_id', orgId).is('removed_at', null)
    if (entity) q = q.eq('entity', entity)
    const { data } = await q
    setState({ fields: sorted(data), loaded: true })
  }, [orgId, entity])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

// What a form field holds → the value stored (null when empty or not valid)
export function parseInput(field, raw) {
  if (field.kind === 'yes_no') return raw === true ? true : raw === false ? false : null
  const s = String(raw ?? '').trim()
  if (!s) return null
  switch (field.kind) {
    case 'number': {
      const n = Number(s.replace(/\s/g, '').replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
    case 'choice': return (field.choices || []).includes(s) ? s : null
    case 'link': return /^https?:\/\//i.test(s) ? s.slice(0, 500) : null
    default: return s.slice(0, 1000)
  }
}

// The value as a form input shows it
export function inputValue(field, value) {
  if (value == null) return field.kind === 'yes_no' ? null : ''
  if (field.kind === 'number') return String(value).replace('.', ',')
  return value
}

// For reading: '' when empty. yesNo = [yes, no] words; date(d) formats a day
export function displayValue(field, value, { yesNo = ['Yes', 'No'], date = d => d } = {}) {
  if (value == null || value === '') return ''
  switch (field.kind) {
    case 'yes_no': return value ? yesNo[0] : yesNo[1]
    case 'number': return String(value).replace('.', ',')
    case 'date': return date(value)
    default: return String(value)
  }
}

// What to save: the record's values with this form's fields set, so values of fields removed
// since are kept as they were (the database only accepts them unchanged)
export function mergeValues(current, fields, edited) {
  const out = { ...(current || {}) }
  for (const f of fields) {
    if (!(f.id in (edited || {}))) continue
    const v = edited[f.id]
    if (v == null) delete out[f.id]
    else out[f.id] = v
  }
  return out
}

// Choices typed one per line
export const choicesFromText = text => [...new Set(String(text || '').split('\n').map(s => s.trim()).filter(Boolean))].slice(0, 30).map(s => s.slice(0, 80))
