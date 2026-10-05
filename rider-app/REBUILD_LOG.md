# Fresh Bazar Rider App — Rebuild Log

> **Purpose of this file:** single source of truth for the rider-app rebuild.
> It records WHAT needs to change, WHY, HOW it is being done, what is DONE and
> what is REMAINING — so that work can resume after a context/session limit
> without losing anything. **Update this file before every commit.**
>
> **Khulasa (Roman Urdu):** Ye file rider app ke rebuild ka poora record hai —
> kya kaam chahiye, kyun chahiye, kaise ho raha hai, kitna complete hai aur kya
> baqi hai. Agar session beech mein toot jaye to is file se kaam wahi se resume
> hoga jahan chhoda tha. Har commit se pehle ye file update hoti hai.

---

## 0. How to resume

1. `git checkout feat/rider-app-rebuild && git pull`
2. Read **§1 Status snapshot** → find the first item not marked `DONE`.
3. Read that item's entry in **§4 Plan** (the HOW) and the latest **§5 Work log** entry.
4. Verify baseline before touching code (run each from its own directory — do **not**
   chain `cd` across parallel shells, the cwd is shared):
   ```bash
   cd rider-app && pnpm typecheck && pnpm lint && pnpm test
   cd backend   && pnpm typecheck && pnpm lint && npx jest --coverage=false src/__tests__
   ```
5. Continue the item, update §1 + §5, commit with a `feat(rider-app): …` / `fix(backend): …` message, push.

Branch: `feat/rider-app-rebuild` (based on `fix/backend-hardening` @ `5d9e3ed`).
Remote: `origin` → https://github.com/aqsandhu/Fresh.git

> ✅ **Push status:** merged into `main` and pushed on 2026-10-05; feature branch kept on origin (the automated
> session cannot answer the credential prompt — run `git push` from your own terminal when
> new commits land). PR: https://github.com/aqsandhu/Fresh/pull/new/feat/rider-app-rebuild

---

## 1. Status snapshot

Legend: `TODO` not started · `WIP` in progress · `DONE` complete + verified · `DEFERRED` consciously postponed (see §7)

