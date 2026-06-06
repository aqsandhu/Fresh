import { useCallback, useEffect, useState, type ReactNode } from 'react';

export class QueryClient {
  invalidateQueries = jest.fn(() => Promise.resolve());
}

const sharedQueryClient = new QueryClient();

export function useQueryClient() {
  return sharedQueryClient;
}

export function useQuery(options?: {
  queryKey?: unknown;
  queryFn?: () => Promise<unknown>;
  enabled?: boolean;
  staleTime?: number;
}) {
  const [data, setData] = useState<unknown>(undefined);
  const [isLoading, setIsLoading] = useState(Boolean(options?.queryFn && options?.enabled !== false));
  const queryKey = JSON.stringify(options?.queryKey);

  useEffect(() => {
    if (options?.enabled === false || !options?.queryFn) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    options
      .queryFn()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [queryKey, options?.enabled]);

  return {
    data,
    isLoading,
    isError: false,
    refetch: jest.fn(),
  };
}

export function useMutation(options?: {
  mutationFn?: (vars: unknown) => Promise<unknown>;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}) {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    (vars: unknown) => {
      if (!options?.mutationFn) return;

      setIsPending(true);
      options
        .mutationFn(vars)
        .then(() => {
          options.onSuccess?.();
        })
        .catch((err) => {
          options.onError?.(err);
        })
        .finally(() => {
          setIsPending(false);
        });
    },
    [options]
  );

  return { mutate, isPending };
}

export function QueryClientProvider({ children }: { children: ReactNode }) {
  return children;
}
