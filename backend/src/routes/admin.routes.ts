// ============================================================================
// ADMIN ROUTES
// ============================================================================

import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import * as adminController from '../controllers/admin.controller';
import {
  authenticate,
  requireAdmin,
  adminRateLimiter,
  authRateLimiter,
  validate,
  adminSchemas,
  orderSchemas,
  attaSchemas,
  uploadMultiple,
  uploadSingle,
  auditLogger,
} from '../middleware';

const router = Router();

// Admin login (public but rate limited) - SECURITY FIX: Add password validation
router.post('/login', authRateLimiter, validate(adminSchemas.adminLogin), authController.adminLogin);

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Apply audit logging to all mutating (POST, PUT, PATCH, DELETE) admin operations
router.use(auditLogger());

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);

// Customers
router.get('/customers', adminController.getCustomers);
router.get('/customers/:id/addresses', adminController.getCustomerAddresses);

// Orders
router.get('/orders', adminController.getAllOrders);
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
  '/orders/:id/assign-rider',
  validate(orderSchemas.assignRider),
  adminController.assignRider
);

// Riders
router.get('/riders', adminController.getRiders);
router.post('/riders', uploadSingle('avatar'), adminController.createRider);
router.put('/riders/:id', uploadSingle('avatar'), adminController.updateRider);
router.delete('/riders/:id', adminController.deleteRider);
router.patch('/riders/:id/status', adminController.updateRiderStatus);
router.patch('/riders/:id/verify', adminController.verifyRider);
router.get('/riders/:id/stats', adminController.getRiderStats);
router.get('/riders/:id/location', adminController.getRiderLocation);
router.put('/riders/:id/delivery-charges', adminController.setRiderDeliveryCharges);

// Middleware to coerce FormData string values to proper types for Joi validation
const coerceProductFields = (req: any, res: any, next: any) => {
  const body = req.body;
  if (body.price !== undefined) body.price = parseFloat(body.price);
  if (body.compare_at_price !== undefined) body.compare_at_price = parseFloat(body.compare_at_price);
  if (body.unit_value !== undefined) body.unit_value = parseFloat(body.unit_value);
  if (body.stock_quantity !== undefined) body.stock_quantity = parseInt(body.stock_quantity, 10);
  if (body.is_active !== undefined) body.is_active = body.is_active === 'true' || body.is_active === true;
  if (body.is_featured !== undefined) body.is_featured = body.is_featured === 'true' || body.is_featured === true;
  if (body.is_new_arrival !== undefined) body.is_new_arrival = body.is_new_arrival === 'true' || body.is_new_arrival === true;
  next();
};

// Middleware to coerce FormData string values for category fields
const coerceCategoryFields = (req: any, res: any, next: any) => {
  const body = req.body;
  if (body.display_order !== undefined) body.display_order = parseInt(body.display_order, 10);
  if (body.is_active !== undefined) body.is_active = body.is_active === 'true' || body.is_active === true;
  if (body.is_featured !== undefined) body.is_featured = body.is_featured === 'true' || body.is_featured === true;
  if (body.parent_id !== undefined && body.parent_id !== '') body.parent_id = parseInt(body.parent_id, 10);
  else body.parent_id = null;
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
router.delete(
  '/products/:id',
  adminController.deleteProduct
);

// Categories
router.get('/categories', adminController.getAdminCategories);
router.post('/categories', adminRateLimiter, uploadSingle('image'), coerceCategoryFields, adminController.createCategory);
router.put('/categories/:id', adminRateLimiter, uploadSingle('image'), coerceCategoryFields, adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);

// WhatsApp Orders
router.post(
  '/whatsapp-orders',
  validate(adminSchemas.createWhatsappOrder),
  adminController.createWhatsappOrder
);

// Addresses
router.put(
  '/addresses/:id/house-number',
  validate(adminSchemas.assignHouseNumber),
  adminController.assignHouseNumber
);

// Service Cities
router.get('/cities', adminController.getCities);
router.post('/cities', adminController.addCity);
router.put('/cities/:id/toggle', adminController.toggleCity);
router.delete('/cities/:id', adminController.deleteCity);

// Atta Requests
router.get('/atta-requests', adminController.getAttaRequests);
router.put(
  '/atta-requests/:id/status',
  validate(attaSchemas.updateStatus),
  adminController.updateAttaStatus
);

// Site Settings - Banner
router.get('/site-settings/banner', adminController.getBannerSettings);
router.put('/site-settings/banner', adminController.updateBannerSettings);

// Settings - General, Delivery, Time Slots, Business Hours
router.get('/settings', adminController.getSettings);
router.put('/settings/delivery', adminController.updateDeliverySettings);
router.get('/settings/time-slots', adminController.getTimeSlots);
router.post('/settings/time-slots', adminController.createTimeSlot);
router.put('/settings/time-slots/:id', adminController.updateTimeSlot);
router.delete('/settings/time-slots/:id', adminController.deleteTimeSlot);
router.get('/settings/business-hours', adminController.getBusinessHours);
router.put('/settings/business-hours', adminController.updateBusinessHours);

export default router;
