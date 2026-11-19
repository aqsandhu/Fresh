// G35 (W19 browser journey): on a busy day every new / cancelled order popped
// a notice in the top-right corner and they stacked without end — covering the
// Orders page's search and buttons. Only the newest few stay on screen now
// (older ones fade out; the bell keeps the full list).
import { act, render, screen } from '@testing-library/react';
import toast, { Toaster, useToasterStore } from 'react-hot-toast';
import { ToastLimit } from '../ToastLimit';

function VisibleCount() {
  const { toasts } = useToasterStore();
  const visible = toasts.filter((t) => t.visible);
  return <p data-testid="visible">{visible.map((t) => String(t.message)).join('|')}</p>;
}

describe('ToastLimit', () => {
  afterEach(() => act(() => { toast.remove(); }));

  it('keeps only the newest notices on screen', async () => {
    render(<><Toaster /><ToastLimit max={3} /><VisibleCount /></>);
    await act(async () => {
      for (let i = 1; i <= 8; i++) toast(`New order #${i} received`);
    });
    const visible = screen.getByTestId('visible').textContent!.split('|');
    expect(visible).toHaveLength(3);
    expect(visible).toEqual(['New order #8 received', 'New order #7 received', 'New order #6 received']);
  });

  it('a few notices are left alone', async () => {
    render(<><Toaster /><ToastLimit max={3} /><VisibleCount /></>);
    await act(async () => { toast('one'); toast('two'); });
    expect(screen.getByTestId('visible').textContent).toBe('two|one');
  });
});
