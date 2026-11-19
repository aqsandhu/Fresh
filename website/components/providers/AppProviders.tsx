'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import { CityProvider } from '@/context/CityContext'
import CityGate from '@/components/city/CityGate'
import FloatingCityButton from '@/components/city/FloatingCityButton'
import NotificationProvider from '@/components/providers/NotificationProvider'
import CouponWinPopup from '@/components/coupons/CouponWinPopup'
import VariableWeightNotice from '@/components/products/VariableWeightNotice'
import SavedCartSync from '@/components/providers/SavedCartSync'
import WishlistSync from '@/components/providers/WishlistSync'

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <CityProvider>
        <NotificationProvider>
          <CityGate>{children}</CityGate>
          <FloatingCityButton />
          <CouponWinPopup />
          <VariableWeightNotice />
          <SavedCartSync />
          <WishlistSync />
        </NotificationProvider>
      </CityProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
