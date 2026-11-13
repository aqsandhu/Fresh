// ============================================================================
// AUDIT LOGGER MIDDLEWARE TESTS
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { auditLogger, logAdminAction } from '../../middleware/auditLogger';
import { query } from '../../config/database';

describe('Audit Logger Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      method: 'PUT',
      path: '/api/admin/orders/123/status',
      route: { path: '/orders/:id/status' },
      params: { id: '123' },
      body: { status: 'confirmed' },
      user: { userId: 'admin-1', id: 'admin-1', phone: '+923001234567', role: 'admin', full_name: 'Admin User' },
      ip: '192.168.1.1',
      headers: { 'user-agent': 'test-agent' },
    };
    mockRes = {
      statusCode: 200,
      json: jest.fn(),
      on: jest.fn((event: string, cb: any) => {
        if (event === 'finish') cb();
        return mockRes as Response;
      }),
    };
    nextFunction = jest.fn();
  });

  it('should pass through for GET requests', async () => {
    mockReq.method = 'GET';

    const middleware = auditLogger();
    await middleware(mockReq as Request, mockRes as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('should pass through without user in non-optional mode', async () => {
    mockReq.user = undefined;

    const middleware = auditLogger();
    await middleware(mockReq as Request, mockRes as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
  });

  // The middleware is mounted with router.use(): at that moment req.route and
  // req.params are empty and req.path is relative to the router. It used to
  // store resource "unknown"/the record id, no resource_id and never an old
  // value — so a price change could not be traced.
  it('names the resource and record from the path and keeps the old value', async () => {
    const id = '0ddd2483-44c8-4514-a0a7-fd1453d219b6';
    (query as jest.Mock).mockResolvedValue({ rows: [{ id, price: '1000.00' }] });
    mockReq = { ...mockReq, path: `/products/${id}`, route: undefined, params: {}, body: { price: 1 } };

    await auditLogger()(mockReq as Request, mockRes as Response, nextFunction);
    await new Promise((r) => setImmediate(r));

    const calls = (query as jest.Mock).mock.calls;
    expect(calls[0][0]).toContain('FROM products');
    expect(calls[0][1]).toEqual([id]);
    const insert = calls.find((c) => String(c[0]).includes('INSERT INTO audit_logs'))!;
    expect(insert[1][3]).toBe('products'); // resource
    expect(insert[1][4]).toBe(id); // resource_id
    expect(JSON.parse(insert[1][5])).toMatchObject({ price: '1000.00' }); // old value
    expect(JSON.parse(insert[1][6])).toEqual({ price: 1 }); // new value
  });

  it('names finance resources that have no id in the path', async () => {
    (query as jest.Mock).mockResolvedValue({ rows: [] });
    mockReq = { ...mockReq, method: 'POST', path: '/expenses', route: undefined, params: {}, body: { amount: 500 } };

    await auditLogger()(mockReq as Request, mockRes as Response, nextFunction);
    await new Promise((r) => setImmediate(r));

    const insert = (query as jest.Mock).mock.calls.find((c) => String(c[0]).includes('INSERT INTO audit_logs'))!;
    expect(insert[1][3]).toBe('expenses');
    expect(insert[1][4]).toBeNull();
  });

  it('should log admin action manually', async () => {
    (query as jest.Mock).mockResolvedValue({ rows: [] });

    await logAdminAction({
      action: 'UPDATE_ORDER_STATUS',
      adminId: 'admin-1',
      adminEmail: 'Admin User',
      resource: 'orders',
      resourceId: '123',
      newData: { status: 'confirmed' },
      ip: '192.168.1.1',
      status: 'success',
    });

    expect(query).toHaveBeenCalled();
    const callArgs = (query as jest.Mock).mock.calls[0];
    expect(callArgs[0]).toContain('INSERT INTO audit_logs');
  });
});

describe('Audit Logger redaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (query as jest.Mock).mockResolvedValue({ rows: [] });
  });

  it('redacts PIN / OTP / bank fields but keeps unrelated keys like shipping_address', async () => {
    await logAdminAction({
      action: 'UPDATE_OCP',
      adminId: 'admin-1',
      resource: 'ocp',
      resourceId: 'ocp-1',
      newData: {
        pin: '1234',
        new_pin: '5678',
        otp_code: '000000',
        bank_account_number: '1234567890',
        shipping_address: 'Street 1',
        nested: { pin_hash: 'x', note: 'ok' },
      },
      ip: '127.0.0.1',
      status: 'success',
    });

    const callArgs = (query as jest.Mock).mock.calls[0];
    const stored = JSON.parse(callArgs[1][6]); // $7 = new_data
    expect(stored.pin).toBe('[REDACTED]');
    expect(stored.new_pin).toBe('[REDACTED]');
    expect(stored.otp_code).toBe('[REDACTED]');
    expect(stored.bank_account_number).toBe('[REDACTED]');
    expect(stored.nested.pin_hash).toBe('[REDACTED]');
    expect(stored.nested.note).toBe('ok');
    expect(stored.shipping_address).toBe('Street 1');
  });
});
