# Code Review: RFC-006 — Finance Core — Multi-Wallets, Categories, Ledger Transactions & Atomic Transfers

- **RFC:** `RFC-006` ([`RFC-006-Finance-Core-Ledger.md`](../RFCs/RFC-006-Finance-Core-Ledger.md))
- **Features:** `F10`, `F11`, `F12` (`FR-7`, `FR-8`, `FR-9`, `FR-10`, `DEC-6`, `DATA-1`–`DATA-4`, `HIGH-3`)
- **Branch & Commit:** `feat/rfc-006-finance-core-ledger` at `8b4e793` (`feat(rfc-006): implement multi-wallets, categories, ledger transactions, and atomic transfers`)
- **Predecessors:** `RFC-001` (`Reviewed`), `RFC-002` (`Reviewed`)
- **Review Date:** `2026-11-12`
- **Review Context:** Fresh review session (commit `8b4e793` was authored outside this session)
- **Reviewer Verdict:** **Changes requested** (**Overall Risk Level: Medium**)

---

## Step 0: Automated Verification Output

All automated baseline checks were executed directly on branch `feat/rfc-006-finance-core-ledger` (`8b4e793`):

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: Exit code `0` (clean pass).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: Exit code `0` (clean pass).
3. **Production Build (`npm run build` -> Next.js `16.4.6` Turbopack):**
   - Executed with `$env:DATABASE_URL=""; $env:SESSION_SECRET=""; $env:APP_URL="http://127.0.0.1:3114"; npm run build` (`.env` on disk loaded by Next.js).
   - Result: Exit code `0` — Compiled in `5.4s`, TypeScript finished in `13.3s`, static page generation `(10/10)` in `1003ms`. `/app/finance` and all 8 Finance API route groups (`/api/wallets`, `/api/wallets/[id]`, `/api/categories`, `/api/categories/[id]`, `/api/transactions`, `/api/transactions/[id]`, `/api/transfers`, `/api/transfers/[id]`) compiled cleanly as `ƒ (Dynamic)` routes.
4. **Vitest Unit & Integration Suite (`npm test` vs isolated / serialized runs, Vitest `5.1.0`):**
   - **Default `npm test` (`vitest run`, isolated run):** Exit code `1` — `Test Files 6 failed | 15 passed (21)`, `Tests 7 failed | 90 passed (97)`, `Duration 24.03s`. Six integration files timed out at Vitest's default `5000ms` `testTimeout` inside `createRegisteredUser` (`bcryptjs` cost `>= 12` running concurrently across parallel workers against PostgreSQL):
     - `tests/integration/auth-flow.test.ts:159` (`5000ms` timeout)
     - `tests/integration/auth-reset.test.ts:238` (`5000ms` timeout)
     - `tests/integration/finance-transfers.test.ts:121` (`5000ms` timeout)
     - `tests/integration/finance-wallets-categories.test.ts:135` (`5000ms` timeout)
     - `tests/integration/note-attachments.test.ts:175` (`5000ms` timeout)
     - `tests/integration/notes-folders-tags.test.ts:122` (`5000ms` timeout)
     - *(Earlier concurrent run `task-814` also observed a PostgreSQL `40P01` deadlock during `auth-reset.test.ts` teardown `DELETE FROM "users"` cascade on `password_reset_tokens`, and a transient timer miss in `note-editor.test.tsx:729`.)*
   - **`RFC-006` Targeted Vitest Run (`npx vitest run tests/unit/finance-ledger.test.ts tests/unit/finance-workspace.test.tsx tests/integration/finance-wallets-categories.test.ts tests/integration/finance-transfers.test.ts`):**
     - Result: Exit code `0` — `Test Files 4 passed (4)`, `Tests 10 passed (10)`, `Duration 3.80s` (`finance-ledger.test.ts` `5/5`, `finance-workspace.test.tsx` `1/1`, `finance-wallets-categories.test.ts` `2/2`, `finance-transfers.test.ts` `2/2`).
   - **Sequential Full Vitest Run (`npx vitest run --fileParallelism=false`):**
     - Result: Exit code `0` — `Test Files 21 passed (21)`, `Tests 97 passed (97)`, `Duration 50.23s`.
