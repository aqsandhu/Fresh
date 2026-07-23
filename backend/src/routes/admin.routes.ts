// ============================================================================
// ADMIN ROUTES
// ============================================================================

import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import * as adminController from '../controllers/admin';
import * as couponController from '../controllers/coupon.controller';
import * as reviewController from '../controllers/review.controller';
import * as complaintController from '../controllers/complaint.controller';
import * as tipsController from '../controllers/tips.controller';
import * as riderAppController from '../controllers/riderApplication.controller';
import * as restaurantsController from '../controllers/admin/restaurants.controller';
import * as ocpController from '../controllers/admin/ocp.controller';
import * as stockController from '../controllers/admin/stock.controller';
import * as reconciliationController from '../controllers/admin/reconciliation.controller';
import * as serviceAreasController from '../controllers/admin/serviceAreas.controller';
import * as basketsController from '../controllers/admin/baskets.controller';
import * as franchiseController from '../controllers/franchise.controller';
import * as marketingController from '../controllers/marketing.controller';
import {
  authenticate,
  requireAdmin,
  verifyAdminActive,
  adminRateLimiter,
  authRateLimiter,
  validate,
  authSchemas,
  adminSchemas,
  orderSchemas,
  attaSchemas,
  uploadMultiple,
  uploadSingle,
  auditLogger,
  attachAdminPermissions,
  enforceAdminPermissions,
  attachCityScope,
} from '../middleware';
import { parseTagsInput } from '../utils/productTags';

const router = Router();

// Admin login (public but rate limited) - SECURITY FIX: Add password validation
router.post('/login', authRateLimiter, validate(adminSchemas.adminLogin), authController.adminLogin);

// All admin routes require authentication and admin role.
// verifyAdminActive re-checks the DB so that demotion/suspension takes effect
// immediately instead of waiting for the JWT to expire.
router.use(authenticate);
router.use(requireAdmin);
router.use(verifyAdminActive);
router.use(attachAdminPermissions);
router.use(attachCityScope);
router.use(enforceAdminPermissions);

// Apply audit logging to all mutating (POST, PUT, PATCH, DELETE) admin operations
router.use(auditLogger());

// Session — refresh permissions from DB (any authenticated admin)
router.get('/me', adminController.getAdminMe);
router.put('/profile', authController.updateProfile);
router.post('/change-password', validate(authSchemas.changePassword), authController.changePassword);

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);

// Sidebar badge counts (pending orders / rider applications / restaurant requests).
router.get('/badge-counts', adminController.getBadgeCounts);

// Customers
router.get('/customers', adminController.getCustomers);
router.get('/customers/lookup', adminController.lookupCustomerByPhone);
router.get('/customers/:id/addresses', adminController.getCustomerAddresses);
router.delete(
  '/customers/:id',
  validate(adminSchemas.deleteCustomer),
  adminController.deleteCustomer
);

// Orders
router.get('/orders', adminController.getAllOrders);
router.put(
  '/orders/bulk-status',
  validate(adminSchemas.bulkUpdateOrderStatus),
  adminController.bulkUpdateOrderStatus
);
router.get('/orders/:id', adminController.getOrderDetails);
router.put(
  '/orders/:id/status',
  validate(orderSchemas.updateStatus),
  adminController.updateOrderStatus
);
router.put(
  '/orders/:id/toggle-phone',
  adminController.togglePhoneVisibility
);
router.put(
  '/orders/:id/payment-received',
  adminController.markPaymentReceived
);
router.put(
  '/orders/:id/items/:itemId/weight',
  adminController.updateOrderItemWeight
);
router.put(
  '/orders/:id/assign-rider',
  validate(orderSchemas.assignRider),
  adminController.assignRider
);
router.patch('/orders/:id/assign-ocp', adminController.assignOrderToOcp);
router.patch('/orders/:id/ocp-phone', adminController.setOcpPhoneVisibility);
router.delete('/orders/:id', adminController.deleteOrder);

