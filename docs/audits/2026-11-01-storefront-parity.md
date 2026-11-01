# Storefront parity audit — customer app vs website (2026-11-01)

> **Khulasa (Roman Urdu):** Customer app ka home page, categories, category pages, filters aur
> search asli app (Expo web build, iPhone 13 screen) aur website (mobile view, 390px) dono par
> chala kar dekhe gaye — sirf code se andaza nahi lagaya. Home par Featured Products ke baad
> "Shop by Category" app aur website dono par aata hai aur categories **asli database** se aati
> hain (admin se nayi category "QA Bakery" banayi aur "Snacks" ka naam badla — dono foran app aur
> website par nazar aaye). Jo masail mile (nakli phone number, nakli WhatsApp number, khaali grey
> tiles, 100 se zyada products par list kat jana, filter race, duplicate/dead code, seed ka nakli
> data) sab theek kiye gaye aur dobara asli app + website mein verify kiye gaye.

## How it was checked
- **Customer app:** the real app exported for web (`expo export --platform web`) against the local
  API and driven with Playwright on an iPhone 13 viewport (pick city → home → category tile →
  Shop → filters → search → Help/Contact). Native-only modules (maps, Android widget) were stubbed
  for the web test build only; those stubs and the web deps were never committed.
- **Website:** `next build` + `next start`, same flows at 390 px.
- **Data:** a new category and a renamed category created through the admin API to prove both
  storefronts read the live DB (no hard-coded list).
- **API:** every filter param checked against the backend (`minPrice`, `maxPrice`, `inStock`,
  `sortBy`/`sortOrder`, paging).

## Verified as already correct
| Item | Result |
|---|---|
| App home order | Featured Products → **Shop by Category** → hero → delivery info (same as website mobile) |
| Categories real? | Yes — `GET /categories?city_id=…` (react-query, keyed on city), same cache as the drawer |
| Category page | Real products for that category (`GET /products?category=…`) |
| Filters | Price / in-stock / sort reach the backend and really filter (min 200 → 3 of 6, min 1000 → Almonds only) |
| Website | Filters, category pages, search all real; no horizontal overflow at 390 px |

## Found → fixed
| # | Where | What was wrong | Fix |
|---|---|---|---|
| S1 | customer app | Category tiles, drawer chips, product cards and the product gallery showed a **blank grey box** when an image URL was dead (seed URLs, wiped uploads). Website showed a letter / "No Image" fallback. | New `components/common/SmartImage` (mirrors website `SmartImage`): missing **or failing** image → the tile's own fallback. Image resolver also ignores `example.com` placeholders (website rule). |
| S2 | customer app | **Shop "All products" asked `limit=2000` but the API caps a page at 100** → past 100 products the rest silently disappeared. Category page asked 200 → same cap. | `productService.getAllProducts()` pages through every page (100 each, de-duplicated); category page uses it when no explicit limit. Verified: 136 products → 2 requests → "Showing 136 products". |
| S3 | customer app | Price filter: **every keystroke fired a list request** (typing 1200 → 1, 12, 120, 1200); a slower older response could overwrite the newer list. Apply and sort also fired a stale duplicate request. | Filter sheet keeps a draft and commits once on **Apply**; screens ignore any response that is not the newest (request sequence guard); stale `onApply` calls removed. Verified: 0 requests while typing. |
| S4 | customer app | **Placeholder phone `0300-1234567`** shown in the header ticker, hero chip, Help screen (call button dialled it) and Contact page; the WhatsApp drawer button fell back to it too. Hero ribbon hard-coded **"Free Delivery 10AM - 2PM"**. | Phone comes only from the admin banner setting (hidden when unset, website parity) via new `lib/useSupportContact`; ribbon shows the admin's real first free slot (hidden when none). Verified both with and without an admin phone. |
| S5 | backend | `GET /products` sorted only by the chosen column — products with the **same price/name could repeat or vanish between pages** (affects app paging and website "Load more"). | `ORDER BY <column>, p.id` tie-breaker. E2E: 150 same-price products → 150 distinct across 2 pages. |
| S6 | database | `schema.sql` seeded **5 fake products** (invented stock, live in the store) and every category with a dead `cdn.example.com` icon; migration `08b` seeded a **placeholder WhatsApp number** (`wa.me/923001234567`) globally and for every city → "WhatsApp to Order" opened a chat with a stranger. | Seed no longer creates sample products or placeholder URLs; `08b` seeds nothing. **Migration 61** clears the dead image URLs and deletes only WhatsApp rows that still hold exactly the placeholder (nothing deleted/hidden otherwise; admin-set values untouched). |
| S7 | website | `/products` and `/category/[slug]` each carried a copy of the sort map, filter bar/panel and grid + "Load more". Empty states told **shoppers** to "add products from the admin panel". | Shared `components/shop/ProductListing` (filters, query params, grid, empty state). Customer-friendly empty states ("No products match these filters" + Clear, "This category is not available" + Browse all). |
| S8 | both | Dead duplicate code that made the codebase confusing. | Removed (nothing imported them — typecheck/lint/tests/builds prove it). App: `CategoryNavigator`, `AttaNavigator`, unreachable `CategoriesListScreen` (a third category design), `CategoryCard`, `FreeDeliveryCard` (hard-coded Rs 500), `BannerCarousel`, `SectionHeader`, `AppDownloadSection`, `FloatingCityButton`, dummy `CATEGORIES` and `TIME_SLOTS` constants. Website: `ui/CategoryCard`, `providers/QueryProvider` (duplicate of `AppProviders`), `ui/LoadingSpinner`, `ui/QuantitySelector`, `sections/HowItWorksSection`. `DELIVERY` constants documented as offline fallbacks only. |

