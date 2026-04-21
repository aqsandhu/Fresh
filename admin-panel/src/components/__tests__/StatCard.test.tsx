import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatCard } from '@/components/ui/Card';

describe('StatCard', () => {
  it('renders with title and value', () => {
    render(<StatCard title="Total Sales" value="Rs. 50,000" />);
    
    expect(screen.getByText('Total Sales')).toBeInTheDocument();
    expect(screen.getByText('Rs. 50,000')).toBeInTheDocument();
  });

  it('renders with numeric value', () => {
    render(<StatCard title="Orders" value={150} />);
    
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('renders with subtitle when provided', () => {
    render(<StatCard title="Sales" value="Rs. 10,000" subtitle="Today" />);
    
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('renders with icon when provided', () => {
    render(
      <StatCard 
        title="Users" 
        value={42} 
        icon={<span data-testid="test-icon">Icon</span>} 
      />
    );
    
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('renders positive trend indicator', () => {
    render(
      <StatCard 
        title="Revenue" 
        value="Rs. 25,000" 
        trend={{ value: 15, isPositive: true }} 
      />
    );
    
    const trendElement = screen.getByText(/15%/);
    expect(trendElement).toBeInTheDocument();
    expect(trendElement.closest('div')).toHaveClass('text-green-600');
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('renders negative trend indicator', () => {
    render(
      <StatCard 
        title="Returns" 
        value={5} 
        trend={{ value: 10, isPositive: false }} 
      />
    );
    
    const trendElement = screen.getByText(/10%/);
    expect(trendElement).toBeInTheDocument();
    expect(trendElement.closest('div')).toHaveClass('text-red-600');
    expect(screen.getByText('↓')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <StatCard title="Test" value={100} className="custom-class" />
    );
    
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });

  it('renders without subtitle when not provided', () => {
    render(<StatCard title="Simple Card" value={50} />);
    
    // Should not render subtitle element
    const subtitleElements = screen.queryAllByText(/period/i);
    expect(subtitleElements.length).toBe(0);
  });

  it('renders without trend when not provided', () => {
    render(<StatCard title="No Trend" value={100} />);
    
    expect(screen.queryByText(/↑|↓/)).not.toBeInTheDocument();
  });

  it('displays correct trend suffix text', () => {
    render(
      <StatCard 
        title="Growth" 
        value="20%" 
        trend={{ value: 5, isPositive: true }} 
      />
    );
    
    expect(screen.getByText('vs last period')).toBeInTheDocument();
  });
});
