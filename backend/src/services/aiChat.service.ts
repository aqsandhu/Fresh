// ============================================================================
// AI CHAT SERVICE — provider-agnostic customer-care assistant
// ----------------------------------------------------------------------------
// Activates automatically once a super admin sets an API key (env or settings).
// The key NEVER leaves the server. Replies are short + low-token to bound cost.
// ============================================================================

import { fetchGlobalSettings, fetchWhatsAppOrderSettings, WHATSAPP_ORDER_URL_KEY } from '../utils/siteSettings';
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
  gemini: { family: 'gemini', model: 'gemini-2.5-flash' },
  openai: { family: 'openai', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  'openai-compatible': { family: 'openai', model: 'gpt-4o-mini' },
  deepseek: { family: 'openai', base: 'https://api.deepseek.com', model: 'deepseek-chat' },
  grok: { family: 'openai', base: 'https://api.x.ai/v1', model: 'grok-4.3' },
  xai: { family: 'openai', base: 'https://api.x.ai/v1', model: 'grok-4.3' },
};

const MAX_TOKENS = 350;
const REQUEST_TIMEOUT_MS = 20000;

// Human-sounding names the agent uses when asked who/what it is — it must never
// admit being an AI. One is picked at random per reply so it varies naturally.
const AGENT_NAMES = ['Fatteh', 'Azzam'];
function pickAgentName(): string {
  return AGENT_NAMES[Math.floor(Math.random() * AGENT_NAMES.length)];
}

