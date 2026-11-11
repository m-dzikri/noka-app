# Code Review: RFC-002 — Authentication, Session Security & Password Reset

- **RFC Reviewed:** [RFC-002-Authentication-And-Password-Reset.md](../RFCs/RFC-002-Authentication-And-Password-Reset.md)
- **Branch / Commit Reviewed:** `feat/rfc-002-auth-password-reset` (`b53c1c5`)
- **Review Date:** 2026-11-12
- **Reviewer Context:** Fresh session (no RFC-002 code authored in this session)
- **Predecessors (`RFCS.md`):** `RFC-001` (`Reviewed`)

---

## Step 0: Verification Run Output

### Commands Executed
1. `npm run lint` — **Passed (exit 0)**
2. `npm run typecheck` (`tsc --noEmit`, `Version 7.0.2`) — **Passed (exit 0)**
3. `npm test` (`vitest run`) — **Passed (exit 0, 12 test files, 47 tests passed, 0 skipped)**
4. `npm run build` (`next build`) — **Passed (exit 0)** *(note: `.env` exists on disk and Next.js automatically loaded `.env` during local build; every auth page/layout and `/api/auth/**` route declares `export const dynamic = "force-dynamic"` and no module reads `getEnv()`/`getDb()` at import time)*
5. `npx drizzle-kit check` — **Passed (exit 0, `Everything's fine`)**
6. `python .agents/skills/workflow-status/scripts/trace-check.py .` — **Passed (exit 0, `0 failure(s), 6 warning(s)` prior to updating status to `Changes requested`)**

```text
> noka-app@0.1.0 lint
> eslint .

LINT_EXIT=0

> noka-app@0.1.0 typecheck
> tsc --noEmit

TSC_EXIT=0

> noka-app@0.1.0 test
> vitest run


 RUN  v5.1.0 D:/Projects/noka-app

 ✓  unit  tests/unit/logger.test.ts (3 tests) 22ms
 ✓  unit  tests/unit/env.test.ts (6 tests) 52ms
 ✓  unit  tests/unit/db.test.ts (2 tests) 30ms
 ✓  unit  tests/unit/idempotency.test.ts (4 tests) 36ms
{"error":{"name":"Error","message":"ECONNREFUSED"},"timestamp":"2026-11-11T18:45:07.356Z","level":"error","requestId":"bd570882-1d33-4fa9-8219-e941ccf9ac9b","event":"health.check_failed"}
{"error":{"name":"Error","message":"Database health check timed out"},"timestamp":"2026-11-11T18:45:09.359Z","level":"error","requestId":"f2ece62a-5b32-4d42-afb0-5da425c5e3e1","event":"health.check_failed"}
 ✓  integration  tests/integration/health.test.ts (4 tests) 307ms
 ✓  unit  tests/unit/auth-password-token.test.ts (5 tests) 1550ms
   ✓ auth crypto, CSRF, rate limiter, and apiFetch cleanup (TS-002-01) (5)
     ✓ hashes passwords with bcrypt cost >= 12 and verifies constant-time comparison 1496ms
 ✓  integration  tests/integration/idempotency-db.test.ts (6 tests) 709ms
{"status":503,"code":"MAIL_DELIVERY_UNAVAILABLE","error":{"name":"ApiError","message":"Email delivery service is unavailable"},"timestamp":"2026-11-11T18:45:08.042Z","level":"error","requestId":null,"event":"api.error"}
{"status":503,"code":"MAIL_DELIVERY_UNAVAILABLE","error":{"name":"ApiError","message":"Service down"},"timestamp":"2026-11-11T18:45:08.053Z","level":"error","requestId":null,"event":"api.error"}
 ✓  unit  tests/unit/preferences-i18n.test.tsx (3 tests) 265ms
 ✓  unit  tests/unit/shell-layout.test.tsx (5 tests) 422ms
 ✓  unit  tests/unit/auth-forms.test.tsx (4 tests) 410ms
 ✓  integration  tests/integration/auth-flow.test.ts (3 tests) 2420ms
   ✓ auth registration, sessions, 12 categories, logout, and rate limits (TS-002-02) (3)
     ✓ registers user with normalized email, 12 localized system categories, HttpOnly cookie, and /me profile 811ms
     ✓ handles login failure/success, Secure cookie when HTTPS, zero-DB unauth cookie fast path, expiry, and idempotent logout 1270ms
 ✓  integration  tests/integration/auth-reset.test.ts (2 tests) 3029ms
   ✓ forgot password, dev outbox, production mailer fallback, and atomic reset (TS-002-03) (2)
     ✓ returns identical 200 for existing vs unknown email, hashes 30m token, keeps prior token active, and serves /api/dev/outbox 488ms
     ✓ enforces FOR UPDATE single-use race safety, invalidates active reset tokens, revokes all sessions, and rate-limits resets 2158ms

 Test Files  12 passed (12)
      Tests  47 passed (47)
   Start at  01:45:04
   Duration  6.15s (setup 35%, tests 25%, environment 21%, import 16%, transform 3%)

TEST_EXIT=0

> noka-app@0.1.0 build
> next build

▲ Next.js 16.4.6 (Turbopack)
- Environments: .env
✓ Running next.config.ts took 106ms

  Creating an optimized production build ...
✓ Compiled successfully in 606ms
  Running TypeScript ...
  Finished TypeScript in 2.9s ...
  Collecting page data using 15 workers ...
  Generating static pages using 15 workers (2/2) in 105ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /_not-found
├ ƒ /api/auth/forgot-password
├ ƒ /api/auth/login
├ ƒ /api/auth/logout
├ ƒ /api/auth/me
├ ƒ /api/auth/register
├ ƒ /api/auth/reset-password
├ ƒ /api/dev/outbox
├ ƒ /api/health
├ ƒ /app
├ ƒ /forgot-password
├ ƒ /login
├ ƒ /register
└ ƒ /reset-password

ƒ  (Dynamic)  server-rendered on demand

BUILD_EXIT=0
```

