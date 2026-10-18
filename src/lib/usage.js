import { supabase } from './supabase'

// Anonymous usage counts (see supabase/migrations/20261022000001_usage_counts.sql):
// only an event name like "view:gig" or "quote:sent" is sent, never who, which gig or
// which quote. Batched, and skipped entirely when the browser asks not to be tracked.

const queue = []
let timer = null
const FLUSH_MS = 15000
const EVENT = /^[a-z0-9_.:/-]{1,60}$/

const optedOut = () => typeof navigator !== 'undefined' && (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true)

async function flush() {
  clearTimeout(timer)
  timer = null
  if (!queue.length) return
  const events = queue.splice(0, 25)
  const { data } = await supabase.auth.getSession()
  if (!data?.session) return
  // Counting must never get in the way of the app
  await supabase.rpc('track_usage', { p_events: events }).then(() => {}, () => {})
  if (queue.length) timer = setTimeout(flush, 1000)
}

export function track(event) {
  if (!EVENT.test(event) || optedOut()) return
  queue.push(event)
  if (!timer) timer = setTimeout(flush, FLUSH_MS)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
}

// Screen names without ids: /gig/123?tab=crew → "view:gig/crew". Only the app's own
// screens are counted (never the public quote page, whose link holds a private token),
// and only fixed words from the address are kept.
const SCREENS = new Set(['dashboard', 'me', 'orgs', 'gig', 'org', 'quote', 'calendar', 'privacy', 'terms'])
const WORDS = new Set(['callsheet', 'quotes', 'print', 'prices', 'templates', 'company', 'members'])
export function screenEvent(pathname, search = '') {
  const parts = pathname.split('/').filter(Boolean)
  if (!SCREENS.has(parts[0])) return null
  const name = [parts[0], ...parts.slice(1).filter(p => WORDS.has(p))].join('-')
  const tab = (new URLSearchParams(search).get('tab') || '').toLowerCase()
  return `view:${name}${/^[a-z]{1,20}$/.test(tab) ? `/${tab}` : ''}`
}
