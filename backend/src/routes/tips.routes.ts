// ============================================================================
// PUBLIC TIPS ROUTES — storefront/app fetch active guidance tips for a page.
// Mounted at /api/tips. Admin management lives under /api/admin/tips.
// ============================================================================

import { Router } from 'express';
import { getPublicTips } from '../controllers/tips.controller';

const router = Router();

router.get('/', getPublicTips);

export default router;
