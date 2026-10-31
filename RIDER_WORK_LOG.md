# Fresh Bazar — Rider Work Log (Rider App + Admin Panel rider features)

> **Purpose:** single tracker for making everything rider-related — the rider app, the admin
> panel's rider pages and the backend rider APIs — match the project as the **customer website
> and customer app** describe it. Records WHAT is wrong, WHY (with the customer-side evidence),
> HOW it is fixed, and what is DONE / REMAINING. **Updated before every commit.**
>
> **Khulasa (Roman Urdu):** Ye file rider app aur admin panel ke rider hisse ka poora record hai.
> Requirements customer website / customer app se nikali gayi hain (sirf purane commits se
> andaza nahi). Har masla, us ki wajah, hal aur status yahan likha hai. Session toot jaye to
> §1 mein pehla non-DONE item dekh kar wahin se kaam resume karein.

Branch: `claude/vibrant-cannon-bc89zv` (from `main` @ `55d7238`). Remote: https://github.com/aqsandhu/Fresh.git

## 0. How to resume
1. `git checkout claude/vibrant-cannon-bc89zv && git pull`
2. `pnpm install --frozen-lockfile`
3. Read §1 → first item not `DONE` → its §3 finding + §4 plan → latest §5 entry.
4. Gates (run each in its own subshell):
   ```bash
   ( cd backend      && pnpm typecheck && pnpm lint && npx jest --coverage=false src/__tests__ )
   ( cd rider-app    && pnpm typecheck && pnpm lint && pnpm test )
   ( cd admin-panel  && pnpm typecheck && pnpm lint && pnpm test )
   ( cd customer-app && pnpm typecheck && pnpm lint && pnpm test )
   ```
5. Update §1/§5, commit (`fix(rider): …`), `git push -u origin claude/vibrant-cannon-bc89zv`.

## 1. Status snapshot
Legend: TODO · WIP · DONE · DEFERRED

| # | Area | Item | Status |
|---|---|---|---|
| 0 | all | Audit (customer website + customer app + admin + backend + rider app) and this log | DONE |
| B1 | backend | Rider login no longer forces `available`; soft-deleted riders cannot log in | DONE |
| B2 | backend | Rider availability helper (busy/available respecting off-duty) used by assign / deliver / fail / cancel / status | DONE |
| B3 | backend | "I've arrived" + hidden-phone call → customer push/socket/in-app "Aapka order aapke darwaze par hai" | DONE |
| B4 | backend | Proof-of-delivery photo upload + stored on task + shown to admin | DONE |
| B5 | backend | Earnings/stats in Asia/Karachi on delivery time (rider + admin) | DONE |
| B6 | backend | Task queries: restaurant name/phone/front image/pin, final weight, atta details + amount | DONE |
| B7 | backend | Weight edit while out for delivery reaches the rider (socket + push) | DONE |
| B8 | backend | Rider problem report reaches admins for every task type (+ stored notification) | DONE |
| B9 | backend | Atta: assign pickup/delivery rider without faking status; atta COD collected by rider + settlement | DONE |
| B10 | backend | Customer tracking returns rider phone/vehicle (customer "call rider") | DONE |
| B11 | backend | Admin: `GET /admin/riders/:id`, list limit/search/active-task counts, slot id in charges, block/unblock, delete closes tasks, rider tasks/history/reviews endpoints, order rider-task timeline | DONE |
| B12 | backend | Rider: own reviews endpoint, richer profile | DONE |
| A1 | admin | Riders page: all riders (not 20), full edit form, charges prefilled, block/unblock, detail view (tasks, history, settlements, reviews) | DONE |
| A2 | admin | Orders: rider problem alerts, rider-task timeline + proof photo in order detail, dispatch dropdown with load | DONE |
| A3 | admin | Atta page: assign pickup/delivery rider, show riders + task state | DONE |
| A4 | admin | Rider application → create rider account | DONE |
| R1 | rider-app | Arrived / notify-customer flow | DONE |
| R2 | rider-app | Proof photo step in delivery | DONE |
| R3 | rider-app | Restaurant orders, atta details/amount, variable weight, live amount change | DONE |
| R4 | rider-app | Account-blocked socket → end session; reviews in profile | DONE |
| C1 | customer-app | Track screen: call rider works, rider-arrived alert, vehicle info | DONE |
| G | all | Gates green + final log | DONE |
| U1 | backend+admin | Separate per-rider pay for URGENT orders (owner decision 2026-10-31) | DONE |

