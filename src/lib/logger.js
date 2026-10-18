// Central logging. Use this instead of console.* so production output stays clean
// and so an error-reporting service (e.g. Sentry) can be plugged in in one place.
//
// - debug/info: development only
// - warn/error: always, without user data (pass ids, not emails or file contents)

import { t } from '../i18n'

const isDev = import.meta.env.DEV

// Set by src/lib/monitoring.js when error monitoring is enabled
let reportError = null
export function setErrorReporter(fn) {
  reportError = fn
}

function format(scope, message) {
  return `[AVX:${scope}] ${message}`
}

export const logger = {
  debug(scope, message, extra) {
    if (isDev) console.debug(format(scope, message), extra ?? '')
  },
  info(scope, message, extra) {
    if (isDev) console.info(format(scope, message), extra ?? '')
  },
  warn(scope, message, extra) {
    console.warn(format(scope, message), extra ?? '')
  },
  error(scope, error, extra) {
    const message = error?.message || String(error)
    console.error(format(scope, message), extra ?? '')
    if (reportError) {
      try { reportError(error, { scope, ...extra }) } catch { /* never let reporting break the app */ }
    }
  },
}

// Turns Supabase / network errors into something safe and readable for users.
export function userMessage(error, fallback) {
  const msg = error?.message || ''
  if (!msg) return fallback || t('error.generic')
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return t('error.network')
  if (/row-level security|permission denied|not authorized/i.test(msg)) return t('error.permission')
  if (/jwt expired|invalid jwt|refresh token/i.test(msg)) return t('error.session')
  if (/payload too large|exceeded the maximum allowed size/i.test(msg)) return t('error.tooLarge')
  if (/should be different from the old password/i.test(msg)) return t('error.samePassword')
  if (/gigs_dates_order/.test(msg)) return t('error.dates')
  if (/_length"?$|_length\b/.test(msg) && /check constraint/i.test(msg)) return t('error.textLength')
  if (/An organisation needs at least one admin/i.test(msg)) return t('error.lastAdmin')
  if (/Only the gig PM or an organisation admin/i.test(msg)) return t('error.permission')
  if (/Only organisation admins/i.test(msg)) return t('error.permission')
  if (/Invalid email address/i.test(msg)) return t('error.email')
  // Inventory rules (supabase/migrations/20261025000000_inventory_catalogue.sql)
  const notEnough = /Not enough stock at that location \((-?\d+) available\)/.exec(msg)
  if (notEnough) return t('inv.error.notEnough', { count: Number(notEnough[1]) })
  if (/Stock tracking can't change/i.test(msg)) return t('inv.trackingLocked')
  if (/Unknown or archived location/i.test(msg)) return t('inv.error.location')
  if (/stock_(units|movements)_item_id_fkey/.test(msg)) return t('inv.error.hasStock')
  if (/price_items_code_uniq|stock_units_code_uniq/.test(msg)) return t('inv.error.codeTaken')
  if (/stock_units_serial_uniq/.test(msg)) return t('inv.error.serialTaken')
  if (/stock_locations_name_uniq/.test(msg)) return t('inv.error.locationTaken')
  if (/Only rental or sale items can have stock/i.test(msg)) return t('inv.error.kind')
  return msg
}
