// W17 (round 10) — I16: the website's text field printed its label without
// linking it to the box, so a screen reader read "edit text" with no name and
// clicking the label did nothing; an error was never tied to the field. Used
// by login, register, profile, addresses, support and the checkout forms.
import React from 'react'
import { render, screen } from '@testing-library/react'
import Input from '@/components/ui/Input'

describe('Input', () => {
  it('the label names the field and focuses it', () => {
    render(<Input label="Phone Number" placeholder="03XX" />)
    const field = screen.getByLabelText('Phone Number')
    expect(field).toHaveAttribute('placeholder', '03XX')
    // (jsdom does not move focus on a label click — check the link itself.)
    expect(screen.getByText('Phone Number')).toHaveAttribute('for', field.id)
  })

  it('an error is announced and tied to the field; a hint is tied when there is no error', () => {
    const { rerender } = render(<Input label="Email" helperText="Optional" />)
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Optional')
    rerender(<Input label="Email" error="Enter a valid email" />)
    const field = screen.getByLabelText('Email')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('Enter a valid email')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email')
  })

  it('a given id is kept', () => {
    render(<Input label="Name" id="full-name" />)
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'full-name')
  })
})
