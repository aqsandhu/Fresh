import { jest } from '@jest/globals';
import express, { type Router } from 'express';
import request from 'supertest';

import adminRoutes from '@/routes/admin.routes';
import authRoutes from '@/routes/auth.routes';
import chatRoutes from '@/routes/chat.routes';
import notificationRoutes from '@/routes/notification.routes';
import productRoutes from '@/routes/product.routes';
import riderRoutes from '@/routes/rider.routes';
import { query } from '@/config/database';
import { errorHandler } from '@/middleware/errorHandler';
import { signAccessToken } from './helpers';

const mockQuery = query as jest.MockedFunction<typeof query>;

function ok<T>(rows: T[]): any {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function build(basePath: string, router: Router) {
  const app = express();
  app.use(express.json());
  app.use(basePath, router);
  app.use(errorHandler);
  return app;
}

describe('security and API regression checks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('auth socket-token requires an active DB user before minting', async () => {
    mockQuery.mockResolvedValueOnce(ok([{
      id: 'user-1',
      phone: '+923001234567',
      role: 'customer',
      status: 'active',
      full_name: 'Aisha',
    }]));

    const res = await request(build('/api/auth', authRoutes))
      .get('/api/auth/socket-token')
      .set('Authorization', `Bearer ${signAccessToken()}`);

    expect(res.status).toBe(200);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/deleted_at IS NULL/i);
  });

  it('auth me checks active/deleted status before returning the profile', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{
        id: 'user-1',
        phone: '+923001234567',
        full_name: 'Active Example',
        role: 'customer',
        status: 'active',
      }]))
      .mockResolvedValueOnce(ok([{
        id: 'user-1',
        phone: '+923001234567',
        full_name: 'Active Example',
        role: 'customer',
      }]));

    const res = await request(build('/api/auth', authRoutes))
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signAccessToken()}`);

    expect(res.status).toBe(200);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toMatch(/status = 'active'/i);
    expect(sql).toMatch(/deleted_at IS NULL/i);
  });

  it('rider profile rejects an unverified rider before controller data is returned', async () => {
    mockQuery.mockResolvedValueOnce(ok([{
      id: 'rider-1',
      status: 'active',
      verification_status: 'pending',
      full_name: 'Rider',
      phone: '+923001234567',
    }]));

    const res = await request(build('/api/rider', riderRoutes))
      .get('/api/rider/profile')
      .set('Authorization', `Bearer ${signAccessToken({ role: 'rider' })}`);

    expect(res.status).toBe(403);
  });

  it('notifications returns object shape, not Notification[]', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'user-1', role: 'customer', status: 'active', full_name: 'User' }]))
      .mockResolvedValueOnce(ok([{ id: 'n1', type: 'order', title: 'T', message: 'M', is_read: false }]))
      .mockResolvedValueOnce(ok([{ count: 1 }]));

    const res = await request(build('/api/notifications', notificationRoutes))
      .get('/api/notifications')
      .set('Authorization', `Bearer ${signAccessToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(false);
    expect(Array.isArray(res.body.data.notifications)).toBe(true);
  });

  it('notification register/delete and rider fcm/admin profile endpoints exist', async () => {
    const auth = `Bearer ${signAccessToken()}`;
    const riderAuth = `Bearer ${signAccessToken({ role: 'rider' })}`;
    const adminAuth = `Bearer ${signAccessToken({ role: 'super_admin', userId: 'admin-1' })}`;

    mockQuery
      // notification register: verifyUserActive + token update
      .mockResolvedValueOnce(ok([{ id: 'user-1', role: 'customer', status: 'active', full_name: 'User' }]))
      .mockResolvedValueOnce(ok([{ id: 'user-1' }]));
    const register = await request(build('/api/notifications', notificationRoutes))
      .post('/api/notifications/register')
      .set('Authorization', auth)
      .send({ token: 'push-token' });

    mockQuery
      // notification delete: verifyUserActive + delete
      .mockResolvedValueOnce(ok([{ id: 'user-1', role: 'customer', status: 'active', full_name: 'User' }]))
      .mockResolvedValueOnce(ok([{ id: 'n1' }]));
    const del = await request(build('/api/notifications', notificationRoutes))
      .delete('/api/notifications/n1')
      .set('Authorization', auth);

    mockQuery
      // rider fcm: verifyRiderActive + token update
      .mockResolvedValueOnce(ok([{
        id: 'user-1',
        phone: '+923001234567',
        role: 'rider',
        status: 'active',
        full_name: 'Rider',
        rider_id: 'rider-1',
        rider_status: 'available',
        verification_status: 'verified',
      }]))
      .mockResolvedValueOnce(ok([{ id: 'user-1' }]));
    const fcm = await request(build('/api/rider', riderRoutes))
      .put('/api/rider/fcm-token')
      .set('Authorization', riderAuth)
      .send({ token: 'push-token' });

    mockQuery
      // admin profile: verifyAdminActive + city probe + profile update
      .mockResolvedValueOnce(ok([{ id: 'admin-1', role: 'super_admin', status: 'active' }]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{
        id: 'admin-1',
        phone: '+923001234567',
        full_name: 'Admin',
        email: null,
        preferred_language: 'en',
        notification_enabled: true,
      }]));

    const adminProfile = await request(build('/api/admin', adminRoutes))
      .put('/api/admin/profile')
      .set('Authorization', adminAuth)
      .send({ full_name: 'Admin' });

    expect(register.status).toBe(200);
    expect(del.status).toBe(200);
    expect(fcm.status).toBe(200);
    expect(adminProfile.status).toBe(200);
  });

  it('new-arrivals rejects an invalid limit before SQL', async () => {
    mockQuery.mockResolvedValue(ok([]));

    const res = await request(build('/api/products', productRoutes))
      .get('/api/products/new-arrivals?limit=abc');

    expect(res.status).toBe(422);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('chat REST response includes sender_name from the active-user middleware', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{
        id: 'user-1',
        phone: '+923001234567',
        role: 'customer',
        status: 'active',
        full_name: 'Aisha',
      }]))
      .mockResolvedValueOnce(ok([{ id: 'order-1', status: 'assigned', user_id: 'user-1', rider_user_id: null }]))
      .mockResolvedValueOnce(ok([{ id: 'msg-1', message: 'hello', sender_type: 'customer', created_at: new Date().toISOString() }]));

    const res = await request(build('/api/chat', chatRoutes))
      .post('/api/chat/order-1')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ message: 'hello' });

    expect(res.status).toBe(201);
    expect(res.body.data.sender_name).toBe('Aisha');
  });
});
