// Website dialogs: focus in, Tab stays in, Escape closes, focus returns.
import React, { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { useDialog } from '@/lib/useDialog'

function Dialog({ onClose, withField }: { onClose: () => void; withField: boolean }) {
  const ref = useDialog(true, onClose)
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Complaint">
      <button aria-label="Close" onClick={onClose}>x</button>
      {withField && <input aria-label="Subject" />}
      <button>Submit</button>
    </div>
  )
}

function Page({ withField = true }: { withField?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && <Dialog withField={withField} onClose={() => setOpen(false)} />}
    </>
  )
}

describe('useDialog', () => {
  it('focuses the first field, keeps Tab inside, Escape closes and focus returns', () => {
    render(<Page />)
    const opener = screen.getByText('Open')
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByLabelText('Subject')).toHaveFocus()
    screen.getByText('Submit').focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByLabelText('Close')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(screen.getByText('Submit')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('without a field it focuses the dialog itself, not a button', () => {
    render(<Page withField={false} />)
    fireEvent.click(screen.getByText('Open'))
    expect(screen.getByRole('dialog')).toHaveFocus()
  })
})
