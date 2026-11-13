# Code Review: RFC-009 — PWA Installability, IndexedDB Local Mirror & iOS-Safe Offline Sync

- **RFC:** `RFC-009` ([`RFC-009-PWA-And-Offline-First-Sync.md`](../RFCs/RFC-009-PWA-And-Offline-First-Sync.md))
- **Features:** `F18`, `F19` (`FR-16`, `FR-17`, `DEC-8`, `DEC-11`, `DEC-16`, `HIGH-1`, `HIGH-4`, `STACK-5`, `OFFLINE-1`–`OFFLINE-5`)
- **Branch & Commit:** `feat/rfc-009-pwa-offline-sync` at `e13e8b7` (`feat(rfc-009): implement PWA installability, IndexedDB local mirror and iOS-safe offline sync`, `44` files changed vs `b42f6d7`)
- **Predecessors:** `RFC-001`–`RFC-008` (all `Reviewed` in `RFCS.md`)
- **Review Date:** `2026-11-13`
- **Review Context:** Fresh review session (commit `e13e8b7` was authored outside this session)
- **Reviewer Verdict:** **Reviewed** (**Overall Risk Level: Low**)

---

## Step 0: Automated Verification Output

All automated checks were executed directly on branch `feat/rfc-009-pwa-offline-sync` (`e13e8b7`):

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: Exit code `0` (clean pass).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: Exit code `0` (clean pass).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: Exit code `0` — `Test Files  28 passed (28)`, `Tests  124 passed (124)`, `Duration  27.40s`.
   - `RFC-009`-specific suite observed:
     - `tests/unit/offline-sync-engine.test.ts` — `7 passed (7)` (`TS-009-01`, verifying zero `SyncManager`/`Background Sync` calls, IDB schema without invalid `boolean`/`null` indexes, private-mode capability detection & fallback banner, offline mutation queuing & local ledger + Safe-to-Spend calculations, serialized `flushOutbox` locks, strict causal FIFO on `429`/`5xx` + terminal `4xx` isolation & discard, and 100% wipe of IndexedDB + private SW cache on logout and `401`).
4. **Production Build (`npm run build` -> Next.js `16.4.6` Turbopack):**
   - Executed with `$env:DATABASE_URL=""; $env:SESSION_SECRET=""; $env:APP_URL="http://127.0.0.1:3114"; npm run build` (`.env` loaded by Next.js).
   - Result: Exit code `0` — `Compiled successfully in 1444ms`, `Finished TypeScript in 4.0s`, `Generating static pages using 15 workers (13/13) in 267ms`.
   - Verified output: `○ /manifest.webmanifest` generated as static PWA manifest, `ƒ /api/sync/snapshot` generated cleanly as server-rendered dynamic endpoint.
5. **Playwright E2E (`tests/e2e/offline-sync-and-logout.spec.ts` & full `npm run test:e2e -- --workers=2`):**
   - Focused `RFC-009` run (`tests/e2e/offline-sync-and-logout.spec.ts`, 2 workers): Exit code `0` — `2 passed (28.0s)` (`[desktop]` `21.5s`, `[mobile]` `22.1s`).
   - Full E2E suite (`npm run test:e2e -- --workers=2`, 2 workers): Exit code `0` — **`14 passed (1.0m)`** with zero failures across all suites:
     - `landing-seo.spec.ts` (desktop, mobile)
     - `finance-workspace.spec.ts` (desktop, mobile)
     - `notes-workspace.spec.ts` (desktop, mobile)
     - `note-attachments.spec.ts` (desktop, mobile)
     - `quick-capture-linked-notes.spec.ts` (desktop, mobile)
     - `offline-sync-and-logout.spec.ts` (desktop, mobile)
6. **Code Hygiene & Standards Compliance Scan (`Select-String` on `src/` & `tests/`):**
   - `0` occurrences of `TODO`, `FIXME`, or explicit `: any` / `as any`.
   - `0` occurrences of `process.env.*` in `src/` outside `src/lib/env.ts`.
   - `0` references to `SyncManager` or `Background Sync API` across `src/` and `public/sw.js` (`OFFLINE-3`).
   - `0` usage of `rehype-raw` (`SEC-3`).
   - `formatIdr` in `src/components/` is called exclusively within `src/components/ui/PrivacyAmount.tsx` (`UI-4`).
7. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`, pre-review):**
   - Result: Exit code `0` — `33 requirements, 31 features, 61 rules, 10 RFCs`, `0 failure(s), 6 warning(s)` (`F20`–`F24` planned v1.1 deferrals + `WARN RFC-009 is implemented but not reviewed -- run /review-rfc 009`).

---

## Product Type Check Scope

- **Product Type (per `PRD.md` / `RFCS.md`):** **Web App** (Next.js App Router PWA with React 19 + PostgreSQL + Drizzle ORM + IndexedDB).
- **Applied Checks:** PWA manifest specification compliance (`manifest.ts`, icons `192`/`512`, `display: standalone`), Service Worker cache segregation (`noka-shell-v1` vs `noka-private-v1`, `OFFLINE-5`, `HIGH-4`), zero reliance on `Background Sync API` (`OFFLINE-3`), private browsing capability probing & non-blocking fallback (`capabilities.ts`, `OFFLINE-1`), IndexedDB W3C schema compliance (`db.ts`, zero boolean/null indexes, `fake-indexeddb@6.2.8`, `TEST-4`, `HIGH-1`), outbox concurrency locks & causal monotonic FIFO sequencing (`engine.ts`, `OFFLINE-3`), online-direct with outbox fallback (`client-api.ts`), offline parity for Notes, Folders, Transactions, and Transfers with local financial math (`local-queries.ts`), online-only UI guards for attachments, wallets, categories, and account deletion (`OFFLINE-4`), 100% storage/cache purge on logout and `401 UNAUTHORIZED` (`cleanup.ts`, `DEC-16`), sync status badge (`SyncStatusBadge.tsx`), and responsive layout (`360px`/`375px`/`1280px`).
- **Explicitly Skipped Checks (Visible Skip per `PRD.md` & `review-rfc`):**
  - *Binary Size*: Noka is a Web App/PWA (`F31`), not a native store binary; compilation and route chunks are validated via `npm run build`.
  - *Public Third-Party API SLA & Versioning*: `/api/sync/snapshot` is a private, session-authenticated first-party endpoint scoped exclusively to the Noka client workspace.

---

## Summary

`RFC-009` delivers a production-grade, highly resilient PWA and iOS-Safe Offline-First synchronization engine (`F18`, `F19`). The architecture strictly follows the critical guardrails established in `RULES.md` and `PRD-REVIEW.md`:
- `public/sw.js` completely separates static precache (`noka-shell-v1`) from authenticated private content (`noka-private-v1`), ensuring zero SSR HTML or image attachment leaks after logout (`OFFLINE-5`, `HIGH-4`).
- IndexedDB (`idb@8.0.4`) stores all 8 domain entities plus `meta` and `outbox` without invalid boolean/null indexes, and `capabilities.ts` gracefully degrades to online-only mode when private mode restricts storage (`OFFLINE-1`).
- `flushOutbox()` implements concurrency locks, monotonic timestamp adjustments, strict FIFO queue handling on `429`/`5xx`, terminal `4xx` failure isolation, and seamless replay over fresh server snapshots.
- All 124 unit/integration tests and all 14 Playwright E2E tests pass with zero regressions.

---

## Review Dimensions

### 1. RFC Adherence — **PASS**
- **Findings:** None. All acceptance criteria `AC-9.1`–`AC-9.5` and test specifications `TS-009-01`–`TS-009-02` are fully satisfied:
  - `manifest.ts`, `public/sw.js`, `public/offline.html`, and icons (`192x192`, `512x512` any + maskable) are registered properly via `SyncProvider.tsx` (`AC-9.1`).
  - Cache splitting strictly isolates `noka-shell-v1` from `noka-private-v1`. RSC requests (`_rsc`) are network-only to prevent cache corruption (`AC-9.1`).
  - `GET /api/sync/snapshot` (`snapshot-service.ts`) returns complete minimal user projections with `includeArchived: true` for wallets, enforcing `Cache-Control: no-store` and `requireAuth` (`AC-9.2`).
  - Offline mutations are fully supported for Notes (including GFM checklists and tags), Folders, Transactions (including Quick Capture and Linked Notes), and Transfers, while local financial math (`computeWalletBalances`, `calculateSafeToSpend`, `cashflow`, `ledger`) mirrors server behavior (`AC-9.2`, `DATA-1`–`DATA-6`).
  - Online-only guards with localized ID/EN notices are present on `NoteAttachmentsPanel` (upload/delete), `WalletManagerModal`, and `CategoryManagerModal` (`AC-9.2`, `OFFLINE-4`).
  - Outbox state machine enforces concurrency locking, FIFO ordering on `429`/`5xx`, terminal `4xx` error isolation, and replay over fresh server snapshots (`AC-9.3`).
  - `wipeAllOfflineData` purges all `noka-offline-*` IndexedDB databases and deletes all `noka-private-*` caches on logout or `401` response (`AC-9.4`, `OFFLINE-5`, `HIGH-4`).
- **Suggestions:** None.

### 2. Rules Compliance — **PASS**
- **Findings:** None.
  - `STACK-5`: Next.js `16.4.6` Turbopack, React 19, Tailwind CSS 4, Drizzle ORM, `idb@8.0.4`.
  - `OFFLINE-1`: Zero reliance on `Background Sync API` / `SyncManager` (explicitly asserted in `offline-sync-engine.test.ts:202-225`).
  - `OFFLINE-2`: Tenant-isolated IndexedDB database names (`noka-offline-${userId}`). Store `notes` avoids boolean/null indexes, sorting/filtering in memory via `sortNotesInMemory`.
  - `OFFLINE-3`: iOS-safe triggers (app mount, `online`, `visibilitychange`/`focus`, manual Sync Now button).
  - `OFFLINE-4`: Clear offline boundary. Attachments and wallet/category management are strictly gated online with clear user messaging.
  - `OFFLINE-5`: Complete purge of private storage and caches upon logout and `401`.
  - `UI-3`–`UI-6`: Accessible `SyncStatusBadge` with `data-sync-status`, ARIA labels, zero horizontal overflow across 360px/375px/1280px viewports.
  - `I18N-1`, `I18N-2`: Complete bilingual typing under `sync` dictionary (`types.ts`, `id.ts`, `en.ts`).
  - `QUAL-2`, `QUAL-3`: Zero TODO/FIXME, zero console.log in application code, zero `: any` / `as any`.
- **Suggestions:** None.

### 3. Security — **PASS**
- **Findings:** None.
  - `GET /api/sync/snapshot` enforces `requireAuth(req)` (`401 UNAUTHORIZED`) and scopes every Drizzle select strictly by `userId = user.id` (`SEC-1`).
  - Private cache purge is implemented on two levels: Service Worker messaging (`CLEAR_PRIVATE_CACHE`) and direct `caches.delete(key)` in `cleanup.ts`, ensuring caches are purged even if the Service Worker controller is temporarily inactive.
  - Database suppression flag (`suppressOfflineDbs`) prevents background components from re-opening IndexedDB while teardown and logout redirection occur (`cleanup.ts:75`).
  - No user credentials, session cookies, note contents, or financial amounts are logged (`OBS-2`).
- **Suggestions:** None.

### 4. Performance — **PASS**
- **Findings:** None.
  - `buildUserSyncSnapshot` executes parallel SQL queries via `Promise.all` with minimal projections, avoiding N+1 roundtrips.
  - Local queries (`local-queries.ts`) execute synchronously in memory after reading the IndexedDB mirror, delivering zero-latency search, folder filtering, and ledger aggregation while offline.
  - RSC requests bypass Service Worker caching to eliminate duplicate serialization overhead.
- **Suggestions:** None.

### 5. Maintainability — **PASS**
- **Findings:** None.
  - Sync architecture is modularized into distinct, single-responsibility files under `src/features/sync/` (`capabilities.ts`, `db.ts`, `engine.ts`, `cleanup.ts`, `client-api.ts`, `local-queries.ts`, `snapshot-service.ts`, `types.ts`).
  - UI integration is neatly decoupled through `SyncProvider.tsx` and consumed via the lightweight `useSync()` / `useOptionalSync()` hooks.
  - Test suites (`offline-sync-engine.test.ts` and `offline-sync-and-logout.spec.ts`) provide complete regression safety for edge cases (storage errors, private mode, rate limits, outbox retry loops).
- **Suggestions:** See non-blocking Improvement Suggestions below.

---

## Blocking Issues

None.

---

## Improvement Suggestions (Non-Blocking)

1. **Periodic in-app sync interval for long-lived active foreground tabs (`src/components/providers/SyncProvider.tsx`):**
   - Sync is currently triggered on app open, `window.online`, `visibilitychange` / `window.focus`, and the manual "Sync Now" button (`OFFLINE-3`). If a user leaves a tab open and focused indefinitely without switching tabs or losing connection, mutations made on another device will not sync until the next interaction or manual refresh. Consider adding an optional low-frequency jittered polling interval (e.g. every 5–10 minutes while online and tab is active) in a future maintenance cycle.
2. **Visual glanceability of offline status in dark mode (`src/components/layout/SyncStatusBadge.tsx:72-77`):**
   - The badge currently uses `text-[var(--text-secondary)]` and `bg-[var(--bg-subtle)]` for the `"offline"` state. In dark mode, this is subtle. Adding a small neutral dot indicator or slightly higher border contrast would enhance glanceability on dimmed mobile screens.

