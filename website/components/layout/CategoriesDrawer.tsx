'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Loader2 } from 'lucide-react'
import { useCityContext } from '@/context/CityContext'
import { categoriesApi } from '@/lib/api'
import { useLeftDrawer } from '@/store/leftDrawer'
import { hideConsumerChrome } from '@/lib/restaurantChrome'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock'
import SmartImage from '@/components/ui/SmartImage'
import {
  HANDLE_APPEAR_DELAY,
  RAIL_EASE,
  RAIL_ITEM_DURATION,
  railItemMotion,
} from './railAnimation'

/** Paths where the drawers make no sense (portals, gates, PIN screens). */
export function hideDrawerOnPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return (
    hideConsumerChrome(pathname) ||
    pathname.startsWith('/select-city') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname.startsWith('/settings/pin')
  )
}

const EDGE_ZONE_PX = 28
const SWIPE_OPEN_PX = 48
const SWIPE_CLOSE_PX = 48

function CategoryFallback({ initial }: { initial: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200 text-lg font-bold text-primary-700">
      {initial}
    </div>
  )
}

/**
 * Left edge rail with the shop categories: a slim TRANSPARENT strip of
 * category icons with bold Urdu names beneath — nothing else. Overlays the
 * page (never pushes it); opens from the edge handle or a swipe from the
 * left edge, closes with backdrop tap, Escape, or a left swipe.
 */
export default function CategoriesDrawer() {
  const pathname = usePathname()
  const { open, setOpen } = useLeftDrawer()
  const { selectedCityId } = useCityContext()
  const reduceMotion = useReducedMotion()
  const touchRef = useRef<{ x: number; y: number; edge: boolean } | null>(null)

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories', selectedCityId],
    queryFn: () => categoriesApi.getAll(),
    enabled: !!selectedCityId,
  })

  // Swipe from the left edge opens; swipe left (anywhere) closes while open.
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      touchRef.current = { x: t.clientX, y: t.clientY, edge: t.clientX <= EDGE_ZONE_PX }
    }
    const onTouchMove = (e: TouchEvent) => {
      const start = touchRef.current
      const t = e.touches[0]
      if (!start || !t) return
      const dx = t.clientX - start.x
      const dy = Math.abs(t.clientY - start.y)
      if (dy > 70) return
      if (!open && start.edge && dx > SWIPE_OPEN_PX) {
        setOpen(true)
        touchRef.current = null
      } else if (open && dx < -SWIPE_CLOSE_PX) {
        setOpen(false)
        touchRef.current = null
      }
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
    }
  }, [open, setOpen])

  // Escape closes; page scroll locks while the drawer overlays the content.
  // Shared counter lock — a local save/restore re-froze the body when both
  // drawers closed together (the welcome peek), killing scroll on every page.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    lockBodyScroll()
    return () => {
      document.removeEventListener('keydown', onKey)
      unlockBodyScroll()
    }
  }, [open, setOpen])

  // Early return AFTER all hooks (rules-of-hooks).
  if (hideDrawerOnPath(pathname) || !selectedCityId) return null

  return (
    <>
      {/* Edge handle — the small international-style puller, visible when closed */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ x: -32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -32, opacity: 0 }}
            // Waits for the icons to finish merging into this spot.
            transition={{ duration: 0.25, delay: HANDLE_APPEAR_DELAY }}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open categories"
            className="fixed left-0 top-1/2 z-40 -translate-y-1/2 flex h-16 w-6 items-center justify-center rounded-r-2xl bg-gradient-to-b from-primary-600 to-primary-700 text-white shadow-[2px_0_10px_rgba(0,0,0,0.18)] transition-all hover:w-7 active:w-7"
          >
            <ChevronRight className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — the rail overlays the page content, never pushes it */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[75] bg-black/45 backdrop-blur-[2px]"
            />

            {/* Transparent icon rail — the icons themselves fly out of / back
                into the handle spot, so the rail only fades. */}
            <motion.aside
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: RAIL_ITEM_DURATION, ease: RAIL_EASE }}
              role="dialog"
              aria-label="Categories"
              className="fixed left-0 top-0 bottom-0 z-[80] flex w-[104px] max-w-[30vw] flex-col overflow-y-auto overscroll-contain px-2 py-6"
            >
              {isLoading ? (
                <div className="m-auto">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              ) : !categories || categories.length === 0 ? null : (
                <ul className="my-auto flex flex-col items-center gap-5">
                  {categories.map((category, i) => (
                    <motion.li
                      key={category.id}
                      {...(reduceMotion
                        ? {}
                        : railItemMotion(i, categories.length, 'left'))}
                    >
                      <Link
                        href={`/category/${category.slug}`}
                        onClick={() => setOpen(false)}
                        className="group flex flex-col items-center gap-1 active:scale-95 transition-transform"
                      >
                        <span className="relative h-14 w-14 overflow-hidden rounded-full bg-white shadow-lg ring-2 ring-white/80">
                          <SmartImage
                            src={category.image}
                            alt={category.name}
                            fill
                            sizes="56px"
                            className="object-cover transition-transform duration-300 group-hover:scale-110"
                            fallback={<CategoryFallback initial={category.name.charAt(0)} />}
                          />
                        </span>
                        <span
                          dir="rtl"
                          className="max-w-[96px] text-center font-urdu text-[13px] font-bold leading-6 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
                        >
                          {category.nameUrdu || category.name}
                        </span>
                      </Link>
                    </motion.li>
                  ))}
                </ul>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
