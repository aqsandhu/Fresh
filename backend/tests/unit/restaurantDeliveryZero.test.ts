/**
 * Bug I22 (round 10): delivery figures of 0 are real figures (free delivery /
 * no minimum). The restaurant delivery settings read a saved global 0 as
 * "missing" (`parseFloat(v) || default`), so the super admin saved 0, was told
 * it saved, and restaurants were still billed Rs 100. A per-restaurant 0
 * already worked; a blank or broken value still falls back to the default.
 */
jest.mock('../../src/config/database', () => ({ query: jest.fn(), withTransaction: jest.fn() }));

import { query } from '../../src/config/database';
import { getRestaurantDelivery } from '../../src/utils/restaurantOrders';

const mockQuery = query as unknown as jest.Mock;
const settings = (rows: Record<string, string>) =>
  mockQuery.mockResolvedValue({ rows: Object.entries(rows).map(([key, value]) => ({ key, value })) });

describe('restaurant delivery settings (I22)', () => {
  it('a global charge and free limit of 0 are kept (free delivery for restaurants)', async () => {
    settings({ restaurant_delivery_base_charge: '0', restaurant_free_delivery_threshold: '0' });
    await expect(getRestaurantDelivery({})).resolves.toMatchObject({ baseCharge: 0, freeThreshold: 0 });
  });

  it('a per-restaurant figure wins, 0 included', async () => {
    settings({ restaurant_delivery_base_charge: '150', restaurant_free_delivery_threshold: '3000' });
    await expect(getRestaurantDelivery({ delivery_base_charge: '0', free_delivery_threshold: null })).resolves.toMatchObject({ baseCharge: 0, freeThreshold: 3000 });
  });

  it('nothing saved, or a broken value → the defaults (Rs 100 below Rs 2000)', async () => {
    settings({});
    await expect(getRestaurantDelivery({})).resolves.toMatchObject({ baseCharge: 100, freeThreshold: 2000, urgentCharge: 0, slotCutoffPercent: 60 });
    settings({ restaurant_delivery_base_charge: 'abc', restaurant_free_delivery_threshold: '-5' });
    await expect(getRestaurantDelivery({})).resolves.toMatchObject({ baseCharge: 100, freeThreshold: 2000 });
  });
})