## 2. Where the requirements come from (customer-side evidence)
- **Pay the rider in cash** — website `help/page.tsx`, `terms/page.tsx`: "you pay the rider when your order arrives".
- **Call or message the rider once he leaves** — `website/lib/guidanceTipsContent.ts` ("جب رائڈر آپ کے آرڈر کے ساتھ روانہ ہو جائے تو آپ اسے کال یا میسج کر سکتے ہیں"); website track page renders a `tel:` button with `rider_phone`; customer-app `TrackOrderScreen` has a call button that only says "Rider contact not available".
- **Rider proof photo** — website `privacy/page.tsx`: "Riders take a photo of the delivered order as proof of delivery". `rider_tasks.delivery_proof_image` exists; nothing writes it.
- **Customer phone hidden; app-mediated contact → "Aapka order aapke darwaze par hai"** — `ARCHITECTURE.md` privacy flow, `PROJECT_SUMMARY.md`; customer-app already has `sendRiderArrivalNotification` + `rider_arrived` icons in NotificationsScreen, but no server event ever triggers it.
- **Door photo / rider pins location on first delivery** — website `AddressForm.tsx` ("our rider will pin the location on first delivery"), addresses page shows "Rider pinned".
- **Restaurant orders** — restaurant checkout asks for a storefront photo "helps the rider find you"; restaurant orders have no `user_id`, data lives in `delivery_address_snapshot` (business_name, phone, location, front_image_url).
- **Atta Chakki** — website atta page puts the customer's contact number into `special_instructions` "so the rider can call"; customer pays service + milling + delivery charges (COD).
- **Variable weight** — admin re-weighs; total changes; customer gets "order_amount_updated". The rider must collect the new amount.
- **Rate the rider / complain about rider behaviour** — website support page, customer-app WriteReview / NewComplaint (`rider_behavior`).
- **Cancel rules** — cannot cancel once out for delivery (FAQ) → rider tasks only end by delivery, admin cancel, or rider problem report.

## 3. Findings (what is wrong → why)
### Backend
- **F1 (H)** `riderLogin` sets `riders.status='available'` on every login → dispatch can assign to a rider who never went on duty. It also JOINs riders without `deleted_at IS NULL` → a deleted rider can still sign in.
- **F2 (H)** `confirmDelivery` / `failTask` always set the rider `available` (even an off-duty rider, even one still holding other tasks); a reassigned (displaced) rider stays `busy` forever; `PUT /rider/status available` with tasks in hand reports `available`.
- **F3 (H)** Hidden phone → `POST /rider/call-request` just answers 403. The documented flow (customer notified "Aapka order aapke darwaze par hai") is not implemented; the rider has no way to tell a customer he is outside.
- **F4 (H)** No proof-of-delivery photo anywhere (promised in the privacy policy).
- **F5 (H)** Stats windows built with server-local `new Date()` (Render = UTC) and filtered on `placed_at` — an order placed yesterday and delivered today is counted yesterday; "today" starts at 05:00 PKT. `/stats/today` uses `CURRENT_DATE` (UTC). Same bug in admin `GET /admin/riders/:id/stats`.
- **F6 (M)** Rider task queries: restaurant orders have no `user_id` → rider sees no business name / phone / storefront photo / pin (all in the snapshot); `final_weight_kg` not returned; atta `special_instructions` (customer contact), quality, flour type, amount not returned; `requestCall` JOINs `users` so restaurant orders always 404.
- **F7 (M)** Admin weight edit emits only to the order room → the rider's list/home keeps the old cash amount.
- **F8 (M)** Rider "Report problem" emits `rider:task_failed` only for orders (atta silently dropped) and the admin panel never subscribes to that event → nobody learns the delivery failed.
- **F9 (H)** Atta rider assignment only happens inside admin status flips (`picked_up` / `out_for_delivery`) — i.e. the admin must claim the wheat is already picked up before a rider is even told — and the admin Atta page has **no rider selector at all**, so atta tasks never reach the rider app. Atta COD (service + milling + delivery) is never collected/recorded.
- **F10 (M)** `GET /orders/track/:id` (customer app) omits rider phone/vehicle → customer cannot call the rider.
- **F11 (H)** Admin rider APIs: list capped at 20 (no limit passed) — Riders page and Orders/OCP dispatch dropdowns miss riders; `GET /admin/riders/:id` is called by the admin service but **does not exist**; `getRiderStats` omits `time_slot_id` so the per-slot charge editor is always blank; no way to block a rider; delete leaves the rider's active tasks/orders assigned and sessions alive; no rider task history / reviews / settlements list in the UI; admin order detail has no rider-task timeline.
- **F12 (L)** `GET /rider/profile` lacks rating_count / city; no endpoint for a rider's own reviews.