| # | Phase / Item | Status | Notes |
|---|---|---|---|
| 0.1 | Branch + this log | DONE | commit `2de068e` |
| 1.1 | Theme tokens (`src/theme`) | DONE | `src/theme/index.ts`; ErrorBoundary/BrandLogo/Button/MapPreview now use it |
| 1.2 | i18n module (`src/i18n`) — EN/UR parity enforced by TS + test | DONE | 270+ keys, `t()/useT()/tEnum()`; zero inline ternaries left |
| 1.3 | Types aligned to backend | DONE | `TaskStatus` = backend enum; `Task.codAmount/riderCharge/isUrgent/phoneVisible…`; stats payment full |
| 1.4 | `task.service` remap | DONE | single `mapTask()` (unit-tested), `PUT /deliver`, fabricated earnings removed |
| 1.5 | `api.ts` — 403 rider-blocked → `endSession(reason)`; error helpers | DONE | `getApiErrorMessage/isNetworkError/isClientError`; session-end reason shown on Login |
| 1.6 | `dutyStore` — single owner of duty + GPS | DONE | `goOnDuty/goOffDuty/resume/teardown`; `locationStore`, `useLocation`, `useTasks` deleted |
| 1.7 | socket.service — `rider:task_cancelled`, `order:update`, `chat:notification` | DONE | re-sync on reconnect; active-chat suppression |
| 1.8 | notification.service — tap deep-link, token after hydrate, settings respected | DONE | `bootstrap(onTap)` in `SessionEffects`; cold-start tap handled |
| 1.9 | offlineQueue — `update_status`, ordered replay, subscribers | DONE | stops at first network failure to keep order; 4xx dropped |
| 2.1 | Navigation shell | DONE | tabs Home/Tasks/Earnings/Profile with icons+labels+badge; root: TaskDetail, Chat, Settings, Help |
| 2.2 | Shared UI kit (`components/ui`) | DONE | ScreenHeader, Card, Badge, EmptyState, Banner, BottomActionBar, SectionTitle, SegmentedControl, StatTile, Sheet, InfoRow, Skeleton |
| 3.1 | LoginScreen | DONE | dark hero, inline validation, session-end banner, version from expo-constants |
| 3.2 | HomeScreen (duty) | DONE | DutyCard, today strip (deliveries/earned/cash in hand), next task + Navigate, banners (offline / pending sync / bg-location / permission revoked) |
| 3.3 | TasksListScreen + TaskCard | DONE | segmented Active/Completed, skeletons, distance chip, COD chip, house-number pill |
| 3.4 | TaskDetailScreen | DONE | sticky bottom bar, DeliverSheet (COD confirm), ProblemSheet (reasons), privacy-gated contact, pin/adjust, door photo, items w/ unit+quality, totals, timeline |
| 3.5 | ChatScreen | DONE | full-screen, `useOrderChat` hook, optimistic + retry, closed state for completed orders |
| 3.6 | EarningsScreen | DONE | period chips, cash panel (collected − earned − settled = due), per-delivery list with rider charge |
| 3.7 | Profile + Settings + Help | DONE | dead toggles & fake support number removed; permission status + Open settings; Help steps |
| 4.1 | Backend: list/detail queries return rider charge, pin, slot, urgent, items unit/quality/image | DONE | guarded with `hasUrgentDeliveryColumns/hasOrderCouponColumns` for older DBs |
| 4.2 | Backend: cancel rider_tasks + notify rider on admin cancel / reassignment / admin-delivered | DONE | `utils/riderTaskEvents.ts`; single + bulk cancel; `assignRiderToOrder` notifies displaced rider |
| 4.3 | Backend: Expo push sender | DONE | `utils/expoPush.ts` (fetch → exp.host, chunked, prunes DeviceNotRegistered) + unit test |
| 5.1 | jest.setup native mocks → LoginScreen suite green | DONE | task-manager, location, notifications, device, constants, image-picker, netinfo, maps, socket.io, reanimated |
| 5.2 | New tests | DONE | i18n parity, taskMapping, offlineQueue, helpers, TaskCard, LoginScreen — 43 tests |
| 5.3 | typecheck + lint + test green; README | DONE | see §6 |
| G16 | Declare `expo-constants` in rider-app package.json | DONE | lockfile regenerated with `pnpm install --lockfile-only` (same pnpm 10.12.3 as `packageManager`) |
| 4.4 | Backend: Atta Chakki rider tasks actually created + type-aware rider flow | DONE | `createAttaRiderTask` on admin rider assignment; fixed dead `status='active'` rider check (G21); pickup/deliver map to `picked_up/at_mill` and `out_for_delivery/delivered` |
| 4.5 | Backend: customer push on rider assigned / delivered; customer-cancel closes rider tasks | DONE | §8 (a)(b) closed |
| 3.8 | Rider app: atta wording on actions (Wheat collected / Dropped at mill / Flour collected) | DONE | DeliverSheet hides cash block for atta |

**Remaining:** none in code. Only the on-device smoke test (§6) is outstanding — it needs a physical phone and cannot be run from this session.

---

## 2. Project requirements the rider app must satisfy

Derived from `backend/src/controllers/rider.controller.ts`, `rider.routes.ts`,
`config/socket.ts`, `utils/assignRiderToOrder.ts`, `database/schema.sql`,
`ARCHITECTURE.md`, `README.md`, admin `riders.controller.ts`.

**Auth / account**
- R1. Login = phone + password (`POST /rider/login`). Admin creates riders; only `verified` + `active` riders may log in. Refresh via `/auth/refresh`, logout via `/auth/logout`.
- R2. A `403 Rider account is not active/verified` from `verifyRiderActive` must end the session gracefully (not a silent spinner).

