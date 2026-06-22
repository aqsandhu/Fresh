'use client'

import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '@/lib/api'

export interface PublicConfig {
  /** When false the Atta Chakki service shows a "coming soon" state. */
  atta_chakki_enabled: boolean
}

// Defaults are intentionally conservative ("off") so a paused feature never
// flashes its full UI before the real flag loads.
const DEFAULT_CONFIG: PublicConfig = {
  atta_chakki_enabled: false,
}

/**
 * Reads the global public feature flags once and caches them (React Query).
 * Returns the resolved config plus the loading state so callers can avoid a
 * flash of the wrong UI.
 */
export function usePublicConfig(): { config: PublicConfig; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['public-config'],
    queryFn: settingsApi.getPublicConfig,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  return { config: { ...DEFAULT_CONFIG, ...(data ?? {}) }, isLoading }
}
