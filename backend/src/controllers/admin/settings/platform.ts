// Business hours, platform switches, AI chat — moved from settings.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { query } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import { successResponse, errorResponse } from '../../../utils/response';
import logger from '../../../utils/logger';
import { upsertGlobalSiteSetting, fetchGlobalSettings, ATTA_CHAKKI_ENABLED_KEY } from '../../../utils/siteSettings';
import { AI_KEYS, getAiConfig, aiEnabled } from '../../../services/aiChat.service';
import { encryptSecret } from '../../../utils/secretBox';

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const defaultBusinessHours = () => WEEK_DAYS.map((day) => ({ day, open: '09:00', close: '21:00', is_open: day !== 'Sunday' }));

export const getBusinessHours = asyncHandler(async (req: Request, res: Response) => {
  const result = await query(
    `SELECT key, value FROM site_settings WHERE key = 'business_hours_data' LIMIT 1`
  );

  // Nothing saved, a NULL / malformed value, or anything that is not a list
  // of days → the defaults. (A PUT with no body used to save NULL here, and
  // the settings page then failed with "Error fetching business hours".)
  let hours: unknown = null;
  if (result.rows[0]?.value) {
    try {
      hours = JSON.parse(result.rows[0].value);
    } catch {
      logger.warn('business_hours_data is not valid JSON — returning the defaults');
    }
  }
  successResponse(res, Array.isArray(hours) && hours.length > 0 ? hours : defaultBusinessHours(), 'Business hours retrieved');
});

/**
 * Update business hours
 * PUT /api/admin/settings/business-hours
 *
 * One list for the whole platform → super admin only (B28). The list is
 * checked: every entry a real week day with HH:MM times.
 */

export const updateBusinessHours = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only the super admin can change business hours (they apply to every city).', 403);
  }
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  const raw = req.body?.hours;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 7) {
    return errorResponse(res, 'Send the business hours as a list of days.', 400);
  }
  const seen = new Set<string>();
  const hours: { day: string; open: string; close: string; is_open: boolean }[] = [];
  for (const h of raw) {
    const day = typeof h?.day === 'string' ? h.day : '';
    const isOpen = h?.is_open ?? h?.isOpen;
    if (!WEEK_DAYS.includes(day) || seen.has(day)) return errorResponse(res, 'Each day must be a week day, once.', 400);
    if (!hhmm.test(String(h?.open ?? '')) || !hhmm.test(String(h?.close ?? ''))) {
      return errorResponse(res, `Opening and closing times for ${day} must be like 09:00.`, 400);
    }
    if (typeof isOpen !== 'boolean') return errorResponse(res, `Say whether the shop is open on ${day}.`, 400);
    seen.add(day);
    hours.push({ day, open: h.open, close: h.close, is_open: isOpen });
  }

  await upsertGlobalSiteSetting('business_hours_data', JSON.stringify(hours), req.user?.id);
  successResponse(res, hours, 'Business hours updated');
});

// ============================================================================
// PLATFORM FEATURE FLAGS (super-admin only, global)
// ============================================================================

/** Serialize the global feature flags from a key→value map. */
function serializePlatformFlags(map: Record<string, string>) {
  return {
    atta_chakki_enabled: map[ATTA_CHAKKI_ENABLED_KEY] === 'true',
  };
}

/**
 * Get global platform feature flags.
 * GET /api/admin/settings/platform
 */
export const getPlatformSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can view platform settings', 403);
  }
  const map = await fetchGlobalSettings([ATTA_CHAKKI_ENABLED_KEY]);
  successResponse(res, serializePlatformFlags(map), 'Platform settings retrieved');
});

/**
 * Update global platform feature flags (whitelist only).
 * PUT /api/admin/settings/platform
 */
export const updatePlatformSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can change platform settings', 403);
  }
  const userId = req.user?.id;
  const toBool = (v: unknown) => v === true || v === 'true';

  if (req.body.atta_chakki_enabled !== undefined) {
    await upsertGlobalSiteSetting(
      ATTA_CHAKKI_ENABLED_KEY,
      toBool(req.body.atta_chakki_enabled) ? 'true' : 'false',
      userId
    );
  }

  const map = await fetchGlobalSettings([ATTA_CHAKKI_ENABLED_KEY]);
  logger.info('Platform settings updated', { updatedBy: userId });
  successResponse(res, serializePlatformFlags(map), 'Platform settings updated');
});

// ============================================================================
// AI CHATBOT CONFIG (super-admin only) — key is write-only, never returned
// ============================================================================

async function serializeAiSettings() {
  const cfg = await getAiConfig();
  return {
    provider: cfg.provider,
    model: cfg.model,
    base_url: cfg.baseUrl,
    disabled: cfg.disabled,
    has_key: Boolean(cfg.apiKey),
    enabled: aiEnabled(cfg),
  };
}

/**
 * Get AI chatbot config (masked — no API key returned).
 * GET /api/admin/settings/ai-chat
 */
export const getAiChatSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can view AI settings', 403);
  }
  successResponse(res, await serializeAiSettings(), 'AI settings retrieved');
});

/**
 * Update AI chatbot config. The API key is only written when provided; pass
 * clear_key=true to remove it. The key is never echoed back.
 * PUT /api/admin/settings/ai-chat
 */
export const updateAiChatSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can change AI settings', 403);
  }
  const userId = req.user?.id;

  if (req.body.provider !== undefined) {
    const provider = String(req.body.provider).trim().toLowerCase();
    const allowed = ['anthropic', 'openai', 'openai-compatible', 'gemini', 'deepseek', 'grok', 'xai'];
    // An unknown company used to be saved silently as 'anthropic' (G33) — the
    // chat then called the wrong service with the saved key and broke.
    if (!allowed.includes(provider)) {
      return errorResponse(res, `Unknown AI company. Choose one of: ${allowed.join(', ')}.`, 400);
    }
    await upsertGlobalSiteSetting(AI_KEYS.provider, provider, userId);
  }
  if (req.body.model !== undefined) {
    await upsertGlobalSiteSetting(AI_KEYS.model, String(req.body.model).trim().slice(0, 100), userId);
  }
  if (req.body.base_url !== undefined) {
    await upsertGlobalSiteSetting(AI_KEYS.baseUrl, String(req.body.base_url).trim().slice(0, 300), userId);
  }
  if (req.body.disabled !== undefined) {
    const disabled = req.body.disabled === true || req.body.disabled === 'true';
    await upsertGlobalSiteSetting(AI_KEYS.disabled, disabled ? 'true' : 'false', userId);
  }
  if (req.body.clear_key === true || req.body.clear_key === 'true') {
    await upsertGlobalSiteSetting(AI_KEYS.apiKey, '', userId);
  } else if (typeof req.body.api_key === 'string' && req.body.api_key.trim()) {
    // Stored encrypted — never as the working key in plain text.
    await upsertGlobalSiteSetting(AI_KEYS.apiKey, encryptSecret(req.body.api_key.trim()), userId);
  }

  logger.info('AI chat settings updated', { updatedBy: userId });
  successResponse(res, await serializeAiSettings(), 'AI settings updated');
});

// ============================================================================
// SERVICE CITIES MANAGEMENT
// ============================================================================

/**
 * Get all service cities
 * GET /api/admin/cities
 */
