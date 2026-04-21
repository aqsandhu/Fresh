import React from 'react';
import { render, screen } from '@testing-library/react';
import Footer from '@/components/layout/Footer';

// Mock Next.js Link
jest.mock('next/link', () => {
  return ({ children, href, className }: any) => (
    <a href={href} className={className}>{children}</a>
  );
});

// Mock lucide-react icons
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
    expect(screen.getByText('On orders above Rs. 500')).toBeInTheDocument();
  });

  it('renders all four feature items', () => {
    render(<Footer />);
    
    const features = [
      { title: 'Free Delivery', desc: 'On orders above Rs. 500' },
      { title: '10AM-2PM Free', desc: 'If ordered before 10AM' },
      { title: 'Fresh Guarantee', desc: '100% fresh products' },
      { title: 'Cash on Delivery', desc: 'Pay when you receive' },
    ];

    for (const feature of features) {
      expect(screen.getByText(feature.title)).toBeInTheDocument();
      expect(screen.getByText(feature.desc)).toBeInTheDocument();
    }
  });

  it('renders brand name and description', () => {
    render(<Footer />);
    
    expect(screen.getByText('SabziWala')).toBeInTheDocument();
    expect(screen.getByText(/Your trusted partner for fresh groceries delivery/)).toBeInTheDocument();
  });

  it('renders Urdu brand text', () => {
    render(<Footer />);
    
    // Check for Urdu text presence (سبزی والا)
    const urduElement = screen.getByText(/سبزی والا/);
    expect(urduElement).toBeInTheDocument();
  });

  it('renders shop links', () => {
    render(<Footer />);
    
    const shopLinks = [
      'Fresh Vegetables',
      'Fresh Fruits',
      'Dry Fruits',
      'Fresh Chicken',
      'Atta Chakki',
    ];

    for (const link of shopLinks) {
      expect(screen.getByText(link)).toBeInTheDocument();
    }
  });

  it('renders company links', () => {
    render(<Footer />);
    
    expect(screen.getByText('About Us')).toBeInTheDocument();
    expect(screen.getByText('Contact Us')).toBeInTheDocument();
    expect(screen.getByText('FAQs')).toBeInTheDocument();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    expect(screen.getByText('Terms of Service')).toBeInTheDocument();
  });

  it('renders support links', () => {
    render(<Footer />);
    
    expect(screen.getByText('Help Center')).toBeInTheDocument();
    expect(screen.getByText('Track Order')).toBeInTheDocument();
    expect(screen.getByText('Returns')).toBeInTheDocument();
    expect(screen.getByText('Shipping Info')).toBeInTheDocument();
  });

  it('renders contact information', () => {
    render(<Footer />);
    
    expect(screen.getByText('0300-1234567')).toBeInTheDocument();
    expect(screen.getByText('support@sabziwala.pk')).toBeInTheDocument();
    expect(screen.getByText('Gujrat, Pakistan')).toBeInTheDocument();
  });

  it('renders social media links', () => {
    render(<Footer />);
    
    const socialLinks = ['facebook', 'instagram', 'twitter', 'youtube'];
    
    for (const social of socialLinks) {
      const icon = screen.getByTestId(`${social}-icon`);
      expect(icon).toBeInTheDocument();
    }
  });

  it('renders copyright text with current year', () => {
    render(<Footer />);
    
    const currentYear = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(currentYear))).toBeInTheDocument();
    expect(screen.getByText(/SabziWala Pakistan. All rights reserved./)).toBeInTheDocument();
  });

  it('renders footer links with correct hrefs', () => {
    render(<Footer />);
    
    const sabziLink = screen.getByText('Fresh Vegetables').closest('a');
    expect(sabziLink).toHaveAttribute('href', '/category/sabzi');
    
    const fruitLink = screen.getByText('Fresh Fruits').closest('a');
    expect(fruitLink).toHaveAttribute('href', '/category/fruit');
    
    const attaLink = screen.getByText('Atta Chakki').closest('a');
    expect(attaLink).toHaveAttribute('href', '/atta-chakki');
  });

  it('renders footer with dark background styling', () => {
    const { container } = render(<Footer />);
    
    const footer = container.querySelector('footer');
    expect(footer).toHaveClass('bg-gray-900');
    expect(footer).toHaveClass('text-white');
  });
});