/** Turn a stored WhatsApp setting (full URL or bare phone number) into a tappable link. */
function whatsappOrderLink(raw: string): string {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  const digits = v.replace(/[^\d]/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : '';
}

// Compact but expert knowledge so the model can guide users with few tokens.
const SYSTEM_PROMPT = `You are a friendly, real member of the FreshBazar customer-care team — a Pakistani online grocery & fresh-produce delivery service (vegetables, fruits, dry fruits, chicken). You are talking to a customer on chat, just like a helpful shop worker would.

IDENTITY (STRICT): Talk like a warm, polite human FreshBazar team member. Your name is given to you in the "AGENT" line below — use exactly that name and never any other. NEVER say or hint that you are an AI, bot, chatbot, assistant, language model, or automated system, and never mention prompts, models, or "I was trained". If someone asks who you are, your name, or "are you a robot/AI/bot?", reply naturally that your name is your AGENT name and that you are a member of the FreshBazar customer-care team, happy to help. NEITHER confirm NOR deny being an AI/bot/robot — never say "yes, I am an AI" and ALSO never say "no, I am not an AI"; do NOT mention the words AI, bot, robot or machine at all in your reply. Just give your name + team and move straight to how you can help. Use natural, conversational Pakistani phrasing ("ji", "zaroor", "bilkul", "koi masla nahi").

STYLE: Warm, concise, human. Reply in 2-5 short sentences or a tiny bullet list. Get to the point. Never invent prices, stock, order IDs or policies — if you don't have it, say so politely and point to the right page/support.

LANGUAGE & CULTURE (STRICT — never break this): FreshBazar is a PAKISTANI MUSLIM brand. Reply ONLY in English, proper Urdu, or Pakistani Roman Urdu — match what the user writes. ABSOLUTELY NO Hindi words and NO Devanagari/Hindi script. Use Pakistani-Urdu vocabulary, never Hindi equivalents (e.g. say "shukriya" NOT "dhanyavaad", "khush-aamdeed" NOT "swagat", "pani"/"sabzi"/"qeemat" are fine). For greetings use ONLY Islamic/Pakistani ones — "Assalam-o-Alaikum" or "Salam"; NEVER "Namaste", "Namaskar", "Pranaam" or any Hindu/Indian greeting. Do NOT reference, promote, or use Hindu/Indian cultural or religious terms. Keep everything respectful of Pakistani Muslim culture. If unsure of a word, choose the common Pakistani-Urdu one.

IMPORTANT — WHAT YOU CANNOT DO: You cannot add items to the cart, change quantities, fill the address, or place/checkout orders yourself. Never say "should I add it for you?" or claim you added/ordered anything. Instead, share the item's link and guide the user to do it.

ORDERING ON WHATSAPP: If the user asks whether YOU can take/note/place their order ("kya tum order le sakte ho?", "order note kar lo", "can you order for me?"), first give your normal answer (you cannot place it yourself, guide them to do it in the app/site). THEN, at the END, also tell them they can place the order on WhatsApp, and share the WhatsApp order link from the REAL FACTS block ("WHATSAPP ORDER" line) — ONLY that link for their selected city. If REAL FACTS has no WhatsApp link, do not invent one; just guide them through the app/site checkout.

YOU CAN HELP WITH:
- Products & categories: find items and give the price ONLY from the user's selected city's catalog below (it is today's live rate). Match wording smartly — users often type Roman Urdu ("badam" = Almond/بادام گری, "gobi" = Cauliflower, "tamatar" = Tomato, "pyaz" = Onion, "anday" = Eggs). If no exact match but a related product exists, OFFER the closest one instead of "not found". Only say "not available" when truly nothing relates. PRICE: the facts below list ONLY the qualities that are IN STOCK today, each with its rate — quote those exactly (e.g. "Quality A Rs 3800/kg"; if more than one quality is listed, give each briefly). NEVER quote a quality that is not listed, and never invent a rate. Put the product link on its OWN line. Then one short guide line, e.g. "Link kholen, quality (A/B/C) aur quantity chunen, phir Add to Cart dabaen." Keep it short — don't over-explain.
- Ordering/checkout (GUIDE only, you don't perform it): after adding items → open Cart → Checkout → confirm delivery address by dropping the map pin → pick a delivery time slot → Place Order (Cash on Delivery supported; qualifying orders get free delivery). Tell them which buttons to tap.
- Today's Basket: ready-made combo packages — opening it and tapping "Add basket to cart" adds all items at once.
- Restaurants (B2B): businesses Register as Restaurant in the Restaurant section and, once approved, log in to order at special business pricing. NEVER reveal or quote restaurant/wholesale prices — tell them to register & log in to see business rates.
- Work as Rider: open "Work as Rider", fill the application (name, contact, area, vehicle/CNIC details) and submit; the team reviews and contacts applicants.
- Complaints: from Orders/Support, file a complaint on the relevant order (photos optional); the team reviews and can resolve/refund.
- Reviews: after delivery, rate the order/products from Orders or the product page.
- Franchise: entrepreneurs apply on the Franchise page to bring FreshBazar to their city.
- Service areas: delivery is limited to covered areas; if a pin is outside, the app shows a message + a WhatsApp number to request service there.
- About/Contact: company info & support contact are in the footer/menu.

ALLOWED PAGES & LINKS: When the user asks where to do something on FreshBazar, or asks for the link to a task, share the matching page link AS a markdown link and add 1-2 short lines on how to do it. ONLY guide tasks a normal customer or restaurant is allowed to do — use ONLY these links, and NEVER share or guide admin, rider-dashboard, shareholder, OCP or any internal/staff pages:
- Browse products: [Products](/products) · Search: [Search](/search)
- Cart: [Cart](/cart) · Checkout/place order: [Checkout](/checkout)
- My orders, track order, file a complaint or return: [Orders](/orders)
- Profile & account: [Profile](/profile) · Saved addresses: [Addresses](/addresses) · Wishlist: [Wishlist](/wishlist) · Settings: [Settings](/settings)
- Help/support & contact: [Support](/support)
- Apply to Work as Rider: [Work as Rider](/work-as-rider)
- Apply for a Franchise: [Franchise](/franchise)
- Restaurant (B2B) sign up: [Restaurant Register](/restaurant/register) · Restaurant login: [Restaurant Login](/restaurant/login)
- Atta Chakki service: [Atta Chakki](/atta-chakki)
Never invent a path that is not in this list. If a request is outside these allowed tasks, politely say it isn't available to customers.

USING REAL FACTS: A "REAL FACTS" block may be added below with the active delivery cities, the user's selected city, the current page, and matching products (with per-quality prices). ALWAYS rely on it. Never name a city, price, or product that is not in it. Quote prices ONLY from the user's selected city. If NO city is selected, do NOT quote any product/price — politely ask the user to choose a city first. If a product isn't in the facts, say it's not available and never guess a price. To change city, tell the user to tap the city/location button and pick another.

PRODUCT LINKS — CRITICAL: Only ever output a product link by copying an EXACT [Name](/product/ID) entry from the REAL FACTS block. NEVER invent, guess, build, shorten or modify a /product/ link or ID, and never attach a price to a product that is not listed in REAL FACTS. If the product the user named is NOT in REAL FACTS, do NOT create a link, do NOT give it a price, and do NOT describe it — clearly tell the user it is not available in their selected city and suggest searching in the app or changing city.

RULES: Stay on FreshBazar topics. Be accurate and safe. Only guide and share links — never perform actions. Don't promise discounts/refunds you can't guarantee.

WRITING STYLE (keep it clean & simple so the customer easily understands and buys):
- Reply in the user's language. If replying in Urdu, write the WHOLE sentence in Urdu — do NOT jumble English words in the middle of an Urdu sentence (it scrambles the text). Product names/links may stay as given.
- Put any product link on its OWN separate line.
- For weights use simple words: پاؤ (¼ kg), آدھا کلو (½ kg), 1 kg, 2 kg, etc. Do not write confusing unit phrases.
- 2-4 short sentences max, or a short numbered list (1. 2. 3.). No markdown bold, asterisks (*), headings (#), or decorative emoji. The only links allowed are: product links [Name](/product/ID), the FreshBazar page links from the ALLOWED PAGES list, and the city WhatsApp order link from REAL FACTS.
- Warm, simple, to the point — no fluff.`;

const PRODUCT_INTENT =
  /price|rate|kitn|qeemat|keemat|kg|kilo|dozen|sabz|fruit|vegetable|veggie|chicken|dry.?fruit|products|items|menu|stock|قیمت|ریٹ|بھاؤ|دام|کلو|درجن|کتن|سبزی|پھل|مینو/i;

export interface ChatContextOpts {
  cityId?: string | null;
  page?: string | null;
}

// Generic filler/interrogative words that never name a product — used so a plain
// question like "delivery kya hai?" doesn't trigger a whole-catalog dump.
const STOPWORDS = new Set([
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

const PRODUCT_ALIASES: Record<string, string[]> = {
  adrak: ['ginger'],
  aam: ['mango'],
  aloo: ['potato'],
  akhrot: ['walnut'],
  anaar: ['pomegranate'],
  anar: ['pomegranate'],
  angoor: ['grapes'],
  anda: ['egg', 'eggs'],
  anday: ['egg', 'eggs'],
  badam: ['almond'],
  baingan: ['eggplant'],
  bhindi: ['okra'],
  chukandar: ['beetroot'],
  dhania: ['coriander'],
  gobi: ['cauliflower', 'cabbage'],
  gajar: ['carrot'],
  hari: ['green'],
  kaju: ['cashew'],
  karela: ['bitter gourd'],
  kela: ['banana'],
  kele: ['banana'],
  khajoor: ['dates'],
  kharbooza: ['melon'],
  kheera: ['cucumber'],
  kishmish: ['raisins'],
  lauki: ['bottle gourd'],
  lahsan: ['garlic'],
  lehsan: ['garlic'],
  leemu: ['lemon'],
  malta: ['orange'],
  mirch: ['chilli', 'chili', 'pepper'],
  mooli: ['radish'],
  matar: ['peas'],
  nashpati: ['pear'],
  nimbu: ['lemon'],
  palak: ['spinach'],
  pista: ['pistachio'],
  podina: ['mint'],
  pyaz: ['onion'],
  piyaz: ['onion'],
  sangtra: ['orange'],
  seb: ['apple'],
  shaljam: ['turnip'],
  shimla: ['capsicum', 'bell pepper'],
  tamatar: ['tomato'],
  tarbooz: ['watermelon'],
  tori: ['ridge gourd'],
};

const COMMON_PRODUCT_TERMS = new Set([
  ...Object.keys(PRODUCT_ALIASES),
  ...Object.values(PRODUCT_ALIASES).flat().flatMap((v) => v.split(/\s+/)),
  'apple', 'banana', 'mango', 'onion', 'tomato', 'potato', 'garlic', 'ginger',
  'carrot', 'cucumber', 'almond', 'egg', 'eggs', 'okra', 'spinach', 'cauliflower',
  'cabbage', 'capsicum', 'chilli', 'chili', 'pepper',
]);

const NON_PRODUCT_TERMS = new Set([
  'address', 'admin', 'area', 'bot', 'cart', 'chat', 'checkout', 'city', 'complaint',
  'contact', 'coupon', 'delivery', 'fee', 'fees', 'franchise', 'login', 'order', 'orders',
  'link', 'payment', 'profile', 'refund', 'restaurant', 'rider', 'service', 'slot', 'support',
  'whatsapp',
]);

const CATALOG_BROWSE_RE = /\b(menu|products?|items?|list|sabzi|sabziyan|fruits?|vegetables?|veggies|konsi|kaunsi)\b/i;
type ProductAnswerMode = 'none' | 'needs_city' | 'available' | 'out_of_stock' | 'no_match' | 'empty_catalog';

function productSearchTokens(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .slice(0, 8);
}

function hasProductIntent(message: string): boolean {
  const tokens = productSearchTokens(message);
  if (PRODUCT_INTENT.test(message)) return true;
  // Only an explicit price/category word or a KNOWN product word/alias counts as
  // a product question. We do NOT guess from generic words like "hai" — that
  // wrongly treated conversational questions ("tumhara naam kya hai?", "kaise
  // ho?") as product searches. A real product the user types is still recognised
  // by a live DB match in buildContextBundle (search-first upgrade).
  return tokens.some((t) => COMMON_PRODUCT_TERMS.has(t) || Boolean(PRODUCT_ALIASES[t]));
}

interface ProductFactMeta {
  id: string;
  displayName: string;
  href: string;
  priceText: string;
  prices: number[];
  names: string[];
  terms: string[];
}

interface ContextBundle {
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

const GENERIC_LINK_LABEL_TERMS = new Set([
  'view', 'open', 'product', 'item', 'link', 'buy', 'shop', 'fresh', 'freshbazar',
  'quality', 'rate', 'price', 'qeemat', 'keemat', 'cart', 'add',
]);

function normalizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

function buildProductTerms(names: string[]): string[] {
  const terms = new Set<string>(names.flatMap(normalizeWords));
  for (const [alias, targets] of Object.entries(PRODUCT_ALIASES)) {
    const targetTerms = targets.flatMap(normalizeWords);
    if (targetTerms.some((t) => terms.has(t))) {
      normalizeWords(alias).forEach((t) => terms.add(t));
    }
  }
  return Array.from(terms);
}

// Which optional `products` columns exist depends on how many migrations have run
// (legacy → unified-quality → catalog-v2). Probe once and cache, so the catalog
// query only selects columns that actually exist and never crashes with
// "column does not exist" on an older database.
let productColsCache: Set<string> | null = null;
async function productColumns(): Promise<Set<string>> {
  if (productColsCache) return productColsCache;
  try {
    const r = await query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products'`
    );
    productColsCache = new Set<string>(r.rows.map((x: { column_name: string }) => x.column_name));
  } catch {
    productColsCache = new Set<string>();
  }
  return productColsCache;
}

/**
 * Build a compact REAL-FACTS context: active cities, the user's selected city,
 * the current page, and (for product questions) matching products with links.
 * The model is told to rely ONLY on these facts so it never invents a city,
 * price, or availability. Consumer retail price only — restaurant prices excluded.
 */
async function buildContextBundle(message: string, opts: ChatContextOpts): Promise<ContextBundle> {
  const { cityId, page } = opts;
  const lines: string[] = [
    '[REAL FACTS — use ONLY these. Never invent a city, price, or whether a product exists.]',
  ];
  const productFactsById = new Map<string, ProductFactMeta>();
  // Explicit signal: the user used a price/availability/category word (English,
  // Roman-Urdu, or Urdu). A lone product NAME (e.g. "بھنڈی"/"bhindi") has no such
  // word — for those we let a real DB match upgrade the message to a product
  // answer below, exactly like the website search bar.
  const explicitProductIntent = hasProductIntent(message);
  let productIntent = explicitProductIntent;
  let answerMode: ProductAnswerMode = 'none';
  let browse = false;
  // Product-name candidate tokens (drop fillers AND support words like "order").
  const queryTokens = productSearchTokens(message).filter((t) => !NON_PRODUCT_TERMS.has(t));

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

  // City-specific WhatsApp order link, so the bot can offer "order on WhatsApp"
  // when asked if it can take/note an order. Only the selected city's link.
  if (cityId) {
    try {
      const wa = await fetchWhatsAppOrderSettings(cityId);
      const link = whatsappOrderLink(wa[WHATSAPP_ORDER_URL_KEY] || '');
      if (link) {
        lines.push(
          `WHATSAPP ORDER: To place an order on WhatsApp for ${cityName || 'this city'}, share ONLY this link: ${link}`
        );
      }
    } catch {
      /* ignore */
    }
  }

  // Current page/screen the user is on.
  if (page) lines.push(`The user is currently on this page: ${page}.`);

  // Product lookup — only for product-related questions, and ONLY for the user's
  // selected city (never across cities). We surface, per product, only the
  // QUALITIES that are actually buyable today (enabled + on-hand stock), each
  // with its today's rate — mirroring exactly what the storefront sells.
  type Prod = {
    id: string;
    name_en: string;
    name_ur: string | null;
    unit_type: string | null;
    price: number | null;
    price_b: number | null;
    price_c: number | null;
    stock_quantity: number | null;
    stock_quantity_b: number | null;
    stock_quantity_c: number | null;
    reserved_quantity: number | null;
    reserved_quantity_b: number | null;
    reserved_quantity_c: number | null;
    consumer_enabled_a: boolean | null;
    consumer_enabled_b: boolean | null;
    consumer_enabled_c: boolean | null;
    half_kg_price: number | null;
    quarter_kg_price: number | null;
    half_dozen_price: number | null;
    half_kg_price_b: number | null;
    quarter_kg_price_b: number | null;
    half_dozen_price_b: number | null;
    half_kg_price_c: number | null;
    quarter_kg_price_c: number | null;
    half_dozen_price_c: number | null;
    allow_half_kg: boolean | null;
    allow_quarter_kg: boolean | null;
  };

  // Attempt a catalog lookup when the user used an explicit product/price word
  // OR simply typed a noun that could be a product name (a real DB match then
  // upgrades the message to a product answer — just like the website search).
  const wantsLookup = explicitProductIntent || queryTokens.length > 0;
  if (wantsLookup) {
    if (!cityId) {
      // Only ask for a city when the user CLEARLY asked about a product/price.
      if (explicitProductIntent) {
        lines.push(
          'The user asked about a product/price but has NOT selected a city. Do NOT quote any product or price — politely ask them to choose their city first (tap the city/location button).'
        );
        answerMode = 'needs_city';
        productIntent = true;
      }
    } else {
      const cols = await productColumns();
      const wanted = [
        'id', 'name_en', 'name_ur', 'unit_type', 'price', 'price_b', 'price_c',
        'stock_quantity', 'stock_quantity_b', 'stock_quantity_c',
        'reserved_quantity', 'reserved_quantity_b', 'reserved_quantity_c',
        'consumer_enabled_a', 'consumer_enabled_b', 'consumer_enabled_c',
        'half_kg_price', 'quarter_kg_price', 'half_dozen_price',
        'half_kg_price_b', 'quarter_kg_price_b', 'half_dozen_price_b',
        'half_kg_price_c', 'quarter_kg_price_c', 'half_dozen_price_c',
        'allow_half_kg', 'allow_quarter_kg',
      ];
      const selectCols = wanted.filter((c) => cols.has(c)).join(', ') || 'id, name_en, price, unit_type';
      const hasEnableFlags = cols.has('consumer_enabled_a');
      const hasFeatured = cols.has('is_featured');
      const orderBy = hasFeatured ? 'is_featured DESC, name_en ASC' : 'name_en ASC';
      const nameUrClause = cols.has('name_ur') ? ' OR name_ur ILIKE ANY($1)' : '';
      const tagClause = cols.has('tags')
        ? ` OR EXISTS (SELECT 1 FROM unnest(COALESCE(tags, ARRAY[]::text[])) tg WHERE tg ILIKE ANY($1))`
        : '';

      const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
      // A quality is buyable when its enable-flag is on (or absent on older DBs)
      // AND on-hand (stock - reserved) > 0 — same rule as the consumer storefront.
      const availableTiers = (p: Prod): Array<{ q: 'A' | 'B' | 'C'; price: number }> => {
        const t: Array<{ q: 'A' | 'B' | 'C'; price: number }> = [];
        if (
          (hasEnableFlags ? p.consumer_enabled_a !== false : true) &&
          p.price != null &&
          num(p.stock_quantity) - num(p.reserved_quantity) > 0
        )
          t.push({ q: 'A', price: Number(p.price) });
        if (
          (hasEnableFlags ? p.consumer_enabled_b !== false : true) &&
          p.price_b != null &&
          num(p.stock_quantity_b) - num(p.reserved_quantity_b) > 0
        )
          t.push({ q: 'B', price: Number(p.price_b) });
        if (
          (hasEnableFlags ? p.consumer_enabled_c !== false : true) &&
          p.price_c != null &&
          num(p.stock_quantity_c) - num(p.reserved_quantity_c) > 0
        )
          t.push({ q: 'C', price: Number(p.price_c) });
        return t;
      };
      const priceNum = (v: unknown): number | null => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : null;
      };
      const roundMoney = (n: number): number => Math.round(n * 100) / 100;
      const fmtPrice = (n: number): string => {
        const rounded = roundMoney(n);
        return Number.isInteger(rounded)
          ? String(Math.round(rounded))
          : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      };
      const explicitFraction = (p: Prod, q: 'A' | 'B' | 'C', unit: 'half_kg' | 'quarter_kg' | 'half_dozen'): number | null => {
        const suffix = unit === 'half_kg' ? 'half_kg' : unit === 'quarter_kg' ? 'quarter_kg' : 'half_dozen';
        const key = q === 'A' ? `${suffix}_price` : `${suffix}_price_${q.toLowerCase()}`;
        return priceNum((p as any)[key]);
      };
      const unitOptions = (p: Prod, q: 'A' | 'B' | 'C', base: number): Array<{ label: string; price: number }> => {
        const unit = String(p.unit_type || '').toLowerCase();
        if (unit === 'kg' || unit === 'gram') {
          const opts: Array<{ label: string; price: number }> = [{ label: '1 kg', price: base }];
          if (p.allow_half_kg !== false) {
            opts.push({ label: 'half kg', price: explicitFraction(p, q, 'half_kg') ?? base * 0.5 });
          }
          if (p.allow_quarter_kg !== false) {
            opts.push({ label: 'quarter kg', price: explicitFraction(p, q, 'quarter_kg') ?? base * 0.25 });
          }
          return opts;
        }
        if (unit === 'dozen') {
          return [
            { label: 'dozen', price: base },
            { label: 'half dozen', price: explicitFraction(p, q, 'half_dozen') ?? base * 0.5 },
          ];
        }
        return [{ label: unit ? `1 ${unit}` : '1 unit', price: base }];
      };
      // Returns a fact line for in-stock products only; null when nothing is buyable.
      const fmtProduct = (p: Prod): string | null => {
        const tiers = availableTiers(p);
        if (!tiers.length) return null;
        const nm = p.name_ur ? `${p.name_en} / ${p.name_ur}` : p.name_en;
        const names = [p.name_en, p.name_ur].filter((x): x is string => Boolean(x));
        const factPrices: number[] = [];
        const priceStr = tiers
          .map((t) => {
            const opts = unitOptions(p, t.q, t.price);
            factPrices.push(...opts.map((o) => roundMoney(o.price)));
            return `Quality ${t.q}: ${opts.map((o) => `${o.label} Rs.${fmtPrice(o.price)}`).join(', ')}`;
          })
          .join('; ');
        productFactsById.set(p.id, {
          id: p.id,
          displayName: nm,
          href: `/product/${p.id}`,
          priceText: priceStr,
          prices: factPrices,
          names,
          terms: buildProductTerms(names),
        });
        return `- [${nm}](/product/${p.id}): ${priceStr}`;
      };
      const fmtAvail = (list: Prod[]) =>
        list.map(fmtProduct).filter((x): x is string => x !== null);

      // Search tokens = the product-name candidates + their Roman-Urdu aliases.
      const baseTokens = queryTokens;
      const tokens = Array.from(
        new Set(baseTokens.flatMap((t) => [t, ...(PRODUCT_ALIASES[t] || [])]))
      ).slice(0, 16);

      let rows: Prod[] = [];
      if (tokens.length) {
        const patterns = tokens.map((t) => `%${t}%`);
        try {
          const r = await query(
            `SELECT ${selectCols}
               FROM products
              WHERE is_active = true AND city_id = $2
                AND (name_en ILIKE ANY($1)${nameUrClause}${tagClause})
              ORDER BY ${orderBy}
              LIMIT 12`,
            [patterns, cityId]
          );
          rows = r.rows as Prod[];
        } catch (err) {
          if (!isMissingTable(err)) logger.warn('AI catalog lookup failed', { error: (err as Error)?.message });
        }
      }

      const listed = fmtAvail(rows);
      if (listed.length) {
        // A real match (by name OR search-keyword/tag) → answer as a product
        // question even if no explicit "rate" word was used.
        lines.push(
          `Matching products in ${cityName || 'the selected city'} (today's in-stock qualities & rates — quote ONLY these):`
        );
        lines.push(...listed);
        answerMode = 'available';
        productIntent = true;
      } else if (rows.length) {
        lines.push(
          `The requested product exists in ${cityName || 'the selected city'} but has no enabled in-stock consumer quality right now. Tell the user it is not in stock/available today. Do NOT quote a rate or create a product link.`
        );
        answerMode = 'out_of_stock';
        productIntent = true;
      } else if (explicitProductIntent && CATALOG_BROWSE_RE.test(message)) {
        // Generic browse/menu question: show the in-stock catalog.
        browse = true;
        productIntent = true;
        let catalog: Prod[] = [];
        try {
          const r = await query(
            `SELECT ${selectCols}
               FROM products
              WHERE is_active = true AND city_id = $1
              ORDER BY ${orderBy}
              LIMIT 80`,
            [cityId]
          );
          catalog = r.rows as Prod[];
        } catch (err) {
          if (!isMissingTable(err)) logger.warn('AI catalog list failed', { error: (err as Error)?.message });
        }
        const catList = fmtAvail(catalog);
        if (catList.length) {
          lines.push(
            `No exact keyword match. Below is ${cityName || 'this city'}'s in-stock product list (today's qualities & rates). Find the CLOSEST product the user means (English name, Urdu name, Roman-Urdu transliteration, synonym or partial word; e.g. "badam" → Almond/بادام گری, "gobi" → Cauliflower, "tamatar" → Tomato) and share its link + rate. Say "not available" only if truly nothing relates:`
          );
          lines.push(
            'STRICT MATCH RULE: do not recommend a different item just because it is available. If the requested product is not clearly present in the list below, say it is not available. Never create a product link or rate yourself.'
          );
          lines.push(...catList);
          answerMode = 'available';
        } else {
          lines.push(
            `No products are in stock in ${cityName || 'the selected city'} right now — tell the user honestly and do NOT make up a price.`
          );
          answerMode = 'empty_catalog';
        }
      } else if (explicitProductIntent && tokens.length) {
        // A product WAS named but matched nothing (name or search-keywords) →
        // it simply isn't on FreshBazar. Say so honestly (no substitute).
        lines.push(
          `No matching product was found in ${cityName || 'the selected city'} for the user's words (${baseTokens.join(', ')}). Tell the user it is not available on FreshBazar right now. Do NOT quote a rate, do NOT create a product link, and do NOT offer an unrelated substitute.`
        );
        answerMode = 'no_match';
        productIntent = true;
      } else if (explicitProductIntent) {
        // Price/rate word but no product named yet → ask which product.
        lines.push('The user asked about price/rate but did not name a product. Politely ask which product they want.');
        answerMode = 'none';
        productIntent = true;
      } else {
        // A noun was typed but matched no product and no explicit product/price
        // word was used → uncertain. Hand it to the assistant, which still
        // cannot fabricate a link or rate (validateAiReply enforces that).
        productIntent = false;
      }
    }
  }

  return {
    text: lines.join('\n'),
    productIntent,
    selectedCity: Boolean(cityId),
    answerMode,
    productFacts: Array.from(productFactsById.values()),
    queryTokens,
    browse,
  };
}

export async function buildContext(message: string, opts: ChatContextOpts): Promise<string> {
  return (await buildContextBundle(message, opts)).text;
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

const PRODUCT_LINK_ID_RE = /\/product\/([A-Za-z0-9_-]+)/g;
const MARKDOWN_PRODUCT_LINK_RE = /\[([^\]]{1,140})\]\(([^)]*\/product\/([A-Za-z0-9_-]+)[^)]*)\)/g;
const URL_SPAN_RE = /(https?:\/\/[^\s)]+|\/product\/[A-Za-z0-9_-]+)/g;
const PRICE_CONTEXT_RE = /\b(quality|rate|price|qeemat|keemat|kg|kilo|dozen|rs\.?|pkr|rupees?|rupay|rupiya|per)\b|روپے|₨/i;

