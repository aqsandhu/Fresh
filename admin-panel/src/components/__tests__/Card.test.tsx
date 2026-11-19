// W16 (round 10): a clickable card works from the keyboard — and a button
// INSIDE it keeps working too. The card's Enter handler used to catch the
// key press of an inner Edit / Delete button and cancel it, so Enter on
// "Edit category" opened the category's products instead.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Card } from '@/components/ui/Card';

describe('Card', () => {
  it('a plain card is not a button', () => {
    render(<Card>Plain</Card>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a clickable card opens with Enter or Space', () => {
    const open = jest.fn();
    render(<Card onClick={open}>Vegetables</Card>);
    const card = screen.getByRole('button', { name: 'Vegetables' });
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    fireEvent.keyDown(card, { key: 'a' });
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('Enter on a button inside the card is that button\'s, not the card\'s', () => {
    const open = jest.fn();
    const edit = jest.fn();
    render(
      <Card onClick={open}>
        <span>Vegetables</span>
        <button onClick={edit}>Edit</button>
      </Card>
    );
    const button = screen.getByRole('button', { name: 'Edit' });
    const notPrevented = fireEvent.keyDown(button, { key: 'Enter' });
    expect(open).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true); // the browser may still "click" the button
  });
});
