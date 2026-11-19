// W14 (round 9): the price a customer / restaurant SEES is computed by the
// website and the customer app with their own copies of the pricing rules;
// the price they are BILLED is computed by the server. This compares all
// three over a random grid (quality A/B/C × full / half / quarter /
// half-dozen × overrides present or missing). Exit 1 on any difference.
// Run from anywhere: node docs/rider-e2e/price-parity.js  (needs no API / DB)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
process.chdir(path.join(ROOT, 'backend')); // use the backend's TypeScript setup
require(path.join(ROOT, 'backend', 'node_modules', 'ts-node')).register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs' },
});
const server = require(path.join(ROOT, 'backend/src/utils/unitPricing.ts'));
const site = require(path.join(ROOT, 'website/lib/unitPricing.ts'));
const siteRest = require(path.join(ROOT, 'website/lib/restaurantPricing.ts'));
const app = require(path.join(ROOT, 'customer-app/src/lib/unitPricing.ts'));

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const maybe = (v, p = 0.4) => (rnd() < p ? null : v);
const differs = (a, b) => !((a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.005));

const bad = [];
let checked = 0;
for (let i = 0; i < 3000; i++) {
  const unit = pick(['kg', 'kg', 'dozen', 'piece']);
  const raw = {
    price: pick([100, 250, '180.50', 99]), price_b: maybe(pick([80, '75.25'])), price_c: maybe(pick([50, 40])),
    half_kg_price: maybe(48), quarter_kg_price: maybe(26), half_dozen_price: maybe(55),
    half_kg_price_b: maybe(39), quarter_kg_price_b: maybe(21), half_dozen_price_b: maybe(44),
    half_kg_price_c: maybe(19), quarter_kg_price_c: maybe(11), half_dozen_price_c: maybe(22),
    restaurant_price_a: maybe(90), restaurant_price_b: maybe(70), restaurant_price_c: maybe(35),
    restaurant_half_kg_price_a: maybe(47), restaurant_quarter_kg_price_a: maybe(25), restaurant_half_dozen_price_a: maybe(54),
    restaurant_half_kg_price_b: maybe(38), restaurant_quarter_kg_price_b: maybe(20), restaurant_half_dozen_price_b: maybe(43),
    restaurant_half_kg_price_c: maybe(18), restaurant_quarter_kg_price_c: maybe(10), restaurant_half_dozen_price_c: maybe(21),
    consumer_enabled_a: true, consumer_enabled_b: true, consumer_enabled_c: true,
    restaurant_enabled_a: pick([true, null]), restaurant_enabled_b: pick([true, null]), restaurant_enabled_c: pick([true, null]),
    allow_half_kg: pick([true, false]), allow_quarter_kg: pick([true, false]),
  };
  const num = (v) => (v == null ? undefined : Number(v));
  const mapped = {
    price: Number(raw.price), priceB: num(raw.price_b), priceC: num(raw.price_c),
    halfKgPrice: num(raw.half_kg_price), quarterKgPrice: num(raw.quarter_kg_price), halfDozenPrice: num(raw.half_dozen_price),
    halfKgPriceB: num(raw.half_kg_price_b), quarterKgPriceB: num(raw.quarter_kg_price_b), halfDozenPriceB: num(raw.half_dozen_price_b),
    halfKgPriceC: num(raw.half_kg_price_c), quarterKgPriceC: num(raw.quarter_kg_price_c), halfDozenPriceC: num(raw.half_dozen_price_c),
    allowHalfKg: raw.allow_half_kg, allowQuarterKg: raw.allow_quarter_kg, unit,
    stock: 50, stockQuantity: 50, stockQuantityB: 50, stockQuantityC: 50,
  };
  for (const q of ['A', 'B', 'C']) {
    for (const [name, lib] of [['website', site], ['customer app', app]]) {
      for (const u of lib.getUnitOptions(mapped, q).map((o) => o.unit)) {
        checked++;
        const s = server.resolveConsumerUnitPrice(raw, q, u);
        const c = lib.priceForUnit(mapped, u, q);
        if (s == null || differs(s, c)) bad.push(`${name} consumer ${q}/${u}: server ${s} vs shown ${c}`);
      }
    }
    for (const u of ['full', 'half_kg', 'quarter_kg', 'half_dozen']) {
      checked++;
      const s = server.resolveRestaurantUnitPrice(raw, q, u);
      const c = siteRest.unitPrice(raw, q, u);
      if (differs(s, c)) bad.push(`website restaurant ${q}/${u}: server ${s} vs shown ${c}`);
    }
  }
}
// The PIN rule (B33) also lives in three places: server, app, website.
const pinServer = require(path.join(ROOT, 'backend/src/utils/pinStrength.ts'));
const pinApp = require(path.join(ROOT, 'customer-app/src/lib/pinStrength.ts'));
const pinSite = require(path.join(ROOT, 'website/lib/pinStrength.ts'));
for (let n = 0; n < 10000; n++) {
  const pin = String(n).padStart(4, '0');
  const v = pinServer.isWeakPin(pin);
  checked++;
  if (pinApp.isWeakPin(pin) !== v || pinSite.isWeakPin(pin) !== v) bad.push(`PIN rule differs for ${pin}`);
}
console.log(`price + PIN rule parity: ${checked} combinations, ${bad.length} different`);
bad.slice(0, 10).forEach((b) => console.log('  ✗ ' + b));
process.exit(bad.length ? 1 : 0);