### Acceptance Criteria Coverage Check
- **AC-2.1 (Sign Up, 12 Categories & Preferences):** Verified in `tests/integration/auth-flow.test.ts` and `tests/unit/auth-password-token.test.ts` (normalized email, 12 localized system categories `8 expense` + `4 income` in transaction, `409 EMAIL_ALREADY_EXISTS`, `bcryptjs` cost `>= 12`, `HttpOnly` + `SameSite=Lax` + conditional `Secure` cookie, `noka_locale`/`noka_theme` cookies, `201 { ok: true, data: { user } }` without `passwordHash`, and client payload sync in `tests/unit/auth-forms.test.tsx`).
- **AC-2.2 (Login, Logout, Session Guard, CSRF & 401 Cleanup):** Verified for `POST /api/auth/login`, `GET /api/auth/me` (`cycleStartDay`, unauth `401`, expired `401`), `getSessionUser()` zero-DB short-circuit when cookie absent/invalid length, `verifyCsrfOrigin()`, `LogoutButton`, and `apiFetch()` (`UNAUTHORIZED` vs `INVALID_CREDENTIALS`/`INVALID_CURRENT_PASSWORD`). **Coverage gaps found:** (1) `tests/integration/auth-flow.test.ts` calls `POST /api/auth/logout` only after manually expiring the session row in DB, and never asserts that an *active* session token is revoked in DB (`GET /api/auth/me` -> `401` post-logout); (2) `src/app/(app)/app/layout.tsx` (`redirect("/login")`) has no test that would fail if removed.
- **AC-2.3 (Forgot/Reset Password & MailerAdapter):** Verified in `tests/integration/auth-reset.test.ts` (`200` anti-enumeration response, `SHA-256` 30-min token keeping prior active tokens intact until reset, `user.locale` email language, `/api/dev/outbox` `404` in `production`, `503 MAIL_DELIVERY_UNAVAILABLE` on unconfigured/failing adapter, `FOR UPDATE` race safety, full revocation of active user `sessions` and unused reset tokens, login with new password, and expired token rejection). *(Note: `ResendMailer` itself has no direct unit test executing its mocked `Resend` SDK calls.)*
- **AC-2.4 (Rate Limiting & Log Privacy):** Verified in `tests/unit/auth-password-token.test.ts`, `tests/integration/auth-flow.test.ts`, and `tests/integration/auth-reset.test.ts` (`10/15m` login, `5/15m` forgot/reset, executed before Zod validation with `429 RATE_LIMITED` + `Retry-After`, logs free of passwords and session cookie values). **Bug found in `src/lib/rate-limit.ts`:** `expiresAt` uses the *oldest* timestamp in the sliding window rather than the *newest*, causing premature eviction when sweeping >500 keys.
- **AC-2.5 (`(auth)/` Pages, UI & Verification):** Verified in `tests/unit/auth-forms.test.tsx` (`LoginForm` instant ID/EN + Dark mode retention and `429` formatting, `RegisterForm` validation & `/app` redirect, `ForgotPasswordForm` neutral status, missing-token `ResetPasswordForm`, `LogoutButton` cleanup). **Coverage gaps found:** (1) `ResetPasswordForm` with an active `initialToken` (local `< 8` char / confirm mismatch validation, `POST /api/auth/reset-password` submit -> success + `/login` link, and `400 INVALID_OR_EXPIRED_TOKEN` rendering) has zero tests; (2) authenticated redirect guards on `src/app/(auth)/login/page.tsx` and `src/app/(auth)/register/page.tsx` have zero tests.

