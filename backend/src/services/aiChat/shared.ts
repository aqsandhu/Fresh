// Shared helpers for the aiChat handlers (moved from aiChat.service.ts, W21).



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

/** Turn a stored WhatsApp setting (full URL or bare phone number) into a tappable link. */
export function whatsappOrderLink(raw: string): string {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  const digits = v.replace(/[^\d]/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : '';
}

export interface ChatContextOpts {
  cityId?: string | null;
  page?: string | null;
}

// Generic filler/interrogative words that never name a product — used so a plain
// question like "delivery kya hai?" doesn't trigger a whole-catalog dump.
export const STOPWORDS = new Set([
  'kya', 'kia', 'hai', 'hain', 'hay', 'hy', 'kaise', 'kese', 'kab', 'kahan', 'kaha',
  'how', 'what', 'the', 'and', 'aur', 'for', 'you', 'your', 'mujhe', 'muje', 'mera', 'meri',
  'kar', 'karo', 'kr', 'plz', 'please', 'bhai', 'app', 'aap', 'rate', 'price', 'qeemat',
  'keemat', 'kitna', 'kitne', 'kitni', 'chahiye', 'chahye', 'available',
  // Greetings / conversational fillers — never name a product, so they should
  // not trigger a catalog lookup or a "not available" answer on their own.
  'salam', 'salaam', 'assalam', 'asalam', 'asalaam', 'aslam', 'aoa', 'walaikum',
  'walaykum', 'hello', 'hii', 'hey', 'shukria', 'shukriya', 'thanks', 'thanku',
  'thankyou', 'theek', 'acha', 'achha', 'haan', 'nahi', 'nahin', 'okay', 'hmm',
  // Identity / chit-chat words — e.g. "tumhara naam kya hai", "kaun ho", "kaise
  // ho" must NOT be read as a product search.
  'naam', 'name', 'tum', 'tumhara', 'tumara', 'tmhara', 'tumhe', 'tumhein',
  'kaun', 'kon', 'who', 'kaisa', 'kaisi', 'haal', 'robot', 'bot', 'kon',
]);

export type ProductAnswerMode = 'none' | 'needs_city' | 'available' | 'out_of_stock' | 'no_match' | 'empty_catalog';

export interface ProductFactMeta {
  id: string;
  displayName: string;
  href: string;
  priceText: string;
  prices: number[];
  names: string[];
  terms: string[];
}

export interface ContextBundle {
  text: string;
  productIntent: boolean;
  selectedCity: boolean;
  answerMode: ProductAnswerMode;
  productFacts: ProductFactMeta[];
  /** Content tokens the user typed (product-name candidates), for reply wording. */
  queryTokens: string[];
  /** True for a generic "show me the menu" browse (not a specific product search). */
  browse: boolean;
}

export const GENERIC_LINK_LABEL_TERMS = new Set([
  'view', 'open', 'product', 'item', 'link', 'buy', 'shop', 'fresh', 'freshbazar',
  'quality', 'rate', 'price', 'qeemat', 'keemat', 'cart', 'add',
]);

export function normalizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}
