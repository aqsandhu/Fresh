/**
 * What the site does when a request is refused (401) and refreshing the
 * session did not help (H7, round 8).
 *
 * It used to send the customer to /login from ANY page — an old expired
 * session in the browser turned the public home page into a login page — and
 * also when the refresh merely could not reach the server (deploy, weak
 * network), which signed the customer out for nothing.
 */

/** Pages that need a signed-in customer. Only these go to /login. */
export const ACCOUNT_PATHS = [
  '/checkout',
  '/orders',
  '/profile',
  '/addresses',
  '/settings',
  '/support',
  '/atta-chakki',
  '/delete-account',
  '/wishlist',
];

export function needsAccount(pathname: string): boolean {
  return ACCOUNT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type AfterFailedRefresh = 'keep' | 'guest' | 'login';

/**
 * - `keep`  — a login / sign-up call failed (wrong PIN), or the session still
 *             exists because the server could not be reached: stay as is.
 * - `guest` — the session really ended on a public page: carry on as a guest.
 * - `login` — the session really ended on an account page: go and sign in.
 */
export function afterFailedRefresh(opts: {
  isAuthEndpoint: boolean;
  stillSignedIn: boolean;
  pathname: string;
}): AfterFailedRefresh {
  if (opts.isAuthEndpoint) return 'keep';
  if (opts.stillSignedIn) return 'keep';
  return needsAccount(opts.pathname) ? 'login' : 'guest';
}
