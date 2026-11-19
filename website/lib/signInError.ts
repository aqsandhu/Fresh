/**
 * What to tell the customer when a PIN sign-in fails (round 6, H6).
 *
 * Every failure used to say "Invalid PIN" — even when the server had said
 * "Login successful" and the failure was in the website's own code afterwards,
 * so the customer kept retyping a correct PIN. Now:
 *   - the server answered with a reason → that reason;
 *   - the server answered 401 without one → wrong PIN;
 *   - the server answered anything else → "could not sign in, try again";
 *   - no answer (network) or a failure after a good answer → not the PIN's fault.
 */
export function pinSignInErrorMessage(err: unknown, wrongPin = 'Invalid PIN. Please try again.'): string {
  const response = (err as { response?: { status?: number; data?: { message?: unknown } } } | null)?.response
  const serverMessage = typeof response?.data?.message === 'string' ? response.data.message.trim() : ''
  if (serverMessage) return serverMessage
  if (response?.status === 401) return wrongPin
  if (response?.status) return 'Sign-in could not be completed. Please try again.'
  if (typeof window !== 'undefined') {
    // Not a server answer: a network failure, or our own code failing after a
    // successful sign-in. Keep the real reason where it can be found.
    // eslint-disable-next-line no-console
    console.error('PIN sign-in failed without a server answer', err)
  }
  return 'Sign-in could not be completed — check your connection and try again.'
}
