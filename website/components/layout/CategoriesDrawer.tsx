'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, LayoutGrid, Loader2, X, ArrowRight } from 'lucide-react'
import { useCityContext } from '@/context/CityContext'
import { categoriesApi } from '@/lib/api'
import { useLeftDrawer } from '@/store/leftDrawer'
import { hideConsumerChrome } from '@/lib/restaurantChrome'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock'
import SmartImage from '@/components/ui/SmartImage'

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
 * Left edge drawer with the shop categories. Overlays the page (never pushes
 * it), opens from the edge handle or a swipe from the left edge, closes with
 * X, backdrop tap, Escape, or a left swipe.
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
            transition={{ duration: 0.25 }}
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
            {/* Backdrop — drawer overlays the page content, never pushes it */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[75] bg-black/40 backdrop-blur-[2px]"
            />

            {/* Panel */}
            <motion.aside
              initial={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
              animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 40 }}
              role="dialog"
              aria-label="Categories"
              className="fixed left-0 top-0 bottom-0 z-[80] flex w-[300px] max-w-[85vw] flex-col overflow-hidden rounded-r-3xl bg-white shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between bg-gradient-to-r from-primary-600 to-primary-700 px-5 py-4 text-white">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <LayoutGrid className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[15px] font-bold leading-tight">Categories</p>
                    <p className="font-urdu text-xs text-primary-100" dir="rtl">
                      کیٹیگری منتخب کریں
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close categories"
                  className="rounded-lg p-1.5 transition hover:bg-white/15"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Category list */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
                {isLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
                  </div>
                ) : !categories || categories.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-500">
                    No categories available yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {categories.map((category, i) => (
                      <motion.li
                        key={category.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 + i * 0.03, duration: 0.25 }}
                      >
                        <Link
                          href={`/category/${category.slug}`}
                          onClick={() => setOpen(false)}
                          className="group flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-primary-50 active:bg-primary-100"
                        >
                          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl ring-1 ring-gray-100">
                            <SmartImage
                              src={category.image}
                              alt={category.name}
                              fill
                              sizes="44px"
                              className="object-cover transition-transform duration-300 group-hover:scale-110"
                              fallback={<CategoryFallback initial={category.name.charAt(0)} />}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-semibold text-gray-900 group-hover:text-primary-700">
                              {category.name}
                            </span>
                            {category.nameUrdu && (
                              <span
                                className="block truncate font-urdu text-xs text-gray-500"
                                dir="rtl"
                              >
                                {category.nameUrdu}
                              </span>
                            )}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-primary-500" />
                        </Link>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 p-3">
                <Link
                  href="/products"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:from-primary-700 hover:to-primary-800 active:scale-[0.98]"
                >
                  View All Products
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
