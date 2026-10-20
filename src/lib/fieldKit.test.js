import { describe, it, expect } from 'vitest'
import { pickVoice, speechLang, TONES, VIBRATION, readFieldKit } from './fieldKit'
import { callSheetSpeech } from './schedule'

describe('field kit', () => {
  it('picks a European Portuguese voice before a Brazilian one, and falls back to the language', () => {
    const voices = [{ lang: 'en-US', name: 'a' }, { lang: 'pt-BR', name: 'b' }, { lang: 'pt_PT', name: 'c' }]
    expect(pickVoice(voices, 'pt').name).toBe('c')
    expect(pickVoice(voices.slice(0, 2), 'pt').name).toBe('b')
    expect(pickVoice(voices, 'en').name).toBe('a')
    expect(pickVoice([], 'en')).toBe(null)
    expect(speechLang('pt')).toBe('pt-PT')
  })

  it('has a sound and a vibration for every outcome, told apart by rhythm and pitch', () => {
    for (const tone of ['ok', 'warn', 'error']) {
      expect(TONES[tone].length).toBeGreaterThan(0)
      expect(VIBRATION[tone]).toBeTruthy()
    }
    expect(TONES.ok[0].hz).toBeGreaterThan(TONES.warn[0].hz)
    expect(TONES.warn[0].hz).toBeGreaterThan(TONES.error[0].hz)
    expect(TONES.warn.filter(s => s.hz).length).toBe(2)
  })

  it('has sound on and speech off when nothing is saved', () => {
    expect(readFieldKit()).toEqual({ sound: true, speak: false })
  })

  it('reads a call sheet as sentences: your call first, then the running order, then the crew', () => {
    const t = (key, v = {}) => `${key}${Object.keys(v).length ? ' ' + JSON.stringify(v) : ''}`
    const fmt = (d, p) => `${d}|${p}`
    const text = callSheetSpeech({
      gig: { name: 'Gala', venue: 'Coliseu', start_date: '2026-11-03' },
      schedule: [
        { day: '2026-11-03', start_time: '14:00:00', title: 'Soundcheck' },
        { day: '2026-11-03', start_time: '08:00:00', end_time: '10:00:00', title: 'Load-in', location: 'Dock B', notes: 'Bring gloves' },
      ],
      crew: [{ user_id: 'me', call_time: '08:00:00', function_title: 'Rigger' }, { user_id: 'x', call_time: '09:00:00' }],
      nameOf: id => (id === 'x' ? 'Ana' : 'Me'),
      me: 'me',
    }, { t, fmt })
    const lines = text.split('\n')
    expect(lines[0]).toBe('Gala.')
    expect(lines[1]).toBe('Coliseu, 2026-11-03|EEEE, d MMMM.')
    expect(lines[2]).toBe('speak.yourCall {"time":"08:00"}, Rigger.')
    expect(text.indexOf('Load-in')).toBeLessThan(text.indexOf('Soundcheck'))
    expect(text).toContain('speak.at {"place":"Dock B"}')
    expect(text).toContain('Bring gloves')
    expect(lines.at(-1)).toBe('Ana, speak.call {"time":"09:00"}.')
  })
})
