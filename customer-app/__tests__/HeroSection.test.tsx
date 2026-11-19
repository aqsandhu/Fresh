// The home brand band (app) — per city: office phone, WhatsApp ordering, the
// free-delivery limit and free slot. I23: switching to a city with no phone /
// WhatsApp kept the PREVIOUS city's (they were only ever set, never cleared),
// so a Lahore customer was sent to Gujrat's WhatsApp.
import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('@expo/vector-icons', () => ({ MaterialIcons: () => null }));
const mockCity = { id: 'grt', name: 'Gujrat' };
jest.mock('@/context/CityContext', () => ({
  useCityContext: () => ({ selectedCityId: mockCity.id }),
  useOptionalCityName: () => mockCity.name,
}));
type CityData = { phone?: string; whatsapp?: string; threshold?: number; free?: string };
const mockData: Record<string, CityData> = {
  grt: { phone: '0300 1112222', whatsapp: 'https://wa.me/923001112222', threshold: 800, free: '6 PM - 9 PM' },
  lhr: { threshold: 0 },
};
jest.mock('@services/product.service', () => ({
  productService: {
    getBannerSettings: jest.fn(async () => ({ success: true, data: { leftText: mockData[mockCity.id].phone } })),
    getWhatsAppOrderUrl: jest.fn(async () => ({ success: true, data: { url: mockData[mockCity.id].whatsapp } })),
    getHeroImage: jest.fn(async () => ({ success: true, data: { url: null } })),
  },
}));
jest.mock('@services/order.service', () => ({
  orderService: {
    getDeliverySettings: jest.fn(async () => ({ success: true, data: { free_delivery_threshold: mockData[mockCity.id].threshold } })),
    getDeliverySlots: jest.fn(async () => ({ success: true, data: mockData[mockCity.id].free ? [{ isFreeDelivery: true, label: mockData[mockCity.id].free }] : [] })),
  },
}));

import { HeroSection } from '@/components/home/sections/HeroSection';

beforeEach(() => {
  mockCity.id = 'grt';
  mockCity.name = 'Gujrat';
});

describe('HeroSection (app)', () => {
  it("the city's phone, WhatsApp, free limit and free slot", async () => {
    const s = render(<HeroSection onShopNow={jest.fn()} />);
    expect(await s.findByText('0300 1112222')).toBeTruthy();
    expect(s.getByText('WhatsApp to Order')).toBeTruthy();
    expect(s.getByText('Free Delivery on Rs. 800+ Sabzi/Fruits')).toBeTruthy();
    expect(s.getByText('6 PM - 9 PM')).toBeTruthy();
  });

  it("switching to a city without a phone / WhatsApp drops the previous city's (I23)", async () => {
    const s = render(<HeroSection onShopNow={jest.fn()} />);
    expect(await s.findByText('0300 1112222')).toBeTruthy();
    mockCity.id = 'lhr';
    mockCity.name = 'Lahore';
    s.rerender(<HeroSection onShopNow={jest.fn()} />);
    await waitFor(() => expect(s.getByText(/Now Delivering in Lahore/)).toBeTruthy());
    await act(async () => { await Promise.resolve(); });
    expect(s.queryByText('0300 1112222')).toBeNull();
    expect(s.queryByText('WhatsApp to Order')).toBeNull();
    expect(s.queryByText('6 PM - 9 PM')).toBeNull();
    expect(s.getByText('Free Delivery on Rs. 500+ Sabzi/Fruits')).toBeTruthy();
  });
});
