'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  getSelectedCityId,
  getSelectedCityName,
  getStoredCity,
  setSelectedCity as persistCity,
  type StoredCity,
} from '@/lib/cityStorage'
import { useCartStore } from '@/store/cartStore'

export interface ServiceCity {
  id: string
  name: string
  province: string
}

interface CityContextValue {
  cities: ServiceCity[]
  selectedCity: StoredCity | null
  selectedCityId: string | null
  isLoading: boolean
  isReady: boolean
  setCity: (city: ServiceCity | StoredCity) => void
  reloadCities: () => Promise<ServiceCity[]>
}

const CityContext = createContext<CityContextValue | undefined>(undefined)

async function fetchCities(): Promise<ServiceCity[]> {
  try {
    const res = await api.get('/site-settings/cities')
    const data = res.data?.data || res.data || []
    if (!Array.isArray(data)) return []
    return data.map((c: ServiceCity) => ({
      id: c.id,
      name: c.name,
      province: c.province || '',
    }))
  } catch {
    return []
  }
}

export function CityProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const switchCartCity = useCartStore((s) => s.switchCity)

  const [cities, setCities] = useState<ServiceCity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [selectedCity, setSelectedCityState] = useState<StoredCity | null>(null)

  const reloadCities = useCallback(async (): Promise<ServiceCity[]> => {
    setIsLoading(true)
    try {
      const list = await fetchCities()
      setCities(list)
      return list
    } catch {
      setCities([])
      return []
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    reloadCities().then((list) => {
      const stored = getStoredCity()
      if (stored?.id) {
        setSelectedCityState(stored)
        switchCartCity(stored.id)
      } else if (list.length > 0) {
        // No city chosen yet — this is every first-time visitor and, crucially,
        // every search-engine crawler (which never has one). Default to the
        // first service city so the page renders real content immediately
        // instead of redirecting to /select-city. That redirect was making the
        // entire site un-indexable on Google ("Page with redirect"). Users can
        // still switch cities any time via the city button.
        const fallback = list[0]
        const def: StoredCity = {
          id: fallback.id,
          name: fallback.name,
          province: fallback.province,
        }
        persistCity(def)
        setSelectedCityState(def)
        switchCartCity(def.id)
      }
      setIsReady(true)
    })
  }, [reloadCities, switchCartCity])

  const setCity = useCallback(
    (city: ServiceCity | StoredCity) => {
      const next: StoredCity = {
        id: city.id,
        name: city.name,
        province: 'province' in city ? city.province : undefined,
      }
      persistCity(next)
      setSelectedCityState(next)
      switchCartCity(next.id)
      queryClient.invalidateQueries()
      router.push('/')
    },
    [queryClient, router, switchCartCity]
  )

  const value = useMemo(
    () => ({
      cities,
      selectedCity,
      selectedCityId: selectedCity?.id ?? getSelectedCityId(),
      isLoading,
      isReady,
      setCity,
      reloadCities,
    }),
    [cities, selectedCity, isLoading, isReady, setCity, reloadCities]
  )

  return <CityContext.Provider value={value}>{children}</CityContext.Provider>
}

export function useCityContext(): CityContextValue {
  const ctx = useContext(CityContext)
  if (!ctx) {
    throw new Error('useCityContext must be used within CityProvider')
  }
  return ctx
}

export function useOptionalCityName(): string {
  const ctx = useContext(CityContext)
  return ctx?.selectedCity?.name || getSelectedCityName() || 'Your city'
}