**Duty (online/offline) & GPS**
- R3. Rider toggles `available`/`offline` (`PUT /rider/status`). Admin/OCP can assign only to riders not `offline`/`on_leave`.
- R4. While on duty, location streams to the server: socket `rider:location` (foreground) + `PUT /rider/location` (background task). Accuracy ≤ 20 m filter. Google Play prominent disclosure before permission.
- R5. Customers see live rider location on their tracking screen → tracking must survive app backgrounding (foreground service).

**Tasks**
- R6. Task list = `rider_tasks` for this rider: active (`assigned`, `in_progress`) and completed (`completed`); failed/cancelled are terminal.
- R7. Lifecycle: `assigned` → **Pick up** (`PUT /tasks/:id/pickup`) → `in_progress` → **Deliver** (`PUT /tasks/:id/deliver`) → `completed`. Rider may **fail** a task with a reason (`POST /tasks/:id/cancel`) — the order itself is untouched; admin resolves.
- R8. Order assignment already flips the order to `out_for_delivery`; delivery marks the order `delivered`, and for COD sets `paid_amount = total_amount` → the rider is collecting cash and must see the amount to collect.
- R9. New assignments arrive via socket `rider:new_assignment` (+ Expo push after 4.3).
- R10. Task detail must show: order number, delivery address + house number + landmark + area, map pin (or "no pin"), door picture, time slot/date, urgent flag, items (name, qty, unit fraction, quality), payment method + COD total, customer notes, atta request info for atta tasks.
- R11. Rider can **pin / adjust** the address GPS (`PUT /tasks/:id/pin-location`, ≤ 8 m accuracy for fresh pins) and **upload a door picture** (`POST /tasks/:id/door-picture`). Both persist on the address for future orders.

**Privacy-protected contact**
- R12. Customer name/phone are hidden unless the admin set `orders.show_customer_phone`. When hidden, "Call" goes through `POST /rider/call-request`, which returns 403 with an explanatory message — the app must show that message, not a generic error.
- R13. In-app chat per order (`GET/POST /chat/:orderId`, socket `chat:*`) — disabled once the order is delivered/cancelled.

**Earnings & cash**
- R14. Earnings = `orders.rider_delivery_charge`. `GET /rider/stats` gives today/week/month + payment: `totalCollected`, `totalEarned`, `codEarned`, `totalSettled`, `cashInHand`, `paymentPending`.
- R15. Admin receives COD cash from the rider (`rider_cash_settlements`); the rider must be able to see how much cash they are holding / owe.

**Platform**
- R16. English + Urdu UI.
- R17. Works offline for the duty-critical writes (pickup / deliver / off-duty) via a replay queue; 4xx never retried.
- R18. Expo SDK 54, RN 0.81, React 19; monorepo `pnpm` + `turbo`; CI runs `typecheck`, `lint`, `test` for every workspace.

---

## 3. Gap analysis — what was wrong and WHY it had to change

