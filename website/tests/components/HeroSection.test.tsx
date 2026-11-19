// W17 (round 10): the home brand band — per city: hero image, office phone
// (tap to call), WhatsApp ordering, free-delivery limit and the free slot
// ribbon. I23: switching to a city with no phone / WhatsApp kept the PREVIOUS
// city's phone and WhatsApp (they were only ever set, never cleared) — a Lahore
// customer ordered on Gujrat's WhatsApp.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('framer-motion', () => {
  const R = jest.requireActual('react')
  const strip = ({ initial, animate, whileInView, viewport, transition, ...rest }: any) => rest
  return { motion: new Proxy({}, { get: (_t, tag: string) => (p: any) => R.createElement(tag, strip(p)) }) }
})
jest.mock('next/image', () => ({ __esModule: true, default: ({ src, alt }: any) => <img src={src} alt={alt} /> }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
const mockCity = { value: { id: 'grt', name: 'Gujrat' } as { id: string; name: string } }
jest.mock('@/context/CityContext', () => ({ useCityContext: () => ({ selectedCity: mockCity.value }) }))
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn() }, bannerApi: { getSettings: jest.fn() } }))
jest.mock('@/lib/whatsapp', () => ({ ...jest.requireActual('@/lib/whatsapp'), openWhatsAppOrder: jest.fn() }))

import HeroSection from '@/components/sections/HeroSection'

/* eslint-disable @typescript-eslint/no-require-imports */
const apiMod = require('@/lib/api')
const wa = require('@/lib/whatsapp')

type CityData = { hero?: string; phone?: string; whatsapp?: string; threshold?: number; slots?: unknown[] }
const DATA: Record<string, CityData> = {
  grt: { hero: '/grt.jpg', phone: '0300 1112222', whatsapp: 'https://wa.me/923001112222', threshold: 800, slots: [{ start_time: '18:00:00', end_time: '21:30:00', is_free_delivery_slot: true }] },
  lhr: { threshold: 0, slots: [] },
}

beforeEach(() => {
  mockCity.value = { id: 'grt', name: 'Gujrat' }
  apiMod.default.get.mockImplementation(async (url: string, cfg: { params: { city_id: string } }) => {
    const d = DATA[cfg.params.city_id]
    if (url === '/site-settings/hero') return { data: { data: { heroImageUrl: d.hero || '' } } }
    if (url === '/site-settings/whatsapp-order') return { data: { data: { whatsapp_order_url: d.whatsapp || '' } } }
    if (url === '/site-settings/delivery') return { data: { data: { free_delivery_threshold: d.threshold } } }
    if (url === '/orders/time-slots') return { data: { data: d.slots } }
    throw new Error(url)
  })
  apiMod.bannerApi.getSettings.mockImplementation(async () => {
    const d = DATA[mockCity.value.id]
    return d.phone ? { banner_left_text: d.phone } : {}
  })
})

describe('HeroSection', () => {
  it("the city's image, phone (tap to call), WhatsApp, free limit and free slot", async () => {
    render(<HeroSection />)
    expect(await screen.findByText('0300 1112222')).toBeInTheDocument()
    expect(screen.getByText('0300 1112222').closest('a')).toHaveAttribute('href', expect.stringMatching(/^tel:/))
    expect(screen.getByText(/Now Delivering in Gujrat/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Free Delivery on Rs. 800+ Sabzi/Fruits')).toBeInTheDocument())
    expect(screen.getByText('6 PM - 9:30 PM')).toBeInTheDocument()
    expect(document.querySelector('img')).toHaveAttribute('src', '/grt.jpg')
    fireEvent.click(screen.getByRole('button', { name: /WhatsApp to Order/ }))
    expect(wa.openWhatsAppOrder).toHaveBeenCalledWith('https://wa.me/923001112222')
  })

  it("switching to a city without a phone / WhatsApp drops the previous city's (I23)", async () => {
    const { rerender } = render(<HeroSection />)
    expect(await screen.findByText('0300 1112222')).toBeInTheDocument()
    mockCity.value = { id: 'lhr', name: 'Lahore' }
    rerender(<HeroSection />)
    await waitFor(() => expect(apiMod.default.get).toHaveBeenCalledWith('/orders/time-slots', { params: { city_id: 'lhr' } }))
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('0300 1112222')).toBeNull()
    expect(screen.queryByRole('button', { name: /WhatsApp to Order/ })).toBeNull()
    expect(screen.queryByText('6 PM - 9:30 PM')).toBeNull()
    expect(screen.getByText('Free Delivery on Rs. 500+ Sabzi/Fruits')).toBeInTheDocument()
  })

  it('nothing reachable → the default picture, no phone, no WhatsApp', async () => {
    apiMod.default.get.mockRejectedValue(new Error('down'))
    apiMod.bannerApi.getSettings.mockRejectedValue(new Error('down'))
    render(<HeroSection />)
    await act(async () => { await Promise.resolve() })
    expect(document.querySelector('img')?.getAttribute('src')).toContain('unsplash')
    expect(screen.queryByRole('button', { name: /WhatsApp to Order/ })).toBeNull()
  })
})
