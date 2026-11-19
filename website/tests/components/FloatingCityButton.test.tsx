// W17 (round 10): the city picker — search by city or province, picking a
// city switches to it (the current one just closes), nothing found says so,
// and it never shows on cart / checkout / portal pages. G31: it was not a
// dialog (no Escape, focus left behind) and the X had no name at all.
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'

jest.mock('framer-motion', () => {
  const R = jest.requireActual('react')
  const strip = ({ initial, animate, exit, transition, ...rest }: any) => rest
  const make = (tag: string) => R.forwardRef((p: any, ref: any) => R.createElement(tag, { ...strip(p), ref }))
  return {
    AnimatePresence: ({ children }: any) => R.createElement(R.Fragment, null, children),
    motion: new Proxy({}, { get: (_t, tag: string) => make(tag) }),
  }
})
let mockPath = '/'
jest.mock('next/navigation', () => ({ usePathname: () => mockPath }))
const mockSetCity = jest.fn()
const CITIES = [
  { id: 'grt', name: 'Gujrat', province: 'Punjab' },
  { id: 'lhr', name: 'Lahore', province: 'Punjab' },
  { id: 'khi', name: 'Karachi', province: 'Sindh' },
]
const mockCtx = { cities: CITIES, selectedCity: CITIES[0] as typeof CITIES[0] | null, setCity: mockSetCity, isLoading: false }
jest.mock('@/context/CityContext', () => ({ useCityContext: () => mockCtx }))

import FloatingCityButton from '@/components/city/FloatingCityButton'
import { useRightDrawer } from '@/store/rightDrawer'

const show = () => {
  useRightDrawer.setState({ cityPickerOpen: true })
  return render(<FloatingCityButton />)
}

beforeEach(() => {
  mockPath = '/'
  mockCtx.selectedCity = CITIES[0]
  mockCtx.isLoading = false
  mockSetCity.mockClear()
})

describe('city picker', () => {
  it('a labelled dialog: focus in the search box, Escape closes, the X has a name (G31)', () => {
    show()
    const dialog = screen.getByRole('dialog', { name: 'Change city' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Search city')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useRightDrawer.getState().cityPickerOpen).toBe(false)
    act(() => useRightDrawer.setState({ cityPickerOpen: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(useRightDrawer.getState().cityPickerOpen).toBe(false)
  })

  it('search by city or province; nothing found says so', () => {
    show()
    fireEvent.change(screen.getByLabelText('Search city'), { target: { value: 'sindh' } })
    expect(screen.getByText('Karachi')).toBeInTheDocument()
    expect(screen.queryByText('Lahore')).toBeNull()
    fireEvent.change(screen.getByLabelText('Search city'), { target: { value: 'quetta' } })
    expect(screen.getByText('No cities found')).toBeInTheDocument()
  })

  it('picking another city switches; the current one just closes; a backdrop click closes', () => {
    const { container } = show()
    fireEvent.click(screen.getByText('Lahore'))
    expect(mockSetCity).toHaveBeenCalledWith(CITIES[1])
    expect(useRightDrawer.getState().cityPickerOpen).toBe(false)
    act(() => useRightDrawer.setState({ cityPickerOpen: true }))
    fireEvent.click(screen.getByText('Gujrat'))
    expect(mockSetCity).toHaveBeenCalledTimes(1)
    act(() => useRightDrawer.setState({ cityPickerOpen: true }))
    fireEvent.click(container.firstChild as Element)
    expect(useRightDrawer.getState().cityPickerOpen).toBe(false)
  })

  it('loading says so; hidden on checkout and portal pages', () => {
    mockCtx.isLoading = true
    const { unmount } = show()
    expect(screen.getByText('Loading cities...')).toBeInTheDocument()
    unmount()
    for (const p of ['/checkout', '/restaurant/shop', '/ocp', '/shareholder']) {
      mockPath = p
      const r = show()
      expect(r.container).toBeEmptyDOMElement()
      r.unmount()
    }
  })
})
