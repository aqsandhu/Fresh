// One animation language for BOTH edge rails (categories left, utilities
// right): every icon flies OUT of the mid-edge point where the green puller
// handle sits, and converges back INTO it on close — same duration, same
// easing, same style on both sides.

/** Ease-out for entering (decelerates into place). */
export const RAIL_EASE_OUT = [0.22, 0.61, 0.36, 1] as const
/** Ease-in for leaving (accelerates INTO the handle). */
export const RAIL_EASE_IN = [0.55, 0.06, 0.68, 0.19] as const
export const RAIL_ITEM_DURATION = 0.5
export const RAIL_STAGGER = 0.06
/** Approximate vertical rhythm of one rail item (chip + label + gap). */
const RAIL_ITEM_SPACING = 80
/** Handle re-appears only after the icons have merged into its spot. */
export const HANDLE_APPEAR_DELAY = 0.5

/**
 * Motion props for rail item `i` of `count` on the given edge. The rail is
 * vertically centered, so the handle sits at the middle item's height —
 * items start from / return to that point (x toward the edge, y toward the
 * middle, shrinking as they go).
 */
export function railItemMotion(i: number, count: number, edge: 'left' | 'right') {
  const sign = edge === 'left' ? -1 : 1
  const mid = (count - 1) / 2
  const fromHandle = {
    opacity: 0,
    x: sign * 64,
    y: (mid - i) * RAIL_ITEM_SPACING,
    scale: 0.15,
  }
  return {
    initial: fromHandle,
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: {
        delay: 0.05 + i * RAIL_STAGGER,
        duration: RAIL_ITEM_DURATION,
        ease: RAIL_EASE_OUT,
      },
    },
    exit: {
      ...fromHandle,
      transition: { duration: RAIL_ITEM_DURATION, ease: RAIL_EASE_IN },
    },
  }
}

/** The rail container itself only fades — gently, AFTER the icons converge. */
export const railAsideMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { delay: 0.3, duration: 0.25 } },
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
