# Fresh Bazar — human-style QA report (2026-11-01)

Method: the whole stack was run locally the way it runs in production —
PostgreSQL 16 + PostGIS with `schema.sql` + all 62 migrations, the API on
:3999, the **production builds** of the website (Next.js, :3000) and the
admin panel (Vite, :5173) — and used in a real Chromium browser like a
person would (click, type, submit, look at the screen), plus API-level
checks for the mobile apps. Out of scope by owner's instruction: payment
gateways (COD only), Render free tier, OTP bypass (it was *used* here to
log in, not judged).

Status legend: **BUG** wrong behaviour a user can hit · **RISK** can be
abused / loses money or stock · **GAP** missing piece · **OK** checked and
working · **DEAD** code that is never reached.

---

## 1. API contract — every call every app makes vs. the real backend

Tool: the backend's routes were dumped at runtime (350 routes) and every
API path in the website, admin panel, customer app, rider app and
core-auth (463 calls) was matched against them, method included.

| Result | Count | Notes |
|---|---|---|
| Calls that hit a real route | 435 | OK |
| Calls to routes that do not exist | 28 | **DEAD** — all in admin-panel services, none reachable from any page/button (checked one by one). Listed below; removed in this round so nobody wires a button to a 404. |
| Website / customer app / rider app broken calls | 0 | OK |

Dead admin service functions (no route on the backend, no caller in the UI):
`addressService.getAddressById / updateAddress / searchAddresses /
getAddressesByArea / getAreas / getCities`, `attaService.getAttaRequestById /
updatePricing / cancelRequest`, `categoryService.uploadCategoryImage`,
`customerService.getCustomerById / getCustomerOrders / updateCustomerStatus /
searchCustomers`, `dashboardService.getSalesReport / getOrderReport /
getProductReport / getRiderReport`, `orderService.cancelOrder / refundOrder /
updateOrderNotes`, `settingsService.updateAppSettings /
updateNotificationSettings`, `whatsappService.*` (5).

Backend features with **no screen at all**:
- **GAP (important for anti-corruption, see §Q7):** the daily *reconciliation
  watchdog* (`GET /api/admin/reconciliation`, `POST …/run`) has no page in the
  admin panel, and the panel does not listen to its `reconciliation:alert`
  socket event. The owner never sees what it finds.
- `DELETE /api/admin/customers/:id` — no button (fine: customers delete
  their own account).
- `GET /api/orders/track/public/:orderNumber` — unused public tracking.

---

## Q7. Anti-corruption: after the admin buys, supervises packing and enters the stock

Question asked: *"If the admin buys the goods, has them packed under his eyes
and enters them in the system — after that there must be no chance of
corruption."* Below is every way value can still leave the business after
that entry, in plain logic, from reading the code path end to end
(`finance/expenses.controller`, `admin/stock.controller`, `utils/systemStock`,
`utils/adminApproval`, `utils/reconciliation`, `admin/orders.controller`,
`coupon.controller`, `auditLogger`, admin `NotificationContext`).

What is already good (checked, not assumed):
- Stock cannot be typed in by hand: a new product starts at 0, the product
  form cannot edit stock, the only intake is *Stock purchase* (and a
  super-admin-only "correction" that needs a reason). ✔
- Purchase entry enforces mass balance: A + B + C + waste = raw weight. ✔
- Every stock change writes an append-only ledger row (`stock_movements`). ✔
- Orders lock prices at order time; overselling is blocked atomically. ✔
- Waste needs a reason + photo + evidence qty; waste/convert/refund/discount
  ≥ Rs 5,000 need a second admin. ✔
- Every admin write (POST/PUT/PATCH/DELETE) is stored in `audit_logs` with the
  old and new values (so a price change is recorded). ✔
- Only the super admin can create admins and roles. ✔

### Flaws found (simple logic → why it matters → fix)

