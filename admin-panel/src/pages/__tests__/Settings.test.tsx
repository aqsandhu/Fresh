// W16 (round 10): the Settings page — tabs per role, delivery prices (city
// vs default, reset), time slots (validation, unlimited, edit, delete),
// business hours (G16: a failed load must not show — and save — invented
// hours), and the top banner.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Settings } from '@/pages/Settings';
import { settingsService } from '@/services/settings.service';
import { bannerService } from '@/services/banner.service';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
const mockUser: { role: string; permissions: string[] } = { role: 'admin', permissions: [] };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ user: mockUser }) }));
jest.mock('@/context/CityContext', () => ({ useCityContext: () => ({ selectedCity: { id: 'c1', name: 'Gujrat' }, selectedCityId: 'c1' }) }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/settings.service', () => ({
  settingsService: {
    getSettings: jest.fn(), getTimeSlots: jest.fn(), getBusinessHours: jest.fn(), updateDeliverySettings: jest.fn(),
    resetDeliveryToGlobal: jest.fn(), createTimeSlot: jest.fn(), updateTimeSlot: jest.fn(), deleteTimeSlot: jest.fn(),
    updateBusinessHours: jest.fn(),
  },
}));
jest.mock('@/services/banner.service', () => ({ bannerService: { getBannerSettings: jest.fn(), updateBannerSettings: jest.fn() } }));
function mockStub(name: string) {
  return function Panel() { return <div>{name} panel</div>; };
}
jest.mock('@/components/settings/WhatsAppOrderSettingsPanel', () => ({ WhatsAppOrderSettingsPanel: mockStub('whatsapp') }));
jest.mock('@/components/settings/BrandLogoSettingsPanel', () => ({ BrandLogoSettingsPanel: mockStub('brand') }));
jest.mock('@/components/settings/BrandFaviconSettingsPanel', () => ({ BrandFaviconSettingsPanel: mockStub('favicon') }));
jest.mock('@/components/settings/HeroImageSettingsPanel', () => ({ HeroImageSettingsPanel: mockStub('hero') }));
jest.mock('@/components/settings/CouponsSettingsPanel', () => ({ CouponsSettingsPanel: mockStub('coupons') }));
jest.mock('@/components/settings/AppWidgetSettingsPanel', () => ({ AppWidgetSettingsPanel: mockStub('appwidget') }));
jest.mock('@/components/settings/AttaChargesSettingsPanel', () => ({ AttaChargesSettingsPanel: mockStub('atta') }));

const toast = require('react-hot-toast').default;
const svc = settingsService as jest.Mocked<typeof settingsService>;
const banner = bannerService as jest.Mocked<typeof bannerService>;

const hours = [
  { day: 'Monday', open: '08:00', close: '22:00', isOpen: true },
  { day: 'Sunday', open: '10:00', close: '18:00', isOpen: false },
];
const cityDelivery = { scope: 'city', cityId: 'c1', cityName: 'Gujrat', cityOverride: true, baseCharge: 80, freeDeliveryThreshold: 1500, expressCharge: 120, urgentCharge: 200, urgentEta: '45 min', slotCutoffPercent: 60 };

