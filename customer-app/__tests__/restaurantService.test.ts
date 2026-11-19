// Restaurant (B2B) side of the app: its own session in secure storage (moved
// out of AsyncStorage once), its own API calls (a 401 ends the session), and
// prices that match what the server bills — including the admin's half/quarter
// overrides, which the app used to ignore.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  restaurantApi, setRestaurantSession, getRestaurantToken, getRestaurantInfo, clearRestaurantSession,
  unitPrice, qualityBasePrice, availableQualities, qualityStock, availableUnits, money, round2,
} from '@services/restaurant.service';

const respond = (status: number, body: unknown) =>
  jest.fn(async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch;

beforeEach(async () => {
  jest.clearAllMocks();
  await clearRestaurantSession();
});

describe('session', () => {
  it('kept in secure storage; info read back; cleared', async () => {
    await setRestaurantSession('rtok', { id: 'r1', business_name: 'Cafe', phone: '0300' });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('restaurant_token', 'rtok');
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (k: string) =>
      k === 'restaurant_token' ? 'rtok' : JSON.stringify({ id: 'r1', business_name: 'Cafe', phone: '0300' }));
    expect(await getRestaurantToken()).toBe('rtok');
    expect(await getRestaurantInfo()).toMatchObject({ business_name: 'Cafe' });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('{not json');
    expect(await getRestaurantInfo()).toBeNull();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it('API calls carry the restaurant token; a 401 ends the restaurant session', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('rtok');
    global.fetch = respond(200, { data: [{ id: 'c1' }] });
    expect(await restaurantApi.getCategories()).toEqual([{ id: 'c1' }]);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer rtok');
    global.fetch = respond(401, { message: 'Session expired' });
    await expect(restaurantApi.getOrders()).rejects.toMatchObject({ message: 'Session expired', status: 401 });
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('restaurant_token');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it('login, register, orders, time slots, uploads', async () => {
    global.fetch = respond(200, { data: { token: 't', restaurant: { id: 'r1' } } });
    expect((await restaurantApi.login('0300', '1234')).token).toBe('t');
    await restaurantApi.register({ business_name: 'Cafe', phone: '0300', pin: '1234' });
    await restaurantApi.placeOrder([{ product_id: 'p1', quantity: 2, unit: 'half_kg', quality: 'A' }], { urgent_delivery: true });
    await restaurantApi.getTimeSlots('2026-11-16');
    await restaurantApi.getProducts('cat 1');
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith('/restaurant/time-slots?date=2026-11-16'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/restaurant/products?category=cat%201'))).toBe(true);
    const order = (global.fetch as jest.Mock).mock.calls.find((c) => String(c[0]).endsWith('/restaurant/orders'));
    expect(JSON.parse(order![1].body)).toMatchObject({ urgent_delivery: true, items: [{ product_id: 'p1', unit: 'half_kg' }] });
    global.fetch = respond(400, { message: 'Too big' });
    await expect(restaurantApi.uploadFrontImage('file:///x/front.png')).rejects.toThrow('Too big');
  });

  it('old sessions in AsyncStorage are moved to secure storage once', async () => {
    await AsyncStorage.setItem('restaurant_token', 'legacy');
    let svc: typeof import('@services/restaurant.service') | undefined;
    jest.isolateModules(() => { svc = require('@services/restaurant.service'); });
    await svc!.getRestaurantToken();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('restaurant_token', 'legacy');
    expect(await AsyncStorage.getItem('restaurant_token')).toBeNull();
  });
});

describe('restaurant prices (must match what the server bills)', () => {
  const product = { price: '200', price_b: '150', restaurant_price_a: '180', unit_type: 'kg', stock_quantity: '9', stock_quantity_b: '2' };

  it('restaurant price wins over the consumer price; B only when it has a consumer price', () => {
    expect(qualityBasePrice(product, 'A')).toBe(180);
    expect(qualityBasePrice(product, 'B')).toBe(150);
    expect(qualityBasePrice(product, 'C')).toBeNull();
    expect(availableQualities(product)).toEqual(['A', 'B']);
    expect(qualityStock(product, 'B')).toBe(2);
    expect(qualityStock(product, 'A')).toBe(9);
  });

  it('half / quarter kg: the admin override is billed, otherwise derived', () => {
    expect(unitPrice(product, 'A', 'half_kg')).toBe(90);
    expect(unitPrice({ ...product, restaurant_half_kg_price_a: '85' }, 'A', 'half_kg')).toBe(85);
    expect(unitPrice({ ...product, restaurant_quarter_kg_price_b: '35' }, 'B', 'quarter_kg')).toBe(35);
    expect(unitPrice(product, 'C', 'half_kg')).toBeNull();
    expect(unitPrice({ price: 360, unit_type: 'dozen', restaurant_half_dozen_price_a: '170' }, 'A', 'half_dozen')).toBe(170);
    expect(unitPrice(product, 'A', 'full')).toBe(180);
  });

  it('units offered and money', () => {
    expect(availableUnits({ unit_type: 'kg', allow_quarter_kg: false }).map((u) => u.value)).toEqual(['full', 'half_kg']);
    expect(availableUnits({ unit_type: 'dozen' }).map((u) => u.value)).toEqual(['full', 'half_dozen']);
    expect(availableUnits({ unit_type: 'piece' }).map((u) => u.value)).toEqual(['full']);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(money(1234.5)).toMatch(/Rs\. 1,234\.5/);
  });
});

describe('deleting the restaurant account (B30, A27 — round 6)', () => {
  it('sends the PIN typed again, and shows why the server refused', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('rtok');
    global.fetch = respond(200, { data: null });
    await restaurantApi.deleteAccount('1357');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/restaurant\/delete-account$/);
    expect(JSON.parse(init.body)).toEqual({ pin: '1357' });

    const busy = 'You have 1 order in progress. The account can be deleted once it is delivered or cancelled.';
    (SecureStore.deleteItemAsync as jest.Mock).mockClear(); // beforeEach cleared the session itself
    global.fetch = respond(409, { message: busy });
    await expect(restaurantApi.deleteAccount('1357')).rejects.toMatchObject({ message: busy, status: 409 });
    // A refusal is not a sign-out: the session stays.
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith('restaurant_token');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });
});
