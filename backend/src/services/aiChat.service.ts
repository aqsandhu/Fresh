// ============================================================================
// AI CHAT SERVICE — provider-agnostic customer-care assistant
// ----------------------------------------------------------------------------
// Activates automatically once a super admin sets an API key (env or settings).
// The key NEVER leaves the server. Replies are short + low-token to bound cost.
// ============================================================================

import { fetchGlobalSettings } from '../utils/siteSettings';
import logger from '../utils/logger';

export const AI_KEYS = {
  provider: 'ai_chat_provider',
  apiKey: 'ai_chat_api_key',
  model: 'ai_chat_model',
  baseUrl: 'ai_chat_base_url',
  disabled: 'ai_chat_disabled',
} as const;

export type ChatRole = 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface AiConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  disabled: boolean;
}

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  'openai-compatible': 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
};

const MAX_TOKENS = 350;
const REQUEST_TIMEOUT_MS = 20000;

// Compact knowledge so the model can guide users without big prompts.
const SYSTEM_PROMPT = `You are "FreshBazar Assistant", the friendly customer-care chatbot for FreshBazar, a Pakistani online grocery & fresh-produce delivery service.

Be warm, concise and to the point (2-4 short sentences, use simple English or Roman Urdu if the user writes that way). Never invent prices, stock, or order details — if unsure, tell the user to check the relevant page or contact support.

You can help with:
- Products: vegetables, fruits, dry fruits, chicken; qualities A/B/C; browse via the Shop/Categories.
- Ordering: add items to cart, choose a delivery address (pin on map) and a time slot, then place the order (Cash on Delivery supported). Free delivery on qualifying orders.
- Today's Basket: ready-made combo packages customers can add to cart in one tap.
- Complaints & reviews: customers can file a complaint or leave a review from their Orders / Support section.
- Work as Rider: people can apply to deliver via the "Work as Rider" page.
- Register as Restaurant: businesses can sign up via the Restaurant section for bulk pricing.
- Franchise: entrepreneurs can apply on the Franchise page to bring FreshBazar to their city.
- About Us / Contact Us: company info and support contact are in the footer/menu.
- Service areas: delivery is available in selected cities/areas; if outside, customers can request service via WhatsApp.

If asked something outside FreshBazar, politely steer back to how you can help with shopping or services.`;

/** Load AI config (env key takes precedence over the DB setting). */
export async function getAiConfig(): Promise<AiConfig> {
  const map = await fetchGlobalSettings([
    AI_KEYS.provider,
    AI_KEYS.apiKey,
    AI_KEYS.model,
    AI_KEYS.baseUrl,
    AI_KEYS.disabled,
  ]);
  const envKey = process.env.AI_CHAT_API_KEY?.trim() || '';
  return {
    provider: (map[AI_KEYS.provider] || 'anthropic').trim().toLowerCase(),
    apiKey: envKey || (map[AI_KEYS.apiKey] || '').trim(),
    model: (map[AI_KEYS.model] || '').trim(),
    baseUrl: (map[AI_KEYS.baseUrl] || '').trim().replace(/\/+$/, ''),
    disabled: (map[AI_KEYS.disabled] || '') === 'true',
  };
}

/** The bot is live when a key exists and it isn't explicitly disabled. */
export function aiEnabled(cfg: AiConfig): boolean {
  return Boolean(cfg.apiKey) && !cfg.disabled;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || `AI provider error (${res.status})`;
      throw new Error(msg);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Generate a reply from the configured provider for a short message history. */
export async function generateReply(history: ChatMessage[]): Promise<string> {
  const cfg = await getAiConfig();
  if (!aiEnabled(cfg)) throw new Error('AI assistant is not configured');

  const model = cfg.model || DEFAULT_MODELS[cfg.provider] || DEFAULT_MODELS.anthropic;
  const provider = cfg.provider;

  try {
    if (provider === 'anthropic') {
      const data = await postJson(
        'https://api.anthropic.com/v1/messages',
        { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
        { model, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages: history }
      );
      return String(data?.content?.[0]?.text || '').trim();
    }

    if (provider === 'gemini') {
      const base = cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
      const data = await postJson(
        `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
        {},
        {
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: history.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: { maxOutputTokens: MAX_TOKENS },
        }
      );
      return String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    }

    // openai + openai-compatible (any base URL)
    const base = cfg.baseUrl || 'https://api.openai.com/v1';
    const data = await postJson(
      `${base}/chat/completions`,
      { authorization: `Bearer ${cfg.apiKey}` },
      {
        model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
      }
    );
    return String(data?.choices?.[0]?.message?.content || '').trim();
  } catch (err: any) {
    logger.warn('AI chat generation failed', { provider, message: err?.message });
    throw err;
  }
}
