import { describe, it, expect } from 'vitest'
import { linkify, layoutMessages, mergeMessages, totalUnread, autoBody, isAutoBody, parseMentions, mentionQuery, summarizeReactions, formatSize, messageFilePath, messageLink, dayRange } from './messages'

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
  it('writes a short text for messages that are only files or a card, and spots it', () => {
    expect(autoBody({ files: [{ name: 'rider.pdf' }, { name: 'plot.png' }] })).toBe('📎 rider.pdf, plot.png')
    expect(autoBody({ cardLabel: 'Quote' })).toBe('🔗 Quote')
    expect(autoBody({})).toBe('')
    expect(isAutoBody({ body: '📎 rider.pdf', attachments: [{ path: 'x' }] })).toBe(true)
    expect(isAutoBody({ body: '📎 rider.pdf', attachments: [] })).toBe(false)
    expect(isAutoBody({ body: 'see this', payload: { card: { type: 'gig' } } })).toBe(false)
  })
  it('finds mentions among the people and groups offered', () => {
    const c = [
      { label: 'Ana', mention: { user: 'a' } }, { label: 'Ana Rita', mention: { user: 'ar' } },
      { label: 'Sound', mention: { group: 'fn:sound' } }, { label: 'crew', mention: { group: 'crew' } },
    ]
    expect(parseMentions('@Ana Rita and @sound, check', c)).toEqual([{ user: 'ar' }, { group: 'fn:sound' }])
    expect(parseMentions('hi @Ana', c)).toEqual([{ user: 'a' }])
    expect(parseMentions('mail ana@Anabela.pt @crewing', c)).toEqual([])
    expect(parseMentions('@crew @crew', c)).toEqual([{ group: 'crew' }])
  })
  it('knows the mention being typed', () => {
    expect(mentionQuery('hello @an', 9)).toEqual({ query: 'an', start: 6 })
    expect(mentionQuery('@', 1)).toEqual({ query: '', start: 0 })
    expect(mentionQuery('mail@x', 6)).toBe(null)
  })
  it('sums reactions in a fixed order', () => {
    const rows = [{ emoji: '✅', user_id: 'a' }, { emoji: '👍', user_id: 'b' }, { emoji: '👍', user_id: 'a' }, { emoji: '😂', user_id: 'b', active: false }]
    expect(summarizeReactions(rows, 'a')).toEqual([
      { emoji: '👍', count: 2, mine: true, users: ['b', 'a'] }, { emoji: '✅', count: 1, mine: true, users: ['a'] },
    ])
  })
  it('writes plain date ranges', () => {
    const f = (d, p) => (p === 'd' ? String(Number(d.slice(8))) : `${Number(d.slice(8))} ${d.slice(5, 7)}`)
    expect(dayRange('2026-11-13', '2026-11-13', f)).toBe('13 11')
    expect(dayRange('2026-11-13', null, f)).toBe('13 11')
    expect(dayRange('2026-11-13', '2026-11-15', f)).toBe('13–15 11')
    expect(dayRange('2026-11-30', '2026-12-02', f)).toBe('30 11–2 12')
  })
  it('formats sizes, file paths and links', () => {
    expect(formatSize(900)).toBe('900 B')
    expect(formatSize(2048)).toBe('2 KB')
    expect(formatSize(3.5 * 1024 * 1024)).toBe('3.5 MB')
    expect(messageFilePath('c1', 'Rider final (v2).pdf', 'r1')).toBe('c1/r1/Rider_final_v2_.pdf')
    expect(messageFilePath('c1', 'Plano ç ã.png', 'r1')).toBe('c1/r1/Plano_c_a.png')
    expect(messageLink('https://x.app', 'c1', 'm1')).toBe('https://x.app/messages/c1?m=m1')
  })
})
