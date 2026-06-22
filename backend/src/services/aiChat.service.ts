// ============================================================================
// AI CHAT SERVICE — provider-agnostic customer-care assistant
// ----------------------------------------------------------------------------
// Activates automatically once a super admin sets an API key (env or settings).
// The key NEVER leaves the server. Replies are short + low-token to bound cost.
// ============================================================================

import { fetchGlobalSettings } from '../utils/siteSettings';
import { query } from '../config/database';
import { isMissingTable } from '../utils/dbErrors';
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

// Provider presets. `family` decides which API shape to use; `base` is the
// default endpoint (so users don't need to set AI_CHAT_BASE_URL for known
// providers). Anything OpenAI-compatible (DeepSeek, Grok/xAI, etc.) reuses the
// OpenAI chat-completions shape.
type ProviderFamily = 'anthropic' | 'gemini' | 'openai';
const PROVIDER_PRESETS: Record<string, { family: ProviderFamily; base?: string; model: string }> = {
  anthropic: { family: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  gemini: { family: 'gemini', model: 'gemini-1.5-flash' },
  openai: { family: 'openai', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  'openai-compatible': { family: 'openai', model: 'gpt-4o-mini' },
  deepseek: { family: 'openai', base: 'https://api.deepseek.com', model: 'deepseek-chat' },
  grok: { family: 'openai', base: 'https://api.x.ai/v1', model: 'grok-2-latest' },
  xai: { family: 'openai', base: 'https://api.x.ai/v1', model: 'grok-2-latest' },
};

const MAX_TOKENS = 350;
const REQUEST_TIMEOUT_MS = 20000;

// Compact but expert knowledge so the model can guide users with few tokens.
const SYSTEM_PROMPT = `You are "FreshBazar Assistant", the official customer-care chatbot for FreshBazar — a Pakistani online grocery & fresh-produce delivery service (vegetables, fruits, dry fruits, chicken).

STYLE: Warm, concise, expert. Reply in 2-5 short sentences or a tiny bullet list. Mirror the user's language (English, Urdu, or Roman Urdu). Get to the point. Never invent prices, stock, order IDs or policies — if you don't have it, say so and point to the right page/support.

IMPORTANT — WHAT YOU CANNOT DO: You cannot add items to the cart, change quantities, fill the address, or place/checkout orders yourself. Never say "should I add it for you?" or claim you added/ordered anything. Instead, share the item's link and guide the user to do it.

YOU CAN HELP WITH:
- Products & categories: help users find items and share consumer retail price/availability from the live catalog below. When a user wants an item, give its markdown link (e.g. [Tomato](/product/ID) — use exactly the link shown in the catalog) and say: "open it, choose the quality (A/B/C) and quantity — the page lets you pick ½ kg or ¼ kg where allowed, or 1, 2, 3+ kg (each item has a minimum), then tap Add to Cart."
- Ordering/checkout (GUIDE only, you don't perform it): after adding items → open Cart → Checkout → confirm delivery address by dropping the map pin → pick a delivery time slot → Place Order (Cash on Delivery supported; qualifying orders get free delivery). Tell them which buttons to tap.
- Today's Basket: ready-made combo packages — opening it and tapping "Add basket to cart" adds all items at once.
- Restaurants (B2B): businesses Register as Restaurant in the Restaurant section and, once approved, log in to order at special business pricing. NEVER reveal or quote restaurant/wholesale prices — tell them to register & log in to see business rates.
- Work as Rider: open "Work as Rider", fill the application (name, contact, area, vehicle/CNIC details) and submit; the team reviews and contacts applicants.
- Complaints: from Orders/Support, file a complaint on the relevant order (photos optional); the team reviews and can resolve/refund.
- Reviews: after delivery, rate the order/products from Orders or the product page.
- Franchise: entrepreneurs apply on the Franchise page to bring FreshBazar to their city.
- Service areas: delivery is limited to covered areas; if a pin is outside, the app shows a message + a WhatsApp number to request service there.
- About/Contact: company info & support contact are in the footer/menu.

USING REAL FACTS: A "REAL FACTS" block may be added below with the active delivery cities, the user's selected city, the current page, and any matching products. ALWAYS rely on it. Never name a city, price, or product that is not in it. If the facts say a product isn't available, tell the user it's not on FreshBazar right now and never guess a price. To change city, tell the user to tap the city/location button and pick another. If you don't have a fact, say so honestly instead of guessing.

RULES: Stay on FreshBazar topics. Be accurate and safe. Only guide and share links — never perform actions. Don't promise discounts/refunds you can't guarantee.

WRITING STYLE: Reply in plain, simple sentences in the user's language (English, Urdu, or Roman Urdu). Keep it to 2-4 short sentences, or a short numbered list (1. 2. 3.) for steps. Do NOT use markdown bold, asterisks (*), headings (#), or decorative emoji. The ONLY formatting allowed is product links written exactly as [Name](/product/ID). Be warm but efficient — give the user a clear, useful answer with no fluff.`;

const PRODUCT_INTENT =
  /price|rate|kitn|available|stock|kg|dozen|sabz|fruit|vegetable|veggie|chicken|dry.?fruit|product|item|buy|kharid|menu|chahi|milt|milega|konsi|kaunsi|kya hai|kya hain/i;

export interface ChatContextOpts {
  cityId?: string | null;
  page?: string | null;
}

/**
 * Build a compact REAL-FACTS context: active cities, the user's selected city,
 * the current page, and (for product questions) matching products with links.
 * The model is told to rely ONLY on these facts so it never invents a city,
 * price, or availability. Consumer retail price only — restaurant prices excluded.
 */
async function buildContext(message: string, opts: ChatContextOpts): Promise<string> {
  const { cityId, page } = opts;
  const lines: string[] = [
    '[REAL FACTS — use ONLY these. Never invent a city, price, or whether a product exists.]',
  ];

  // Active service cities (so city questions are answered correctly).
  try {
    const c = await query(`SELECT name FROM service_cities WHERE is_active = true ORDER BY name`);
    const names = c.rows.map((r) => r.name).filter(Boolean);
    lines.push(
      names.length
        ? `FreshBazar currently delivers in these cities: ${names.join(', ')}. The user can switch city anytime by tapping the city/location button on screen and choosing another city.`
        : 'No delivery cities are active right now.'
    );
  } catch {
    /* ignore */
  }

  // The user's selected city (resolved to a name).
  let cityName: string | null = null;
  if (cityId) {
    try {
      const r = await query(`SELECT name FROM service_cities WHERE id = $1`, [cityId]);
      cityName = r.rows[0]?.name || null;
    } catch {
      /* ignore */
    }
  }
  lines.push(
    cityName
      ? `The user's currently selected delivery city is: ${cityName}.`
      : "The user has not selected a city yet — ask them to choose one from the city/location button."
  );

  // Current page/screen the user is on.
  if (page) lines.push(`The user is currently on this page: ${page}.`);

  // Product lookup — only for product-related questions.
  if (PRODUCT_INTENT.test(message)) {
    const tokens = message
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ\s]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .slice(0, 8);
    let products: Array<{ id: string; name_en: string; price: number; unit_type: string; stock_status: string }> = [];
    if (tokens.length) {
      const patterns = tokens.map((t) => `%${t}%`);
      try {
        const r = await query(
          `SELECT id, name_en, price, unit_type, stock_status
             FROM products
            WHERE is_active = true ${cityId ? 'AND city_id = $2' : ''}
              AND (name_en ILIKE ANY($1) OR name_ur ILIKE ANY($1))
            ORDER BY is_featured DESC, name_en ASC
            LIMIT 6`,
          cityId ? [patterns, cityId] : [patterns]
        );
        products = r.rows;
      } catch (err) {
        if (!isMissingTable(err)) logger.warn('AI catalog lookup failed', { error: (err as Error)?.message });
      }
    }
    if (products.length) {
      lines.push(
        'Matching products (consumer retail price in PKR; share the link so the user picks quality & quantity there):'
      );
      for (const p of products) {
        const avail = p.stock_status === 'out_of_stock' ? 'out of stock' : 'in stock';
        const unit = p.unit_type ? `/${p.unit_type}` : '';
        lines.push(`- [${p.name_en}](/product/${p.id}): Rs.${Math.round(Number(p.price))}${unit} (${avail})`);
      }
    } else {
      lines.push(
        `No product matching the user's question is available in ${cityName || 'the selected city'} right now. Tell them it is NOT available on FreshBazar at the moment — do NOT make up a price — and suggest browsing the Categories for similar items.`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Load AI config. Environment variables take precedence over DB settings, so the
 * whole assistant can be configured purely via Render env vars:
 *   AI_CHAT_API_KEY (required to enable), AI_CHAT_PROVIDER, AI_CHAT_MODEL,
 *   AI_CHAT_BASE_URL, AI_CHAT_DISABLED.
 */
export async function getAiConfig(): Promise<AiConfig> {
  const map = await fetchGlobalSettings([
    AI_KEYS.provider,
    AI_KEYS.apiKey,
    AI_KEYS.model,
    AI_KEYS.baseUrl,
    AI_KEYS.disabled,
  ]);
  const env = (k: string) => (process.env[k] || '').trim();
  return {
    provider: (env('AI_CHAT_PROVIDER') || map[AI_KEYS.provider] || 'anthropic').toLowerCase(),
    apiKey: env('AI_CHAT_API_KEY') || (map[AI_KEYS.apiKey] || '').trim(),
    model: env('AI_CHAT_MODEL') || (map[AI_KEYS.model] || '').trim(),
    baseUrl: (env('AI_CHAT_BASE_URL') || map[AI_KEYS.baseUrl] || '').replace(/\/+$/, ''),
    disabled: env('AI_CHAT_DISABLED') === 'true' || (map[AI_KEYS.disabled] || '') === 'true',
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

/**
 * Ensure the conversation starts with a user turn and roles alternate. Clients
 * include a greeting (assistant) as the first message, which Anthropic/Gemini
 * reject — so drop leading assistant turns and merge accidental same-role repeats.
 */
function sanitizeHistory(history: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of history) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || !m.content?.trim()) continue;
    if (out.length === 0 && m.role !== 'user') continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) {
      prev.content = `${prev.content}\n${m.content}`;
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

/**
 * Generate a reply from the configured provider for a short message history.
 * Injects a tiny live-catalog context for product questions (city-scoped).
 */
export async function generateReply(
  history: ChatMessage[],
  opts: ChatContextOpts = {}
): Promise<string> {
  const cfg = await getAiConfig();
  if (!aiEnabled(cfg)) throw new Error('AI assistant is not configured');

  const provider = cfg.provider;
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS['openai-compatible'];
  const family = preset.family;
  const model = cfg.model || preset.model;

  // Anthropic & Gemini require the conversation to START with a user turn and to
  // alternate. Clients include a greeting (assistant) first, so drop any leading
  // assistant turns and collapse accidental same-role repeats.
  const convo = sanitizeHistory(history);
  const lastUser = [...convo].reverse().find((m) => m.role === 'user')?.content || '';
  const context = await buildContext(lastUser, opts);
  const systemPrompt = context ? `${SYSTEM_PROMPT}\n\n${context}` : SYSTEM_PROMPT;

  try {
    if (family === 'anthropic') {
      const data = await postJson(
        'https://api.anthropic.com/v1/messages',
        { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
        { model, max_tokens: MAX_TOKENS, system: systemPrompt, messages: convo }
      );
      return String(data?.content?.[0]?.text || '').trim();
    }

    if (family === 'gemini') {
      const base = cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
      const data = await postJson(
        `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
        {},
        {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: convo.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: { maxOutputTokens: MAX_TOKENS },
        }
      );
      return String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    }

    // OpenAI-compatible (OpenAI, DeepSeek, Grok/xAI, custom). Base URL comes from
    // the user's setting, else the provider preset, else OpenAI.
    const base = cfg.baseUrl || preset.base || 'https://api.openai.com/v1';
    const data = await postJson(
      `${base}/chat/completions`,
      { authorization: `Bearer ${cfg.apiKey}` },
      {
        model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'system', content: systemPrompt }, ...convo],
      }
    );
    return String(data?.choices?.[0]?.message?.content || '').trim();
  } catch (err: any) {
    logger.warn('AI chat generation failed', { provider, message: err?.message });
    throw err;
  }
}
