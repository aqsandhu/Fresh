import React, { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Fresh QueryClient per test: retries off so failures surface immediately,
 * infinite gc/stale so background refetches never fire mid-assertion.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/**
 * Renders a screen/component under the same providers the real app root
 * (App.tsx) supplies. Add future app-level providers HERE so every test
 * picks them up in one place instead of failing one by one.
 * (SafeArea/AsyncStorage/SecureStore are already mocked globally in jest.setup.js.)
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const queryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}
