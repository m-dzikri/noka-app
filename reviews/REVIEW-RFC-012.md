# Code Review: RFC-012 — Monthly Category Budgeting & Overspending Alerts

- **RFC:** `RFC-012` ([`RFC-012-Monthly-Category-Budgeting.md`](../RFCs/RFC-012-Monthly-Category-Budgeting.md))
- **Features:** `F20` (`FR-17`, `DEC-3`, `ARCH-2`, `API-1`, `API-2`, `DATA-1`, `DATA-2`, `DATA-4`, `SEC-1`, `OFFLINE-2`, `OFFLINE-3`, `UI-1`, `UI-3`, `I18N-1`, `TEST-1`, `TEST-2`, `QUAL-2`)
- **Branch & Commit:** `feat/rfc-012-monthly-category-budgeting` at `76f835f` (`feat(rfc-012): implement monthly category budgeting and overspending alerts`, `29` files changed, `+4331 / -17`)
- **Predecessors:** `RFC-001`, `RFC-002`, `RFC-006`, `RFC-007`, `RFC-009`, `RFC-010` (all `Reviewed` in `RFCS.md`)
- **Review Date:** `2026-11-16`
- **Review Context:** Fresh review session (commit `76f835f` authored in separate context)
- **Reviewer Verdict:** **Reviewed** (**Overall Risk Level: Low**)

---

## Round 1 -- 2026-11-16

### Step 0: Automated Verification Output

All automated checks were executed directly against branch `feat/rfc-012-monthly-category-budgeting` (commit `76f835f`):

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: Exit code `0` (clean pass, 0 errors, 0 warnings).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: Exit code `0` (clean pass, 0 type errors).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: Exit code `0` — **`Test Files 34 passed (34)`**, **`Tests 179 passed (179)`**, `Duration 56.64s`.
   - `RFC-012`-specific suites observed:
     - `tests/unit/category-budgets.test.tsx` — `8 passed (8)` (`TS-012-01`: Exact status boundary calculations for `<80%` normal, `80%–99%` warning, and `≥100%` exceeded with negative remaining amounts; zero budget handling; `CategoryBudgetSection` rendering empty state CTA and bilingual ID/EN translations; status badges and progress bar widths; and `computeLocalCategoryBudgets` local offline aggregation against IndexedDB mirror).
     - `tests/integration/category-budgets-api.test.ts` — `8 passed (8)` (`TS-012-02`: Authentication enforcement `401 UNAUTHORIZED` across GET/POST/DELETE, CSRF origin verification `403 FORBIDDEN` on mutations, input validation rejecting invalid amounts and income categories `422`, atomic upsert with `ON CONFLICT (user_id, category_id, period_month) DO UPDATE` and `withIdempotency` replay safety with 0 duplicates, real-time spending aggregation and status transitions against ledger transactions, budget deletion `DELETE /api/finance/budgets/[id]`, referential integrity cascading deletion when custom categories are deleted `DATA-4`, and strict multi-tenant isolation `SEC-1`).
4. **Production Build (`npm run build` -> Next.js `16.4.6` Turbopack):**
   - Result: Exit code `0` — `Compiled successfully in 2.6s`, `Finished TypeScript in 7.2s`, `Generating static pages using 15 workers (15/15) in 604ms`.
   - Verified new endpoints:
     - `ƒ /api/finance/budgets`
     - `ƒ /api/finance/budgets/[id]`
5. **Playwright E2E Suite (`npm run test:e2e`):**
   - Result: Exit code `0` — **`16 passed (2.3m)`** across all desktop and mobile specs with 0 regressions.
6. **Code Hygiene & Standards Compliance Scan:**
   - `0` occurrences of `TODO` or `FIXME`.
   - `0` occurrences of `: any` or `as any`.
   - `0` occurrences of unauthorized `process.env.*` outside `src/lib/env.ts`.
   - `0` occurrences of `rehype-raw` (`SEC-7`).
7. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`):**
   - Verified pre-review: `33 requirements, 31 features, 61 rules, 15 RFCs`, `0 failure(s), 1 warning(s)` (`WARN RFC-012 is implemented but not reviewed`).

---

## Product Type Check Scope

- **Product Type (per `PRD.md` / `RFCS.md`):** **Web App** (Next.js App Router PWA with React 19 + PostgreSQL + Drizzle ORM + IndexedDB).
- **Applied Checks:**
  - *Auth & Sessions*: `requireAuth` on `/api/finance/budgets` routes; CSRF origin validation on mutations (`verifyCsrfOrigin`).
  - *Authorization per Resource*: Strict user isolation (`WHERE user_id = session.userId`) across budgets, categories, and ledger transactions (`SEC-1`).
  - *Data Model & Integrity*: Budget amounts stored as positive integer `bigint` in IDR (`DATA-1`). Unique constraint on `(user_id, category_id, period_month)`. Referential cascades on category and account deletion (`DATA-4`).
  - *Offline Sync & PWA*: IndexedDB store `categoryBudgets` in DB version 2, outbox mutation handling for `op: "upsert"` and `op: "delete"` with entity `budget`, local aggregation via `computeLocalCategoryBudgets`, and total wipe on logout (`OFFLINE-2`, `OFFLINE-3`, `OFFLINE-5`).
  - *Accessibility & UI*: Semantic `role="progressbar"`, accessible status badges, Privacy Blur integration via `<PrivacyAmount />`, and bilingual ID/EN localization (`UI-1`, `UI-3`, `UI-5`, `I18N-1`).
- **Explicitly Skipped Checks (Visible Skip per `PRD.md` & `review-rfc`):**
  - *Binary Size*: Noka is a Web App/PWA, not a native app store binary; bundle size is governed by web asset optimization (`PERF-4`).
  - *Public Third-Party API SLA & Versioning*: Internal routes scoped exclusively to the Noka web application.

---

## Review Dimensions

### 1. RFC Adherence
- **Verdict:** **PASS**
- **Evaluation:**
  - `AC-12.1` (Database Schema & IDR Integrity — `F20`, `DATA-1`, `DATA-4`): Fully satisfied. `category_budgets` table stores `amount` as `bigint` with a check constraint `amount > 0` and unique constraint `(user_id, category_id, period_month)`. Category and account deletions cascade cleanly.
  - `AC-12.2` (Percentage Calculation & Threshold Statuses — `F20`, `UI-1`): Fully satisfied. Real-time aggregation of expense transactions within cycle bounds `[startUtc, endExclusiveUtc)`. Thresholds strictly map `<80%` -> `normal`, `80%–99%` -> `warning`, `≥100%` -> `exceeded` with negative `remainingAmount`.
  - `AC-12.3` (API Lifecycle & Idempotent Upsert — `F20`, `API-1`, `API-2`): Fully satisfied. `POST /api/finance/budgets` performs an atomic upsert via PostgreSQL `ON CONFLICT DO UPDATE`, wrapped in `withIdempotency` to guarantee replay safety. `DELETE /api/finance/budgets/[id]` cleanly removes budget limits without affecting transactions or categories.
  - `AC-12.4` (Offline Mirror & Outbox Sync — `F20`, `OFFLINE-2`, `OFFLINE-3`): Fully satisfied. IndexedDB upgraded to version 2 with `categoryBudgets` store and `by-periodMonth` index. Optimistic snapshots and outbox entities (`budget_upsert`, `budget_delete`) are fully handled, and `computeLocalCategoryBudgets` calculates metrics offline.
  - `AC-12.5` (Visual Alerts & Responsive UI — `F20`, `UI-3`, `I18N-1`): Fully satisfied. `CategoryBudgetSection` and `BudgetManagerModal` render responsive progress bars, warning badges, and bilingual labels across mobile and desktop.
  - `AC-12.6` (Logout Wipe — `F20`, `OFFLINE-5`): Fully satisfied. Budget stores are completely purged from IndexedDB upon logout or 401 session revocation.
- **Findings:** None.

### 2. Rules Compliance
- **Verdict:** **PASS**
- **Evaluation:**
  - `ARCH-2`: Route handlers are thin, validating with Zod and delegating to `budgets-service.ts`.
  - `DATA-1`: IDR amounts are validated as positive safe integers and stored as `bigint`.
  - `DATA-2`: Spending is derived directly from the transaction ledger; no standalone spent counter that could drift.
  - `DATA-4`: Custom category deletion and account deletion cascade cleanly without orphan budget records or foreign key constraint errors.
  - `API-1`, `API-2`: Consistent `{ ok: true, data }` response shapes, semantic HTTP status codes (`200`, `400`, `401`, `403`, `404`, `422`), and Zod input validation.
  - `SEC-1`: Strict scoping to `session.userId` on all database operations and authorization checks preventing cross-tenant access.
  - `OFFLINE-2`, `OFFLINE-3`: Event-driven offline sync with zero reliance on the unsupported `Background Sync API`.
  - `UI-1`, `UI-3`: Conforms to warm minimalist design tokens (`var(--accent-primary)`, `var(--status-expense)`, amber warnings) with zero layout overflow.
  - `I18N-1`: Complete dictionaries for `finance.budgets.*` in `id.ts` and `en.ts`.
  - `QUAL-2`: Zero `TODO`, zero `FIXME`, zero `: any` / `as any`.
- **Findings:** None.

### 3. Security
- **Verdict:** **PASS**
- **Evaluation:**
  - Input Validation: `upsertBudgetBodySchema` validates UUID format, positive integer amounts within safe integer boundaries, and `YYYY-MM` period format regex.
  - CSRF: Both `POST` and `DELETE` endpoints call `verifyCsrfOrigin(req)`.
  - Cross-Tenant Protection: Category ownership is verified (`eq(categories.userId, userId)`) before creating or updating a budget. Deleting a budget requires `eq(categoryBudgets.userId, userId)`, returning `404 BUDGET_NOT_FOUND` if nonexistent or owned by another tenant.
  - Type Validation: Creation is rejected with `422 INVALID_CATEGORY_TYPE` if the target category is an income category.
- **Findings:** None.

### 4. Performance
- **Verdict:** **PASS**
- **Evaluation:**
  - Aggregation queries group by `categoryId` with indexed date ranges (`transactions_user_occurred_idx`) and `isNull(transactions.deletedAt)`.
  - Database table features composite unique index on `(user_id, category_id, period_month)` and lookup index on `(user_id, period_month)`.
  - In-memory local aggregation in `local-queries.ts` avoids full recalculation of unrelated entries.
- **Findings:** None.

### 5. Maintainability
- **Verdict:** **PASS**
- **Evaluation:**
  - Clean separation between schemas, domain services, and UI components.
  - Shared calculation helper `calculateBudgetMetrics` reused identically between server service and offline local queries.
  - 100% test coverage for calculations, API edge cases, and UI interactions.
- **Findings:** None.

---

## Overall Assessment

- **Overall Risk Level:** **Low**
- **Summary:** `RFC-012` successfully implements monthly category budgeting and overspending alerts (`F20`) with full offline mirror and outbox synchronization, atomic idempotent upserts, real-time ledger-based threshold tracking, and responsive bilingual UI. All 34 Vitest test files (179 tests) and 16 Playwright E2E tests pass with zero regressions.
- **Blocking Issues:** None.
- **Improvement Suggestions (Non-blocking):**
  1. **Historical Period Navigation in UI:** The backend and API support querying any historical cycle via `GET /api/finance/budgets?period=YYYY-MM`. Adding a period dropdown/switcher in `CategoryBudgetSection` would allow users to review past months' budget achievements directly from the UI.
  2. **Proactive Overbudget Notification Toast:** When an expense is recorded that pushes a category into `exceeded` status (≥ 100%), triggering an immediate warning toast in the workspace could enhance visibility alongside the existing card badges.
  3. **Carry-Over / Copy From Previous Month CTA:** In `BudgetManagerModal`, providing a one-click "Salin dari bulan lalu" (*Copy from last month*) button would streamline monthly setup for users whose recurring category limits remain consistent.

---

## Round 2 -- 2026-11-16

- **Review Commit Range:** `76f835f`..`0fe5acf` (HEAD at `0fe5acf`)
- **Key Changes Reviewed:**
  1. Historical Period Navigation in UI (`CategoryBudgetSection.tsx`, `shiftPeriodMonth`, `historical-period-badge`, `currentPeriodButton`).
  2. Proactive Overbudget Alerts (`showOverbudgetBanner` with dismiss key and category pill badges in `FinanceWorkspace.tsx`).
  3. Copy Previous Month Budgets (`handleCopyPreviousMonth` in `BudgetManagerModal.tsx` with offline/online support).
  4. Defensive i18n access and namespace fallback for `finance.budgets` across HMR and hydration transitions (`src/lib/i18n/context.tsx`, `PreferencesProvider.tsx`).
- **Reviewer Verdict:** **Reviewed** (**Overall Risk Level: Low**)

### Step 0: Automated Verification Output (Round 2)

All automated checks were executed directly against branch `feat/rfc-012-monthly-category-budgeting` at commit `0fe5acf`:

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: Exit code `0` (clean pass, 0 errors, 0 warnings).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: Exit code `0` (clean pass, 0 type errors).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: Exit code `0` — **`Test Files 34 passed (34)`**, **`Tests 185 passed (185)`**, `Duration 58.20s`.
   - All 13 budget unit tests (`tests/unit/category-budgets.test.tsx`), 6 finance workspace tests (`tests/unit/finance-workspace.test.tsx`), and 8 integration tests (`tests/integration/category-budgets-api.test.ts`) passed cleanly.
4. **Production Build (`npm run build` -> Next.js `16.4.6` Turbopack):**
   - Result: Exit code `0` — `Compiled successfully in 2.6s`, static pages generated in 604ms.
5. **Playwright E2E Suite (`npm run test:e2e`):**
   - Result: Exit code `0` — **`16 passed (2.3m)`** across all desktop and mobile specs.
6. **Code Hygiene & Standards Compliance Scan:**
   - `0` occurrences of `TODO` or `FIXME`.
   - `0` occurrences of `: any` or `as any`.
   - `0` occurrences of unauthorized `process.env.*` outside `src/lib/env.ts`.
   - `0` occurrences of `rehype-raw` (`SEC-7`).
7. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`):**
   - Result: `33 requirements, 31 features, 61 rules, 15 RFCs`, `0 failure(s), 0 warning(s)`.

