import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { keyBytes, deviceName } = await import('./push')

describe('push notifications', () => {
  it('turns the base64url push key into bytes', () => {
    expect([...keyBytes('AQID')]).toEqual([1, 2, 3])
    expect([...keyBytes('_-8')]).toEqual([255, 239])
    expect(keyBytes('BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U').length).toBe(65)
  })
  it('names the device for the list of devices', () => {
    expect(deviceName('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36')).toBe('Chrome · Android')
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe('Safari · iOS')
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0')).toBe('Edge · Windows')
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0')).toBe('Firefox · macOS')
  })
})
