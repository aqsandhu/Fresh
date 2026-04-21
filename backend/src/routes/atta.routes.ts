// ============================================================================
// ATTA CHAKKI ROUTES
// ============================================================================

import { Router } from 'express';
import * as attaController from '../controllers/atta.controller';
import {
  authenticate,
  validate,
  attaSchemas,
} from '../middleware';

const router = Router();

// Track atta request (public)
router.get('/track/:id', attaController.trackAttaRequest);

// Protected routes
router.use(authenticate);

router.get('/', attaController.getAttaRequests);
router.get('/:id', attaController.getAttaRequestById);
router.post(
  '/',
  validate(attaSchemas.create),
  attaController.createAttaRequest
);
router.put('/:id/cancel', attaController.cancelAttaRequest);

export default router;
