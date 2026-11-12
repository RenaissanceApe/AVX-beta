import { describe, it, expect } from 'vitest'
import { bridle, pickFromLegs, bridlesOf, WARN_ANGLE } from './bridle'

// Hand calculations: T = W·sin(other leg's angle) / sin(sum of the angles from vertical)
describe('bridle', () => {
  it('symmetric 90° bridle: each leg carries W/√2 and pulls the beams in by W/2', () => {
    const b = bridle({ span: 4, leg1: Math.SQRT2 * 2, leg2: Math.SQRT2 * 2, load: 1000 })
    expect(b.pick).toEqual({ x: 2, depth: 2 })
    expect(b.included).toBe(90)
    expect(b.legs.map(l => l.angle)).toEqual([45, 45])
    expect(b.legs.map(l => l.tension)).toEqual([707.1, 707.1])
    expect(b.horizontal).toBe(500)
    expect(b.legs.map(l => l.vertical)).toEqual([500, 500])
    expect(b.overAngle).toBe(false)
  })

  it('at 120° each leg carries the whole load; wider than that is a warning', () => {
    const at = bridle({ span: 2 * Math.sqrt(3), leg1: 2, leg2: 2, load: 500 })
    expect(at.included).toBe(120)
    expect(at.legs[0].tension).toBe(500)
    expect(at.overAngle).toBe(false)
    const wide = bridle({ span: 3.6, leg1: 2, leg2: 2, load: 500 })
    expect(wide.included).toBeGreaterThan(WARN_ANGLE)
    expect(wide.overAngle).toBe(true)
    expect(wide.legs[0].tension).toBeGreaterThan(500)
  })

  it('asymmetric pick point (by position): tensions and horizontal force by hand', () => {
    // A at 0, B at 4 m; pick 1 m from A, 1 m down: leg 1 at 45°, leg 2 at atan(3) = 71.57°
    const b = bridle({ mode: 'point', span: 4, x: 1, depth: 1, load: 1000 })
    expect(b.legs[0].length).toBe(1.41)
    expect(b.legs[1].length).toBe(3.16)
    expect(b.legs[0].angle).toBe(45)
    expect(b.legs[1].angle).toBe(71.6)
    expect(b.legs[0].tension).toBeCloseTo(1060.7, 1)
    expect(b.legs[1].tension).toBeCloseTo(790.6, 1)
    expect(b.horizontal).toBe(750)
    // Equilibrium: the vertical parts add up to the load
    expect(b.legs[0].vertical + b.legs[1].vertical).toBeCloseTo(1000, 0)
  })

  it('legs and position agree with each other', () => {
    const fromPoint = bridle({ mode: 'point', span: 6, x: 2.5, depth: 1.8, load: 800 })
    const fromLegs = bridle({ span: 6, leg1: Math.hypot(2.5, 1.8), leg2: Math.hypot(3.5, 1.8), load: 800 })
    expect(fromLegs.pick).toEqual(fromPoint.pick)
    expect(fromLegs.legs.map(l => l.tension)).toEqual(fromPoint.legs.map(l => l.tension))
  })

  it('beam points at different heights', () => {
    // B 1 m higher; pick 2 m along, 2 m below A: leg 1 at 45°, leg 2 rises 3 m over 2 m
    const p = pickFromLegs({ span: 4, rise: 1, leg1: Math.hypot(2, 2), leg2: Math.hypot(2, 3) })
    expect(p.x).toBeCloseTo(2, 6)
    expect(p.y).toBeCloseTo(-2, 6)
    const b = bridle({ span: 4, rise: 1, leg1: Math.hypot(2, 2), leg2: Math.hypot(2, 3), load: 1000 })
    // Horizontal parts balance
    expect(b.legs[0].tension * Math.sin((b.legs[0].angle * Math.PI) / 180)).toBeCloseTo(b.legs[1].tension * Math.sin((b.legs[1].angle * Math.PI) / 180), -1)
    expect(b.legs[0].vertical + b.legs[1].vertical).toBeCloseTo(1000, 0)
  })

  it('refuses shapes that can\'t hang', () => {
    expect(bridle({ span: 4, leg1: 1.9, leg2: 2, load: 100 }).problem).toBe('tooShort')
    expect(bridle({ span: 4, leg1: 1, leg2: 6, load: 100 }).problem).toBe('oneSided')
    expect(bridle({ mode: 'point', span: 4, x: 5, depth: 1, load: 100 }).problem).toBe('outside')
    expect(bridle({ mode: 'point', span: 4, x: 0, depth: 1, load: 100 }).problem).toBe('outside')
    expect(bridle({ mode: 'point', span: 4, rise: -2, x: 2, depth: 1, load: 100 }).problem).toBe('pickAbove')
    expect(bridle({ span: 0, leg1: 2, leg2: 2 }).problem).toBe('missing')
  })

  it('checks each leg against the WLL of its weakest piece', () => {
    const b = bridle({ span: 4, leg1: Math.SQRT2 * 2, leg2: Math.SQRT2 * 2, load: 1000, wll1: 1000, wll2: 700 })
    expect(b.legs[0].status).toBe('ok')
    expect(b.legs[1].status).toBe('over')
    expect(b.over).toBe(true)
    expect(bridle({ span: 4, leg1: 3, leg2: 3, load: 100 }).legs[0].status).toBe('noWll')
    expect(bridle({ span: 4, leg1: Math.SQRT2 * 2, leg2: Math.SQRT2 * 2, load: 1000, wll1: 850 }).legs[0].status).toBe('near')
  })

  it('reads what a gig keeps, within limits', () => {
    const [b] = bridlesOf({ bridles: [{ id: 'b1', span: 99, leg1: '2', mode: 'x' }, { nope: 1 }] })
    expect(b).toMatchObject({ id: 'b1', span: 50, leg1: 2, leg2: null, mode: 'legs', rise: 0, load: 0 })
    expect(bridlesOf(null)).toEqual([])
  })
})
