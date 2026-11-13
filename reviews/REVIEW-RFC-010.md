# Code Review: RFC-010 — Account Settings, Cycle Configuration & Self-Service Account Deletion

- **RFC:** `RFC-010` ([`RFC-010-Account-Settings-And-Deletion.md`](../RFCs/RFC-010-Account-Settings-And-Deletion.md))
- **Features:** `F6` (`FR-2`, `FR-22`, `DEC-5`, `DEC-8`, `DEC-16`, `HIGH-2`, `HIGH-4`, `STACK-3`, `DATA-5`, `SEC-1`, `SEC-2`, `SEC-4`, `SEC-6`, `OFFLINE-4`, `OFFLINE-5`, `OBS-1`)
- **Branch & Commit:** `main` at `32b1125` (`feat(rfc-010): implement account settings, cycle configuration, and account deletion`, `22` files changed, `+2607 / -12`)
- **Predecessors:** `RFC-001`, `RFC-002`, `RFC-005`, `RFC-007`, `RFC-009` (all `Reviewed` in `RFCS.md`)
- **Review Date:** `2026-11-13`
- **Review Context:** Fresh review session (commit `32b1125` authored externally)
- **Reviewer Verdict:** **Reviewed** (**Overall Risk Level: Low**)

---

## Step 0: Automated Verification Output

All automated checks were executed directly against commit `32b1125`:

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: Exit code `0` (clean pass, 0 errors, 0 warnings).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: Exit code `0` (clean pass).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: Exit code `0` — **`Test Files 30 passed (30)`**, **`Tests 140 passed (140)`**, `Duration 33.46s`.
   - `RFC-010`-specific suites observed:
     - `tests/unit/account-settings-ui.test.tsx` — `5 passed (5)` (`TS-010` unit UI verification: renders `SettingsWorkspace` with all cards & 4 privacy policy points, handles `ProfileSettingsForm` read-only email & cycle day update, validates `ChangePasswordForm` password mismatch & server `401 INVALID_CURRENT_PASSWORD`, verifies `DeleteAccountSection` double confirmation modal & word matching `HAPUS`/`DELETE`, and renders English translations).
     - `tests/integration/account-settings-deletion.test.ts` — `11 passed (11)` (`TS-010-01` integration API verification: `PATCH /api/account/profile` unauth `401`, CSRF `403`, malformed JSON `400 INVALID_JSON`, rejects empty `{}` `422 VALIDATION_ERROR`, rejects invalid `cycleStartDay` `422 INVALID_CYCLE_DAY`, returns sanitized `{ user }` DTO without `passwordHash`, sets `noka_locale`/`noka_theme` cookies; `PATCH /api/account/password` unauth `401`, CSRF `403`, min 8 chars `422`, rejects wrong password `401 INVALID_CURRENT_PASSWORD` without invalidating session, re-hashes password with `bcryptjs` and revokes other active sessions; `DELETE /api/account` unauth `401`, CSRF `403`, required password `422`, rejects wrong password `401 INVALID_PASSWORD` without deleting data, handles concurrent deletion `FOR UPDATE` race with `401 UNAUTHORIZED`, atomically deletes transfers, transactions, wallets, categories, notes, folders, and attachment storage files without FK RESTRICT errors, clears `noka_session` cookie, and resiliently logs `account_storage_cleanup_partial` warning if `deleteUserAttachmentObjects` partially fails without failing account deletion).
4. **Production Build (`npm run build` -> Next.js `16.4.6` Turbopack):**
   - Result: Exit code `0` — `Compiled successfully in 1771ms`, `Finished TypeScript in 7.6s`, `Generating static pages using 15 workers (13/13) in 343ms`.
   - Verified generated routes:
     - `ƒ /api/account`
     - `ƒ /api/account/password`
     - `ƒ /api/account/profile`
     - `ƒ /app/settings`
5. **Playwright E2E (`tests/e2e/full-user-journey-and-a11y.spec.ts` & full `npm run test:e2e -- --workers=1`):**
   - Focused `RFC-010` release gate run (`tests/e2e/full-user-journey-and-a11y.spec.ts`, 2 workers): Exit code `0` — **`2 passed (15.6s)`** (`[desktop]` `13.5s`, `[mobile]` `13.8s`).
   - Full E2E suite (`npm run test:e2e -- --workers=1`): Exit code `0` — **`16 passed (2.4m)`** across all desktop and mobile specs:
     - `finance-workspace.spec.ts` (desktop, mobile)
     - `full-user-journey-and-a11y.spec.ts` (desktop, mobile)
     - `landing-seo.spec.ts` (desktop, mobile)
     - `note-attachments.spec.ts` (desktop, mobile)
     - `notes-workspace.spec.ts` (desktop, mobile)
     - `offline-sync-and-logout.spec.ts` (desktop, mobile)
     - `quick-capture-linked-notes.spec.ts` (desktop, mobile)
