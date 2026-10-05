# Fresh Bazar — Production-Grade Log (all apps)

> **Purpose:** single tracker for taking the whole platform (backend, website, customer app,
> admin panel; the rider app has its own log at `rider-app/REBUILD_LOG.md`) to production grade.
> Records WHAT is wrong, WHY it matters, HOW it is fixed, what is DONE and what REMAINS, so any
> agent or person can resume without re-deriving anything. **Update before every commit.**
>
> **Khulasa (Roman Urdu):** Ye poore project ka production-grade tracker hai. Har app ke masail,
> wajah, hal, status aur baqi kaam yahan darj hain. Session toot jaye to yahin se resume karein.

Branch: `feat/production-grade` (from `main` @ `f1c49d2`). Remote: https://github.com/aqsandhu/Fresh.git

## 0. How to resume
1. `git checkout feat/production-grade && git pull`
2. Read §1 (status) → first non-DONE item → its §4 plan entry → latest §5 work-log entry.
3. Baseline gates (run each inside its own `( cd <dir> && … )` subshell — parallel shells share cwd):
   ```bash
   ( cd backend      && pnpm typecheck && pnpm lint && npx jest --coverage=false src/__tests__ )
   ( cd website      && pnpm typecheck && pnpm lint && pnpm test && pnpm build )
   ( cd customer-app && pnpm typecheck && pnpm lint && pnpm test )
   ( cd admin-panel  && pnpm typecheck && pnpm lint && pnpm test && pnpm build )
   ( cd rider-app    && pnpm typecheck && pnpm lint && pnpm test )
   ```
4. Continue, update §1/§5, commit (`fix(<app>): …`), push.

## Explicitly ignored (by owner's instruction)
- OTP bypass / fixed OTP code (`backend/src/config/otpBypass.ts`).
- Render free-tier limits (cold starts, sleeping dyno).
- Payment methods other than cash on delivery (card / Easypaisa / JazzCash / bank transfer webhooks).
These are not counted in ratings and are not worked on.

## 1. Status snapshot
Legend: TODO · WIP · DONE · DEFERRED

