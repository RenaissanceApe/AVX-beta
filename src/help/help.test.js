import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import en from './en'
import pt from './pt'
import { PAGE_TERMS, searchTerms, term, hint } from './index'
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
})
