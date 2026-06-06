import React from 'react';
import { render, screen } from '@testing-library/react';

import '../mocks/layoutMocks';
import Footer from '@/components/layout/Footer';

jest.mock('next/link', () => {
  return ({ children, href, className }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  );
});

jest.mock('lucide-react', () => ({
  Phone: () => <span data-testid="phone-icon">Phone</span>,
  Mail: () => <span data-testid="mail-icon">Mail</span>,
  MapPin: () => <span data-testid="map-icon">Map</span>,
  Facebook: () => <span data-testid="facebook-icon">FB</span>,
  Instagram: () => <span data-testid="instagram-icon">IG</span>,
  Twitter: () => <span data-testid="twitter-icon">TW</span>,
  Youtube: () => <span data-testid="youtube-icon">YT</span>,
  CreditCard: () => <span data-testid="card-icon">Card</span>,
  Truck: () => <span data-testid="truck-icon">Truck</span>,
  ShieldCheck: () => <span data-testid="shield-icon">Shield</span>,
  Clock: () => <span data-testid="clock-icon">Clock</span>,
}));

describe('Footer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders footer with features bar', () => {
    render(<Footer />);
    expect(screen.getByText('Free Delivery')).toBeInTheDocument();
    expect(screen.getByText('On Rs. 500+ vegetables/fruits')).toBeInTheDocument();
  });

  it('renders all four feature items', () => {
    render(<Footer />);

    const features = [
      { title: 'Free Delivery', desc: 'On Rs. 500+ vegetables/fruits' },
      { title: 'Free Time Slots', desc: 'Pick a free-delivery slot' },
      { title: 'Fresh Guarantee', desc: '100% fresh products' },
      { title: 'Cash on Delivery', desc: 'Pay when you receive' },
    ];

    for (const feature of features) {
      expect(screen.getByText(feature.title)).toBeInTheDocument();
      expect(screen.getByText(feature.desc)).toBeInTheDocument();
    }
  });

  it('renders brand logo and description', () => {
    render(<Footer />);
    expect(screen.getByTestId('brand-logo')).toBeInTheDocument();
    expect(
      screen.getByText(/Your trusted partner for fresh groceries delivery in Pakistan/)
    ).toBeInTheDocument();
  });

  it('renders Urdu tagline', () => {
    render(<Footer />);
    expect(screen.getByText(/پاکستان میں تازہ سبزیاں اور پھل آپ کے گھر تک/)).toBeInTheDocument();
  });

  it('renders shop links', () => {
    render(<Footer />);

    for (const label of [
      'Fresh Vegetables',
      'Fresh Fruits',
      'Dry Fruits',
      'Fresh Chicken',
      'Atta Chakki',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders company links', () => {
    render(<Footer />);

    for (const label of ['About Us', 'Contact Us', 'FAQs', 'Privacy Policy', 'Terms of Service']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders support links', () => {
    render(<Footer />);

    for (const label of ['Help Center', 'Track Order', 'Returns', 'Shipping Info']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders contact information', () => {
    render(<Footer />);
    expect(screen.getByText('0300-1234567')).toBeInTheDocument();
    expect(screen.getByText('support@freshbazar.pk')).toBeInTheDocument();
    expect(screen.getByText('Gujrat, Pakistan')).toBeInTheDocument();
  });

  it('renders copyright notice', () => {
    render(<Footer />);
    expect(screen.getByText(/Fresh Bazar Pakistan/)).toBeInTheDocument();
  });
});
