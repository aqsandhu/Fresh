// ============================================================================
// REVIEW ROUTES — customer ratings & reviews (products, riders, service).
// Mounted at /api/reviews. Admin moderation lives under /api/admin/reviews.
// ============================================================================

import { Router } from 'express';
import { authenticate, verifyUserActive } from '../middleware';
import {
  submitReview,
  getMyReviews,
  getOrderReviewables,
  getProductReviews,
} from '../controllers/review.controller';

const router = Router();

// Public — product reviews for the storefront product page.
router.get('/product/:productId', getProductReviews);

// Authenticated customer routes.
router.use(authenticate);
router.get('/mine', getMyReviews);
router.get('/order/:orderId', getOrderReviewables);
router.post('/', verifyUserActive, submitReview);

export default router;
