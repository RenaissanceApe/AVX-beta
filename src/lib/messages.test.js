import { describe, it, expect } from 'vitest'
import { linkify, layoutMessages, mergeMessages, totalUnread } from './messages'

describe('messages', () => {
  it('turns web addresses into links and leaves the rest as text', () => {
    expect(linkify('See https://avx.app/gig/1. Thanks')).toEqual([
      { type: 'text', value: 'See ' }, { type: 'link', value: 'https://avx.app/gig/1' }, { type: 'text', value: '. Thanks' },
    ])
    expect(linkify('<b>no html</b> javascript:alert(1)')).toEqual([{ type: 'text', value: '<b>no html</b> javascript:alert(1)' }])
    expect(linkify('')).toEqual([])
  })
  it('groups messages by day and by author', () => {
    const rows = layoutMessages([
      { id: '1', kind: 'text', author_id: 'a', created_at: '2026-10-18T10:00:00' },
      { id: '2', kind: 'text', author_id: 'a', created_at: '2026-10-18T10:02:00' },
      { id: '3', kind: 'text', author_id: 'a', created_at: '2026-10-18T10:02:30', reply_to: '1' },
      { id: '4', kind: 'text', author_id: 'b', created_at: '2026-10-18T10:03:00' },
      { id: '5', kind: 'text', author_id: 'b', created_at: '2026-10-19T09:00:00' },
    ])
    expect(rows.map(r => (r.type === 'day' ? r.day : `${r.message.id}${r.continues ? '+' : ''}`)))
      .toEqual(['2026-10-18', '1', '2+', '3', '4', '2026-10-19', '5'])
  })
  it('merges without duplicates, oldest first', () => {
    const merged = mergeMessages([{ id: 'b', created_at: '2026-01-02' }], [{ id: 'a', created_at: '2026-01-01' }, { id: 'b', created_at: '2026-01-02' }])
    expect(merged.map(m => m.id)).toEqual(['a', 'b'])
  })
  it('counts unread, leaving out muted conversations', () => {
    expect(totalUnread([{ unread: 2 }, { unread: 5, muted: true }, { unread: 1 }])).toBe(3)
  })
})
