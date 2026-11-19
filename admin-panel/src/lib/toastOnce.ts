import toast from 'react-hot-toast';

/**
 * The API client shows every failed request's message, and most forms show
 * the same message again in their own onError — two identical red toasts.
 * Giving each message text its own toast id makes the second one replace the
 * first instead of stacking (react-hot-toast de-duplicates by id). Called
 * once at start-up; a caller that passes its own id keeps it.
 */
let installed = false;
export function installToastOnce(): void {
  if (installed) return;
  installed = true;
  for (const kind of ['error', 'success'] as const) {
    const original = toast[kind];
    const wrapped = ((message: Parameters<typeof original>[0], opts?: Parameters<typeof original>[1]) =>
      original(message, typeof message === 'string' ? { id: `${kind}:${message}`, ...opts } : opts)) as typeof original;
    (toast as unknown as Record<string, unknown>)[kind] = wrapped;
  }
}
