import { QueryClient } from '@tanstack/react-query';

/**
 * A QueryClient for tests: no retries, and no cache clean-up timer (gcTime
 * Infinity). The default 5-minute timer outlived the test file and kept the
 * jest worker alive — "A worker process has failed to exit gracefully" (D10).
 */
export function newTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}
