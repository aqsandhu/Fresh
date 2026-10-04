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
4. Verify baseline before touching code:
   ```bash
   cd rider-app && pnpm typecheck && pnpm lint && pnpm test
   ```
5. Continue the item, update §1 + §5, commit with a `feat(rider-app): …` / `fix(rider-app): …` message, push.

Branch: `feat/rider-app-rebuild` (based on `fix/backend-hardening` @ `5d9e3ed`).
Remote: `origin` → https://github.com/aqsandhu/Fresh.git

---

## 1. Status snapshot

Legend: `TODO` not started · `WIP` in progress · `DONE` complete + verified · `DEFERRED` consciously postponed (see §7)

| # | Phase / Item | Status | Commit |
|---|---|---|---|
| 0.1 | Branch + this log | DONE | (this commit) |
| 1.1 | Theme tokens (`src/theme`) — colors/spacing/type/radius/shadow | TODO | |
| 1.2 | i18n module (`src/i18n`) — complete EN/UR dictionary + `useT()` | TODO | |
| 1.3 | Types aligned to backend (TaskStatus, Task, Stats) | TODO | |
| 1.4 | `task.service` remap (rider charge, items unit/quality, COD amount) | TODO | |
| 1.5 | `api.ts` — 403 rider-blocked handling, error message util | TODO | |
| 1.6 | `dutyStore` — single owner of on-duty + GPS lifecycle | TODO | |
| 1.7 | socket.service — task_cancelled / order cancel / chat notification | TODO | |
| 1.8 | notification.service — tap → TaskDetail deep link, token after hydrate | TODO | |
| 1.9 | offlineQueue — handle `update_status`, replay via dutyStore | TODO | |
| 2.1 | Navigation shell — real tab icons/labels, Chat + Settings routes | TODO | |
| 2.2 | Shared UI kit — ScreenHeader, Card, Badge, EmptyState, Banner, BottomBar | TODO | |
| 3.1 | LoginScreen redesign | TODO | |
| 3.2 | HomeScreen (duty) redesign | TODO | |
| 3.3 | TasksListScreen + TaskCard redesign | TODO | |
| 3.4 | TaskDetailScreen redesign (sticky actions, COD confirm, problem reasons) | TODO | |
| 3.5 | ChatScreen (full screen) | TODO | |
| 3.6 | EarningsScreen redesign (real per-order list, cash due) | TODO | |
| 3.7 | ProfileScreen + SettingsScreen cleanup (remove dead toggles) | TODO | |
| 4.1 | Backend: rider task queries return rider charge, item unit/quality/image | TODO | |
| 4.2 | Backend: cancel rider_tasks + notify rider on admin order cancel / reassignment | TODO | |
| 4.3 | Backend: Expo push sender (new assignment / task cancelled) | TODO | |
| 5.1 | jest.setup native mocks → fix failing LoginScreen test | TODO | |
| 5.2 | New tests: i18n parity, task mapping, duty logic, offline queue | TODO | |
| 5.3 | typecheck + lint + test green; README refresh | TODO | |

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
- R9. New assignments arrive via socket `rider:new_assignment`. (Push notifications were never sent by the backend — see Gap G9.)
- R10. Task detail must show: order number, delivery address + house number + landmark + area, map pin (or "no pin"), door picture, time slot/date, urgent flag, items (name, qty, unit fraction, quality), payment method + COD total, customer notes, atta request info for atta tasks.
- R11. Rider can **pin / adjust** the address GPS (`PUT /tasks/:id/pin-location`, ≤ 8 m accuracy for fresh pins) and **upload a door picture** (`POST /tasks/:id/door-picture`). Both persist on the address for future orders.

**Privacy-protected contact**
- R12. Customer name/phone are hidden unless the admin set `orders.show_customer_phone`. When hidden, "Call" goes through `POST /rider/call-request`, which returns 403 with an explanatory message — the app must show that message, not a generic error.
- R13. In-app chat per order (`GET/POST /chat/:orderId`, socket `chat:*`) — disabled once the order is delivered/cancelled.

**Earnings & cash**
- R14. Earnings = `orders.rider_delivery_charge` (snapshot of the admin-set per-slot rate at assignment). `GET /rider/stats` gives today/week/month + payment: `totalCollected`, `totalEarned`, `codEarned`, `totalSettled`, `cashInHand`, `paymentPending`.
- R15. Admin receives COD cash from the rider (`rider_cash_settlements`); the rider must be able to see how much cash they are holding / owe.

**Platform**
- R16. English + Urdu UI (existing requirement; Urdu strings already exist but are inline ternaries).
- R17. Works offline for the two duty-critical writes (pickup / deliver) via a replay queue; 4xx never retried.
- R18. Expo SDK 54, RN 0.81, React 19; monorepo `pnpm` + `turbo`; CI runs `typecheck`, `lint`, `test` for every workspace.

