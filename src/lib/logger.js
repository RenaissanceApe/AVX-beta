// Central logging. Use this instead of console.* so production output stays clean
// and so an error-reporting service (e.g. Sentry) can be plugged in in one place.
//
// - debug/info: development only
// - warn/error: always, without user data (pass ids, not emails or file contents)

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
export function userMessage(error, fallback = 'Something went wrong. Please try again.') {
  const msg = error?.message || ''
  if (!msg) return fallback
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Network problem — check your connection and try again.'
  if (/row-level security|permission denied|not authorized/i.test(msg)) return "You don't have permission to do that."
  if (/jwt expired|invalid jwt|refresh token/i.test(msg)) return 'Your session expired. Please sign in again.'
  if (/payload too large|exceeded the maximum allowed size/i.test(msg)) return 'That file is too large (max 50 MB).'
  if (/should be different from the old password/i.test(msg)) return "That's your current password — choose a different one."
  if (/gigs_dates_order/.test(msg)) return 'End date must be on or after the start date.'
  if (/_length"?$|_length\b/.test(msg) && /check constraint/i.test(msg)) return 'That text is too long (or empty).'
  return msg
}