| # | Area | Item | Status | Notes |
|---|---|---|---|---|
| 0.1 | all | Log + baseline gates recorded | DONE | §2 |
| 0.2 | all | Audits: website core ✅, website static ✅, admin 12 pages ✅; **customer-app, admin main, backend agents died on session limit** | PARTIAL | findings in `docs/audits/2026-10-05-findings.md`; re-run the 3 dead sweeps (§4 step 9) |
| 0.3 | ci | admin build needed `VITE_API_URL` → CI red | DONE | `.github/workflows/ci.yml` |
| 1.1 | customer-app | Home "Shop by Category" wall after Featured Products | DONE | wall now react-query keyed on city (old retry loop gave up after ~3 s); Home featured strip capped at 20 so the wall is reachable on a 2-col grid |
| 1.2 | admin-panel | typecheck TS2786 | DONE (env) | vanished after full install; not a repo defect |
| 1.3 | website | Header/Footer suites | DONE (env) | pass after full install |
| 1.4 | customer-app | 10 react-hooks lint warnings | DONE | 0 warnings |
| 2.1 | backend+website | W-H1 set-pin revokes fresh session | DONE | backend skips revoke on first set |
| 2.2 | website | W-H2 wrong OTP strands register | DONE | back to OTP step on 401 |
| 2.3 | website | W-H3 restaurant 401 → customer logout | DONE | portal login/register treated as auth endpoints |
| 2.4 | website | W-H4/WS-M5 unsplash images | DONE | remotePatterns |
| 2.5 | website+backend | WS-H1 products cap 100 → load-more | DONE | `useInfiniteQuery`, 48/page; category loading flash (WS-L13) fixed too |
| 2.6 | website | WS-H2/WS-M3 placeholder phone | DONE | `useSupportContact`; Header/Footer/Hero/contact/help/returns/shipping/privacy/terms |
| 2.7 | website+backend | W-M1/M2/L3 orders paging + quality + urgent | DONE (M1, M2) · L3 urgent label TODO | `ordersApi.getPage`, 20/page |
| 2.8 | website+customer-app | W-M3 B/C fraction prices | DONE | `fractionOverride` in both unitPricing modules |
| 2.9 | website | W-M4/M5/L7/L8 atta flow | DONE | phone in instructions, `/atta-chakki/requests`, live charges (`GET /atta-requests/charges`), city-filtered addresses |
| 2.10 | website | W-M6 chat:error | DONE | |
| 2.11 | website+backend | W-M7 address pin removal | DONE | nulls clear location |
| 2.12 | website | W-M8/M9/M10/L12 restaurant portal | DONE (M8, M9, M10) · L12 polish TODO | flags + explicit fraction prices; portal 401/403 → login |
| 2.13 | website | W-M11 hasHydrated gating | DONE | orders/profile/addresses/settings-pin |
| 2.14 | website+backend | W-M12 cancel refunded | DONE | both sides |
| 2.15 | website | W-M13 settings toggles | DONE | real `notification_enabled` + `preferred_language`; dead rows removed |
| 2.16 | website | W-M14/L13 OCP/shareholder session handling | DONE (M14) · L13 polish TODO | `handlePortalAuthFailure` |
| 2.17 | website | WS-M4 ribbon ✅, WS-M6 app section ✅, WS-M7 search cap ✅, WS-M8/M9 footer ✅, WS-M11 dead links ✅, WS-M10 copy ✅, WS-M12 wishlist label ✅, WS-L14..L21 ✅ (breadcrumb, share fallback, featured 100, franchise city, socket logs, setCity stays on page; "basket image host"/"stale comment" not reproducible from the summary row), W-L: profile email clear ✅, hard-coded Gujrat (products header, AddressForm/addresses fallbacks, backend address default) ✅ | DONE | remaining W-L phrases without file:line (cancelled timeline, date formatting, dead address badges, cart CTA, restaurant phone/front image/snapshot, OCP modal/mark-collected, shareholder year) were in the agent report that died; re-covered by the session-4 customer-app/admin sweeps where applicable |
| 3.1 | admin+backend | A-H1/H2/H3 camel/snake mismatches | DONE | |
| 3.2 | admin | A-M4..M10 | DONE | |
| 3.3 | admin+backend | A-L11..L14 | DONE | L11 registry ✅, L12 OCP stock modal 100 ✅, L13 coupons-used paged (backend page/limit) ✅, L14 OCP + Complaints/Reviews/RiderApplications buttons permission-gated ✅ |
| 4.2 | customer-app + admin | re-run the two dead audit sweeps | WIP | two read-only agents launched (session 4); findings → fix → log |
| 4.1 | backend | re-verify the 28 prior-audit items (agent died) | DONE | verified by reading code, not by trusting the old report. **Still open → fixed now (B-1..B-16, §5 2026-10-05 session 4).** Already fixed earlier (confirmed): cancel double-refund, markPaymentReceived reviving cancelled orders, customers/lookup address scoping, refresh limiter, cart unit whitelist, admin login requires `admins` row. Not a defect: `rider_delivery_charges` has rider+slot unique key. |

## 2. Baseline (before this work) — 2026-10-05
First run (incomplete local node_modules — NOT a repo defect, corrected below after a full `pnpm install`):
website typecheck/lint failed on unresolved `next/*`; admin typecheck showed ~490 TS2786.

Corrected baseline after full install:

| Workspace | typecheck | lint | test | build | notes |
|---|---|---|---|---|---|
| backend | ✅ | ✅ | ✅ 6 unit (integration suite: see agent report) | — | |
| website | ✅ | ✅ | ✅ 7 suites, 65 tests | ✅ compiled, 44/44 static pages; only the `output:'standalone'` symlink copy fails on Windows (EPERM) — not a code defect, Linux CI unaffected | |
| customer-app | ✅ | ⚠️ 10 react-hooks warnings | ✅ 3 tests | n/a (EAS) | |
| admin-panel | ✅ | ✅ | ✅ 20 suites | ❌ without `VITE_API_URL` (by design) → **CI was red**: workflow never set it. ✅ with it, 0 chunks > 600 KB | fixed in `.github/workflows/ci.yml` |
| rider-app | ✅ | ✅ | ✅ 43 tests | n/a (EAS) | rebuilt 2026-10-05 |

## 3. Findings
Full tables with file:line, WHY and fix: `docs/audits/2026-10-05-findings.md`. Status lives in §1 above.