### Admin panel
- **F13 (H)** Riders page: only 20 riders; edit modal opens with blank license/emergency/bank fields and cannot clear a value; slot-charge editor blank; no block/unblock; "Receive cash" history never shown (`listRiderCashSettlements` unused); no view of a rider's active tasks, delivery history, failed tasks, reviews.
- **F14 (M)** Orders: no alert when a rider reports a problem; order detail does not show what the rider did (picked up / arrived / delivered / failed + reason / proof photo).
- **F15 (H)** Atta page: no rider assignment (see F9), no rider names, no task state.
- **F16 (L)** Approving a rider application does nothing — admin has to retype everything in Riders.

### Rider app
- **F17 (H)** No "I've arrived / notify customer" action (F3) — hidden-phone "Call via Fresh Bazar" ends in an error alert.
- **F18 (H)** No proof photo step (F4).
- **F19 (M)** Restaurant orders render without business name/phone/photo/pin; atta tasks hide the customer's contact note, quality, flour type and the amount to collect; variable-weight final weight not shown; amount changes not pushed to list/home.
- **F20 (M)** Admin block not reflected until the next REST call; rider cannot see his rating/reviews.

### Customer app
- **F21 (M)** TrackOrderScreen call button is a dead alert; rider-arrived never surfaces.

## 4. Plan (HOW)
- B1 `auth.controller.riderLogin`: filter `r.deleted_at IS NULL`; stop writing status.
- B2 `utils/riderAvailability.ts` → `syncRiderAvailability(client, riderId)`: keeps `offline`/`on_leave`; otherwise `busy` when it has active tasks, else `available`. Called after deliver, fail, cancel (displaced riders), assign, duty toggle.
- B3 `POST /rider/tasks/:id/arrived` (+ hidden-phone `call-request` reuses it): stamps `rider_tasks.arrived_at` (migration 57), inserts `call_requests` + `notifications(type call_request, action_type rider_arrived)`, emits `order:rider_arrived` to the customer + order room, Expo push "Aapka order aapke darwaze par hai". Rate-limited to once per 2 min per task.
- B4 `POST /rider/tasks/:id/proof` (multer, same storage as door picture) → `rider_tasks.delivery_proof_image`; atta: also mirrored to `atta_requests.pickup_/delivery_proof_image`. Admin order detail returns rider task timeline incl. proof.
- B5 shared `utils/riderStats.ts`: one SQL with `AT TIME ZONE 'Asia/Karachi'` windows on `delivered_at`, used by rider + admin.
- B6 extend `taskListOrderColumns`/detail: restaurant snapshot fields, `final_weight_kg`, atta fields.
- B7 `updateOrderItemWeight` → `rider:task_updated` + push to the assigned rider.
- B8 always emit `rider:task_failed` (order or atta) with rider name + reason; admin NotificationContext handles it.
- B9 `PUT /admin/atta-requests/:id/assign-rider {rider_id, task_type}`; migration 57 `rider_cash_settlement_atta`; atta delivery marks COD paid; stats + receive settlement include atta cash.
- B10 tracking payload adds `phone`, `vehicle_type`, `vehicle_number`, `avatar_url`, `rating` for the rider.
- B11 admin rider endpoints listed in F11.
- A*/R*/C* UI work as listed in §1.

## 5. Work log (newest first)
### 2026-10-31 — Session 1 (cont.): urgent-order rider pay (owner: "is k liye alag rate chahye")
- **WHY:** urgent orders have no time slot, so they borrowed the rider's latest slot rate.
- **HOW:** migration 58 `riders.urgent_delivery_charge` (NULL = not set, CHECK ≥ 0); `assignRiderToOrder` (admin, OCP and restaurant assignment all go through it) uses it for `is_urgent_delivery` orders and snapshots it on `orders.rider_delivery_charge`; unset → old fallback. `PUT /admin/riders/:id/delivery-charges` accepts `urgent_charge` (number / null clears), `GET …/stats` returns `urgentDeliveryCharge`. Admin rider detail → pay editor has a red "Urgent delivery" row (disabled with a hint until migration 58 has run).
- Verified on local PostGIS: `docs/rider-e2e/urgent-rate.sh` 8/8; regression `rider-flow.sh` 60/60, `restaurant-and-safeguards.sh` 16/16. Admin tests 205/205, backend 14/14.
- Push: the owner's PAT was tried as a one-off auth header (never written to disk/config) — the session proxy still answers 403 for github.com writes, so it cannot be used from here.

