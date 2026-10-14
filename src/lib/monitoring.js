import { SENTRY_DSN } from '../config'
import { setErrorReporter } from './logger'

// Loads Sentry only when VITE_SENTRY_DSN is set, so it costs nothing otherwise.
// Privacy: no IP addresses, no request bodies, no session replay; user is identified by id only.
export async function initMonitoring() {
  if (!SENTRY_DSN || import.meta.env.DEV) return
  const Sentry = await import('@sentry/react')
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      // Drop URL fragments/queries: auth links carry tokens there
      if (event.request?.url) event.request.url = event.request.url.split(/[?#]/)[0]
      delete event.user?.email
      delete event.user?.ip_address
      return event
    },
    beforeBreadcrumb(crumb) {
      if (crumb.data?.url) crumb.data.url = String(crumb.data.url).split(/[?#]/)[0]
      if (crumb.data?.to) crumb.data.to = String(crumb.data.to).split(/[?#]/)[0]
      if (crumb.data?.from) crumb.data.from = String(crumb.data.from).split(/[?#]/)[0]
      return crumb
    },
  })
  setErrorReporter((error, context) => {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error?.message || error)), { extra: context })
  })
}

export async function setMonitoringUser(userId) {
  if (!SENTRY_DSN || import.meta.env.DEV) return
  const Sentry = await import('@sentry/react')
  Sentry.setUser(userId ? { id: userId } : null)
}
