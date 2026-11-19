// W17 (round 10): the customer's city — remembered between visits, the first
// city when none was chosen, switching moves the cart to that city and reloads
// every list (the city picker page goes home). I21: a remembered city the
// office has since switched off (no longer in the list) was kept — empty shop,
// failing checkout; now the customer is moved to an active city.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockPush = jest.fn()
const mockRouter = { push: mockPush }
let mockPath = '/products'
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter, usePathname: () => mockPath }))
const mockSwitch = jest.fn()
jest.mock('@/store/cartStore', () => ({ useCartStore: (sel: (s: { switchCity: jest.Mock }) => unknown) => sel({ switchCity: mockSwitch }) }))
const mockStored = { value: null as null | { id: string; name: string; province?: string } }
jest.mock('@/lib/cityStorage', () => ({
  getSelectedCityId: () => mockStored.value?.id ?? null,
  getSelectedCityName: () => mockStored.value?.name ?? null,
  getStoredCity: () => mockStored.value,
  setSelectedCity: jest.fn((c: any) => { mockStored.value = c }),
}))
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }))

import { CityProvider, useCityContext, useOptionalCityName } from '@/context/CityContext'

/* eslint-disable @typescript-eslint/no-require-imports */
const apiMod = require('@/lib/api')

const CITIES = [{ id: 'grt', name: 'Gujrat', province: 'Punjab' }, { id: 'lhr', name: 'Lahore', province: 'Punjab' }]

function Probe() {
  const c = useCityContext()
  const name = useOptionalCityName()
  return (
    <div>
      <p data-testid="city">{c.isReady ? `${c.selectedCityId}|${name}` : 'loading'}</p>
      <button onClick={() => c.setCity(CITIES[1])}>to Lahore</button>
    </div>
  )
}
let qc: QueryClient
const renderIt = () => {
  qc = new QueryClient()
  jest.spyOn(qc, 'invalidateQueries')
  return render(<QueryClientProvider client={qc}><CityProvider><Probe /></CityProvider></QueryClientProvider>)
}

beforeEach(() => {
  mockStored.value = null
  mockPath = '/products'
  apiMod.default.get.mockResolvedValue({ data: { data: CITIES } })
})

describe('website city', () => {
  it('no city chosen → the first city, remembered, cart moved there', async () => {
    renderIt()
    await waitFor(() => expect(screen.getByTestId('city')).toHaveTextContent('grt|Gujrat'))
    expect(mockStored.value).toMatchObject({ id: 'grt', name: 'Gujrat' })
    expect(mockSwitch).toHaveBeenCalledWith('grt')
  })

  it('a remembered city is kept', async () => {
    mockStored.value = { id: 'lhr', name: 'Lahore' }
    renderIt()
    await waitFor(() => expect(screen.getByTestId('city')).toHaveTextContent('lhr|Lahore'))
  })

  it('a remembered city that was switched off moves the customer to an active one (I21)', async () => {
    mockStored.value = { id: 'skt', name: 'Sialkot' }
    renderIt()
    await waitFor(() => expect(screen.getByTestId('city')).toHaveTextContent('grt|Gujrat'))
    expect(mockSwitch).toHaveBeenLastCalledWith('grt')
  })

  it('the city list unreachable → the remembered city is kept (not thrown away)', async () => {
    mockStored.value = { id: 'skt', name: 'Sialkot' }
    apiMod.default.get.mockRejectedValue(new Error('down'))
    renderIt()
    await waitFor(() => expect(screen.getByTestId('city')).toHaveTextContent('skt|Sialkot'))
  })

  it('switching: remembered, cart moved, every list reloaded; the picker page goes home', async () => {
    renderIt()
    await waitFor(() => expect(screen.getByTestId('city')).toHaveTextContent('grt'))
    act(() => { fireEvent.click(screen.getByText('to Lahore')) })
    expect(screen.getByTestId('city')).toHaveTextContent('lhr|Lahore')
    expect(mockSwitch).toHaveBeenLastCalledWith('lhr')
    expect(qc.invalidateQueries).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    mockPath = '/select-city'
    act(() => { fireEvent.click(screen.getByText('to Lahore')) })
  })

  it('the hook outside the provider says so', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<Probe />)).toThrow('useCityContext must be used within CityProvider')
  })
})
