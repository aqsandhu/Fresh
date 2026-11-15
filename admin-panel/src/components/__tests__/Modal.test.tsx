// The shared admin dialog follows the WAI-ARIA dialog pattern: announced with
// its title, focus moves in and stays in, Escape closes, focus returns.
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from '@/components/ui/Modal';

function Harness({ footer = false, withField = true }: { footer?: boolean; withField?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      <button>Behind</button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Edit product"
        footer={footer ? <button>Delete</button> : undefined}
      >
        {withField ? (
          <>
            <input aria-label="Name" />
            <input aria-label="Price" />
          </>
        ) : (
          <p>Are you sure?</p>
        )}
      </Modal>
    </div>
  );
}

const tab = (shift = false) => fireEvent.keyDown(document, { key: 'Tab', shiftKey: shift });

describe('Modal', () => {
  it('is a labelled modal dialog with a named close button', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Open'));
    const dialog = screen.getByRole('dialog', { name: 'Edit product' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('moves focus to the first field and keeps Tab inside', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Open'));
    const name = screen.getByLabelText('Name');
    const price = screen.getByLabelText('Price');
    const close = screen.getByRole('button', { name: 'Close' });
    expect(name).toHaveFocus();
    price.focus();
    tab(); // last → wraps to the first (the close button)
    expect(close).toHaveFocus();
    tab(true); // first → wraps back to the last
    expect(price).toHaveFocus();
  });

  it('never focuses a footer button first (no accidental "Delete" on Enter)', () => {
    render(<Harness footer withField={false} />);
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByRole('dialog')).toHaveFocus();
    expect(screen.getByText('Delete')).not.toHaveFocus();
  });

  it('Escape closes it and focus goes back to the opener', () => {
    render(<Harness />);
    const opener = screen.getByText('Open');
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });
});
