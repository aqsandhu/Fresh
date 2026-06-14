// ============================================================================
// REVIEW ROUTES — customer ratings & reviews (products, riders, service).
// Mounted at /api/reviews. Admin moderation lives under /api/admin/reviews.
// ============================================================================

import { Router } from 'express';
import { authenticate, verifyUserActive } from '../middleware';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  submitReview,
  getMyReviews,
  getOrderReviewables,
  getProductReviews,
} from '../controllers/review.controller';

const router = Router();

// Reviews are upserts bounded by a customer's delivered orders, but still cap
// the write rate as defence-in-depth on top of the global limiter.
const reviewWriteLimiter = createRateLimiter(
  60 * 1000,
  30,
  'Too many review submissions. Please slow down.'
);

// Public — product reviews for the storefront product page.
router.get('/product/:productId', getProductReviews);

// Authenticated customer routes.
router.use(authenticate);
router.get('/mine', getMyReviews);
router.get('/order/:orderId', getOrderReviewables);
router.post('/', reviewWriteLimiter, verifyUserActive, submitReview);

export default router;
