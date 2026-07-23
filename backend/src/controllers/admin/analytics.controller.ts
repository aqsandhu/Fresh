// ============================================================================
// ADMIN CONTROLLER — session + dashboard analytics
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse } from '../../utils/response';
import { resolveCityScope } from '../../utils/cityScope';
import { loadAdminSession } from '../../utils/adminSession';
import { hasRestaurantOrderColumns } from '../../config/orderSchema';

/**
 * Current admin session (fresh permissions from DB)
 * GET /api/admin/me
 */

export const getAdminMe = asyncHandler(async (req: Request, res: Response) => {
  const session = await loadAdminSession(req.user!.id);
  if (!session) {
    return notFoundResponse(res, 'Admin user not found');
  }
  successResponse(res, { user: session }, 'Admin session retrieved');
});

/**
 * Get dashboard statistics
 * GET /api/admin/dashboard
 */

export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const orderParams: unknown[] = [];
  let orderFilter = '';
  if (!scope.unrestricted && scope.cityId && scope.cityName) {
    orderParams.push(scope.cityId, scope.cityName);
    orderFilter = ` AND (
      city_id = $1
      OR LOWER(COALESCE(delivery_address_snapshot->>'city', '')) = LOWER($2)
    )`;
  }

  // Today's stats
  const todayStats = await query(
    `SELECT 
      COUNT(*) as total_orders,
      COALESCE(SUM(total_amount), 0) as total_sales,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
      COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
      COUNT(CASE WHEN status = 'preparing' THEN 1 END) as preparing_orders,
      COUNT(CASE WHEN status = 'out_for_delivery' THEN 1 END) as out_for_delivery_orders,
      COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders
    FROM orders
    WHERE DATE(placed_at) = CURRENT_DATE
    AND deleted_at IS NULL${orderFilter}`,
    orderParams
  );

  // Weekly stats
  const weeklyStats = await query(
    `SELECT 
      COUNT(*) as total_orders,
      COALESCE(SUM(total_amount), 0) as total_sales
    FROM orders
    WHERE placed_at >= CURRENT_DATE - INTERVAL '7 days'
    AND deleted_at IS NULL${orderFilter}`,
    orderParams
  );

  // Monthly stats
  const monthlyStats = await query(
    `SELECT 
      COUNT(*) as total_orders,
      COALESCE(SUM(total_amount), 0) as total_sales
    FROM orders
    WHERE placed_at >= CURRENT_DATE - INTERVAL '30 days'
    AND deleted_at IS NULL${orderFilter}`,
    orderParams
  );

  let productFilter = '';
  const productParams: unknown[] = [];
  if (!scope.unrestricted && scope.cityId) {
    productParams.push(scope.cityId);
    productFilter = ' AND city_id = $1';
  }

  // Low stock products
  const lowStockProducts = await query(
    `SELECT 
      id, name_en, name_ur, stock_quantity, low_stock_threshold
    FROM products
    WHERE stock_quantity <= low_stock_threshold
    AND is_active = TRUE${productFilter}
    LIMIT 10`,
    productParams
  );

  let recentOrderJoin = '';
  let recentOrderFilter = '';
  const recentParams: unknown[] = [];
  if (!scope.unrestricted && scope.cityId && scope.cityName) {
    recentOrderJoin = ' LEFT JOIN addresses addr ON o.address_id = addr.id';
    recentParams.push(scope.cityId, scope.cityName);
    recentOrderFilter = ` AND (
      o.city_id = $1
      OR LOWER(COALESCE(addr.city, '')) = LOWER($2)
      OR LOWER(COALESCE(o.delivery_address_snapshot->>'city', '')) = LOWER($2)
    )`;
  }

  // Recent orders — include restaurant (B2B) orders too. They have no consumer
  // user (user_id NULL), so a LEFT JOIN + restaurant name fallback keeps them in.
  const recentRestaurantReady = await hasRestaurantOrderColumns();
  const recentRestJoin = recentRestaurantReady ? ' LEFT JOIN restaurants rest ON o.restaurant_id = rest.id' : '';
  const recentCustName = recentRestaurantReady ? 'COALESCE(u.full_name, rest.business_name)' : 'u.full_name';
  const recentCustPhone = recentRestaurantReady ? 'COALESCE(u.phone, rest.phone)' : 'u.phone';
  const recentOrders = await query(
    `SELECT
      o.id, o.order_number, o.status, o.total_amount,
      ${recentCustName} as customer_name, ${recentCustPhone} as customer_phone,
      o.placed_at
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id${recentRestJoin}${recentOrderJoin}
    WHERE o.deleted_at IS NULL${recentOrderFilter}
    ORDER BY o.placed_at DESC
    LIMIT 10`,
    recentParams
  );

  let riderFilter = '';
  const riderParams: unknown[] = [];
  if (!scope.unrestricted && scope.cityId) {
    riderParams.push(scope.cityId);
    riderFilter = ' AND city_id = $1';
  }

  // Rider stats
  const riderStats = await query(
    `SELECT 
      COUNT(*) as total_riders,
      COUNT(CASE WHEN status = 'available' THEN 1 END) as available_riders,
      COUNT(CASE WHEN status = 'busy' THEN 1 END) as busy_riders,
      COUNT(CASE WHEN verification_status = 'pending' THEN 1 END) as pending_verification
    FROM riders
    WHERE deleted_at IS NULL${riderFilter}`,
    riderParams
  );

  // Atta requests stats — city-scoped via the pickup address (atta_requests
  // has no city_id column), same rule as getAttaRequests / updateAttaStatus.
  let attaJoin = '';
  let attaFilter = '';
  const attaParams: unknown[] = [];
  if (!scope.unrestricted && scope.cityName && scope.dbReady) {
    attaJoin = ' LEFT JOIN addresses a ON ar.address_id = a.id';
    attaParams.push(scope.cityName);
    attaFilter = ` AND LOWER(COALESCE(a.city, '')) = LOWER($1)`;
  }
  const attaStats = await query(
    `SELECT
      COUNT(*) as total_requests,
      COUNT(CASE WHEN ar.status = 'pending_pickup' THEN 1 END) as pending_pickup,
      COUNT(CASE WHEN ar.status = 'at_mill' OR ar.status = 'milling' THEN 1 END) at_mill
    FROM atta_requests ar${attaJoin}
    WHERE ar.created_at >= CURRENT_DATE - INTERVAL '7 days'${attaFilter}`,
    attaParams
  );

  successResponse(res, {
    today: todayStats.rows[0],
    weekly: weeklyStats.rows[0],
    monthly: monthlyStats.rows[0],
    lowStockProducts: lowStockProducts.rows,
    recentOrders: recentOrders.rows,
    riders: riderStats.rows[0],
    attaRequests: attaStats.rows[0],
  }, 'Dashboard statistics retrieved successfully');
});

