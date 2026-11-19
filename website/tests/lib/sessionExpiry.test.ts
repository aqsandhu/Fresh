// H7 (round 8): an expired session used to turn the public home page into a
// login page, and a refresh that only could not reach the server signed the
// customer out.
import { afterFailedRefresh, needsAccount } from '@/lib/sessionExpiry'

describe('which pages need an account', () => {
  it.each(['/checkout', '/orders', '/orders/abc', '/profile', '/addresses', '/atta-chakki/requests'])('%s needs one', (p) => {
    expect(needsAccount(p)).toBe(true)
  })
  it.each(['/', '/products', '/product/aloo', '/category/veg', '/cart', '/search', '/work-as-rider', '/ordersx'])('%s is public', (p) => {
    expect(needsAccount(p)).toBe(false)
  })
})

describe('after a refused request that refreshing did not fix', () => {
  it('server unreachable (session still there) → keep the customer signed in', () => {
    expect(afterFailedRefresh({ isAuthEndpoint: false, stillSignedIn: true, pathname: '/checkout' })).toBe('keep')
  })
  it('session really ended on the home page → carry on as a guest, no login page', () => {
    expect(afterFailedRefresh({ isAuthEndpoint: false, stillSignedIn: false, pathname: '/' })).toBe('guest')
  })
  it('session really ended on checkout → go and sign in', () => {
    expect(afterFailedRefresh({ isAuthEndpoint: false, stillSignedIn: false, pathname: '/checkout' })).toBe('login')
  })
  it('a wrong PIN on the login form never moves the customer', () => {
    expect(afterFailedRefresh({ isAuthEndpoint: true, stillSignedIn: false, pathname: '/checkout' })).toBe('keep')
  })
})