// Riders
router.get('/riders', adminController.getRiders);
router.post('/riders', uploadSingle('avatar'), adminController.createRider);
router.put('/riders/:id', uploadSingle('avatar'), adminController.updateRider);
router.delete('/riders/:id', adminController.deleteRider);
router.patch('/riders/:id/status', adminController.updateRiderStatus);
router.patch('/riders/:id/verify', adminController.verifyRider);
router.get('/riders/:id/stats', adminController.getRiderStats);
router.get('/riders/:id/cash-settlements', adminController.listRiderCashSettlements);
router.post('/riders/:id/cash-settlements/receive', adminController.receiveRiderCashSettlement);
router.get('/riders/:id/location', adminController.getRiderLocation);
router.put('/riders/:id/delivery-charges', adminController.setRiderDeliveryCharges);

// Middleware to coerce FormData string values to proper types for Joi validation
const coerceProductFields = (req: any, res: any, next: any) => {
  const body = req.body;
  if (body.price !== undefined) body.price = parseFloat(body.price);
  if (body.compare_at_price !== undefined) body.compare_at_price = parseFloat(body.compare_at_price);
  if (body.unit_value !== undefined) body.unit_value = parseFloat(body.unit_value);
  if (body.is_active !== undefined) body.is_active = body.is_active === 'true' || body.is_active === true;
  if (body.is_featured !== undefined) body.is_featured = body.is_featured === 'true' || body.is_featured === true;
  if (body.is_new_arrival !== undefined) body.is_new_arrival = body.is_new_arrival === 'true' || body.is_new_arrival === true;
  if (body.is_variable_weight !== undefined) body.is_variable_weight = body.is_variable_weight === 'true' || body.is_variable_weight === true;
  if (body.allow_half_kg !== undefined) body.allow_half_kg = body.allow_half_kg === 'true' || body.allow_half_kg === true;
  if (body.allow_quarter_kg !== undefined) body.allow_quarter_kg = body.allow_quarter_kg === 'true' || body.allow_quarter_kg === true;
  // Quality tiers: consumer B/C price, "also for restaurants" flag, and
  // restaurant prices per tier. Product stock is managed outside product edit.
  if (body.available_for_restaurants !== undefined) body.available_for_restaurants = body.available_for_restaurants === 'true' || body.available_for_restaurants === true;
  if (body.price_b !== undefined && body.price_b !== '') body.price_b = parseFloat(body.price_b);
  if (body.price_c !== undefined && body.price_c !== '') body.price_c = parseFloat(body.price_c);
  if (body.restaurant_price_a !== undefined && body.restaurant_price_a !== '') body.restaurant_price_a = parseFloat(body.restaurant_price_a);
  if (body.restaurant_price_b !== undefined && body.restaurant_price_b !== '') body.restaurant_price_b = parseFloat(body.restaurant_price_b);
  if (body.restaurant_price_c !== undefined && body.restaurant_price_c !== '') body.restaurant_price_c = parseFloat(body.restaurant_price_c);
  if (body.tags !== undefined) {
    body.tags = parseTagsInput(body.tags);
  }
  next();
};

// Middleware to coerce FormData string values for category fields
const coerceCategoryFields = (req: any, res: any, next: any) => {
  const body = req.body;

  // Admin panel sends camelCase keys in multipart FormData
  if (body.nameEn && !body.name_en) body.name_en = body.nameEn;
  if (body.nameUr && !body.name_ur) body.name_ur = body.nameUr;
  if (body.displayOrder !== undefined && body.display_order === undefined) {
    body.display_order = body.displayOrder;
  }
  if (body.isActive !== undefined && body.is_active === undefined) {
    body.is_active = body.isActive;
  }
  if (body.parentId !== undefined && body.parent_id === undefined) {
    body.parent_id = body.parentId;
  }
  // "Category also for restaurants" — accept either camelCase or snake_case.
  if (body.availableForRestaurants !== undefined && body.available_for_restaurants === undefined) {
    body.available_for_restaurants = body.availableForRestaurants;
  }
  if (body.available_for_restaurants !== undefined) {
    body.available_for_restaurants = body.available_for_restaurants === 'true' || body.available_for_restaurants === true;
  }
  if (body.qualifiesForFreeDelivery !== undefined && body.qualifies_for_free_delivery === undefined) {
    body.qualifies_for_free_delivery = body.qualifiesForFreeDelivery;
  }

  if (body.display_order !== undefined) {
    body.display_order = parseInt(String(body.display_order), 10);
  }
  if (body.is_active !== undefined) {
    body.is_active = body.is_active === 'true' || body.is_active === true;
  }
  if (body.is_featured !== undefined) {
    body.is_featured = body.is_featured === 'true' || body.is_featured === true;
  }
  if (body.parent_id !== undefined && body.parent_id !== '') {
    // parent_id is a UUID — keep as string
  } else {
    body.parent_id = null;
  }
  next();
};

