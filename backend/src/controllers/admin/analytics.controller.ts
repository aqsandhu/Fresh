// ============================================================================
// ADMIN CONTROLLER
// ============================================================================

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse, createdResponse, paginatedResponse } from '../../utils/response';
import { generateSlug, normalizePhoneNumber } from '../../utils/validators';
import { emitOrderUpdate, emitToUser, emitToAdmins } from '../../config/socket';
import { deleteFileFromStorage } from '../../config/storage';
import logger from '../../utils/logger';
import {
  resolveCityScope,
  cityIdClause,
  orderCityClause,
  customerCityExistsClause,
  orderCityMatchSql,
  addressCityMatchSql,
  addressCityWhereClause,
  requireCityScope,
} from '../../utils/cityScope';
import { parseTagsInput, tagSearchSql } from '../../utils/productTags';
import {
  fetchBannerSettings,
  upsertBannerSettings,
  fetchWhatsAppOrderSettings,
  fetchWhatsAppOrderSettingsAll,
  upsertWhatsAppOrderSettings,
  upsertWhatsAppOrderSettingsBulk,
  upsertGlobalSiteSetting,
  fetchBrandLogoSettings,
  deleteBrandLogoFromStorage,
  clearBrandLogoSettings,
  BRAND_LOGO_URL_KEY,
  BRAND_LOGO_STORAGE_PATH_KEY,
  fetchBrandFaviconSettings,
  deleteBrandFaviconFromStorage,
  clearBrandFaviconSettings,
  BRAND_FAVICON_URL_KEY,
  BRAND_FAVICON_STORAGE_PATH_KEY,
} from '../../utils/siteSettings';
import { loadAdminSession } from '../../utils/adminSession';

const SALT_ROUNDS = 12;

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

  // Recent orders
  const recentOrders = await query(
    `SELECT 
      o.id, o.order_number, o.status, o.total_amount,
      u.full_name as customer_name, u.phone as customer_phone,
      o.placed_at
    FROM orders o
    JOIN users u ON o.user_id = u.id${recentOrderJoin}
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

  // Atta requests stats
  const attaStats = await query(
    `SELECT 
      COUNT(*) as total_requests,
      COUNT(CASE WHEN status = 'pending_pickup' THEN 1 END) as pending_pickup,
      COUNT(CASE WHEN status = 'at_mill' OR status = 'milling' THEN 1 END) at_mill
    FROM atta_requests
    WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`
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
 * Get all orders with filters
 * GET /api/admin/orders
 */