### 2026-10-31 — Session 1: rider app, customer side, E2E (commits `d37e4ec`, `e1d17fb`, `fb945ae`, `543ebb5`)
- **R1** Task detail "I've arrived — notify customer" (hidden phone) + arrival time; atta pickup notifies while `assigned`, others while `in_progress`; hidden-phone "Call" = arrival.
- **R2** Deliver sheet: proof photo (camera) required for customer hand-overs, optional at the mill; upload failure asks before continuing; stored via `POST /rider/tasks/:id/proof`.
- **R3** Restaurant name / storefront photo, OCP collection point + "hand cash to OCP", atta quality / flour type / expected-actual flour / customer note with tap-to-call, atta charges to collect, re-weighed final weight, `rider:task_updated` refresh + notification.
- **R4** `rider:account_blocked` ends the session with the reason, `rider:status_changed` (admin off-duty) stops GPS, `rider:cash_received`; Earnings = customer cash with you / your pay / hand over / handed over / pay owed on non-cash orders + hand-over history; Profile rating only after real reviews, city, My reviews screen. EN + UR for every new string.
- **C1** customer-app TrackOrder call button dials the rider (was a dead alert), vehicle + rating, live "Rider aap ke darwaze par hai"; OrderDetail rider card with call + delivery photo; website toast/bell for `order:rider_arrived`; `GET /notifications` reports `rider_arrived`.
- **E2E on real Postgres+PostGIS** (schema.sql + all 60 migrations, backend on :3999): found and fixed 2 SQL bugs — `createAttaRiderTask` INSERT (parameter `$2` used as enum and text → **no atta task could ever be created**, also in the code from the earlier rebuild) and `verifyRider` (block/unblock failed). Scripts: `docs/rider-e2e/`.

### 2026-10-31 — Session 1: admin panel (commits `46c4cf8`, `820b469`)
- **A1** Riders: server search, all riders (limit 500), GPS-live dot, active-task load, duty override (busy derived), verify / block / unblock (block signs the rider out), safe delete; `RiderFormModal` loads the full record (`GET /admin/riders/:id`) and sends every optional field so clearing works; `RiderDetail` tabs — Overview (Karachi-day stats incl. atta, COD position: cash with rider / his pay inside / to hand over / handed over / pay owed on non-cash orders; Receive cash; per-slot pay editor prefilled by `time_slot_id`), Active tasks, History (proof photos, failure reasons), Cash hand-overs, Reviews & complaints.
- **A2** Orders: dispatch dropdown lists every verified on-duty rider with load + GPS; "Rider problem" / "At door" flags; order detail "Rider activity" timeline + proof photo + **Return to store**; `?search=` deep link; admin toast + sound + bell on `rider:task_failed`.
- **A3** Atta Chakki: pickup/delivery rider assign + reassign (status untouched), rider names, task state + failure reason, proof photos, COD state, customer contact note.
- **A4** Rider applications: "Create rider account" (prefilled form) → application marked approved.
- Env fix: admin `tsconfig` pins `react`/`react-dom` types to its own @types (491 TS2786 errors from the hoisted React 19 types made `typecheck` red).
- Gates: admin typecheck ✅ lint ✅ tests 204/204 ✅.