## Follow-up (owner request): "View More Products" under Featured
> **Roman Urdu:** Home par pehle 20 featured products, un ke neeche aur categories se pehle bara
> hara **"View More Products"** button. Har click par agle 20 featured products (jo pehle nahi
> dikhe) aa jate hain, yahan tak ke saare featured products dikh jayen — phir button khud gayab.
> App aur website dono par same. Categories neeche nahi dabti aur saare featured dekhne ka raasta hai.

| Part | Change |
|---|---|
| backend | `GET /products/featured/list` takes an optional `page` and returns `meta` (page, limit, total, totalPages); `data` stays a plain array, so a caller without `page` gets exactly what it got before. Order gains an `id` tie-breaker. **Before this, the endpoint stopped at 100 with no offset — the 101st featured product could never be shown anywhere.** |
| customer app | `FeaturedProductsSection` loads batches of 20 (react-query infinite query); big green full-width button with Urdu label and a "+N more" badge, spinner while loading, hidden once everything is shown; duplicates across batches dropped. `productService.getFeaturedPage()` replaces the old single call. |
| website | Same batches of 20 and the same button (full-width on mobile, wide centred on desktop); `productsApi.getFeaturedPage()` replaces `getFeatured(100)`. |
| E2E | `catalog-2026-11-01.sh` +4 checks: first batch without `page`, `meta.total` = every featured product, all batches hold each featured product exactly once, page past the end is empty. |

Verified with 48 featured products: real app (iPhone viewport) and website (390 px and 1366 px)
both go **20 → 40 → 48**, all distinct, button disappears after the last batch, "Shop by
Category" stays directly below, no horizontal overflow, no console errors.

## Deliberately unchanged
- App search filters client-side on `/products/search` results (no request race there).
- `logger.ts` and `lib/cityScope.ts` in the app are unused utilities, not duplicates or dummy data;
  left for a later cleanup.

## Owner action after deploy
1. Run `pnpm --filter @freshbazar/backend migrate:sql` (applies migration 61).
2. Admin panel → **Settings → Banner**: set the real support phone (shown in the ticker, hero,
   Help and Contact once set).
3. Admin panel → **Settings → WhatsApp**: save the real WhatsApp order link if the button should
   show (it stays hidden until a real link is saved).
4. Upload category images (until then every storefront shows a clean letter tile).

## Production readiness — latest (excluding gateways, Render free plan, OTP bypass)
| Area | 1 Nov QA report | Now | Why not 100 % |
|---|---|---|---|
| Backend API & data integrity | 92 % | 93 % | boot-time DDL (F11), public atta tracking (F12), AI-chat spend cap (F13), no load test |
| Stock & cash controls | 90 % | 90 % | needs the owner's supervision routine; no bill photo yet |
| Admin panel | 90 % | 90 % | tokens in localStorage / no 2FA for super admin (F10), a11y labels |
| Website | 91 % | 93 % | wishlist device-only, hero images hot-linked |
| Customer app | 80 % | 85 % | ran as the real app build in a phone viewport, but **still not on a real phone**; push needs FCM/APNs setup |
| Rider app | 79 % | 79 % | not on a real phone; Google background-location declaration + video; Apple 3.2 risk |
| QA / CI / Ops | 85 % | 89 % | all 5 GitHub workflows (incl. real-DB E2E) now seen green on `main`; still no load/soak test or monitoring alerts |
| **Overall (weighted)** | **≈ 88 %** | **≈ 90 %** | The last ~10 % is mostly outside the code: real-device test day for both apps, store submission paperwork, monitoring, the owner steps above (phone, WhatsApp link, category images) and the supervision routine. |

## Gates (all green)
- backend: `tsc`, eslint, **292/292** jest, build.
- website: `tsc`, `next lint`, **65/65** jest, `next build`.
- customer-app: `tsc`, eslint, **7/7** jest, `expo export --platform android`.
- monorepo: `turbo run typecheck / lint / test` (9 / 5 / 7 tasks), `pnpm audit --prod` exit 0.
- DB: fresh `schema.sql` + all **64** migrations; migration 61 idempotent on an existing DB.
- E2E (fresh DB, `docs/rider-e2e/run-all.sh`): all scripts pass, incl. new
  `catalog-2026-11-01.sh` (12/12).