// Products
router.get('/products', adminController.getAdminProducts);
router.get('/products/:id', adminController.getAdminProductById);
router.post(
  '/products',
  adminRateLimiter,
  uploadMultiple('images', 5),
  coerceProductFields,
  validate(adminSchemas.createProduct),
  adminController.createProduct
);
router.put(
  '/products/:id',
  adminRateLimiter,
  uploadMultiple('images', 5),
  coerceProductFields,
  validate(adminSchemas.updateProduct),
  adminController.updateProduct
);
// Bulk + status changes — declare BEFORE the :id routes so the path parser
// doesn't treat "move-category" or "toggle-active" as a product UUID.
router.patch('/products/move-category', adminController.moveProductsCategory);
router.patch('/products/:id/toggle-active', adminController.toggleProductActive);
router.delete(
  '/products/:id',
  adminController.deleteProduct  // ?hard=true for permanent deletion
);

// Categories
router.get('/categories', adminController.getAdminCategories);
router.post('/categories', adminRateLimiter, uploadSingle('image', 'categories'), coerceCategoryFields, adminController.createCategory);
router.put('/categories/:id', adminRateLimiter, uploadSingle('image', 'categories'), coerceCategoryFields, adminController.updateCategory);
router.patch('/categories/:id/toggle-active', adminController.toggleCategoryActive);
router.delete('/categories/:id', adminController.deleteCategory);

// WhatsApp Orders
router.post(
  '/whatsapp-orders',
  validate(adminSchemas.createWhatsappOrder),
  adminController.createWhatsappOrder
);

// Addresses
router.get('/addresses', adminController.getAdminAddresses);
router.put(
  '/addresses/:id/house-number',
  validate(adminSchemas.assignHouseNumber),
  adminController.assignHouseNumber
);
router.delete('/addresses/:id/door-picture', adminController.clearAddressDoorPicture);
router.delete('/addresses/:id/location', adminController.clearAddressLocation);
router.delete('/addresses/:id', adminController.deleteAdminAddress);

// Service Cities
router.get('/cities', adminController.getCities);
router.post('/cities', adminController.addCity);
router.put('/cities/:id/toggle', adminController.toggleCity);
router.delete('/cities/:id', adminController.deleteCity);
router.post('/cities/import-catalog', adminController.importCityCatalog);

// Service Areas (map polygons; super-admin only, role-checked in controller).
// Literal '/messages' paths MUST precede '/service-areas/:id'.
router.get('/service-areas/messages', serviceAreasController.getServiceAreaMessages);
router.put('/service-areas/messages', adminRateLimiter, serviceAreasController.updateServiceAreaMessages);
router.get('/service-areas', serviceAreasController.getServiceAreas);
router.post('/service-areas', adminRateLimiter, serviceAreasController.createServiceArea);
router.put('/service-areas/:id', adminRateLimiter, serviceAreasController.updateServiceArea);
router.delete('/service-areas/:id', serviceAreasController.deleteServiceArea);

// Franchise inquiries (leads triage; any authenticated admin)
router.get('/franchise-inquiries', franchiseController.listFranchiseInquiries);
router.put('/franchise-inquiries/:id', adminRateLimiter, franchiseController.updateFranchiseInquiry);

// Marketing — abandoned carts + reminders + ad-pixel settings
router.get('/marketing/abandoned-carts', marketingController.listAbandonedCarts);
router.post('/marketing/run-reminders', adminRateLimiter, marketingController.runRemindersNow);
router.get('/marketing/settings', marketingController.getMarketingSettings);
router.put('/marketing/settings', adminRateLimiter, marketingController.updateMarketingSettings);
router.get('/customers/export', adminController.exportCustomersCsv);

// Today's Basket (combo packages; super-admin only, role-checked in controller)
router.get('/baskets', basketsController.getBaskets);
router.post('/baskets', adminRateLimiter, basketsController.createBasket);
router.put('/baskets/:id', adminRateLimiter, basketsController.updateBasket);
router.delete('/baskets/:id', basketsController.deleteBasket);

