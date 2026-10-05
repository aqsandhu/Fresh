import { mapTask, fixImageUrl } from '../src/services/task.service';
import { taskReference } from '../src/types';
import { primaryActionFor } from '../src/utils/taskMeta';

const baseRow = {
  id: 'task-1',
  task_type: 'delivery',
  status: 'assigned',
  assigned_at: '2026-10-05T08:00:00.000Z',
  order_id: 'order-1',
  order_number: 'FB-2401',
  order_status: 'out_for_delivery',
  total_amount: '1250.00',
  payment_method: 'cash_on_delivery',
  payment_status: 'pending',
  order_delivery_address: 'House 12, Street 4, Model Town',
  order_house_number: '12-B',
  order_landmark: 'Near the mosque',
  customer_phone: null,
  customer_name: null,
  rider_delivery_charge: '80.00',
};

describe('mapTask', () => {
  it('maps backend states 1:1 and derives COD amount for unpaid cash orders', () => {
    const task = mapTask(baseRow);
    expect(task.status).toBe('assigned');
    expect(task.codAmount).toBe(1250);
    expect(task.riderCharge).toBe(80);
    expect(task.houseNumber).toBe('12-B');
    expect(task.phoneVisible).toBe(false);
    expect(task.hasPin).toBe(false);
    expect(task.location).toBeNull();
  });

  it('shows the collected amount on completed COD tasks instead of "nothing to collect"', () => {
    const task = mapTask({ ...baseRow, status: 'completed', payment_status: 'completed', paid_amount: '1250.00' });
    expect(task.status).toBe('completed');
    expect(task.codAmount).toBe(1250);
  });

  it('has no cash to collect for prepaid orders', () => {
    const task = mapTask({ ...baseRow, payment_method: 'easypaisa', payment_status: 'completed' });
    expect(task.codAmount).toBeNull();
  });

  it('prefers the live address pin and exposes privacy-gated phone', () => {
    const task = mapTask({
      ...baseRow,
      address_latitude: '32.5742',
      address_longitude: '74.0789',
      has_location: true,
      location_added_by: 'customer',
      customer_phone: '+923001234567',
      customer_name: 'Ali',
      items: [{ id: 'i1', product_name: 'Tomato', quantity: 2, unit: 'half_kg', quality: 'A', unit_price: '60', total_price: '120' }],
    });
    expect(task.location).toEqual({ latitude: 32.5742, longitude: 74.0789 });
    expect(task.hasPin).toBe(true);
    expect(task.pinnedBy).toBe('customer');
    expect(task.phoneVisible).toBe(true);
    expect(task.items?.[0]).toMatchObject({ name: 'Tomato', quantity: 2, unit: 'half_kg', quality: 'A', totalPrice: 120 });
  });

  it('rejects out-of-range coordinates and unknown states safely', () => {
    const task = mapTask({ ...baseRow, status: 'bogus', delivery_latitude: '999', delivery_longitude: '10' });
    expect(task.status).toBe('assigned');
    expect(task.location).toBeNull();
  });

  it('uses the atta request number for atta tasks', () => {
    const task = mapTask({ ...baseRow, task_type: 'atta_pickup', order_id: null, order_number: null, atta_request_id: 'a1', atta_request_number: 'AT-77', wheat_quantity_kg: '20' });
    expect(task.type).toBe('atta_pickup');
    expect(task.wheatKg).toBe(20);
    expect(taskReference(task)).toBe('AT-77');
  });
});

describe('primaryActionFor', () => {
  it('offers pickup → deliver → nothing', () => {
    expect(primaryActionFor('assigned')).toBe('pickup');
    expect(primaryActionFor('in_progress')).toBe('deliver');
    expect(primaryActionFor('completed')).toBeNull();
    expect(primaryActionFor('failed')).toBeNull();
    expect(primaryActionFor('cancelled')).toBeNull();
  });
});

describe('fixImageUrl', () => {
  it('re-hosts LAN/localhost URLs and keeps public ones', () => {
    expect(fixImageUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(fixImageUrl('http://localhost:3000/uploads/a.jpg')).toMatch(/\/uploads\/a\.jpg$/);
    expect(fixImageUrl('/uploads/b.jpg')).toMatch(/\/uploads\/b\.jpg$/);
    expect(fixImageUrl(null)).toBeUndefined();
  });
});
