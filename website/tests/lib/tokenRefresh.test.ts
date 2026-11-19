// W17 (round 10): keeping the website session alive — bearer mode refreshes a
// token that is about to expire, cookie mode never reads tokens in JS, a
// refresh that only failed to reach the server keeps the session (H7), a
// rejected refresh signs out, and the socket/API asks whether a session exists.
const mockCookies = { on: false }
jest.mock('@/lib/authConfig', () => ({ usesHttpOnlyCookies: () => mockCookies.on }))
jest.mock('@/lib/apiBase', () => ({ getApiBaseUrl: () => '/api' }))
const mockTokens = { access: null as string | null, refresh: null as string | null }
jest.mock('@/lib/secureTokens', () => ({
  clearTokens: jest.fn(),
  getAccessToken: () => mockTokens.access,
  getRefreshToken: () => mockTokens.refresh,
  tokenStorage: {},
}))
const mockStore: Record<string, any> = {}
jest.mock('@/store/cartStore', () => ({
  useAuthStore: {
    getState: () => ({ ...mockStore, logout: mockStore.logout }),
    setState: (p: Record<string, unknown>) => Object.assign(mockStore, p),
  },
}))
const mockService = { refreshAccessToken: jest.fn() }
let mockConfig: any
jest.mock('@freshbazar/core-auth', () => ({
  createTokenRefreshService: (cfg: unknown) => { mockConfig = cfg; return mockService },
  tokenNeedsRefresh: (token: string | null) => !token || token === 'old',
}))

import {
  ensureAuthSession, getValidAccessToken, hasRefreshableSession, refreshWebsiteAccessToken, tokenNeedsRefresh,
} from '@/lib/tokenRefresh'

/* eslint-disable @typescript-eslint/no-require-imports */
const secure = require('@/lib/secureTokens')

beforeEach(() => {
  mockCookies.on = false
  mockTokens.access = null
  mockTokens.refresh = 'rt'
  for (const k of Object.keys(mockStore)) delete mockStore[k]
  Object.assign(mockStore, { isAuthenticated: true, accessToken: 'fresh', refreshToken: null, logout: jest.fn() })
  mockService.refreshAccessToken.mockReset()
})

describe('website token refresh', () => {
  it('a fresh token is used as is; an old one is refreshed first', async () => {
    await expect(getValidAccessToken()).resolves.toBe('fresh')
    mockStore.accessToken = 'old'
    mockService.refreshAccessToken.mockImplementation(async () => { mockConfig.onTokenRefreshed('new'); return 'new' })
    await expect(getValidAccessToken()).resolves.toBe('new')
    expect(mockStore).toMatchObject({ accessToken: 'new', refreshToken: 'rt', isAuthenticated: true })
  })

  it('a refresh that fails gives no token; the session stays while a refresh token is kept (H7)', async () => {
    mockStore.accessToken = 'old'
    mockService.refreshAccessToken.mockResolvedValue(null)
    await expect(getValidAccessToken()).resolves.toBeNull()
    expect(hasRefreshableSession()).toBe(true)
    mockTokens.refresh = null
    expect(hasRefreshableSession()).toBe(false)
    mockStore.isAuthenticated = false
    expect(hasRefreshableSession()).toBe(false)
  })

  it('the server refusing the refresh signs out and clears the tokens', () => {
    mockConfig.onRefreshFailed()
    expect(secure.clearTokens).toHaveBeenCalled()
    expect(mockStore.logout).toHaveBeenCalled()
  })

  it('cookie mode: no token in JS, no refresh for a signed-out visitor, session = signed in', async () => {
    mockCookies.on = true
    expect(tokenNeedsRefresh('old')).toBe(false)
    await expect(getValidAccessToken()).resolves.toBeNull()
    await expect(ensureAuthSession()).resolves.toBe(true)
    expect(hasRefreshableSession()).toBe(true)
    expect(mockConfig.shouldRefresh()).toBe(true)
    mockConfig.onTokenRefreshed('ignored')
    expect(mockStore.accessToken).toBe('fresh')
    mockStore.isAuthenticated = false
    await expect(refreshWebsiteAccessToken()).resolves.toBe(false)
    expect(mockService.refreshAccessToken).not.toHaveBeenCalled()
  })

  it('bearer mode: a session needs a usable token; refresh needs a refresh token', async () => {
    await expect(ensureAuthSession()).resolves.toBe(true)
    expect(mockConfig.shouldRefresh()).toBe(true)
    expect(mockConfig.resolveRefreshToken()).toBe('rt')
    expect(mockConfig.getExtraHeaders()).toEqual({ 'X-Client-Platform': 'website' })
    mockTokens.refresh = null
    expect(mockConfig.shouldRefresh()).toBe(false)
    mockStore.isAuthenticated = false
    await expect(ensureAuthSession()).resolves.toBe(false)
  })
})
