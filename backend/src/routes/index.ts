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
import roleRoutes from './role.routes';
import riderRoutes from './rider.routes';
import webhookRoutes from './webhook.routes';
import settingsRoutes from './settings.routes';
import chatRoutes from './chat.routes';
import notificationRoutes from './notification.routes';
import couponRoutes from './coupon.routes';
import reviewRoutes from './review.routes';
import complaintRoutes from './complaint.routes';
import tipsRoutes from './tips.routes';
import workAsRiderRoutes from './workAsRider.routes';
import restaurantRoutes from './restaurant.routes';
import ocpRoutes from './ocp.routes';
import financeRoutes from './finance.routes';
import shareholderRoutes from './shareholder.routes';
import franchiseRoutes from './franchise.routes';
import aiChatRoutes from './aiChat.routes';

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
router.use('/admin/roles', roleRoutes);
router.use('/rider', riderRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/site-settings', settingsRoutes);
router.use('/chat', chatRoutes);
router.use('/notifications', notificationRoutes);
router.use('/coupons', couponRoutes);
router.use('/reviews', reviewRoutes);
router.use('/complaints', complaintRoutes);
router.use('/tips', tipsRoutes);
router.use('/work-as-rider', workAsRiderRoutes);
router.use('/restaurant', restaurantRoutes);
router.use('/ocp', ocpRoutes);
router.use('/finance', financeRoutes);
router.use('/shareholder', shareholderRoutes);
router.use('/franchise', franchiseRoutes);
router.use('/ai-chat', aiChatRoutes);

export default router;