## 4. Plan (HOW) — in execution order
1. Commit this log + audit file so nothing is lost; work on `main` directly (owner wants main), gates before every commit.
2. Backend contract fixes first (cheap, unblock clients): set-pin first-set no revoke; `oi.quality` + `is_urgent_delivery` in GET /orders; address update accepts `latitude:null` to clear; cancel rejects `refunded`; review `target_type` + abandoned-carts `older_than_hours` accept snake; `GET /ocp` for sub-codes; restaurant slot perms; permission registry.
3. Website High: register/checkout OTP + session; interceptor auth-endpoint list; image hosts; load-more on products/category/orders; placeholder phone → banner settings.
4. Website Medium: B/C prices, atta (phone, requests page, live copy), chat:error, pin removal, restaurant portal, hasHydrated, settings toggles, portal session handling.
5. Website Low + static copy reconciliation.
6. Customer-app: categories wall → react-query like website + remove async-guard bug; featured count; B/C prices parity; lint warnings; (re-run sweep).
7. Admin: A-H1..A-L14.
8. Gates on every workspace; commit; push main.
9. Re-run the three dead audit sweeps (customer-app, admin main, backend 28-item verification) when the session limit allows; fix what they find.

## 5. Work log (newest first)
### 2026-10-05 — Session 4: backend prior-audit items (row 4.1), all on `main`
Each item: WHAT was wrong → WHY it matters → HOW fixed (file).
- **B-1 admin tokens outlived `admins.is_active=false`.** `verifyAdminActive` only checked `users`; adminLogin JOINs `admins`. Now LEFT JOINs `admins` and rejects missing/inactive rows (`middleware/auth.ts`).
- **B-2 cross-city OCP PIN reset (H1 from the Sept audit, still open).** `PUT /admin/ocp/:id` had no city scope → a city-A admin could reset a city-B OCP's portal PIN. Now `resolveCityScope` + `cityRowInScope` on the OCP and on any `city_id` change (`admin/ocp.controller.ts`).
- **B-3 any admin could take a city offline (H3).** `toggleCity` is now super_admin only, like `deleteCity` (`admin/settings.controller.ts`). H2 (customer lookup) was already address-scoped; the name/phone echo is needed for admin-created orders and is left as is.
- **B-4 admin "delivered" left COD orders unpaid forever.** The rider path marks COD (non-OCP) orders paid on delivery; the admin status path did not → revenue/profit under-counted. Same CASE now applied (`admin/orders.controller.ts updateOrderStatus`).
- **B-5 delivered → refunded had no side effects.** Now writes a `refunds` ledger row for the paid amount and sets `payment_status='refunded'` (same handler).
- **B-6 DELETE order left stock reserved, slot seat taken and rider task live.** `deleteOrder` now runs in a transaction: cancels rider tasks + `restoreOrderInventory` for non-terminal orders, notifies riders (same file).
- **B-7 unassigning an OCP (`ocp_id=null`) dropped collected cash.** Settlement keys on `ocp_id`. Now refused (409) when the OCP has collected cash, when an OCP rider is out with it, or when the order is delivered/refunded (`assignOrderToOcp`).
- **B-8 weight edit allowed on delivered/paid orders** → total ≠ paid. Now rejected after delivery or once payment is completed (`updateOrderItemWeight`).
- **B-9 admin product image endpoints did not exist.** The admin panel has always called `POST /admin/products/:id/images` and `DELETE …/images/:index` → 404. Implemented both (city-scoped, max 5) and mapped to `products.update`. Also: `PUT /products/:id` with new uploads used to REPLACE the gallery and ignored the form's `existing_images`; now keeps `existing_images` + appends uploads (`admin/products.controller.ts`, `routes/admin.routes.ts`, `middleware/validation.ts`, `middleware/adminPermissions.ts`).
- **B-10 admin create-rider failed on a schema.sql database.** Insert writes `NULL` CNIC images but `riders.cnic_front_image/back_image` were `NOT NULL`. Migration 55 drops NOT NULL; `schema.sql` updated.
- **B-11 restaurant slot booking counted against the UTC date.** `CURRENT_DATE` vs the consumer path's `Asia/Karachi` date → after 19:00 PKT restaurant orders booked *tomorrow's* seat. Fixed (`utils/restaurantOrders.ts`).
- **B-12 restaurant notes-only edit wiped delivery overrides.** `free_delivery_threshold`/`delivery_base_charge` were set to NULL whenever absent from the body. Now only present fields change (`admin/restaurants.controller.ts`).
- **B-13 no DB timeouts.** Pool now sets `statement_timeout` 30 s, `query_timeout` 35 s, `lock_timeout` 10 s, `idle_in_transaction_session_timeout` 60 s (env-overridable `DB_*_TIMEOUT_MS`); the SQL migration runner has its own pool and is unaffected (`config/database.ts`).
- **B-14 profit ignored refunds.** `computeCityProfit` now subtracts the `refunds` ledger for delivered orders of the city/period and returns `refunds`; admin Profit page shows a Refunds card when non-zero (`utils/profitCalc.ts`, admin `pages/Profit.tsx`).
- **B-15 urgent orders paid riders Rs 0.** Rider charge was looked up by (rider, slot); urgent orders have no slot. Fallback = the rider's most recently configured per-order rate (`utils/assignRiderToOrder.ts`). Business rule chosen by me — owner may prefer a dedicated urgent rate.
- **B-16 audit log stored PINs/OTPs in clear.** Redaction list gained `otp`, `bank_account` and exact-match PIN keys (substring "pin" would have redacted `shipping_address`). Regression test added (`middleware/auditLogger.ts`, `__tests__/middleware/auditLogger.test.ts`).
- **B-17 no money sanity constraints.** Migration 56 adds `NOT VALID` CHECKs: orders money columns ≥ 0, `order_items.unit_price` ≥ 0, `rider_delivery_charge` ≥ 0 (legacy rows untouched, new writes enforced).
- Gates: backend typecheck ✅ lint ✅ unit 7/7 ✅; admin typecheck ✅ lint ✅.

