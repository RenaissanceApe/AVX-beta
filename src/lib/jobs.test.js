import { describe, it, expect } from 'vitest'
import { emptyPost, postPayload, payText, jobError } from './jobs'

const t = (k, v = {}) => `${k}${v.amount ? `(${v.amount})` : ''}`

describe('job board', () => {
  it('starts a post from the gig and its position', () => {
    expect(emptyPost({ start_date: '2026-11-10', end_date: null }, { id: 'p1', title: 'Rigger', quantity: 2, notes: 'Truss' }))
      .toMatchObject({ position_id: 'p1', title: 'Rigger', quantity: 2, starts_on: '2026-11-10', ends_on: '2026-11-10', description: 'Truss', pay_mode: 'ask_rate' })
  })

  it('turns the form into the payload', () => {
    const { payload, errors } = postPayload({ ...emptyPost({ start_date: '2026-11-10', end_date: '2026-11-11' }), title: ' Rigger ', function_key: 'rigger', quantity: '80',
      place: { label: 'Porto, Portugal', country: 'PT', lat: 41.15, lng: -8.61 }, languages: ['pt', 'en', 'pt'], pay_mode: 'fixed', pay_amount: '150,5', pay_max: '200', currency: 'EUR' })
    expect(errors).toEqual([])
    expect(payload).toMatchObject({ title: 'Rigger', function_key: 'rigger', quantity: 50, place: 'Porto, Portugal', country: 'PT', lat: 41.15,
      languages: ['pt', 'en'], pay_mode: 'fixed', pay_amount: 150.5, pay_max: 200, pay_per: 'day', starts_on: '2026-11-10', ends_on: '2026-11-11' })
    expect(postPayload({ ...emptyPost({}), title: '' }).errors).toEqual(['title', 'dates'])
    expect(postPayload({ ...emptyPost({ start_date: '2026-11-10' }), title: 'x', pay_mode: 'fixed', pay_amount: '' }).errors).toEqual(['pay'])
    expect(postPayload({ ...emptyPost({ start_date: '2026-11-10' }), title: 'x', pay_mode: 'fixed', pay_amount: '200', pay_max: '100' }).errors).toEqual(['pay'])
    expect(postPayload({ ...emptyPost({ start_date: '2026-11-10' }), title: 'x', pay_amount: '200' }).payload.pay_amount).toBeNull()
  })

  it('says how pay works', () => {
    expect(payText({ pay_mode: 'ask_rate' }, t, 'en')).toBe('jobs.pay.askRate')
    expect(payText({ pay_mode: 'fixed', pay_amount: 180, pay_per: 'day', currency: 'EUR' }, t, 'en')).toBe('jobs.pay.per.day(€180.00)')
    expect(payText({ pay_mode: 'fixed', pay_amount: 150, pay_max: 200, pay_per: 'job', currency: 'GBP' }, t, 'en')).toBe('jobs.pay.per.job(£150.00–£200.00)')
  })

  it('explains the database’s refusals', () => {
    expect(jobError({ message: 'Two-step sign-in needed to post', code: '42501' })).toBe('jobs.err.twoStep')
    expect(jobError({ message: 'Open post limit reached', code: '54000' })).toBe('jobs.err.postLimit')
    expect(jobError({ message: 'Your day rate is asked for' })).toBe('jobs.err.rate')
    expect(jobError({ message: 'Already applied', code: '23505' })).toBe('jobs.err.applied')
    expect(jobError({ message: 'Not allowed', code: '42501' })).toBe('jobs.err.notAllowed')
    expect(jobError({ message: 'boom' })).toBeNull()
  })
})
