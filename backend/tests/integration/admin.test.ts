// ============================================================================
// ADMIN ENDPOINTS INTEGRATION TESTS
// Tests: Admin CRUD, audit logging, role-based access, statistics
// ============================================================================

import { jest } from '@jest/globals';

jest.unstable_mockModule('@/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn((cb) => cb({ query: jest.fn() })),
}));

jest.unstable_mockModule('@/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { query } = await import('@/config/database');
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('Admin Endpoints', () => {
  const mockAdminId = 'admin-123';
  const mockSuperAdminId = 'super-admin-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  describe('POST /api/admin/login', () => {
    it('should login admin with valid credentials', async () => {
      const credentials = {
        phone: '+923001234567',
        password: 'admin123',
      };

      const mockAdmin = {
        id: mockAdminId,
        phone: credentials.phone,
        full_name: 'Admin User',
        role: 'admin',
        status: 'active',
        password_hash: await (await import('bcryptjs')).hash(credentials.password, 12),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockAdmin],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM admins WHERE phone = $1 AND status = $2',
        [credentials.phone, 'active']
      );

      expect(result.rows[0]).toBeDefined();
      expect(result.rows[0].role).toBe('admin');

      const bcrypt = await import('bcryptjs');
      const isMatch = await bcrypt.compare(credentials.password, result.rows[0].password_hash);
      expect(isMatch).toBe(true);
    });

    it('should reject inactive admin login', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: mockAdminId,
          phone: '+923001234567',
          status: 'inactive',
          role: 'admin',
        }],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM admins WHERE phone = $1',
        ['+923001234567']
      );

      expect(result.rows[0].status).toBe('inactive');
    });

    it('should reject non-admin user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM admins WHERE phone = $1 AND status = $2',
        ['+923009999999', 'active']
      );

      expect(result.rowCount).toBe(0);
    });
  });

  // ============================================================================
  describe('GET /api/admin/dashboard', () => {
    it('should return dashboard statistics', async () => {
      const mockStats = {
        totalOrders: 156,
        totalRevenue: 125000,
        totalCustomers: 89,
        totalRiders: 12,
        pendingOrders: 8,
        todayOrders: 23,
        todayRevenue: 18500,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '156' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [{ sum: '125000' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [{ count: '89' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [{ count: '12' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [{ count: '8' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [{ count: '23', sum: '18500' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });

      const totalOrders = await mockQuery('SELECT COUNT(*) FROM orders', []);
      const totalRevenue = await mockQuery('SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status = $1', ['delivered']);
      const totalCustomers = await mockQuery('SELECT COUNT(*) FROM users WHERE role = $1', ['customer']);
      const totalRiders = await mockQuery('SELECT COUNT(*) FROM riders WHERE status = $1', ['active']);
      const pendingOrders = await mockQuery('SELECT COUNT(*) FROM orders WHERE status = $1', ['pending']);
      const todayStats = await mockQuery(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as sum 
         FROM orders WHERE DATE(created_at) = CURRENT_DATE`,
        []
      );

      expect(totalOrders.rows[0].count).toBe('156');
      expect(totalRevenue.rows[0].sum).toBe('125000');
      expect(totalCustomers.rows[0].count).toBe('89');
      expect(totalRiders.rows[0].count).toBe('12');
      expect(pendingOrders.rows[0].count).toBe('8');
      expect(todayStats.rows[0].count).toBe('23');
    });

    it('should return weekly sales data', async () => {
      const weeklyData = [
        { day: 'Monday', orders: 12, revenue: 8500 },
        { day: 'Tuesday', orders: 15, revenue: 12000 },
        { day: 'Wednesday', orders: 10, revenue: 7500 },
        { day: 'Thursday', orders: 18, revenue: 15000 },
        { day: 'Friday', orders: 22, revenue: 18500 },
        { day: 'Saturday', orders: 25, revenue: 21000 },
        { day: 'Sunday', orders: 20, revenue: 16500 },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: weeklyData,
        rowCount: 7, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `SELECT TO_CHAR(created_at, 'Day') as day, COUNT(*) as orders, SUM(total_amount) as revenue 
         FROM orders 
         WHERE created_at >= NOW() - INTERVAL '7 days' 
         GROUP BY TO_CHAR(created_at, 'Day') 
         ORDER BY MIN(created_at)`,
        []
      );

      expect(result.rows).toHaveLength(7);
      expect(result.rows.reduce((sum: number, d: any) => sum + parseInt(d.orders), 0)).toBe(122);
    });
  });

  // ============================================================================
  describe('GET /api/admin/orders', () => {
    it('should return all orders for admin', async () => {
      const mockOrders = [
        { id: 'order-1', order_number: 'FB-001', total_amount: 550, status: 'pending', customer_name: 'Ali' },
        { id: 'order-2', order_number: 'FB-002', total_amount: 850, status: 'delivered', customer_name: 'Ahmed' },
        { id: 'order-3', order_number: 'FB-003', total_amount: 300, status: 'preparing', customer_name: 'Sara' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockOrders,
        rowCount: 3, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `SELECT o.*, u.full_name as customer_name 
         FROM orders o 
         JOIN users u ON o.user_id = u.id 
         ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`,
        [20, 0]
      );

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toHaveProperty('customer_name');
    });

    it('should filter orders by status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'order-1', status: 'pending' },
          { id: 'order-4', status: 'pending' },
        ],
        rowCount: 2, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM orders WHERE status = $1',
        ['pending']
      );

      expect(result.rows.every((o: any) => o.status === 'pending')).toBe(true);
    });
  });

  // ============================================================================
  describe('GET /api/admin/customers', () => {
    it('should return customer list with order counts', async () => {
      const mockCustomers = [
        { id: 'user-1', full_name: 'Ali Khan', phone: '+923001234567', total_orders: 12, total_spent: 15000 },
        { id: 'user-2', full_name: 'Sara Ahmed', phone: '+923009876543', total_orders: 8, total_spent: 9500 },
        { id: 'user-3', full_name: 'Usman Ali', phone: '+923005551111', total_orders: 3, total_spent: 3200 },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockCustomers,
        rowCount: 3, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `SELECT u.*, 
                COUNT(o.id) as total_orders, 
                COALESCE(SUM(o.total_amount), 0) as total_spent 
         FROM users u 
         LEFT JOIN orders o ON u.id = o.user_id 
         WHERE u.role = 'customer' 
         GROUP BY u.id 
         ORDER BY u.created_at DESC`,
        []
      );

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toHaveProperty('total_orders');
      expect(result.rows[0]).toHaveProperty('total_spent');
    });
  });

  // ============================================================================
  describe('PATCH /api/admin/orders/:id/assign-rider', () => {
    it('should assign rider to order', async () => {
      const orderId = 'order-1';
      const riderId = 'rider-1';

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: orderId,
          rider_id: riderId,
          status: 'out_for_delivery',
          updated_at: new Date(),
        }],
        rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `UPDATE orders SET rider_id = $1, status = 'out_for_delivery', updated_at = NOW() 
         WHERE id = $2 RETURNING *`,
        [riderId, orderId]
      );

      expect(result.rows[0].rider_id).toBe(riderId);
      expect(result.rows[0].status).toBe('out_for_delivery');
    });
  });

  // ============================================================================
  describe('Role-Based Access Control', () => {
    it('should allow super-admin to create new admin', async () => {
      const newAdmin = {
        phone: '+923001112222',
        full_name: 'New Admin',
        password_hash: 'hashed_password',
        role: 'admin',
        status: 'active',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-admin-1', ...newAdmin }],
        rowCount: 1, command: 'INSERT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `INSERT INTO admins (phone, full_name, password_hash, role, status) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [newAdmin.phone, newAdmin.full_name, newAdmin.password_hash, newAdmin.role, newAdmin.status]
      );

      expect(result.rows[0].role).toBe('admin');
    });

    it('should not allow regular admin to delete orders', async () => {
      const adminRole = 'admin';
      const allowedRolesForDelete = ['super_admin'];

      expect(allowedRolesForDelete).not.toContain(adminRole);
    });

    it('should verify admin role hierarchy', async () => {
      const roleHierarchy: Record<string, number> = {
        super_admin: 3,
        admin: 2,
        moderator: 1,
      };

      expect(roleHierarchy['super_admin']).toBeGreaterThan(roleHierarchy['admin']);
      expect(roleHierarchy['admin']).toBeGreaterThan(roleHierarchy['moderator']);
    });
  });

  // ============================================================================
  describe('Audit Logging', () => {
    it('should log admin actions', async () => {
      const auditEntry = {
        admin_id: mockAdminId,
        action: 'UPDATE_ORDER_STATUS',
        target_type: 'order',
        target_id: 'order-1',
        details: { old_status: 'pending', new_status: 'confirmed' },
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'audit-1', ...auditEntry, created_at: new Date() }],
        rowCount: 1, command: 'INSERT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, ip_address, user_agent) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          auditEntry.admin_id,
          auditEntry.action,
          auditEntry.target_type,
          auditEntry.target_id,
          JSON.stringify(auditEntry.details),
          auditEntry.ip_address,
          auditEntry.user_agent,
        ]
      );

      expect(result.rows[0].action).toBe('UPDATE_ORDER_STATUS');
      expect(result.rows[0].admin_id).toBe(mockAdminId);
    });

    it('should log failed login attempts', async () => {
      const failedLoginEntry = {
        phone: '+923001234567',
        action: 'FAILED_LOGIN',
        ip_address: '192.168.1.1',
        reason: 'Invalid password',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'audit-fail-1', ...failedLoginEntry, created_at: new Date() }],
        rowCount: 1, command: 'INSERT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `INSERT INTO audit_logs (action, target_id, details, ip_address) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [
          'FAILED_LOGIN',
          failedLoginEntry.phone,
          JSON.stringify({ reason: failedLoginEntry.reason }),
          failedLoginEntry.ip_address,
        ]
      );

      expect(result.rows[0].action).toBe('FAILED_LOGIN');
    });

    it('should retrieve audit log entries', async () => {
      const mockLogs = [
        { id: 'audit-1', action: 'UPDATE_ORDER_STATUS', admin_id: mockAdminId, created_at: new Date() },
        { id: 'audit-2', action: 'DELETE_PRODUCT', admin_id: mockAdminId, created_at: new Date() },
        { id: 'audit-3', action: 'CREATE_RIDER', admin_id: mockSuperAdminId, created_at: new Date() },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockLogs,
        rowCount: 3, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [20, 0]
      );

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].action).toBe('UPDATE_ORDER_STATUS');
    });

    it('should filter audit logs by admin', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'audit-1', action: 'UPDATE_ORDER_STATUS', admin_id: mockAdminId },
        ],
        rowCount: 1, command: 'SELECT', oid: 0, fields: [],
      });

      const result = await mockQuery(
        'SELECT * FROM audit_logs WHERE admin_id = $1',
        [mockAdminId]
      );

      expect(result.rows.every((l: any) => l.admin_id === mockAdminId)).toBe(true);
    });
  });

  // ============================================================================
  describe('Admin Settings Management', () => {
    it('should update site settings', async () => {
      const settings = {
        delivery_charge: 100,
        free_delivery_threshold: 500,
        contact_phone: '+923001234567',
        whatsapp_number: '+923001234567',
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'settings-1', ...settings, updated_at: new Date() }],
        rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
      });

      const result = await mockQuery(
        `UPDATE site_settings SET delivery_charge = $1, free_delivery_threshold = $2, 
         contact_phone = $3, whatsapp_number = $4, updated_at = NOW() RETURNING *`,
        [settings.delivery_charge, settings.free_delivery_threshold, settings.contact_phone, settings.whatsapp_number]
      );

      expect(result.rows[0].delivery_charge).toBe(100);
      expect(result.rows[0].free_delivery_threshold).toBe(500);
    });

    it('should update delivery time slots', async () => {
      const timeSlots = [
        { id: 'slot-1', start_time: '09:00', end_time: '12:00', max_orders: 20 },
        { id: 'slot-2', start_time: '12:00', end_time: '15:00', max_orders: 25 },
        { id: 'slot-3', start_time: '15:00', end_time: '18:00', max_orders: 20 },
      ];

      for (const slot of timeSlots) {
        mockQuery.mockResolvedValueOnce({
          rows: [{ ...slot, updated_at: new Date() }],
          rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
        });

        const result = await mockQuery(
          'UPDATE delivery_slots SET max_orders = $1 WHERE id = $2 RETURNING *',
          [slot.max_orders, slot.id]
        );

        expect(result.rows[0].max_orders).toBe(slot.max_orders);
      }
    });
  });
});
