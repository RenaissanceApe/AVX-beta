import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ToastProvider } from './lib/ToastContext'
import { I18nProvider, t } from './i18n'
import ErrorBoundary from './components/ErrorBoundary'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import GigPage from './pages/GigPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import WelcomePage from './pages/WelcomePage'
import LegalPage from './pages/LegalPage'
import CallSheetPage from './pages/CallSheetPage'

// Quotes are only for organisation admins/members, so they load on demand
const QuotesPage = lazy(() => import('./pages/QuotesPage'))
const QuoteEditorPage = lazy(() => import('./pages/QuoteEditorPage'))
const QuotePrintPage = lazy(() => import('./pages/QuotePrintPage'))
// Public: the page a client opens from a quote link (no account)
const QuotePublicPage = lazy(() => import('./pages/QuotePublicPage'))

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

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/auth" replace />
}

function AppRoutes() {
  const { user, loading, passwordRecovery } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />

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
      <Route path="/q/:token" element={<Suspense fallback={<Spinner />}><QuotePublicPage /></Suspense>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/gig/:id" element={<ProtectedRoute><GigPage /></ProtectedRoute>} />
      <Route path="/gig/:id/callsheet" element={<ProtectedRoute><CallSheetPage /></ProtectedRoute>} />
      <Route path="/org/:orgId/quotes" element={<ProtectedRoute><Suspense fallback={<Spinner />}><QuotesPage /></Suspense></ProtectedRoute>} />
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
              <AppRoutes />
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </I18nProvider>
  )
}