### 2026-10-31 — Session 1: backend (commits `0f2e40d`, next)
- **B1** `auth.controller.riderLogin`: JOIN riders `deleted_at IS NULL`; no status write on login; blocked riders get a clear message.
- **B2** `utils/riderAvailability.ts` (`syncRiderAvailability`, `resolveDutyStatus`) used by deliver, fail, assign, `cancelActiveRiderTasks`, `createAttaRiderTask`, admin completion, return-to-store; `PUT /rider/status` accepts only available/offline/on_leave and stores busy when tasks remain.
- **B3** `POST /rider/tasks/:id/arrived`; `call-request` with hidden phone now notifies instead of 403. Customer gets push + `order:rider_arrived` + inbox row (`type call_request`, `action_type rider_arrived`). 2-min repeat guard. Restaurant orders (no app account) alert admins.
- **B4** `POST /rider/tasks/:id/proof` (`delivery_proof` field, `stage`); mirrored to `orders.delivery_proof_image` / atta proof columns; admin order detail `rider_tasks[]` shows it; customer order detail returns it.
- **B5** `utils/riderStats.ts` — Asia/Karachi periods on `delivered_at`; unsettled-line cash model incl. atta. Used by rider + admin. Tests added.
- **B6** one `taskSelect()` for list/detail: restaurant snapshot (name/phone/pin/front photo), atta address/house/landmark/pin/door photo via `atta_requests.address_id`, atta quality/flour/instructions/amount, OCP name/address, `arrived_at`, `final_weight_kg`. Pin/door photo now work for atta + restaurant tasks.
- **B7** weight edit + phone toggle → `rider:task_updated` (+ push for amount).
- **B8** `rider:task_failed` for every task type with rider name/reference; reason required (≥3 chars).
- **B9** `PUT /admin/atta-requests/:id/assign-rider`; rider pickup/deliver keep the atta state machine; atta COD collected on delivery (`paid_amount`, `collected_by_rider_id`); settlement includes atta; customer push on atta progress; manual admin moves close rider tasks.
- **B10** tracking payload + order detail: rider phone, vehicle, avatar, rating.
- **B11** admin riders: list (200/500, search, online, active tasks), `GET /:id`, `/tasks`, `/feedback`, block (verify=rejected) + session revoke + `rider:account_blocked`, safe delete, status override event, `time_slot_id` in charges; orders: latest task on list, `rider_tasks` in detail, `POST /orders/:id/return-to-store`; admin delivered paths only close live tasks (old `status != 'completed'` rewrote cancelled/failed tasks); bulk delivered marks direct COD paid.
- **B12** `GET /rider/reviews`, `GET /rider/cash-settlements`, richer `/rider/profile`.
- Migration 57 (arrived_at, atta cash columns, `rider_cash_settlement_atta`, index); probes in `config/riderSchema.ts` keep old DBs working.
- Gates: backend typecheck ✅ lint ✅ unit 14/14 ✅.
- **Push blocked:** `git push` → 403 "Claude doesn't have GitHub access to aqsandhu/Fresh" — commits are local; owner must reconnect GitHub / install the Claude GitHub App.

### 2026-10-31 — Session 1: audit
- Read: rider-app (all screens/stores/services), backend rider/admin-rider/OCP/atta/order/socket/review code, admin Riders/RidersHub/RiderApplications/Orders/Atta pages, customer-app tracking/notifications/reviews/complaints, website track/help/faq/terms/privacy/atta/addresses/restaurant checkout.
- Wrote §2–§4.

## 6. Verification evidence
Latest run — 2026-10-31, end of session 1:

| Workspace | typecheck | lint | tests | other |
|---|---|---|---|---|
| backend | ✅ | ✅ | ✅ 4 suites / 14 tests (+ riderAvailability, riderStats) | E2E on local PostGIS: `rider-flow.sh` 59/60 (the 1 was a jq number-format artifact, fixed in the committed script), `restaurant-and-safeguards.sh` 16/16 |
| rider-app | ✅ (after `turbo` builds `@freshbazar/shared-types`) | ✅ 0 warnings | ✅ 7 suites / 49 tests (+ riderFlow) | — |
| admin-panel | ✅ (was 491 × TS2786 from hoisted React 19 types — fixed in tsconfig) | ✅ | ✅ 25 suites / 204 tests (+ riderLabels, rider.service) | `vite build` ✅ |
| customer-app | ✅ | ✅ | ✅ 3 suites / 3 tests | — |
| website | ✅ | ✅ | ✅ 7 suites / 65 tests | — |

Not verifiable here (needs a phone / production services): on-device camera + GPS + background location, Expo push delivery, Supabase Storage uploads (proof / door photos need `SUPABASE_SERVICE_ROLE_KEY`; without it the upload endpoints answer 500 "storage misconfigured", which the rider app shows and lets the rider continue).

## 7. Remaining / owner decisions
- **Push to GitHub is blocked (403):** "Claude doesn't have GitHub access to aqsandhu/Fresh". All commits are on the local branch `claude/vibrant-cannon-bc89zv`. Reconnect GitHub (https://claude.ai/connect-github) and install the Claude GitHub App on the repo, then `git push -u origin claude/vibrant-cannon-bc89zv`.
- **Deploy order:** run `npm run migrate:sql` (migration 57) — Render's `preDeployCommand` already does. The backend degrades gracefully before it runs (probes in `config/riderSchema.ts`).
- **Rider pay for atta tasks** — still none (atta has no per-rider rate); atta cash is collected and settled, pay is a product decision.
- ~~Urgent orders use the latest slot rate~~ — done: per-rider urgent rate (U1). Set it for every rider in Riders → rider → Overview → "Urgent delivery".
- **On-device smoke test:** go on duty → admin assigns → push on a backgrounded phone → pickup → "I've arrived" (customer phone shows the notification) → proof photo → deliver COD → admin "Receive cash".