5. **Playwright E2E (`npx playwright test tests/e2e/finance-workspace.spec.ts` & `npm run test:e2e -- --workers=2`):**
   - Focused run (`tests/e2e/finance-workspace.spec.ts`, 2 workers): Exit code `0` — `2 passed (19.4s)` (`[desktop]`, `[mobile]`).
   - Full E2E suite (`npm run test:e2e -- --workers=2`): Exit code `0` — `10 passed (43.6s)` across `landing-seo.spec.ts`, `notes-workspace.spec.ts`, `note-attachments.spec.ts`, and `finance-workspace.spec.ts` (`[desktop]` & `[mobile]`), verifying `0` unexpected console/page errors and `scrollWidth <= innerWidth` across viewports.
6. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`, pre-review):**
   - Result: Exit code `0` — `33 requirements, 31 features, 61 rules, 10 RFCs`, `0 failure(s), 6 warning(s)` (`F20`–`F24` planned v1.1 deferrals + `WARN RFC-006 is implemented but not reviewed -- run /review-rfc 006`).
7. **Hygiene Scan (`Get-ChildItem -Path src -Recurse -File` & `tests/`):**
   - Result: Clean — `0` occurrences of `TODO`, `FIXME`, `console.log`/`debug`/`info`, or TypeScript `any` across `src/` and `tests/`; `process.env.*` appears strictly inside `src/lib/env.ts`.

---

## Product Type Check Scope

- **Product Type (per `PRD.md` / `RFCS.md`):** **Web App** (Next.js App Router + React 19 + PostgreSQL + Drizzle ORM).
- **Applied Checks:** Strict integer IDR `bigint` arithmetic & ledger-derived balances (`DATA-1`–`DATA-3`), atomic transactions & transfers, referential integrity (`WALLET_HAS_HISTORY` `409`, archive promotion, category deletion migration to `other_expense`/`other_income`, `transactions.noteId` ownership & `ON DELETE SET NULL`), idempotency (`withIdempotency` including `409` replay & PostgreSQL `23505` handling), LWW ordering vs system category / history guards, cursor keyset pagination & `tzOffset`, auth & CSRF & `userId` isolation, responsive UI (`360px`–`1280px`), accessibility (`Modal`, form labels, live alerts), and bilingual `ID`/`EN` coverage.
- **Explicitly Skipped Checks (Visible Skip per `PRD.md` & `review-rfc`):**
  - *Binary Size*: Noka is distributed as a Web App/PWA (`F31`), not a native mobile or desktop store binary; bundle compilation is verified via `npm run build`.
  - *Public Third-Party API SLA & Versioning*: All Finance routes (`/api/wallets`, `/api/categories`, `/api/transactions`, `/api/transfers`) are private session-authenticated first-party endpoints scoped exclusively to Noka's own client UI and future offline outbox (`RFC-009`).

---

## Summary

`RFC-006` delivers a clean, well-architected Finance core ledger covering multi-wallets (`F10`), system + custom categories (`F11`), integer IDR transactions (`F11`), and atomic inter-wallet transfers (`F12`):

- Pure client-safe ledger math in `src/features/finance/ledger.ts` and `format.ts` (`0` DB/Node imports, `BigInt` internal summation, ready for `RFC-009` offline workers).
- Strong transactional & referential integrity across `wallets-service.ts`, `categories-service.ts`, `transactions-service.ts`, and `transfers-service.ts` (locking user wallets during default promotion, counting soft-deleted tombstones before wallet deletion, protecting system categories before LWW, atomically migrating deleted custom categories to `other_*`, enforcing granular `WALLET_ARCHIVED` rules, and keyset-paginating with `(occurredAt DESC, createdAt DESC, id DESC)`).
- Solid bilingual UI (`FinanceWorkspace`, `WalletManagerModal`, `CategoryManagerModal`, `TransactionFormModal`, `TransferFormModal`) that offers one-click wallet archiving on `409 WALLET_HAS_HISTORY` and dispatches/subscribes to `noka:finance-updated`.

However, **1 blocking test-suite stability regression (`npm test` failure)** blocks final approval: adding two `bcryptjs` + PostgreSQL integration suites (`finance-wallets-categories.test.ts` and `finance-transfers.test.ts`) without configuring sequential integration execution / timeout headroom in `vitest.config.ts` causes the canonical `npm test` (`vitest run`) command to fail reproducibly (`6/21` files timing out at `5000ms`), violating `TEST-1` and `QUAL-3`.

---

## Review Dimensions

### 1. RFC Adherence — **PASS**
- All `AC-6.1`–`AC-6.5` acceptance criteria are implemented and verified in `tests/unit/finance-ledger.test.ts`, `tests/unit/finance-workspace.test.tsx`, `tests/integration/finance-wallets-categories.test.ts`, `tests/integration/finance-transfers.test.ts`, and `tests/e2e/finance-workspace.spec.ts`:
  - `AC-6.1`: First active wallet forced `isDefault = true`; `includeInSafeToSpend` defaults `true` for `cash`/`ewallet` and `false` for `bank`; changing `type` does not overwrite `includeInSafeToSpend`; archiving/deleting default wallet promotes oldest remaining active wallet.
  - `AC-6.2`: 0-history wallet hard-deletes cleanly; any active or soft-deleted transaction/transfer row triggers `409 WALLET_HAS_HISTORY` (checked *after* `resolveLwwTimestamp`), persisted by `withIdempotency`; UI surfaces one-click Archive CTA.
  - `AC-6.3`: Partial unique index `0002_categories_active_name_idx.sql` (`lower(name)` per `(user_id, type)` where `deleted_at IS NULL`) enforces case-insensitive uniqueness while allowing recreate after soft-delete; system categories reject PATCH/DELETE (`403`) *before* LWW; custom category delete reassigns active transactions to `other_expense` / `other_income`.
  - `AC-6.4`: Category-type mismatch returns `422 CATEGORY_TYPE_MISMATCH`; archived wallet rejects new transactions/transfers and amount/type/wallet mutations (`409 WALLET_ARCHIVED`) while permitting safe historical metadata/unlink edits; transfers enforce `fromWalletId !== toWalletId` (`422 SAME_WALLET_TRANSFER`), active wallets, and atomic soft-delete balance reversal without altering cashflow totals.
  - `AC-6.5`: Supports `unlinked=true`, `tzOffset` (default `420`), `from > to -> 422`, transfer `walletId` (`from OR to`), `(occurredAt DESC, createdAt DESC, id DESC)` keyset pagination, and `400 INVALID_CURSOR`.
- Shared route helpers were cleanly extracted to `src/lib/route-helpers.ts` and re-exported by `src/features/notes/route-helpers.ts` (`Implementation Notes`).
- Zero v1.1 (`F20`–`F24`) or *Won't Have* (`F25`–`F31`) scope creep; `RFC-006` implementation notes and `TEST-STRATEGY.md` (`TS-006-01`–`TS-006-03`) match.

### 2. Rules Compliance — **NEEDS WORK**
- **`STACK-1`–`STACK-6`:** Uses pinned `drizzle-orm@0.45.4`, `pg@8.23.1`, `zod@4.6.7`, `lucide-react@1.72.0`; no unapproved dependencies added.
- **`DATA-1`–`DATA-6` & `API-1`–`API-5`:** All amounts stored as PostgreSQL `bigint`, validated strictly via `.int().min(0|1).max(Number.MAX_SAFE_INTEGER)` with `.strict()` Zod objects (rejecting client `balance`/`currentBalance`); SQL sums cast to `::text` and evaluated with `BigInt` (`0n`) in `computeWalletBalances`; uniform `{ ok, data/error }` JSON envelopes; `withIdempotency` + `updatedAt` LWW across all mutation routes.
- **`TEST-1` & `QUAL-3` Gap (Blocking Issue #1):** While all 97 tests pass when run sequentially (`npx vitest run --fileParallelism=false`) and Playwright E2E passes `10/10`, default `npm test` (`vitest run`) reproducibly exits `1` (`6` integration files timing out at `5000ms`).
- **`I18N-1` / `UI-3` / `UI-5` / `OBS-2` / `QUAL-2`:** Complete `id`/`en` dictionaries (`src/lib/i18n/dictionaries/{id,en}.ts`), accessible `<Modal>` forms with `<label>` pairings, `role="alert"` banners, `role="tablist"` tabs, `0` horizontal overflow on desktop/mobile E2E, `0` plaintext sensitive logs, and `0` `TODO`/`FIXME`/`any`. *(Note for downstream `RFC-007`: monetary displays in `FinanceWorkspace` and `WalletManagerModal` currently call `formatIdr` directly and will need to be wrapped with `<PrivacyAmount />` for `UI-4` / `F17` once `RFC-007` is implemented.)*

### 3. Security — **PASS**
- **Authentication, CSRF & Tenant Isolation (`SEC-1`, `SEC-4`):** Every route in `src/app/api/{wallets,categories,transactions,transfers}/**` executes `requireAuth(req)`, every `POST`/`PATCH`/`DELETE` route executes `verifyCsrfOrigin(req)` first, dynamic `[id]` parameters are UUID-validated via `parseUuidRouteParam`, and all queries/updates/deletes filter strictly on `userId = user.id` (cross-user access returns `404` without leaking existence; verified in `finance-wallets-categories.test.ts` and `finance-transfers.test.ts`).
- **Input & Payload Integrity (`API-2`):** Unknown body keys (such as client-forged `balance`, `isSystem`, `type` on category PATCH) are rejected by `.strict()` Zod schemas with `422 VALIDATION_ERROR`. `transactions.noteId` validates active user-owned note ownership (`404 NOTE_NOT_FOUND` on foreign/deleted notes).
- **Idempotency Header Safety:** `resolveIdempotencyKey` rejects empty `Idempotency-Key` headers or mismatches between header and JSON body (`422`).

### 4. Error Handling & Edge Cases — **PASS**
- PostgreSQL `23505` unique constraint collisions map cleanly to `409 CATEGORY_ALREADY_EXISTS` / `409 RESOURCE_ALREADY_EXISTS` (`categories-service.ts:131-149`, `wallets-service.ts:258-264`, `transactions-service.ts:324-330`, `transfers-service.ts:286-292`).
- Concurrent wallet mutations (`createWallet`, `updateWallet`, `deleteWallet`) acquire `FOR UPDATE` locks across user wallets (`lockUserWallets`) to prevent duplicate default wallets.
- `updateTransaction` and `updateTransfer` acquire row-level `FOR UPDATE` locks and distinguish balance-affecting changes from metadata/unlink edits on archived wallets (`409 WALLET_ARCHIVED`).
- Malformed base64/JSON/UUID/timestamp pagination cursors fail cleanly with `400 INVALID_CURSOR` (`shared.ts:56-90`); malformed `YYYY-MM-DD` calendar dates (e.g., Feb 30) are rejected cleanly (`schemas.ts:40-68`).

### 5. Technical Debt — **NEEDS WORK**
- **`vitest.config.ts` Parallel Integration Contention:** The `integration` Vitest project runs `7` PostgreSQL + `bcryptjs`-heavy suites concurrently under Vitest's `5000ms` default `testTimeout`. Running integration suites sequentially (e.g., `fileParallelism: false` on the `integration` project or appropriate worker/timeout settings in `vitest.config.ts`) is needed so `npm test` passes reliably out of the box without worker starvation or cleanup lock contention.
- **Minor UI State & UX Loose Ends (non-blocking):** Detailed in Improvement Suggestions below (`filterCategoryId` stale state when toggling `filterType`, unused delete confirmation dictionary keys in `FinanceWorkspace`, silent non-2xx errors on secondary parallel fetches / `Load More`).

---

## Blocking Issues

### 1. Default `npm test` (`vitest run`) reproducibly fails (`6/21` files timeout at `5000ms`) due to parallel integration worker contention in `vitest.config.ts`
- **Where:** `vitest.config.ts:12-34` (affecting `tests/integration/finance-wallets-categories.test.ts:135`, `tests/integration/finance-transfers.test.ts:121`, `tests/integration/auth-flow.test.ts:159`, `tests/integration/auth-reset.test.ts:238`, `tests/integration/note-attachments.test.ts:175`, and `tests/integration/notes-folders-tags.test.ts:122`).
- **Rule Reference:** `TEST-1`, `QUAL-3`.
- **Evidence:**
  - Executing `npm test` on an idle machine (task `841`) exited with code `1`: `Test Files 6 failed | 15 passed (21)`, `Tests 7 failed | 90 passed (97)`, failing at Vitest's `5000ms` default timeout right inside `createRegisteredUser` (`POST /api/auth/register` executing `bcryptjs` cost `>= 12` concurrently across worker pools against shared PostgreSQL `noka_test`), whereas `npx vitest run --fileParallelism=false` passed `21/21` files (`97/97` tests) in `50.23s` and `RFC-006`'s 4 files alone passed `4/4` in `3.80s`.
- **Required Fix:** Update `vitest.config.ts` so `npm test` executes integration tests reliably without `5000ms` worker starvation or DB cleanup contention (e.g., setting `fileParallelism: false` on the `integration` project or configuring deterministic sequential integration execution and an explicit integration `testTimeout`), then re-verify plain `npm test` exits `0` with all `21/21` files passing.

---

## Improvement Suggestions (Non-Blocking)

1. **Reset incompatible `filterCategoryId` when switching `filterType` in `FinanceWorkspace.tsx` (`src/components/finance/FinanceWorkspace.tsx:228-252, 605-645`):**
   - Selecting an `expense` category (`filterCategoryId`) and then switching `filterType` to `"income"` hides the selected `<option>` in `<select id="filter-category">` (making the UI appear as "All Categories") while still sending `type=income&categoryId=<expenseCatId>` to `/api/transactions`, yielding an empty table. Clear `categoryId` in `handleFilterChange` whenever `patch.type` switches to a type that does not match the selected category.
2. **Wire delete confirmation before destructive ledger actions (`src/components/finance/FinanceWorkspace.tsx:741-749, 802-810`):**
   - `t.finance.ledger.confirmDeleteTransaction` (`id.ts:470`, `en.ts:470-471`) and `t.finance.ledger.confirmDeleteTransfer` (`id.ts:471-472`, `en.ts:472-473`) are already translated in both dictionaries but unused; clicking the trash icon in the ledger currently soft-deletes immediately without confirmation, increasing accidental-tap risk on mobile.
3. **Surface errors on non-2xx secondary fetches & `Load More` (`src/components/finance/FinanceWorkspace.tsx:160-206, 282-323`):**
   - Inside `fetchFinanceWithFilters`, only `!txsRes.ok` sets `errorMsg`; failed `/api/wallets`, `/api/categories`, `/api/transfers`, or `handleLoadMore` responses currently fail silently.
4. **Preserve default wallet invariant when unsetting `isDefault: false` (`src/features/finance/wallets-service.ts:359-361, 390-392`):**
   - Sending `PATCH /api/wallets/:id` with `{ isDefault: false }` on an active default wallet currently leaves the user with `0` default wallets when other active wallets exist; consider calling `promoteOldestRemainingActiveWallet` (or rejecting when it is the sole active wallet) to match `AC-6.1` expectations cleanly.
5. **Downstream `RFC-007` Integration Reminder (`UI-4` / `F17`):**
   - When implementing `RFC-007` (`<PrivacyAmount />`), replace direct `formatIdr(...)` text renders in `FinanceWorkspace.tsx:406, 530, 726, 787` and `WalletManagerModal.tsx:359` so Privacy Blur masks all Finance workspace amounts consistently.

