// W16 (round 10): workers — add, switch on/off, attendance, salary raise
// (waits for approval, J8), payments (second admin when big). G24: the
// attendance / raise dates were the UTC date — between 00:00 and 05:00 in
// Pakistan the form defaulted to YESTERDAY (and to last month on the 1st).
process.env.TZ = 'Asia/Karachi';

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Workers } from '@/pages/Workers';
import { financeService } from '@/services/finance.service';
import { QueuedForApproval } from '@/lib/approvalQueue';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/finance.service', () => ({
  financeService: {
    listWorkers: jest.fn(), createWorker: jest.fn(), updateWorker: jest.fn(), getWorker: jest.fn(), getAttendance: jest.fn(),
    markAttendance: jest.fn(), addIncrement: jest.fn(), payWorker: jest.fn(),
  },
}));

const toast = require('react-hot-toast').default;
const svc = financeService as jest.Mocked<typeof financeService>;

const worker = { id: 'w1', name: 'Kareem', designation: 'Packer', phone: '03001231234', status: 'active', basicSalary: 30000 };
const ONLY_DATE: Parameters<typeof jest.useFakeTimers>[0] = {
  doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'],
};

beforeEach(() => {
  svc.listWorkers.mockResolvedValue([worker, { ...worker, id: 'w2', name: 'Old Hand', status: 'inactive' }] as any);
  svc.getWorker.mockResolvedValue({ ...worker, salaryChanges: [{ id: 's1', newBasicSalary: 28000, effectiveFrom: '2026-01-01' }], payments: [{ id: 'pay1', amount: 30000, category: 'salary', incurredAt: '2026-10-31T10:00:00Z' }] } as any);
  svc.getAttendance.mockResolvedValue([{ date: '2026-11-03', status: 'present' }, { date: '2026-11-04', status: 'absent' }] as any);
  for (const fn of [svc.createWorker, svc.updateWorker, svc.markAttendance, svc.addIncrement, svc.payWorker]) fn.mockResolvedValue({} as any);
});
afterEach(() => jest.useRealTimers());

const manage = async (name = 'Kareem') => {
  const card = (await screen.findByText(name)).closest('.space-y-2') as HTMLElement;
  fireEvent.click(within(card).getByRole('button', { name: 'Manage' }));
  return screen.findByRole('dialog', { name: `Manage — ${name}` });
};

describe('workers', () => {
  it('adds a worker (name required) and switches one on / off', async () => {
    render(<Workers />);
    fireEvent.click(await screen.findByRole('button', { name: /Add worker/ }));
    const d = screen.getByRole('dialog', { name: 'Add worker' });
    expect(within(d).getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.change(within(d).getByLabelText(/^Name/), { target: { value: 'Naveed' } });
    fireEvent.change(within(d).getByLabelText(/Basic salary/), { target: { value: '25000' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(svc.createWorker).toHaveBeenCalledWith({ name: 'Naveed', phone: undefined, designation: undefined, basicSalary: 25000 }));
    const old = (await screen.findByText('Old Hand')).closest('.space-y-2') as HTMLElement;
    fireEvent.click(within(old).getByTitle('Toggle active'));
    await waitFor(() => expect(svc.updateWorker).toHaveBeenCalledWith('w2', { status: 'active' }));
  });

  it('attendance is marked for the chosen day and shown per month', async () => {
    render(<Workers />);
    const d = await manage();
    expect(within(d).getByText('03 P')).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText('Date'), { target: { value: '2026-11-05' } });
    fireEvent.change(within(d).getByLabelText('Status'), { target: { value: 'half' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Mark' }));
    await waitFor(() => expect(svc.markAttendance).toHaveBeenCalledWith('w1', { date: '2026-11-05', status: 'half' }));
    fireEvent.change(within(d).getByLabelText('Attendance month'), { target: { value: '10' } });
    await waitFor(() => expect(svc.getAttendance).toHaveBeenLastCalledWith('w1', 10, expect.any(Number)));
  });

  it('a raise is sent; one waiting for the city admin clears quietly (J8)', async () => {
    render(<Workers />);
    const d = await manage();
    fireEvent.change(within(d).getByLabelText('New salary'), { target: { value: '33000' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add increment' }));
    await waitFor(() => expect(svc.addIncrement).toHaveBeenCalledWith('w1', expect.objectContaining({ newBasicSalary: 33000 })));
    svc.addIncrement.mockRejectedValueOnce(new QueuedForApproval('Sent to the city admin', 'r1'));
    fireEvent.change(within(d).getByLabelText('New salary'), { target: { value: '35000' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add increment' }));
    await waitFor(() => expect(within(d).getByLabelText('New salary')).toHaveValue(null));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a big payment asks for a second admin, then goes through with the approval', async () => {
    svc.payWorker.mockRejectedValueOnce({ response: { data: { message: 'A second admin must approve payments above Rs. 20,000' } } });
    render(<Workers />);
    const d = await manage();
    fireEvent.change(within(d).getByLabelText('Amount'), { target: { value: '30000' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('A second admin must approve payments above Rs. 20,000'));
    fireEvent.change(await within(d).findByLabelText(/Approver phone/i), { target: { value: '03001112222' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(svc.payWorker).toHaveBeenLastCalledWith('w1', expect.objectContaining({ category: 'salary', amount: 30000, approvalPhone: '03001112222' })));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Payment recorded in Expenses'));
  });
});

describe('dates are Pakistan dates (G24)', () => {
  it('at 01:30 on 19 Nov (PKT) attendance defaults to 19 Nov, not 18 Nov', async () => {
    jest.useFakeTimers({ ...ONLY_DATE, now: new Date('2026-11-18T20:30:00Z') });
    render(<Workers />);
    const d = await manage();
    expect(within(d).getByLabelText('Date')).toHaveValue('2026-11-19');
  });

  it('at 01:00 on 1 Dec (PKT) a raise defaults to 1 Dec, not 1 Nov', async () => {
    jest.useFakeTimers({ ...ONLY_DATE, now: new Date('2026-11-30T20:00:00Z') });
    render(<Workers />);
    const d = await manage();
    expect(within(d).getByLabelText('Effective from')).toHaveValue('2026-12-01');
  });
});
