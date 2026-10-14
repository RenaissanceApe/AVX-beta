import { describe, it, expect, afterEach } from 'vitest'
import en from './en'
import pt from './pt'
import { t, setCurrentLanguage } from './index'
import fs from 'node:fs'
import path from 'node:path'

afterEach(() => setCurrentLanguage('en'))

describe('dictionaries', () => {
  it('English and Portuguese have exactly the same keys', () => {
    const missingInPt = Object.keys(en).filter(k => !(k in pt))
    const extraInPt = Object.keys(pt).filter(k => !(k in en))
    expect({ missingInPt, extraInPt }).toEqual({ missingInPt: [], extraInPt: [] })
  })

  it('keep the same {placeholders} in both languages', () => {
    const vars = s => (s.match(/\{\w+\}/g) || []).sort().join(',')
    const mismatched = Object.keys(en).filter(k => k in pt && vars(en[k]) !== vars(pt[k]))
    expect(mismatched).toEqual([])
  })

  it('cover every literal key used in the source', () => {
    const files = []
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p)
    })
    walk(path.resolve(__dirname, '..'))
    const used = new Set()
    for (const f of files) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1])
    }
    const missing = [...used].filter(k => !(k in en) && !(`${k}.one` in en))
    expect(missing).toEqual([])
  })
})

describe('t()', () => {
  it('interpolates and pluralises', () => {
    expect(t('crew.count', { count: 1 })).toBe('1 person assigned to this gig.')
    expect(t('crew.count', { count: 3 })).toBe('3 people assigned to this gig.')
    expect(t('auth.passwordMin', { min: 8 })).toBe('Password must be at least 8 characters')
  })
  it('switches language and falls back to the key', () => {
    setCurrentLanguage('pt')
    expect(t('auth.signIn')).toBe('Entrar')
    expect(t('crew.count', { count: 2 })).toBe('2 pessoas atribuídas a este evento.')
    expect(t('does.not.exist')).toBe('does.not.exist')
  })
})
