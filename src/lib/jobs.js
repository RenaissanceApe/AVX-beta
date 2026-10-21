// The job board (docs/CREW_NETWORK.md, N3): the form → publish_job()'s payload, how pay reads, and
// the database's refusals → the words people see.

export const CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'BRL']
export const PAY_PER = ['day', 'job', 'hour']

// A blank post for a gig (and, optionally, one of its crew positions)
export const emptyPost = (gig, position) => ({
  position_id: position?.id || '', title: position?.title || '', function_key: '', quantity: position?.quantity || 1,
  starts_on: gig?.start_date || '', ends_on: gig?.end_date || gig?.start_date || '', place: null,
  languages: [], certificate: '', description: position?.notes || '',
  pay_mode: 'ask_rate', pay_amount: '', pay_max: '', pay_per: 'day', currency: 'EUR',
})

const num = v => (v === '' || v == null || !Number.isFinite(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')))

// The form → { payload, errors }
export function postPayload(f) {
  const errors = []
  if (!f.title?.trim()) errors.push('title')
  if (!f.starts_on) errors.push('dates')
  if (f.ends_on && f.starts_on && f.ends_on < f.starts_on) errors.push('dates')
  const amount = num(f.pay_amount), max = num(f.pay_max)
  if (f.pay_mode === 'fixed' && (amount == null || amount < 0)) errors.push('pay')
  if (max != null && amount != null && max < amount) errors.push('pay')
  return {
    errors: [...new Set(errors)],
    payload: {
      position_id: f.position_id || null,
      title: (f.title || '').trim().slice(0, 120),
      function_key: f.function_key || null,
      quantity: Math.min(50, Math.max(1, Math.round(Number(f.quantity) || 1))),
      starts_on: f.starts_on || null,
      ends_on: f.ends_on || f.starts_on || null,
      place: f.place?.label || null,
      country: f.place?.country || null,
      lat: f.place?.lat ?? null,
      lng: f.place?.lng ?? null,
      languages: [...new Set(f.languages || [])],
      certificate: f.certificate?.trim() || null,
      description: f.description?.trim().slice(0, 2000) || null,
      pay_mode: f.pay_mode === 'fixed' ? 'fixed' : 'ask_rate',
      pay_amount: f.pay_mode === 'fixed' ? amount : null,
      pay_max: f.pay_mode === 'fixed' ? max : null,
      pay_per: PAY_PER.includes(f.pay_per) ? f.pay_per : 'day',
      currency: CURRENCIES.includes(f.currency) ? f.currency : 'EUR',
    },
  }
}

export function money(amount, currency, lang = 'en') {
  try { return new Intl.NumberFormat(lang === 'pt' ? 'pt-PT' : 'en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount) } catch { return `${amount} ${currency}` }
}

// "€180 a day", "€150–€200 a day", or "Send your day rate"
export function payText(p, t, lang) {
  if (p.pay_mode !== 'fixed' || p.pay_amount == null) return t('jobs.pay.askRate')
  const amount = p.pay_max != null && Number(p.pay_max) > Number(p.pay_amount)
    ? `${money(Number(p.pay_amount), p.currency, lang)}–${money(Number(p.pay_max), p.currency, lang)}`
    : money(Number(p.pay_amount), p.currency, lang)
  return t(`jobs.pay.per.${p.pay_per || 'day'}`, { amount })
}

export function jobError(error) {
  const m = String(error?.message || '')
  if (/Two-step sign-in needed/i.test(m)) return 'jobs.err.twoStep'
  if (/Open post limit/i.test(m)) return 'jobs.err.postLimit'
  if (/needs dates/i.test(m)) return 'jobs.err.noDates'
  if (/dates have passed/i.test(m)) return 'jobs.err.past'
  if (/no longer open/i.test(m)) return 'jobs.err.closed'
  if (/crew profile first/i.test(m)) return 'jobs.err.profile'
  if (/day rate is asked/i.test(m)) return 'jobs.err.rate'
  if (/Already applied/i.test(m)) return 'jobs.err.applied'
  if (/Already on this gig/i.test(m)) return 'jobs.err.onGig'
  if (/Application limit/i.test(m)) return 'jobs.err.applyLimit'
  if (/application is closed/i.test(m)) return 'jobs.err.appClosed'
  if (error?.code === '42501' || /Not allowed/i.test(m)) return 'jobs.err.notAllowed'
  return null
}
