import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import GoogleEmbedMapPicker from '@/components/checkout/GoogleEmbedMapPicker'

jest.mock('lucide-react', () => ({
  Plus: () => <span data-testid="plus-icon">+</span>,
  Minus: () => <span data-testid="minus-icon">-</span>,
}))

// jsdom's PointerEvent ignores clientX/Y from the init dict, so build the event
// by hand and define the coordinates React reads off the native event.
function pointer(type: string, x: number, y: number): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(ev, {
    clientX: { value: x },
    clientY: { value: y },
    pointerId: { value: 1 },
  })
  return ev
}

function getOverlay(container: HTMLElement): HTMLElement {
  const overlay = container.querySelector('.cursor-grab') as HTMLElement
  overlay.setPointerCapture = jest.fn()
  overlay.releasePointerCapture = jest.fn()
  return overlay
}

describe('GoogleEmbedMapPicker (keyless fallback)', () => {
  it('renders the map and zoom controls', () => {
    render(<GoogleEmbedMapPicker lat={32.5742} lng={74.0789} onChange={jest.fn()} />)
    expect(screen.getByTitle('Google Maps')).toBeInTheDocument()
    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument()
    expect(screen.getByLabelText('Zoom out')).toBeInTheDocument()
  })

  it('pans on drag and commits the new centre only on release', () => {
    const onChange = jest.fn()
    const { container } = render(
      <GoogleEmbedMapPicker lat={32.5742} lng={74.0789} onChange={onChange} />
    )
    const overlay = getOverlay(container)

    fireEvent(overlay, pointer('pointerdown', 100, 100))
    fireEvent(overlay, pointer('pointermove', 160, 100))
    // Mid-drag the map slides visually only — no commit yet. This is the fix:
    // the old picker committed (and reloaded the iframe) on every pointer move.
    expect(onChange).not.toHaveBeenCalled()

    fireEvent(overlay, pointer('pointerup', 160, 100))
    // Exactly one commit, on release. Dragging the map east moves the centre
    // west because the pin stays fixed at the centre.
    expect(onChange).toHaveBeenCalledTimes(1)
    const [newLat, newLng] = onChange.mock.calls[0]
    expect(newLat).toBeCloseTo(32.5742, 4)
    expect(newLng).toBeLessThan(74.0789)
  })

  it('ignores a tap with no movement', () => {
    const onChange = jest.fn()
    const { container } = render(
      <GoogleEmbedMapPicker lat={32.5742} lng={74.0789} onChange={onChange} />
    )
    const overlay = getOverlay(container)

    fireEvent(overlay, pointer('pointerdown', 100, 100))
    fireEvent(overlay, pointer('pointerup', 100, 100))
    expect(onChange).not.toHaveBeenCalled()
  })
})