/**
 * Sidebar badge counts — pending/actionable items the admin should notice.
 * GET /api/admin/badge-counts  (any admin; city-scoped)
 * Each count is independent + fail-safe (returns 0 on any error) so a missing
 * table never breaks the sidebar.
 */
export const getBadgeCounts = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  if (scope.forbidden) {
    return successResponse(res, {
      orders: 0,
      consumerOrders: 0,
      restaurantOrders: 0,
      riderApplications: 0,
      restaurantRequests: 0,
    }, 'Badge counts');
  }
  const scoped = !scope.unrestricted && !!scope.cityId;
  const cityParam = scoped ? [scope.cityId] : [];

  const safeCount = async (sql: string, params: unknown[]): Promise<number> => {
    try {
      const r = await query(sql, params);
      return Number(r.rows[0]?.n) || 0;
    } catch {
      return 0;
    }
  };

  const cityAnd = (col: string) => (scoped ? ` AND ${col} = $1` : '');

  const restaurantOrderReady = await hasRestaurantOrderColumns();
  const consumerOrdersSql = restaurantOrderReady
    ? `SELECT COUNT(*)::int AS n FROM orders WHERE deleted_at IS NULL AND status = 'pending' AND restaurant_id IS NULL${cityAnd('city_id')}`
    : `SELECT COUNT(*)::int AS n FROM orders WHERE deleted_at IS NULL AND status = 'pending'${cityAnd('city_id')}`;
  const restaurantOrdersSql = restaurantOrderReady
    ? `SELECT COUNT(*)::int AS n FROM orders WHERE deleted_at IS NULL AND status = 'pending' AND restaurant_id IS NOT NULL${cityAnd('city_id')}`
    : `SELECT 0::int AS n`;

  const [consumerOrders, restaurantOrders, riderApplications, restaurantRequests] = await Promise.all([
    safeCount(consumerOrdersSql, cityParam),
    safeCount(restaurantOrdersSql, restaurantOrderReady ? cityParam : []),
    safeCount(
      `SELECT COUNT(*)::int AS n FROM rider_applications WHERE status = 'pending'${cityAnd('city_id')}`,
      cityParam
    ),
    safeCount(
      `SELECT COUNT(*)::int AS n FROM restaurants WHERE status = 'pending'${cityAnd('city_id')}`,
      cityParam
    ),
  ]);
  const orders = consumerOrders + restaurantOrders;

  successResponse(res, {
    orders,
    consumerOrders,
    restaurantOrders,
    riderApplications,
    restaurantRequests,
  }, 'Badge counts');
});

/**
 * Get all orders with filters
 * GET /api/admin/orders
 */
