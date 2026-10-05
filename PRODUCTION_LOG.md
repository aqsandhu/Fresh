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
| 2.17 | website | WS-M4 ribbon ✅, WS-M6 app section ✅, WS-M7 search cap ✅, WS-M8/M9 footer ✅, WS-M11 dead links ✅; WS-M10 copy, WS-M12 wishlist label, WS-L14..L21, W-L1..L11 | PARTIAL | |
| 3.1 | admin+backend | A-H1/H2/H3 camel/snake mismatches | DONE | |
| 3.2 | admin | A-M4..M10 | DONE | |
| 3.3 | admin+backend | A-L11..L14 | PARTIAL | L11 registry ✅, L14 OCP buttons ✅; L12 (OCP stock modal limit), L13 (coupons-used paging), L14 Complaints/Reviews/RiderApplications buttons TODO |
| 4.1 | backend | re-verify the 28 prior-audit items (agent died) | TODO | |

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
### 2026-10-05 — Session 3 start
- Branch created; baseline gates run (§2). Full `pnpm install` started (website/admin node_modules were incomplete).
- Four read-only audit agents launched.

## 6. Verification evidence
_pending_

## 7. Rating (honest, excluding the ignored items)
- Before this work: _to be stated after audits, with evidence_
- After: _pending_
