import { describe, it, expect, beforeEach } from 'vitest'
import { arrangeModules, moveModule, setModuleHidden, isStandard, loadLayout, saveLayout, HOME_MODULES } from './homeLayout'

const ids = list => list.map(m => m.id)

describe('home layout', () => {
  it('uses the standard order with nothing saved', () => {
    expect(ids(arrangeModules(null))).toEqual(HOME_MODULES)
    expect(ids(arrangeModules(null, ['numbers', 'events']))).toEqual(['numbers', 'events'])
  })

  it('keeps the saved order and drops unknown modules', () => {
    expect(ids(arrangeModules({ order: ['events', 'numbers', 'requests', 'old'] }))).toEqual(['events', 'numbers', 'requests'])
  })

  it('puts a module the saved order lacks at its standard place', () => {
    // numbers is new: it goes right after requests, which comes before it in the standard order
    expect(ids(arrangeModules({ order: ['events', 'requests'] }))).toEqual(['events', 'requests', 'numbers'])
    // requests is new and first in the standard: it goes on top
    expect(ids(arrangeModules({ order: ['events', 'numbers'] }))).toEqual(['requests', 'events', 'numbers'])
  })

  it('moves a module up and down among the available ones', () => {
    const avail = ['numbers', 'events']
    const moved = moveModule(null, avail, 'events', -1)
    expect(ids(arrangeModules(moved, avail))).toEqual(['events', 'numbers'])
    // requests (not shown in an organisation) keeps its place
    expect(ids(arrangeModules(moved))).toEqual(['requests', 'events', 'numbers'])
    expect(moveModule(moved, avail, 'events', -1)).toEqual(moved)
  })

  it('hides and shows a module, and knows the standard', () => {
    const hidden = setModuleHidden(null, 'numbers', true)
    expect(arrangeModules(hidden).find(m => m.id === 'numbers').hidden).toBe(true)
    expect(isStandard(hidden)).toBe(false)
    expect(isStandard(setModuleHidden(hidden, 'numbers', false))).toBe(true)
    expect(isStandard(moveModule(null, HOME_MODULES, 'events', -1))).toBe(false)
  })

  describe('on the device', () => {
    const store = {}
    beforeEach(() => {
      for (const k of Object.keys(store)) delete store[k]
      globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v) }, removeItem: k => { delete store[k] } }
    })
    it('saves per person and workspace, and forgets the standard', () => {
      const layout = moveModule(null, HOME_MODULES, 'events', -1)
      saveLayout('u1', 'org-a', layout)
      expect(ids(arrangeModules(loadLayout('u1', 'org-a')))).toEqual(['requests', 'events', 'numbers'])
      expect(ids(arrangeModules(loadLayout('u1', 'me')))).toEqual(HOME_MODULES)
      expect(ids(arrangeModules(loadLayout('u2', 'org-a')))).toEqual(HOME_MODULES)
      saveLayout('u1', 'org-a', null)
      expect(store).toEqual({})
    })
    it('survives a broken saved value', () => {
      store['avx.home.layout.u1.me'] = '{nope'
      expect(ids(arrangeModules(loadLayout('u1', 'me')))).toEqual(HOME_MODULES)
    })
  })
})