### 2026-10-05 — Session 4 (cont.): admin low items + website static copy + low items
- **A-L12/L13/L14** (admin): OCP stock modal asks 100 (API cap); Coupons Used paged 50/page end-to-end (`GET /admin/coupons/redemptions?page&limit` → `page/total_pages`); Complaints (Save/Refund/Replacement), Reviews (Hide/Show/Reply), RiderApplications (Save, page content) disabled without the backend's accepted codes. Service test updated.
- **WS-M10** (website): new `lib/useDeliveryTerms.ts` (city name, `free_delivery_threshold`, `base_charge`, urgent charge/ETA, slot cutoff %, live slots). FAQ/Help/Shipping/Terms/About now quote it. Removed: "Gujrat", "Rs. 500/100", invented 3-slot tables, "cancel within 15 minutes" (real rule: pending any time, else 30 min, never once out for delivery), "credit/debit cards & wallets", "PCI gateways", "Forgot Password reset link" (real: OTP + PIN, "Forgot PIN? Sign in with OTP"), "Rs. 10/kg atta" (live `GET /atta-requests/charges`), "minimum 5 kg" (no minimum, max 1,000 kg), "organic labelled" (→ A/B/C grades), "24/7 support", "30min avg delivery", "50K+ customers", "express within 2 hours" (→ real urgent-delivery setting or honest "not available in <city>"). Shipping slot cards use static Tailwind classes (template-built classes were purged → unstyled cards).
- **WS-M12**: wishlist labelled "saved on this device only".
- **WS-L14..L21**: featured 500→100; socket connect/disconnect logs dev-only; `setCity` no longer yanks the customer to `/` from every page (only from `/select-city`); franchise form requires city; category breadcrumb shows "…" while loading instead of the slug; product Share falls back to copy-link + toast when Web Share is unavailable.
- **W-L (hard-coded Gujrat / email clear)**: products header uses the selected city; AddressForm/addresses fallbacks no longer invent "Gujrat"; backend `POST /addresses` without `city` now derives it from `?city_id`/`?city` or the first active city (Joi default removed); `PUT /auth/profile` accepts `''`/`null` to clear the email and validates the format (route had no Joi schema).
- Gates: backend typecheck ✅ lint ✅ unit 7/7 ✅ · admin typecheck ✅ lint ✅ tests 197/197 ✅ · website typecheck ✅ lint ✅ tests 65/65 ✅.

### 2026-10-05 — Session 3 start
- Branch created; baseline gates run (§2). Full `pnpm install` started (website/admin node_modules were incomplete).
- Four read-only audit agents launched.

## 6. Verification evidence
_pending_

## 7. Rating (honest, excluding the ignored items)
- Before this work: _to be stated after audits, with evidence_
- After: _pending_
