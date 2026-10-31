# Fresh Bazar — Full Project Audit (2026-10-31)

Scope: backend (Node/Express/Postgres), database migrations, website (Next.js),
customer app, admin panel, rider app, CI. Method: reading the **current code**
on `main` (`1781972`) and cross-checking each finding against the other apps
and features; risky paths were also run against a real PostgreSQL + PostGIS
database (schema.sql + all migrations, backend started locally).
Commits/history were ignored. Out of scope by owner's instruction: Render free
tier, OTP bypass, payment gateways (the business is **COD only** for now).

Severity: **H** = money/data wrong or a real abuse path · **M** = feature
works wrongly for a real case · **L** = hardening / polish.

## 0. Fixed during this audit
| ID | Sev | What | Status |
|---|---|---|---|
| X1 | H | `POST /api/orders` accepted `card / easypaisa / jazzcash` although only COD exists. Such an order showed in the rider app as "Already paid — do not collect cash" and was marked delivered with no money. | **FIXED** (commit "fix(payments): COD-only"): API accepts only `cash_on_delivery`; rider cannot hand over an unpaid non-COD order (409); rider app shows "Payment not received — do not hand over". Verified on Postgres (`docs/rider-e2e/cod-only.sh`). |

## 1. Real problems still open (verified)

| ID | Sev | Area | Problem (WHAT) | Why it matters / cross-check | Fix (HOW) |
|---|---|---|---|---|---|
| F1 | **H** | Finance | Rider per-order pay (`orders.rider_delivery_charge`) is **never part of profit**. On COD orders the rider keeps it out of the cash (cash settlement = paid − rider pay), but no expense row is written. `utils/profitCalc.ts` = sales − expenses − stock cost − refunds. | Profit and the **shareholder "distributable"** are over-stated by Σ rider pay. If the admin *also* records rider pay via "Pay rider (commission)", the rider is paid twice. Checked: no code path inserts rider pay into `expenses`. | Either add `Σ rider_delivery_charge` of delivered orders as a cost line in `computeCityProfit`, or write an expense row when a cash settlement is received; label "Pay rider" as salary/non-cash pay only. |
| F2 | **H** | Customer app · Atta | `AttaRequestScreen` shows price = kg × **Rs 10 (hard-coded)**. Backend charges service + milling/kg + delivery from `system_settings` (defaults 50 + 5/kg); the website already uses live `GET /atta-requests/charges`. *Correction (§4): the 5–100 kg limits are the same on the website, so they are not a bug.* | Customer sees one amount, the delivery rider now collects another (atta COD). | Load charges from `/atta-requests/charges` like the website. |
| F3 | M | Multi-city | Delivery charge settings (`delivery_base_charge`, `free_delivery_threshold`, urgent charge) are **global** (`upsertGlobalSiteSetting`; readers don't filter city). Any admin with `settings.update` changes them for **every** city. | The rest of the system is city-scoped (products, stock, riders, orders, banners). A city admin of City B silently changes City A's prices. | Store delivery settings per city (`city_id` row, global fallback) and read with the order's city; or restrict the endpoint to super admin. |
| F4 | M | Multi-city · Realtime | All admins join one socket room `admins`; `order:new`, `order:cancelled`, `rider:location`, `rider:task_failed` go to **every** admin of every city. The admin panel does not filter by city either. | City admins get other cities' new-order sounds/toasts/flashing rows and live GPS of other cities' riders (data leak + noise). | Join `admins:city:<id>` rooms (super admin joins all); emit with the order/rider city. |
| F5 | M | Customer notifications | Push is sent only for: rider assigned, rider at door, delivered, atta progress. **No push** for order confirmed/preparing, **cancelled by admin**, amount changed after weighing, complaint replied, abandoned-cart reminder (inbox row only). `users.notification_enabled` is saved but no sender reads it. | Website/app settings promise "status changes … delivery alerts". A customer with the app closed never learns the admin cancelled or re-priced the order. | One `notifyCustomer(userId, …)` helper (inbox row + socket + Expo push, honours `notification_enabled`) called from admin status/bulk/weight/complaint paths and the marketing job. |
| F6 | M | Reports | "Today / this month" in profit, expenses, analytics, stock reports use `CURRENT_DATE` / `::date` in the DB session timezone (UTC; no session TZ is set — 18 places). | Orders between 00:00–05:00 PKT fall into the previous day; month boundaries shift 5 h. (Rider stats were already moved to Asia/Karachi.) | Set `timezone='Asia/Karachi'` on the pool (`options: '-c timezone=Asia/Karachi'`) or use `AT TIME ZONE 'Asia/Karachi'` everywhere. |
| F7 | M | CI | `pnpm audit --prod` (a CI step that fails on any advisory) reports **154** advisories (5 critical, 85 high): `next`, `proxy-addr`/`body-parser`/`multer`/`engine.io` (backend), `axios`/`follow-redirects` (admin), `shell-quote` and other Expo tooling (customer app). | CI on `main` cannot go green; some backend ones (multer, body-parser, engine.io) are request-reachable DoS advisories. Many Expo ones are build-time only. | Upgrade the direct deps (express/multer/socket.io/axios/next), `pnpm.overrides` for transitive ones; make the audit step `--audit-level=high` and fail only on prod-reachable packages. |
| F8 | M | Slots | Server only blocks a today-slot after its **end time**; the admin "slot cutoff %" (default 60 %) is enforced only by the website/app UI. | A stale client or crafted request can book a slot after the cutoff the shop set. | Apply the same cutoff in `validateAndClaimTimeSlot` (read `delivery_slot_cutoff_percent`). |
| F9 | M | QA | Backend has 31 suites / 273 tests but they run against a **mocked** database; coverage floor 22 % lines. | Two SQL statements that Postgres rejects (atta task insert, rider block) passed all tests and were only caught by running against a real DB. | Add a CI job with a Postgres+PostGIS service, run migrations, and run the `docs/rider-e2e/*.sh` style API checks. |
| F10 | L | Admin security | Admin tokens live in `localStorage` by default (cookie mode is opt-in: `ADMIN_AUTH_COOKIES` + `VITE_AUTH_COOKIES`); access 8 h, refresh 30 d; no 2FA. | No XSS sink was found in the admin panel, so this is hardening, not an active hole. | Turn cookie mode on in production; consider TOTP for super admin. |
| F11 | L | Ops | Many `ensure*Schema()` functions run `ALTER TABLE` from the app at boot (via `DATABASE_MIGRATION_URL`) in addition to `migrate:sql`. | Two schema paths can drift; DDL from several instances at boot. | Keep migrations as the only DDL path; leave `has*()` probes in the app. |
| F12 | L | Privacy | `GET /api/atta-requests/track/:id` is public (no auth) and returns status, timestamps and rider ids by UUID. | UUIDs are unguessable, data is low-sensitivity. | Require auth + `user_id` like `GET /atta-requests/:id`. |
| F13 | L | Cost | `/api/ai-chat/message` is public; limited to 30 msgs / 10 min per IP and 350 output tokens. | Bounded per IP, but a distributed abuse can still run up the LLM bill. | Daily global budget / require login. |
| F14 | L | Slots | `GET /orders/time-slots` without `date` uses the server's UTC weekday. | Between 00:00–05:00 PKT the list can use the previous weekday's slot rules. | Compute the weekday with `Asia/Karachi`. |

## 2. Checked and found OK (not bugs)
- SQL injection: sort columns/orders are whitelisted; all values parameterised.
- IDOR: addresses, orders, atta (`/:id`), chat, complaints, reviews check ownership.
- Order placement: cart + products locked in deterministic order, fresh prices, server-side coupon with row lock, atomic stock reservation, atomic slot capacity, anti double-submit.
- Cancel: stock/slot/coupon restore inside the same locked transaction; refunds ledger for paid orders.
- PIN login: per-account lockout after 5 failures (15 min → 24 h), timing-safe "no user" path, admins excluded.
- Customer/rider apps keep tokens in SecureStore; website has no `dangerouslySetInnerHTML`; printed slips escape every value.
- "Unlimited slot shows FULL" suspicion: not reachable — admin enforces `max_orders ≥ 1`, default 50.
- WhatsApp and restaurant orders are always COD.

## 3. Production-grade estimate (excluding Render tier, OTP bypass, gateways)

| Area | Score | Main gaps |
|---|---|---|
| Backend API & data integrity | 80 % | F1, F3, F4, F6, F8 |
| Admin panel | 76 % | F3/F4 multi-city, F10 |
| Website | 80 % | F5 (shared), F7 (`next` advisories) |
| Customer app | 68 % | F2, F5, not verified on device here |
| Rider app | 76 % | not verified on device (GPS/push/camera) |
| QA / CI / Ops | 58 % | F7 red CI, F9 mocked-DB tests, F11 |
| **Overall (weighted)** | **≈ 74 %** | Closing F1–F7 would put it around 85 %; real-device QA + DB-backed CI around 90 %. |

This is a judgment from code reading and local execution, not from production
traffic or load tests.

## 4. Fix status (2026-10-31, session 2)

All F1–F9 are fixed, plus the owner's two requests. Each was re-checked
against the website / customer app before changing it, and verified on a
real PostgreSQL + PostGIS database (`docs/rider-e2e/run-all.sh`, 124 checks,
now also a CI job).

| ID | Status | What changed | Commit |
|---|---|---|---|
| Owner | **DONE** | Time-slot capacity is **unlimited unless the admin sets a limit** (migration 59: no DEFAULT 50, NULL = no limit, CHECK ≥ 1). Slot lists return `available_slots = 9999` + `is_unlimited` so older app builds don't show "full". **Existing slots keep their current limit** — clear the box in Settings → Time Slots to make one unlimited. | `8dab5e6` |
| Owner + F5 | **DONE** | Abandoned-cart reminders are **pushed** (tap opens the cart). Customers also get pushes for admin confirm / preparing / packed / out for delivery / delivered / cancelled (with reason) / refunded, re-weighing (new COD total), complaint reply / resolved / refund. The "Order notifications" switch (app) = "Order updates" (website) is saved on the account and honoured by every customer push; inbox rows are kept. No duplicate inbox row where the DB trigger already writes one. | `b7aa6e0` |
| F1 | **DONE** | Profit = sales − refunds − stock cost − **per-order rider pay** − other expenses. "Pay rider → Per-order delivery pay (hand-over)" is logged but not subtracted twice; salary/bonus still are. Profit page shows the line (and refunds now reach it). | `ec20ce3` |
| F2 | **DONE** | Customer app shows the live total (service + grinding + delivery) and the live rate. Also: free delivery is now *from* the threshold kg ("and above", as the website says) and 0 = never free. New finding fixed: there was **no admin screen** for atta charges — added (super admin). | `9faa98a` |
| F3 | **DONE** | Delivery base / free threshold / express / urgent / ETA / cutoff % are per city with a global default; a city admin edits only their city; "Use default" resets a city. Checkout, cart, WhatsApp orders and the public endpoint use the order's city; the website now sends the city. | `8dab5e6` |
| F4 | **DONE** | Admin sockets join `admins:city:<id>`; order / rider / complaint / review / application events go to that city's admins + super admins. Verified with real socket clients (Gujrat admin hears a Gujrat order, Sialkot admin does not). | `2ad7d7f` |
| F6 + F14 | **DONE** | Explicit `AT TIME ZONE 'Asia/Karachi'` in profit, shareholder portal, expenses, dashboard, restaurant dashboard, waste report, order date filters, coupon dates, delivery-rule validity; slot weekday in Pakistan time. (A pool-level `SET TIME ZONE` was not used: production runs through the Supabase transaction pooler.) | `f53acd9` |
| F7 | **DONE** | 154 → **0** open production advisories; `pnpm audit --prod` exits 0. 13 with no compatible fix are ignored by id with reasons (`docs/audits/dependency-audit-ignores.md`). | `c41aca2` |
| F8 | **DONE** | `validateAndClaimTimeSlot` refuses a today-slot after the city's cutoff % of its window. | `8dab5e6` |
| F9 | **DONE** | `.github/workflows/db-e2e.yml`: PostGIS service, schema + all migrations, API, 124 checks. Not yet seen running on GitHub (push is blocked from this session). | `e6808d9` |
| F10–F13 | open (L) | Unchanged: admin token storage / 2FA, boot-time DDL, public atta track, AI chat budget. |  |

Smaller things found and fixed on the way: the app's "Promotions" and "Location
Services" switches saved nothing (removed; the website has neither);
`PUT /auth/profile` accepted a non-boolean notification flag; the admin Profit
page's refunds card never received data.

Still not verifiable here: Expo push delivery on a real phone, on-device
camera/GPS, Supabase Storage uploads.

### Production-grade estimate after the fixes
| Area | Before | Now | Main remaining gaps |
|---|---|---|---|
| Backend API & data integrity | 80 % | 88 % | F11, F12, F13 |
| Admin panel | 76 % | 84 % | F10, react-router 7 |
| Website | 80 % | 86 % | zod 4 move |
| Customer app | 68 % | 77 % | not tested on a device |
| Rider app | 76 % | 77 % | not tested on a device |
| QA / CI / Ops | 58 % | 75 % | CI not yet observed green on GitHub; no load test |
| **Overall (weighted)** | **≈ 74 %** | **≈ 83 %** | On-device QA of both apps + a green CI run on GitHub would take it to about 88–90 %. |
