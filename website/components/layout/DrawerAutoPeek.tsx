'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useCityContext } from '@/context/CityContext'
import { useLeftDrawer } from '@/store/leftDrawer'
import { useRightDrawer } from '@/store/rightDrawer'
import { hideDrawerOnPath } from './CategoriesDrawer'

const PEEK_DELAY_MS = 600
const PEEK_DURATION_MS = 1800

/**
 * Welcome peek: when the home page opens, both edge drawers slide open for
 * about a second and close again — so shoppers discover the pull handles.
 */
export default function DrawerAutoPeek() {
  const pathname = usePathname()
  const { selectedCityId } = useCityContext()
  const setLeft = useLeftDrawer((s) => s.setOpen)
  const setRight = useRightDrawer((s) => s.setOpen)

  useEffect(() => {
    if (pathname !== '/' || !selectedCityId || hideDrawerOnPath(pathname)) return

    const openTimer = setTimeout(() => {
      setLeft(true)
      setRight(true)
    }, PEEK_DELAY_MS)
    const closeTimer = setTimeout(() => {
      setLeft(false)
      setRight(false)
    }, PEEK_DELAY_MS + PEEK_DURATION_MS)

    return () => {
      clearTimeout(openTimer)
      clearTimeout(closeTimer)
      setLeft(false)
      setRight(false)
    }
  }, [pathname, selectedCityId, setLeft, setRight])

  return null
}
