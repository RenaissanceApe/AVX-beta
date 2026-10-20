import { Component } from 'react'
import { logger } from '../lib/logger'
import { t } from '../i18n'

// Catches render errors so a bug shows a recovery screen instead of a blank page.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    logger.error('render', error, { componentStack: info?.componentStack })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-ui)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center'
      }}>
        <div style={{ maxWidth: '380px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '12px' }}>{t('error.boundaryTitle')}</h1>
          <p style={{ color: 'var(--muted)', fontSize: '15px', lineHeight: 1.6, marginBottom: '24px' }}>
            {t('error.boundaryBody')}
          </p>
          <button onClick={() => window.location.assign('/dashboard')} style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', border: 'none', borderRadius: '10px',
            padding: '12px 24px', color: 'var(--on-accent)', fontWeight: 700, fontSize: '15px', cursor: 'pointer',
            fontFamily: 'var(--font-ui)'
          }}>
            {t('common.backToDashboard')}
          </button>
        </div>
      </div>
    )
  }
}
