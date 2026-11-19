// W16 (round 10): riders — list + filters, duty override, verify / block /
// delete rules, live location, the rider detail (stats, cash hand-over,
// per-slot pay, tasks / cash / feedback tabs), and G25: "Pay rider" needs the
// FINANCE permission and per-order pay needs riders.manage — both were shown
// on the wrong permission and refused by the server.
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Riders } from '@/pages/Riders';
import { riderService } from '@/services/rider.service';
import { settingsService } from '@/services/settings.service';
import { financeService } from '@/services/finance.service';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
const mockUser: { role: string; permissions: string[] } = { role: 'admin', permissions: [] };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ user: mockUser }) }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
const mockSocket: Record<string, (p: unknown) => void> = {};
jest.mock('@/services/socket', () => ({ onSocketEvent: (e: string, f: any) => { mockSocket[e] = f; }, offSocketEvent: jest.fn() }));
jest.mock('@/components/ui/GoogleMarkerMap', () => ({ GoogleMarkerMap: () => <div data-testid="map" /> }));
jest.mock('@/components/riders/RiderFormModal', () => ({ RiderFormModal: ({ isOpen, editing }: any) => (isOpen ? <div>rider form {editing?.fullName || 'new'}</div> : null) }));
jest.mock('@/services/rider.service', () => ({
  riderService: {
    getRiders: jest.fn(), deleteRider: jest.fn(), updateRiderStatus: jest.fn(), verifyRider: jest.fn(), getRiderLocation: jest.fn(),
    getRiderStats: jest.fn(), getRiderTasks: jest.fn(), getCashSettlements: jest.fn(), getRiderFeedback: jest.fn(),
    setDeliveryCharges: jest.fn(), receiveCashSettlement: jest.fn(),
  },
}));
jest.mock('@/services/settings.service', () => ({ settingsService: { getTimeSlots: jest.fn() } }));
jest.mock('@/services/finance.service', () => ({ financeService: { addRiderPayment: jest.fn() } }));

const toast = require('react-hot-toast').default;
const svc = riderService as jest.Mocked<typeof riderService>;

const bilal = { id: 'r1', fullName: 'Bilal Rider', phone: '03001230001', vehicleType: 'bike', status: 'available', verificationStatus: 'verified', activeTasks: 0, isOnline: true, rating: 4.5, ratingCount: 10 };
const busy = { id: 'r2', fullName: 'Busy Bee', phone: '03001230002', vehicleType: 'car', status: 'busy', verificationStatus: 'verified', activeTasks: 2 };
const pending = { id: 'r3', fullName: 'New Guy', phone: '03001230003', vehicleType: 'bike', status: 'offline', verificationStatus: 'pending', activeTasks: 0 };
const period = (orders: number, earnings: number) => ({ orders, earnings });

