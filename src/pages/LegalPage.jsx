import { Link } from 'react-router-dom'
import { ArrowLeft, Zap } from 'lucide-react'
import { APP_NAME, COMPANY_NAME, COMPANY_COUNTRY, CONTACT_EMAIL, LEGAL_LAST_UPDATED, SENTRY_DSN } from '../config'
import { useI18n } from '../i18n'
import { PrivacyPt, TermsPt } from './LegalPagePt'

// Privacy notice and beta terms. Plain-language drafts for the pilot — have them
// reviewed before opening AVX beyond invited pilot companies (see ROADMAP.md).

function Contact() {
  if (!CONTACT_EMAIL) return <>through the person who invited you to {APP_NAME}</>
  return <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#1EC878' }}>{CONTACT_EMAIL}</a>
}

function Privacy() {
  return (
    <>
      <h1>Privacy notice</h1>
      <p className="meta">Last updated {LEGAL_LAST_UPDATED}</p>

      <h2>Who we are</h2>
      <p>{APP_NAME} is operated by {COMPANY_NAME} ({COMPANY_COUNTRY}), the data controller for the personal data described here. Contact us <Contact />.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your email address, name, optional phone number and password (stored only as a secure hash by our authentication provider).</li>
        <li><strong>Work data you or your team add:</strong> organisations, gigs, your role and call times, files you upload, and updates you post.</li>
        <li><strong>Technical data:</strong> sign-in times and, in our providers' security logs, IP address and browser type.</li>
      </ul>
      <p>We don't use advertising, tracking cookies or analytics profiles. Your browser stores a sign-in token locally so you stay signed in — this is strictly necessary for the service.</p>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide {APP_NAME} to you and your organisation (performance of a contract).</li>
        <li>To keep the service secure, prevent abuse and fix errors (legitimate interest).</li>
        <li>To send account emails: confirmations, password resets and invitations.</li>
      </ul>

      <h2>Who processes it for us</h2>
      <ul>
        <li><strong>Supabase</strong> — database, sign-in and file storage, hosted in Zurich, Switzerland (recognised by the EU as providing adequate protection).</li>
        <li><strong>Vercel</strong> — serves the app's web pages; may process your IP address in its global network under EU Standard Contractual Clauses.</li>
        <li><strong>Our email delivery provider</strong> — sends account and invitation emails.</li>
        {SENTRY_DSN && <li><strong>Sentry</strong> — receives error reports (no file contents, no IP address; you are identified only by an internal id).</li>}
      </ul>
      <p>We don't sell your data or share it with anyone else, except where the law requires it.</p>

      <h2>Who can see your data in {APP_NAME}</h2>
      <p>Members of an organisation can see its gigs, files and updates, and each other's names and email addresses. People added to a gig can see that gig, its schedule, its crew list (names, roles, call times and phone numbers if given), files, updates and a log of changes.</p>

      <h2>How long we keep it</h2>
      <p>For as long as your account exists. When you delete your account we delete your profile and memberships immediately; updates and files you added to a shared gig stay with that gig, no longer linked to you. Encrypted backups are kept for up to 30 days.</p>

      <h2>Your rights</h2>
      <p>You can access and download your data (Account → Export my data), correct your name, and delete your account (Account → Delete account) at any time. You can also ask us to restrict or object to processing. If you're unhappy with how we handle your data you can complain to the Portuguese data protection authority, the <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer" style={{ color: '#1EC878' }}>CNPD</a>.</p>
    </>
  )
}

function Terms() {
  return (
    <>
      <h1>Beta terms of use</h1>
      <p className="meta">Last updated {LEGAL_LAST_UPDATED}</p>

      <h2>The beta</h2>
      <p>{APP_NAME} is in a free pilot run by {COMPANY_NAME}. Features may change, and the service may be interrupted or reset. Keep your own copies of important documents.</p>

      <h2>Your account</h2>
      <p>Keep your password private and tell us <Contact /> if you think your account has been used by someone else. You're responsible for the people you invite into your organisation and gigs.</p>

      <h2>Your content</h2>
      <p>You and your organisation own everything you upload or post. You give us permission to store and display it only so we can run {APP_NAME} for you. Only upload content you have the right to share.</p>

      <h2>Acceptable use</h2>
      <p>Don't use {APP_NAME} to break the law, upload malware, access data that isn't shared with you, or disrupt the service.</p>

      <h2>No warranty</h2>
      <p>The beta is provided "as is". To the extent the law allows, we're not liable for indirect losses or for data lost during the beta.</p>

      <h2>Ending</h2>
      <p>You can delete your account at any time. We may end the pilot or suspend accounts that break these terms, and will give notice where we can.</p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of {COMPANY_COUNTRY}.</p>
    </>
  )
}

export default function LegalPage({ doc }) {
  const { lang, t } = useI18n()
  const pt = lang === 'pt'
  return (
    <div style={{ minHeight: '100vh', background: '#080C14', color: '#C8D3DE', padding: '24px 16px 60px' }}>
      <style>{`
        .legal h1 { color: #fff; font-size: 26px; font-weight: 800; margin-bottom: 4px; }
        .legal h2 { color: #fff; font-size: 16px; font-weight: 700; margin: 26px 0 8px; }
        .legal p, .legal li { font-size: 15px; line-height: 1.7; }
        .legal ul { padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
        .legal .meta { color: #4A6070; font-size: 13px; }
      `}</style>
      <div className="legal" style={{ maxWidth: '680px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#8A9BAE', textDecoration: 'none', fontSize: '14px' }}>
            <ArrowLeft size={14} /> {t('common.back')}
          </Link>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#fff', fontWeight: 800 }}>
            <Zap size={16} color="#1EC878" fill="#1EC878" /> {APP_NAME}
          </span>
        </div>
        {doc === 'terms' ? (pt ? <TermsPt /> : <Terms />) : (pt ? <PrivacyPt /> : <Privacy />)}
        <p style={{ marginTop: '40px', fontSize: '13px', color: '#4A6070' }}>
          {doc === 'terms'
            ? <Link to="/privacy" style={{ color: '#1EC878' }}>{t('legal.privacyShort')}</Link>
            : <Link to="/terms" style={{ color: '#1EC878' }}>{t('legal.termsShort')}</Link>}
        </p>
      </div>
    </div>
  )
}
