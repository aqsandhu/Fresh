import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import GoogleEmbedMapPicker from '@/components/checkout/GoogleEmbedMapPicker'

jest.mock('lucide-react', () => ({
  Plus: () => <span data-testid="plus-icon">+</span>,
  Minus: () => <span data-testid="minus-icon">-</span>,
}))

describe('GoogleEmbedMapPicker (keyless fallback)', () => {
  it('renders a double-buffered map and zoom controls', () => {
    render(<GoogleEmbedMapPicker lat={32.5742} lng={74.0789} onChange={jest.fn()} />)

    // Two iframes = the double buffer used for flash-free cross-fade.
    const frames = screen.getAllByTitle('Google Maps')
    expect(frames).toHaveLength(2)

    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument()
    expect(screen.getByLabelText('Zoom out')).toBeInTheDocument()
  })

  it('does not commit a new centre until the drag is released', () => {
    const onChange = jest.fn()
    const { container } = render(
      <GoogleEmbedMapPicker lat={32.5742} lng={74.0789} onChange={onChange} />
    )
    const overlay = container.querySelector('.cursor-grab') as HTMLElement
    expect(overlay).toBeTruthy()

    // Stub pointer-capture (not implemented in jsdom).
    overlay.setPointerCapture = jest.fn()
    overlay.releasePointerCapture = jest.fn()

    fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 140, clientY: 100 })
    // Mid-drag the map moves visually only — no location committed yet. This is
    // the whole fix: the old picker fired onChange (and reloaded the iframe) on
    // every pointer move, which is what made dragging stutter.
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 140, clientY: 100 })
    // Exactly one commit, on release.
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('ignores a tap with no movement', () => {
    const onChange = jest.fn()
    const { container } = render(
      <GoogleEmbedMapPicker lat={32.5742} lng={74.0789} onChange={onChange} />
    )
    const overlay = container.querySelector('.cursor-grab') as HTMLElement
    overlay.setPointerCapture = jest.fn()
    overlay.releasePointerCapture = jest.fn()

    fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 100, clientY: 100 })
    expect(onChange).not.toHaveBeenCalled()
  })
})
