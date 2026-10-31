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
| B1 | backend | Rider login no longer forces `available`; soft-deleted riders cannot log in | TODO |
| B2 | backend | Rider availability helper (busy/available respecting off-duty) used by assign / deliver / fail / cancel / status | TODO |
| B3 | backend | "I've arrived" + hidden-phone call → customer push/socket/in-app "Aapka order aapke darwaze par hai" | TODO |
| B4 | backend | Proof-of-delivery photo upload + stored on task + shown to admin | TODO |
| B5 | backend | Earnings/stats in Asia/Karachi on delivery time (rider + admin) | TODO |
| B6 | backend | Task queries: restaurant name/phone/front image/pin, final weight, atta details + amount | TODO |
| B7 | backend | Weight edit while out for delivery reaches the rider (socket + push) | TODO |
| B8 | backend | Rider problem report reaches admins for every task type (+ stored notification) | TODO |
| B9 | backend | Atta: assign pickup/delivery rider without faking status; atta COD collected by rider + settlement | TODO |
| B10 | backend | Customer tracking returns rider phone/vehicle (customer "call rider") | TODO |
| B11 | backend | Admin: `GET /admin/riders/:id`, list limit/search/active-task counts, slot id in charges, block/unblock, delete closes tasks, rider tasks/history/reviews endpoints, order rider-task timeline | TODO |
| B12 | backend | Rider: own reviews endpoint, richer profile | TODO |
| A1 | admin | Riders page: all riders (not 20), full edit form, charges prefilled, block/unblock, detail view (tasks, history, settlements, reviews) | TODO |
| A2 | admin | Orders: rider problem alerts, rider-task timeline + proof photo in order detail, dispatch dropdown with load | TODO |
| A3 | admin | Atta page: assign pickup/delivery rider, show riders + task state | TODO |
| A4 | admin | Rider application → create rider account | TODO |
| R1 | rider-app | Arrived / notify-customer flow | TODO |
| R2 | rider-app | Proof photo step in delivery | TODO |
| R3 | rider-app | Restaurant orders, atta details/amount, variable weight, live amount change | TODO |
| R4 | rider-app | Account-blocked socket → end session; reviews in profile | TODO |
| C1 | customer-app | Track screen: call rider works, rider-arrived alert, vehicle info | TODO |
| G | all | Gates green + final log | TODO |

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
### 2026-10-31 — Session 1: audit
- Read: rider-app (all screens/stores/services), backend rider/admin-rider/OCP/atta/order/socket/review code, admin Riders/RidersHub/RiderApplications/Orders/Atta pages, customer-app tracking/notifications/reviews/complaints, website track/help/faq/terms/privacy/atta/addresses/restaurant checkout.
- Wrote §2–§4.

## 6. Verification evidence
_pending_
