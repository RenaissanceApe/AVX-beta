import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Search, BookOpen, ListChecks, ChevronRight } from 'lucide-react'
import { APP_NAME } from '../config'
import { searchTerms, guide, guidesByRole, GUIDE_ROLES } from '../help'
import GuideView from '../components/help/GuideView'
import { useI18n, LANGUAGES } from '../i18n'
import { track } from '../lib/usage'
import { colors, AvxMark, Section, Stack, space } from '../components/ui'

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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-2)', padding: '24px 16px 64px' }}>
      <main style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '32px', flexWrap: 'wrap' }}>
          <Link to={guideId ? '/help' : '/'} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--soft)', textDecoration: 'none', fontSize: '14px' }}>
            <ArrowLeft size={14} aria-hidden="true" /> {guideId ? t('help.allHelp') : t('common.back')}
          </Link>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
            <label htmlFor="help-lang" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('help.language')}</label>
            <select id="help-lang" value={lang} onChange={e => setLang(e.target.value)}
              style={{ background: 'transparent', color: 'var(--text-2)', border: `1px solid ${colors.border}`, padding: '4px 8px', fontSize: '13px' }}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text)', fontWeight: 700 }}>
              <AvxMark size={16} style={{ color: 'var(--accent-text)' }} /> {APP_NAME}
            </span>
          </span>
        </div>

        {guideId ? <GuideView id={guideId} /> : (
          <>
            <h1 className="avx-page-head__title" style={{ color: 'var(--text)', marginBottom: space[6] }}>{t('help.title')}</h1>

            <Section id="help-guides" title={<><ListChecks size={16} color="var(--accent-text)" aria-hidden="true" /> {t('help.guides')}</>}>
              <p style={{ fontSize: '16px', lineHeight: 1.6, margin: `calc(-1 * ${space[2]}) 0 ${space[5]}` }}>{t('help.guidesIntro')}</p>
              <Stack gap={5}>
                {GUIDE_ROLES.map(role => (
                  <section key={role} aria-labelledby={`guides-${role}`}>
                    <h3 id={`guides-${role}`} style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: space[1] }}>{t(`help.role.${role}`)}</h3>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                      {guidesByRole(role).map(id => (
                        <li key={id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                          <Link to={`/help/guide/${id}`} style={{
                            display: 'flex', alignItems: 'center', gap: space[3], minHeight: '52px', padding: `${space[2]} 0`, textDecoration: 'none',
                            color: 'var(--text)', fontSize: '16px', fontWeight: 600,
                          }}>
                            <span style={{ flex: 1 }}>{guide(id).title}</span> <ChevronRight size={16} color="var(--soft)" aria-hidden="true" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </Stack>
            </Section>

            <Section id="help-glossary" title={<><BookOpen size={16} color="var(--accent-text)" aria-hidden="true" /> {t('help.glossary')}</>}>
              <p style={{ fontSize: '16px', lineHeight: 1.6, margin: `calc(-1 * ${space[2]}) 0 ${space[4]}` }}>{t('help.glossaryIntro')}</p>

              <div style={{ position: 'relative', marginBottom: space[2] }}>
                <Search size={16} color="var(--soft)" aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('help.searchPlaceholder')} aria-label={t('help.search')}
                  style={{ width: '100%', minHeight: '44px', padding: '12px 12px 12px 36px', background: 'var(--shade)', border: '1px solid var(--line-strong)', color: 'var(--text)', fontSize: '16px' }} />
              </div>
              <p role="status" style={{ fontSize: '13px', color: 'var(--soft)', marginBottom: space[2] }}>{t('help.termCount', { count: list.length })}</p>

              <dl>
                {list.map(x => (
                  <div key={x.id} id={`term-${x.id}`} tabIndex={-1} style={{
                    padding: `${space[4]} ${x.id === target ? space[3] : 0}`, borderBottom: `1px solid ${colors.border}`, outline: 'none',
                    background: x.id === target ? 'var(--selection)' : undefined,
                    borderLeft: x.id === target ? '2px solid var(--accent)' : undefined,
                  }}>
                    <dt style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 700 }}>{x.term}</dt>
                    <dd style={{ fontSize: '16px', lineHeight: 1.6, marginTop: space[1] }}>{x.definition}</dd>
                    <dd style={{ fontSize: '14px', lineHeight: 1.55, color: 'var(--text-2)', marginTop: space[2] }}><strong style={{ color: 'var(--text-2)' }}>{t('help.example')}:</strong> {x.example}</dd>
                    <dd style={{ fontSize: '13px', color: 'var(--soft)', marginTop: space[1] }}><strong>{t('help.where')}:</strong> {x.where}</dd>
                  </div>
                ))}
              </dl>
            {list.length === 0 && <p style={{ fontSize: '16px', padding: `${space[5]} 0` }}>{t('help.noMatch')}</p>}
            </Section>
          </>
        )}
      </main>
    </div>
  )
}
