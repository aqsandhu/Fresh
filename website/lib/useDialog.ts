'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keyboard behaviour of a modal dialog (WAI-ARIA dialog pattern), for the
 * element the returned ref is put on (which also gets role="dialog",
 * aria-modal="true" and a label):
 *  - focus moves into it when it opens (first field, else the dialog itself —
 *    never straight onto a confirm button),
 *  - Tab / Shift+Tab stay inside,
 *  - Escape closes it,
 *  - focus goes back to the control that opened it.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement as HTMLElement | null
    const panel = ref.current
    const items = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    const firstField = panel?.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
    if (panel && !panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1')
    ;(firstField ?? panel)?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const list = items()
      if (list.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [open])

  return ref
}
