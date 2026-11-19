/**
 * Round 6, H6: a correct PIN must never be called "Invalid PIN". The server
 * said "Login successful" (cookie mode, no tokens in the reply), the website's
 * own setAuth then threw on the missing tokens, and the catch said "Invalid PIN".
 */
import { pinSignInErrorMessage } from '@/lib/signInError'
import { useAuthStore } from '@/store/cartStore'

describe('pinSignInErrorMessage', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined))
  afterEach(() => jest.restoreAllMocks())

  it('the server\'s own reason wins', () => {
    expect(pinSignInErrorMessage({ response: { status: 429, data: { message: 'Too many failed PIN attempts. Try again later.' } } }))
      .toBe('Too many failed PIN attempts. Try again later.')
  })

  it('a 401 with no reason is a wrong PIN', () => {
    expect(pinSignInErrorMessage({ response: { status: 401, data: {} } })).toBe('Invalid PIN. Please try again.')
    expect(pinSignInErrorMessage({ response: { status: 401 } }, 'Wrong PIN. Please try again.')).toBe('Wrong PIN. Please try again.')
  })

  it('another server answer is not blamed on the PIN', () => {
    expect(pinSignInErrorMessage({ response: { status: 503, data: {} } })).toBe('Sign-in could not be completed. Please try again.')
  })

  it('no server answer (network, or our own code failing after a good answer) is not "Invalid PIN" — and is logged', () => {
    const msg = pinSignInErrorMessage(new TypeError("Cannot read properties of undefined (reading 'accessToken')"))
    expect(msg).not.toMatch(/PIN/)
    expect(console.error).toHaveBeenCalled()
  })
})

describe('setAuth without tokens (server in cookie mode)', () => {
  it('signs the customer in instead of throwing', () => {
    expect(() => useAuthStore.getState().setAuth({ id: 'u1', name: 'A', phone: '+923001234567', email: null, role: 'customer' } as never, undefined)).not.toThrow()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})
