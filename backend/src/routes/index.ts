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

export default router;