beforeEach(() => {
  mockUser.role = 'super_admin';
  mockUser.permissions = ['settings.view', 'settings.update', 'coupons.view'];
  svc.getSettings.mockResolvedValue({ delivery: cityDelivery } as any);
  svc.getTimeSlots.mockResolvedValue([
    { id: 's1', startTime: '09:00', endTime: '12:00', maxOrders: null, isActive: true, isFreeDeliverySlot: true },
    { id: 's2', startTime: '17:00', endTime: '20:00', maxOrders: 30, isActive: false, cityName: 'Gujrat' },
  ] as any);
  svc.getBusinessHours.mockResolvedValue(hours as any);
  svc.updateDeliverySettings.mockResolvedValue({} as any);
  svc.createTimeSlot.mockResolvedValue({} as any);
  svc.updateTimeSlot.mockResolvedValue({} as any);
  svc.updateBusinessHours.mockResolvedValue({} as any);
  banner.getBannerSettings.mockResolvedValue({ bannerLeftText: '0300-1234567', bannerMiddleText: 'Free delivery', bannerRightTextEn: 'Fresh', bannerRightTextUr: '', bannerTickerItems: ['Eid offer'] } as any);
  banner.updateBannerSettings.mockResolvedValue({} as any);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

const tab = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('delivery prices', () => {
  it('shows this city\'s own prices and saves only the editable values', async () => {
    render(<Settings />);
    expect(await screen.findByText(/Prices for/)).toHaveTextContent('Prices for Gujrat (own values)');
    const base = screen.getByLabelText(/Base Delivery Charge/);
    await waitFor(() => expect(base).toHaveValue(80));
    fireEvent.change(base, { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Delivery Settings' }));
    await waitFor(() => expect(svc.updateDeliverySettings).toHaveBeenCalled());
    const sent = svc.updateDeliverySettings.mock.calls[0][0] as any;
    expect(sent).toMatchObject({ baseCharge: 90, freeDeliveryThreshold: 1500, urgentCharge: 200, urgentEta: '45 min' });
    expect(sent.scope).toBeUndefined();
    expect(sent.cityName).toBeUndefined();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Delivery settings saved for Gujrat'));
  });

  it('a city can go back to the default prices (after confirming)', async () => {
    svc.resetDeliveryToGlobal.mockResolvedValue(undefined as any);
    render(<Settings />);
    fireEvent.click(await screen.findByRole('button', { name: /default/i }));
    await waitFor(() => expect(svc.resetDeliveryToGlobal).toHaveBeenCalled());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('This city now uses the default delivery settings'));
  });
});

describe('time slots', () => {
  it('lists slots (unlimited / capped, free, inactive) and validates a new one', async () => {
    render(<Settings />);
    tab('Time Slots');
    expect(await screen.findByText('No order limit')).toBeInTheDocument();
    expect(screen.getByText('Max 30 orders · Gujrat')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add Time Slot/ }));
    const d = screen.getByRole('dialog', { name: 'Add Time Slot' });
    fireEvent.change(within(d).getByLabelText(/End Time/), { target: { value: '08:00' } });
    fireEvent.change(within(d).getByLabelText(/Maximum orders/), { target: { value: '0' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    expect(within(d).getByText('End time must be after start time')).toBeInTheDocument();
    expect(within(d).getByText(/Enter a whole number of at least 1/)).toBeInTheDocument();
    expect(svc.createTimeSlot).not.toHaveBeenCalled();
  });

  it('an empty limit is sent as "no limit" (null)', async () => {
    render(<Settings />);
    tab('Time Slots');
    fireEvent.click(await screen.findByRole('button', { name: /Add Time Slot/ }));
    const d = screen.getByRole('dialog', { name: 'Add Time Slot' });
    fireEvent.click(within(d).getByLabelText('Free Delivery in this slot'));
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(svc.createTimeSlot).toHaveBeenCalledWith({ startTime: '09:00', endTime: '12:00', maxOrders: null, isActive: true, isFreeDeliverySlot: true }));
  });

  it('editing keeps the slot\'s values; delete asks first and shows the server\'s note', async () => {
    svc.deleteTimeSlot.mockResolvedValue('Time slot deactivated — it has orders' as any);
    render(<Settings />);
    tab('Time Slots');
    fireEvent.click((await screen.findAllByTitle('Edit time slot'))[1]);
    const d = screen.getByRole('dialog', { name: 'Edit Time Slot' });
    expect(within(d).getByLabelText(/Maximum orders/)).toHaveValue(30);
    fireEvent.change(within(d).getByLabelText(/Maximum orders/), { target: { value: '' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(svc.updateTimeSlot).toHaveBeenCalledWith('s2', expect.objectContaining({ maxOrders: null, isActive: false })));
    (window.confirm as jest.Mock).mockReturnValueOnce(false);
    fireEvent.click(screen.getAllByTitle('Delete time slot')[0]);
    expect(svc.deleteTimeSlot).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByTitle('Delete time slot')[0]);
    await waitFor(() => expect(svc.deleteTimeSlot).toHaveBeenCalledWith('s1'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Time slot deactivated — it has orders', expect.anything()));
  });
});

describe('business hours', () => {
  it('shows the saved hours and saves a change', async () => {
    render(<Settings />);
    tab('Business Hours');
    const opens = await screen.findByLabelText('Monday opens');
    expect(opens).toHaveValue('08:00');
    fireEvent.change(screen.getByLabelText('Monday closes'), { target: { value: '23:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Business Hours' }));
    await waitFor(() => expect(svc.updateBusinessHours).toHaveBeenCalledWith([{ ...hours[0], close: '23:00' }, hours[1]]));
  });

  it('a failed load shows no invented hours and cannot be saved over the real ones (G16)', async () => {
    svc.getBusinessHours.mockRejectedValueOnce(new Error('Server error'));
    render(<Settings />);
    tab('Business Hours');
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/);
    expect(screen.queryByLabelText('Monday opens')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save Business Hours' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText('Monday opens')).toHaveValue('08:00');
  });

  it('only the super admin may change them (one list for every city)', async () => {
    mockUser.role = 'admin';
    render(<Settings />);
    tab('Business Hours');
    await screen.findByLabelText('Monday opens');
    expect(screen.getByRole('button', { name: 'Save Business Hours' })).toBeDisabled();
  });
});

describe('top banner', () => {
  it('loads this city\'s banner, adds a ticker line and saves', async () => {
    render(<Settings />);
    tab('Website Banner');
    await waitFor(() => expect(screen.getByLabelText('Left Side Text (Phone Number)')).toHaveValue('0300-1234567'));
    expect(screen.getByLabelText('Ticker line 1')).toHaveValue('Eid offer');
    fireEvent.click(screen.getByRole('button', { name: /Add Line/ }));
    fireEvent.change(screen.getByLabelText('Ticker line 2'), { target: { value: 'Raat 10 baje tak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Banner Settings' }));
    await waitFor(() => expect(banner.updateBannerSettings).toHaveBeenCalledWith(expect.objectContaining({ bannerTickerItems: ['Eid offer', 'Raat 10 baje tak'] })));
  });
});

describe('tabs per role', () => {
  it('a role with only coupons sees the coupons tab (not delivery) and no settings are fetched', async () => {
    mockUser.role = 'admin';
    mockUser.permissions = ['coupons.view'];
    render(<Settings />);
    expect(await screen.findByText('coupons panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delivery' })).toBeNull();
    expect(svc.getSettings).not.toHaveBeenCalled();
    expect(svc.getBusinessHours).not.toHaveBeenCalled();
  });

  it('a role with no settings rights is told so', () => {
    mockUser.role = 'admin';
    mockUser.permissions = ['orders.view'];
    // orders.view opens the time slots tab (dispatch needs it) — read only.
    render(<Settings />);
    expect(screen.getByRole('button', { name: 'Time Slots' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delivery' })).toBeNull();
  });

  it('nothing at all → a clear message', () => {
    mockUser.role = 'admin';
    mockUser.permissions = [];
    render(<Settings />);
    expect(screen.getByText(/You do not have permission to view any settings sections/)).toBeInTheDocument();
  });
});
