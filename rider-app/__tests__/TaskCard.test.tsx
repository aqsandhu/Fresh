import React from 'react';
import { render } from '@testing-library/react-native';
import TaskCard from '../src/components/TaskCard';

const task: any = {
  id: 'task-1',
  orderId: 'ORD-1001',
  type: 'delivery',
  status: 'assigned',
  customerName: 'Test Customer',
  customerAddress: '123 Test Street, Lahore',
  timeWindow: '10:00 AM - 11:00 AM',
  distance: '2.5',
  estimatedTime: '15 min',
};

describe('Rider TaskCard', () => {
  it('renders without crashing', () => {
    const tree = render(<TaskCard task={task} />);
    expect(tree.toJSON()).toBeTruthy();
  });
});
