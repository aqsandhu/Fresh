import { mapTask } from '../src/services/task.service';
import { extractPhones } from '../src/utils/helpers';

const orderRow = {
  id: 'task-9',
  task_type: 'delivery',
  status: 'in_progress',
  order_id: 'order-9',
  order_number: 'FB-9001',
  total_amount: '2400.00',
  payment_method: 'cash_on_delivery',
  payment_status: 'pending',
  order_delivery_address: 'Shop 4, GT Road',
};

describe('mapTask — rider flow fields', () => {
  it('maps restaurant orders (name from the snapshot) and the arrival stamp', () => {
    const task = mapTask({
      ...orderRow,
      is_restaurant: true,
      restaurant_name: 'Karahi House',
      arrived_at: '2026-10-31T12:00:00.000Z',
    });
    expect(task.isRestaurant).toBe(true);
    expect(task.restaurantName).toBe('Karahi House');
    expect(task.arrivedAt).toBe('2026-10-31T12:00:00.000Z');
    expect(task.cashTo).toBe('office');
  });

  it('marks cash for an Order Collection Point', () => {
    const task = mapTask({ ...orderRow, ocp_id: 'ocp-1', ocp_name: 'Model Town Point', ocp_address: 'Block C' });
    expect(task.codAmount).toBe(2400);
    expect(task.cashTo).toBe('ocp');
    expect(task.ocpName).toBe('Model Town Point');
  });

  it('atta delivery collects the atta charges in cash', () => {
    const task = mapTask({
      id: 'task-a',
      task_type: 'atta_delivery',
      status: 'in_progress',
      atta_request_id: 'ar-1',
      atta_request_number: 'ATTA-77',
      atta_total_amount: '650.00',
      atta_payment_status: 'pending',
      atta_payment_method: 'cash_on_delivery',
      wheat_quality: 'desi',
      flour_type: 'fine',
      atta_instructions: 'Contact: 0300-1234567',
      order_delivery_address: 'House 1',
    });
    expect(task.codAmount).toBe(650);
    expect(task.cashTo).toBe('office');
    expect(task.wheatQuality).toBe('desi');
    expect(task.flourType).toBe('fine');
    expect(task.attaInstructions).toContain('0300');
  });

  it('atta pickup never asks for cash', () => {
    const task = mapTask({
      id: 'task-b',
      task_type: 'atta_pickup',
      status: 'assigned',
      atta_request_id: 'ar-1',
      atta_total_amount: '650.00',
      atta_payment_status: 'pending',
    });
    expect(task.codAmount).toBeNull();
    expect(task.cashTo).toBeNull();
  });

  it('carries the re-weighed item weight', () => {
    const task = mapTask({ ...orderRow, items: [{ id: 'i1', product_name: 'Chicken', quantity: 1, weight_kg: '1.000', final_weight_kg: '1.250', unit_price: '600', total_price: '750' }] });
    expect(task.items?.[0].finalWeightKg).toBe(1.25);
    expect(task.items?.[0].totalPrice).toBe(750);
  });
});

describe('extractPhones', () => {
  it('finds Pakistani mobiles in free text and normalises them', () => {
    expect(extractPhones('Contact: 0300-1234567\nRing twice')).toEqual(['03001234567']);
    expect(extractPhones('call +92 321 7654321 or 0321 7654321')).toEqual(['03217654321']);
    expect(extractPhones('no number here')).toEqual([]);
    expect(extractPhones(null)).toEqual([]);
  });
});

describe('COD-only payment safety', () => {
  it('a non-COD order with pending payment is NOT shown as paid', () => {
    const task = mapTask({ ...orderRow, payment_method: 'card', payment_status: 'pending' });
    expect(task.paymentUnconfirmed).toBe(true);
    expect(task.codAmount).toBeNull();
  });

  it('a genuinely paid non-COD order and every COD order are fine', () => {
    expect(mapTask({ ...orderRow, payment_method: 'card', payment_status: 'completed' }).paymentUnconfirmed).toBe(false);
    expect(mapTask(orderRow).paymentUnconfirmed).toBe(false);
  });
});
