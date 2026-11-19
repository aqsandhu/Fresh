// AI chat: the facts the assistant may use (catalogue, prices, city) — moved from aiChat.service.ts (W21: only the place changed, not the behaviour).

import { fetchWhatsAppOrderSettings, WHATSAPP_ORDER_URL_KEY } from '../../utils/siteSettings';
import { query } from '../../config/database';
import { isMissingTable } from '../../utils/dbErrors';
import logger from '../../utils/logger';
import { ChatContextOpts, ProductAnswerMode, ProductFactMeta, ContextBundle, whatsappOrderLink, STOPWORDS, normalizeWords } from './shared';

const PRODUCT_INTENT =
  /price|rate|kitn|qeemat|keemat|kg|kilo|dozen|sabz|fruit|vegetable|veggie|chicken|dry.?fruit|products|items|menu|stock|قیمت|ریٹ|بھاؤ|دام|کلو|درجن|کتن|سبزی|پھل|مینو/i;

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
export async function buildContextBundle(message: string, opts: ChatContextOpts): Promise<ContextBundle> {
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