---

## Product Type Check Scope

Per `PRD.md` (`## Product Type`) and `RULES.md`:
- **Classification:** **Web App** (Multi-user Responsive Web Application + PWA + Public SEO Pages).
- **Applied Checks in RFC-002:**
  - *Auth & Sessions*: Registration without email gate, login, 30-day stateful `sessions` DB tokens, `HttpOnly` + `SameSite=Lax` + conditional `Secure` cookies, CSRF `Origin`/`Referer` enforcement, sliding-window rate limiting, 30-minute single-use `SHA-256` reset tokens revoking all sessions, and `OFFLINE-5` private client cleanup on logout / `401 UNAUTHORIZED`.
  - *Authorization per Resource*: Unauthenticated/expired requests blocked at `requireAuth()`, `/api/auth/me`, and `(app)/app/layout.tsx` (`userId` resource tables arrive in `RFC-004`–`RFC-008`).
  - *Accessibility (a11y) & Visual Tokens*: Computed WCAG 2.1 AA contrast ratios for RFC-002 pairings (`--status-expense` on `--bg-subtle`: `5.91:1` light / `6.14:1` dark; `--status-income` on `--bg-subtle`: `4.58:1` light / `9.74:1` dark; `--text-secondary` on `--bg-surface`: `9.90:1` light / `12.70:1` dark), semantic labels/ARIA/single `<h1>` per auth page.
  - *Observability & Build Safety*: `force-dynamic` on auth pages/APIs, `OBS-2` log redaction (including `reseturl`/`reset_url`), `OBS-3` `503 MAIL_DELIVERY_UNAVAILABLE`.
- **Deferred to Downstream RFCs (within Web App scope):** Resource-level `userId` ownership endpoints (`RFC-004`–`RFC-008`, `RFC-010`), Public SEO landing page `/` (`RFC-003`), IndexedDB & Service Worker cache wipe integration (`RFC-009`), and Playwright real-browser viewport (`360px`/`768px`/`1280px`) & keyboard E2E suite (`RFC-003`/`RFC-010`).
- **Visible Skipped Checks:**
  - *Binary Size*: Skipped because Noka is a Web App/PWA (`DEC-3`, `F31`), not a native App Store/Play Store binary; size is governed by web bundle budgets (`PERF-4`).
  - *Public Third-Party API SLA & Versioning*: Skipped because all `/api/**` routes are internal first-party endpoints exclusively for Noka's web client.

---

## Review Dimensions