| ID | Sev | Finding (before) | Why | Fix | Status |
|---|---|---|---|---|---|
| G1 | H | App `TaskStatus` was a union of invented states (`picked_up`, `in_transit`, `pending`, `delivered`) mapped from backend; `failed` never handled. | R6/R7 — wrong buttons, untestable. | 1.3, 1.4 | DONE |
| G2 | H | GPS tracking started from three places; after restart only the background REST path ran (customers lost live tracking). | R4/R5; duplicate permission prompts violate Play policy. | 1.6 | DONE |
| G3 | H | Admin cancel did not cancel the rider's `rider_tasks` row or tell the rider; reassignment cancelled silently. | R6/R9 — rider drives to a cancelled order; pickup 409. | 4.2, 1.7 | DONE |
| G4 | H | Backend never sent push notifications (`firebase-admin` only used for OTP). Tokens stored, nothing sent. | R9 — backgrounded phone misses assignments. | 4.3, 1.8 | DONE |
| G5 | H | Delivery confirmation was Yes/No; COD amount buried; backend auto-marks paid. | R8/R15 — cash discrepancies. | 3.4 | DONE |
| G6 | M | Hidden-phone call → backend 403 with explanation; app showed generic error. | R12 | 1.5, 3.4 | DONE |
| G7 | M | "Report Problem" sent hardcoded note; admin got no reason. | R7 | 3.4 | DONE |
| G8 | M | WhatsApp template used the order UUID instead of order number. | R10 | 3.4 | DONE |
| G9 | M | Earnings "Details" synthesised from counts; `cashInHand/totalSettled` dropped; "Owes to Company" label ambiguity. | R14/R15 | 4.1, 1.3, 3.6 | DONE |
| G10 | M | Items showed `unit: ''`; backend omitted `unit/quality/weight_kg/product_image`. | R10 | 4.1 | DONE |
| G11 | M | Dead toggles (auto-accept, dark mode); fake support number. | Honesty | 3.7 | DONE |
| G12 | M | Offline queue couldn't replay `update_status`; global `isLoading` flashed spinners everywhere. | R17 | 1.9 | DONE |
| G13 | M | `LoginScreen.test.tsx` failed on CI (`ExpoTaskManager` not mocked). | R18 | 5.1 | DONE |
| G14 | L | Tab bar = letters "D/T/P"; chat was a 350 px box inside a ScrollView. | UX | 2.1, 3.5 | DONE |
| G15 | L | ~150 inline `language === 'ur' ? … : …` ternaries. | R16 | 1.2 | DONE |
| G16 | L | `expo-constants` imported but undeclared. | hygiene | — | DEFERRED (D7) |
| G17 | L | Duplicate design tokens across files. | consistency | 1.1 | DONE |
| G18 | M | *(found during build)* `tokenRefresh.onRefreshFailed` called `logout()` which fires server calls with dead tokens; Login showed no reason. | R2 | 1.5 | DONE — `endSession(t('auth.sessionEnded'))` |
| G19 | M | *(found during build)* admin "mark delivered" (`updateOrderStatus`) left the rider task `in_progress` (only the payment-received fast path closed it). | R6 | 4.2 | DONE |
| G20 | L | *(incidental)* backend lint failed on a pre-existing unused arg in `utils/siteSettings.ts` (`--max-warnings=0`). | CI red | — | DONE (`_userId`) |
| G21 | H | *(found in session 2)* admin atta rider assignment checked `riders.status = 'active'` — a value that does not exist in the enum (`available/busy/offline/on_leave`) — so **every** atta rider assignment failed with "Active rider not found", and no `rider_tasks` row was ever created for atta work. | R6/R10 — the whole Atta Chakki rider flow was dead end-to-end. | 4.4 | DONE |

---

## 4. Plan — HOW each item was done

### Phase 1 — Foundation
- **1.1 Theme** `src/theme/index.ts`: `colors` (brand green family, semantic tones, neutrals, surfaces), `spacing`, `radius`, `typography`, `shadow`, `TOUCH_TARGET=48`, `toneColors` for badges/banners.
- **1.2 i18n** `src/i18n/{en,ur,index}.ts`: `en` is the canonical key set; `ur: Record<TranslationKey,string>` so a missing Urdu key is a compile error. `t()` (services), `useT()` (components, re-renders on language change), `tEnum()` for backend enums (`taskStatus`, `orderStatus`, `attaStatus`, `unit`, `paymentMethod`, `vehicle`) with readable fallback.
- **1.3 Types** `src/types/index.ts`: backend enums re-exported from `@freshbazar/shared-types`; `Task` carries everything the screens need; `taskReference()` helper; `PROBLEM_REASONS`; nav param lists.
- **1.4 task.service** `mapTask()` handles list + detail rows, derives `codAmount` (unpaid COD → total; completed COD → paid amount), `hasPin`, `phoneVisible`; `fixImageUrl` re-hosts LAN URLs.
- **1.5 api.ts** `ApiError`, `getApiErrorMessage`, `getApiErrorStatus`, `isClientError`, `isNetworkError`; 401 → refresh+retry; refresh failure → `endSession(sessionEnded)`; 403 `/rider account/i` → `endSession(message)`.
- **1.6 dutyStore** persisted `isOnDuty`; `goOnDuty()` = permissions → `PUT /status` → foreground watcher (socket emit via `emitLocation`) + background task (REST) ; `goOffDuty()` queues `update_status` when offline; `resume()` re-arms on app start / flips off duty when permission revoked; `teardown()` for logout. `location.service` reduced to pure expo-location plumbing.
- **1.7 socket.service** handlers for `rider:new_assignment`, `rider:task_cancelled`, `order:update` (terminal → refresh), `chat:notification` (suppressed while that chat is open via `setActiveChatOrder`); `connect` re-syncs tasks.
- **1.8 notification.service** channels (`new-task` MAX importance, `task-update`, `chat`), `bootstrap(onTap)` → permission, token upload (`PUT /rider/fcm-token`), tap listener incl. cold start; respects `notificationsEnabled/soundEnabled/vibrationEnabled`.
- **1.9 offlineQueue** `subscribe()`, ordered replay that stops on first network failure, 4xx dropped, 3 retries, 24 h expiry. `taskStore.processQueuedAction` handles `update_status`, `pickup`, `deliver`. `taskStore` uses `pendingTaskIds` + per-list loading flags; optimistic local flip + `QueuedOfflineError` when offline.