interface ProductLinkHit {
  id: string;
  index: number;
}

interface AmountHit {
  value: number;
  index: number;
}

function moneyKey(n: number): string {
  return String(Math.round(n * 100));
}

function safeProductFallback(bundle: ContextBundle): string {
  if (bundle.answerMode === 'needs_city' || !bundle.selectedCity) {
    return 'Rate to main abhi bata deta hoon — bas pehle apni city chun lijiye (upar city/location button se). Phir jo cheez chahiye uska naam likh dijiye.';
  }
  if (bundle.answerMode === 'out_of_stock') {
    return 'Ye cheez is waqt aap ki city mein stock mein nahi hai. Thori der baad ya kal dobara check kar lijiye ga, ya koi aur cheez chahiye to bata dijiye.';
  }
  if (bundle.answerMode === 'no_match') {
    return 'Ye cheez filhal FreshBazar par available nahi hai. Aap koi aur sabzi, phal ya cheez poochna chahein to main rate bata deta hoon.';
  }
  if (bundle.answerMode === 'empty_catalog') {
    return 'Is waqt aap ki city ki product list load nahi ho rahi. Thori der baad dobara koshish kar lijiye ga.';
  }
  return 'Is cheez ka rate mujhe abhi pakka nahi mil raha. Naam thora alag tareeqe se likh ke dekhiye, ya app/website ke Products section mein search kar lijiye — main madad ke liye yahin hoon.';
}