### 1. RFC Adherence
- **Verdict**: NEEDS WORK
- **Findings**:
  1. **Unverified acceptance sub-behaviors (`AC-2.2`, `AC-2.5`):** While all 4 planned suites (`TS-002-01`–`TS-002-04`) exist and pass, the current assertions allow silent regressions on: (a) DB session revocation during `POST /api/auth/logout` in [tests/integration/auth-flow.test.ts](file:///d:/Projects/noka-app/tests/integration/auth-flow.test.ts#L248-L288); (b) `(app)/app/layout.tsx` unauthenticated redirect (`AC-2.2`) and `/login`/`/register` authenticated redirects (`AC-2.5`); and (c) `ResetPasswordForm` valid-token confirm-password validation and submission flow (`AC-2.5`, [tests/unit/auth-forms.test.tsx](file:///d:/Projects/noka-app/tests/unit/auth-forms.test.tsx#L192-L205)).
  2. **Document & note discrepancies (`QUAL-1`, non-blocking):** [TEST-STRATEGY.md](file:///d:/Projects/noka-app/TEST-STRATEGY.md#L290) still reports `"15 unit + 11 integration + 3 E2E = 29"` in Section 6 despite Section 2 ([line 102](file:///d:/Projects/noka-app/TEST-STRATEGY.md#L102)) updating the total to `31`. Additionally, [RFC-002 Implementation Notes](file:///d:/Projects/noka-app/RFCs/RFC-002-Authentication-And-Password-Reset.md#L110) states `NextRequest`/`Request` support while [src/features/auth/session.ts](file:///d:/Projects/noka-app/src/features/auth/session.ts#L50-L120) types `req?: NextRequest`.
- **Suggestions**:
  - Add the missing regression assertions in `auth-flow.test.ts`, `auth-forms.test.tsx`, and a lightweight auth page/layout guard unit test so every bullet in `AC-2.1`–`AC-2.5` is actively guarded.
  - Sync [TEST-STRATEGY.md](file:///d:/Projects/noka-app/TEST-STRATEGY.md#L290) and clarify `NextRequest` in `RFC-002` `Implementation Notes`.

### 2. Rules Compliance
- **Verdict**: NEEDS WORK
- **Findings**:
  1. **`SEC-5` sliding-window expiry bug (`src/lib/rate-limit.ts` lines 62–79):** In [`checkRateLimit`](file:///d:/Projects/noka-app/src/lib/rate-limit.ts#L41-L87), `expiresAt` is set to `resetAt` (`recentTimestamps[0] + windowMs` — the *oldest* timestamp in the window) rather than `recentTimestamps[recentTimestamps.length - 1] + windowMs` (the *newest* timestamp). When active buckets exceed `MAX_STORE_KEYS_BEFORE_SWEEP` (`500`), [`sweepExpiredBuckets`](file:///d:/Projects/noka-app/src/lib/rate-limit.ts#L26-L36) deletes the whole entry once the first attempt reaches `windowMs`, erasing later attempts that have not yet aged out.
  2. **Compliance across other rules (`STACK-4`, `ARCH-2`, `ARCH-6`, `API-1`/`2`/`4`, `OBS-2`/`3`, `I18N-1`/`2`, `UI-1`–`3`/`5`, `QUAL-2`/`3`):** Verified cleanly across `src/`. Recursive scan confirmed zero `process.env` reads outside [src/lib/env.ts](file:///d:/Projects/noka-app/src/lib/env.ts#L145-L178) and zero `TODO`, `FIXME`, stubs, `eslint-disable`, or explicit `any`. Measured WCAG 2.1 contrast ratios for RFC-002 alert/status surfaces pass AA (`>= 4.5:1`) in both Light and Dark modes (`4.58:1` minimum).
- **Suggestions**:
  - Compute `expiresAt: recentTimestamps[recentTimestamps.length - 1] + windowMs` when storing entries in [`checkRateLimit`](file:///d:/Projects/noka-app/src/lib/rate-limit.ts#L62-L79), keeping `retryAfterSeconds` computed from `oldestAllowedAt + windowMs`.

### 3. Security
- **Verdict**: NEEDS WORK
- **Findings**:
  1. **Premature rate-limit bucket eviction under sweep (`src/lib/rate-limit.ts` lines 31–35, 62–79):** Because `expiresAt` tracks the oldest timestamp, staggered requests inside a 15-minute window lose their rate-limit history when `store.size > 500` triggers pruning after the initial attempt expires (`SEC-5`).
  2. **Active-session logout DB revocation untested (`tests/integration/auth-flow.test.ts` lines 248–288):** Logout idempotency and cookie `Max-Age=0` are tested, and [src/app/api/auth/logout/route.ts](file:///d:/Projects/noka-app/src/app/api/auth/logout/route.ts#L16-L19) calls `revokeSessionByRawToken(rawToken)`, yet the integration test never asserts that a previously active session cookie returns `401` on `GET /api/auth/me` (or is absent from `sessions`) after `POST /api/auth/logout` (`SEC-3`).
  3. **Non-blocking hardening notes:**
     - [src/features/auth/service.ts](file:///d:/Projects/noka-app/src/features/auth/service.ts#L156-L165) (`loginUser`): returns immediately when `!userRow`, creating a ~2 ms vs ~150–250 ms bcrypt timing difference between unknown and registered emails on `POST /api/auth/login`.
     - [src/features/auth/csrf.ts](file:///d:/Projects/noka-app/src/features/auth/csrf.ts#L48-L59): assumes `"https"` when `host` is present without `x-forwarded-proto`; local HTTP on non-default ports (e.g., `http://localhost:3001` or `http://127.0.0.1:3000` when `APP_URL=http://localhost:3000`) fails unless proxied with `x-forwarded-proto: http` or `APP_URL` matches (matches RFC-002 §2 spec verbatim).
- **Suggestions**:
  - Fix `expiresAt` in [`checkRateLimit`](file:///d:/Projects/noka-app/src/lib/rate-limit.ts#L62-L79) and add an active-session revocation test after `POST /api/auth/logout`.
  - Optionally perform a constant-cost dummy `verifyPassword` in `loginUser()` when `!userRow`.

### 4. Performance
- **Verdict**: PASS
- **Findings**:
  - [`getSessionContext`](file:///d:/Projects/noka-app/src/features/auth/session.ts#L63-L104) short-circuits without calling `getDb()` whenever `noka_session` is missing or outside `20..128` characters (verified by spy in `auth-flow.test.ts`).
  - [`registerUser`](file:///d:/Projects/noka-app/src/features/auth/service.ts#L84-L133) computes `hashPassword` (`cost = 12`) *outside* `db.transaction`, avoiding holding a PostgreSQL connection/transaction open during CPU-intensive hashing.
  - All auth queries filter on indexed unique columns (`users.email`, `sessions.tokenHash`, `passwordResetTokens.tokenHash`, `sessions.userId`).
- **Suggestions**: None required; minor micro-optimization would be reusing a `Resend` client or parsed `APP_URL` origin, though negligible next to SMTP/HTTPS/bcrypt latency.

### 5. Maintainability
- **Verdict**: NEEDS WORK
- **Findings**:
  1. Shared helpers (`route-helpers.ts`, `auth-error.ts`, `templates.ts`) keep routes and UI components clean and DRY, with clear JSDoc docstrings and bilingual i18n dictionaries.
  2. **Test coverage blind spots (`TEST-1`, `TS-002-02`, `TS-002-04`, `TEST-STRATEGY.md` §1.2):**
     - `ResetPasswordForm` valid-token validation/submit/error paths are untested in [tests/unit/auth-forms.test.tsx](file:///d:/Projects/noka-app/tests/unit/auth-forms.test.tsx).
     - Server route guards ([src/app/(app)/app/layout.tsx](file:///d:/Projects/noka-app/src/app/(app)/app/layout.tsx), [src/app/(auth)/login/page.tsx](file:///d:/Projects/noka-app/src/app/(auth)/login/page.tsx), [src/app/(auth)/register/page.tsx](file:///d:/Projects/noka-app/src/app/(auth)/register/page.tsx)) lack direct unit tests.
     - `ResendMailer` ([src/lib/mailer/resend.ts](file:///d:/Projects/noka-app/src/lib/mailer/resend.ts)) is bypassed in tests by mocking `getMailer()`, leaving `Resend` SDK success, `{ error }`, and exception handling unexecuted in Vitest.
     - `checkRateLimit` lacks a unit test verifying staggered timestamps survive `sweepExpiredBuckets()` while still inside `windowMs`.
- **Suggestions**:
  - Expand `tests/unit/auth-password-token.test.ts`, `tests/unit/auth-forms.test.tsx`, and `tests/integration/auth-flow.test.ts` as detailed under Blocking Issues and Improvement Suggestions below.

---

## Overall Assessment

- **Overall Risk Level:** **Medium**
- **Summary:** RFC-002 delivers a solid, clean implementation of registration, 12 localized system categories, stateful cookie sessions, CSRF protection, password reset with `FOR UPDATE` single-use tokens, bilingual `(auth)/` forms, and `OFFLINE-5` client cleanup, with lint, typecheck, build, Drizzle check, and all 47 existing tests passing. However, code inspection uncovered a sliding-window eviction bug in `src/lib/rate-limit.ts` under map pruning (`> 500` keys) and several acceptance-criterion test blind spots where regressions in logout DB revocation, active-token password reset UI, and auth route redirects would not fail the current suite.
- **Status Set in `RFCS.md`:** **`Changes requested`**

---

## Blocking Issues

1. **[BUG / `SEC-5`] Sliding-window rate-limit pruning uses oldest timestamp instead of newest (`src/lib/rate-limit.ts`):**
   - **Location:** [src/lib/rate-limit.ts](file:///d:/Projects/noka-app/src/lib/rate-limit.ts#L62-L79) (`checkRateLimit`).
   - **Problem:** Storing `expiresAt: resetAt` (`oldest + windowMs`) causes [`sweepExpiredBuckets`](file:///d:/Projects/noka-app/src/lib/rate-limit.ts#L26-L36) (once `store.size > 500`) to delete the entire bucket as soon as the *first* attempt expires, erasing newer attempts still inside `[nowMs - windowMs, nowMs]`.
   - **Required Fix:** Set `expiresAt` to `recentTimestamps[recentTimestamps.length - 1] + windowMs` for both blocked and allowed branches (keeping `retryAfterSeconds` based on `recentTimestamps[0] + windowMs`), and add a staggered-timestamp pruning regression test in [tests/unit/auth-password-token.test.ts](file:///d:/Projects/noka-app/tests/unit/auth-password-token.test.ts#L75-L130).

2. **[TEST / `AC-2.2`, `SEC-3`, `TS-002-02`] Logout DB session revocation is not tested against an active session:**
   - **Location:** [tests/integration/auth-flow.test.ts](file:///d:/Projects/noka-app/tests/integration/auth-flow.test.ts#L248-L288).
   - **Problem:** `loginCookie` is manually expired in PostgreSQL *before* `POST /api/auth/logout` runs, so deleting [`revokeSessionByRawToken`](file:///d:/Projects/noka-app/src/app/api/auth/logout/route.ts#L16-L19) from the logout handler would leave all integration tests passing.
   - **Required Fix:** Assert that logging out an **active** session deletes its row from `sessions` and causes a subsequent `GET /api/auth/me` presenting that same session token to return `401 UNAUTHORIZED`.

3. **[TEST / `AC-2.2`, `AC-2.5`, `TS-002-04`] Untested regression paths for active-token `ResetPasswordForm` and auth route/layout guards:**
   - **Locations:** [tests/unit/auth-forms.test.tsx](file:///d:/Projects/noka-app/tests/unit/auth-forms.test.tsx#L192-L205), [src/app/(app)/app/layout.tsx](file:///d:/Projects/noka-app/src/app/(app)/app/layout.tsx#L14-L17), [src/app/(auth)/login/page.tsx](file:///d:/Projects/noka-app/src/app/(auth)/login/page.tsx#L8-L11), [src/app/(auth)/register/page.tsx](file:///d:/Projects/noka-app/src/app/(auth)/register/page.tsx#L8-L11).
   - **Problem:** `ResetPasswordForm` is only rendered without a token (`initialToken = undefined`), leaving password length/mismatch validation, `POST /api/auth/reset-password` payload/success state + `/login` link, and `400 INVALID_OR_EXPIRED_TOKEN` UI error handling untested. Additionally, the server-side `redirect("/login")` / `redirect("/app")` guards have zero automated tests that would fail if removed.
   - **Required Fix:** Add unit tests covering `ResetPasswordForm` with `initialToken` (local errors, API error `400`, happy path `200` + `/login` link) and server guard invocation tests verifying `AppWorkspaceLayout` redirects unauthenticated callers to `/login` (and renders `LogoutButton` when authenticated) while `LoginPage` / `RegisterPage` redirect authenticated callers to `/app`.

---

## Improvement Suggestions (Non-Blocking)

1. **Direct unit test for `ResendMailer` & log redaction of `resetUrl`:** Test [`ResendMailer.sendPasswordReset`](file:///d:/Projects/noka-app/src/lib/mailer/resend.ts#L32-L70) directly with a mocked `Resend` client (happy path, `{ error }`, rejected promise -> `503 MAIL_DELIVERY_UNAVAILABLE` without leaking URLs/emails in logs) per `TEST-STRATEGY.md` §1.2, and add `resetUrl` / `reset_url` assertions to [tests/unit/logger.test.ts](file:///d:/Projects/noka-app/tests/unit/logger.test.ts).
2. **Constant-time login response for unknown emails:** In [`loginUser`](file:///d:/Projects/noka-app/src/features/auth/service.ts#L156-L165), execute a dummy `verifyPassword` against a precomputed bcrypt hash when `!userRow` to minimize email-enumeration timing side-channels on `POST /api/auth/login`.
3. **Sync documentation minor drift:** Update [TEST-STRATEGY.md](file:///d:/Projects/noka-app/TEST-STRATEGY.md#L290) suite count (`"17 unit + 11 integration + 3 E2E = 31"`) to match Section 2, align `RFC-002` `Implementation Notes` line 110 wording (`NextRequest`), and add `flex-wrap` on auth `CardFooter` links (`LoginForm.tsx` / `RegisterForm.tsx`) for resilient wrapping on narrow viewports.
4. **Deferred E2E verification reminder:** Real-browser `scrollWidth <= innerWidth` checks (`360px`/`768px`/`1280px`) and full keyboard Tab flows for `/login`, `/register`, `/forgot-password`, and `/reset-password` should be included in the downstream Playwright suites (`TS-003-*` / `TS-010-02`).



---

## Round 2 -- 2026-11-12

- **RFC:** [RFC-002](file:///d:/Projects/noka-app/RFCs/RFC-002-Authentication-And-Password-Reset.md) -- Authentication, Session Security & Password Reset
- **Branch / Commit Reviewed:** `feat/rfc-002-auth-password-reset` (`HEAD` at `4e00c05`; post-Round 1 commits `a8caca2`, `ff9be45`, `4e00c05` since `b53c1c5`)
- **Review Basis:** Fresh-eyes verification of all Round 1 findings against `PRD.md`, `FEATURES.md`, `RULES.md`, `PRD-REVIEW.md`, `RFC-002`, `TEST-STRATEGY.md`, and live project checks
- **Overall Risk Level:** Low
- **Verdict:** **PASS (`Reviewed`)** -- Seluruh *Blocking Issues* (`#1`–`#3`) dan saran non-blocking (`#1`–`#3`) dari Round 1 telah diselesaikan serta terverifikasi test.

### Step 0 Verification Output (Head `4e00c05`)

- `npm run lint` (`eslint .`): `LINT_EXIT=0`
- `npm run typecheck` (`tsc --noEmit`, TypeScript `7.0.2`): `TSC_EXIT=0`
- `npm run test` (`vitest run`, v5.1.0): `Test Files  12 passed (12)`, `Tests  51 passed (51)` (`0` skipped), `Duration  5.45s`, `TEST_EXIT=0`
  - Unit suites (8 files, 36 tests): `logger.test.ts` (3), `env.test.ts` (6), `db.test.ts` (2), `idempotency.test.ts` (4), `auth-password-token.test.ts` (7), `preferences-i18n.test.tsx` (3), `shell-layout.test.tsx` (5), `auth-forms.test.tsx` (6)
  - Integration suites (4 files, 15 tests): `health.test.ts` (4), `idempotency-db.test.ts` (6), `auth-flow.test.ts` (3), `auth-reset.test.ts` (2)
- `npm run build` (`next build`, Next.js `16.4.6` Turbopack): `BUILD_EXIT=0` (seluruh rute app & auth termasuk `/app`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/api/auth/**`, `/api/dev/outbox`, `/api/health` dibangun dinamis `ƒ`)
- `npx drizzle-kit check`: `Everything's fine` (`DRIZZLE_EXIT=0`)
- `python .agents/skills/workflow-status/scripts/trace-check.py .`: `33 requirements, 31 features, 61 rules, 10 RFCs`, `0 failure(s), 5 warning(s)` (untuk fitur v1.1 `F20`–`F24`), `TRACE_EXIT=0`
- Runtime verification `DUMMY_PASSWORD_HASH`: `length: 60 rounds: 12`, `verifyPassword(..., DUMMY_PASSWORD_HASH)` => `res: false elapsedMs: 284.5` (komparasi bcrypt cost 12 penuh tanpa fast-fail)

### Resolution Verification for Round 1 Findings

#### Blocking Issues (All Resolved)

1. **Blocking Issue 1 (`checkRateLimit` sliding-window `expiresAt` sweep bug) -- RESOLVED**
   - [src/lib/rate-limit.ts](file:///d:/Projects/noka-app/src/lib/rate-limit.ts#L59-L81): [`checkRateLimit`](file:///d:/Projects/noka-app/src/lib/rate-limit.ts) kini menghitung `oldestAllowedAt = Math.min(...recentTimestamps)` serta `newestAllowedAt = Math.max(...recentTimestamps)` dan menetapkan `expiresAt: newestAllowedAt + windowMs` pada cabang *blocked* (baris 59–66) maupun *allowed* (baris 76–81).
   - Uji regresi di [tests/unit/auth-password-token.test.ts](file:///d:/Projects/noka-app/tests/unit/auth-password-token.test.ts#L124-L146) dan [baris 321–369](file:///d:/Projects/noka-app/tests/unit/auth-password-token.test.ts#L321-L369) memverifikasi pemulihan parsial saat timestamp tertua keluar dari window serta *staggered bursts* (`t=0` + 4 kali di `t=+300s`) tetap bertahan melewati sweep `> 500` bucket pada `t=+905s`.
2. **Blocking Issue 2 (Active-session logout DB revocation test) -- RESOLVED**
   - [tests/integration/auth-flow.test.ts](file:///d:/Projects/noka-app/tests/integration/auth-flow.test.ts#L269-L319) memverifikasi sesi aktif menghasilkan `200` pada `GET /api/auth/me` dengan `1` baris di tabel `sessions`, kemudian setelah `POST /api/auth/logout` menegaskan `0` baris tersisa di `sessions` dan permintaan ulang `GET /api/auth/me` dengan cookie yang sudah logout mengembalikan `401 UNAUTHORIZED`. Kedaluwarsa sesi berbasis DB tetap diuji terpisah melalui `registerSessionCookie` ([baris 321–333](file:///d:/Projects/noka-app/tests/integration/auth-flow.test.ts#L321-L333)).
3. **Blocking Issue 3 (`ResetPasswordForm` active-token tests & RSC auth guards) -- RESOLVED**
   - [tests/unit/auth-forms.test.tsx](file:///d:/Projects/noka-app/tests/unit/auth-forms.test.tsx#L282-L367) menguji [`ResetPasswordForm`](file:///d:/Projects/noka-app/tests/unit/auth-forms.test.tsx#L282-L367) dengan `initialToken="raw-reset-token-123"`: validasi lokal (`< 8` karakter & mismatch) memblokir `fetch`, respon `400 INVALID_OR_EXPIRED_TOKEN` menampilkan alert terlokalisasi, dan percobaan ulang `200` merender `role="status"` beserta tautan `/login`.
   - [tests/unit/auth-forms.test.tsx](file:///d:/Projects/noka-app/tests/unit/auth-forms.test.tsx#L369-L447) memanggil langsung komponen RSC [`AppWorkspaceLayout`](file:///d:/Projects/noka-app/tests/unit/auth-forms.test.tsx#L369-L447) (`null` -> `NEXT_REDIRECT:/login`; user aktif -> `AppShell` + `LogoutButton`), serta `LoginPage` & `RegisterPage` (user aktif -> `NEXT_REDIRECT:/app`; `null` -> form dengan `<h1>`).

#### Non-Blocking Suggestions (Addressed / Acknowledged)

1. **`ResendMailer` direct unit test & log redaction `resetUrl` -- RESOLVED:** [tests/unit/auth-password-token.test.ts](file:///d:/Projects/noka-app/tests/unit/auth-password-token.test.ts#L7-L17) dan [baris 371–455](file:///d:/Projects/noka-app/tests/unit/auth-password-token.test.ts#L371-L455) menguji `ResendMailer` dengan klien `resend` termock (env kosong -> `503`, HTML-escape `&lt;Dinda&gt;`, `{ error }` -> `503` + `mailer.resend_rejected`, rejected promise -> `503` + `mailer.resend_failed`, serta pengecekan `stderr` bebas email/token). [tests/unit/logger.test.ts](file:///d:/Projects/noka-app/tests/unit/logger.test.ts#L67-L68) memastikan redaksi `"resetUrl"` dan `"reset_url"` menjadi `"[REDACTED]"`.
2. **Constant-time login response pada email tidak terdaftar -- RESOLVED:** [`loginUser`](file:///d:/Projects/noka-app/src/features/auth/service.ts#L160-L167) menjalankan `verifyPassword(input.password, DUMMY_PASSWORD_HASH)` ([baris 28–29](file:///d:/Projects/noka-app/src/features/auth/service.ts#L28-L29)) saat `!userRow`.
3. **Sinkronisasi dokumentasi & `flex-wrap` -- RESOLVED:** [TEST-STRATEGY.md](file:///d:/Projects/noka-app/TEST-STRATEGY.md#L290) diperbarui ke `17 unit + 11 integration + 3 E2E = 31`, [RFC-002](file:///d:/Projects/noka-app/RFCs/RFC-002-Authentication-And-Password-Reset.md#L109-L112) mencatat `NextRequest` dan `flex-wrap`, serta [`CardFooter`](file:///d:/Projects/noka-app/src/components/ui/Card.tsx#L71) memakai `flex-wrap`.
4. **Pengingat E2E browser (deferred by design):** Verifikasi horizontal overflow browser nyata (`scrollWidth <= innerWidth` di `360px`/`768px`/`1280px`) dan navigasi keyboard Tab penuh untuk rute auth dijadwalkan pada fase Playwright E2E (`TS-003-*` / `TS-010-02`).

### Updated Dimension Verdicts

| Dimension | Round 1 | Round 2 | Notes |
|---|---|---|---|
| **RFC Adherence** | CONCERNS | **PASS** | Seluruh AC & test suite `ResetPasswordForm` aktif + RSC auth guards terpenuhi; artefak RFC/Test Strategy sinkron. |
| **Rules Compliance** | PASS | **PASS** | Kepatuhan `STACK-*`, `ARCH-*`, `DATA-*`, `API-*`, `SEC-*`, `I18N-*`, `OBS-*`, `TEST-*`, `QUAL-*` tetap terjaga (`0` trace failure). |
| **Security** | CONCERNS | **PASS** | Bug retensi sweep rate limiter teratasi + uji regresi lengkap, logout menghapus baris DB `sessions` (teruji aktif), login unknown-email menjalankan `DUMMY_PASSWORD_HASH`, log redaksi mencakup `resetUrl`/`reset_url`, dan `ResendMailer` teruji anti-leak. |
| **Performance** | PASS | **PASS** | Zero-DB fast path pada cookie tak terautentikasi tetap terjaga; sweep rate limiter aman & terbounded. |
| **Maintainability** | CONCERNS | **PASS** | Seluruh komponen/rute kritis memiliki test regresi langsung; inkonsistensi dokumen minor dan `CardFooter` `flex-wrap` telah dirapikan. |

### Blocking Issues

0 blocking issues.
