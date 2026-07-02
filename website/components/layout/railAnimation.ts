// One animation language for BOTH edge rails (categories left, utilities
// right): every icon flies OUT of the mid-edge point where the green puller
// handle sits, and converges back INTO it on close — same duration, same
// easing, same style on both sides.

export const RAIL_EASE = [0.4, 0, 0.2, 1] as const
export const RAIL_ITEM_DURATION = 0.3
export const RAIL_STAGGER = 0.045
/** Approximate vertical rhythm of one rail item (chip + label + gap). */
const RAIL_ITEM_SPACING = 88
/** Handle re-appears only after the icons have merged into its spot. */
export const HANDLE_APPEAR_DELAY = 0.22

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
    x: sign * 56,
    y: (mid - i) * RAIL_ITEM_SPACING,
    scale: 0.25,
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
        ease: RAIL_EASE,
      },
    },
    exit: {
      ...fromHandle,
      transition: { duration: RAIL_ITEM_DURATION, ease: RAIL_EASE },
    },
  }
}
