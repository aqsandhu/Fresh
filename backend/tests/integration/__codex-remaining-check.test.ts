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

describe('codex remaining findings cross-check', () => {
  beforeEach(() => jest.clearAllMocks());

  it('auth socket-token succeeds with JWT only and no DB query', async () => {
    const res = await request(build('/api/auth', authRoutes))
      .get('/api/auth/socket-token')
      .set('Authorization', `Bearer ${signAccessToken()}`);

    expect(res.status).toBe(200);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('auth me query has no status/deleted_at predicate and returns the row', async () => {
    mockQuery.mockResolvedValueOnce(ok([{
      id: 'user-1',
      phone: '+923001234567',
      full_name: 'Soft Deleted Example',
      role: 'customer',
    }]));

    const res = await request(build('/api/auth', authRoutes))
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signAccessToken()}`);

    expect(res.status).toBe(200);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).not.toMatch(/deleted_at|status\s*=/i);
  });

  it('rider profile returns a suspended/pending rider row instead of enforcing active/approved', async () => {
    mockQuery.mockResolvedValueOnce(ok([{
      id: 'rider-1',
      status: 'suspended',
      verification_status: 'pending',
      full_name: 'Rider',
      phone: '+923001234567',
    }]));

    const res = await request(build('/api/rider', riderRoutes))
      .get('/api/rider/profile')
      .set('Authorization', `Bearer ${signAccessToken({ role: 'rider' })}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('suspended');
    expect(res.body.data.verification_status).toBe('pending');
  });

  it('notifications returns object shape, not Notification[]', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'n1', type: 'order', title: 'T', message: 'M', is_read: false }]))
      .mockResolvedValueOnce(ok([{ count: 1 }]));

    const res = await request(build('/api/notifications', notificationRoutes))
      .get('/api/notifications')
      .set('Authorization', `Bearer ${signAccessToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(false);
    expect(Array.isArray(res.body.data.notifications)).toBe(true);
  });

  it('notification register/delete and rider fcm/admin profile endpoints are missing', async () => {
    const auth = `Bearer ${signAccessToken()}`;
    const riderAuth = `Bearer ${signAccessToken({ role: 'rider' })}`;
    const adminAuth = `Bearer ${signAccessToken({ role: 'super_admin', userId: 'admin-1' })}`;

    const register = await request(build('/api/notifications', notificationRoutes))
      .post('/api/notifications/register')
      .set('Authorization', auth)
      .send({ token: 'push-token' });

    const del = await request(build('/api/notifications', notificationRoutes))
      .delete('/api/notifications/n1')
      .set('Authorization', auth);

    const fcm = await request(build('/api/rider', riderRoutes))
      .put('/api/rider/fcm-token')
      .set('Authorization', riderAuth)
      .send({ token: 'push-token' });

    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'admin-1', role: 'super_admin', status: 'active' }]))
      .mockResolvedValueOnce(ok([]));

    const adminProfile = await request(build('/api/admin', adminRoutes))
      .put('/api/admin/profile')
      .set('Authorization', adminAuth)
      .send({ fullName: 'Admin' });

    expect(register.status).toBe(404);
    expect(del.status).toBe(404);
    expect(fcm.status).toBe(404);
    expect(adminProfile.status).toBe(404);
  });

  it('new-arrivals accepts an invalid limit and passes it to SQL params', async () => {
    mockQuery.mockResolvedValue(ok([]));

    const res = await request(build('/api/products', productRoutes))
      .get('/api/products/new-arrivals?limit=abc');

    expect(res.status).toBe(200);
    const calls = mockQuery.mock.calls;
    const lastParams = calls[calls.length - 1][1] as unknown[];
    expect(lastParams).toContain('abc');
  });

  it('chat REST response omits sender_name because authenticate does not load full_name', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'order-1', status: 'assigned', user_id: 'user-1', rider_user_id: null }]))
      .mockResolvedValueOnce(ok([{ id: 'msg-1', message: 'hello', sender_type: 'customer', created_at: new Date().toISOString() }]));

    const res = await request(build('/api/chat', chatRoutes))
      .post('/api/chat/order-1')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .send({ message: 'hello' });

    expect(res.status).toBe(201);
    expect(res.body.data.sender_name).toBeUndefined();
  });
});