---

## 3. Gap analysis — what is wrong today and WHY it must change

Each gap maps to requirements above. Severity: **H** blocks a rider doing the job · **M** wrong/misleading · **L** polish.

| ID | Sev | Finding (current state) | Why it must change | Fix item |
|---|---|---|---|---|
| G1 | H | `TaskStatus` in the app is a union of invented states (`picked_up`, `in_transit`, `pending`, `delivered`) mapped from backend (`in_progress`→`in_transit`, `completed`→`delivered`). Screens branch on both sets; `failed` is never handled. | R6/R7. Divergent state names cause wrong buttons (e.g. a `failed` task shows nothing) and make tests meaningless. | 1.3, 1.4 |
| G2 | H | GPS tracking is started from **three** places (AppNavigator effect, Dashboard toggle, locationStore) with overlapping permission prompts; foreground socket stream is only started from the Dashboard toggle, so after an app restart with `isOnline=true` persisted, only the background REST path runs. | R4/R5. Customers lose live tracking; duplicated starts risk double permission dialogs (Play policy). | 1.6 |
| G3 | H | Admin cancelling an order does **not** cancel the rider's `rider_tasks` row or tell the rider. Reassignment cancels the old task silently. | R6/R9. Rider drives to a cancelled order; pickup then fails with 409. | 4.2, 1.7 |
| G4 | H | Backend never sends push notifications (`firebase-admin` only used for OTP; no Expo push code). App registers tokens into `users.device_tokens` for nothing. Rider is only notified while the socket is alive. | R9. A backgrounded phone misses new assignments. | 4.3, 1.8 |
| G5 | H | Delivery confirmation is a bare Yes/No; the COD amount to collect is buried in the items card; backend auto-marks the order paid. | R8/R15. Cash mistakes directly become `cashInHand` discrepancies. | 3.4 |
| G6 | M | Call button on hidden-phone orders → backend 403 with a clear message, app shows generic "Failed to send call request". | R12. Rider thinks the app is broken. | 1.5, 3.4 |
| G7 | M | "Report Problem" fails the task with hardcoded note `Reported by rider`; admin gets no reason. | R7. Admin cannot resolve without context. | 3.4 |
| G8 | M | WhatsApp template uses `task.orderId` (a UUID) instead of the order number. | R10. Customer receives a meaningless ID. | 3.4 |
| G9 | M | Earnings "Details" list is synthesised from counts (`N deliveries completed`) because list endpoints don't return `rider_delivery_charge`; `cashInHand`/`totalSettled` returned by `/rider/stats` are dropped by the app type. Dashboard labels `paymentPending` as "Owes to Company" (it is `collected − settled − codEarned`, i.e. the same quantity as cash due; keep one label). | R14/R15. Rider can't reconcile cash with admin. | 4.1, 1.3, 3.6 |
| G10 | M | Items show `unit: ''` — backend item query omits `unit`, `quality`, `weight_kg`, `product_image`. | R10. Rider can't verify half-kg vs full-kg at the door. | 4.1 |
| G11 | M | Settings has **dead toggles**: Auto-accept tasks, Dark mode (no effect anywhere); support phone is a fake `+923001234567`. | Honesty/quality: controls that do nothing erode trust. | 3.7 |
| G12 | M | Offline queue: `logout` enqueues `update_status` but `processQueuedAction` throws "Unsupported" for it; `isLoading` toggles across the whole store on every call (global spinners flash). | R17. | 1.9 |
| G13 | M | `rider-app/__tests__/LoginScreen.test.tsx` fails on CI (`Cannot find native module 'ExpoTaskManager'`) — `pnpm test` exits non-zero for the workspace. | R18. CI red. | 5.1 |
| G14 | L | Tab bar icons are the letters "D / T / P" with no labels; chat is a 350 px box nested inside a ScrollView (FlatList-in-ScrollView warning, cramped). | UX quality for outdoor use. | 2.1, 3.5 |
| G15 | L | i18n is ~150 inline `language === 'ur' ? … : …` ternaries plus a half-used `TRANSLATIONS` map. | R16. Missing Urdu strings slip through; untestable. | 1.2 |
| G16 | L | `expo-constants` imported but not declared in `package.json` (works transitively). | R18 hygiene. | 1.1 |
| G17 | L | `TRANSLATIONS`/`constants.ts` duplicates design tokens; `ErrorBoundary` has its own colour palette. | Consistency. | 1.1 |

Verified baseline (2026-10-05): `pnpm typecheck` ✅ · `pnpm test` ❌ (1 suite fails, 19 tests pass) · `pnpm lint` not yet run.

---

## 4. Plan — HOW each item will be done