6. **Code Hygiene & Standards Compliance Scan (`Select-String` on `src/` & `tests/`):**
   - `0` occurrences of `TODO` or `FIXME`.
   - `0` occurrences of `: any` or `as any`.
   - `0` occurrences of `process.env.*` in `src/` outside `src/lib/env.ts`.
   - `0` occurrences of `rehype-raw` (`SEC-3`).
   - `formatIdr` in `src/components/` is called exclusively within `src/components/ui/PrivacyAmount.tsx` (`UI-4`).
7. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`, pre-review):**
   - Result: Exit code `0` — `33 requirements, 31 features, 61 rules, 10 RFCs`, `0 failure(s), 6 warning(s)` (`F20`–`F24` deferred v1.1 warnings + pre-review `WARN RFC-010 is implemented but not reviewed`).

---

## Product Type Check Scope

- **Product Type (per `PRD.md` / `RFCS.md`):** **Web App** (Next.js App Router PWA with React 19 + PostgreSQL + Drizzle ORM + IndexedDB).
- **Applied Checks:**
  - *Auth & Sessions*: `requireAuth` on all account routes, `verifyCsrfOrigin` on all mutations, re-hashing with bcrypt cost 12, revoking other sessions while preserving current session ID, HttpOnly session cookie wipe (`Max-Age=0`) upon deletion (`SEC-1`–`SEC-4`).
  - *Data Model & Integrity*: RESTRICT-safe FK deletion order (`transfers` -> `transactions` -> `wallets` -> `categories` -> `users`), `FOR UPDATE` concurrency lock on user row, zero orphan child records (`DATA-4`, `SEC-6`).
  - *Offline Guard & Sync*: Online-only mutation guards with localized offline notices on `ProfileSettingsForm`, `ChangePasswordForm`, and `DeleteAccountSection`, `PreferencesSyncBridge` inside `<SyncProvider>` with `{ persist: false }` to prevent infinite loops, instant `updateUserMeta` synchronizing Safe-to-Spend without page reload, and full `runClientLogoutCleanup` wiping IndexedDB and private SW cache upon deletion (`OFFLINE-4`, `OFFLINE-5`, `I18N-2`).
  - *Accessibility & Responsive Layout*: Zero horizontal overflow at 360px, 375px, 768px, and 1280px; modal keyboard trap and Escape dismiss; accessible ARIA labels (`UI-3`, `UI-5`).
  - *Observability & Privacy*: Health check `GET /api/health` 200 `{ status: "ok", db: "connected" }`, zero logging of passwords, reset tokens, or attachment content, resilient warning log on partial storage deletion (`OBS-1`, `OBS-2`).
- **Explicitly Skipped Checks (Visible Skip per `PRD.md` & `review-rfc`):**
  - *Binary Size*: Noka is a Web App/PWA (`F31`), not a native store binary; bundle size is validated via `next build` Turbopack chunks (`PERF-4`).
  - *Public Third-Party API SLA & Versioning*: Account endpoints are internal, session-authenticated first-party routes scoped strictly to the web application (`PRD.md`, `RULES.md`).

---

## Review Dimensions

### 1. RFC Adherence
- **Verdict:** **PASS**
- **Evaluation:**
  - `AC-10.1` (Profile, Cycle Start Day, Cookies & Non-Looping Sync): Fully satisfied. `src/features/account/schemas.ts` strictly validates `name` (`1..120`), `locale`, `theme`, and `cycleStartDay` (`1..28` or `end_of_month`). Rejects empty payload `{}` with `422 VALIDATION_ERROR` and invalid cycle days with `422 INVALID_CYCLE_DAY`. `PreferencesSyncBridge.tsx` mounted inside `<SyncProvider>` bridges root preferences without infinite loop (`{ persist: false }`).
  - `AC-10.2` (Password Change & Auth 401 Safety): Fully satisfied. `PATCH /api/account/password` requires `currentPassword` and validates `newPassword` (`8..128`). Wrong current password returns `401 INVALID_CURRENT_PASSWORD` without triggering client session wipe (`UNAUTHORIZED`). Hashes with `bcryptjs` cost 12 and atomicity deletes all other user sessions (`sessions.id <> currentSessionId`).
  - `AC-10.3` (Self-Service Account Deletion Race-Safe & Wipe Total): Fully satisfied. `DELETE /api/account` acquires `FOR UPDATE` lock on `users` table, verifies password, queries attachment `storageKey`s prior to FK deletion, deletes records in strict RESTRICT-safe order (`transfers` -> `transactions` -> `wallets` -> `categories` -> `users`), deletes physical storage objects post-commit with try/catch and warning logger on partial failure, clears session cookie, and triggers client-side `runClientLogoutCleanup()` wiping IndexedDB and private SW cache before navigating to `/`.
  - `AC-10.4` (Offline Guard, Privacy & Responsiveness): Fully satisfied. `ProfileSettingsForm`, `ChangePasswordForm`, and `DeleteAccountSection` render localized `WifiOff` notices and disable submit actions when `!isOnline`. `PrivacySummaryCard.tsx` clearly presents 4 key privacy commitments. Viewports 360px, 375px, 768px, and 1280px have zero horizontal overflow.
  - `AC-10.5` (Tests, Lampiran E2E, Health & Release Gate): Fully satisfied. `tests/integration/account-settings-deletion.test.ts` (11 tests), `tests/unit/account-settings-ui.test.tsx` (5 tests), and `tests/e2e/full-user-journey-and-a11y.spec.ts` (2 tests) all pass cleanly.
- **Findings:** None.

### 2. Rules Compliance
- **Verdict:** **PASS**
- **Evaluation:**
  - `STACK-3`: PostgreSQL with Drizzle ORM transactions and `FOR UPDATE` locking (`service.ts`).
  - `ARCH-1`, `ARCH-2`, `ARCH-4`: Clean separation between server page (`settings/page.tsx`), domain service (`service.ts`), schemas (`schemas.ts`), and client UI components (`components/settings/`). `PreferencesSyncBridge` connects context cleanly without duplicate providers.
  - `DATA-5`: `cycleStartDay` strictly constrained to `'1'`..`'28'` or `'end_of_month'`.
  - `API-1`, `API-2`: Standardized API responses via `apiOk`, `ApiError`, and `handleApiError` with Zod validation.
  - `SEC-1`, `SEC-2`, `SEC-4`, `SEC-6`: Strict tenant isolation, constant-time password verification with bcrypt cost 12, CSRF origin verification on all mutation routes, and complete atomic account deletion.
  - `OFFLINE-4`, `OFFLINE-5`: Offline UI mutation guards with localized messages; total purge of IndexedDB and private SW cache upon account deletion.
  - `UI-3`, `UI-5`: Responsive layout conforming to `#161616` / `#ededed` / `#ff7448` design tokens; modal dialog accessible with Escape keyboard dismiss.
  - `I18N-1`, `I18N-2`: Complete ID and EN translations for all settings keys; non-looping preference synchronization bridge.
  - `OBS-1`, `OBS-2`: Production `/api/health` 200 endpoint; zero logging of plaintext passwords, tokens, or private data.
  - `TEST-1`, `TEST-3`, `TEST-5`, `QUAL-2`, `QUAL-3`: Full test coverage, zero TODO/FIXME, zero `: any`/`as any`, clean build.
