'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Loader2, ShoppingBasket } from 'lucide-react'
import { useCityContext } from '@/context/CityContext'
import { categoriesApi } from '@/lib/api'
import { useLeftDrawer } from '@/store/leftDrawer'
import { useBasketUi } from '@/store/basketUi'
import { hideConsumerChrome } from '@/lib/restaurantChrome'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock'
import SmartImage from '@/components/ui/SmartImage'
import {
  backdropMotion,
  handleMotion,
  isEdgeTouch,
  makeRailVariants,
  railAsideMotion,
  useRailDeltas,
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

const SWIPE_OPEN_PX = 36
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
  const openBasket = useBasketUi((s) => s.open)
  const { selectedCityId } = useCityContext()
  const reduceMotion = useReducedMotion()
  const touchRef = useRef<{ x: number; y: number; edge: boolean } | null>(null)

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories', selectedCityId],
    queryFn: () => categoriesApi.getAll(),
    enabled: !!selectedCityId,
  })

  // Categories + the Today's Basket chip; measured so each icon flies
  // exactly from/into the arrow handle's centre.
  const itemCount = (categories?.length ?? 0) + 1
  const { railRef, setItemRef, deltas } = useRailDeltas(open, 'left', itemCount)
  const railVariants = makeRailVariants(itemCount, 'left', deltas)

  // Swipe from the left edge opens; swipe left (anywhere) closes while open.
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      // Edge strip OR the wider zone around the mid-edge handle counts.
      touchRef.current = {
        x: t.clientX,
        y: t.clientY,
        edge: isEdgeTouch(t.clientX, t.clientY, 'left'),
      }
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
            // Appears early during the close so the icons land on a visible
            // arrow (y:'-50%' keeps it centred — framer overrides Tailwind).
            {...handleMotion('left')}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open categories"
            className="fixed left-0 top-1/2 z-40 flex h-16 w-6 items-center justify-center rounded-r-2xl bg-gradient-to-b from-primary-600 to-primary-700 text-white shadow-[2px_0_10px_rgba(0,0,0,0.18)] transition-[width] hover:w-7 active:w-7"
          >
            <ChevronRight className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — holds its dim on close until the icons merge */}
            <motion.div
              {...backdropMotion}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[75] bg-black/45 backdrop-blur-[2px]"
            />

            {/* Transparent icon rail — the icons themselves fly out of / back
                into the handle spot; the rail fades late so the convergence
                stays visible. */}
            <motion.aside
              ref={railRef}
              {...railAsideMotion}
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
                      ref={setItemRef(i)}
                      {...(reduceMotion
                        ? {}
                        : {
                            custom: i,
                            variants: railVariants,
                            initial: 'from',
                            animate: 'shown',
                            exit: 'gone',
                          })}
                    >
                      <Link
                        href={`/category/${category.slug}`}
                        onClick={() => setOpen(false)}
                        className="group flex flex-col items-center gap-1 active:scale-95 transition-transform"
                      >
                        <span className="relative h-12 w-12 overflow-hidden rounded-full bg-white shadow-lg ring-2 ring-white/70">
                          <SmartImage
                            src={category.image}
                            alt={category.name}
                            fill
                            sizes="48px"
                            className="object-cover transition-transform duration-300 group-hover:scale-110"
                            fallback={<CategoryFallback initial={category.name.charAt(0)} />}
                          />
                        </span>
                        <span
                          dir="rtl"
                          className="max-w-[96px] text-center font-urdu text-[12px] font-bold leading-5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
                        >
                          {category.nameUrdu || category.name}
                        </span>
                      </Link>
                    </motion.li>
                  ))}

                  {/* Today's Basket — sits after the categories */}
                  <motion.li
                    key="todays-basket"
                    ref={setItemRef(categories.length)}
                    {...(reduceMotion
                      ? {}
                      : {
                          custom: categories.length,
                          variants: railVariants,
                          initial: 'from',
                          animate: 'shown',
                          exit: 'gone',
                        })}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        openBasket()
                      }}
                      className="group flex flex-col items-center gap-1 active:scale-95 transition-transform"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg ring-2 ring-white/70">
                        <ShoppingBasket className="h-5 w-5 text-white" />
                      </span>
                      <span
                        dir="rtl"
                        className="max-w-[96px] text-center font-urdu text-[12px] font-bold leading-5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
                      >
                        آج کی ٹوکری
                      </span>
                    </button>
                  </motion.li>
                </ul>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
