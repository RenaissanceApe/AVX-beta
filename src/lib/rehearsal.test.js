import { describe, it, expect } from 'vitest'
import {
  framesToTc, tcToFrames, msToTc, parseTc, clockMs, offsetFrom, clampAnchor, departmentFor,
  filterNotes, byDepartment, notesCsv, notesExport, msToFrames,
} from './rehearsal'

describe('timecode', () => {
  it('labels frames at 25 fps', () => {
    expect(framesToTc(0, 25)).toBe('00:00:00:00')
    expect(framesToTc(25 * 3661 + 7, 25)).toBe('01:01:01:07')
    expect(msToTc(1000, 25)).toBe('00:00:01:00')
    expect(msToTc(1039, 25)).toBe('00:00:01:00')
    expect(msToTc(1040, 25)).toBe('00:00:01:01')
  })
  it('counts 23.976 and 29.97 at their nominal rates', () => {
    expect(framesToTc(24, 23.976)).toBe('00:00:01:00')
    expect(framesToTc(30, 29.97)).toBe('00:00:01:00')
    // Real time runs slower: one real second is 23.976 frames
    expect(msToFrames(1000, 23.976)).toBe(23)
  })
  it('drop-frame skips 0 and 1 each minute except every tenth', () => {
    expect(framesToTc(1799, 29.97, true)).toBe('00:00:59;29')
    expect(framesToTc(1800, 29.97, true)).toBe('00:01:00;02')
    expect(framesToTc(17982, 29.97, true)).toBe('00:10:00;00')
    expect(framesToTc(107892, 29.97, true)).toBe('01:00:00;00')
    for (const n of [0, 1799, 1800, 5000, 17981, 17982, 50000, 107891]) {
      const [h, m, rest] = framesToTc(n, 29.97, true).split(':')
      const [s, f] = rest.split(';')
      expect(tcToFrames(+h, +m, +s, +f, 29.97, true)).toBe(n)
    }
  })
  it('one hour of drop-frame matches an hour of wall clock', () => {
    expect(msToTc(3600000, 29.97, true)).toBe('01:00:00;00')
  })
  it('reads typed timecode', () => {
    expect(parseTc('01:00:00:00', 25)).toBe(3600000)
    expect(parseTc('1:2:3', 25)).toBe(3723000)
    expect(parseTc('010203', 25)).toBe(3723000)
    expect(parseTc('00:00:01:24', 25)).toBe(1960)
    expect(parseTc('00:00:01:25', 25)).toBeNull()
    expect(parseTc('24:00:00:00', 25)).toBeNull()
    expect(parseTc('abc', 25)).toBeNull()
    expect(parseTc('00:01:00;00', 29.97, true)).toBeNull()
    expect(parseTc('00:01:00;02', 29.97, true)).toBe(60060)
  })
  it('wraps past midnight', () => {
    expect(msToTc(86400000 + 1000, 25)).toBe('00:00:01:00')
  })
})

describe('shared clock', () => {
  const at = '2026-10-26T20:00:00.000Z'
  const t0 = new Date(at).getTime()
  it('runs from its anchor', () => {
    expect(clockMs({ anchor_ms: 5000, anchor_at: at, running: true }, 0, t0 + 2000)).toBe(7000)
    expect(clockMs({ anchor_ms: 5000, anchor_at: at, running: false }, 0, t0 + 2000)).toBe(5000)
  })
  it('uses the server offset', () => {
    // This phone is 300 ms behind the server
    expect(clockMs({ anchor_ms: 0, anchor_at: at, running: true }, 300, t0 + 1000)).toBe(1300)
  })
  it('measures the offset from a round trip', () => {
    expect(offsetFrom('2026-10-26T20:00:01.000Z', t0, t0 + 200)).toBe(900)
  })
  it('keeps anchors in range', () => {
    expect(clampAnchor(-5)).toBe(0)
    expect(clampAnchor(1e12)).toBe(172800000)
  })
})

describe('notes', () => {
  it('picks a department from the function', () => {
    expect(departmentFor('FOH engineer')).toBe('sound')
    expect(departmentFor('Operador de luz')).toBe('lighting')
    expect(departmentFor('LED wall tech')).toBe('video')
    expect(departmentFor('Rigger')).toBe('stage')
    expect(departmentFor('Stage manager')).toBe('sm')
    expect(departmentFor('Driver')).toBe('other')
  })
  const notes = [
    { id: 'a', tc_ms: 5000, department: 'sound', priority: 'fix', status: 'open', author_id: 'u1', body: 'Hum on 12', created_at: '1' },
    { id: 'b', tc_ms: 1000, department: 'lighting', priority: 'note', status: 'done', author_id: 'u2', assignee_id: 'u1', body: 'Spot, "late"', cue: 'Q4', created_at: '2' },
    { id: 'c', tc_ms: 2000, department: 'sound', priority: 'urgent', status: 'open', author_id: 'u2', body: 'Gone', removed_at: 'x', created_at: '3' },
  ]
  it('filters the live list', () => {
    expect(filterNotes(notes).map(n => n.id)).toEqual(['a', 'b'])
    expect(filterNotes(notes, { department: 'sound' }).map(n => n.id)).toEqual(['a'])
    expect(filterNotes(notes, { mine: true, userId: 'u1' }).map(n => n.id)).toEqual(['a', 'b'])
    expect(filterNotes(notes, { open: true }).map(n => n.id)).toEqual(['a'])
  })
  it('groups the report by department in time order', () => {
    expect(byDepartment(notes).map(g => [g.department, g.notes.map(n => n.id)])).toEqual([['sound', ['a']], ['lighting', ['b']]])
  })
  it('writes CSV and the export', () => {
    const session = { id: 's', name: 'Run 1', fps: 25, frame_count: 'ndf' }
    const csv = notesCsv(notes, session, { nameOf: id => ({ u1: 'Ana', u2: 'Rui' }[id]) })
    expect(csv.split('\n')).toEqual([
      'timecode,department,priority,cue,note,author,assignee,status',
      '00:00:01:00,rehearsal.dept.lighting,rehearsal.priority.note,Q4,"Spot, ""late""",Rui,Ana,rehearsal.status.done',
      '00:00:05:00,rehearsal.dept.sound,rehearsal.priority.fix,,Hum on 12,Ana,,rehearsal.status.open',
    ])
    const out = notesExport(notes, session, { id: 'g', name: 'Gig' })
    expect(out.format).toBe('avx-rehearsal')
    expect(out.notes.map(n => [n.timecode, n.frames])).toEqual([['00:00:01:00', 25], ['00:00:05:00', 125]])
  })
})
