# Code Review: RFC-013 — Recurring Transactions Scheduler (Serverless-Safe On-Access)

- **RFC:** `RFC-013` ([`RFC-013-Recurring-Transactions-Scheduler.md`](../RFCs/RFC-013-Recurring-Transactions-Scheduler.md))
- **Features:** `F21` (`FR-18`, `ARCH-2`, `API-1`, `API-2`, `DATA-1`, `DATA-2`, `DATA-3`, `DATA-4`, `SEC-1`, `OFFLINE-2`, `OFFLINE-3`, `UI-1`, `UI-2`, `I18N-1`, `TEST-1`, `TEST-3`, `QUAL-2`)
- **Branch & Head Commit:** `feat/rfc-013-recurring-transactions-scheduler` at `a6ce285` (authored by dzikri at `691a0c3`, review verification commit at `a6ce285`)
- **Predecessors:** `RFC-001`, `RFC-002`, `RFC-006`, `RFC-007`, `RFC-009`, `RFC-012` (all `Reviewed` in `RFCS.md`)
- **Review Date:** `2026-11-16`
- **Review Context:** Fresh review session (implementation commit `691a0c3` authored in separate context)
- **Reviewer Verdict:** **Reviewed** (**Overall Risk Level: Low**)

---

## Round 1 -- 2026-11-16

### Step 0: Automated Verification Output

All automated checks were executed directly against branch `feat/rfc-013-recurring-transactions-scheduler`:

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: Exit code `0` (clean pass, 0 errors, 0 warnings).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: Exit code `0` (clean pass, 0 type errors).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: Exit code `0` — **`Test Files 36 passed (36)`**, **`Tests 209 passed (209)`**, `Duration 62.14s`.
   - `RFC-013`-specific suites observed:
     - `tests/unit/recurring-scheduler.test.tsx` — `15 passed (15)` (`TS-013-01`: scheduling algorithms for daily, weekly, and monthly intervals; leap year handling; month-end clamping for day 31 across all 12 calendar months with zero permanent drift; initial run date alignment; and UI component rendering and interaction tests for `RecurringPendingBanner` and `RecurringTemplateModal`).
     - `tests/integration/recurring-api.test.ts` — `9 passed (9)` (`TS-013-02`: authentication `401 UNAUTHORIZED`, CSRF origin protection `403 FORBIDDEN`, input validation `422` on negative amounts, category type alignment, and archived wallet restriction; idempotent CRUD and pause/resume PATCH; concurrency testing with 3 parallel `process` calls asserting atomic `FOR UPDATE` locking and exactly 1 execution with zero duplicates; manual confirmation flow testing apply with amount/wallet overrides vs skip; template deactivation upon passing `endDate`; referential integrity on template deletion preserving ledger history with nullified `recurring_template_id`; and strict multi-tenant isolation `SEC-1`).
4. **Production Build (`npm run build` -> Next.js `16.4.6` Turbopack):**
   - Result: Exit code `0` — `Compiled successfully in 2.9s`, `Finished TypeScript in 5.8s`, `Generating static pages using 15 workers (18/18) in 668ms`.
   - Verified new API endpoints generated:
     - `ƒ /api/finance/recurring`
     - `ƒ /api/finance/recurring/[id]`
     - `ƒ /api/finance/recurring/confirm`
     - `ƒ /api/finance/recurring/process`
5. **Playwright E2E Suite (`npx playwright test`):**
   - Result: Exit code `0` — **`16 passed (2.4m)`** across all desktop and mobile specs with zero regressions.
6. **Code Hygiene & Standards Compliance Scan:**
   - `0` occurrences of `TODO` or `FIXME`.
   - `0` occurrences of `: any` or `as any`.
   - `0` occurrences of unauthorized `process.env.*` outside `src/lib/env.ts`.
   - `0` occurrences of `rehype-raw` (`SEC-7`).
7. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`):**
   - Pre-review: `33 requirements, 31 features, 61 rules, 15 RFCs`, `0 failure(s), 1 warning(s)` (`WARN RFC-013 is implemented but not reviewed`).

---

## Product Type Check Scope

- **Product Type (per `PRD.md` / `RFCS.md`):** **Web App** (Next.js App Router PWA with React 19 + PostgreSQL + Drizzle ORM + IndexedDB).
- **Applied Checks:**
  - *Auth & Sessions*: `requireAuth` on all recurring routes; CSRF origin validation on all mutations (`verifyCsrfOrigin`).
  - *Authorization per Resource*: Strict user isolation (`WHERE user_id = session.userId`) across recurring templates, wallets, categories, and ledger transactions (`SEC-1`).
  - *Data Model & Financial Integrity*: Recurring amounts stored as positive integer `bigint` in IDR (`DATA-1`). Derived ledger balance updates (`DATA-2`). Row locking `FOR UPDATE` preventing duplicate creations under concurrent requests (`DATA-3`). Referential integrity enforcement (`DATA-4`): archived wallets rejected, category deletion reassigns template categories to fallback, template deletion sets `recurring_template_id = NULL` on existing ledger transactions, and account deletion cleans up templates cleanly.
  - *Offline Sync & PWA*: IndexedDB schema upgraded to version 3 with `recurringTemplates` store and `by-nextRunAt` index; outbox mutation handling for `recurring_upsert` and `recurring_delete`; snapshot synchronization in `buildUserSyncSnapshot`; and complete purge on logout/401 (`OFFLINE-2`, `OFFLINE-3`, `OFFLINE-5`).
  - *Accessibility & UI*: Clean modal forms, keyboard navigation, semantic `role="alert"` on pending banner, `<PrivacyAmount />` integration, and bilingual ID/EN translations (`UI-1`, `UI-2`, `I18N-1`).
- **Explicitly Skipped Checks (Visible Skip per `PRD.md` & `review-rfc`):**
  - *Binary Size*: Noka is a Web App/PWA, not a native app store binary; bundle size is governed by web asset optimization (`PERF-4`).
  - *Public Third-Party API SLA & Versioning*: Internal routes scoped exclusively to the Noka web application.

---

## Review Dimensions

### 1. RFC Adherence
- **Verdict:** **PASS**
- **Evaluation:**
  - `AC-13.1` (Database Schema & Financial Rule Validation — `F21`, `DATA-1`, `DATA-4`): Fully satisfied. The `recurring_templates` table enforces `amount > 0`, `interval_step >= 1`, valid day bounds, and foreign keys. Wallet validation checks for active status (`archivedAt === null`), rejecting archived wallets with `422 WALLET_ARCHIVED`. Category validation ensures type alignment with the template, rejecting mismatches with `422 CATEGORY_TYPE_MISMATCH`. Deleting a custom category cascades cleanly by reassigning templates to the system fallback category.
  - `AC-13.2` (Accurate Due Date Calculation & Month-End Clamping — `F21`): Fully satisfied. `calculateNextRunAt` deterministically computes daily, weekly, and monthly recurrence. Crucially, monthly scheduling preserves the original `targetDayOfMonth` across short months (e.g. Jan 31 -> Feb 28 -> Mar 31), preventing permanent drift.
  - `AC-13.3` (Duplicate-Free On-Access Execution — `F21`, `DATA-3`, `SEC-1`): Fully satisfied. Evaluated automatically during `/app/finance` page load and on demand via `POST /api/finance/recurring/process`. Rows are locked using `FOR UPDATE` within an atomic transaction. A concurrency test simulating 3 simultaneous parallel requests verified that exactly one transaction was recorded.
  - `AC-13.4` (Confirmation Flow & Skip Option — `F21`, `UI-1`): Fully satisfied. Templates configured with `autoApply: false` are surfaced via `RecurringPendingBanner` in the UI. Users can batch-apply all, or open the review modal to customize the amount/wallet, confirm individual items, or skip the current cycle without creating a transaction.
  - `AC-13.5` (Historical Ledger Retention — `F21`, `DATA-4`): Fully satisfied. The foreign key `transactions.recurring_template_id` has `onDelete: "set null"`. Deleting a recurring template leaves past ledger entries intact.
  - `AC-13.6` (Offline Storage & Synchronization — `F21`, `OFFLINE-2`): Fully satisfied. IndexedDB version 3 includes `recurringTemplates` object store with index. Snapshot sync and outbox mutations (`recurring_upsert`, `recurring_delete`) allow full offline viewing and queueing, with complete purge upon logout.
- **Findings:** None.

### 2. Rules Compliance
- **Verdict:** **PASS**
- **Evaluation:**
  - `ARCH-1`, `ARCH-2`: Thin route handlers delegating to `recurring-service.ts`. Server component in `app/finance/page.tsx` evaluates due templates server-side during initial load.
  - `DATA-1`: IDR amounts are verified as positive integers within `Number.MAX_SAFE_INTEGER` and stored as `bigint`.
  - `DATA-2`: Spending and balances remain strictly derived from ledger transactions.
  - `DATA-4`: Complete referential integrity across wallets, categories, and account deletion.
  - `API-1`, `API-2`, `API-3`: Uniform `{ ok: true, data }` response format, semantic HTTP status codes, Zod validation, and `withIdempotency` protection.
  - `SEC-1`: Strict `WHERE user_id = session.userId` scoping on all queries and mutations.
  - `OFFLINE-2`, `OFFLINE-3`: Event-driven offline sync with zero reliance on the unsupported `Background Sync API`.
  - `UI-1`, `UI-2`: Warm minimalist aesthetic with CSS tokens, responsive flex layout, and `<PrivacyAmount />` masking.
  - `I18N-1`: Complete dictionaries for `finance.recurring.*` in both Indonesian (`id.ts`) and English (`en.ts`).
  - `QUAL-2`: Zero `TODO`, zero `FIXME`, zero `: any` / `as any`.
- **Findings:** None.

### 3. Security
- **Verdict:** **PASS**
- **Evaluation:**
  - Input validation thoroughly guards amount boundaries, frequencies, intervals, and dates using Zod.
  - CSRF protection is verified on all mutation endpoints via `verifyCsrfOrigin`.
  - Multi-tenant boundary tests demonstrate that User A cannot read, modify, delete, process, or confirm User B's templates.
- **Findings:** None.

### 4. Performance
- **Verdict:** **PASS**
- **Evaluation:**
  - Fast index lookup via composite btree index `(user_id, is_active, next_run_at)` ensures the on-access query inspects only due templates for the authenticated user.
  - Row locking with `FOR UPDATE` is strictly limited to the user's due rows, avoiding database table contention.
- **Findings:** None.

### 5. Maintainability
- **Verdict:** **PASS**
- **Evaluation:**
  - Modular structure across schemas, services, and UI components.
  - Comprehensive unit test suite (15 tests) with full edge case coverage for date arithmetic and leap years.
  - 9 end-to-end integration tests covering concurrency, referential cascades, and tenant isolation.
- **Findings:** None.

---

## Overall Assessment

- **Overall Risk Level:** **Low**
- **Summary:** `RFC-013` delivers an exceptional, serverless-safe recurring transactions scheduler (`F21`) with atomic on-access evaluation, duplicate prevention under concurrent requests, drift-free month-end date calculations, manual confirmation workflows with skip/override options, full IndexedDB v3 offline mirroring, and complete bilingual UI integration. All 36 Vitest test files (209 tests) and 16 Playwright E2E tests pass cleanly with zero regressions.
- **Blocking Issues:** None.
- **Improvement Suggestions (Non-blocking):**
  1. **Direct Workspace Navigation / Quick Action Button for Recurring Templates:** In `FinanceWorkspace.tsx`, recurring templates are managed via modal dialog. Adding a dedicated button (e.g. alongside "Kelola Anggaran" / "Atur Anggaran") or quick stat card in the dashboard would give users immediate, one-click access to open `RecurringTemplateModal`. *(Status: Implemented in `f3bfb4b` with active count badge in action button and dedicated one-click Quick Summary Card on workspace).*
  2. **Frequency Custom / Annual Presets (Future v1.1+):** While yearly recurrences can currently be modeled using monthly frequency with `intervalStep: 12`, adding an explicit `yearly` option in future iterations would improve convenience for annual commitments. *(Status: Implemented in `f3bfb4b` with quick preset pills for 1 month, 3 months / quarterly, 6 months / semiannual, and 12 months / annual recurrence).*
  3. **Visual Offline Queue Indicator inside Template Modal:** In offline mode, creating a recurring template queues an outbox mutation. Adding an informational badge inside `RecurringTemplateModal` stating that new templates will synchronize once reconnected would provide helpful user feedback. *(Status: Implemented in `f3bfb4b` with `data-testid="recurring-offline-notice"` and bilingual notice).*