### Phase 2 — Shell
- **2.1** `AppNavigator`: `MainTabs` (Home/Tasks/Earnings/Profile, MaterialCommunityIcons, labels via `useT`, active-count badge) + root stack (`TaskDetail`, `Chat`, `Settings`, `Help`). `SessionEffects` (mounted only when signed in): socket connect, `duty.resume()`, `refreshAll`, `refreshProfile`, notification bootstrap + tap routing, AppState foreground re-sync, offline-queue replay on reconnect.
- **2.2** `components/ui/*` as listed in §1; all accept `StyleProp<ViewStyle>`.

### Phase 3 — Screens
- **3.1 Login** sends digits only (backend normalises `03xx`/`92xx`), shows `sessionEndReason` banner + store error banner, keyboard-safe, `testID`s for tests.
- **3.2 Home** dark header, `DutyCard` (animated switch + GPS line), confirm when going off duty with active tasks, permission-denied → Open settings, today tiles (deliveries / earned / **cash in hand**), next task card + Navigate/Open, other active tasks compact, banners.
- **3.3 Tasks** `SegmentedControl` Active/Completed, skeleton first load, error banner + retry, cards with distance from `duty.lastFix`.
- **3.4 TaskDetail** seeds from store for instant render, re-fetches, subscribes to `order:update`; sections per R10; sticky `BottomActionBar` (`primaryActionFor(status)`), `DeliverSheet` (cash checkbox required when `codAmount>0`, optional note), `ProblemSheet` (6 reasons, details required for "Other"; note stored as `Label: details`), contact card (visible phone → Call/WhatsApp; hidden → "Call via Fresh Bazar" surfacing backend 403 text), Chat button, pin/adjust (≤ 8 m), door photo (camera permission handled).
- **3.5 Chat** `ChatScreen` + `useOrderChat` (socket-first, REST fallback, optimistic bubbles with pending/failed states, typing indicator, reconnect re-subscribe).
- **3.6 Earnings** period chips → earnings/deliveries tiles; cash panel; lifetime tiles; completed list with `riderCharge` (`—` when backend sent none) and collected COD.
- **3.7 Profile/Settings/Help** as in §1.

