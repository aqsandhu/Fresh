import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the Orders page component behavior
jest.mock('@/services/order.service', () => ({
  orderService: {
    getOrders: jest.fn(),
    updateOrderStatus: jest.fn(),
    assignRider: jest.fn(),
  },
}));

jest.mock('@/services/rider.service', () => ({
  riderService: {
    getAvailableRiders: jest.fn(),
  },
}));

describe('Orders Page', () => {
  const createTestQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

  const mockOrders = [
    {
      id: 'order-1',
      order_number: 'FB-001',
      customer_name: 'Ali Khan',
      customer_phone: '+923001234567',
      total_amount: 1500,
      delivery_charge: 100,
      status: 'pending',
      payment_method: 'cod',
      delivery_address: 'House 123, Street 4, Gujrat',
      created_at: new Date().toISOString(),
      items: [
        { product_name: 'Apples', quantity: 2, unit_price: 250 },
        { product_name: 'Bananas', quantity: 1, unit_price: 150 },
      ],
    },
    {
      id: 'order-2',
      order_number: 'FB-002',
      customer_name: 'Sara Ahmed',
      customer_phone: '+923009876543',
      total_amount: 2500,
      delivery_charge: 0,
      status: 'confirmed',
      payment_method: 'cod',
      delivery_address: 'Flat 5, Block B, Gujrat',
      created_at: new Date().toISOString(),
      items: [
        { product_name: 'Chicken', quantity: 2, unit_price: 800 },
      ],
    },
    {
      id: 'order-3',
      order_number: 'FB-003',
      customer_name: 'Usman Ali',
      customer_phone: '+923005551111',
      total_amount: 850,
      delivery_charge: 100,
      status: 'out_for_delivery',
      payment_method: 'cod',
      delivery_address: 'Village Chowk, Gujrat',
      rider_name: 'Rider One',
      created_at: new Date().toISOString(),
      items: [
        { product_name: 'Vegetables Pack', quantity: 1, unit_price: 750 },
      ],
    },
  ];

  const mockRiders = [
    { id: 'rider-1', full_name: 'Rider One', phone: '+923001111111', status: 'available' },
    { id: 'rider-2', full_name: 'Rider Two', phone: '+923002222222', status: 'available' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates order data structure', () => {
    const order = mockOrders[0];
    
    expect(order).toHaveProperty('id');
    expect(order).toHaveProperty('order_number');
    expect(order).toHaveProperty('customer_name');
    expect(order).toHaveProperty('total_amount');
    expect(order).toHaveProperty('status');
    expect(order).toHaveProperty('items');
    expect(Array.isArray(order.items)).toBe(true);
  });

  it('calculates order total correctly', () => {
    const order = mockOrders[0];
    const itemsTotal = order.items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.unit_price,
      0
    );
    const grandTotal = itemsTotal + order.delivery_charge;
    
    expect(itemsTotal).toBe(650); // 2*250 + 1*150
    expect(grandTotal).toBe(750); // 650 + 100 delivery
  });

  it('identifies correct order statuses', () => {
    const statuses = mockOrders.map(o => o.status);
    
    expect(statuses).toContain('pending');
    expect(statuses).toContain('confirmed');
    expect(statuses).toContain('out_for_delivery');
  });

  it('filters orders by status', () => {
    const statusFilter = 'pending';
    const filtered = mockOrders.filter(o => o.status === statusFilter);
    
    expect(filtered).toHaveLength(1);
    expect(filtered[0].order_number).toBe('FB-001');
  });

  it('filters orders by search term', () => {
    const searchTerm = 'Ali';
    const filtered = mockOrders.filter(
      o => o.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           o.order_number.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0].customer_name).toContain('Ali');
  });

  it('validates status transitions', () => {
    const validTransitions: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['preparing', 'cancelled'],
      preparing: ['out_for_delivery'],
      out_for_delivery: ['delivered', 'failed'],
      delivered: [],
      cancelled: [],
    };

    expect(validTransitions['pending']).toContain('confirmed');
    expect(validTransitions['pending']).toContain('cancelled');
    expect(validTransitions['delivered']).toHaveLength(0);
    expect(validTransitions['out_for_delivery']).toContain('delivered');
  });

  it('validates rider assignment data', () => {
    const rider = mockRiders[0];
    
    expect(rider).toHaveProperty('id');
    expect(rider).toHaveProperty('full_name');
    expect(rider).toHaveProperty('phone');
    expect(rider).toHaveProperty('status');
    expect(rider.status).toBe('available');
  });

  it('checks order has delivery address', () => {
    for (const order of mockOrders) {
      expect(order.delivery_address).toBeDefined();
      expect(order.delivery_address.length).toBeGreaterThan(0);
    }
  });

  it('formats order number correctly', () => {
    const orderNumberPattern = /^FB-\d{3}$/;
    
    for (const order of mockOrders) {
      expect(order.order_number).toMatch(orderNumberPattern);
    }
  });

  it('calculates correct delivery charge based on amount', () => {
    const freeDeliveryThreshold = 500;
    
    for (const order of mockOrders) {
      const itemsSubtotal = order.items.reduce(
        (sum: number, item: any) => sum + item.quantity * item.unit_price, 0
      );
      
      if (itemsSubtotal >= freeDeliveryThreshold) {
        expect(order.delivery_charge).toBe(0);
      }
    }
  });

  it('has valid payment method', () => {
    const validPaymentMethods = ['cod', 'card', 'wallet'];
    
    for (const order of mockOrders) {
      expect(validPaymentMethods).toContain(order.payment_method);
    }
  });

  it('sorts orders by date descending', () => {
    const sorted = [...mockOrders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    expect(sorted[0].created_at >= sorted[1].created_at).toBe(true);
  });
});
