import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { WorkspaceProvider, useWorkspace } from './lib/WorkspaceContext'
import { homePath } from './lib/nav'
import { flushOutbox } from './lib/outbox'
import { ToastProvider } from './lib/ToastContext'
import { I18nProvider, t } from './i18n'
import ErrorBoundary from './components/ErrorBoundary'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import OrgsPage from './pages/OrgsPage'
import GigPage from './pages/GigPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import WelcomePage from './pages/WelcomePage'
import LegalPage from './pages/LegalPage'
import CallSheetPage from './pages/CallSheetPage'
import MfaChallengePage from './pages/MfaChallengePage'
import { track, screenEvent } from './lib/usage'

// Quotes are only for organisation admins/members, so they load on demand
const QuotesPage = lazy(() => import('./pages/QuotesPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const QuoteEditorPage = lazy(() => import('./pages/QuoteEditorPage'))
const QuotePrintPage = lazy(() => import('./pages/QuotePrintPage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const InventoryItemPage = lazy(() => import('./pages/InventoryItemPage'))
const LabelsPage = lazy(() => import('./pages/LabelsPage'))
const ScanPage = lazy(() => import('./pages/ScanPage'))
const DispatchPage = lazy(() => import('./pages/DispatchPage'))
const PackingListPage = lazy(() => import('./pages/PackingListPage'))
// Public: the page a client opens from a quote link (no account)
const MessagesPage = lazy(() => import('./pages/MessagesPage'))
const QuotePublicPage = lazy(() => import('./pages/QuotePublicPage'))
const SupplierLinkPage = lazy(() => import('./pages/SupplierLinkPage'))

function Spinner() {
  return (
    <div style={{
      minHeight: '100vh', background: '#080C14',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div role="status" aria-label={t('common.loading')} style={{
        width: '32px', height: '32px', border: '3px solid rgba(30,200,120,0.2)',
        borderTopColor: '#1EC878', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
    </div>
  )
}

// /dashboard (used by sign-in, old links and notifications) opens your current workspace
function HomeRedirect() {
  const { workspace, loading } = useWorkspace()
  if (loading) return <Spinner />
  return <Navigate to={homePath(workspace)} replace />
}

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/auth" replace />
}

function AppRoutes() {
  const { user, loading, passwordRecovery, mfaRequired } = useAuth()
  const location = useLocation()
  // Anonymous screen counts (no ids), signed-in people only
  useEffect(() => {
    const event = user && !mfaRequired ? screenEvent(location.pathname, location.search) : null
    if (event) track(event)
  }, [location.pathname, location.search, user, mfaRequired])
  // Messages written offline go out when the connection comes back (lib/outbox)
  useEffect(() => {
    if (!user || mfaRequired) return
    const flush = () => flushOutbox(user.id)
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [user, mfaRequired])
  if (loading) return <Spinner />

  // People with an authenticator app give their code before anything else (public pages excepted)
  if (user && mfaRequired && !/^\/(q\/|s\/|privacy|terms)/.test(location.pathname)) return <MfaChallengePage />

  // A password-reset link may land on any URL (e.g. the Site URL); always finish the reset first.
  if (passwordRecovery && location.pathname !== '/reset-password') {
    return <Navigate to="/reset-password" replace />
  }

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/privacy" element={<LegalPage doc="privacy" />} />
      <Route path="/terms" element={<LegalPage doc="terms" />} />
      <Route path="/help" element={<Suspense fallback={<Spinner />}><HelpPage /></Suspense>} />
      <Route path="/help/guide/:guideId" element={<Suspense fallback={<Spinner />}><HelpPage /></Suspense>} />
      <Route path="/q/:token" element={<Suspense fallback={<Spinner />}><QuotePublicPage /></Suspense>} />
      <Route path="/s/:token" element={<Suspense fallback={<Spinner />}><SupplierLinkPage /></Suspense>} />
      <Route path="/dashboard" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
      <Route path="/me" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/messages" element={<ProtectedRoute><Suspense fallback={<Spinner />}><MessagesPage /></Suspense></ProtectedRoute>} />
      <Route path="/messages/:id" element={<ProtectedRoute><Suspense fallback={<Spinner />}><MessagesPage /></Suspense></ProtectedRoute>} />
      <Route path="/orgs" element={<ProtectedRoute><OrgsPage /></ProtectedRoute>} />
      <Route path="/org/:orgId" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/gig/:id" element={<ProtectedRoute><GigPage /></ProtectedRoute>} />
      <Route path="/gig/:id/scan" element={<ProtectedRoute><Suspense fallback={<Spinner />}><DispatchPage /></Suspense></ProtectedRoute>} />
      <Route path="/gig/:id/packing" element={<ProtectedRoute><Suspense fallback={<Spinner />}><PackingListPage /></Suspense></ProtectedRoute>} />
      <Route path="/gig/:id/callsheet" element={<ProtectedRoute><CallSheetPage /></ProtectedRoute>} />
      <Route path="/org/:orgId/quotes" element={<ProtectedRoute><Suspense fallback={<Spinner />}><QuotesPage /></Suspense></ProtectedRoute>} />
      <Route path="/org/:orgId/inventory" element={<ProtectedRoute><Suspense fallback={<Spinner />}><InventoryPage /></Suspense></ProtectedRoute>} />
      <Route path="/org/:orgId/inventory/labels" element={<ProtectedRoute><Suspense fallback={<Spinner />}><LabelsPage /></Suspense></ProtectedRoute>} />
      <Route path="/org/:orgId/inventory/:itemId" element={<ProtectedRoute><Suspense fallback={<Spinner />}><InventoryItemPage /></Suspense></ProtectedRoute>} />
      <Route path="/scan/:code" element={<ProtectedRoute><Suspense fallback={<Spinner />}><ScanPage /></Suspense></ProtectedRoute>} />
      <Route path="/quote/:id" element={<ProtectedRoute><Suspense fallback={<Spinner />}><QuoteEditorPage /></Suspense></ProtectedRoute>} />
      <Route path="/quote/:id/print" element={<ProtectedRoute><Suspense fallback={<Spinner />}><QuotePrintPage /></Suspense></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/auth'} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <WorkspaceProvider>
                <AppRoutes />
              </WorkspaceProvider>
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </I18nProvider>
  )
}
