'use client'

import { useQuery } from '@tanstack/react-query'
import { serviceAreaApi } from '@/lib/api'
import { useCityContext } from '@/context/CityContext'
import type { ServiceAreaData } from '@/lib/serviceArea'

/**
 * Loads the selected city's delivery polygons + out-of-area popup copy.
 * Cached per city; safe to call from multiple components.
 */
export function useServiceArea() {
  const { selectedCityId } = useCityContext()
  return useQuery<ServiceAreaData>({
    queryKey: ['service-area', selectedCityId],
    queryFn: serviceAreaApi.get,
    enabled: Boolean(selectedCityId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
