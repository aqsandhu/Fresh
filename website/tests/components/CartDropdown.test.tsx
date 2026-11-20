// W17 (round 10): the header cart — items with their size, + / − (− on the
// last one removes it), subtotal / delivery / total from the real cart rules
// with the free-delivery hint, Escape / outside / the X close it, an empty
// cart says so. G30: it locked the page scroll with its own save/restore, so
// closing it after a side rail re-froze the whole page; it now shares the
// counted lock.
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'

jest.mock('framer-motion', () => {
  const R = jest.requireActual('react')
  const strip = ({ initial, animate, exit, transition, ...rest }: any) => rest
  const make = (tag: string) => R.forwardRef((p: any, ref: any) => R.createElement(tag, { ...strip(p), ref }))
  return {
    AnimatePresence: ({ children }: any) => R.createElement(R.Fragment, null, children),
    m: new Proxy({}, { get: (_t, tag: string) => make(tag) }),
  }
})
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, onClick }: any) => <a href={href} onClick={onClick}>{children}</a> }))
jest.mock('@/components/ui/SmartImage', () => ({ __esModule: true, default: ({ alt }: any) => <img alt={alt} /> }))

import CartDropdown from '@/components/layout/CartDropdown'
import { useCartStore } from '@/store/cartStore'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock'

const tomato = { id: 'tomato', name: 'Tomato', nameEn: 'Tomato', price: 200, unit: 'kg', category: 'vegetables', inStock: true } as never

beforeEach(() => {
  ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({ json: async () => ({ data: { base_charge: 100, free_delivery_threshold: 500 } }) }))
  useCartStore.setState({ items: [], cartsByCity: {}, activeCityId: 'c1', deliveryBaseCharge: 100, deliveryFreeThreshold: 500 })
  document.body.style.overflow = ''
})

const open = (onClose = jest.fn()) => {
  render(<CartDropdown isOpen onClose={onClose} />)
  return onClose
}

describe('CartDropdown', () => {
  it('an empty cart says so', async () => {
    open()
    await act(async () => { await Promise.resolve() })
    expect(screen.getAllByText('Your cart is empty').length).toBeGreaterThan(0)
  })

  it('items, + / −, delivery until the free limit, then FREE', async () => {
    useCartStore.getState().addItem(tomato, 1)
    open()
    await act(async () => { await Promise.resolve() })
    expect(screen.getAllByText(/Cart \(1 item\)/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rs. 300').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByLabelText('Increase quantity')[0])
    fireEvent.click(screen.getAllByLabelText('Increase quantity')[0])
    expect(useCartStore.getState().items[0].quantity).toBe(3)
    expect(screen.getAllByText('FREE').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByLabelText('Decrease quantity')[0])
    fireEvent.click(screen.getAllByLabelText('Decrease quantity')[0])
    fireEvent.click(screen.getAllByLabelText('Decrease quantity')[0])
    expect(useCartStore.getState().items).toEqual([])
  })

  it('Escape, a click outside, the X and "View cart" close it', async () => {
    useCartStore.getState().addItem(tomato, 1)
    const onClose = open()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(document.body)
    fireEvent.click(screen.getAllByRole('button', { name: 'Close cart' })[0])
    expect(onClose).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getAllByRole('link')[0])
    expect(onClose).toHaveBeenCalledTimes(4)
  })

  it('page scroll: locked while open; closing after a side rail never re-freezes the page (G30)', () => {
    lockBodyScroll() // a side rail is open
    const { rerender } = render(<CartDropdown isOpen onClose={jest.fn()} />)
    expect(document.body.style.overflow).toBe('hidden')
    unlockBodyScroll() // the rail closes first
    rerender(<CartDropdown isOpen={false} onClose={jest.fn()} />)
    expect(document.body.style.overflow).toBe('')
  })
})
