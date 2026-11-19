// ============================================================================
// ATTA CHAKKI ROUTES
// ============================================================================

import { Router } from 'express';
import * as attaController from '../controllers/atta.controller';
import { duplicateSubmitGuard } from '../middleware/duplicateSubmitGuard';
import {
  authenticate,
  validate,
  attaSchemas,
} from '../middleware';

const router = Router();

// Public: live charge configuration so storefront copy never hard-codes rates.
router.get('/charges', attaController.getAttaChargesPublic);

// Protected routes
router.use(authenticate);

// Track an atta request — signed-in owner only. It used to be open to anyone
// who had (or guessed) the id and returned its status, times and rider ids;
// the only caller is the customer app, which is always signed in.
router.get('/track/:id', attaController.trackAttaRequest);

router.get('/', attaController.getAttaRequests);
router.get('/:id', attaController.getAttaRequestById);
router.post(
  '/',
  validate(attaSchemas.create),
  duplicateSubmitGuard, // after validation: three taps = one wheat pickup (A34)
  attaController.createAttaRequest
);
router.put('/:id/cancel', attaController.cancelAttaRequest);

export default router;