### Phase 1 — Foundation (no visual change yet)
- **1.1 Theme** `src/theme/index.ts`: `colors` (brand green `#10B981` family, semantic: success/warning/danger/info, neutrals), `spacing`, `radius`, `typography` (sizes/weights/lineHeights), `shadow` presets, `hitSlop`. `utils/constants.ts` keeps re-exporting `COLORS/SPACING/BORDER_RADIUS/FONT_SIZES` from theme so untouched files compile. Add `expo-constants` to deps.
- **1.2 i18n** `src/i18n/{en.ts,ur.ts,index.ts}`: typed key union from `en`; `ur` must satisfy `Record<keyof typeof en, string>` (TS enforces parity). `t(key, params?)` with `{name}` interpolation; `useT()` hook reads `settingsStore.language`. Test asserts no empty Urdu strings.
- **1.3 Types** `TaskStatus = 'assigned'|'in_progress'|'completed'|'cancelled'|'failed'` (= backend). `Task` gains `orderStatus`, `riderCharge`, `codAmount` (total when `payment_method==='cash_on_delivery'` and not paid), `isUrgent`, `urgentEta`, `items[].unitLabel/quality/weightKg/image`, `attaStatus`, `wheatQuantityKg`, `phoneVisible`. `RiderStatsData.payment` gains `codEarned/totalSettled/cashInHand`.
- **1.4 task.service** one `mapTask()`; `markDelivered` → `PUT /tasks/:id/deliver`; `getEarnings` removed (fabricated) in favour of completed tasks + stats. Helper `taskStatusMeta(status)` → label/color/icon.
- **1.5 api.ts** `getApiErrorMessage(err)` (prefers backend `message`); response interceptor: on `403` whose message matches `/rider account/i` → `authStore.blockSession(message)` (logout + show reason on Login).
- **1.6 dutyStore** (zustand, persisted `isOnDuty`): `goOnDuty()` = disclosure → permissions → `PUT /status available` → start foreground watcher (socket emit) + background task (REST) → set state; `goOffDuty()` reverse; `resume()` on app start when persisted on-duty (re-arms tracking without re-prompting if permission already granted; if permission revoked → flips off duty). Only this store calls `location.service`. AppNavigator/Dashboard/locationStore stop calling tracking directly; `locationStore` reduced to current position cache.
- **1.7 socket** add handlers: `rider:task_cancelled` → refresh tasks + local notification; `order:update` with `status==='cancelled'` on a subscribed order → refresh; `chat:notification` → local notification when app foregrounded screen isn't that chat.
- **1.8 notifications** `handleNotificationTap(data)` → if `taskId` navigate `TaskDetail`; register push token after `hydrateAuth` as well as login; respect `settings.notificationsEnabled` for local notifications.
- **1.9 offlineQueue** `processQueuedAction` handles `update_status` (→ `authService.updateOnlineStatus`), `pickup`, `deliver`, `call_request`; store methods use per-action loading flags (`pendingTaskIds`) instead of a global `isLoading`.

### Phase 2 — Shell
- **2.1** Tabs: Home (`home-variant`), Tasks (`clipboard-list`), Earnings (`wallet`), Profile (`account`), labels in current language, badge on Tasks = active count. Root stack adds `Chat {orderId, orderNumber}` and `Settings`. Keep `TaskDetail` on root so Home + Tasks can open it.
- **2.2** `src/components/ui/`: `ScreenHeader`, `Card`, `Badge`, `EmptyState`, `Banner` (info/warning/danger), `BottomActionBar` (safe-area aware), `Row`, `SectionTitle`, `Skeleton`. Existing `Button` kept, gains `textStyle` + `accessibilityLabel`.

### Phase 3 — Screens
- **3.1 Login**: same API; remove local "strip leading 0" (backend normalises); show `blockedReason` banner; keyboard-safe; version from `expo-constants`.
- **3.2 Home**: `DutyCard` (big toggle + GPS/accuracy/last-update + background-permission nudge), `TodayStrip` (deliveries, earned, cash in hand), `NextTaskCard` (first active task, Navigate + Open), active list, offline/queue banners. Weekly/monthly stats move to Earnings.
- **3.3 Tasks**: Active/Completed segmented control, pull-to-refresh, cards show order #, type chip, status chip, address + house #, slot/date, COD amount, distance (haversine from last known position when both coords exist).
- **3.4 TaskDetail**: sections as R10; sticky `BottomActionBar`: `assigned` → "Picked up"; `in_progress` → "Delivered"; terminal → status pill. Delivered flow = `DeliverSheet` (COD: shows amount, "Cash received Rs X" checkbox, optional note; non-COD: note only). Problem flow = `ProblemSheet` with reasons (customer unreachable / wrong address / customer refused / damaged items / other + text, min 5 chars). Contact card: when `customerPhone` present → Call + WhatsApp (uses `orderNumber`), else "Call via Fresh Bazar" (proxy; 403 message surfaced) + "Chat" button → ChatScreen. Map: `MapPreview` + Navigate (Google Maps app if installed else geo URL / Apple Maps) + pin/adjust (existing accurate-GPS logic retained).
- **3.5 Chat**: `ChatScreen` full-screen using existing `OrderChat` logic refactored into `useOrderChat(orderId)` hook; header shows order #; input disabled when order terminal.
- **3.6 Earnings**: period selector (Today/This week/Last week/This month/Last month) from `/rider/stats`; `CashPanel` (Collected, Earned, Settled, **Cash in hand / due to company**); list = completed tasks with `riderCharge` and COD amount per order (from 4.1).
- **3.7 Profile/Settings**: Profile shows identity, vehicle, rating (with count if available), totals, menu (Settings, Help). Settings: language, notifications, sound/vibration (applied to local notification channel options), location permission status + "Open settings", app version, logout. Remove auto-accept/dark-mode/fake support number.

