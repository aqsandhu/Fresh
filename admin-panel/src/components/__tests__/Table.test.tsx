// W16 (round 10): the shared table — empty / loading, selection, paging, and
// keyboard: a clickable row opens with Enter, but Enter on a control inside
// the row stays with that control.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Table } from '@/components/ui/Table';

type Row = { id: string; name: string };
const rows: Row[] = [{ id: 'a', name: 'Aloo' }, { id: 'b', name: 'Pyaz' }];
const columns = [
  { key: 'name', title: 'Name' },
  { key: 'act', title: 'Action', render: (r: Row) => <button onClick={(e) => e.stopPropagation()}>Edit {r.name}</button> },
];

describe('Table', () => {
  it('says when there is nothing, and shows a placeholder while loading', () => {
    const { rerender } = render(<Table columns={columns} data={[]} keyExtractor={(r) => r.id} emptyMessage="No orders found" />);
    expect(screen.getByText('No orders found')).toBeInTheDocument();
    rerender(<Table columns={columns} data={rows} keyExtractor={(r) => r.id} isLoading />);
    expect(screen.queryByText('Aloo')).toBeNull();
  });

  it('select one, select all, clear all', () => {
    const onSel = jest.fn();
    const { rerender } = render(
      <Table columns={columns} data={rows} keyExtractor={(r) => r.id} selectable selectedIds={new Set()} onSelectionChange={onSel} />
    );
    fireEvent.click(screen.getByLabelText('Select row b'));
    expect([...onSel.mock.calls[0][0]]).toEqual(['b']);
    fireEvent.click(screen.getByLabelText('Select all rows'));
    expect([...onSel.mock.calls[1][0]]).toEqual(['a', 'b']);
    rerender(<Table columns={columns} data={rows} keyExtractor={(r) => r.id} selectable selectedIds={new Set(['a', 'b'])} onSelectionChange={onSel} />);
    fireEvent.click(screen.getByLabelText('Select all rows'));
    expect([...onSel.mock.calls[2][0]]).toEqual([]);
    fireEvent.click(screen.getByLabelText('Select row a'));
    expect([...onSel.mock.calls[3][0]]).toEqual(['b']);
  });

  it('pages forward and back', () => {
    const onPage = jest.fn();
    render(<Table columns={columns} data={rows} keyExtractor={(r) => r.id} pagination={{ page: 2, totalPages: 3, onPageChange: onPage }} />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Previous/i }));
    expect(onPage.mock.calls).toEqual([[3], [1]]);
  });

  it('a clickable row opens by click or Enter; Enter on a button inside it does not open the row', () => {
    const open = jest.fn();
    render(<Table columns={columns} data={rows} keyExtractor={(r) => r.id} onRowClick={open} />);
    const rowA = screen.getByText('Aloo').closest('tr') as HTMLElement;
    fireEvent.click(rowA);
    fireEvent.keyDown(rowA, { key: 'Enter' });
    expect(open).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Aloo' }), { key: 'Enter' });
    expect(open).toHaveBeenCalledTimes(2);
  });
});
