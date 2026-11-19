// ============================================================================
// WISHLIST ROUTES (W22) — the customer's own list; signed-in customers only.
// ============================================================================

import { Router } from 'express';
import * as wishlist from '../controllers/wishlist.controller';
import { authenticate, verifyUserActive } from '../middleware';

const router = Router();

router.use(authenticate, verifyUserActive);

router.get('/', wishlist.getWishlist);
// Literal path before '/:productId'.
router.post('/merge', wishlist.mergeWishlist);
router.post('/:productId', wishlist.addToWishlist);
router.delete('/:productId', wishlist.removeFromWishlist);

export default router;
