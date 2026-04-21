// ============================================================================
// RIDER ROUTES
// ============================================================================

import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import * as riderController from '../controllers/rider.controller';
import {
  authenticate,
  requireRider,
  authRateLimiter,
  riderLocationRateLimiter,
  validate,
  riderSchemas,
  uploadDoorPicture as uploadDoorPictureMiddleware,
} from '../middleware';

const router = Router();

// Rider login (public but rate limited)
router.post('/login', authRateLimiter, authController.riderLogin);

// All rider routes require authentication and rider role
router.use(authenticate);
router.use(requireRider);

// Profile
router.get('/profile', riderController.getRiderProfile);

// Tasks
router.get('/tasks/active', riderController.getActiveTasks);
router.get('/tasks/completed', riderController.getCompletedTasks);
router.get('/tasks', riderController.getTasks);
router.get('/tasks/:id', riderController.getTaskDetails);
router.put('/tasks/:id/accept', riderController.acceptTask);
router.post('/tasks/:id/accept', riderController.acceptTask);
router.put('/tasks/:id/pickup', riderController.confirmPickup);
router.patch('/tasks/:id/status', riderController.confirmPickup);
router.put('/tasks/:id/deliver', riderController.confirmDelivery);
router.post('/tasks/:id/deliver', riderController.confirmDelivery);
router.put('/tasks/:id/pin-location', riderController.pinLocation);
router.post('/tasks/:id/door-picture', uploadDoorPictureMiddleware, riderController.uploadDoorPicture);

// Call request (privacy protected)
router.post(
  '/call-request',
  validate(riderSchemas.callRequest),
  riderController.requestCall
);

// Location updates
router.put(
  '/location',
  riderLocationRateLimiter,
  validate(riderSchemas.updateLocation),
  riderController.updateLocation
);

// Status updates
router.put('/status', riderController.updateStatus);

// Earnings
router.get('/earnings/today', riderController.getTodayEarnings);

// Stats (today must come before generic /stats)
router.get('/stats/today', riderController.getTodayStats);

// Full stats (daily/weekly/monthly + payment)
router.get('/stats', riderController.getMyStats);

export default router;
