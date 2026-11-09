// Saved views (K9): a report tab and its filters, saved by one person for one organisation and,
// when pinned, shown on Reports → Overview. Stored in public.report_views (only its owner reads it,
// and only while they see the organisation's money). Removed by marking (removed_at).

import { supabase } from '../supabase'

export const VIEW_NAME_MAX = 80

// The filters of the current report as a query string, without the tab (saved apart) and without
// empty values, e.g. "period=this_year&view=cash"
export function viewQuery(params) {
  const out = new URLSearchParams()
  for (const [k, v] of new URLSearchParams(params)) if (k !== 'tab' && v !== '') out.append(k, v)
  return out.toString().slice(0, 1000)
}

// Where a saved view opens
export function viewHref(orgId, view) {
  const q = view.query ? `&${view.query}` : ''
  return `/org/${orgId}/reports?tab=${encodeURIComponent(view.tab)}${q}`
}

// The query string a saved view opens with, for ReportsPage (all its params at once)
export function viewParams(view) {
  const p = new URLSearchParams(view.query || '')
  p.set('tab', view.tab)
  return p
}

export const cleanViewName = name => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, VIEW_NAME_MAX)

// Pinned views first, then by name
export function sortViews(views) {
  return [...(views || [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name))
}

export async function listViews(orgId) {
  const { data, error } = await supabase.from('report_views').select('id, name, tab, query, pinned, created_at')
    .eq('org_id', orgId).is('removed_at', null).order('created_at')
  if (error) throw error
  return sortViews(data)
}

export async function saveView(orgId, { name, tab, query, pinned = true }) {
  const { data, error } = await supabase.from('report_views')
    .insert({ org_id: orgId, name: cleanViewName(name), tab, query, pinned })
    .select('id, name, tab, query, pinned, created_at').single()
  if (error) throw error
  return data
}

export async function updateView(id, changes) {
  const { error } = await supabase.from('report_views').update(changes).eq('id', id)
  if (error) throw error
}

export const removeView = id => updateView(id, { removed_at: new Date().toISOString() })
