// Shared body scroll lock. Multiple overlays (left drawer, right drawer,
// modals) can be open at once — a plain save/restore per component re-locks
// the body when they close in the wrong order (this is exactly what froze
// page scroll after the home-page drawer peek). A counter fixes that: the
// body unlocks only when the LAST holder releases.

let locks = 0

export function lockBodyScroll(): void {
  locks++
  if (locks === 1) document.body.style.overflow = 'hidden'
}

export function unlockBodyScroll(): void {
  locks = Math.max(0, locks - 1)
  if (locks === 0) document.body.style.overflow = ''
}
