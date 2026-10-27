import { describe, it, expect } from 'vitest'
import { dueState, sortTasks, filterTasks, checklistProgress, checklistFromText, toggleItem, taskFromNote, itemsFromText, taskPlace, taskFromRepair } from './tasks'

describe('tasks', () => {
  it('says how urgent a task is', () => {
    const today = '2026-11-10'
    expect(dueState({ due_on: '2026-11-09', status: 'open' }, today)).toBe('overdue')
    expect(dueState({ due_on: '2026-11-10', status: 'open' }, today)).toBe('today')
    expect(dueState({ due_on: '2026-11-13', status: 'open' }, today)).toBe('soon')
    expect(dueState({ due_on: '2026-11-14', status: 'open' }, today)).toBe(null)
    expect(dueState({ due_on: '2026-11-01', status: 'done' }, today)).toBe(null)
    expect(dueState({ status: 'open' }, today)).toBe(null)
  })
  it('sorts open by due date, done last', () => {
    const list = [
      { id: 'a', status: 'open', due_on: null, created_at: '1' },
      { id: 'b', status: 'done', done_at: '2026-11-01' },
      { id: 'c', status: 'open', due_on: '2026-11-12', created_at: '2' },
      { id: 'd', status: 'open', due_on: '2026-11-11', created_at: '3' },
      { id: 'e', status: 'done', done_at: '2026-11-05' },
    ]
    expect(sortTasks(list).map(t => t.id)).toEqual(['d', 'c', 'a', 'e', 'b'])
  })
  it('filters mine and open', () => {
    const list = [{ id: 'a', status: 'open', assignee_id: 'u' }, { id: 'b', status: 'done', assignee_id: 'u' }, { id: 'c', status: 'open' }, { id: 'd', status: 'open', removed_at: 'x' }]
    expect(filterTasks(list).map(t => t.id)).toEqual(['a', 'b', 'c'])
    expect(filterTasks(list, { mine: true, open: true, userId: 'u' }).map(t => t.id)).toEqual(['a'])
  })
  it('keeps a checklist', () => {
    expect(checklistProgress([])).toBe(null)
    const list = checklistFromText('Stage left\n\n  FOH snake  \n')
    expect(list.map(i => i.text)).toEqual(['Stage left', 'FOH snake'])
    const ticked = toggleItem(list, list[0].id)
    expect(checklistProgress(ticked)).toEqual({ done: 1, total: 2 })
    // Editing the text keeps the ticks of lines that stay
    expect(checklistFromText('Stage left\nDrum riser', ticked).map(i => [i.text, i.done])).toEqual([['Stage left', true], ['Drum riser', false]])
    expect(checklistFromText('x\n'.repeat(80)).length).toBe(50)
  })
  it('makes a task from a rehearsal note', () => {
    const t = taskFromNote({ id: 'n', gig_id: 'g', cue: 'Q12', body: 'Spot late', assignee_id: 'u' })
    expect(t).toEqual({ gig_id: 'g', title: 'Q12 · Spot late', notes: '', assignee_id: 'u', source_kind: 'rehearsal_note', source_id: 'n' })
    const long = taskFromNote({ id: 'n', gig_id: 'g', body: 'x'.repeat(300) })
    expect(long.title.length).toBe(198)
    expect(long.notes.length).toBe(300)
  })
  it('keeps template items', () => {
    expect(itemsFromText(' Tyres \n\nStraps\n')).toEqual(['Tyres', 'Straps'])
    expect(itemsFromText('x\n'.repeat(80)).length).toBe(50)
    expect(itemsFromText('y'.repeat(300))[0].length).toBe(200)
  })
  it('tells organisation tasks from gig tasks', () => {
    expect(taskPlace({ gig_id: 'g', org_id: 'o' })).toBe('gig')
    expect(taskPlace({ org_id: 'o' })).toBe('org')
  })
  it('makes a task from a repair', () => {
    const t = taskFromRepair({ id: 'r', org_id: 'o', problem: 'Fan noisy', unit: { code: 'AMP-3' } }, 'Amp')
    expect(t).toEqual({ org_id: 'o', title: 'Amp · AMP-3 — Fan noisy', notes: '', repair_id: 'r' })
    const long = taskFromRepair({ id: 'r', org_id: 'o', problem: 'p'.repeat(300) }, 'Amp')
    expect(long.title.length).toBe(198)
    expect(long.notes.length).toBe(300)
  })
})