- **Findings:** None.

### 3. Security
- **Verdict:** **PASS**
- **Evaluation:**
  - Input validation: All inputs are parsed and validated via Zod schemas (`updateProfileSchema`, `changePasswordSchema`, `deleteAccountSchema`).
  - CSRF: All mutation endpoints (`PATCH /api/account/profile`, `PATCH /api/account/password`, `DELETE /api/account`) invoke `verifyCsrfOrigin(req)`.
  - Password security: Hashed using `bcryptjs` with cost 12. Password change revokes all other sessions from the database.
  - Race condition protection: `deleteAccount` uses `tx.select().from(users).where(eq(users.id, userId)).for("update")` to ensure atomic, non-concurrent execution.
  - Data sanitization: Profile update returns sanitized user object omitting `passwordHash`.
  - Storage deletion resilience: Storage keys are extracted inside the locked transaction; physical deletion occurs post-commit and logs only opaque UUID failed keys without failing the account deletion or revealing sensitive data.
- **Findings:** None.

### 4. Performance
- **Verdict:** **PASS**
- **Evaluation:**
  - Password change and account deletion execute inside single atomic database transactions without redundant queries.
  - Profile preferences updates utilize `{ persist: false }` to eliminate duplicate network calls and render loops.
  - Turbopack compilation runs in under 2 seconds; E2E release gate executes in ~15 seconds.
- **Findings:** None.

### 5. Maintainability
- **Verdict:** **PASS**
- **Evaluation:**
  - Clean, idiomatic TypeScript with strict types and zero `any`.
  - Modular UI split into single-responsibility forms (`ProfileSettingsForm`, `ChangePasswordForm`, `DeleteAccountSection`, `PrivacySummaryCard`).
  - Comprehensive, well-documented integration and unit tests covering edge cases (concurrent deletions, partial storage failures, CSRF mismatch, malformed JSON).
- **Findings:** None.

---

## Overall Assessment

- **Overall Risk Level:** **Low**
- **Summary:** `RFC-010` completes the core v1.0 milestone for Noka. Profile configuration, cycle day adjustment with instant Safe-to-Spend recalculation, password change with session revocation, and self-service account deletion with RESTRICT-safe FK ordering and complete client data wipe are fully implemented, verified, and pass all unit, integration, and E2E test suites with zero regressions.
- **Blocking Issues:** None.
- **Improvement Suggestions (Non-blocking):**
  - In `ProfileSettingsForm.tsx`, consider adding an explicit dirty check before triggering `PATCH /api/account/profile` if the user submits without changing any field values.
  - In Playwright E2E tests, sequential execution (`--workers=1`) is recommended for suites testing full logout and storage wipe to prevent intermittent timing contention with parallel session tests.

