// ============================================================================
// AI CHAT ROUTES — public assistant (status + message). Key stays server-side.
// ============================================================================

import { Router } from 'express';
import { createRateLimiter } from '../middleware/rateLimiter';
import { getStatus, postMessage } from '../controllers/aiChat.controller';

const router = Router();

// Bound token spend / abuse: cap messages per IP.
const messageLimiter = createRateLimiter(
  10 * 60 * 1000,
  30,
  'Too many messages. Please slow down and try again shortly.'
);

router.get('/status', getStatus);
router.post('/message', messageLimiter, postMessage);

export default router;