| # | Where | The trick (simple logic) | Severity |
|---|---|---|---|
| K1 | Orders | *Checked and withdrawn.* The order controller has a "delivered → refunded" branch with no reason/approval/who-did-it, which would let a rider + admin hide cash. Tested against the running API: the request validator only accepts statuses up to `cancelled`, so **`refunded` is rejected (400) — not reachable** from the panel or the API. The branch is dead code; removed so it can't be switched on by accident. Refunds go only through the complaint refund (reason + cap + second admin ≥ Rs 5,000). | — (not a hole) |
| K2 | Store | **There is no physical stock count.** The watchdog only compares the database with the database. If 2 kg of tomatoes walk out of the store, the system still shows them; nothing ever compares shelf vs system. | **Critical** |
| K3 | Owner visibility | The daily watchdog (stock drift, refunds, waste, weight bias, OCP cash) has **no screen** in the admin panel, the bell ignores its alert, and its DB notifications are never shown. Worse, its alert is broadcast to **every** admin (city admins included) with the full anomaly list — the person being checked is told what was found. | **High** |
| K4 | Approvals | The Rs 5,000 second-admin rule is **per action**: 5 wastes of Rs 4,900 = Rs 24,500 out with no approval. Same for conversions A→C, refunds, discounts. | **High** |
| K5 | Packing | Weight check only looks for admins who bill **more** than packed (upward bias). Packing **more than billed** (1.2 kg bag, bill says 1.0 kg — free goods to a friend) is never flagged, and the 0.2 kg is even added back to system stock as if still on the shelf. | **High** |
| K6 | Coupons | Any admin with coupon rights can create a 100 % coupon with no usage limit, no cap, never expiring, and give it out. No approval, not in the watchdog. | **High** |
| K7 | Cash | Nobody's **cash-in-hand** is tracked. "Payment received" (office collects COD) does not record which admin took the cash; rider/OCP settlements record the receiver but there is no report "cash collected by each admin" for the owner to compare with what reached him. Also: "payment received" on an order that has a rider leaves it in the rider's dues too (counted twice). | **High** |
| K8 | Ledger dates | Expenses, stock purchases, rider/worker payments can be dated **any day since 2020** — last month's already-paid profit can be changed later. | Medium |
| K9 | Purchase | Purchase price, grade split and purchase waste are self-declared: no bill photo/supplier, and no alert when a buying rate or waste % is far above normal (pay 10,000, enter 12,000; or enter A-grade as C and sell it cheap). | Medium |
| K10 | Orders | A super admin can soft-delete a **delivered** order: it vanishes from sales/profit and from the rider's dues while its stock already left. | Medium |
| K11 | Approvals | The second admin types his own phone + password **on the first admin's screen**, and can be from any city. In practice passwords get shared and the control dies. | Medium (design) |
| K12 | Admin panel | The audit log exists but has no screen; the owner cannot review who changed what without the database. | Medium |

---

## Q3. Website — used like a customer in Chromium (production build)

Crawl: 84 pages/links followed from 31 start pages (every header, footer,
category, product and policy link) — **0 pages with 404/500, 0 JS crashes,
0 dead internal links.** Private pages (`/orders`, `/profile`, `/addresses`,
`/support`, `/settings/pin`) correctly send a guest to `/login?redirect=…`.

Customer journey actually performed:

| Step | Result |
|---|---|
| Register: phone → OTP → name → PIN | OK (account appears only after the name step) |
| Login with a new number | OK — sends to register with the phone pre-verified |
| Product page: Half kg, qty 3, Add to cart | OK; **BUG W1**: after choosing "Half Kg" the price line reads "Rs. 60 **/kg**" (it is per ½ kg; cart shows it right) |
| Cart totals, free-delivery hint | OK (Rs 180 + Rs 100; "add Rs 320 more") |
| Checkout: free 12–2 slot pre-selected, delivery FREE, COD | OK; server charged 0 too (DB checked) |
| Place order + double-click + second press | OK — exactly one order; 1.5 kg reserved; slot seat taken |
| My Orders, Track page | OK; **BUG W2**: "Estimated by Nov 1, 12:00 AM" — shows midnight of the date instead of the 12:00–2:00 PM slot |
| Customer cancel | OK — reservation released, slot seat freed, reason saved (no reason is asked, only a browser confirm) |
| Complaint on an order | OK (ticket CMP-…, city attached) |
| Wishlist | Works but **device-only** (page says so); not synced with the app/account — GAP |
| Notifications switch | OK — saved on the account both ways |
| PIN set, logout, wrong PIN, right PIN | OK; Change PIN asks for the current PIN |
| Delete account | OK — name/phone/PIN wiped, orders anonymised |
| Franchise / Work-as-rider / Restaurant register forms | OK — rows created with the right city |

Smaller website notes: `/settings` opens for a guest showing "User" and live
switches (should redirect to login like `/profile`) — **W3**; icon-only
buttons on `/addresses` have no accessible label — **W4**; hero/about photos
are hot-linked from Unsplash (fine in production, but the home page depends
on a third-party site) — note.