### Phase 4 — Backend (minimal, rider-facing, logged here)
- **4.1** `rider.controller.ts`: add `o.rider_delivery_charge, o.is_urgent_delivery, o.urgent_delivery_eta, o.paid_amount, ar.request_number` to active/completed/detail selects; items select adds `unit, quality, weight_kg, product_image`. Pure additive columns.
- **4.2** `admin/orders.controller.ts` (single + bulk cancel) + `utils/assignRiderToOrder.ts`: when cancelling/reassigning, `UPDATE rider_tasks SET status='cancelled'` for active tasks on that order and `emitToUser(riderUserId,'rider:task_cancelled',{taskId,orderId,orderNumber,reason})`. Extract to `utils/riderTaskEvents.ts`.
- **4.3** `utils/expoPush.ts`: `sendExpoPush(userIds, {title, body, data})` → reads `users.device_tokens`, filters `ExponentPushToken[...]`, POSTs to `https://exp.host/--/api/v2/push/send` in chunks of 100 via global `fetch`, logs + swallows errors (never blocks the request). Called from `assignRiderToOrder` (new assignment) and 4.2 (cancelled). Unit test with mocked fetch.

### Phase 5 — Quality gates
- **5.1** `jest.setup.js` mocks: `expo-task-manager`, `expo-location`, `expo-notifications`, `expo-device`, `expo-constants`, `react-native-maps`, `@react-native-community/netinfo`, `socket.io-client`, `react-native-reanimated` (official mock).
- **5.2** tests: `i18n.test.ts` (parity + interpolation), `taskMapping.test.ts`, `dutyStore.test.ts` (state machine with mocked services), `offlineQueue.test.ts`, `helpers.test.ts` (kept), screen smoke tests for Login/Tasks/TaskDetail.
- **5.3** `pnpm typecheck && pnpm lint && pnpm test` green in `rider-app`; `pnpm --filter @freshbazar/backend typecheck && test` green; README rewritten to match.

---

## 5. Work log (newest first)

### 2026-10-05 — Session 1
- Read backend rider surface (routes, controller, socket, assignment util, order state machine, schema, migrations 28/29/36/41/50/52), admin rider controller (stats, per-slot charges, cash settlements), chat + notification controllers, every rider-app file, customer-app design tokens/jest setup, CI workflows.
- Ran baseline: typecheck ✅, test ❌ (LoginScreen suite: ExpoTaskManager not mocked).
- Wrote §2–§4 of this log. Created branch `feat/rider-app-rebuild`.

---

## 6. Verification evidence

| Date | Command | Result |
|---|---|---|
| 2026-10-05 | `rider-app: pnpm typecheck` | ✅ clean |
| 2026-10-05 | `rider-app: pnpm test` | ❌ 1 suite failed (native mock), 19 tests passed |

---

## 7. Decisions, assumptions, deferred items

- **D1** Backend changes are limited to additive rider-facing columns, rider-task cancellation side-effects, and an Expo push sender. No schema migration is required (all columns already exist).
- **D2** Atta Chakki rider tasks (`atta_pickup`/`atta_delivery`) are rendered generically (request #, wheat kg, status) because **no backend code creates atta rider tasks today** (`grep` finds no INSERT with those task types). Full atta task flow is DEFERRED until the backend creates them.
- **D3** No dark mode: `userInterfaceStyle: light` in `app.json`; a dead toggle is removed rather than half-implemented.
- **D4** Rider self-service account deletion is DEFERRED: rider accounts are admin-managed (`/auth/delete-account` exists for customers); Play Store deletion requirement is satisfied by admin-side removal + the published privacy policy.
- **D5** Layout stays LTR for Urdu (matches current app and customer app); Urdu text renders RTL within its own `Text`.
- **D6** Distance shown on cards is a straight-line estimate from the last known rider position (clearly labelled "~"), not a routing distance — no routing API exists in the stack.
