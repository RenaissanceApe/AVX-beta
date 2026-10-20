import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Zap, Search, BookOpen, ListChecks, ChevronRight } from 'lucide-react'
import { APP_NAME } from '../config'
import { searchTerms, guide, guidesByRole, GUIDE_ROLES } from '../help'
import GuideView from '../components/help/GuideView'
import { useI18n, LANGUAGES } from '../i18n'
import { track } from '../lib/usage'
import { colors } from '../components/ui'

// Help (docs/HELP.md): the how-to guides by role (H2) and the glossary (H1), every AVX and trade
// word in plain language, searchable, readable before signing in too. /help#call-time opens at
// that word (the dotted words link here); /help/guide/crew-join opens one guide.
export default function HelpPage() {
  const { t, lang, setLang } = useI18n()
  const { hash } = useLocation()
  const { guideId } = useParams()
  const [query, setQuery] = useState('')
  const target = decodeURIComponent(hash.replace(/^#/, ''))
  const list = useMemo(() => searchTerms(query), [query, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { track(guideId ? 'help:guide' : 'help:glossary') }, [guideId])
  useEffect(() => { if (guideId) window.scrollTo(0, 0) }, [guideId])
  useEffect(() => {
    if (!target) return
    const el = document.getElementById(`term-${target}`)
    if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }) }
  }, [target, lang])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-2)', padding: '24px 16px 60px' }}>
      <main style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
          <Link to={guideId ? '/help' : '/'} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--soft)', textDecoration: 'none', fontSize: '14px' }}>
            <ArrowLeft size={14} aria-hidden="true" /> {guideId ? t('help.allHelp') : t('common.back')}
          </Link>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
            <label htmlFor="help-lang" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('help.language')}</label>
            <select id="help-lang" value={lang} onChange={e => setLang(e.target.value)}
              style={{ background: 'transparent', color: 'var(--text-2)', border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '4px 8px', fontSize: '13px' }}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text)', fontWeight: 800 }}>
              <Zap size={16} color="var(--accent-text)" fill="var(--accent-text)" aria-hidden="true" /> {APP_NAME}
            </span>
          </span>
        </div>

        {guideId ? <GuideView id={guideId} /> : (
          <>
            <h1 style={{ color: 'var(--text)', fontSize: '26px', fontWeight: 800, marginBottom: '20px' }}>{t('help.title')}</h1>

            <h2 style={{ color: 'var(--text)', fontSize: '21px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ListChecks size={21} color="var(--accent-text)" aria-hidden="true" /> {t('help.guides')}
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.6, margin: '6px 0 14px' }}>{t('help.guidesIntro')}</p>
            {GUIDE_ROLES.map(role => (
              <section key={role} aria-labelledby={`guides-${role}`} style={{ marginBottom: '18px' }}>
                <h3 id={`guides-${role}`} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{t(`help.role.${role}`)}</h3>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {guidesByRole(role).map(id => (
                    <li key={id}>
                      <Link to={`/help/guide/${id}`} style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '12px', textDecoration: 'none',
                        background: 'color-mix(in srgb, var(--fg) min(100%, calc(3% * var(--line-k))), transparent)', border: `1px solid ${colors.border}`, color: 'var(--text)', fontSize: '15px', fontWeight: 600,
                      }}>
                        <span style={{ flex: 1 }}>{guide(id).title}</span> <ChevronRight size={16} color="var(--soft)" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <h2 style={{ color: 'var(--text)', fontSize: '21px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', marginTop: '32px' }}>
              <BookOpen size={21} color="var(--accent-text)" aria-hidden="true" /> {t('help.glossary')}
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.6, margin: '6px 0 18px' }}>{t('help.glossaryIntro')}</p>

            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <Search size={16} color="var(--soft)" aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('help.searchPlaceholder')} aria-label={t('help.search')}
                style={{ width: '100%', padding: '11px 12px 11px 36px', background: 'color-mix(in srgb, var(--shade) 40%, transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(12% * var(--line-k))), transparent)', borderRadius: '10px', color: 'var(--text)', fontSize: '15px' }} />
            </div>
            <p role="status" style={{ fontSize: '13px', color: 'var(--soft)', marginBottom: '16px' }}>{t('help.termCount', { count: list.length })}</p>

            <dl style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {list.map(x => (
                <div key={x.id} id={`term-${x.id}`} tabIndex={-1} style={{
                  padding: '14px 16px', borderRadius: '12px', background: 'color-mix(in srgb, var(--fg) min(100%, calc(3% * var(--line-k))), transparent)',
                  border: `1px solid ${x.id === target ? 'color-mix(in srgb, var(--accent) 60%, transparent)' : colors.border}`, outline: 'none',
                }}>
                  <dt style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 700 }}>{x.term}</dt>
                  <dd style={{ fontSize: '15px', lineHeight: 1.6, marginTop: '2px' }}>{x.definition}</dd>
                  <dd style={{ fontSize: '14px', lineHeight: 1.55, color: 'var(--text-2)', marginTop: '6px' }}><strong style={{ color: 'var(--text-2)' }}>{t('help.example')}:</strong> {x.example}</dd>
                  <dd style={{ fontSize: '13px', color: 'var(--soft)', marginTop: '4px' }}><strong>{t('help.where')}:</strong> {x.where}</dd>
                </div>
              ))}
            </dl>
            {list.length === 0 && <p style={{ fontSize: '15px', padding: '20px 0' }}>{t('help.noMatch')}</p>}
          </>
        )}
      </main>
    </div>
  )
}
