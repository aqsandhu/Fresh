// ============================================================================
// CHAT ROUTES
// ============================================================================

import { Router } from 'express';
import * as chatController from '../controllers/chat.controller';
import { authenticate } from '../middleware';

const router = Router();

router.use(authenticate);

router.get('/:orderId', chatController.getMessages);
router.post('/:orderId', chatController.sendMessage);

export default router;