### Phase 4 — Backend (additive, rider-facing)
- **4.1** `rider.controller.ts`: shared `taskListOrderColumns(urgentReady)` + `TASK_LIST_JOINS` (orders, users, addresses, time_slots, atta_requests) for active/completed; detail adds `paid_amount, rider_delivery_charge, subtotal, discount_amount, coupon_discount*, is_urgent_delivery*, urgent_delivery_eta*` (`*` guarded by schema probes); items select adds `product_image, unit, quality, weight_kg`.
- **4.2** `utils/riderTaskEvents.ts`: `cancelActiveRiderTasks(client, orderId, {note})` (returns affected tasks), `notifyRiderTasksCancelled()` (socket `rider:task_cancelled` + push), `pushNewAssignment()`. Wired into `assignRiderToOrder` (displaced rider), `admin/orders.controller.updateOrderStatus` (cancel → cancel tasks; delivered → complete tasks) and `bulkUpdateOrderStatus`.
- **4.3** `utils/expoPush.ts`: `sendExpoPushToUsers(userIds, message)` reads `users.device_tokens`, keeps `Expo(nent)PushToken[…]`, POSTs to `exp.host` in chunks of 100 via Node `fetch`, prunes `DeviceNotRegistered` tokens, never throws. Pure helpers unit-tested.

### Phase 4b — Atta Chakki + customer notifications (session 2)
- **4.4** `utils/riderTaskEvents.createAttaRiderTask(client, attaRequestId, riderId, type)`: cancels a different rider's active task of the same type, keeps an existing task for the same rider (idempotent), inserts `rider_tasks` (`atta_pickup` / `atta_delivery`) with the customer's address + GPS as pickup/delivery point, marks the rider `busy`. Called from `admin updateAttaStatus` when `pickup_rider_id` / `delivery_rider_id` is set (status `picked_up` / `out_for_delivery`); `notifyAttaAssignment` emits `rider:new_assignment` + push. Rider app flow: `atta_pickup` — "Wheat collected" (→ `picked_up`) then "Dropped at mill" (→ `at_mill`); `atta_delivery` — "Flour collected" (→ `out_for_delivery`) then "Delivered" (→ `delivered`, counts toward `total_deliveries`).
- **4.5** `assignRiderToOrder` pushes "Your order is on the way" to the customer; rider `confirmDelivery` pushes "Order delivered"; customer `cancelOrder` runs `cancelActiveRiderTasks` + notify (defensive — customers cannot cancel `out_for_delivery` today).
- **3.8** TaskDetail picks atta-specific labels; `DeliverSheet` skips the cash block for atta tasks (atta payment is not surfaced to riders — see D10).

### Phase 5 — Quality gates
- **5.1** `jest.setup.js` mocks listed in §1.
- **5.2** `__tests__/i18n.test.ts` (parity, placeholders, interpolation, tEnum), `taskMapping.test.ts`, `offlineQueue.test.ts`, `helpers.test.ts`, `TaskCard.test.tsx`, `LoginScreen.test.tsx`.
- **5.3** README rewritten; this log.

---

## 5. Work log (newest first)

### 2026-10-05 — Session 2 — close every remaining item, merge to main
- G16 closed: `expo-constants` declared; lockfile regenerated online (`pnpm install --lockfile-only`, 7 min) — diff is peer-suffix churn produced by the same pnpm version, safe for `--frozen-lockfile`.
- Found + fixed G21 (atta rider assignment dead); implemented 4.4 / 4.5 / 3.8.
- Gates re-run (see §6). Branch merged into `main` with `--no-ff` and pushed; feature branch pushed too.
- Authorship check: every commit on this branch is authored and committed by `AQSANDHU <aq.sandhu786@gmail.com>` (the configured git user). Older `main` history contains 12 commits by other identities (`Kimi Fix Swarm`, `agent@example.com`, `Aqsa Sandhu noreply`); rewriting those would force-push `main` and change every SHA since, so it was **not** done without explicit confirmation.

### 2026-10-05 — Session 1 (continued) — rebuild implemented end-to-end
- Phase 1–5 implemented as per §4. Deleted: `OrderChat.tsx`, `StatsCard.tsx`, `StatusToggle.tsx`, `locationStore.ts`, `useLocation.ts`, `useTasks.ts`, `AuthNavigator.tsx`, `TasksNavigator.tsx`, `ProfileNavigator.tsx`. Renamed `DashboardScreen` → `HomeScreen`.
- Backend 4.1–4.3 implemented; backend typecheck/lint/tests green (fixed pre-existing lint warning in `siteSettings.ts`).
- Attempted `git push` → credential prompt not available in this session (see §0 banner).
- Lockfile: declaring `expo-constants` forced a 186+/66− lockfile churn even with `pnpm install --lockfile-only` (peer-suffix re-resolution unrelated to this change) → reverted; see D7.

