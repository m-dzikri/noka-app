# Code Review: RFC-007 — Finance Dashboard, Safe-to-Spend & Privacy Blur Mode

- **RFC:** `RFC-007` ([`RFC-007-Finance-Dashboard-SafeToSpend-Privacy.md`](../RFCs/RFC-007-Finance-Dashboard-SafeToSpend-Privacy.md))
- **Features:** `F13`, `F16`, `F17` (`FR-10`, `FR-13`, `FR-14`, `DEC-12`, `HIGH-2`, `DATA-5`, `UI-4`)
- **Branch & Commit:** `feat/rfc-007-finance-dashboard-safetospend-privacy` at `b935ffb` (`feat(rfc-007): implement finance dashboard, safe-to-spend, and privacy blur mode`)
- **Predecessors:** `RFC-001` (`Reviewed`), `RFC-002` (`Reviewed`), `RFC-006` (`Reviewed`)
- **Review Date:** `2026-11-12`
- **Review Context:** Fresh review session (commit `b935ffb` was authored outside this session)
- **Reviewer Verdict:** **Reviewed** (**Overall Risk Level: Low**)

---

## Step 0: Automated Verification Output

All automated verification commands were executed directly on branch `feat/rfc-007-finance-dashboard-safetospend-privacy` (`b935ffb`):

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: Exit code `0` (clean pass).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: Exit code `0` (clean pass).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: Exit code `0` — `Test Files  24 passed (24)`, `Tests  109 passed (109)`, `Duration  35.47s`.
   - `RFC-007`-specific suites observed:
     - `tests/unit/safe-to-spend.test.ts` — `4 passed (4)` (`TS-007-01`)
     - `tests/unit/privacy-blur.test.tsx` — `4 passed (4)` (`TS-007-02`)
     - `tests/integration/finance-summary.test.ts` — `1 passed (1)` (`TS-007-03`, including `< 300ms` latency assertion)
     - `tests/unit/finance-workspace.test.tsx` — `4 passed (4)`
     - `tests/unit/auth-forms.test.tsx` — `7 passed (7)`
4. **Production Build (`npm run build` -> Next.js `16.4.6` Turbopack):**
   - Executed with `$env:DATABASE_URL=""; $env:SESSION_SECRET=""; $env:APP_URL="http://127.0.0.1:3114"; npm run build` (`.env` loaded by Next.js).
   - Result: Exit code `0` — `Compiled successfully in 1173ms`, `Finished TypeScript in 3.1s`, `Generating static pages using 15 workers (11/11) in 367ms`. `/api/finance/summary` and `/app/finance` compiled cleanly as `ƒ (Dynamic)` routes.
5. **Playwright E2E (`npx playwright test tests/e2e/finance-workspace.spec.ts --workers=2` & `npm run test:e2e -- --workers=2`):**
   - Focused Finance E2E (`tests/e2e/finance-workspace.spec.ts`, 2 workers): Exit code `0` — `2 passed (15.5s)` (`[desktop]`, `[mobile]`), verifying unified transfer ledger filtering (`cashflow = Rp0`), `Safe-to-Spend`, Privacy Blur toggle & SSR reload persistence, zero console/page errors, and zero horizontal overflow.
   - Full E2E suite (`npm run test:e2e -- --workers=2` against fresh `next start` `NODE_ENV=production`): `8 passed, 2 failed (39.5s)` — all `landing-seo.spec.ts` (`4/4`), `notes-workspace.spec.ts` (`2/2`), and `finance-workspace.spec.ts` (`2/2`) suites passed; the `2` failures were exclusively `tests/e2e/note-attachments.spec.ts` (`RFC-005`) returning `503 STORAGE_UNAVAILABLE` because `next start` enforces production `UnavailableStorageAdapter` when `.env` omits `S3_*` credentials (`STACK-3`, consistent with `REVIEW-RFC-005.md`).
6. **Code Hygiene & Privacy Compliance Scan (`Select-String` on `src/` & `tests/`):**
   - `0` occurrences of `TODO`, `FIXME`, `console.log`/`debug`/`info`, explicit `: any` / `as any`, or `process.env.*` outside `src/lib/env.ts`.
   - `formatIdr` under `src/components/` is called exclusively inside `src/components/ui/PrivacyAmount.tsx`.
7. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`, pre-review):**
   - Result: Exit code `0` — `33 requirements, 31 features, 61 rules, 10 RFCs`, `0 failure(s), 6 warning(s)` (`F20`–`F24` planned v1.1 deferrals + `WARN RFC-007 is implemented but not reviewed -- run /review-rfc 007`).

---

## Product Type Check Scope

- **Product Type (per `PRD.md` / `RFCS.md`):** **Web App** (Next.js App Router + React 19 + PostgreSQL + Drizzle ORM).
- **Applied Checks:** Deterministic `bigint`/UTC `Safe-to-Spend` math & calendar clamping (`DATA-5`, `DEC-12`, `HIGH-2`), zero transfer contamination in `cashflow` & `categoryBreakdown` (`DATA-3`), composite cursor pagination & query filtering (`API-5`, `PERF-2`), flash-free SSR cookie + `localStorage` Privacy Blur scoping isolated to `(app)/app/*` (`UI-4`, `ARCH-4`), `<PrivacyAmount />` ubiquity across all Finance UI surfaces (`UI-4`, `REVIEW-RFC-006.md` #5), auth & tenant `userId` isolation (`SEC-1`), responsive viewports (`360px`/`375px`/`1280px`), accessibility (`aria-pressed`, `focus-visible`, `aria-label`, `UI-5`), and complete `ID/EN` typing (`I18N-1`).
- **Explicitly Skipped Checks (Visible Skip per `PRD.md` & `review-rfc`):**
  - *Binary Size*: Noka is a Web App/PWA (`F31`), not a native store binary; compilation and route chunks are checked via `npm run build`.
  - *Public Third-Party API SLA & Versioning*: `GET /api/finance/summary` is a private session-authenticated first-party route scoped exclusively to the Noka client workspace.

---

## Summary

`RFC-007` delivers a cohesive, well-structured Finance Dashboard (`F13`), deterministic Safe-to-Spend daily calculator (`F16`), and global flash-free Privacy Blur Mode (`F17`). `safe-to-spend.ts` and `summary-service.ts` implement every arithmetic guard, timezone window rule, transfer-exclusion rule, and unified keyset cursor cleanly, while `PrivacyProvider`, `PrivacyBlurToggle`, and `<PrivacyAmount />` enforce single-source currency masking across all `/app/*` workspace views (including `WalletManagerModal`, resolving `REVIEW-RFC-006.md` Suggestion #5) without polluting the public root layout. Every unit, integration (`< 300ms` latency verified), lint, typecheck, build, and Finance E2E check passes with zero blocking defects.

---

## Review Dimensions

### 1. RFC Adherence — **PASS**
- **Findings:** None. All acceptance criteria `AC-7.1`–`AC-7.5` and test specifications `TS-007-01`–`TS-007-03` are satisfied:
  - `src/features/finance/safe-to-spend.ts`: `resolveActiveCycleWindow` handles `'1'`–`'28'`, `'end_of_month'`, defensive clamping `'29'`–`'31'`, timezone shift `tzOffsetMinutes` (default `420`), and inclusive `remainingDays >= 1`; `calculateSafeToSpend` checks `no_included_wallets` before `non_positive_balance`, excludes archived and `includeInSafeToSpend = false` wallets, and performs integer floor division via `BigInt`.
  - `src/app/api/finance/summary/route.ts` & `src/features/finance/summary-service.ts`: `GET /api/finance/summary` validates queries via `financeSummaryQuerySchema`, excludes archived wallets from `totalBalance` even when `includeArchived=true`, isolates transfers completely from `cashflow` (`{ totalIncome: 0, totalExpense: 0, net: 0 }`) and `categoryBreakdown` (`[]`), handles `type === "transfer" & categoryId -> ledger.items: []`, and cursor-paginates mixed `transaction`/`transfer` records ordered `(occurredAt DESC, createdAt DESC, kind ASC, id DESC)`.
  - `src/features/finance/privacy-server.ts`, `src/components/providers/PrivacyProvider.tsx`, `src/components/ui/PrivacyAmount.tsx`, `src/components/finance/PrivacyBlurToggle.tsx`, and `src/app/(app)/app/layout.tsx`: Cookie-first SSR (`noka_privacy_blur`) prevents flash, `useSyncExternalStore` restores `localStorage` fallback only when the SSR cookie is `null`, root `src/app/layout.tsx` remains unpolluted, and `<PrivacyAmount />` handles `signMode="auto"|"plain"|"signed"` cleanly.
  - All `RFC-007` deviations/architectural choices (`useSyncExternalStore` React 19 compliance, SSR initial load in `app/finance/page.tsx`, unified `<PrivacyAmount />` coverage in `WalletManagerModal.tsx`) are accurately documented in `RFCs/RFC-007-Finance-Dashboard-SafeToSpend-Privacy.md` (`## Implementation Notes`).
- **Suggestions:** None.

### 2. Rules Compliance — **PASS**
- **Findings:** None. Thin route handler (`ARCH-2`), React Server Component initial fetch in `src/app/(app)/app/finance/page.tsx` (`ARCH-1`), pure domain calculator in `safe-to-spend.ts` (`DATA-5`), single `<PrivacyAmount />` rendering path (`UI-4`), WCAG-compliant CSS tokens & accessible controls (`UI-2`, `UI-5`), typed bilingual `ID`/`EN` strings (`I18N-1`, `I18N-2`), and hygiene rules (`QUAL-2`, `QUAL-3`) are all satisfied.
- **Suggestions:** None.

### 3. Security — **PASS**
- **Findings:** None. `GET /api/finance/summary` enforces `requireAuth(req)` (`401 UNAUTHORIZED`), scopes all Drizzle queries (`wallets`, `transactions`, `transfers`) strictly by `userId = user.id` (`SEC-1`, cross-user isolation verified in `finance-summary.test.ts`), validates UUID/date/cursor/numeric bounds with Zod (`API-2`, `400 INVALID_CURSOR`, `422 VALIDATION_ERROR`), and calls `getSessionUser()` prior to reading request cookies in `(app)/app/layout.tsx`. No sensitive amounts or secrets are logged (`OBS-2`).
- **Suggestions:** None.

### 4. Performance — **PASS**
- **Findings:** None. `getFinanceSummary` executes wallet metadata + balance aggregation, SQL `GROUP BY` category sums (`cashflow` & `categoryBreakdown`), and `LIMIT + 1` cursor-bounded transaction/transfer queries in parallel via `Promise.all` without N+1 queries or unbounded fetches; `tests/integration/finance-summary.test.ts:378` explicitly verifies route response latency `< 300ms` (`PERF-2`). Client `FinanceWorkspace` only loads filtered dashboard pages (`limit: 50`) and dispatches lightweight `noka:finance-updated` events.
- **Suggestions:** None.

### 5. Maintainability — **PASS**
- **Findings:** None. `RFC-007` cleanly decomposed the prior monolithic `FinanceWorkspace.tsx` (`962` lines -> `499` lines) into focused, well-documented leaf components (`SafeToSpendCard.tsx`, `CashflowSummaryCards.tsx`, `WalletListSection.tsx`, `LedgerFilterBar.tsx`, `LedgerList.tsx`, `PrivacyBlurToggle.tsx`, `PrivacyAmount.tsx`) with strong TypeScript types and thorough unit, integration, and E2E test coverage.
- **Suggestions:** See non-blocking Improvement Suggestions below.

---

## Blocking Issues

None.

---

## Improvement Suggestions (Non-Blocking)

1. **Single-sided `from`/`to` filter affordance in `LedgerFilterBar` (`src/components/finance/LedgerFilterBar.tsx:116-129`, `src/features/finance/summary-service.ts:453-457`):**
   - Because `summary-service.ts` independently falls back omitted `from`/`to` bounds to the active cycle window (`cycle.startDate` / `cycle.endDate`) per RFC-007, selecting only a `from` date after `cycle.endDate` while leaving the `to` date input blank returns `422 VALIDATION_ERROR` (`from > to`). Consider displaying the active cycle start/end dates or auto-syncing the empty paired bound in `LedgerFilterBar` in a later polish pass so single-sided date filtering cannot surprise users.
2. **Update E2E suite label in `tests/e2e/finance-workspace.spec.ts:70`:**
   - The `test.describe` label still reads `"Finance Workspace Core Ledger E2E (RFC-006)"` even though it now verifies `Safe-to-Spend`, unified transfer filtering, and persistent Privacy Blur reload behavior from `RFC-007`; updating the label to include `RFC-007` keeps test reporting aligned with `TEST-STRATEGY.md`.



## Round 2 -- 2026-11-12

- **Target Commit**: `a922fad` (`fix(rfc-007): address non-blocking review suggestions for date filter affordance and E2E label`, branch `feat/rfc-007-finance-dashboard-safetospend-privacy`)
- **Decision**: `Reviewed` (`PASS` across all 5 review dimensions)
- **Overall Risk Level**: `Low`

### Summary
Both non-blocking suggestions from Round 1 (`b935ffb`) have been addressed cleanly in `FinanceWorkspace.tsx` (`normalizeLedgerDateBounds`), `LedgerFilterBar.tsx` (`cycleDefaultHint`), `src/lib/i18n/{types,dictionaries/id,dictionaries/en}.ts`, `tests/e2e/finance-workspace.spec.ts`, and `tests/unit/finance-workspace.test.tsx`, and recorded in `RFCs/RFC-007-Finance-Dashboard-SafeToSpend-Privacy.md`. All verification suites (`eslint`, `tsc --noEmit`, 24/24 Vitest suites / 110 tests, Next.js production build, and Playwright Finance E2E desktop + mobile) passed with zero failures.

### Step 0: Command & Verification Output (`a922fad`)

- **Lint, Typecheck & Full Vitest Suite** (`npm run lint; npm run typecheck; npm test`): exited `0`
```text
Test Files  24 passed (24)
Tests  110 passed (110)
Duration  30.84s
```
  (Includes `tests/unit/finance-workspace.test.tsx` `5/5`, `tests/unit/safe-to-spend.test.ts` `4/4`, `tests/unit/privacy-blur.test.tsx` `4/4`, and `tests/integration/finance-summary.test.ts` `1/1`.)

- **Production Build** (`$env:DATABASE_URL=""; $env:SESSION_SECRET=""; $env:APP_URL="http://127.0.0.1:3114"; npm run build`): exited `0`
```text
Compiled successfully in 1611ms
Finished TypeScript in 5.4s
Generating static pages using 15 workers (11/11) in 669ms
```

- **Playwright Finance E2E** (`npx playwright test tests/e2e/finance-workspace.spec.ts --workers=2`): exited `0`
```text
2 passed (11.1s)
```
  (Verified `[desktop]` and `[mobile]` cleanly. Note: the other unmodified non-attachment specs ran cleanly at `b935ffb` in Round 1, while `note-attachments.spec.ts` (`RFC-005`) requires `S3_*` config under `NODE_ENV=production` `next start` per `STACK-3`.)

- **Code Hygiene Scan** (`Select-String` on `src/` & `tests/`): `0` occurrences of `TODO`, `FIXME`, `console.log`/`debug`/`info`, or explicit `: any` / `as any`.
- **Artifact Traceability** (`python .agents/skills/workflow-status/scripts/trace-check.py .`): exited `0` (`33 requirements, 31 features, 61 rules, 10 RFCs`, `0 failure(s), 5 warning(s)` for deferred `F20`–`F24`).

### Product Type & Skipped Checks
Per `PRD.md`, Noka is a **Web App** (Next.js App Router PWA):
- **Skipped — Binary Size**: Not applicable to a server-rendered Next.js web workspace (no native mobile/desktop binary output).
- **Skipped — Public Third-Party API SLA & Versioning**: `RFC-007` adds internal session-authenticated endpoints/UI only; no external third-party API client or SLA contract is added.

### Round 1 Suggestion Resolution Verification
1. **Single-sided `from`/`to` filter affordance — Resolved (`src/components/finance/FinanceWorkspace.tsx:57-82, 217-225, 428-431`, `src/components/finance/LedgerFilterBar.tsx:146-155`, `tests/unit/finance-workspace.test.tsx:423-496`):**
   - `LedgerFilterBar` displays the localized active cycle default range (`cycleDefaultHint`) whenever either bound is blank, and `normalizeLedgerDateBounds` automatically synchronizes the paired bound whenever a single-sided or inverted edit crosses `cycle.startDate`/`cycle.endDate` or `from > to`, preventing spurious `422 VALIDATION_ERROR` responses while preserving within-cycle single-sided defaults.
2. **E2E suite label — Resolved (`tests/e2e/finance-workspace.spec.ts:70`):**
   - Updated `test.describe` label to `"Finance Workspace, Safe-to-Spend & Privacy Blur E2E (RFC-006 & RFC-007)"`.
3. **RFC Implementation Notes (`RFCs/RFC-007-Finance-Dashboard-SafeToSpend-Privacy.md:99-100`):**
   - Updated to document both additions and the added unit coverage.

### Review Dimensions

#### 1. RFC Adherence
- **Verdict**: PASS
- **Findings**: None.
- **Suggestions**: None.

#### 2. Rules Compliance
- **Verdict**: PASS
- **Findings**: None (`types.ts`, `id.ts`, `en.ts` maintain full bilingual parity per `I18N-1`).
- **Suggestions**: None.

#### 3. Security
- **Verdict**: PASS
- **Findings**: None.
- **Suggestions**: None.

#### 4. Performance
- **Verdict**: PASS
- **Findings**: None.
- **Suggestions**: None.

#### 5. Maintainability
- **Verdict**: PASS
- **Findings**: None.
- **Suggestions**: None.

### Blocking Issues
None.

### Improvement Suggestions
None.