## Q4. Admin panel — used like an admin in Chromium (production build)

All 33 admin routes open with no JS error. Done through the real UI:

| Action | Result |
|---|---|
| Create product Onion with Quality A/B/C prices | OK — stock starts at 0, city set |
| Stock purchase with A+B+C+waste ≠ raw | OK — *Purchase* button stays disabled |
| Stock purchase 50 kg (30/12/6/2), Rs 4,000 | OK — stock A30/B12/C6, one expense row |
| Create rider | OK — starts off duty, verified, city set |
| Order Pending → Confirmed → Preparing → Ready | OK — one customer notification per step, no duplicates |
| Assign rider from the row | OK — out for delivery, rider busy, task created |
| Rider pickup / arrived / deliver (API, as the app does) | OK — stock 80 → 78.5, reserve 0, paid, rider free |
| Receive cash from rider | OK with the right password |

Bugs found in the admin panel:
- **A-1 (High):** typing a **wrong password** in "Receive cash" **logs the
  admin out**. The API answers 401 for a wrong *confirmation* password; the
  panel treats every 401 as an expired session. Same for OCP settlement
  receive/reject, the second-approver password (waste, refunds, discounts)
  and change-password. One typo = thrown out mid-work.
- **A-2 (Medium):** Dashboard "Daily / Weekly / Monthly sales" **include
  cancelled and refunded orders** (Rs 260 shown, real sale Rs 180). Profit
  page is correct.
- **A-3 (Low):** the status dialog offers every status, even ones the
  order cannot move to from where it is (server then refuses).
- **A-4 (Low):** assigning a rider who has no per-order pay set silently
  records Rs 0 pay — no warning.
- **A-5 (Low):** the login page fires `POST /auth/logout` (401) on every visit.
- **A-6 (a11y):** form labels are not linked to their inputs (no
  `htmlFor`/`id`) across the panel.

More admin/portal results (real UI unless noted):

