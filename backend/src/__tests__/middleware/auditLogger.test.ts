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
      user: { id: 'admin-1', phone: '+923001234567', role: 'admin', full_name: 'Admin User' },
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
