# Code Review: RFC-005 — Secure Note Image Attachments (Online-Only v1.0)

- **RFC:** `RFC-005` ([`RFC-005-Note-Image-Attachments.md`](../RFCs/RFC-005-Note-Image-Attachments.md))
- **Features:** `F9` (`FR-6`, `NFR-9`, `DEC-9`)
- **Branch & Base Commit:** `feat/rfc-005-note-image-attachments` (base `269d88a`, uncommitted `RFC-005` working tree changes)
- **Predecessors:** `RFC-001` (`Reviewed`), `RFC-002` (`Reviewed`), `RFC-004` (`Reviewed`)
- **Review Date:** `2026-11-12`
- **Review Context:** Fresh review session (all `RFC-005` implementation and test files were authored outside this session)
- **Reviewer Verdict:** **Changes requested** (**Overall Risk Level: Medium**)

---

## Step 0: Automated Verification Output

All automated baseline checks were executed directly against the `feat/rfc-005-note-image-attachments` working tree:

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: Exit code `0` (clean pass).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: Exit code `0` (clean pass).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: Exit code `0` — `Test Files 17 passed (17)`, `Tests 85 passed (85)`, `Duration 12.04s`.
   - `RFC-005`-specific suites observed:
     - `tests/unit/attachment-validation.test.ts` — `7 passed (7)`
     - `tests/integration/note-attachments.test.ts` — `3 passed (3)`
   - Regression suites including `tests/unit/env.test.ts` (`6 passed`), `tests/unit/note-editor.test.tsx` (`10 passed`), and `tests/integration/notes-folders-tags.test.ts` (`5 passed`) all passed.
4. **Playwright E2E (`npx playwright test tests/e2e/note-attachments.spec.ts` & `npm run test:e2e`):**
   - Notice: A local `next dev` (`start-server.js`, PID `3024`) was already listening on port `3000` (`reuseExistingServer: true` without `CI=true`), so Playwright ran against that local `development` server (`LocalStorageAdapter`). In a fresh `production` build (`next start`), `STACK-3` requires `S3_*` variables to be configured; otherwise `getStorage()` intentionally returns `503 STORAGE_UNAVAILABLE`.
   - Focused run (`npx playwright test tests/e2e/note-attachments.spec.ts`, 2 workers): Exit code `0` — `2 passed (10.2s)` (`[desktop]`, `[mobile]`).
   - Full E2E run (`npm run test:e2e`, 8 workers concurrently against the single reused local dev server): Exit code `1` — `6 passed, 2 failed (36.5s)` (`landing-seo.spec.ts` `4/4` passed, `note-attachments.spec.ts` `2/2` passed, `notes-workspace.spec.ts` timed out at `30000ms` under 8-worker contention on bulk 50-note API seeding & mobile navigation).
   - Isolated rerun (`npx playwright test tests/e2e/notes-workspace.spec.ts`, 2 workers): Exit code `0` — `2 passed (18.7s)` (`[mobile]`, `[desktop]`).
5. **Production Build (`npm run build` -> Next.js `16.4.6` Turbopack):**
   - Executed with `$env:DATABASE_URL=""; $env:SESSION_SECRET=""; $env:APP_URL="http://127.0.0.1:3114"; npm run build` (note: `.env` on disk was loaded by Next.js `- Environments: .env`).
   - Result: Exit code `0` — Compiled in `1306ms`, TypeScript finished in `3.5s`, static generation `(6/6)` in `305ms`. Both `/api/attachments/[attachmentId]` and `/api/notes/[id]/attachments` compiled cleanly as `ƒ (Dynamic)` routes.
6. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`, pre-review):**
   - Result: Exit code `0` — `33 requirements, 31 features, 61 rules, 10 RFCs`, `0 failure(s), 6 warning(s)` (`F20`–`F24` planned v1.1 deferrals + `WARN RFC-005 is implemented but not reviewed -- run /review-rfc 005`).
7. **Hygiene Scan (`Get-ChildItem -Path src -Recurse -File | Select-String -Pattern "TODO|FIXME|console\.(log|debug|info)|process\.env\.|\bany\b"` and `tests/` `\bany\b` scan):**
   - Result: Clean — `0` occurrences of `TODO`, `FIXME`, `console.log`/`debug`/`info`, or TypeScript `any` across `src/` and `tests/`; `process.env.*` appears strictly inside `src/lib/env.ts`.

---

## Product Type Check Scope

- **Product Type (per `PRD.md` / `RFCS.md`):** **Web App** (Next.js App Router + React 19 + PostgreSQL + Object Storage / S3-compatible).
- **Applied Checks:** Auth & session isolation (`userId`), CSRF verification, file magic-byte validation, storage path-traversal guards, transactional DB + storage atomicity/compensation, offline-first UI degradation (`OFFLINE-4`), responsive layout (`360px` / `768px` / `1280px`), accessibility (`Modal`, labels, status alerts), bilingual i18n (`ID`/`EN`), and structured logging without PII/binary leakage.
- **Explicitly Skipped Checks (Visible Skip per `PRD.md` & `review-rfc`):**
  - *Binary Size*: Noka is distributed as a Web App/PWA (`F31`), not a native mobile/desktop store binary; bundle output is verified via `npm run build`.
  - *Public Third-Party API SLA & Versioning*: All `/api/*` endpoints (`/api/notes/[id]/attachments`, `/api/attachments/[attachmentId]`) are private first-party session routes scoped exclusively to Noka's own frontend.

---

## Summary

`RFC-005` delivers a well-structured, security-hardened implementation of online-only note image attachments (`F9`): `file-type@22.3.0` magic-byte inspection with cross-realm `Uint8Array` safety, `LocalStorageAdapter` path-traversal checks outside `public/`, `S3StorageAdapter` (`@aws-sdk/client-s3@3.1166.0` + `deleteObjects` batching per 1,000 keys ignoring `NoSuchKey`), production `503 STORAGE_UNAVAILABLE` fail-closed behavior (`STACK-3`), `FOR UPDATE` row locking against concurrent >5 uploads (`409 ATTACHMENT_LIMIT_REACHED`), post-commit `registerNoteDeleteCleanup` resilience, `X-Note-Updated-At` synchronization into `NoteEditor`/`NoteMutationCoordinator`, and offline UI guards (`OFFLINE-4`).

However, **1 functional UI state bug** blocks approval: when switching away from the initially selected SSR note in `NotesWorkspace` and switching back without reloading, `NotesWorkspace` re-supplies the initial SSR `initialSelectedAttachments` prop to a newly keyed `NoteAttachmentsPanel`, which skips live fetching and either hides newly uploaded images or resurrects deleted images as broken `404` thumbnails.

---

## Review Dimensions

### 1. RFC Adherence — **NEEDS WORK**
- **Implemented & Verified:**
  - Upload (`POST /api/notes/[id]/attachments`), list (`GET /api/notes/[id]/attachments`), authenticated binary download (`GET /api/attachments/[attachmentId]`), and delete (`DELETE /api/attachments/[attachmentId]`) match `RFC-005` API contracts, error codes, and response headers (`X-Note-Updated-At`, `Cache-Control: private, max-age=3600`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`).
  - Both `/app/notes` (`NotesWorkspace`) and `/app/notes/[id]` (`NoteDetailView`) mount `NoteAttachmentsPanel`, propagate `onNoteUpdatedAt` timestamps cleanly into `NoteEditor` / `NoteMutationCoordinator`, and clean up attachments post-commit on note deletion (`service.ts:1056-1075, 1515`).
  - `deleteUserAttachmentObjects` is implemented and exported for downstream `RFC-010`.
  - Zero v1.1 (`F20`–`F24`) or *Won't Have* (`F25`–`F31`) scope creep; `RFC-005` doc and `TEST-STRATEGY.md` (`TS-005-01`, `TS-005-02`) are aligned cleanly.
- **Defect Found:** Blocking Issue #1 (stale `initialSelectedAttachments` on desktop note switch-back breaks client state sync for `AC-5.1` / `AC-5.3` / `AC-5.4`).

### 2. Rules Compliance — **PASS**
- **`STACK-3`:** Exact pinned packages (`@aws-sdk/client-s3@3.1166.0`, `@aws-sdk/s3-request-presigner@3.1166.0`, `file-type@22.3.0`); `.data/` in `.gitignore` outside `public/`; partial `S3_*` config rejected by Zod in `src/lib/env.ts:49-95`; `NODE_ENV === "production"` without `S3_*` returns `UnavailableStorageAdapter` (`503 STORAGE_UNAVAILABLE`).
- **`ARCH-2` / `ARCH-6`:** No `process.env.*` accesses outside `src/lib/env.ts`; production Next build succeeds without DB/secret connectivity.
- **`OFFLINE-4`:** `useSyncExternalStore` + `isOnline` prop disable upload and delete controls with bilingual notice (`t.notes.attachments.offlineNotice`), render `offlinePlaceholder` on image load error, and auto-retry when `online` fires.
- **`UI-3` / `UI-5` / `I18N-1`:** Responsive `2/3/4/5`-column thumbnail grid with `min-w-0`, zero overflow at `360px` / `768px` / `1280px`, accessible `<Modal>` delete confirmation and lightbox (`Escape` closes), complete `id` & `en` dictionaries in `src/lib/i18n/dictionaries/{id,en}.ts`.
- **`OBS-2` / `OBS-3` / `QUAL-2` / `QUAL-3`:** Only opaque IDs/keys/error objects logged; zero `TODO`/stubs/`any`.

### 3. Security — **PASS**
- **Auth & Ownership (`SEC-1`, `SEC-4`, `SEC-6`):** All endpoints call `requireAuth(req)`; mutations call `verifyCsrfOrigin(req)`; UUID params validated (`422 VALIDATION_ERROR`); DB queries scope by both `noteAttachments.userId` and `notes.userId` with `isNull(notes.deletedAt)` (`404` cross-user isolation).
- **Upload Hardening (`SEC-6`):** Rejects non-multipart (`400`), oversized `Content-Length` (`413 PAYLOAD_TOO_LARGE`), missing/non-File/multi-file field (`422`), 0-byte (`422 EMPTY_FILE`), >5 MB (`413 FILE_TOO_LARGE`), spoofed/SVG/EXE magic bytes (`422 UNSUPPORTED_IMAGE_TYPE`), and declared MIME mismatches (`422`, normalizing `image/jpg` -> `image/jpeg`). Object keys use UUIDs (`users/<userId>/notes/<noteId>/<attachmentId>.<ext>`), never client filenames.
- **Storage Isolation (`SEC-6`):** `LocalStorageAdapter.resolveSafeLocalPath` rejects null bytes, leading slashes, absolute paths, and `..` escapes; binary response derives `Content-Length` from actual buffer bytes and sets `X-Content-Type-Options: nosniff` + `Content-Disposition: inline`.

### 4. Performance — **PASS**
- Pre-checks `Content-Length` before buffering multipart uploads (`attachments-service.ts:180-193`); indexes `note_attachments(note_id)` (`src/db/schema/notes.ts:131`); batches `S3StorageAdapter.deleteObjects` in chunks of `1,000` (`s3.ts:11, 164`); uses `loading="lazy"` on thumbnails and `Cache-Control: private, max-age=3600` on private reads; SSR preloads first-note attachments on initial render.

### 5. Maintainability — **PASS**
- Clean separation across `src/lib/storage/*`, `src/features/notes/attachments-service.ts`, route handlers, `src/components/notes/NoteAttachmentsPanel.tsx`, and typed dictionaries (`src/lib/i18n/types.ts`). Notice `deleteNoteInTx` + `registerNoteDeleteCleanup` keeps `service.ts` decoupled from storage internals.

---

## Blocking Issues (Must Fix Before Merge)

### 1. Stale SSR `initialSelectedAttachments` reused when switching back to the first note in `NotesWorkspace`
- **Locations:**
  - [`src/components/notes/NotesWorkspace.tsx#L471-L487`](../src/components/notes/NotesWorkspace.tsx#L471-L487)
  - [`src/components/notes/NoteAttachmentsPanel.tsx#L175-L181`](../src/components/notes/NoteAttachmentsPanel.tsx#L175-L181) and [`#L287-L299`](../src/components/notes/NoteAttachmentsPanel.tsx#L287-L299)
- **Root Cause:**
  1. `NotesWorkspace` unconditionally passes `initialAttachments={initialNotes[0]?.id && currentNote.id === initialNotes[0].id ? initialSelectedAttachments : undefined}` and `initialAttachmentsNoteId={initialNotes[0]?.id}` every time `renderAttachmentsSlot` renders for the initial first note.
  2. When a user uploads or deletes an attachment on `initialNotes[0]`, selects a second note `N2` (which changes `key={currentNote.id}` and unmounts `NoteAttachmentsPanel`), and then clicks back to `initialNotes[0]`, React mounts a **new** `NoteAttachmentsPanel` instance with the unchanged SSR `initialSelectedAttachments` prop.
  3. On mount, `consumedInitialNoteIdRef.current` initializes to `noteId` (`NoteAttachmentsPanel.tsx:175-181`), so `useEffect` (`lines 290-293`) hits `if (consumedInitialNoteIdRef.current === noteId) return;` and **skips fetching `GET /api/notes/[id]/attachments`**.
- **User Impact:**
  - Newly uploaded images on the initial note disappear (`0/5` / empty state) upon clicking away and back until a full page reload.
  - Deleted images on the initial note reappear (`1/5`), request `/api/attachments/<deletedId>` -> `404 ATTACHMENT_NOT_FOUND`, trigger `onError`, and falsely render the offline unavailable placeholder until page reload.
- **Required Fix:**
  - Ensure SSR `initialSelectedAttachments` is only consumed on the very first mount / before leaving or mutating the initial note in `NotesWorkspace` (for example, track an `initialSnapshotNoteIdRef` / `useState` flag or clear/disable `initialSelectedAttachments` once `selectedNoteId` changes away from `initialNotes[0]?.id` or an attachment/note transition occurs, so any remount fetches live attachments from `GET /api/notes/[id]/attachments`).
  - Add an automated test (`tests/unit/attachment-validation.test.ts` or `tests/e2e/note-attachments.spec.ts`) covering Note A -> upload/delete -> switch to Note B -> switch back to Note A without page reload.

---

## Improvement Suggestions (Non-blocking)

1. **Propagate `onNoteUpdatedAt` even if user switches notes while upload/delete finishes (`src/components/notes/NoteAttachmentsPanel.tsx:402-404, 497-499`):**
   - Currently, if `activeNoteIdRef.current !== targetNoteId` when `POST`/`DELETE` completes, the handler returns early before calling `onNoteUpdatedAt?.(targetNoteId, updatedHeader)`. Calling `onNoteUpdatedAt?.(targetNoteId, updatedHeader)` on `response.ok` even after switching notes keeps `NotesWorkspace`'s `notesList` timestamps accurate.
2. **Surface a retry UI when initial attachment list fetch fails with a network error (`src/components/notes/NoteAttachmentsPanel.tsx:246-259, 657-666`):**
   - When `fetchAttachments` hits the `catch` branch (`loadFailed: true, errorMessage: null`), JSX falls through to `emptyText` instead of showing a retry action (until `online` fires). Exposing `activeState.loadFailed` with `retryLoadButton` avoids falsely implying a note has zero attachments during transient online failures.
3. **Add `retryLoadButton` inside the lightbox offline/error fallback (`src/components/notes/NoteAttachmentsPanel.tsx:813-822`):**
   - The thumbnail slot renders `retryLoadButton` when `effectiveIsOnline`, whereas the lightbox `failedImageIds` block omits it.
4. **Tighten invalid-UUID route test coverage (`tests/integration/note-attachments.test.ts`):**
   - `TS-005-02` verifies `422 VALIDATION_ERROR` on `POST /api/notes/not-a-uuid/attachments`; consider also asserting `422` on malformed UUIDs for `GET /api/notes/[id]/attachments`, `GET /api/attachments/[attachmentId]`, and `DELETE /api/attachments/[attachmentId]` plus verifying `offlinePlaceholder` rendering in `tests/e2e/note-attachments.spec.ts`.



---

## Round 2 -- 2026-11-12

- **Reviewer Verdict:** **Approved (`Reviewed`)** (**Overall Risk Level: Low**)
- **Scope Verified:** Resolution of Round 1 Blocking Issue #1, implementation of all 4 Round 1 improvement suggestions, and regression verification across `NotesWorkspace.tsx`, `NoteAttachmentsPanel.tsx`, `tests/unit/attachment-validation.test.ts`, `tests/integration/note-attachments.test.ts`, and `tests/e2e/note-attachments.spec.ts`.

### Round 2 Step 0: Automated Verification Output

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: Exit code `0` (clean pass).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: Exit code `0` (clean pass).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: Exit code `0` — `Test Files 17 passed (17)`, `Tests 87 passed (87)`, `Duration 9.28s`.
   - `RFC-005` coverage (`tests/unit/attachment-validation.test.ts` `9 passed`, `tests/integration/note-attachments.test.ts` `3 passed`) includes new regression tests for `A -> B -> A` live attachment reload without stale SSR snapshot reuse, cross-note `X-Note-Updated-At` timestamp propagation, `loadFailed` and lightbox retry buttons, and `422 VALIDATION_ERROR` invalid-UUID checks across all 4 endpoints (`POST`, `GET` list, `GET` binary, `DELETE`).
4. **Playwright E2E (`npx playwright test tests/e2e/note-attachments.spec.ts` & `npm run test:e2e -- --workers=2`):**
   - Focused run (`tests/e2e/note-attachments.spec.ts`, 2 workers): Exit code `0` — `2 passed (13.9s)` (`[desktop]`, `[mobile]`), now also covering desktop `Note A (SSR initialNotes[0]) -> upload 2nd image -> switch to Note B -> switch back to Note A -> 2/5 persists` and simulated offline `offlinePlaceholder` rendering + online auto-retry.
   - Full E2E suite (`npm run test:e2e -- --workers=2` against the running local server on port `3000`): Exit code `0` — `8 passed (22.9s)` (`landing-seo.spec.ts` `4/4`, `notes-workspace.spec.ts` `2/2`, `note-attachments.spec.ts` `2/2`).
5. **Production Build (`npm run build` -> Next.js `16.4.6` Turbopack):**
   - Executed with `$env:DATABASE_URL=""; $env:SESSION_SECRET=""; $env:APP_URL="http://127.0.0.1:3114"; npm run build`.
   - Result: Exit code `0` — Compiled in `1234ms`, TypeScript finished in `4.4s`, static pages `(6/6)` in `555ms`.
6. **Hygiene Scan (`src/` & `tests/`):**
   - Result: Clean (`0` `TODO`/`FIXME`, `0` debug `console.log`/`debug`/`info`, `0` `any` types, `process.env.*` restricted to `src/lib/env.ts`).

### Product Type Check Scope

- **Applied (Web App):** Auth/CSRF isolation, magic-byte validation, path-traversal protection, DB/storage atomicity, client state sync on note switching, offline UI guards (`OFFLINE-4`), responsive `360px`/`768px`/`1280px` layout, keyboard/ARIA accessibility, bilingual i18n.
- **Explicitly Skipped (Visible Skip):** *Binary Size* (browser PWA/Web App) and *Public Third-Party API SLA & Versioning* (first-party session API routes only).

### Round 1 Findings Verification

- **[RESOLVED — Blocking Issue #1] Stale SSR `initialSelectedAttachments` reuse in `NotesWorkspace`:**
  - Verified in [`src/components/notes/NotesWorkspace.tsx#L132-L153`](../src/components/notes/NotesWorkspace.tsx#L132-L153), [`#L463-L516`](../src/components/notes/NotesWorkspace.tsx#L463-L516): `ssrAttachmentsAvailable` starts `true` only for `initialPrimaryNoteId`, and is cleared (`false`) by both `selectNote(nextNoteId)` when switching away and `handleNoteTimestampUpdated(targetNoteId, ...)` when an attachment on `initialPrimaryNoteId` is uploaded or deleted. Subsequent mounts of `NoteAttachmentsPanel` receive `initialAttachments={undefined}` and fetch live state from `GET /api/notes/[id]/attachments`.
  - Covered by both unit test (`tests/unit/attachment-validation.test.ts:662-821`) and E2E test (`tests/e2e/note-attachments.spec.ts:135-175`).
- **[RESOLVED — Non-blocking Suggestions #1–#4]:**
  - Cross-note `X-Note-Updated-At` delivery via `notifyNoteTimestamp` verified in `NoteAttachmentsPanel.tsx:381-392, 451-454, 544-547` and tested (`attachment-validation.test.ts:823-941`).
  - Uniform `AttachmentRetryButton` (`NoteAttachmentsPanel.tsx:149-172`) wired into both online `loadFailed` fallback (`lines 707-722`) and lightbox error fallback (`lines 872-883`).
  - Malformed UUID `422 VALIDATION_ERROR` verified across all 4 route handlers (`tests/integration/note-attachments.test.ts:208-256`).
  - Browser `offlinePlaceholder` rendering + `online` auto-retry verified in `tests/e2e/note-attachments.spec.ts:205-253`.

### Round 2 Review Dimensions

- **RFC Adherence — PASS:** All `AC-5.1`–`AC-5.5`, `F9`, `FR-6`, `RFC-005`, and `TEST-STRATEGY.md` (`TS-005-01`, `TS-005-02`) requirements satisfied and test-backed, with updated `Implementation Notes` documenting all review fixes cleanly.
- **Rules Compliance — PASS:** Compliant with `STACK-3`, `ARCH-2`, `ARCH-6`, `API-1`, `API-2`, `OFFLINE-4`, `UI-3`, `UI-5`, `I18N-1`, `OBS-2`, `OBS-3`, `QUAL-1`–`QUAL-4`.
- **Security — PASS:** Auth/CSRF, `userId` ownership, magic-byte inspection, UUID storage keys, path-traversal guards, `FOR UPDATE` limit lock, private cache headers, and `503` production guard intact.
- **Performance — PASS:** `Content-Length` pre-check, DB index on `note_attachments(note_id)`, batched `DeleteObjects`, `loading="lazy"`, and single-use SSR first-note prefetch without redundant initial fetches or stale state.
- **Maintainability — PASS:** Clean modular helpers (`AttachmentRetryButton`, `notifyNoteTimestamp`, `selectNote`, `registerNoteDeleteCleanup`), complete test suites, zero dead code or `any` types.

### Overall Risk Level: **Low**
### Summary
Round 2 confirms the Round 1 `NotesWorkspace` stale SSR attachment bug and all 4 non-blocking improvements have been resolved cleanly with targeted unit, integration, and Playwright E2E regression tests. All `87` Vitest tests, `8` Playwright E2E tests (`--workers=2`), `eslint`, `tsc --noEmit`, `next build`, and traceability checks pass with zero blocking issues remaining.

### Blocking Issues
None.

### Improvement Suggestions
None required before merge (operational note: when running Playwright E2E in CI against `next start` instead of `next dev`, configure valid `S3_*` credentials per `STACK-3`).