/** Did one of the user's typed words actually hit this product's NAME (not just a tag)? */
function factNameHit(token: string, fact: ProductFactMeta): boolean {
  if (!token) return false;
  return fact.terms.some((term) => term === token || term.includes(token) || token.includes(term));
}

function deterministicProductReply(bundle: ContextBundle): string | null {
  if (!bundle.productIntent) return null;
  if (bundle.answerMode === 'none') {
    return 'Zaroor! Kis product ka rate chahiye? Bas naam likh dijiye, main abhi aap ki city ke hisaab se rate bata deta hoon.';
  }
  if (bundle.answerMode !== 'available' || !bundle.productFacts.length) {
    return safeProductFallback(bundle);
  }

  const visibleFacts = bundle.productFacts.slice(0, 6);
  // If the user's exact word didn't hit any product NAME (match came via a
  // search-keyword/tag, or it's a close item), present these as suggestions
  // rather than as the exact item the user asked for.
  const nameMatched =
    !bundle.queryTokens.length ||
    visibleFacts.some((fact) => bundle.queryTokens.some((t) => factNameHit(t, fact)));

  const lines: string[] = [];
  if (!bundle.browse && !nameMatched) {
    lines.push(
      'Aap ne jis naam se poocha bilkul usi naam se to nahi mila, lekin ye milti-julti cheezein abhi available hain:'
    );
  }
  lines.push(...visibleFacts.map((fact) => `[${fact.displayName}](${fact.href})\n${fact.priceText}`));
  if (bundle.productFacts.length > visibleFacts.length) {
    lines.push('Aur bhi options hain — app/website ke Products section mein dekh sakte hain.');
  }
  lines.push(
    'Jo pasand aaye uska link kholiye, quality (A/B/C) aur wazan chun ke cart mein daal dijiye. Aur kisi cheez mein madad chahiye to bata dijiye.'
  );
  return lines.join('\n\n');
}

