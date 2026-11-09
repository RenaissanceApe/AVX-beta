import { describe, it, expect } from 'vitest'
import { printLink } from './printLink'

describe('printLink', () => {
  it('points at the same page in the app', () => {
    expect(printLink('https://app.example.com', '/gig/abc/inputs')).toBe('https://app.example.com/gig/abc/inputs')
  })
  it('tidies slashes and keeps ordinary query values', () => {
    expect(printLink('https://app.example.com/', 'gig/abc/callsheet', '?large=1')).toBe('https://app.example.com/gig/abc/callsheet?large=1')
  })
  it('never makes a protocol-relative or foreign link', () => {
    expect(printLink('https://app.example.com', '//evil.example/x')).toBe('https://app.example.com/evil.example/x')
    expect(printLink('javascript:alert(1)', '/gig/abc/plot')).toBeNull()
    expect(printLink('', '/gig/abc/plot')).toBeNull()
  })
  it('drops query values that look like secrets', () => {
    expect(printLink('http://localhost:5173', '/gig/abc/plot', '?token=x&view=a&access_key=y')).toBe('http://localhost:5173/gig/abc/plot?view=a')
  })
})
