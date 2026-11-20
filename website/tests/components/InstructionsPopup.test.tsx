// W17 (round 10): the per-page Urdu instructions — the office's tips for the
// page (the built-in ones when none), the lightbulb opens them, "سمجھ گئے",
// the X or the backdrop close (G29: Escape too — a dialog must close from the
// keyboard), a quiet visitor is offered help after 8 s, moving to another
// page closes it, and none on PIN / city pages or a page with no tips.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('framer-motion', () => {
  const R = jest.requireActual('react')
  const strip = ({ initial, animate, exit, transition, ...rest }: any) => rest
  const make = (tag: string) => R.forwardRef((p: any, ref: any) => R.createElement(tag, { ...strip(p), ref }))
  return {
    AnimatePresence: ({ children }: any) => R.createElement(R.Fragment, null, children),
    m: new Proxy({}, { get: (_t, tag: string) => make(tag) }),
    useReducedMotion: () => false,
  }
})
let mockPath = '/cart'
jest.mock('next/navigation', () => ({ usePathname: () => mockPath }))
jest.mock('@/context/CityContext', () => ({ useCityContext: () => ({ selectedCityId: 'c1' }) }))
jest.mock('@/lib/api', () => ({ tipsApi: { forPage: jest.fn() } }))

import InstructionsPopup, { guidanceForPath } from '@/components/guidance/InstructionsPopup'
import { useInstructionsPopup } from '@/store/instructionsPopup'
import { CART_TIPS } from '@/lib/guidanceTipsContent'

/* eslint-disable @typescript-eslint/no-require-imports */
const { tipsApi } = require('@/lib/api')

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><InstructionsPopup /></QueryClientProvider>)
}
const bulb = () => screen.getAllByRole('button', { name: 'Instructions' })[0]

beforeEach(() => {
  mockPath = '/cart'
  useInstructionsPopup.setState({ open: false })
  tipsApi.forPage.mockResolvedValue([{ text: 'پہلا مشورہ' }, { text: 'دوسرا مشورہ' }])
})

describe('InstructionsPopup', () => {
  it("the office's tips for this page; the X, the button and the backdrop close it", async () => {
    mount()
    await waitFor(() => expect(tipsApi.forPage).toHaveBeenCalledWith('cart'))
    fireEvent.click(bulb())
    expect(await screen.findByText('دوسرا مشورہ')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close instructions' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(bulb())
    fireEvent.click(screen.getByText('سمجھ گئے'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a real dialog: focus moves in, Escape closes, focus back on the lightbulb (G29)', async () => {
    mount()
    bulb().focus()
    fireEvent.click(bulb())
    const dialog = await screen.findByRole('dialog', { name: 'Instructions' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(bulb()).toHaveFocus()
  })

  it('no office tips → the built-in ones; a quiet visitor is offered help after 8 s', async () => {
    tipsApi.forPage.mockResolvedValue([])
    jest.useFakeTimers()
    try {
      mount()
      await act(async () => { await Promise.resolve() })
      act(() => { jest.advanceTimersByTime(8100) })
      expect(screen.getByText('راہنمائی حاصل کریں')).toBeInTheDocument()
      fireEvent.click(document.body)
      expect(screen.queryByText('راہنمائی حاصل کریں')).toBeNull()
      fireEvent.click(bulb())
      expect(screen.getByText(CART_TIPS[0])).toBeInTheDocument()
    } finally {
      jest.useRealTimers()
    }
  })

  it('a page with no tips shows nothing; nor the PIN page', async () => {
    tipsApi.forPage.mockResolvedValue([])
    mockPath = '/about'
    const { container, unmount } = mount()
    await waitFor(() => expect(tipsApi.forPage).toHaveBeenCalledWith('about'))
    expect(container).toBeEmptyDOMElement()
    unmount()
    mockPath = '/settings/pin'
    expect(mount().container).toBeEmptyDOMElement()
  })

  it('maps every page to its tips key', () => {
    expect(guidanceForPath('/').page).toBe('home')
    expect(guidanceForPath('/category/fruits').page).toBe('shop')
    expect(guidanceForPath('/product/p1').page).toBe('product')
    for (const p of ['checkout', 'orders', 'support', 'register', 'login']) expect(guidanceForPath(`/${p}`).page).toBe(p)
    expect(guidanceForPath('/track/o1').page).toBe('track')
    expect(guidanceForPath('/franchise/apply').page).toBe('franchise')
  })
})