### 2026-10-05 — Session 1 — analysis
- Read backend rider surface, admin rider controller, chat/notification controllers, every rider-app file, customer-app tokens/jest setup, CI workflows.
- Baseline: typecheck ✅, test ❌ (LoginScreen suite), lint 12 warnings.
- Wrote §2–§4. Created branch `feat/rider-app-rebuild`.

---

## 6. Verification evidence (latest run — 2026-10-05, session 2, after 4.4/4.5/3.8/G16)

| Workspace | Command | Result |
|---|---|---|
| rider-app | `pnpm typecheck` | ✅ clean |
| rider-app | `pnpm lint` | ✅ 0 errors, 0 warnings (was 12 warnings) |
| rider-app | `pnpm test` | ✅ 6 suites, 43 tests (was 1 suite failing) |
| backend | `pnpm typecheck` | ✅ clean |
| backend | `pnpm lint` (`--max-warnings=0`) | ✅ clean (was 1 warning) |
| backend | `npx jest --coverage=false src/__tests__` | ✅ 2 suites, 6 tests (incl. new `expoPush.test.ts`) |
| root | `pnpm install --lockfile-only` | ✅ lockfile consistent with every workspace `package.json` |

Not verified in this session (no device/emulator available): on-device GPS/background-service behaviour, Expo push delivery end-to-end, Google Maps rendering. These paths reuse the previously shipped expo-location / react-native-maps configuration; the first real-device smoke test should cover: go on duty → background app → admin sees location; admin assigns → phone (backgrounded) receives push; deliver COD flow.

---

## 7. Decisions, assumptions, deferred items

- **D1** Backend changes limited to additive columns, rider-task cancellation side-effects and an Expo push sender. No schema migration needed (all columns exist; newer columns are probe-guarded).
- **D2** *(superseded in session 2 by 4.4)* Atta rider tasks are now created by the backend on admin rider assignment and the rider app drives the `picked_up → at_mill` and `out_for_delivery → delivered` transitions.
- **D10** Atta tasks carry no rider pay: `rider_delivery_charge` exists only on `orders`, and `atta_requests` has no per-rider rate. Earnings screens therefore show atta deliveries with `—`. Needs a product decision (flat atta rate per rider?) before any backend change.
- **D3** No dark mode (`userInterfaceStyle: light`); the dead toggle was removed rather than half-implemented.
- **D4** Rider self-service account deletion DEFERRED — rider accounts are admin-managed.
- **D5** Layout stays LTR for Urdu (matches customer app); Urdu text renders RTL within its own `Text`.
- **D6** Card distance is a straight-line estimate from the last GPS fix (labelled `~`), not routing.
- **D7** *(closed in session 2)* `expo-constants` is now declared; the lockfile was regenerated online with the pinned pnpm version, so the peer-suffix churn is the canonical output and `--frozen-lockfile` accepts it.
- **D8** Problem reasons are stored in `rider_tasks.notes` as an English label + rider details so admins read one consistent string regardless of the rider's UI language.
- **D9** `cashInHand` on Home is emphasised (warning tone) only when `paymentPending > 0`.

## 8. Follow-ups
- ~~Backend: customer-cancel path closes rider tasks~~ — done (4.5).
- ~~Backend: Expo push to customers for rider assigned / delivered~~ — done (4.5).
- **Open:** real-device smoke test of duty → background GPS → admin assign → push → COD deliver, and atta pickup/delivery (needs a phone; see §6 note).
- **Open (product decision):** rider pay for atta tasks (D10).
- **Open (needs your go-ahead):** rewrite the 12 older `main` commits authored by other identities to `AQSANDHU <aq.sandhu786@gmail.com>` — requires `git filter-repo`/rebase + force-push of `main`.