// Delivery Zones
router.get('/delivery-zones', adminController.getDeliveryZones);
router.post('/delivery-zones', adminController.createDeliveryZone);
router.put('/delivery-zones/:id', adminController.updateDeliveryZone);
router.put('/delivery-zones/:id/toggle', adminController.toggleDeliveryZone);
router.delete('/delivery-zones/:id', adminController.deleteDeliveryZone);

// Discount Coupons (per-city; city admins manage their city, super admin any)
router.get('/coupons/redemptions', couponController.listCouponRedemptions);
router.get('/coupons', couponController.listCoupons);
router.post('/coupons', adminRateLimiter, couponController.createCoupon);
router.put('/coupons/:id', adminRateLimiter, couponController.updateCoupon);
router.patch('/coupons/:id/toggle', couponController.toggleCoupon);
router.delete('/coupons/:id', couponController.deleteCoupon);

// Reviews & Ratings (moderation; per-city, super admin sees all)
router.get('/reviews', reviewController.listReviewsAdmin);
router.put('/reviews/:id', adminRateLimiter, reviewController.updateReviewAdmin);

// Complaints (customer support tickets; per-city, super admin sees all)
router.get('/complaints', complaintController.listComplaints);
router.get('/complaints/:id', complaintController.getComplaint);
router.put('/complaints/:id', adminRateLimiter, complaintController.updateComplaint);
router.post('/complaints/:id/refund', adminRateLimiter, complaintController.refundComplaint);

// Rider applications + "Work as Rider" page content
router.get('/rider-applications', riderAppController.listRiderApplications);
router.put('/rider-applications/:id', adminRateLimiter, riderAppController.updateRiderApplication);
router.put('/work-as-rider', adminRateLimiter, riderAppController.updateWorkAsRiderContent);

// Restaurants (B2B accounts): review requests + manage approved restaurants
router.get('/restaurants', restaurantsController.getRestaurants);
// Specific sub-routes MUST precede '/restaurants/:id' so 'orders'/'dashboard'/
// 'settings' aren't captured as an :id.
router.get('/restaurants/orders', restaurantsController.getRestaurantOrders);
router.post('/restaurants/orders', adminRateLimiter, validate(adminSchemas.createRestaurantOrder), restaurantsController.createAdminRestaurantOrder);
router.put('/restaurants/orders/:id/status', adminRateLimiter, restaurantsController.updateRestaurantOrderStatus);
router.get('/restaurants/dashboard', restaurantsController.getRestaurantDashboard);
router.get('/restaurants/settings', restaurantsController.getRestaurantSettings);
router.put('/restaurants/settings', adminRateLimiter, restaurantsController.updateRestaurantSettings);
router.post('/restaurants/:id/approve', adminRateLimiter, restaurantsController.approveRestaurant);
router.post('/restaurants/:id/disable', adminRateLimiter, restaurantsController.disableRestaurant);
router.post('/restaurants/:id/ban', adminRateLimiter, restaurantsController.banRestaurant);
router.put('/restaurants/:id', adminRateLimiter, restaurantsController.updateRestaurant);
router.delete('/restaurants/:id', adminRateLimiter, restaurantsController.removeRestaurant);

// Order Collection Points (OCP) — cross-city management (perm: ocp.manage)
router.get('/ocp', ocpController.listOcps);
router.post('/ocp', adminRateLimiter, ocpController.createOcp);
router.get('/ocp/shortages', ocpController.listShortages);
router.post('/ocp/shortages/:id/resolve', adminRateLimiter, ocpController.resolveShortage);
// Settlements (perm ocp.settlements.receive) — literal paths must precede '/ocp/:id'.
router.get('/ocp/settlements', ocpController.listSettlements);
router.post('/ocp/settlements/:id/receive', adminRateLimiter, ocpController.receiveSettlement);
router.post('/ocp/settlements/:id/reject', adminRateLimiter, ocpController.rejectSettlement);
// Stock-send routes (perm ocp.stock.send) must precede '/ocp/:id'.
router.get('/ocp/:id/stock-requests', ocpController.listStockRequests);
router.post('/ocp/:id/stock-requests', adminRateLimiter, ocpController.createStockRequest);
router.put('/ocp/:id', adminRateLimiter, ocpController.updateOcp);
router.delete('/ocp/:id', adminRateLimiter, ocpController.deleteOcp);

