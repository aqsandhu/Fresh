// W22: the wishlist kept with the account. A guest keeps it on this device;
// signed in, every add / remove is saved to the account (undone when that
// fails). At sign-in, guest changes are joined to the account's list;
// otherwise the account's list replaces this device's (a product removed on
// another device does not come back from here). Sign-out clears it. The old
// device-only list is moved over once, and its key removed.
import React from 'react'
import { act, render } from '@testing-library/react'

jest.mock('@/lib/api', () => ({ wishlistApi: { get: jest.fn(), add: jest.fn(), remove: jest.fn(), merge: jest.fn() } }))
const mockAuth = { isAuthenticated: false, hasHydrated: true }
jest.mock('@/store/cartStore', () => ({
  useAuthStore: (sel: (s: typeof mockAuth) => unknown) => sel(mockAuth),
}))

import { useWishlistStore } from '@/store/wishlistStore'
import WishlistSync from '@/components/providers/WishlistSync'

/* eslint-disable @typescript-eslint/no-require-imports */
const { wishlistApi } = require('@/lib/api')

const store = () => useWishlistStore.getState()

beforeEach(() => {
  mockAuth.isAuthenticated = false
  useWishlistStore.setState({ ids: [], synced: false, unsynced: false })
})

describe('wishlist store', () => {
  it('a guest adds and removes on this device; the change is marked for the next sign-in', async () => {
    expect(await store().toggle('p1', false)).toBe('added')
    await store().toggle('p2', false)
    expect(store().ids).toEqual(['p2', 'p1'])
    expect(store().unsynced).toBe(true)
    expect(await store().toggle('p1', false)).toBe('removed')
    expect(store().has('p1')).toBe(false)
    expect(wishlistApi.add).not.toHaveBeenCalled()
  })

  it("signed in: saved to the account (the account's answer is kept); a failure is undone", async () => {
    wishlistApi.add.mockResolvedValueOnce(['p1', 'p0'])
    await store().toggle('p1', true)
    expect(wishlistApi.add).toHaveBeenCalledWith('p1')
    expect(store().ids).toEqual(['p1', 'p0'])
    wishlistApi.remove.mockRejectedValueOnce(new Error('offline'))
    await expect(store().toggle('p1', true)).rejects.toThrow('offline')
    expect(store().ids).toEqual(['p1', 'p0'])
  })
})

describe('WishlistSync', () => {
  const mount = () => render(<WishlistSync />)

  it("sign-in with guest changes joins them to the account's list", async () => {
    useWishlistStore.setState({ ids: ['g1'], unsynced: true })
    wishlistApi.merge.mockResolvedValueOnce(['g1', 'a1'])
    const { rerender } = mount()
    mockAuth.isAuthenticated = true
    await act(async () => { rerender(<WishlistSync />) })
    expect(wishlistApi.merge).toHaveBeenCalledWith(['g1'])
    expect(store()).toMatchObject({ ids: ['g1', 'a1'], unsynced: false, synced: true })
  })

  it("a page opened with a session and nothing new takes the account's list (a removed product does not come back)", async () => {
    mockAuth.isAuthenticated = true
    useWishlistStore.setState({ ids: ['removed-elsewhere', 'a1'], unsynced: false })
    wishlistApi.get.mockResolvedValueOnce(['a1'])
    await act(async () => { mount() })
    expect(wishlistApi.merge).not.toHaveBeenCalled()
    expect(store().ids).toEqual(['a1'])
  })

  it('sign-out clears the list on this device; offline keeps it', async () => {
    mockAuth.isAuthenticated = true
    wishlistApi.get.mockRejectedValueOnce(new Error('offline'))
    useWishlistStore.setState({ ids: ['a1'], unsynced: false })
    const { rerender } = render(<WishlistSync />)
    await act(async () => { await Promise.resolve() })
    expect(store().ids).toEqual(['a1'])
    mockAuth.isAuthenticated = false
    await act(async () => { rerender(<WishlistSync />) })
    expect(store().ids).toEqual([])
  })
})

describe('the old device-only list', () => {
  it('is moved over once (marked for the next sign-in) and its key removed', async () => {
    const getItem = window.localStorage.getItem as jest.Mock
    const removeItem = window.localStorage.removeItem as jest.Mock
    getItem.mockImplementation((k: string) => (k === 'freshbazar-wishlist' ? JSON.stringify([{ id: 'old1', product: {} }, { id: 'old2' }]) : null))
    useWishlistStore.setState({ ids: [], unsynced: false })
    await act(async () => { await useWishlistStore.persist.rehydrate() })
    expect(store().ids).toEqual(['old1', 'old2'])
    expect(store().unsynced).toBe(true)
    expect(removeItem).toHaveBeenCalledWith('freshbazar-wishlist')
    getItem.mockReset()
  })
})