function labelMatchesProduct(label: string, fact: ProductFactMeta): boolean {
  const labelTerms = normalizeWords(label)
    .filter((t) => !GENERIC_LINK_LABEL_TERMS.has(t) && !STOPWORDS.has(t));
  if (!labelTerms.length) return true;
  const factTerms = new Set(fact.terms);
  return labelTerms.some((t) => factTerms.has(t));
}

function unavailableReplyLooksSafe(reply: string, mode: ProductAnswerMode): boolean {
  const text = reply.toLowerCase();
  if (mode === 'needs_city') return /\b(city|location|select|choose|shehar)\b/.test(text);
  return (
    /not\s+(available|in stock|found)/.test(text) ||
    /out\s+of\s+stock/.test(text) ||
    /\b(nahi|nahin|unavailable)\b/.test(text) ||
    /نہیں|ختم/.test(reply) ||
    /\b(stock|catalog)\b/.test(text)
  );
}

function collectUrlSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  URL_SPAN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_SPAN_RE.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

function inSpan(index: number, spans: Array<{ start: number; end: number }>): boolean {
  return spans.some((s) => index >= s.start && index < s.end);
}

function parseAmount(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function extractAmountHits(text: string, loose: boolean): AmountHit[] {
  const spans = collectUrlSpans(text);
  const out: AmountHit[] = [];
  const seen = new Set<string>();
  const add = (raw: string, index: number, explicit: boolean) => {
    if (inSpan(index, spans)) return;
    const value = parseAmount(raw);
    if (value == null) return;
    if (!explicit && value < 10) return;
    const key = `${index}:${moneyKey(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value, index });
  };

  const patterns: Array<{ re: RegExp; group: number; explicit: boolean }> = [
    { re: /\b(?:rs\.?|pkr|rupees?|rupay|rupiya|₨)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/gi, group: 1, explicit: true },
    { re: /روپے\s*([0-9][0-9,]*(?:\.[0-9]+)?)/g, group: 1, explicit: true },
    { re: /\b([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:rs\.?|pkr|rupees?|rupay|rupiya|₨)\b/gi, group: 1, explicit: true },
    { re: /([0-9][0-9,]*(?:\.[0-9]+)?)\s*روپے/g, group: 1, explicit: true },
    { re: /\b([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:\/\s*(?:kg|kilo|dozen|unit|piece|pcs?)|per\s+(?:kg|kilo|dozen|unit|piece|pcs?))\b/gi, group: 1, explicit: true },
  ];

  for (const { re, group, explicit } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[group];
      add(raw, m.index + m[0].indexOf(raw), explicit);
    }
  }

  // The loose generic-number sweep only runs for product questions. On the
  // no-intent path it would flag phone numbers / timings, so we keep only the
  // explicit money patterns above (Rs X, X/kg, X روپے) which are unambiguously
  // prices and must still be verified.
  if (loose && PRICE_CONTEXT_RE.test(text)) {
    const generic = /\b([0-9][0-9,]*(?:\.[0-9]+)?)\b/g;
    let m: RegExpExecArray | null;
    while ((m = generic.exec(text)) !== null) {
      add(m[1], m.index, false);
    }
  }

  return out;
}

function lineBounds(text: string, index: number): { start: number; end: number } {
  const start = text.lastIndexOf('\n', index) + 1;
  const next = text.indexOf('\n', index);
  return { start, end: next === -1 ? text.length : next };
}

function productLinksInRange(links: ProductLinkHit[], start: number, end: number): string[] {
  return links.filter((l) => l.index >= start && l.index < end).map((l) => l.id);
}

function previousNonEmptyLineBounds(text: string, start: number): { start: number; end: number } | null {
  let end = start - 1;
  while (end >= 0 && /\s/.test(text[end])) end--;
  if (end < 0) return null;
  const prevStart = text.lastIndexOf('\n', end) + 1;
  return { start: prevStart, end: end + 1 };
}

function validateAiReply(reply: string, bundle: ContextBundle): string {
  // Validation keys off the REPLY content, NOT the question's intent. Even when
  // intent detection missed (so no facts were injected), the model must never
  // emit a /product/ link or product price we did not verify — otherwise it
  // fabricates an ID/rate. With no verified facts, ANY product link/price is
  // unverified and gets blocked.
  if (!reply) return reply;

  const factById = new Map(bundle.productFacts.map((f) => [f.id, f]));
  const allowedIds = new Set(bundle.productFacts.map((f) => f.id));
  const allowedPrices = new Set(bundle.productFacts.flatMap((f) => f.prices.map(moneyKey)));

  MARKDOWN_PRODUCT_LINK_RE.lastIndex = 0;
  let markdownMatch: RegExpExecArray | null;
  while ((markdownMatch = MARKDOWN_PRODUCT_LINK_RE.exec(reply)) !== null) {
    const label = markdownMatch[1];
    const id = markdownMatch[3];
    const fact = factById.get(id);
    if (!fact) {
      logger.warn('AI chat reply blocked invalid markdown product link', { productId: id });
      return safeProductFallback(bundle);
    }
    if (!labelMatchesProduct(label, fact)) {
      logger.warn('AI chat reply blocked mismatched product link label', { productId: id, label });
      return safeProductFallback(bundle);
    }
  }

  PRODUCT_LINK_ID_RE.lastIndex = 0;
  let linkMatch: RegExpExecArray | null;
  let sawValidProductLink = false;
  const productLinks: ProductLinkHit[] = [];
  while ((linkMatch = PRODUCT_LINK_ID_RE.exec(reply)) !== null) {
    if (!allowedIds.has(linkMatch[1])) {
      logger.warn('AI chat reply blocked invalid product link', { productId: linkMatch[1] });
      return safeProductFallback(bundle);
    }
    sawValidProductLink = true;
    productLinks.push({ id: linkMatch[1], index: linkMatch.index });
  }

  const amounts = extractAmountHits(reply, bundle.productIntent);
  for (const hit of amounts) {
    const line = lineBounds(reply, hit.index);
    let contextIds = productLinksInRange(productLinks, line.start, line.end);
    if (!contextIds.length) {
      const prev = previousNonEmptyLineBounds(reply, line.start);
      if (prev) contextIds = productLinksInRange(productLinks, prev.start, prev.end);
    }
    const priceSet = contextIds.length
      ? new Set(contextIds.flatMap((id) => factById.get(id)?.prices.map(moneyKey) || []))
      : allowedPrices;
    if (!priceSet.has(moneyKey(hit.value))) {
      logger.warn('AI chat reply blocked invalid product price', { amount: hit.value, contextIds });
      return safeProductFallback(bundle);
    }
  }
  if (amounts.length && !sawValidProductLink) {
    logger.warn('AI chat reply blocked product price without verified link');
    return safeProductFallback(bundle);
  }
  if (!bundle.productFacts.length && ['needs_city', 'out_of_stock', 'no_match', 'empty_catalog'].includes(bundle.answerMode)) {
    if (!unavailableReplyLooksSafe(reply, bundle.answerMode)) {
      logger.warn('AI chat reply blocked unsafe no-facts answer', { answerMode: bundle.answerMode });
      return safeProductFallback(bundle);
    }
  }

  return reply;
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
  const contextBundle = await buildContextBundle(lastUser, opts);
  const deterministicReply = deterministicProductReply(contextBundle);
  if (deterministicReply) return deterministicReply;
  const context = contextBundle.text;
  const agentLine = `AGENT: Your name is ${pickAgentName()}. If asked who/what you are, give this name and say you're from the FreshBazar customer-care team; do NOT confirm or deny being an AI and do not mention AI/bot/robot at all.`;
  const systemPrompt = [SYSTEM_PROMPT, agentLine, context].filter(Boolean).join('\n\n');
  const safeReply = (s: unknown) => validateAiReply(String(s || '').trim(), contextBundle);

  try {
    if (family === 'anthropic') {
      const data = await postJson(
        'https://api.anthropic.com/v1/messages',
        { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
        { model, max_tokens: MAX_TOKENS, system: systemPrompt, messages: convo }
      );
      return safeReply(data?.content?.[0]?.text);
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
      return safeReply(data?.candidates?.[0]?.content?.parts?.[0]?.text);
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
    return safeReply(data?.choices?.[0]?.message?.content);
  } catch (err: any) {
    logger.warn('AI chat generation failed', { provider, message: err?.message });
    throw err;
  }
}