| Action | Result |
|---|---|
| Approve restaurant request | OK |
| **Enable a product for restaurants** (category "also for restaurants" + product "Allow for restaurants" + price, saved from the real form) | **BUG Z1 (Critical):** the panel sends `restaurant_enabled_a=true`, shows "Product updated successfully", but the database stays `false`. The API's validator silently strips every *catalog-v2* field (`consumer_enabled_a/b/c`, `restaurant_enabled_a/b/c`, B/C half-kg / quarter-kg / half-dozen prices, restaurant fraction prices) on create **and** update. Result in production: **the restaurant shop is always empty**, a quality can't be hidden from consumers, B/C fraction prices never save. |
| Restaurant portal: login, shop, cart, checkout, place order (flag set by SQL to get past Z1) | OK — restaurant price used, 10 kg reserved, delivery Rs 100 |
| Restaurant delivery slot (Restaurants → Delivery Settings) | OK — "No limit" by default |
| Create OCP, send 5 kg to it, OCP portal (orders/stock/payments) | OK |
| Convert 2 kg A→B (Rs 180) | Works with no second admin (by design < Rs 5,000 — see K4) |
| **Add shareholder** | **BUG Z2 (High): 500** — `SELECT SUM(...) … FOR UPDATE` is rejected by PostgreSQL ("FOR UPDATE is not allowed with aggregate functions"). No shareholder can ever be created. (Exactly the kind of bug mocked unit tests can't see.) |
| 100 % coupon, no limit/cap/expiry, created by an admin | Accepted (K6 confirmed) |
| Every admin GET endpoint (74) called with real data | 0 server errors except `/finance/workers/<not-a-uuid>` → 500 instead of 404 (**Z9**, low) |
| "Payment received" / bulk "refunded" | bulk cannot set refunded (OK) |

K13 (new, anti-corruption): **Stock page → "Send to OCP" puts the stock straight
into the OCP's balance** — the OCP never confirms receipt. If 5 kg is
entered but 3 kg is sent, the 2 kg shortage later lands on the OCP. (The
separate *stock request* flow does require OCP receipt.)

---

## Q5/Q6. Mobile apps (code review + API; no device in this sandbox)

- Every `navigate('…')` target exists — customer app 50 targets / 53
  screens, rider app 7 / 11: **0 broken navigations**.
- Customer app **Settings → "Language"** row shows an arrow but does nothing
  (**Z7**) — an App Store reviewer taps it. Fixed: it now sets the account's
  message language (English / اردو), same as the website.
- Rider app: prominent background-location disclosure is shown before the
  system prompt, text matches Google's wording ("even when the app is closed
  or not in use"). OK.

## Q8. Play Store / App Store — what could get the apps rejected

| # | App | Item | Status / action |
|---|---|---|---|
| S1 | both | Privacy manifest, `usesNonExemptEncryption:false`, camera/photo/location purpose strings | OK |
| S2 | both | iOS 1024 icon without alpha (`ios-icon.png` RGB) | OK |
| S3 | customer | In-app account deletion | OK (tested on the website, same API) |
| S4 | rider | Background location: iOS `UIBackgroundModes: location` + "Always" string; Android `ACCESS_BACKGROUND_LOCATION` + `FOREGROUND_SERVICE_LOCATION` + foreground-service notification + prominent disclosure | OK. Google Play still needs the **Permissions Declaration form + a short video** of the disclosure → on-duty flow. |
| S5 | rider | **Apple 3.2 risk:** a login-only app usable only by your own staff is often rejected from the public App Store ("internal/business app"). | Either publish iOS via **Apple Business Manager → Custom App**, or make it a public driver app: add "Apply to become a rider" on the login screen (the website form already exists) and give App Review a demo rider account. |
| S6 | both | **Review login:** App Review must be able to log in. Customer app uses phone OTP → give a demo number + fixed code in the review notes; rider app → a demo rider. | To do at submission |
| S7 | customer | `ios.supportsTablet: true` → Apple also reviews on iPad; any broken iPad layout is a rejection. | Set `false` unless the iPad layout is tested |
| S8 | customer | Product reviews from other customers are shown (user-generated content, Apple 1.2): admin can unpublish, reviews come only from real orders, but there is **no "Report" button** for customers. | Low–medium risk; add "Report" |
| S9 | both | Android push needs `google-services.json` + FCM credentials in EAS; iOS push needs an APNs key in EAS. Without them push silently does nothing (not a rejection). | Configure before launch |
| S10 | both | Payments: COD only → no In-App Purchase rule applies (physical goods). | OK |

---

## Fix status (this round)

Everything below was re-tested after the fix — in the browser where it has a
screen, and in the real-DB suite (`docs/rider-e2e/qa-2026-11-01.sh`, 29
checks, now part of `run-all.sh` and CI). Whole suite on a fresh database:
**153 / 153**. Unit tests: backend 292, admin 204, website 65, rider 51,
customer 7. All workspaces typecheck + lint clean; admin and website
production builds pass. Final crawl: 34 admin pages, 90 website pages, 0
errors.

| # | Status | Fix |
|---|---|---|
| Z1 | **FIXED** (critical) | Catalog-v2 fields accepted on product create/update; "Allow for restaurants" saved from the real form (checked in DB), restaurant shop shows the product. Regression test added. |
| Z2 | **FIXED** | Shareholder add works (advisory lock + plain SUM); 100 % cap still enforced (UI: "Only 60 % is left"). |
| Z3 | **FIXED** | Wrong confirmation / approver / current password → 400 with the message; no more forced logout (verified in the UI: the approval message shows and the admin stays logged in). |
| Z4 | **FIXED** | Dashboard sales exclude cancelled/refunded. |
| Z5 | **FIXED** | Track page: "Expected Mon, 2 Nov · by 9:00 PM". |
| Z6 | **FIXED** | Product page: "Rs. 60 /½ kg". |
| Z7 | **FIXED** | Customer app Language row sets the message language (en/ur). |
| Z8 | **FIXED** | `/settings` → `/login?redirect=/settings` for a guest. |
| Z9 | **FIXED** | Malformed worker id → 404. |
| Z10 | **FIXED** | 28 dead admin service functions removed. |
| K1 | not a hole | Verified unreachable; dead branch replaced by an explicit refusal. |
| K2 | **FIXED** | Blind shelf count (Stock → count icon) → ledger + Owner checks; shortage needs the daily approval. Verified: 2 kg short → stock 28→26, ledger row, approver recorded. |
| K3 | **FIXED** | "Owner checks" page (super admin): findings in plain words, cash by admin, shelf counts, history; alerts super-admin only + in the bell. |
| K4 | **FIXED** | Daily per-admin limit: 2 400 + 2 400 OK, the next 1 200 asked for a second admin ("would reach Rs 6,180"). |
| K5 | **FIXED** | Downward weight edits flagged over a rolling 7 days ("lowered bills by Rs 1,615 over 6 edits"). |
| K6 | **FIXED** | City admin 100 % coupon refused; capped coupon OK; super admin not capped; risky coupons flagged. |
| K7 | **FIXED** | "Payment received" records the admin; rider dues unchanged (was double-counted); cash-by-admin table. |
| K8 | **FIXED** | 40-day back-dated expense refused for a city admin; 2-day OK. |
| K9 | **FIXED** | 25 % purchase waste and a rate 140 % above the 30-day average both flagged. |
| K10 | **FIXED** | Delivered order delete → "cannot be deleted — it is part of the books". |
| K11 | design note | Second admin still types the password on the first admin's screen — see recommendations. |
| K12 | **FIXED** | Audit log tab: shows even failed attempts (e.g. a city manager's blocked direct OCP shift). |
| K13 | **FIXED** | "Send to OCP" creates a request; OCP portal asks "Confirm you physically received and verified this stock?" — OCP stock changed 5 → 7 only after that. |
| S5 | **FIXED** | Rider login has "Apply to deliver with Fresh Bazar" (website form). |
| S7 | **FIXED** | Customer app `supportsTablet: false`. |

## What still allows loss (cannot be closed by code alone)

Plain truth — software can make cheating visible and slow, not impossible:

1. **Collusion between two admins** (one wastes, the other approves) — the
   watchdog shows both names, but the owner has to read it. Make the
   *owner* (super admin) the only approver for the biggest items, and do
   **surprise shelf counts** yourself (the count screen records who counted).
2. **Purchase price itself** — the system now flags rates far above normal,
   but a steady small inflation (5 %) is only caught by comparing with the
   supplier's bill. Ask for a **bill photo + supplier phone** on every
   purchase (recommended next step) and call a supplier at random.
3. **Cash in the office drawer** — "cash each admin collected" now exists;
   the owner must compare it daily with the money handed to him (a simple
   "handed to owner" button per admin would close this loop — recommended).
4. **Phone login (OTP bypass)** — out of scope by instruction, but while it
   is on, anyone can log in to any customer account. Turn it off at launch.

## Production readiness (excluding gateways, Render free plan, OTP bypass)

| Area | 31 Oct | Now | Why not 100 % |
|---|---|---|---|
| Backend API & data integrity | 88 % | 92 % | boot-time DDL (F11), public atta tracking (F12), AI-chat spend cap (F13), no load test |
| Stock & cash controls | — | 90 % | items 1–3 above need a supervision habit; no bill photo yet |
| Admin panel | 84 % | 90 % | tokens in localStorage / no 2FA for super admin (F10), labels not linked to inputs (a11y), status dialog offers impossible statuses |
| Website | 86 % | 91 % | wishlist device-only, zod 3, hero images hot-linked |
| Customer app | 77 % | 80 % | **never run on a real phone in this audit**; no "Report review" button; push needs FCM/APNs setup |
| Rider app | 77 % | 79 % | **never run on a real phone**; Google background-location declaration + video still to submit; Apple 3.2 risk remains until a public path / Custom App |
| QA / CI / Ops | 75 % | 85 % | CI real-DB job not yet seen green on GitHub; no load/soak test; no monitoring alerts configured |
| **Overall (weighted)** | **≈ 83 %** | **≈ 88 %** | The last 10–12 % is mostly *outside the code*: real-device testing of both apps, store submission paperwork, monitoring, and the owner's supervision routine. |

## Recommendations (in order of value)

1. **Real-device test day** for both apps (one Android, one iPhone): GPS in
   background, push with the app closed, camera proof photo, low network.
   This is the largest remaining unknown.
2. **Bill photo + supplier** on stock purchase and on expenses > Rs 2,000;
   random supplier call once a week.
3. **"Handed to owner"** button per admin → the Owner checks cash table
   becomes a running balance per admin (who still holds how much).
4. **Owner as approver**: allow an env setting so only super admins can
   approve value-out above, say, Rs 20,000 a day.
5. **Approval from the approver's own phone**: replace "type phone +
   password here" with a request the second admin approves in their own
   session (stops password sharing).
6. Store submission: demo customer number + fixed code and demo rider
   account in the review notes; Google background-location declaration
   with a 30-second video of disclosure → on duty.
7. Turn on admin cookie auth (`ADMIN_AUTH_COOKIES` + `VITE_AUTH_COOKIES`)
   and add TOTP for the super admin.
8. Add an uptime/error alert (Sentry DSN is supported but not configured).
