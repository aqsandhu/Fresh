# Fresh Bazar Rider App

React Native (Expo SDK 54) app for Fresh Bazar delivery riders. Built for one-handed,
outdoor use: large touch targets, a single unmistakable primary action per task, and
offline-safe duty writes.

> Rebuild status, requirements, gap analysis and the resume guide live in
> [`REBUILD_LOG.md`](./REBUILD_LOG.md).

## What the rider can do

| Area | Behaviour |
|---|---|
| **Sign in** | Phone + password issued by the admin (`POST /rider/login`). Deactivated / unverified accounts are signed out with the backend's reason shown on the Login screen. |
| **Duty** | One switch on Home. Going on duty runs the Play-policy disclosure → location permission → `PUT /rider/status available` → GPS streaming (foreground via socket `rider:location`, background via `PUT /rider/location`). Tracking resumes after an app restart and stops when permission is revoked. |
| **Tasks** | Active / Completed lists straight from `rider_tasks`. Cards show order #, house number, slot, urgent flag, straight-line distance and the **cash to collect**. |
| **Task detail** | Address + map pin (navigate / pin / adjust), door photo, items with unit fraction + quality, totals, payment block, customer notes, privacy-gated contact (Call / WhatsApp or "Call via Fresh Bazar"), chat, atta request info. Sticky bottom bar: **Picked up → Delivered**, plus **Report a problem** (reason + details → `POST /tasks/:id/cancel`). |
| **Delivery confirm** | COD orders require the rider to confirm the exact cash collected before `PUT /tasks/:id/deliver`. |
| **Offline** | Pickup / deliver / off-duty writes made without connectivity are queued and replayed in order when the network returns; 4xx responses are never retried. |
| **Chat** | Full-screen per-order chat (socket first, REST fallback) with optimistic sends and retry. |
| **Earnings** | Period stats from `/rider/stats`, cash panel (collected − your earnings − settled = **due to company**), per-delivery earnings list. |
| **Notifications** | Local notifications for new / cancelled tasks and chat; Expo push token registered so the backend can reach a backgrounded phone. Tapping opens the task. |
| **Languages** | English + Urdu, every string in `src/i18n` (TypeScript enforces parity). |

## Project structure

```
rider-app/
├── App.tsx                      # hydrate session → navigator
├── src/
│   ├── theme/                   # colours, spacing, radius, typography, shadows
│   ├── i18n/                    # en.ts (canonical keys), ur.ts, t()/useT()/tEnum()
│   ├── types/                   # Task / Rider / stats shapes (mirror backend enums)
│   ├── navigation/              # tabs (Home, Tasks, Earnings, Profile) + root stack
│   ├── screens/
│   │   ├── auth/LoginScreen
│   │   ├── home/HomeScreen      # duty switch, today strip, next task
│   │   ├── tasks/TasksList · TaskDetail · Chat
│   │   ├── profile/Earnings · Profile
│   │   └── settings/Settings · Help
│   ├── components/
│   │   ├── ui/                  # ScreenHeader, Card, Badge, Banner, Sheet, BottomActionBar…
│   │   ├── TaskCard, DutyCard, MapPreview, Button, BrandLogo, ErrorBoundary
│   ├── store/                   # zustand: authStore, dutyStore, taskStore, settingsStore
│   ├── services/                # api (axios + refresh), task, auth, location, socket, notification
│   ├── hooks/                   # useOnlineStatus, useOrderChat
│   └── utils/                   # constants (API URL, GPS thresholds), helpers, offlineQueue, taskMeta
└── __tests__/                   # jest-expo unit + component tests
```

### Key design rules

- **`dutyStore` is the only owner of GPS lifecycle.** Nothing else starts or stops tracking.
- **Task states are the backend's**: `assigned · in_progress · completed · cancelled · failed`.
- **Copy lives in `src/i18n`.** Adding an English key without its Urdu twin is a type error.
- **Money is never fabricated.** Earnings come from `orders.rider_delivery_charge`; the cash
  panel uses the backend's `payment` block.

## Backend contract (what this app calls)

```
POST /rider/login                     PUT  /rider/status            PUT  /rider/location
GET  /rider/profile                   PUT  /rider/fcm-token         GET  /rider/stats
GET  /rider/tasks/active              GET  /rider/tasks/completed   GET  /rider/stats/today
GET  /rider/tasks/:id                 PUT  /rider/tasks/:id/pickup  PUT  /rider/tasks/:id/deliver
POST /rider/tasks/:id/cancel          PUT  /rider/tasks/:id/pin-location
POST /rider/tasks/:id/door-picture    POST /rider/call-request
GET/POST /chat/:orderId               POST /auth/refresh            POST /auth/logout
Socket: rider:new_assignment · rider:task_cancelled · order:update · chat:* · rider:location
```

## Development

```bash
pnpm install                      # from the monorepo root
cd rider-app
pnpm start                        # Expo dev server (set EXPO_PUBLIC_API_URL for a remote backend)
pnpm typecheck && pnpm lint && pnpm test
```

The API base URL is auto-detected from Metro's host in development; override with
`EXPO_PUBLIC_API_URL` (see `eas.json` for the production value).

### Builds

```bash
eas build --profile preview --platform android     # internal APK
eas build --profile production --platform android  # Play Store AAB
```

Google Maps keys are read from `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (or platform-specific
`EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` / `_IOS_API_KEY`) in `app.config.ts`.
Push notifications need `google-services.json` for Android (ignored by git).
