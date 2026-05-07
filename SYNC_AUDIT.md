# Cross-Surface Sync Audit

State as of commit `a7da350` (Phase 2 — 4-digit PIN). Use this as a punch
list for the remaining drift between backend / website / admin-panel /
customer-app / rider-app.

The goal is the user's stated requirement: **register once with OTP, then
log in / re-confirm sensitive actions with a 4-digit PIN forever after.
Admin and rider stay password-based — they're not in the PIN flow.**

---

## Phase 2 status (PIN system)

| Surface | DB | Endpoints | UI wired | Status |
|---|---|---|---|---|
| **backend** | ✅ `pin_hash`, `pin_set_at` columns | ✅ 4 endpoints | n/a | DONE |
| **website** | n/a | ✅ uses backend | ✅ register / login / settings / checkout gate | DONE |
| **admin-panel** | n/a | n/a | n/a | OUT OF SCOPE — admin uses password |
| **customer-app** | n/a | ✅ scaffold (auth.service, store, PinInput) | ❌ screens not yet wired | PARTIAL |
| **rider-app** | n/a | n/a | n/a | OUT OF SCOPE — rider uses password |

**User action required for the system to actually work end-to-end:**

1. Run `database/migrations/01-add-pin-to-users.sql` in Supabase SQL Editor.
2. Confirm Render redeployed after commit `919e99c`.
3. Confirm Vercel redeployed after commit `fe406cc`.
4. Sign up a fresh account from the website → set PIN → log out → log back in with PIN. (No OTP should arrive on the second login.)

---

## Outstanding drift

### BLOCKING

#### 1. customer-app OTP flow is broken against current backend
- File: `customer-app/src/services/auth.service.ts:49`
- The customer-app calls `/auth/verify-login` with `{ phone, code }` (Twilio shape from before the Firebase migration). The deployed backend now expects `{ idToken }` from a Firebase Phone Auth verification.
- Until the customer-app is migrated to `@react-native-firebase/auth`, OTP-based login + register is broken. PIN flow is wired in the service / store but useless without a working register-with-OTP first time around.
- Fix is its own change: install `@react-native-firebase/app` + `@react-native-firebase/auth`, configure `google-services.json` / `GoogleService-Info.plist`, replace OTP screens with Firebase signInWithPhoneNumber. ~1-2 hours of work + Expo testing on device.

#### 2. customer-app PIN screens not wired
- Files to touch (after the OTP migration above):
  - `customer-app/src/screens/auth/RegisterScreen.tsx` — add a fourth step that calls `useAuthStore().setPin(pin)` after `verifyRegister` succeeds, mirroring website's register flow.
  - `customer-app/src/screens/auth/LoginScreen.tsx` — call `authService.pinStatus(phone)` first; if `hasPin === true` show PIN entry and call `useAuthStore().verifyWithPin`; else fall through to OTP.
  - New `customer-app/src/screens/settings/ChangePinScreen.tsx` — two-stage PIN entry → `useAuthStore().setPin(pin)`.
  - New `customer-app/src/components/auth/PinReauthGate.tsx` — wrap the checkout screen (mirror of `website/components/auth/PinReauthGate.tsx`). Use `useAuthStore().pinVerifiedAt` + 30-min threshold.

### WARNING

#### 3. Token-storage keys inconsistent
- `website` uses `token` / `refreshToken` (`store/cartStore.ts`).
- `admin-panel` uses `admin_token` / `admin_refresh_token` / `admin_user`.
- `customer-app` uses `@token` / `@user` (with `@` prefix, AsyncStorage convention).
- `rider-app` uses `@auth_token` / `@refresh_token` / `@rider_data`.

Cosmetic — each surface is internally consistent — but if a developer ever copy-pastes token-reading code between surfaces it'll silently miss. Optional cleanup: pick one convention (e.g. `@freshbazar/{role}_token`) and apply to all four.

#### 4. Hardcoded LAN IP fallback in mobile apps
- `customer-app/src/utils/constants.ts` falls back to `192.168.119.226:3000` when `EXPO_PUBLIC_API_URL` isn't set.
- `rider-app/src/utils/constants.ts` likely the same (audit excerpt confirms a hardcoded fallback IP).
- This breaks for any new developer or device that isn't on the same LAN as the original author. Either delete the fallback or set it to `localhost:3000`. Production builds always have `EXPO_PUBLIC_API_URL` set so this is dev-only.

#### 5. Type system drift
- `backend/src/types/`, `database/schema.sql` — snake_case (DB-native).
- `website/types/index.ts` — locally defined, accepts BOTH `full_name` AND `fullName` etc. Bloated but tolerant.
- `admin-panel/src/types/` — local snake_case; relies on `api.ts` toCamelCase converter to translate response keys. Half the codebase reads converted, half doesn't.
- `customer-app/src/types/` — uses `@freshbazar/shared-types` (camelCase).
- `rider-app` — local types with manual mapping in service files.

Each surface works in isolation but adding fields requires touching N type files. Consolidating onto `@freshbazar/shared-types` (camelCase) for all four frontends is a real refactor, ~half a day. Not blocking — flagging for awareness.

### OK / OUT OF SCOPE

- **admin-panel** — password-only login is by design. No PIN needed. No drift.
- **rider-app** — same. Riders are created by admin, log in with password.
- **backend** — single source of truth, working.

---

## Recommended next-commit batches

If you want to keep slicing this further, here's the priority order:

1. **customer-app Firebase OTP migration** (BLOCKING). Without this the mobile customer can't log in at all — independent of the PIN work.
2. **customer-app PIN screens** (BLOCKING). Mirror the website's flow into the existing screens.
3. **Token-key cleanup** (WARNING). Cosmetic.
4. **Mobile fallback IP** (WARNING). Trivial; delete the hardcoded IP.
5. **Type consolidation** (WARNING). Largest, lowest urgency — defer until the rest is stable.

Each is its own commit, testable in isolation. The commits already on `main` (Phase 1 storage, hard-delete / toggle / move-category, Phase 2 PIN backend + website) are independently usable as soon as Supabase + Render env vars are in place.
