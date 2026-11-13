// ============================================================================
// CORRUPTION AUDIT — AI provider settings + one JSON-returning call.
//
// The provider (company), model name and API key are set by the super admin
// on the Audit page — nothing here is hard-coded to one vendor. Three API
// shapes cover the market: Anthropic, Google Gemini, and the OpenAI
// chat-completions shape used by OpenAI and by most other vendors
// (DeepSeek, xAI/Grok, Groq, OpenRouter, Mistral, a self-hosted gateway …).
//
// The key is encrypted at rest (AES-256-GCM, key derived from
// AUDIT_AI_SECRET or JWT_SECRET), is never returned by any endpoint, and is
// redacted from the audit log by the existing "api_key" rule.
// ============================================================================

import crypto from 'crypto';
import { fetchGlobalSettings, upsertGlobalSiteSetting } from '../../utils/siteSettings';

export const AUDIT_AI_KEYS = {
  provider: 'audit_ai_provider',
  model: 'audit_ai_model',
  baseUrl: 'audit_ai_base_url',
  apiKey: 'audit_ai_api_key_enc',
  language: 'audit_ai_language',
} as const;

type Family = 'anthropic' | 'gemini' | 'openai';
export const AUDIT_AI_PROVIDERS: Record<string, { label: string; family: Family; base?: string }> = {
  anthropic: { label: 'Anthropic (Claude)', family: 'anthropic', base: 'https://api.anthropic.com/v1' },
  openai: { label: 'OpenAI', family: 'openai', base: 'https://api.openai.com/v1' },
  gemini: { label: 'Google (Gemini)', family: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta' },
  deepseek: { label: 'DeepSeek', family: 'openai', base: 'https://api.deepseek.com' },
  xai: { label: 'xAI (Grok)', family: 'openai', base: 'https://api.x.ai/v1' },
  groq: { label: 'Groq', family: 'openai', base: 'https://api.groq.com/openai/v1' },
  openrouter: { label: 'OpenRouter', family: 'openai', base: 'https://openrouter.ai/api/v1' },
  mistral: { label: 'Mistral', family: 'openai', base: 'https://api.mistral.ai/v1' },
  custom: { label: 'Other (OpenAI-compatible, needs a base URL)', family: 'openai' },
};
export const AUDIT_LANGUAGES = ['roman_urdu', 'english', 'urdu'] as const;

export interface AuditAiConfig {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  language: (typeof AUDIT_LANGUAGES)[number];
  /** True when a key is stored but could not be decrypted (secret changed). */
  keyUnreadable: boolean;
}

const secretKey = (): Buffer =>
  crypto.createHash('sha256').update(String(process.env.AUDIT_AI_SECRET || process.env.JWT_SECRET || 'freshbazar-audit')).digest();

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`;
}

export function decryptSecret(stored: string): string | null {
  const [v, iv, tag, body] = String(stored || '').split(':');
  if (v !== 'v1' || !iv || !tag || !body) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export async function getAuditAiConfig(): Promise<AuditAiConfig> {
  const map = await fetchGlobalSettings(Object.values(AUDIT_AI_KEYS));
  const stored = (map[AUDIT_AI_KEYS.apiKey] || '').trim();
  const apiKey = stored ? decryptSecret(stored) : '';
  const language = (map[AUDIT_AI_KEYS.language] || 'roman_urdu') as AuditAiConfig['language'];
  return {
    provider: (map[AUDIT_AI_KEYS.provider] || '').toLowerCase(),
    model: (map[AUDIT_AI_KEYS.model] || '').trim(),
    baseUrl: (map[AUDIT_AI_KEYS.baseUrl] || '').trim().replace(/\/+$/, ''),
    apiKey: apiKey || '',
    language: AUDIT_LANGUAGES.includes(language) ? language : 'roman_urdu',
    keyUnreadable: Boolean(stored) && apiKey === null,
  };
}

/** What the Audit page may see: never the key itself. */
export function publicAuditAiConfig(cfg: AuditAiConfig) {
  return {
    provider: cfg.provider,
    model: cfg.model,
    base_url: cfg.baseUrl,
    language: cfg.language,
    has_key: Boolean(cfg.apiKey),
    key_unreadable: cfg.keyUnreadable,
    ready: auditAiReady(cfg),
    providers: Object.entries(AUDIT_AI_PROVIDERS).map(([id, p]) => ({ id, label: p.label, needs_base_url: !p.base })),
    languages: AUDIT_LANGUAGES,
  };
}

export function auditAiReady(cfg: AuditAiConfig): boolean {
  const preset = AUDIT_AI_PROVIDERS[cfg.provider];
  return Boolean(preset && cfg.model && cfg.apiKey && (preset.base || cfg.baseUrl));
}

/** Validate + store settings. Returns an error message, or null when saved. */
export async function saveAuditAiConfig(body: Record<string, unknown>, userId?: string): Promise<string | null> {
  if (body.provider !== undefined) {
    const provider = String(body.provider).trim().toLowerCase();
    if (!AUDIT_AI_PROVIDERS[provider]) return 'Choose an AI company from the list.';
    await upsertGlobalSiteSetting(AUDIT_AI_KEYS.provider, provider, userId);
  }
  if (body.model !== undefined) {
    const model = String(body.model).trim();
    if (!/^[\w.:/@-]{1,100}$/.test(model)) return 'Enter the model name exactly as the AI company writes it (letters, digits, . - _ : /).';
    await upsertGlobalSiteSetting(AUDIT_AI_KEYS.model, model, userId);
  }
  if (body.base_url !== undefined) {
    const url = String(body.base_url).trim().replace(/\/+$/, '');
    if (url && !/^https:\/\/[^\s]{4,280}$/i.test(url) && !(process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/i.test(url))) {
      return 'The base URL must start with https://';
    }
    await upsertGlobalSiteSetting(AUDIT_AI_KEYS.baseUrl, url, userId);
  }
  if (body.language !== undefined) {
    const language = String(body.language).trim().toLowerCase();
    if (!(AUDIT_LANGUAGES as readonly string[]).includes(language)) return 'Choose a report language from the list.';
    await upsertGlobalSiteSetting(AUDIT_AI_KEYS.language, language, userId);
  }
  if (body.clear_key === true || body.clear_key === 'true') {
    await upsertGlobalSiteSetting(AUDIT_AI_KEYS.apiKey, '', userId);
  } else if (typeof body.api_key === 'string' && body.api_key.trim()) {
    const key = body.api_key.trim();
    if (key.length < 8 || key.length > 400 || /\s/.test(key)) return 'That does not look like an API key.';
    await upsertGlobalSiteSetting(AUDIT_AI_KEYS.apiKey, encryptSecret(key), userId);
  }
  return null;
}

const TIMEOUT_MS = Math.max(20000, Number(process.env.AUDIT_AI_TIMEOUT_MS || 150000));

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || data?.error || data?.message || `HTTP ${res.status}`;
      throw Object.assign(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 300)), { status: res.status });
    }
    return data;
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error(`The AI did not answer within ${Math.round(TIMEOUT_MS / 1000)} seconds.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** One system + one user message in, the model's text out. */
export async function callAuditAi(cfg: AuditAiConfig, system: string, user: string, maxTokens = 6000): Promise<string> {
  const preset = AUDIT_AI_PROVIDERS[cfg.provider];
  if (!preset || !auditAiReady(cfg)) throw new Error('AI is not set up yet — choose the company, model and API key on the Audit page.');
  const base = cfg.baseUrl || preset.base!;

  if (preset.family === 'anthropic') {
    const data = await postJson(
      `${base}/messages`,
      { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      { model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }
    );
    const text = (Array.isArray(data?.content) ? data.content : [])
      .filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
    if (!text) throw new Error(`The AI returned no text (stop reason: ${data?.stop_reason || 'unknown'}).`);
    return text;
  }

  if (preset.family === 'gemini') {
    const data = await postJson(
      `${base}/models/${encodeURIComponent(cfg.model)}:generateContent`,
      { 'x-goog-api-key': cfg.apiKey },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      }
    );
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('');
    if (!text) throw new Error(`The AI returned no text (${data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'no candidate'}).`);
    return text;
  }

  // OpenAI chat-completions shape. Newer models take max_completion_tokens
  // and reject max_tokens; older and third-party ones are the other way
  // round — try the modern name first and fall back once.
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  const headers = { authorization: `Bearer ${cfg.apiKey}` };
  let data: any;
  try {
    data = await postJson(`${base}/chat/completions`, headers, { model: cfg.model, messages, max_completion_tokens: maxTokens });
  } catch (err: any) {
    if (err?.status !== 400 && err?.status !== 422) throw err;
    data = await postJson(`${base}/chat/completions`, headers, { model: cfg.model, messages, max_tokens: maxTokens });
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') throw new Error(`The AI returned no text (${data?.choices?.[0]?.finish_reason || 'empty reply'}).`);
  return text;
}
