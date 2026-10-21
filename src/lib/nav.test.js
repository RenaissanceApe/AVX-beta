import { describe, it, expect } from 'vitest'
import { navSections, splitItems, phoneTabs, isActive, defaultWorkspace, homePath, MY_WORK } from './nav'

const keys = sections => sections.flatMap(s => s.items.map(i => i.key))

describe('navigation', () => {
  it('My work lists your gigs and organisations', () => {
    expect(keys(navSections({ workspace: MY_WORK }))).toEqual(['myGigs', 'myCalendar', 'availability', 'jobs', 'allOrgs', 'newOrg'])
  })

  it('shows quotes and settings only to roles that can use them', () => {
    const admin = keys(navSections({ workspace: 'o1', role: 'admin' }))
    const member = keys(navSections({ workspace: 'o1', role: 'member' }))
    const viewer = keys(navSections({ workspace: 'o1', role: 'viewer' }))
    expect(admin).toContain('orgSettings')
    expect(admin).toContain('quotes')
    expect(member).toContain('priceList')
    expect(member).not.toContain('orgSettings')
    expect(viewer).not.toContain('quotes')
    expect(member).toEqual(expect.arrayContaining(['findCrew', 'orgJobs']))
    expect(viewer).not.toContain('orgJobs')
    expect(viewer).not.toContain('priceList')
    expect(member).toContain('catalogue')
    expect(viewer).not.toContain('catalogue')
    expect(viewer).not.toContain('movements')
    expect(viewer).not.toContain('newGig')
    expect(viewer).not.toContain('orgSettings')
    expect(viewer).toContain('members')
  })

  it('puts minor and overflow items in the side list', () => {
    const quotes = navSections({ workspace: 'o1', role: 'admin' }).find(s => s.key === 'quotes')
    const { cards, list } = splitItems(quotes.items)
    expect(cards.map(i => i.key)).toEqual(['quotes', 'contacts', 'priceList', 'templates'])
    expect(list.map(i => i.key)).toEqual(['company'])
    const many = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}` }))
    expect(splitItems(many).cards).toHaveLength(4)
    expect(splitItems(many).list).toHaveLength(2)
  })

  it('phone tabs fall back to the calendar for viewers', () => {
    expect(phoneTabs({ workspace: 'o1', role: 'viewer' }).map(t => t.key)).toEqual(['orgGigs', 'orgCalendar', 'members'])
    expect(phoneTabs({ workspace: 'o1', role: 'member' }).map(t => t.key)).toEqual(['orgGigs', 'quotes', 'members'])
  })

  it('knows the active item, query included', () => {
    const gigs = { to: '/org/o1' }
    const cal = { to: '/org/o1?view=calendar' }
    expect(isActive(gigs, '/org/o1', '')).toBe(true)
    expect(isActive(gigs, '/org/o1', '?view=calendar')).toBe(false)
    expect(isActive(cal, '/org/o1', '?view=calendar')).toBe(true)
    expect(isActive({ to: '/org/o1/quotes' }, '/org/o1/quotes', '?q=x')).toBe(true)
  })

  it('opens the last workspace, else where you work, else My work', () => {
    const orgs = [{ id: 'a', myRole: 'viewer' }, { id: 'b', myRole: 'member' }]
    expect(defaultWorkspace(orgs, 'a')).toBe('a')
    expect(defaultWorkspace(orgs, 'gone')).toBe('b')
    expect(defaultWorkspace(orgs, MY_WORK)).toBe(MY_WORK)
    expect(defaultWorkspace([{ id: 'a', myRole: 'viewer' }], null)).toBe(MY_WORK)
    expect(defaultWorkspace([], null)).toBe(MY_WORK)
    expect(homePath('b')).toBe('/org/b')
    expect(homePath(MY_WORK)).toBe('/me')
  })
})
