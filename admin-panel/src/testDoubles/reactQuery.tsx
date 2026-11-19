/* eslint-disable react-refresh/only-export-components --
   Jest test double for @tanstack/react-query; never part of the app's
   fast-refresh graph. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// Active queries, so invalidateQueries() / refetch() really re-run them —
// a page test can then check "after saving, the list is loaded again".
type ActiveQuery = { key: unknown[]; run: () => void; setData: (d: unknown) => void };
const activeQueries = new Set<ActiveQuery>();

const asKey = (k: unknown): unknown[] => (Array.isArray(k) ? k : k === undefined ? [] : [k]);
// react-query matches by key PREFIX: ['orders'] matches ['orders', {...}].
const keyMatches = (prefix: unknown[], key: unknown[]) =>
  prefix.every((part, i) => JSON.stringify(part) === JSON.stringify(key[i]));

export class QueryClient {
  invalidateQueries = jest.fn((filters?: { queryKey?: unknown }) => {
    const prefix = asKey(filters?.queryKey);
    activeQueries.forEach((q) => {
      if (keyMatches(prefix, q.key)) q.run();
    });
    return Promise.resolve();
  });
  clear = jest.fn();
  setQueryData = jest.fn((key: unknown, updater: unknown) => {
    activeQueries.forEach((q) => {
      if (keyMatches(asKey(key), q.key)) q.setData(updater);
    });
  });
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
  refetchInterval?: number | false;
  placeholderData?: unknown;
}) {
  const [data, setData] = useState<unknown>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(Boolean(options?.queryFn && options?.enabled !== false));
  const [isFetching, setIsFetching] = useState(false);
  const queryKey = JSON.stringify(options?.queryKey);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const mounted = useRef(true);

  const run = useCallback(() => {
    const opts = optionsRef.current;
    if (opts?.enabled === false || !opts?.queryFn) return Promise.resolve();
    setIsFetching(true);
    return opts
      .queryFn()
      .then((result) => {
        if (!mounted.current) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (mounted.current) setError(err);
      })
      .finally(() => {
        if (!mounted.current) return;
        setIsLoading(false);
        setIsFetching(false);
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (options?.enabled === false || !options?.queryFn) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void run();
    const entry: ActiveQuery = {
      key: asKey(options?.queryKey),
      run: () => void run(),
      setData: (updater) =>
        setData((prev: unknown) => (typeof updater === 'function' ? (updater as (p: unknown) => unknown)(prev) : updater)),
    };
    activeQueries.add(entry);
    return () => {
      activeQueries.delete(entry);
    };
    // Mirrors real react-query: re-fetch only when the SERIALIZED key (or
    // enabled) changes. `options` is a fresh object literal every render and
    // must not be a dependency or the double would refetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, options?.enabled]);

  return {
    data:
      data === undefined
        ? typeof options?.placeholderData === 'function'
          ? (options.placeholderData as (prev: unknown) => unknown)(undefined)
          : options?.placeholderData
        : data,
    isLoading,
    isFetching,
    isError: error != null,
    error,
    refetch: jest.fn(() => run()),
  };
}

// Typed like the real hook: what the mutation returns and the variables it takes.
type MutateCallbacks<TData, TVars> = {
  onSuccess?: (data: TData, vars: TVars) => void;
  onError?: (err: unknown, vars: TVars) => void;
  onSettled?: (data: TData | undefined, err: unknown, vars: TVars) => void;
};

export function useMutation<TData = unknown, TVars = void>(options?: {
  mutationFn?: (vars: TVars) => Promise<TData>;
  onSuccess?: (data: TData, vars: TVars) => unknown;
  onError?: (err: unknown, vars: TVars) => unknown;
  onSettled?: (data: TData | undefined, err: unknown, vars: TVars) => unknown;
}) {
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const mutateAsync = useCallback((vars: TVars, callbacks?: MutateCallbacks<TData, TVars>): Promise<TData | undefined> => {
    const opts = optionsRef.current;
    if (!opts?.mutationFn) return Promise.resolve(undefined);
    setIsPending(true);
    setIsError(false);
    return opts
      .mutationFn(vars)
      .then(async (result) => {
        // Like the real library: the result and the variables are passed on,
        // the hook's callback first, then the one given to mutate().
        await opts.onSuccess?.(result, vars);
        callbacks?.onSuccess?.(result, vars);
        await opts.onSettled?.(result, null, vars);
        callbacks?.onSettled?.(result, null, vars);
        return result;
      })
      .catch(async (err: unknown) => {
        setIsError(true);
        await opts.onError?.(err, vars);
        callbacks?.onError?.(err, vars);
        await opts.onSettled?.(undefined, err, vars);
        callbacks?.onSettled?.(undefined, err, vars);
        throw err;
      })
      .finally(() => {
        setIsPending(false);
      });
  }, []);

  const mutate = useCallback(
    (vars: TVars, callbacks?: MutateCallbacks<TData, TVars>) => {
      mutateAsync(vars, callbacks).catch(() => undefined);
    },
    [mutateAsync]
  );

  return { mutate, mutateAsync, isPending, isError, reset: () => setIsError(false) };
}

export function QueryClientProvider({ children }: { children: ReactNode }) {
  return children;
}
