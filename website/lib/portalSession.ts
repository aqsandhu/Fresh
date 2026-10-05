/**
 * Shared auth-failure handling for the B2B portals (restaurant / OCP /
 * shareholder). Their tokens live in localStorage and expire without refresh;
 * before this, a 401 only cleared storage and left the page showing
 * "login required" toasts with empty content. Now the session is cleared and
 * the user is taken to the portal's login page — except when the failing
 * request IS the login/register call (wrong PIN must stay inline).
 */
export function handlePortalAuthFailure(
  status: number,
  requestPath: string,
  loginPath: string,
  clearSession: () => void
): void {
  if (status !== 401 && status !== 403) return
  const isAuthCall = /\/(login|register)\b/.test(requestPath)
  if (isAuthCall) return
  clearSession()
  if (typeof window === 'undefined') return
  if (window.location.pathname.startsWith(loginPath)) return
  const redirect = encodeURIComponent(window.location.pathname)
  window.location.href = `${loginPath}?redirect=${redirect}`
}
