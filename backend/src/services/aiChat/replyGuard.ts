// AI chat: checks on the assistant's reply (links, prices, availability) — moved from aiChat.service.ts (W21: only the place changed, not the behaviour).

import logger from '../../utils/logger';
import { ProductAnswerMode, ProductFactMeta, ContextBundle, STOPWORDS, GENERIC_LINK_LABEL_TERMS, normalizeWords } from './shared';

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

export function deterministicProductReply(bundle: ContextBundle): string | null {
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

export function validateAiReply(reply: string, bundle: ContextBundle): string {
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
