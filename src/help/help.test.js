import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import en from './en'
import pt from './pt'
import { PAGE_TERMS, GUIDES, GUIDE_ROLES, searchTerms, term, hint, guide, guidesFor, shotUrl } from './index'
import { setCurrentLanguage } from '../i18n'

afterEach(() => setCurrentLanguage('en'))

const sameKeys = (a, b) => ({ missingInPt: Object.keys(a).filter(k => !(k in b)), extraInPt: Object.keys(b).filter(k => !(k in a)) })

describe('help content', () => {
  it('has every term, hint and page note in both languages', () => {
    for (const part of ['terms', 'hints', 'pages']) expect(sameKeys(en[part], pt[part])).toEqual({ missingInPt: [], extraInPt: [] })
  })

  it('has no empty text', () => {
    const empty = []
    for (const [lang, c] of [['en', en], ['pt', pt]]) {
      for (const [id, x] of Object.entries(c.terms)) for (const f of ['term', 'definition', 'example', 'where']) if (!x[f]?.trim()) empty.push(`${lang} term ${id}.${f}`)
      for (const [id, x] of Object.entries(c.hints)) if (!x?.trim()) empty.push(`${lang} hint ${id}`)
      for (const [id, x] of Object.entries(c.pages)) for (const f of ['title', 'summary']) if (!x[f]?.trim()) empty.push(`${lang} page ${id}.${f}`)
    }
    expect(empty).toEqual([])
  })

  it('links pages only to terms that exist, and every page has its terms', () => {
    expect(Object.keys(PAGE_TERMS).sort()).toEqual(Object.keys(en.pages).sort())
    const missing = Object.values(PAGE_TERMS).flat().filter(id => !(id in en.terms))
    expect(missing).toEqual([])
  })

  it('covers every hint, term and page the app uses', () => {
    const files = []
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.jsx?$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p)
    })
    walk(path.resolve(__dirname, '..'))
    const used = { hint: new Set(), term: new Set(), page: new Set() }
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8')
      for (const m of src.matchAll(/<Hint\s+id="([\w-]+)"/g)) used.hint.add(m[1])
      for (const m of src.matchAll(/\bhint="([\w-]+)"/g)) used.hint.add(m[1])
      for (const m of src.matchAll(/<Term\s+id="([\w-]+)"/g)) used.term.add(m[1])
      for (const m of src.matchAll(/<PageHelp\s+page="([\w-]+)"/g)) used.page.add(m[1])
    }
    expect({
      hints: [...used.hint].filter(id => !(id in en.hints)),
      terms: [...used.term].filter(id => !(id in en.terms)),
      pages: [...used.page].filter(id => !(id in en.pages)),
    }).toEqual({ hints: [], terms: [], pages: [] })
  })

  it('reads in the interface language and searches without accents', () => {
    expect(term('call-time').term).toBe('Call time')
    setCurrentLanguage('pt')
    expect(term('call-time').term).toBe('Hora de chamada')
    expect(hint('vat')).toMatch(/IVA/)
    expect(searchTerms('reparacao').map(x => x.id)).toContain('repair')
    expect(searchTerms('').length).toBe(Object.keys(pt.terms).length)
  })

  it('has every guide in both languages, with the same number of steps and a picture slot per step', () => {
    expect(sameKeys(en.guides, pt.guides)).toEqual({ missingInPt: [], extraInPt: [] })
    expect(Object.keys(GUIDES).sort()).toEqual(Object.keys(en.guides).sort())
    const wrong = []
    for (const [id, meta] of Object.entries(GUIDES)) {
      if (!GUIDE_ROLES.includes(meta.role)) wrong.push(`${id}: role ${meta.role}`)
      for (const [lang, c] of [['en', en], ['pt', pt]]) {
        const g = c.guides[id]
        for (const f of ['title', 'intro']) if (!g[f]?.trim()) wrong.push(`${lang} ${id}.${f} empty`)
        if (g.steps.length !== meta.shots.length) wrong.push(`${lang} ${id}: ${g.steps.length} steps, ${meta.shots.length} shots`)
        if (g.mistakes.length !== en.guides[id].mistakes.length) wrong.push(`${lang} ${id}: mistakes differ`)
        for (const x of [...g.steps, ...g.mistakes]) if (!x?.trim()) wrong.push(`${lang} ${id}: empty step or mistake`)
      }
      for (const t of meta.terms) if (!(t in en.terms)) wrong.push(`${id}: no term ${t}`)
      for (const p of meta.pages) if (!(p in en.pages)) wrong.push(`${id}: no page ${p}`)
    }
    expect(wrong).toEqual([])
  })

  it('has a screenshot in both languages for every guide step that shows one', () => {
    const shots = new Set(Object.values(GUIDES).flatMap(g => g.shots).filter(Boolean))
    const missing = []
    for (const lang of ['en', 'pt']) for (const s of shots) {
      if (!fs.existsSync(path.resolve(__dirname, `../../public/help/shots/${lang}/${s}.jpg`))) missing.push(`${lang}/${s}.jpg`)
    }
    expect(missing).toEqual([])
  })

  it('reads guides in the interface language and lists them per page', () => {
    expect(guide('crew-join').title).toMatch(/password/)
    expect(guidesFor('gig')).toContain('crew-call-time')
    expect(shotUrl('welcome')).toBe('/help/shots/en/welcome.jpg')
    setCurrentLanguage('pt')
    expect(guide('crew-join').title).toMatch(/palavra-passe/)
    expect(shotUrl('welcome')).toBe('/help/shots/pt/welcome.jpg')
    expect(guide('nope')).toBe(null)
  })
})