beforeEach(() => {
  mockUser.permissions = ['riders.view', 'riders.manage', 'finance.rider_payments.create', 'finance.rider_cash.receive'];
  svc.getRiders.mockResolvedValue([bilal, busy, pending] as any);
  for (const fn of [svc.deleteRider, svc.verifyRider, svc.setDeliveryCharges]) fn.mockResolvedValue({} as any);
  svc.updateRiderStatus.mockResolvedValue({ status: 'offline' } as any);
  svc.getRiderLocation.mockResolvedValue({ latitude: 32.5, longitude: 74.0, accuracy: 5, locationUpdatedAt: '2026-11-18T05:00:00Z', status: 'available' } as any);
  svc.getRiderStats.mockResolvedValue({
    stats: { today: period(3, 300), thisWeek: period(10, 1000), lastWeek: period(8, 800), thisMonth: period(30, 3000), lastMonth: period(25, 2500) },
    payment: { paymentPending: 1700, pendingOrders: 2, pendingAtta: 1 },
    deliveryCharges: [{ timeSlotId: 's1', chargePerOrder: 100 }],
    urgentDeliveryCharge: null,
    urgentChargeSupported: true,
  } as any);
  svc.getRiderTasks.mockResolvedValue({ tasks: [], pagination: { page: 1, totalPages: 1 } } as any);
  svc.getCashSettlements.mockResolvedValue([] as any);
  svc.getRiderFeedback.mockResolvedValue({ reviews: [], complaints: [] } as any);
  svc.receiveCashSettlement.mockResolvedValue({ amount: 1700 } as any);
  (settingsService.getTimeSlots as jest.Mock).mockResolvedValue([{ id: 's1', startTime: '09:00:00', endTime: '12:00:00', slotName: 'Morning' }, { id: 's2', startTime: '17:00:00', endTime: '20:00:00' }]);
  (financeService.addRiderPayment as jest.Mock).mockResolvedValue({ id: 'p' });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

const card = async (name: string) => (await screen.findByRole('button', { name })).closest('.relative') as HTMLElement;

describe('rider list', () => {
  it('filters reach the server', async () => {
    render(<Riders />);
    await card('Bilal Rider');
    fireEvent.change(screen.getByLabelText('Duty filter'), { target: { value: 'offline' } });
    fireEvent.change(screen.getByLabelText('Account filter'), { target: { value: 'pending' } });
    fireEvent.click(screen.getByLabelText('GPS live now'));
    await waitFor(() => expect(svc.getRiders).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'offline', verificationStatus: 'pending', online: true, limit: 500 })));
  });

  it('duty override, verify a pending rider, block (asks first)', async () => {
    render(<Riders />);
    const b = await card('Bilal Rider');
    fireEvent.change(within(b).getByTitle("Admin override of the rider's duty switch"), { target: { value: 'offline' } });
    await waitFor(() => expect(svc.updateRiderStatus).toHaveBeenCalledWith('r1', 'offline'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Duty status: Off duty'));
    fireEvent.click(within(await card('New Guy')).getByTitle('Verify — allow this rider to work'));
    await waitFor(() => expect(svc.verifyRider).toHaveBeenCalledWith('r3', 'verified'));
    fireEvent.click(within(b).getByTitle('Block (signs the rider out)'));
    await waitFor(() => expect(svc.verifyRider).toHaveBeenCalledWith('r1', 'rejected'));
  });

  it('a rider with active tasks cannot be deleted; a free one can (after confirming)', async () => {
    render(<Riders />);
    fireEvent.click(within(await card('Busy Bee')).getByTitle('Delete'));
    expect(toast.error).toHaveBeenCalledWith('Busy Bee still has 2 active task(s). Reassign them first.');
    fireEvent.click(within(await card('Bilal Rider')).getByTitle('Delete'));
    await waitFor(() => expect(svc.deleteRider).toHaveBeenCalledWith('r1'));
  });

  it('live location shows the map and follows socket updates', async () => {
    render(<Riders />);
    fireEvent.click(within(await card('Bilal Rider')).getByTitle('Live location'));
    expect(await screen.findByTestId('map')).toBeInTheDocument();
    act(() => mockSocket['rider:location']?.({ riderId: 'r1', latitude: 32.6, longitude: 74.1 }));
    expect(screen.getByRole('link', { name: /Google Maps/ })).toHaveAttribute('href', expect.stringContaining('32.6,74.1'));
  });

  it('add / edit open the rider form', async () => {
    render(<Riders />);
    fireEvent.click(within(await card('Bilal Rider')).getByTitle('Edit'));
    expect(screen.getByText('rider form Bilal Rider')).toBeInTheDocument();
  });

  it('a failed load says why', async () => {
    svc.getRiders.mockRejectedValue(new Error('Failed to fetch riders'));
    render(<Riders />);
    expect(await screen.findByText('Failed to fetch riders')).toBeInTheDocument();
  });
});

describe('rider detail', () => {
  const openDetail = async () => {
    render(<Riders />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bilal Rider' }));
    await screen.findByText('Deliveries & pay');
  };

  it('shows deliveries and pay per period, and receives the cash with a password', async () => {
    await openDetail();
    expect(screen.getByText('4.5 (10)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Receive cash/ }));
    const d = screen.getByRole('dialog', { name: 'Receive cash from Bilal Rider' });
    expect(within(d).getByText('Covers 3 delivery line(s): order cash minus the rider\'s pay, plus atta charges.')).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText('Your admin password'), { target: { value: 'Manager123' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Confirm receipt' }));
    await waitFor(() => expect(svc.receiveCashSettlement).toHaveBeenCalledWith('r1', { password: 'Manager123', note: undefined }));
  });

  it('per-slot pay: a blank slot is left out, urgent pay is sent, a negative value blocks saving', async () => {
    await openDetail();
    const morning = await screen.findByLabelText(/Pay per order, 9:00/);
    expect(morning).toHaveValue(100);
    fireEvent.change(screen.getByLabelText('Urgent delivery pay per order'), { target: { value: '-5' } });
    expect(screen.getByRole('button', { name: /Save pay/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Urgent delivery pay per order'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /Save pay/ }));
    await waitFor(() => expect(svc.setDeliveryCharges).toHaveBeenCalledWith('r1', [{ timeSlotId: 's1', chargePerOrder: 100 }], 150));
  });

  it('pay a rider: big amounts ask for a second admin', async () => {
    (financeService.addRiderPayment as jest.Mock).mockRejectedValueOnce({ response: { data: { message: 'A second admin must approve payments above Rs. 20,000' } } });
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: /Pay rider/ }));
    const d = screen.getByRole('dialog', { name: 'Pay Bilal Rider' });
    fireEvent.change(within(d).getByLabelText(/Amount/), { target: { value: '25000' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Pay' }));
    expect(await within(d).findByLabelText(/Approver phone/i)).toBeInTheDocument();
  });

  it('the task, cash and feedback tabs load their lists', async () => {
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    await waitFor(() => expect(svc.getRiderTasks).toHaveBeenCalledWith('r1', 'history', 1));
    fireEvent.click(screen.getByRole('button', { name: /Cash hand-overs/ }));
    await waitFor(() => expect(svc.getCashSettlements).toHaveBeenCalledWith('r1'));
    fireEvent.click(screen.getByRole('button', { name: /Reviews & complaints/ }));
    await waitFor(() => expect(svc.getRiderFeedback).toHaveBeenCalledWith('r1'));
    fireEvent.click(screen.getByRole('button', { name: /Back to riders/ }));
    expect(await screen.findByLabelText('Duty filter')).toBeInTheDocument();
  });
});

describe('what each permission offers (G25)', () => {
  it('riders.manage WITHOUT the finance permission: no "Pay rider" anywhere', async () => {
    mockUser.permissions = ['riders.view', 'riders.manage'];
    render(<Riders />);
    expect(within(await card('Bilal Rider')).queryByTitle('Pay rider (salary / bonus)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bilal Rider' }));
    await screen.findByText('Deliveries & pay');
    expect(screen.queryByRole('button', { name: /Pay rider/ })).toBeNull();
  });

  it('a finance role WITHOUT riders.manage can pay, but cannot change per-order pay', async () => {
    mockUser.permissions = ['riders.view', 'finance.rider_payments.create'];
    render(<Riders />);
    expect(within(await card('Bilal Rider')).getByTitle('Pay rider (salary / bonus)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bilal Rider' }));
    await screen.findByText('Deliveries & pay');
    expect(screen.getByRole('button', { name: /Pay rider/ })).toBeInTheDocument();
    expect(await screen.findByLabelText(/Pay per order, 9:00/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Save pay/ })).toBeNull();
  });
});
