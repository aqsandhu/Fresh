// W17 (round 10): the checkout / account address form — what is saved (type,
// area, city, address, landmark, default), a too-short address refused, the
// GPS pin and the map pin sent, a pin outside the delivery area stopped with
// the popup (A39), editing (update; removing the pin clears it), a door photo
// goes as a file, and the server's refusal is shown.
import React, { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
jest.mock('framer-motion', () => ({ motion: { div: ({ children, className }: any) => <div className={className}>{children}</div> } }))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() })
  return { __esModule: true, default: t }
})
jest.mock('@/components/checkout/GoogleMapPicker', () => ({
  __esModule: true,
  default: ({ onLatLngChange, onDone, onCancel }: any) => (
    <div>
      <button onClick={() => onLatLngChange(31.5, 74.3)}>drop pin far away</button>
      <button onClick={() => onLatLngChange(32.57, 74.07)}>drop pin in Gujrat</button>
      <button onClick={onDone}>map done</button>
      <button onClick={onCancel}>map cancel</button>
    </div>
  ),
}))
jest.mock('@/components/checkout/DoorPhotoField', () => ({
  __esModule: true,
  default: ({ onChange }: any) => <button onClick={() => onChange(new File(['x'], 'door.jpg', { type: 'image/jpeg' }))}>add door photo</button>,
}))
jest.mock('@/components/city/ServiceAreaPopup', () => ({ __esModule: true, default: ({ open }: any) => (open ? <p role="alert">We don&apos;t deliver here yet</p> : null) }))
jest.mock('@/lib/useServiceArea', () => ({ useServiceArea: () => ({ data: { enabled: true, polygons: [], message: {} } }) }))
jest.mock('@/lib/serviceArea', () => ({ isWithinServiceArea: (lat: number) => lat > 32 }))
const mockGps = jest.fn()
jest.mock('@/lib/geolocation', () => ({ REQUIRED_LOCATION_ACCURACY_M: 20, getAccuratePosition: () => mockGps() }))
jest.mock('@/lib/api', () => ({ addressesApi: { create: jest.fn(), update: jest.fn(), createWithDoorPicture: jest.fn(), updateWithDoorPicture: jest.fn() } }))

import AddressForm, { type AddressFormHandle } from '@/components/checkout/AddressForm'

/* eslint-disable @typescript-eslint/no-require-imports */
const { addressesApi } = require('@/lib/api')
const toast = require('react-hot-toast').default

const cities = [{ id: 'c1', name: 'Gujrat', province: 'Punjab' }]
const saved = { id: 'a-new', address_type: 'home', written_address: 'House 12, Street 4', area_name: 'Model Town', city: 'Gujrat', is_default: true }

beforeEach(() => {
  addressesApi.create.mockResolvedValue(saved)
  addressesApi.update.mockResolvedValue({ ...saved, id: 'a1' })
  addressesApi.createWithDoorPicture.mockResolvedValue(saved)
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {} })
})

const fill = () => {
  fireEvent.change(screen.getByLabelText(/Full Address/), { target: { value: 'House 12, Street 4' } })
  fireEvent.change(screen.getByLabelText('Area Name'), { target: { value: 'Model Town' } })
  fireEvent.change(screen.getByLabelText('Landmark (Optional)'), { target: { value: 'Near mosque' } })
}
const save = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Address|Update Address/ })) }) }

describe('AddressForm', () => {
  it('a new address without a pin: everything typed is saved, default when it is the first', async () => {
    const onSaved = jest.fn()
    render(<AddressForm availableCities={cities} defaultOnCreate onSaved={onSaved} />)
    fill()
    await save()
    expect(addressesApi.create).toHaveBeenCalledWith({
      address_type: 'home', written_address: 'House 12, Street 4', area_name: 'Model Town', city: 'Gujrat', landmark: 'Near mosque', is_default: true,
    })
    expect(onSaved).toHaveBeenCalledWith(saved)
  })

  it('a too-short address is refused; validity is reported to the checkout', async () => {
    const onValidity = jest.fn()
    render(<AddressForm availableCities={cities} onSaved={jest.fn()} onValidityChange={onValidity} />)
    expect(onValidity).toHaveBeenLastCalledWith(false)
    fireEvent.change(screen.getByLabelText(/Full Address/), { target: { value: 'H 1' } })
    await save()
    expect(toast.error).toHaveBeenCalledWith('Full address must be at least 5 characters')
    expect(addressesApi.create).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/Full Address/), { target: { value: 'House 12' } })
    expect(onValidity).toHaveBeenLastCalledWith(true)
  })

  it('a locked GPS fix is sent with its accuracy', async () => {
    mockGps.mockResolvedValueOnce({ status: 'locked', position: { lat: 32.57, lng: 74.07, accuracy: 9 } })
    render(<AddressForm availableCities={cities} onSaved={jest.fn()} />)
    fill()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Get My Location' })) })
    expect(toast.success).toHaveBeenCalledWith('Location detected (±9m)')
    await save()
    expect(addressesApi.create).toHaveBeenCalledWith(expect.objectContaining({ latitude: 32.57, longitude: 74.07, location_accuracy: 9 }))
  })

  it('a pin outside the delivery area is stopped with the popup (A39); one inside saves', async () => {
    render(<AddressForm availableCities={cities} onSaved={jest.fn()} />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Add Google Map Location' }))
    fireEvent.click(screen.getByText('drop pin far away'))
    await save()
    expect(screen.getByRole('alert')).toHaveTextContent(/don't deliver here/)
    expect(addressesApi.create).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('drop pin in Gujrat'))
    await save()
    expect(addressesApi.create).toHaveBeenCalledWith(expect.objectContaining({ latitude: 32.57, longitude: 74.07 }))
  })

  it('GPS refused: the customer is told how to allow it', async () => {
    mockGps.mockResolvedValueOnce({ status: 'denied' })
    render(<AddressForm availableCities={cities} onSaved={jest.fn()} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Get My Location' })) })
    expect(toast.error).toHaveBeenCalledWith('Location permission blocked — allow it in browser settings.', { duration: 6000 })
    expect(screen.getByText(/Allow location for this site/)).toBeInTheDocument()
  })

  it('editing updates the address; removing the pin clears it on the server', async () => {
    const ref = createRef<AddressFormHandle>()
    render(
      <AddressForm
        ref={ref}
        availableCities={cities}
        onSaved={jest.fn()}
        initial={{ id: 'a1', address_type: 'work', written_address: 'Office 3, GT Road', area_name: 'Saddar', city: 'Gujrat', latitude: 32.5, longitude: 74.0 }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    let result: unknown
    await act(async () => { result = await ref.current!.submit() })
    expect(addressesApi.update).toHaveBeenCalledWith('a1', expect.objectContaining({ address_type: 'work', written_address: 'Office 3, GT Road', latitude: null, longitude: null }))
    expect((result as { id: string }).id).toBe('a1')
  })

  it('a door photo is uploaded with the address; a refusal is shown and nothing is returned', async () => {
    render(<AddressForm availableCities={cities} onSaved={jest.fn()} />)
    fill()
    fireEvent.click(screen.getByText('add door photo'))
    await save()
    expect(addressesApi.createWithDoorPicture).toHaveBeenCalledWith(expect.objectContaining({ written_address: 'House 12, Street 4' }), expect.any(File))
    addressesApi.createWithDoorPicture.mockRejectedValueOnce({ response: { data: { message: 'Photo too large' } } })
    await save()
    expect(toast.error).toHaveBeenCalledWith('Photo too large')
  })
})
