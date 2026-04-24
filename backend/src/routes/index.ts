// ============================================================================
// ROUTES INDEX
// ============================================================================

import { Router } from 'express';
import authRoutes from './auth.routes';
import categoryRoutes from './category.routes';
import productRoutes from './product.routes';
import cartRoutes from './cart.routes';
import addressRoutes from './address.routes';
import orderRoutes from './order.routes';
import attaRoutes from './atta.routes';
import adminRoutes from './admin.routes';
import riderRoutes from './rider.routes';
import webhookRoutes from './webhook.routes';
import settingsRoutes from './settings.routes';
import chatRoutes from './chat.routes';
import userRoutes from './user.routes';

// Admin controller imports for top-level proxy routes
import * as adminController from '../controllers/admin.controller';
import {
  authenticate,
  requireAdmin,
  adminRateLimiter,
} from '../middleware';

const router = Router();

// API Routes
router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/cart', cartRoutes);
router.use('/addresses', addressRoutes);
router.use('/orders', orderRoutes);
router.use('/atta-requests', attaRoutes);
router.use('/admin', adminRoutes);
router.use('/rider', riderRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/site-settings', settingsRoutes);
router.use('/chat', chatRoutes);
router.use('/users', userRoutes);

// ============================================================================
// ADMIN PANEL PROXY ROUTES
// These expose admin endpoints at the top /api/* level for admin panel use
// ============================================================================

// /api/customers → proxy to admin customers
router.get('/customers', authenticate, requireAdmin, adminRateLimiter, adminController.getCustomers);
router.get('/customers/:id/addresses', authenticate, requireAdmin, adminController.getCustomerAddresses);

// /api/riders → proxy to admin riders
router.get('/riders', authenticate, requireAdmin, adminRateLimiter, adminController.getRiders);

// /api/settings → proxy to admin settings
router.get('/settings', authenticate, requireAdmin, adminController.getSettings);
router.put('/settings/delivery', authenticate, requireAdmin, adminController.updateDeliverySettings);
router.get('/settings/time-slots', authenticate, requireAdmin, adminController.getTimeSlots);
router.post('/settings/time-slots', authenticate, requireAdmin, adminController.createTimeSlot);
router.put('/settings/time-slots/:id', authenticate, requireAdmin, adminController.updateTimeSlot);
router.delete('/settings/time-slots/:id', authenticate, requireAdmin, adminController.deleteTimeSlot);
router.get('/settings/business-hours', authenticate, requireAdmin, adminController.getBusinessHours);
router.put('/settings/business-hours', authenticate, requireAdmin, adminController.updateBusinessHours);

// /api/service-cities → proxy to admin cities
router.get('/service-cities', authenticate, requireAdmin, adminController.getCities);
router.post('/service-cities', authenticate, requireAdmin, adminController.addCity);
router.put('/service-cities/:id/toggle', authenticate, requireAdmin, adminController.toggleCity);
router.delete('/service-cities/:id', authenticate, requireAdmin, adminController.deleteCity);

// /api/whatsapp-orders → proxy to admin whatsapp orders
router.post('/whatsapp-orders', authenticate, requireAdmin, adminController.createWhatsappOrder);

export default router;
