import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TaskCard from '../src/components/TaskCard';
import type { Task } from '../src/types';

const task: Task = {
  id: 'task-1',
  type: 'delivery',
  status: 'assigned',
  orderId: 'o1',
  orderNumber: 'FB-1001',
  orderStatus: 'out_for_delivery',
  address: '123 Test Street, Lahore',
  houseNumber: '7',
  landmark: 'Opposite park',
  location: { latitude: 31.5, longitude: 74.3 },
  hasPin: true,
  phoneVisible: false,
  codAmount: 850,
  isUrgent: false,
  paymentMethod: 'cash_on_delivery',
  totalAmount: 850,
  timeSlotName: '10 AM – 2 PM',
};

describe('TaskCard', () => {
  it('shows order number, house number, cash to collect and status', () => {
    const { getByText } = render(<TaskCard task={task} />);
    expect(getByText('Order #FB-1001')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
    expect(getByText('Collect Rs. 850')).toBeTruthy();
    expect(getByText('Assigned')).toBeTruthy();
  });

  it('shows a straight-line distance when the rider position is known', () => {
    const { getByText } = render(<TaskCard task={task} riderPoint={{ latitude: 31.51, longitude: 74.3 }} />);
    expect(getByText(/~1\.1 km/)).toBeTruthy();
  });

  it('shows the collected amount for completed COD tasks and fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(<TaskCard task={{ ...task, status: 'completed', completedAt: '2026-10-05T10:00:00Z' }} onPress={onPress} />);
    expect(getByText('Rs. 850')).toBeTruthy();
    fireEvent.press(getByText('Order #FB-1001'));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));
  });
});
