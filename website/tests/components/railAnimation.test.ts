// W17 (round 10): the side-rail motion rules — icons enter from their own edge
// with a stagger, on close each flies into the arrow handle's MEASURED centre
// (an estimate when it was never measured), the arrow keeps its -50% centring
// in every state, and a swipe counts only near the edge or the handle.
import { renderHook, act } from '@testing-library/react'
import {
  backdropMotion, handleMotion, isEdgeTouch, makeRailVariants, railAsideMotion, useRailDeltas, EXIT_DURATION,
} from '@/components/layout/railAnimation'

beforeEach(() => {
  Object.assign(window, { innerWidth: 400, innerHeight: 800 })
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 1 })
})

describe('rail animation', () => {
  it('enter: from the edge, staggered; exit: into the estimated handle when not measured', () => {
    const v = makeRailVariants(3, 'left', { current: [] })
    expect(v.from.x).toBe(-28)
    expect(v.shown(2).transition.delay).toBeCloseTo(0.09)
    expect(v.gone(0)).toMatchObject({ x: -40, y: 92, scale: 0.1 })
    const r = makeRailVariants(3, 'right', { current: [{ x: 5, y: 6 }] })
    expect(r.gone(0)).toMatchObject({ x: 5, y: 6 })
    expect(r.gone(2)).toMatchObject({ x: 40, y: -92 })
  })

  it('measures each icon against the handle centre; re-measures on scroll and resize; stops when closed', () => {
    const { result, rerender, unmount } = renderHook(({ open }) => useRailDeltas(open, 'right', 1), { initialProps: { open: false } })
    const rail = document.createElement('div')
    rail.getBoundingClientRect = () => ({ left: 300, top: 100 } as DOMRect)
    const item = document.createElement('div')
    Object.defineProperties(item, { offsetLeft: { value: 20 }, offsetTop: { value: 50 }, offsetWidth: { value: 40 }, offsetHeight: { value: 40 } })
    result.current.railRef.current = rail
    result.current.setItemRef(0)(item)
    rerender({ open: true })
    // centre (340, 170) → handle (388, 400)
    expect(result.current.deltas.current[0]).toEqual({ x: 48, y: 230 })
    Object.assign(window, { innerHeight: 1000 })
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(result.current.deltas.current[0].y).toBe(330)
    Object.defineProperty(rail, 'scrollTop', { value: 30, configurable: true })
    act(() => { rail.dispatchEvent(new Event('scroll')) })
    expect(result.current.deltas.current[0].y).toBe(360)
    unmount()
  })

  it('the arrow stays centred (-50%) in every state; the rail and backdrop hold through the flight', () => {
    const h = handleMotion('left')
    expect([h.initial.y, h.animate.y, h.exit.y]).toEqual(['-50%', '-50%', '-50%'])
    expect(h.initial.x).toBe(-24)
    expect(handleMotion('right').exit.x).toBe(24)
    expect(railAsideMotion.exit.transition.duration).toBeGreaterThan(EXIT_DURATION)
    expect(backdropMotion.exit.transition.delay).toBeGreaterThan(0.5)
  })

  it('a swipe starts at the edge or near the mid-edge handle only', () => {
    expect(isEdgeTouch(10, 50, 'left')).toBe(true)
    expect(isEdgeTouch(60, 400, 'left')).toBe(true)
    expect(isEdgeTouch(60, 100, 'left')).toBe(false)
    expect(isEdgeTouch(395, 50, 'right')).toBe(true)
    expect(isEdgeTouch(200, 400, 'right')).toBe(false)
  })
})
