import { describe, it, expect } from 'vitest'
import { sweepTargets, ROLES, AREAS, areaEmail, testEmail } from '../e2e/auth/accounts.js'

// Which addresses scripts/e2e-sweep.mjs tries for a tag (it signs in to each and deletes it)
describe('sweepTargets', () => {
  it('with the run\'s account list: the older roles plus exactly the listed area accounts', () => {
    const list = 'admin gigs\nmember gigs\nviewer gigs\nadmin quotes\n\n'
    const targets = sweepTargets('gh1-1-s2', list)
    const emails = targets.map(t => t.email)
    expect(emails).toContain(areaEmail('admin', 'gigs', 'gh1-1-s2'))
    expect(emails).toContain(areaEmail('member', 'gigs', 'gh1-1-s2'))
    expect(emails).toContain(areaEmail('admin', 'quotes', 'gh1-1-s2'))
    expect(emails).toContain(testEmail('pm', 'gh1-1-s2'))
    expect(emails).not.toContain(areaEmail('viewer', 'quotes', 'gh1-1-s2'))
    expect(targets).toHaveLength(ROLES.length + 4)
  })

  it('lists each address once, members before admins', () => {
    const targets = sweepTargets('r1', 'member gigs\nmember gigs\nadmin gigs\nmember gigs\n')
    expect(new Set(targets.map(t => t.email)).size).toBe(targets.length)
    const roles = targets.filter(t => t.area === 'gigs').map(t => t.role)
    expect(roles).toEqual(['member', 'admin'])
    const index = role => targets.findIndex(t => t.role === role)
    expect(index('member')).toBeLessThan(index('admin'))
    expect(index('tech')).toBeLessThan(index('pm'))
  })

  it('without a list: every role in every area, and the older roles', () => {
    const targets = sweepTargets('r1', null)
    expect(targets).toHaveLength(ROLES.length * (AREAS.length + 1))
    for (const area of AREAS) expect(targets.map(t => t.email)).toContain(areaEmail('crew', area, 'r1'))
  })

  it('a tag for one area (<run>-<area>) sweeps only that area', () => {
    const targets = sweepTargets('r1-gigs', null)
    expect(targets).toHaveLength(ROLES.length)
    expect(targets.map(t => t.email)).toContain(areaEmail('admin', 'gigs', 'r1'))
  })

  it('only ever names e2e-…@example.com addresses, and ignores odd lines in the list', () => {
    const targets = sweepTargets('r1', 'admin gigs\nAdmin@x gigs\nmember ../etc\n')
    for (const t of targets) expect(t.email).toMatch(/^e2e-[a-z0-9-]+@example\.com$/)
    expect(targets.filter(t => t.area)).toHaveLength(1)
  })
})
