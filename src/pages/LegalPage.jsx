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
        <li><strong>Work data you or your team add:</strong> organisations, gigs, your role, call and booking times, dates you mark as unavailable, availability questions sent to you and your answers, files you upload, and updates you post. Other companies only ever see that you're "booked" at a time, not where.</li>
        <li><strong>Technical data:</strong> sign-in times and, in our providers' security logs, IP address and browser type.</li>
        <li><strong>Usage counts:</strong> how many times each screen or feature is used per day, across everyone. These counts contain no name, email, account id, IP address or device id, so they can't be linked to you.</li>
        <li><strong>Quote recipients:</strong> if a company sends you a quote through {APP_NAME}, we store the contact details they entered and, if you answer, your name, your message and when you answered.</li>
        <li><strong>Clients and suppliers writing through a link:</strong> if you write to a company from a quote's page or from a subrental link they sent you, we store the name you type and your messages. Only that company's admins and members see them. They're deleted when the company deletes the quote or subrental, or its organisation.</li>
        <li><strong>Notifications on your devices:</strong> if you turn them on, we store for each phone or computer the address its browser's push service gave it, the keys that encrypt notifications for it and a device name (such as "Chrome · Android"). Turning them off, or signing out on that device, stops them.</li>
      </ul>
      <p>We don't use advertising, tracking cookies or analytics profiles. Your browser stores a sign-in token locally so you stay signed in — this is strictly necessary for the service. Messages you write without a connection are kept in your browser until they're sent; signing out removes them.</p>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide {APP_NAME} to you and your organisation (performance of a contract).</li>
        <li>To keep the service secure, prevent abuse and fix errors (legitimate interest).</li>
        <li>To send emails: account confirmations, password resets, invitations, the optional daily summary of your notifications, and quotes a company sends to its clients.</li>
      </ul>

      <h2>Who processes it for us</h2>
      <ul>
        <li><strong>Supabase</strong> — database, sign-in and file storage, hosted in Zurich, Switzerland (recognised by the EU as providing adequate protection).</li>
        <li><strong>Vercel</strong> — serves the app's web pages; may process your IP address in its global network under EU Standard Contractual Clauses.</li>
        <li><strong>Brevo</strong> (Sendinblue SAS, France, EU) — sends our emails: account emails, invitations, the daily summary and quotes. It receives the recipient's email address and the email's content.</li>
        <li><strong>Your browser's push service</strong> (Google for Chrome and Android, Apple for Safari and iPhone, Mozilla for Firefox, Microsoft for Edge) — only if you turn on notifications on a device: it carries each notification to that device. The text is encrypted for your device, so the push service can't read it.</li>
        {SENTRY_DSN && <li><strong>Sentry</strong> — receives error reports (no file contents, no IP address; you are identified only by an internal id).</li>}
      </ul>
      <p>We don't sell your data or share it with anyone else, except where the law requires it.</p>

      <h2>Who can see your data in {APP_NAME}</h2>
      <p>Members of an organisation can see its gigs, files and updates, and each other's names and email addresses. People added to a gig can see that gig, its schedule, its crew list (names, roles, call times and phone numbers if given), files, updates and a log of changes.</p>
      <p><strong>Finding people you've worked with:</strong> when adding someone to a gig or organisation, the person adding can search by name among people they've already shared a gig or organisation with, and see the functions those people had on those gigs, how many gigs they shared and whether they're booked elsewhere on the new gig's dates (not where). Nobody can search everyone on {APP_NAME}, and email addresses aren't shown. In Account you choose who can find you this way: <strong>managers and admins only</strong> (the companies' own people; the default) or <strong>also other crew</strong>.</p>
      <p><strong>Messages:</strong> messages you send are stored and shown to the people in that conversation: the other person in a direct conversation, or everyone who can see the gig in its channel (including people added to the gig later). You can only start a conversation with people you share a gig or organisation with. There are no read receipts: nobody sees whether or when you read a message. Files you attach are stored privately and can be opened only by the people in that conversation. You can edit your messages (the people in the conversation can see earlier versions) or remove them: removing clears the text, files and earlier versions for everyone. Organisation channels are visible to the part of the organisation its admins choose (everyone, admins and members, or admins only); a gig's department channels are visible to the people with that function on the gig and its managers. Announcements ask you to confirm you've read them: the person who sent one and the people running that channel see who confirmed and when. Messages you save for later are visible only to you. Availability questions and crew calls (offers of a place on a gig) are posted in your direct conversation with the person who sent them, together with your answer; accepting a crew call adds you to that gig. When a gig's schedule changes, a short note is posted in its channel. An organisation's admins and members can talk about a piece of equipment, a repair or a subrental in a conversation that only they can see. Search only looks in conversations you can already read. Messages you sent are included in your data export. The email summary may quote the start of a message sent to you, mentioning you or announcing something.</p>
      <p><strong>Reports and blocks:</strong> you can report a message. In a gig's or organisation's conversation, the people running it (the gig's managers or the organisation's admins) see the message, the reason and how many people reported it, never who; they can remove it for everyone, and its author is told that a moderator removed it. Reports from direct conversations go to the {APP_NAME} team. We keep each report (who made it, the reason and what was decided) to deal with abuse. You can block a person: neither of you can then write in your direct conversation, and their mentions and replies don't notify you; they aren't told, but they'll see their messages aren't delivered. To stop spam, a person can send at most 20 messages a minute.</p>

      <h2>How long we keep it</h2>
      <p>For as long as your account exists. When you delete your account we delete your profile and memberships immediately; updates and files you added to a shared gig stay with that gig, no longer linked to you. Encrypted backups are kept for up to 30 days.</p>
      <p><strong>Messages in an organisation's conversations</strong> (its channels, its gigs' chats and its conversations about equipment, quotes and subrentals, including what clients and suppliers write there) are kept for as long as that organisation's admins choose: for ever, or 90 days, 6 months, 1 year or 2 years, after which they and their files are deleted every night. Those admins can also download the organisation's conversations. Direct conversations between two people aren't affected by either.</p>

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
        .legal .meta { color: #7D93A9; font-size: 13px; }
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
        <p style={{ marginTop: '40px', fontSize: '13px', color: '#7D93A9' }}>
          {doc === 'terms'
            ? <Link to="/privacy" style={{ color: '#1EC878' }}>{t('legal.privacyShort')}</Link>
            : <Link to="/terms" style={{ color: '#1EC878' }}>{t('legal.termsShort')}</Link>}
        </p>
      </div>
    </div>
  )
}