// Stock management (city system stock + OCP location ledger). Literal paths
// before '/stock/:productId/movements'.
router.get('/stock', stockController.getStockOverview);
router.get('/stock/waste-report', stockController.getWasteReport);
router.post('/stock/add', adminRateLimiter, stockController.addStock);
router.post('/stock/waste', adminRateLimiter, uploadSingle('proof', 'stock/proofs'), stockController.wasteStock);
router.post('/stock/convert', adminRateLimiter, stockController.convertQuality);
router.post('/stock/shift', adminRateLimiter, stockController.shiftToOcp);
router.post('/stock/return', adminRateLimiter, stockController.returnFromOcp);
router.post('/stock/transfer', adminRateLimiter, stockController.transferOcpToOcp);
router.get('/stock/:productId/movements', stockController.getStockMovements);

// Reconciliation watchdog (super-admin only; role-checked in the controller).
router.get('/reconciliation', reconciliationController.getReconciliation);
router.post('/reconciliation/run', adminRateLimiter, reconciliationController.runReconciliationNow);

// User guidance tips (per-city; global tips are super-admin only)
router.get('/tips', tipsController.listTips);
router.post('/tips', adminRateLimiter, tipsController.createTip);
router.put('/tips/:id', adminRateLimiter, tipsController.updateTip);
router.delete('/tips/:id', tipsController.deleteTip);

// Atta Requests
router.get('/atta-requests', adminController.getAttaRequests);
router.put(
  '/atta-requests/:id/status',
  validate(attaSchemas.updateStatus),
  adminController.updateAttaStatus
);

// Site Settings - Brand logo (global)
router.get('/site-settings/brand', adminController.getBrandLogoSettings);
router.put(
  '/site-settings/brand',
  uploadSingle('logo', 'brand'),
  adminController.updateBrandLogoSettings
);
router.delete('/site-settings/brand', adminController.deleteBrandLogoSettings);

router.get('/site-settings/favicon', adminController.getBrandFaviconSettings);
router.put(
  '/site-settings/favicon',
  uploadSingle('favicon', 'favicon'),
  adminController.updateBrandFaviconSettings
);
router.delete('/site-settings/favicon', adminController.deleteBrandFaviconSettings);

// Site Settings - Hero image (per city; every city admin + super admin)
router.get('/site-settings/hero', adminController.getHeroSettings);
router.put(
  '/site-settings/hero',
  uploadSingle('hero', 'hero'),
  adminController.updateHeroSettings
);
router.delete('/site-settings/hero', adminController.deleteHeroSettings);

// Site Settings - Banner
router.get('/site-settings/banner', adminController.getBannerSettings);
router.put('/site-settings/banner', adminController.updateBannerSettings);

// Site Settings - Android home-screen widget (customer app, global)
router.get('/site-settings/app-widget', adminController.getAppWidgetSettings);
router.put('/site-settings/app-widget', adminController.updateAppWidgetSettings);
router.get('/site-settings/whatsapp-order', adminController.getWhatsAppOrderSettings);
router.put('/site-settings/whatsapp-order', adminController.updateWhatsAppOrderSettings);
router.get('/site-settings/whatsapp-order/all', adminController.getWhatsAppOrderSettingsAll);
router.put('/site-settings/whatsapp-order/bulk', adminController.updateWhatsAppOrderSettingsBulk);

// Settings - General, Delivery, Time Slots, Business Hours
router.get('/settings', adminController.getSettings);
router.put('/settings/delivery', validate(adminSchemas.updateDeliverySettings), adminController.updateDeliverySettings);
router.get('/settings/time-slots', adminController.getTimeSlots);
router.post('/settings/time-slots', adminController.createTimeSlot);
router.put('/settings/time-slots/:id', adminController.updateTimeSlot);
router.delete('/settings/time-slots/:id', adminController.deleteTimeSlot);
router.get('/settings/business-hours', adminController.getBusinessHours);
router.put('/settings/business-hours', adminController.updateBusinessHours);

// Platform feature flags (super-admin only; role-checked in the controller)
router.get('/settings/platform', adminController.getPlatformSettings);
router.put('/settings/platform', adminController.updatePlatformSettings);

// AI chatbot config (super-admin only; API key write-only, never returned)
router.get('/settings/ai-chat', adminController.getAiChatSettings);
router.put('/settings/ai-chat', adminRateLimiter, adminController.updateAiChatSettings);

export default router;
