// W16 (round 10): coupons — list, the live "what this coupon does" sentence,
// code / value / percentage / auto-coupon checks, what is sent (blank limits =
// unlimited, cap only for %, Pakistan dates when editing), switch, delete, and
// a role that may only look.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CouponsSettingsPanel } from '@/components/settings/CouponsSettingsPanel';
import { couponService } from '@/services/coupon.service';

const mockCity: { selectedCity: { id: string; name: string } | null; selectedCityId: string } = { selectedCity: { id: 'c1', name: 'Gujrat' }, selectedCityId: 'c1' };
jest.mock('@/context/CityContext', () => ({ useCityContext: () => mockCity }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/coupon.service', () => ({
  couponService: { list: jest.fn(), create: jest.fn(), update: jest.fn(), toggle: jest.fn(), remove: jest.fn() },
}));

const toast = require('react-hot-toast').default;
const svc = couponService as jest.Mocked<typeof couponService>;

const eid = {
  id: 'cp1', code: 'EID10', description: 'Eid offer', discountType: 'percentage', discountValue: 10, maxDiscountAmount: 200,
  minOrderAmount: 1000, usageLimit: 500, usageLimitPerUser: 1, firstOrderOnly: false,
  // 1 Dec 00:00 Pakistan = 30 Nov 19:00 UTC
  validFrom: '2026-11-30T19:00:00.000Z', validUntil: '2026-12-10T18:59:59.000Z',
  isActive: true, triggerType: 'manual', autoReusable: false, summary: '10% off (up to Rs. 200) on orders of Rs. 1000 or more', usedCount: 3,
};

beforeEach(() => {
  mockCity.selectedCity = { id: 'c1', name: 'Gujrat' };
  svc.list.mockResolvedValue([eid] as any);
  svc.create.mockResolvedValue({} as any);
  svc.update.mockResolvedValue({} as any);
  svc.toggle.mockResolvedValue({} as any);
  svc.remove.mockResolvedValue('Coupon deleted' as any);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

const openNew = async () => {
  render(<CouponsSettingsPanel canEdit />);
  fireEvent.click(await screen.findByRole('button', { name: /New Coupon/ }));
  return screen.getByRole('dialog', { name: 'New Coupon' });
};
const save = (d: HTMLElement) => fireEvent.click(within(d).getByRole('button', { name: /Create|Save|Update/ }));

describe('coupons', () => {
  it('lists coupons; new ones apply to the chosen city (or every city without one)', async () => {
    render(<CouponsSettingsPanel canEdit />);
    expect(await screen.findByText('EID10')).toBeInTheDocument();
    expect(screen.getByText('Gujrat')).toBeInTheDocument();
  });

  it('a percentage coupon: live sentence, then exactly what is sent', async () => {
    const d = await openNew();
    fireEvent.change(within(d).getByLabelText(/Coupon Code/), { target: { value: 'save15' } });
    fireEvent.change(within(d).getByLabelText(/Percentage/), { target: { value: '15' } });
    fireEvent.change(within(d).getByLabelText(/Max discount cap/), { target: { value: '300' } });
    fireEvent.change(within(d).getByLabelText(/Minimum order amount/), { target: { value: '1500' } });
    fireEvent.change(within(d).getByLabelText(/Uses per customer/), { target: { value: '2' } });
    expect(within(d).getByText(/15% off \(up to Rs\. 300\) on orders of Rs\. 1500 or more — 2 per customer\./)).toBeInTheDocument();
    save(d);
    await waitFor(() => expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SAVE15', discountType: 'percentage', discountValue: 15, maxDiscountAmount: 300, minOrderAmount: 1500,
      usageLimit: null, usageLimitPerUser: 2, triggerType: 'manual', autoReusable: false, inactivityDays: null,
    })));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Coupon created'));
  });

  it.each([
    [{ code: 'x' }, 'Code must be 2–50 letters, numbers, dashes or underscores'],
    [{ code: 'OK10', value: '' }, 'Enter a discount value greater than 0'],
    [{ code: 'OK10', value: '120' }, 'Percentage discount cannot be more than 100%'],
  ])('refuses %j: "%s"', async (input, message) => {
    const d = await openNew();
    fireEvent.change(within(d).getByLabelText(/Coupon Code/), { target: { value: input.code } });
    if ('value' in input) fireEvent.change(within(d).getByLabelText(/Percentage/), { target: { value: input.value } });
    save(d);
    expect(toast.error).toHaveBeenCalledWith(message);
    expect(svc.create).not.toHaveBeenCalled();
  });

  it('auto coupons need their trigger number; a fixed amount drops the % cap; free delivery needs no value', async () => {
    const d = await openNew();
    fireEvent.change(within(d).getByLabelText(/Coupon Code/), { target: { value: 'COMEBACK' } });
    fireEvent.change(within(d).getByLabelText('How customers get it'), { target: { value: 'welcome_back' } });
    fireEvent.change(within(d).getByLabelText('Discount Type'), { target: { value: 'free_delivery' } });
    save(d);
    expect(toast.error).toHaveBeenCalledWith('Set the inactivity period (at least 1 day)');
    fireEvent.change(within(d).getByLabelText(/Days of inactivity/), { target: { value: '30' } });
    fireEvent.click(within(d).getByLabelText('Keep available after the first use'));
    save(d);
    await waitFor(() => expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({
      code: 'COMEBACK', discountType: 'free_delivery', triggerType: 'welcome_back', inactivityDays: 30, autoReusable: true, maxDiscountAmount: null,
    })));
  });

  it('editing shows the PAKISTAN dates (1 Dec, not 30 Nov) and updates the coupon', async () => {
    render(<CouponsSettingsPanel canEdit />);
    fireEvent.click(await screen.findByTitle('Edit'));
    const d = screen.getByRole('dialog', { name: 'Edit Coupon' });
    expect(within(d).getByLabelText('Valid from')).toHaveValue('2026-12-01');
    expect(within(d).getByLabelText('Valid until')).toHaveValue('2026-12-10');
    save(d);
    await waitFor(() => expect(svc.update).toHaveBeenCalledWith('cp1', expect.objectContaining({ code: 'EID10', validFrom: '2026-12-01', validUntil: '2026-12-10', usageLimit: 500 })));
  });

  it('switch on / off, and delete after confirming (the server\'s note is shown)', async () => {
    svc.remove.mockResolvedValue('Coupon used before — deactivated instead' as any);
    render(<CouponsSettingsPanel canEdit />);
    fireEvent.click(await screen.findByTitle('Deactivate'));
    await waitFor(() => expect(svc.toggle).toHaveBeenCalledWith('cp1'));
    fireEvent.click(screen.getByTitle('Delete'));
    await waitFor(() => expect(svc.remove).toHaveBeenCalledWith('cp1'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Coupon used before — deactivated instead', { duration: 6000 }));
  });

  it('a role that may only look sees the coupons but no buttons', async () => {
    mockCity.selectedCity = null;
    render(<CouponsSettingsPanel canEdit={false} />);
    expect(await screen.findByText('EID10')).toBeInTheDocument();
    expect(screen.getByText(/new coupons are GLOBAL/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New Coupon/ })).toBeNull();
    expect(screen.queryByTitle('Edit')).toBeNull();
  });
});