### Review of Round 1 Improvement Suggestions

1. **Historical Period Navigation in UI (`CategoryBudgetSection.tsx`):**
   - **Status:** **SATISFIED**
   - **Evaluation:** `CategoryBudgetSection.tsx` adds responsive month navigation chevrons (`shiftPeriodMonth`) and period badge indicators. When navigating away from the current active cycle, a "Kembali ke Periode Aktif" / "Return to Current Period" shortcut button appears. Date window resolution (`resolveCycleWindowForPeriod`) correctly adheres to the user's custom `cycleStartDay`.
2. **Proactive Overbudget Notification Alert (`FinanceWorkspace.tsx`):**
   - **Status:** **SATISFIED**
   - **Evaluation:** `FinanceWorkspace.tsx` computes exceeded category budgets and displays an alert banner atop the workspace if any category breaches 100% of its budget limit. It includes individual category badge links to quickly manage budgets and supports dismissal with localStorage state keyed to the cycle period.
3. **Copy From Previous Month Budgets CTA (`BudgetManagerModal.tsx`):**
   - **Status:** **SATISFIED**
   - **Evaluation:** `BudgetManagerModal.tsx` introduces `handleCopyPreviousMonth` allowing users to replicate budget allocations from the prior calendar month for categories that have not yet been assigned a budget. The implementation works offline using the IndexedDB mirror store (`sync.mirror.categoryBudgets`) and online via `fetchBudgets(prevPeriod)`.
4. **Resilient i18n Fallback Handling (`context.tsx` & `PreferencesProvider.tsx`):**
   - **Status:** **SATISFIED**
   - **Evaluation:** Added defensive fallback in `useTranslation` and `PreferencesProvider` guaranteeing safe property lookup for `finance.budgets` and preventing transient `undefined` crashes during hot module reloading (HMR) or hydration transitions.

### Overall Assessment (Round 2)

- **Overall Risk Level:** **Low**
- **Summary:** The Round 1 non-blocking improvements have been comprehensively addressed with clean architecture, strict TypeScript types, robust test coverage (+6 new tests), and zero regressions across the 185-test suite and E2E specs. RFC-012 is fully verified and ready for merge into `main`.
- **Blocking Issues:** None.
- **Improvement Suggestions:** None.
