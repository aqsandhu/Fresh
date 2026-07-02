'use client'

// One animation language for BOTH edge rails (categories left, utilities
// right): every icon flies OUT of the arrow handle's exact spot on open, and
// converges back INTO it on close. The handle sits at the mid-edge
// (top-1/2, ~24px wide), so its centre is ~12px from the screen edge —
// we MEASURE each icon's real position and aim precisely at that point
// instead of guessing with fixed offsets (the old ±64px guess threw the
// icons off-screen past the handle, which is why the merge never read).

import { useCallback, useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'

/** Ease-out for entering (decelerates into place). */
export const RAIL_EASE_OUT = [0.22, 0.61, 0.36, 1] as const
/** Ease-in for leaving (accelerates INTO the handle). */
export const RAIL_EASE_IN = [0.55, 0.06, 0.68, 0.19] as const
export const RAIL_ITEM_DURATION = 0.55
export const RAIL_STAGGER = 0.06
/** Handle re-appears only after the icons have merged into its spot. */
export const HANDLE_APPEAR_DELAY = 0.55
/** Horizontal centre of the arrow handle, measured from the screen edge. */
const HANDLE_CENTER_X = 12

export interface RailDelta {
  x: number
  y: number
}

/**
 * Fallback when an item was never measured (first-ever open): roughly from
 * the edge at mid-height. Real measurements replace this immediately.
 */
function estimateDelta(i: number, count: number, edge: 'left' | 'right'): RailDelta {
  const sign = edge === 'left' ? -1 : 1
  const mid = (count - 1) / 2
  return { x: sign * 40, y: (mid - i) * 92 }
}

/**
 * Measures where each rail item actually sits so open/close can fly it
 * from/to the handle's exact centre. Uses offsetTop/offsetLeft (layout
 * values, unaffected by in-flight transforms) relative to the rail, which
 * only ever animates opacity. Re-measures on rail scroll and resize.
 */
export function useRailDeltas(open: boolean, edge: 'left' | 'right', count: number) {
  const railRef = useRef<HTMLElement | null>(null)
  const itemRefs = useRef<(HTMLElement | null)[]>([])
  const deltas = useRef<RailDelta[]>([])

  const setItemRef = useCallback(
    (i: number) => (el: HTMLElement | null) => {
      itemRefs.current[i] = el
    },
    []
  )

  useEffect(() => {
    if (!open) return

    const measure = () => {
      const rail = railRef.current
      if (!rail) return
      const railRect = rail.getBoundingClientRect()
      const handleX =
        edge === 'left' ? HANDLE_CENTER_X : window.innerWidth - HANDLE_CENTER_X
      const handleY = window.innerHeight / 2
      itemRefs.current.forEach((el, i) => {
        if (!el) return
        const cx = railRect.left + el.offsetLeft + el.offsetWidth / 2
        const cy = railRect.top + el.offsetTop - rail.scrollTop + el.offsetHeight / 2
        deltas.current[i] = { x: handleX - cx, y: handleY - cy }
      })
    }

    const raf = requestAnimationFrame(measure)
    const rail = railRef.current
    rail?.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      rail?.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [open, edge, count])

  return { railRef, setItemRef, deltas }
}

/**
 * Variants for one rail item. `gone` and `from` are FUNCTIONS so they read
 * the freshly measured deltas at animation time (exit props get snapshotted
 * by AnimatePresence, but the ref closure stays live). Opacity holds until
 * ~70% of the flight so the icon is SEEN arriving at the handle.
 */
export function makeRailVariants(
  count: number,
  edge: 'left' | 'right',
  deltas: MutableRefObject<RailDelta[]>
) {
  const target = (i: number): RailDelta => deltas.current[i] ?? estimateDelta(i, count, edge)
  return {
    from: (i: number) => ({
      opacity: 0,
      x: target(i).x,
      y: target(i).y,
      scale: 0.15,
    }),
    shown: (i: number) => ({
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: {
        delay: 0.05 + i * RAIL_STAGGER,
        duration: RAIL_ITEM_DURATION,
        ease: RAIL_EASE_OUT,
      },
    }),
    gone: (i: number) => ({
      opacity: [1, 1, 0],
      x: target(i).x,
      y: target(i).y,
      scale: 0.15,
      transition: {
        duration: RAIL_ITEM_DURATION,
        ease: RAIL_EASE_IN,
        opacity: { duration: RAIL_ITEM_DURATION, times: [0, 0.7, 1] },
      },
    }),
  }
}

/** The rail container holds steady while its icons fly — no fade of its own
 *  (a fade used to dim the icons mid-flight and hide the merge). */
export const railAsideMotion = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit: { opacity: 1, transition: { duration: RAIL_ITEM_DURATION } },
}

/**
 * True when a touch starts close enough to the edge OR to the mid-edge
 * handle to count as a drawer-opening swipe.
 */
export function isEdgeTouch(x: number, y: number, edge: 'left' | 'right'): boolean {
  const EDGE_PX = 28
  const HANDLE_ZONE_X = 72
  const HANDLE_ZONE_Y = 110
  const fromEdge = edge === 'left' ? x : window.innerWidth - x
  if (fromEdge <= EDGE_PX) return true
  // Wider zone around the handle (vertical middle of the screen).
  return fromEdge <= HANDLE_ZONE_X && Math.abs(y - window.innerHeight / 2) <= HANDLE_ZONE_Y
}
