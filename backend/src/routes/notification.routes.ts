// ============================================================================
// NOTIFICATION ROUTES
// ============================================================================

import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { authenticate, verifyUserActive } from '../middleware';

const router = Router();

router.use(authenticate);
router.use(verifyUserActive);

router.post('/register', notificationController.registerPushToken);
router.get('/', notificationController.getNotifications);
router.patch('/read-all', notificationController.markAllNotificationsRead);
router.patch('/:id/read', notificationController.markNotificationRead);
router.delete('/:id', notificationController.deleteNotification);

export default router;
