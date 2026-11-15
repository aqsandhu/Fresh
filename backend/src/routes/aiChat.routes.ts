// ============================================================================
// AI CHAT ROUTES — public assistant (status + message). Key stays server-side.
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { pktDateString } from '../utils/businessTime';
import { createRateLimiter } from '../middleware/rateLimiter';
import { getStatus, postMessage } from '../controllers/aiChat.controller';

const router = Router();

// Bound token spend / abuse: cap messages per IP.
const messageLimiter = createRateLimiter(
  10 * 60 * 1000,
  30,
  'Too many messages. Please slow down and try again shortly.'
);

// The per-IP limit above bounds one caller; many callers together could
// still run up the AI bill (the endpoint is public). A ceiling on messages per
// Pakistan day for the whole service: once it is reached the assistant says it
// is resting until tomorrow and no provider call is made. AI_CHAT_DAILY_LIMIT
// (default 3000; 0 = no ceiling).
const DAILY_LIMIT = Math.max(0, Number(process.env.AI_CHAT_DAILY_LIMIT ?? 3000));
const budget = { day: '', used: 0 };
export function dailyBudget(req: Request, res: Response, next: NextFunction): void {
  if (DAILY_LIMIT === 0) return next();
  const today = pktDateString();
  if (budget.day !== today) {
    budget.day = today;
    budget.used = 0;
  }
  if (budget.used >= DAILY_LIMIT) {
    res.status(503).json({
      success: false,
      message: 'The assistant has answered a lot of questions today and is resting. Please call or WhatsApp us, or try again tomorrow.',
    });
    return;
  }
  budget.used += 1;
  next();
}

router.get('/status', getStatus);
router.post('/message', messageLimiter, dailyBudget, postMessage);

export default router;
