import React from 'react';

export const useQuery = () => ({ data: null, isLoading: false, isError: false });

export class QueryClient {
  invalidateQueries = () => Promise.resolve();
}

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
