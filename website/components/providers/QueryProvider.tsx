'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Render free tier sleeps after 15 min idle and the next request
            // takes 30-60s to wake the container. We can't kill the cold
            // start but we can stop firing fresh requests on every nav.
            // staleTime: 5 min covers a typical browse session — categories
            // and product lists won't refetch unless explicitly invalidated.
            staleTime: 5 * 60 * 1000,
            // Keep cached data around for 30 min after the last component
            // unmounts so back-button navigation is instant.
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: false,
            // Retry once on failure (the cold-start case) before showing
            // an error toast.
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
