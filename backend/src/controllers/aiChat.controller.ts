// ============================================================================
// AI CHAT CONTROLLER — public status + message proxy (key stays server-side)
// ============================================================================

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { successResponse, errorResponse } from '../utils/response';
import { resolvePublicCityId } from '../utils/cityScope';
import { getAiConfig, aiEnabled, generateReply, type ChatMessage } from '../services/aiChat.service';

const MAX_HISTORY = 8;
const MAX_LEN = 1000;

/**
 * Whether the assistant is available (public — no key exposed).
 * GET /api/ai-chat/status
 */
/** One history entry as the client sent it: a user / assistant turn with text. */
const isChatEntry = (m: unknown): m is ChatMessage => {
  const e = m as { role?: unknown; content?: unknown } | null;
  return (
    !!e && typeof e === 'object' &&
    (e.role === 'user' || e.role === 'assistant') &&
    typeof e.content === 'string' && e.content.trim() !== ''
  );
};

export const getStatus = asyncHandler(async (_req: Request, res: Response) => {
  const cfg = await getAiConfig();
  successResponse(res, { enabled: aiEnabled(cfg) }, 'AI status');
});

/**
 * Send a message and get a reply.
 * POST /api/ai-chat/message  { messages?: [{role,content}], message?: string }
 */
export const postMessage = asyncHandler(async (req: Request, res: Response) => {
  const cfg = await getAiConfig();
  if (!aiEnabled(cfg)) {
    return errorResponse(res, 'AI assistant is not available right now.', 503);
  }

  // Accept either a single message or a short history.
  const rawHistory: unknown[] = Array.isArray(req.body.messages) ? req.body.messages : [];
  const history: ChatMessage[] = rawHistory
    .filter(isChatEntry)
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: String(m.content).trim().slice(0, MAX_LEN) }));

  const single = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (single) history.push({ role: 'user', content: single.slice(0, MAX_LEN) });

  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    return errorResponse(res, 'A user message is required', 400);
  }

  try {
    const cityId = await resolvePublicCityId(req);
    const page = typeof req.body.page === 'string' ? req.body.page.trim().slice(0, 160) : null;
    const reply = await generateReply(history, { cityId, page });
    if (!reply) {
      return errorResponse(res, 'No response generated. Please try again.', 502);
    }
    successResponse(res, { reply }, 'AI reply');
  } catch {
    return errorResponse(res, 'The assistant could not respond right now. Please try again.', 502);
  }
});
