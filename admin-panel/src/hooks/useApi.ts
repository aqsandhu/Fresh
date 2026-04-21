import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import toast from 'react-hot-toast';

// Generic hook for fetching data
export function useFetch<T>(
  queryKey: readonly unknown[],
  fetchFn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery<T, Error>({
    queryKey,
    queryFn: fetchFn,
    ...options,
  });
}

// Generic hook for mutations with toast notifications
export function useMutate<T, V>(
  mutationFn: (variables: V) => Promise<T>,
  options?: {
    successMessage?: string;
    errorMessage?: string;
    invalidateQueries?: string[][];
    onSuccess?: (data: T, variables: V) => void;
    onError?: (error: Error, variables: V) => void;
  }
) {
  const queryClient = useQueryClient();

  return useMutation<T, Error, V>({
    mutationFn,
    onSuccess: (data, variables) => {
      if (options?.successMessage) {
        toast.success(options.successMessage);
      }
      
      if (options?.invalidateQueries) {
        options.invalidateQueries.forEach((queryKey) => {
          queryClient.invalidateQueries({ queryKey });
        });
      }
      
      options?.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      if (options?.errorMessage) {
        toast.error(options.errorMessage);
      }
      options?.onError?.(error, variables);
    },
  });
}

// Hook for pagination
export function usePagination(initialPage = 1, initialLimit = 10) {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);

  const nextPage = () => setPage((p) => p + 1);
  const prevPage = () => setPage((p) => Math.max(1, p - 1));
  const goToPage = (p: number) => setPage(Math.max(1, p));

  return {
    page,
    limit,
    setPage,
    setLimit,
    nextPage,
    prevPage,
    goToPage,
    offset: (page - 1) * limit,
  };
}
