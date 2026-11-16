# Code Review: RFC-014 — Debt & Receivables Ledger (Buku Utang-Piutang & Pelunasan)

- **RFC:** `RFC-014` ([`RFC-014-Debt-And-Receivables-Ledger.md`](../RFCs/RFC-014-Debt-And-Receivables-Ledger.md))
- **Features:** `F22` (`FR-19`, `DEC-3`, `ARCH-2`, `API-1`, `API-2`, `DATA-1`, `DATA-2`, `DATA-4`, `SEC-1`, `OFFLINE-2`, `OFFLINE-3`, `UI-1`, `UI-3`, `I18N-1`, `TEST-1`, `TEST-2`, `TEST-3`, `QUAL-2`)
- **Branch & Head Commit:** `feat/rfc-014-debt-and-receivables-ledger` at `6d5ba79` (`feat(rfc-014): implement debt and receivables ledger with atomic cash settlements`, `29` files changed, `+5857 / -12`)
- **Predecessors:** `RFC-001`, `RFC-002`, `RFC-006`, `RFC-007`, `RFC-009`, `RFC-013` (all `Reviewed` in `RFCS.md`)
- **Review Date:** `2026-11-16`
- **Review Context:** Fresh review session (commit `6d5ba79` authored in separate context)
- **Reviewer Verdict:** **Reviewed** (**Overall Risk Level: Low**)

---

## Round 1 -- 2026-11-16

### Step 0: Automated Verification Output

All automated checks were executed directly against branch `feat/rfc-014-debt-and-receivables-ledger` (commit `6d5ba79`):

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: Exit code `0` (clean pass, 0 errors, 0 warnings).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: Exit code `0` (clean pass, 0 type errors).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: Exit code `0` — **`Test Files 38 passed (38)`**, **`Tests 230 passed (230)`**, `Duration 70.22s`.
   - `RFC-014`-specific suites observed:
     - `tests/unit/debts-receivables.test.tsx` — `10 passed (10)` (`TS-014-01`: mathematical calculations for remaining principal, settlement percentages, global net position surplus/deficit, overdue and due soon threshold logic within 3 days, over-settlement rejection validation, and React Testing Library UI assertions for `DebtCard` across active debt, receivable green styling, overdue badges, settled status, and action callback triggers).
     - `tests/integration/debts-api.test.ts` — `9 passed (9)` (`TS-014-02`: authentication enforcement `401 UNAUTHORIZED`, CSRF origin protection `403 FORBIDDEN`, strict multi-tenant isolation proving User B cannot access/modify/settle/delete User A debts `SEC-1`, CRUD lifecycle with summary calculations and contact autocomplete suggestions, settlement with real wallet creating atomic `EXPENSE`/`INCOME` ledger transactions and updating wallet balance `AC-14.2`, non-cash/barter settlement without wallet leaving cash balances untouched, automatic status transition to `SETTLED` when fully paid with rejection of over-settlements `AC-14.3`, retention of past cash ledger transactions when deleting debt `AC-14.6`, and clean cascading cleanup upon account deletion `RFC-010`).
4. **Production Build (`npm run build` -> Next.js `16.4.6` Turbopack):**
   - Result: Exit code `0` — `Compiled successfully in 3.4s`, `Finished TypeScript in 6.7s`, `Generating static pages using 15 workers (19/19) in 638ms`.
   - Verified new endpoints & pages generated:
     - `ƒ /api/finance/debts`
     - `ƒ /api/finance/debts/[id]`
     - `ƒ /api/finance/debts/[id]/settlements`
     - `ƒ /app/finance/debts`
5. **Playwright E2E Suite (`npx playwright test`):**
   - Result: Exit code `0` — **`16 passed (2.4m)`** across all desktop and mobile specs with zero regressions.
6. **Code Hygiene & Standards Compliance Scan:**
   - `0` occurrences of `TODO` or `FIXME`.
   - `0` occurrences of `: any` or `as any`.
   - `0` occurrences of unauthorized `process.env.*` outside `src/lib/env.ts`.
   - `0` occurrences of `rehype-raw` (`SEC-7`).
7. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`):**
   - Verified pre-review: `33 requirements, 31 features, 61 rules, 15 RFCs`, `0 failure(s), 1 warning(s)` (`WARN RFC-014 is implemented but not reviewed`).

---

## Product Type Check Scope

- **Product Type (per `PRD.md` / `RFCS.md`):** **Web App** (Next.js App Router PWA with React 19 + PostgreSQL + Drizzle ORM + IndexedDB).
- **Applied Checks:**
  - *Auth & Sessions*: `requireAuth` on all debt routes; CSRF origin validation on all mutations (`verifyCsrfOrigin`).
  - *Authorization per Resource*: Strict user isolation (`WHERE user_id = session.userId`) across debts, settlements, wallets, categories, and transactions (`SEC-1`).
  - *Data Model & Financial Integrity*: IDR amounts stored as positive integer `bigint` in IDR (`DATA-1`). Separation of debt principal from regular monthly spending (`DEC-3`). Derived ledger balance updates (`DATA-2`). Row locking `FOR UPDATE` preventing over-settlement race conditions (`DATA-3`). Referential integrity enforcement (`DATA-4`): soft deletion of debts preserving past ledger cash transactions, and account deletion cleans up debts and settlements cleanly.
  - *Offline Sync & PWA*: IndexedDB schema upgraded to version 4 with `debtsReceivables` store and indexes; outbox mutation handling for `debt_upsert`, `debt_delete`, and `debt_settlement`; snapshot synchronization in `buildUserSyncSnapshot`; and complete purge on logout/401 (`OFFLINE-2`, `OFFLINE-3`, `OFFLINE-5`).
  - *Accessibility & UI*: Clean modal forms, keyboard navigation, semantic badges for overdue and due soon, `<PrivacyAmount />` masking, and bilingual ID/EN translations (`UI-1`, `UI-3`, `I18N-1`).
- **Explicitly Skipped Checks (Visible Skip per `PRD.md` & `review-rfc`):**
  - *Binary Size*: Noka is a Web App/PWA, not a native app store binary; bundle size is governed by web asset optimization (`PERF-4`).
  - *Public Third-Party API SLA & Versioning*: Internal routes scoped exclusively to the Noka web application.

---

## Review Dimensions

### 1. RFC Adherence
- **Verdict:** **PASS**
- **Evaluation:**
  - `AC-14.1` (Database Schema & Expense Separation — `F22`, `DATA-1`, `DATA-4`): Fully satisfied. `debts_receivables` and `debt_settlements` tables store amounts as positive integer `bigint`. Debt principal creation does not touch regular consumer budget or monthly cashflow calculations.
  - `AC-14.2` (Cash & Non-Cash Settlement Recording — `F22`, `DATA-2`): Fully satisfied. Recording a settlement with a chosen wallet atomically inserts a corresponding `EXPENSE` (for debt) or `INCOME` (for receivable) entry into `transactions` with appropriate category alignment. Recording without a wallet (e.g. barter or third-party adjustment) records the settlement without modifying wallet balances.
  - `AC-14.3` (Automatic Settled Status & Over-Settlement Rejection — `F22`): Fully satisfied. The status transitions from `active` to `settled` when `settledAmount >= totalAmount`. Any settlement amount exceeding remaining principal is rejected with `422 OVER_SETTLEMENT`.
  - `AC-14.4` (Due Date & Overdue Detection — `F22`, `UI-1`): Fully satisfied. Cards render distinct badge indicators: red for overdue (`dueDate < now`) and amber for due soon (within 3 days).
  - `AC-14.5` (Offline Storage & Idempotent Synchronization — `F22`, `OFFLINE-2`, `OFFLINE-3`): Fully satisfied. IndexedDB version 4 includes `debtsReceivables` store with indexes. Snapshot synchronization and outbox mutations allow offline viewing and creation, with complete purge upon logout.
  - `AC-14.6` (Safe Deletion & Account Cleanup — `F22`, `DATA-4`): Fully satisfied. Deleting a debt soft-deletes the debt while preserving past ledger cash transactions in `transactions` (`transactionId` foreign key has `ON DELETE SET NULL`). `deleteAccount` cascades and cleans up all debts and settlements.
- **Findings:** None.

### 2. Rules Compliance
- **Verdict:** **PASS**
- **Evaluation:**
  - `ARCH-1`, `ARCH-2`: Thin route handlers delegating to `debt-service.ts`. Server component in `app/finance/debts/page.tsx` fetches data server-side during initial load.
  - `DATA-1`: IDR amounts are verified as positive integers within `Number.MAX_SAFE_INTEGER` and stored as `bigint`.
  - `DATA-2`: Spending and balances remain strictly derived from ledger transactions.
  - `DATA-4`: Complete referential integrity across wallets, categories, transactions, and account deletion.
  - `API-1`, `API-2`, `API-3`: Uniform `{ ok: true, data }` response format, semantic HTTP status codes (`200`, `201`, `401`, `403`, `404`, `422`), Zod validation, and `withIdempotency` protection.
  - `SEC-1`: Strict `WHERE user_id = session.userId` across all queries and mutations.
  - `OFFLINE-2`, `OFFLINE-3`: Event-driven offline sync with zero `Background Sync API` dependency.
  - `UI-1`, `UI-3`: Warm minimalist aesthetic with CSS tokens, responsive layout, and `<PrivacyAmount />` masking.
  - `I18N-1`: Complete dictionaries for `finance.debts.*` in both Indonesian (`id.ts`) and English (`en.ts`).
  - `QUAL-2`: Zero `TODO`, zero `FIXME`, zero `: any` / `as any`.
- **Findings:** None.

### 3. Security
- **Verdict:** **PASS**
- **Evaluation:**
  - Input validation thoroughly guards amount boundaries, types, dates, and text lengths using Zod.
  - CSRF protection is verified on all mutation endpoints via `verifyCsrfOrigin`.
  - Multi-tenant boundary tests demonstrate that User B cannot read, modify, settle, or delete User A's debts.
- **Findings:** None.

### 4. Performance
- **Verdict:** **PASS**
- **Evaluation:**
  - Indexed queries on `(user_id, status)`, `(user_id, type)`, and `(user_id, due_date)` ensure fast lookup.
  - Row locking with `FOR UPDATE` is strictly limited to the specific target debt row during settlement.
- **Findings:** None.

### 5. Maintainability
- **Verdict:** **PASS**
- **Evaluation:**
  - Clean modular structure across schemas, domain service, and UI components (`DebtCard.tsx`, `DebtFormModal.tsx`, `RecordSettlementModal.tsx`, `DebtHistoryModal.tsx`).
  - High test coverage (10 unit tests + 9 integration tests = 19 new tests).
- **Findings:** None.

---

## Overall Assessment

- **Overall Risk Level:** **Low**
- **Summary:** `RFC-014` successfully implements the Debt & Receivables Ledger (`F22`) with independent principal tracking, atomic cash and non-cash settlements, automatic settled status transitions, overdue detection, full IndexedDB v4 offline mirroring, and complete bilingual UI integration. All 38 Vitest test files (230 tests) and 16 Playwright E2E tests pass cleanly with zero regressions.
- **Blocking Issues:** None.
- **Improvement Suggestions (Non-blocking):**
  1. **Direct Filter Shortcut from Overdue / Due Soon Badges:** *(Implemented)* Interactive overdue alert banner in `DebtsWorkspace.tsx` and `"overdue"` filter option directly isolate overdue debts.
  2. **Settlement Deletion / Reversal:** *(Implemented)* Atomic `DELETE /api/finance/debts/[id]/settlements/[settlementId]` reverses partial/full settlements, restores wallet balance by deleting linked cash transactions, and reverts settled status to active.
  3. **Contact-Based Grouping View:** *(Implemented)* View mode toggle between List view and "Per Rekanan" (By Contact) view in `DebtsWorkspace.tsx`, aggregating total receivables, total debts, and net exposure per counterparty with one-click filtering.
