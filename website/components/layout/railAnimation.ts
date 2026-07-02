'use client'

// One animation language for BOTH edge rails (categories left, utilities
// right).
//
// OPEN  — calm and clean: each icon slides in a touch from its own edge and
//         settles with a soft stagger. No arrow theatrics.
// CLOSE — the signature: every icon flies INTO the arrow handle's exact,
//         MEASURED centre, staying visible for most of the flight while the
//         arrow is already there to receive it; the backdrop holds its dim
//         until the merge finishes.

import { useCallback, useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'

/** Ease-out for entering (decelerates into place). */
export const RAIL_EASE_OUT = [0.22, 0.61, 0.36, 1] as const
/** Ease-in for leaving (accelerates INTO the handle). */
export const RAIL_EASE_IN = [0.55, 0.06, 0.68, 0.19] as const
const ENTER_DURATION = 0.4
const ENTER_STAGGER = 0.05
export const EXIT_DURATION = 0.55
/** The arrow shows up early in the close so the icons visibly sink into it. */
export const HANDLE_APPEAR_DELAY = 0.18
/** Horizontal centre of the arrow handle, measured from the screen edge. */
const HANDLE_CENTER_X = 12

export interface RailDelta {
  x: number
  y: number
}

/** Fallback when an item was never measured: roughly the edge at mid-height. */
function estimateDelta(i: number, count: number, edge: 'left' | 'right'): RailDelta {
  const sign = edge === 'left' ? -1 : 1
  const mid = (count - 1) / 2
  return { x: sign * 40, y: (mid - i) * 92 }
}

/**
 * Measures where each rail item actually sits so the close can fly it into
 * the handle's exact centre. Uses offsetTop/offsetLeft (layout values,
 * unaffected by in-flight transforms) relative to the rail, which never
 * animates transforms. Re-measures on rail scroll and resize.
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
 * Variants for one rail item. Enter: a small slide from the edge — simple
 * and calm. Exit ("gone") is a FUNCTION so it reads the freshly measured
 * deltas at animation time (exit props get snapshotted by AnimatePresence,
 * but the ref closure stays live); opacity holds until ~80% of the flight
 * so the icon is SEEN sinking into the arrow.
 */
export function makeRailVariants(
  count: number,
  edge: 'left' | 'right',
  deltas: MutableRefObject<RailDelta[]>
) {
  const sign = edge === 'left' ? -1 : 1
  const target = (i: number): RailDelta => deltas.current[i] ?? estimateDelta(i, count, edge)
  return {
    from: {
      opacity: 0,
      x: sign * 28,
      y: 0,
      scale: 0.92,
    },
    shown: (i: number) => ({
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: {
        delay: 0.05 + i * ENTER_STAGGER,
        duration: ENTER_DURATION,
        ease: RAIL_EASE_OUT,
      },
    }),
    gone: (i: number) => ({
      opacity: [1, 1, 0],
      x: target(i).x,
      y: target(i).y,
      scale: 0.1,
      transition: {
        duration: EXIT_DURATION,
        ease: RAIL_EASE_IN,
        opacity: { duration: EXIT_DURATION, times: [0, 0.8, 1] },
      },
    }),
  }
}

/** The rail container holds steady while its icons fly — no fade of its own. */
export const railAsideMotion = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit: { opacity: 1, transition: { duration: EXIT_DURATION } },
}

/**
 * Backdrop: quick dim on open; on close it HOLDS the dim almost until the
 * icons finish merging (fading it early washed the flight out over light
 * page content).
 */
export const backdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.3, delay: 0.3, ease: 'easeOut' } },
}

/**
 * Arrow handle. Framer's inline transform REPLACES Tailwind's
 * -translate-y-1/2, so y:'-50%' is baked into every state — without it the
 * arrow rode ~32px below centre and the icons converged on empty space.
 * On close it fades in EARLY so the icons land on a visible arrow.
 */
export function handleMotion(edge: 'left' | 'right') {
  const sign = edge === 'left' ? -1 : 1
  // Hidden position is off-screen past its own edge: left handle at -24,
  // right handle at +24.
  return {
    initial: { x: sign * 24, y: '-50%', opacity: 0 },
    animate: {
      x: 0,
      y: '-50%',
      opacity: 1,
      transition: { duration: 0.3, delay: HANDLE_APPEAR_DELAY, ease: RAIL_EASE_OUT },
    },
    exit: {
      x: sign * 24,
      y: '-50%',
      opacity: 0,
      transition: { duration: 0.15 },
    },
  }
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
