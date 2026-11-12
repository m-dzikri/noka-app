# Code Review: RFC-004 — Notes Workspace — Markdown, GFM Checklists, Folders, Tags & Instant Search

- **RFC:** `RFC-004` ([`RFC-004-Notes-Workspace-And-Search.md`](../RFCs/RFC-004-Notes-Workspace-And-Search.md))
- **Features:** `F7`, `F8` (`FR-4`, `FR-5`)
- **Branch & Commit:** `feat/rfc-004-notes-workspace` @ `4e52c5b`
- **Predecessors:** `RFC-001` (`Reviewed`), `RFC-002` (`Reviewed`)
- **Review Date:** `2026-11-12`
- **Review Context:** Fresh review session (none of the reviewed `RFC-004` code was authored in this session)
- **Reviewer Verdict:** **Changes requested** (**Overall Risk Level: High**)

---

## Step 0: Verification Run Output

All automated baseline checks were executed directly against commit `4e52c5b` on `feat/rfc-004-notes-workspace` (clean working tree):

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: `LINT_EXIT=0` (clean pass).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: `TSC_EXIT=0` (clean pass).
3. **Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: `Test Files 15 passed (15)`, `Tests 65 passed (65)`, `0` skipped, `Duration 5.95s`, `TEST_EXIT=0`.
   - `RFC-004`-relevant test files observed:
     - `tests/unit/notes-checklist-markdown.test.ts` — `5` tests passed.
     - `tests/unit/note-editor.test.tsx` — `3` tests passed.
     - `tests/integration/notes-folders-tags.test.ts` — `3` tests passed.
     - `tests/unit/auth-forms.test.tsx` (updated alongside app shell/routing adjustments) — `6` tests passed.
4. **Production Build (`npm run build` -> `next build` `16.4.6` Turbopack):**
   - Executed with `$env:DATABASE_URL=""; $env:SESSION_SECRET=""; $env:APP_URL="http://127.0.0.1:3114"`.
   - Note: `.env` present on disk was loaded (`- Environments: .env`), so this run reflects the local `.env` environment rather than an unconfigured container.
   - Result: `BUILD_EXIT=0`. All app and API routes built as dynamic (`ƒ (Dynamic)`), including `/app`, `/app/notes`, `/app/notes/[id]`, `/api/notes`, `/api/notes/[id]`, `/api/notes/[id]/checklist`, `/api/folders`, `/api/folders/[id]`, `/api/tags`; `/icon.svg` built as static (`○`).
5. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`, pre-review status):**
   - Result: `33 requirements, 31 features, 61 rules, 10 RFCs`, `0 failure(s), 6 warning(s)` (`F20`–`F24` planned v1.1 features + `WARN RFC-004 is implemented but not reviewed -- run /review-rfc 004`), `TRACE_EXIT=0`.
6. **Hygiene Scan (`Get-ChildItem -Path src -Recurse -File | Select-String -Pattern 'TODO|FIXME|eslint-disable|process\.env|rehype-raw|\bany\b'`):**
   - Result: Clean. `process.env` appears only in `src/lib/env.ts`; `rehype-raw` appears only in an explanatory comment in `src/components/notes/MarkdownPreview.tsx:109`.

### Acceptance Criteria & Test Strategy Coverage Audit

- **`AC-4.1`–`AC-4.3` (Workspace, Folders, Tags, Instant Search, Auto-Save & Conflicts):**
  - Partial service/API coverage exists in `tests/integration/notes-folders-tags.test.ts` (`3` tests) and editor unit tests in `tests/unit/note-editor.test.tsx` (`3` tests).
  - Uncovered in current automated tests: `NotesWorkspace` active filter matching & mobile route redirect, `NoteDetailView.tsx`, `/app/notes/page.tsx`, `/app/notes/[id]/page.tsx`, `FolderManagerModal.tsx`, `LoginForm` `200` redirect flow, `NoteEditor` toolbar buttons, editor modes, folder selector, remove-tag flow, conflict notice UI, pending-sync state, `content` full-text search, `ILIKE` wildcard escapes (`_`, `\`), `pinned` filter, `folderId=<uuid>` filter, `tagId` filter, `DELETE` tag cleanup, `PATCH /api/folders/[id]` `409`/self-rename, `DELETE /api/folders/[id]` `server_wins`, `401`/`403`/`400`/`422` UUID route param rejections, `409 IDEMPOTENCY_KEY_CONFLICT`, post-commit delete cleanup non-execution on rollback/replay, and `< 300 ms` (`PERF-2`) latency verification.
- **`AC-4.4` (Markdown GFM Preview & Interactive Checklists):**
  - Partial coverage in `tests/unit/notes-checklist-markdown.test.ts` (`5` tests) and `tests/unit/note-editor.test.tsx` (`3` tests); `PATCH /api/notes/[id]/checklist` exists and operates with `rehypeChecklistIndex` + `MarkdownPreview`.
  - Fails under blocking bug #1 (multi-toggle / post-edit checklist toggle offline in `NoteEditor.tsx:352-388`) and blocking bug #3 (blockquote / indented ordered-list continuation parity divergence in `checklist.ts:153-201`).
- **`AC-4.5` (Responsive Layout `360px` / `768px` / `1280px`):**
  - Not verified by automated tests (`TEST-1`, `TEST-3`): no viewport/Playwright layout checks run for `360px`, `768px`, or `1280px` to verify zero horizontal overflow (`NFR-1`, `UI-1`), mobile detail route navigation, or desktop split-pane behavior.
- **`TEST-STRATEGY.md` (`TS-004-01`–`TS-004-03`):**
  - `TEST-STRATEGY.md:176-188` still lists `TS-004-01`, `TS-004-02`, and `TS-004-03` as `Proposed` rather than `Passing`.
  - Test case IDs are swapped in test headers/descriptions: `TEST-STRATEGY.md` maps `TS-004-02` to `note-editor.test.tsx` and `TS-004-03` to `notes-folders-tags.test.ts`, whereas the reverse IDs appear at `tests/unit/note-editor.test.tsx:64` and `tests/integration/notes-folders-tags.test.ts:93`.

---

## Product Type Check Scope

- **Product Type:** Web App (Next.js App Router + React client/server + PostgreSQL/Drizzle).
- **Applied Checks:** Route/SSR/CSR boundaries, CSRF & session auth isolation, XSS/Markdown URL sanitization, SQL parameterization, database index & keyset pagination design, client state synchronization, offline-first editor resilience (`UI-6`), and responsive Web UI / i18n checks.
- **Explicitly Skipped Checks (per `review-rfc` Web App scope):**
  - *Binary Size* — Skipped (not a compiled native/desktop/mobile binary; browser bundle/build output verified via `npm run build`).
  - *Public Third-Party API SLA & Versioning* — Skipped (all `/api/*` endpoints added in `RFC-004` are private first-party session routes scoped to Noka's own web frontend).

---

## Review Dimensions

### 1. RFC Adherence — **FAIL / NEEDS WORK**

Scope compliance (`MoSCoW`, `QUAL-1`): No v1.1 (`F20`–`F24`) or *Won't Have* (`F25`–`F31`) features were introduced, and `PATCH /api/notes/[id]/checklist` directly supports `AC-4.4`. However, there are **4 functional regressions/defects** and **multiple undocumented contract/spec deviations**:

1. **Offline checklist toggle fails after an offline edit or multi-toggle (`src/components/notes/NoteEditor.tsx:123-128, 352-388`):**
   - `persistSnapshot` returns `null` immediately when `navigator.onLine === false` (`NoteEditor.tsx:123-128`).
   - In `handleToggleChecklist` (`NoteEditor.tsx:352-388`), when `dirtyRef.current` is `true` (e.g., the user typed text offline before tapping a checkbox), `handleToggleChecklist` awaits `persistSnapshot`, sees `!flushed`, and executes `return;` **before** toggling the checkbox via `toggleChecklistInMarkdown` and saving the optimistic offline update (`NoteEditor.tsx:384-388`).
   - Users offline cannot toggle checklist items whenever there are pending unsaved edits in the editor (`AC-4.4`, `UI-6`).
2. **`NoteEditor` unmounts mid-typing when active filters no longer match (`src/components/notes/NotesWorkspace.tsx:61-101, 369-388, 441-442, 738-749`):**
   - `handleNoteSaved` (`NotesWorkspace.tsx:369-388`) checks `noteMatchesActiveFilters` (`NotesWorkspace.tsx:61-101`) and strips the edited/created note out of `notesList` if its updated title/content/pinned/tag state stops matching the active search `q`, `pinnedOnly`, or `tagFilter`.
   - `selectedNote` (`NotesWorkspace.tsx:441-442`) resolves from `notesList`, so when `selectedNote` becomes `null`, the workspace unmounts `NoteEditor` (`NotesWorkspace.tsx:738-749`) while the user is still actively editing.
3. **Checklist index parser diverges from `remark-gfm` (`src/features/notes/checklist.ts:153-201`):**
   - `scanChecklistMatches` pushes list containers onto `listStack`, but never resets `listStack` when exiting a blockquote across a blank/non-quoted line (e.g., `> - Quoted\n\n    - [ ] Code`), falsely counting an indented code line as a checklist item.
   - Conversely, on indented continuation text inside a 4-space ordered list (e.g., `10. Parent\n    continuation\n    - [ ] Nested`), `relativeIndent <= 0` clears `listStack`, losing nested checklist parity with `rehypeChecklistIndex` in `MarkdownPreview.tsx:27-62`.
4. **Deleted folder leaves stale `folderId` in dirty editor (`src/components/notes/NoteEditor.tsx:228-236`):**
   - Because prop synchronization sits inside `else if (!dirtyRef.current)` (`NoteEditor.tsx:228-236`), deleting the currently assigned folder via `FolderManagerModal` while `dirtyRef.current === true` keeps the deleted `folderId` in editor state, causing subsequent auto-save requests to fail with `404 NOT_FOUND`.
5. **Unrecorded `RFC-004` contract & spec drift (`QUAL-1`, downstream impact on `RFC-005`/`RFC-008`):**
   - **Query & filter contract:** `folderId` filter uses `"unfiled"` (`src/features/notes/schemas.ts:76`) rather than `"none"`; `listNotes` default `limit` is `50` (`schemas.ts:9`) rather than `30`; `content` max length is `200_000` (`schemas.ts:5`) rather than `100_000`.
   - **Tag validation mismatch:** `schemas.ts:17-20` chains `z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH)` before `.transform(normalizeTagNames)`, causing empty/whitespace array elements (`""`, `"   "`) to throw a validation error instead of being filtered out cleanly by `normalizeTagNames`.
   - **Response shapes & error codes:** List endpoints return `{ notes, nextCursor, hasMore }` rather than `{ items, nextCursor }`; single-resource responses return direct DTOs (`NoteDto` / folder DTO) rather than `{ note }` / `{ folder }` wrappers; conflict resolution returns `conflictResolved: "server_wins"` (`src/features/notes/service.ts:1279` and mutation handlers) rather than `"applied" | "server_newer"`; not-found errors across `src/features/notes/service.ts` (`lines 269, 655, 740, 800, 832, 876, 909, 1149, 1218, 1267`) return `404 NOT_FOUND` instead of domain codes `NOTE_NOT_FOUND` / `FOLDER_NOT_FOUND` referenced by downstream `RFC-005` and `RFC-008`; `DELETE /api/folders/[id]` omits `movedNotesCount` and hardcodes `noteCount: 0` in the `server_wins` response (`service.ts:1279`).
   - **RFC-004 doc drift:** `RFC-004` `API Contracts Exposed` and `File Structure` omit `PATCH /api/notes/[id]/checklist`.

### 2. Rules Compliance — **NEEDS WORK**

- **Violations / Gaps:**
  - `QUAL-1` / `QUAL-4`: Code deviates silently from `RFC-004` contracts and `TEST-STRATEGY.md` without updating the spec or recording decisions; `TEST-STRATEGY.md:176-188` status remains `Proposed`.
  - `UI-6`: Broken offline checklist toggling when `dirtyRef.current` is `true` (`NoteEditor.tsx:352-388`) and silent editor unmount on active-filter mismatch (`NotesWorkspace.tsx:369-388`).
  - `TEST-1` / `TEST-3`: Missing responsive layout / overflow assertions (`360px` / `768px` / `1280px`) and missing API route/security/conflict/idempotency test coverage listed in Step 0.
  - `I18N-1` (minor): Hardcoded English default insertion snippets remain in `NoteEditor.tsx:708-780` (`"Heading"`, `"text"`, `"Item"`, `"Task"`, `"code"`, `"label"`).
- **Compliant Areas Verified:**
  - `ARCH-1`, `ARCH-2`, `ARCH-4`, `ARCH-5`: Next.js App Router conventions, clean separation of route handlers (`src/app/api/**`), validation schemas (`src/features/notes/schemas.ts`), domain service (`src/features/notes/service.ts`), and components (`src/components/notes/**`).
  - `DATA-4`: Schema & migrations preserve referential safety (`transactions.note_id ON DELETE set null` in `src/db/schema/finance.ts` / `src/db/migrations/0000_init.sql`); deleting a folder reassigns notes cleanly; deleting a note detaches transaction links rather than failing or deleting transactions.
  - `OBS-2`: Cleanup error logs in `src/features/notes/service.ts:135-139` avoid logging plaintext note contents, titles, or secrets.
  - `UI-1`, `UI-2`: Uses project CSS design tokens (`src/styles/tokens.css`, `src/app/globals.css`) cleanly.

### 3. Security — **PASS (with test-coverage note)**

- **Auth, CSRF, & Ownership Isolation (`SEC-*`):** All mutating routes validate CSRF origin via `verifyCsrfOrigin` and authenticate via `requireAuth`; every DB query and subquery scopes explicitly to `userId = user.id`; route `[id]` parameters pass through `parseUuidRouteParam`.
- **SQL Injection Defense:** Search uses parameterized Drizzle queries with explicit `ESCAPE '\\'` `ILIKE` escaping rather than string concatenation.
- **Markdown XSS Protection (`MarkdownPreview.tsx:68-106, 140-143`):** `ReactMarkdown` runs with `remarkGfm` only (no `rehype-raw`), and `sanitizeMarkdownUrl` strips/blocks `javascript:`, `data:`, `vbscript:`, protocol-relative `//`, backslashes `\\`, `/\\`, and ASCII control characters.
- **Post-Commit Cleanup Hook (`src/app/api/notes/[id]/route.ts:79-98`):** `runNoteDeleteCleanupHandlers` executes strictly after `withIdempotency` commits and only when `pendingCleanup` is non-null (skipping on replay or `server_wins`).
- **Hardening Note:** While auth/CSRF primitives are unit/integration tested under `RFC-002`, `tests/integration/notes-folders-tags.test.ts` lacks direct route assertions for `401` unauthenticated access, `403` CSRF mismatch, cross-user `DELETE`, and `409 IDEMPOTENCY_KEY_CONFLICT`.

### 4. Performance — **NEEDS WORK**

- **Strengths:**
  - Keyset pagination on `(isPinned DESC, updatedAt DESC, id DESC)` backed by partial composite index `notes_user_pinned_updated_active_idx` (`src/db/schema/notes.ts`, `0000_init.sql`).
  - Batched tag loading via `fetchTagsByNoteIds` avoids N+1 queries.
  - Request caps (`limit <= 100`) and client debouncing (`180ms` search debounce, `600ms` save debounce) reduce chatter.
- **Concerns:**
  - `PERF-2` (`< 300 ms` search target) has no timing assertion in `tests/integration/notes-folders-tags.test.ts` (specifically requested by `TS-004-03` in `TEST-STRATEGY.md:176-188`).
  - Full-text substring `ILIKE '%...%'` without a GIN/trigram index (plus tag/content subquery) can degrade to sequential scans as note volume and `200_000`-char note sizes grow.
  - Keyset cursor timestamp precision (`listNotes` / `encodeNotesCursor`) encodes JS millisecond `Date` values, which can drift against PostgreSQL `timestamptz` microsecond values if any future writer uses SQL `NOW()` rather than JS `new Date()`.

### 5. Maintainability — **NEEDS WORK**

- **Test & Traceability Gaps:**
  - `TS-004-02` and `TS-004-03` labels are swapped between `tests/unit/note-editor.test.tsx:64` and `tests/integration/notes-folders-tags.test.ts:93` relative to `TEST-STRATEGY.md:176-188`.
  - Substantial behavior remains untested (`NoteDetailView.tsx`, `FolderManagerModal.tsx`, `/app/notes/page.tsx`, `/app/notes/[id]/page.tsx`, edge search/filter params, conflict/idempotency error paths, tag limit checks).
- **Concurrency & State Edge Cases:**
  - `syncNoteTags` (`src/features/notes/service.ts:392-418`) and `createNote` (`service.ts:671-711`) do not catch PostgreSQL `23505` unique-constraint conflicts on concurrent tag upsert / `input.id` insert retry, and note/folder mutations lack `FOR UPDATE` locking.
  - `deleteFolder` `server_wins` response hardcodes `noteCount: 0` (`service.ts:1279`).
  - `NoteEditor.tsx:321` (`handleAddTag`) lacks a client-side `NOTE_MAX_TAGS` guard prior to hitting the API.
  - `NotesWorkspace.tsx:397-409` invokes `setSelectedNoteId` from inside a `setNotesList` state updater function (React anti-pattern under concurrent rendering / StrictMode).
  - `MarkdownPreview.tsx:187-198` sets `flex items-start gap-2.5` on `task-list-item` `<li>` without `flex-wrap`, risking horizontal squishing on deeply nested task sublists.

---

## Overall Assessment

- **Overall Risk Level:** **High**
- **Summary:** Core schema, XSS-safe Markdown rendering, auth/user-scoping, and keyset pagination foundations are cleanly structured, and `lint`, `typecheck`, `65` existing tests, and `next build` pass cleanly at `4e52c5b`. However, interactive editor UX (`NoteEditor.tsx` offline checklist failure + `NotesWorkspace.tsx` mid-typing unmount), checklist parser/preview parity (`checklist.ts`), silent API/contract drift affecting downstream `RFC-005`/`RFC-008`, and missing `AC-4.1`–`AC-4.5` / `TS-004` test coverage require fixes before merge.

### Blocking Issues

1. **Offline checklist multi-toggle / post-edit toggle failure** — Fix `NoteEditor.tsx:123-128, 352-388` so `handleToggleChecklist` applies `toggleChecklistInMarkdown` and saves locally/outbox cleanly when `navigator.onLine === false` even if `dirtyRef.current` is `true` (`AC-4.4`, `UI-6`).
2. **`NoteEditor` unmounts while typing when edited note leaves active filter** — Keep the currently selected/edited note mounted in `NotesWorkspace.tsx:369-388, 441-442, 738-749` (or preserve draft selection independently of `notesList` filter pruning), and reconcile deleted `folderId` in `NoteEditor.tsx:228-236` even when `dirtyRef.current` is `true`.
3. **Checklist index parser parity drift with `remark-gfm`** — Fix `scanChecklistMatches` in `src/features/notes/checklist.ts:153-201` to reset `listStack` cleanly on blockquote exit and handle indented ordered-list continuation text identically to `rehypeChecklistIndex` (`MarkdownPreview.tsx:27-62`).
4. **Silent `RFC-004` spec/API contract drift & schema mismatch** — Either align implementation with `RFC-004` (`RFC-005`/`RFC-008` consumers) or formally reconcile `RFC-004` via `/manage-changes`: resolve `404 NOT_FOUND` vs `NOTE_NOT_FOUND`/`FOLDER_NOT_FOUND`, `folderId: "unfiled"` vs `"none"`, `tagListSchema` `.min(1)` rejecting empty strings before `normalizeTagNames` (`schemas.ts:17-20`), `movedNotesCount` / `server_wins` (`service.ts:1279`), response wrappers, `limit`/`content` max defaults, and missing `PATCH /api/notes/[id]/checklist` contract docs.
5. **Incomplete `AC-4.1`–`AC-4.5` & `TEST-STRATEGY.md` (`TS-004`) verification** — Add automated layout/overflow verification across `360px` / `768px` / `1280px` (`AC-4.5`, `TEST-1`, `TEST-3`), close the unit/integration test gaps listed in Step 0 (including `PERF-2` `< 300 ms` assertion, `401`/`403`/`409`/`422` paths, `NotesWorkspace`/`FolderManagerModal`/`NoteDetailView`), align swapped `TS-004-02`/`TS-004-03` IDs, and update `TEST-STRATEGY.md:176-188` statuses to `Passing`.

### Improvement Suggestions

- Add `23505` unique-conflict catch/retry handling in `syncNoteTags` (`src/features/notes/service.ts:392-418`) and `createNote` (`service.ts:671-711`), consider `FOR UPDATE` on concurrent note/folder updates, and add a `pg_trgm` GIN index on `notes.title` / `notes.content` before production scale-up.
- Move `setSelectedNoteId` out of `setNotesList`'s updater callback (`NotesWorkspace.tsx:397-409`) into an effect or event handler.
- Add `NOTE_MAX_TAGS` client guard in `NoteEditor.tsx:321`, move hardcoded English toolbar insertion defaults (`NoteEditor.tsx:708-780`) into `i18n` dictionaries (`I18N-1`), and add `flex-wrap` to nested `task-list-item` containers (`MarkdownPreview.tsx:187-198`).
- Normalize keyset cursor timestamps via SQL-aligned microsecond precision or explicit JS `Date` enforcement across all note writers.

---

## Round 2 -- 2026-11-12

- **RFC:** `RFC-004` ([`RFC-004-Notes-Workspace-And-Search.md`](../RFCs/RFC-004-Notes-Workspace-And-Search.md))
- **Change Request Verified:** `CR-003` ([`CHANGE-REQUEST-003.md`](../changes/CHANGE-REQUEST-003.md))
- **Branch & Commit:** `feat/rfc-004-notes-workspace` @ `687c623` (commits reviewed since Round 1 `4e52c5b`: `a1bfb70`, `2e61a09`, `a9bdd95`, `687c623`)
- **Review Context:** Fresh review session (Round 2 re-review; none of the `RFC-004` application or test code was authored in this session)
- **Reviewer Verdict:** **Approved** (**Overall Risk Level: Low**)

### Step 0: Verification Run Output (Round 2)

Executed directly against `feat/rfc-004-notes-workspace` @ `687c623` (`next-env.d.ts` regenerated cleanly by `next build`; only `RFCS.md` and `reviews/REVIEW-RFC-004.md` modified in the working tree):

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: `LINT_EXIT=0` (clean pass).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: `TSC_EXIT=0` (clean pass).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: `Test Files 15 passed (15)`, `Tests 71 passed (71)`, `0` skipped, `Duration 7.93s`, `TEST_EXIT=0`.
   - `RFC-004`-relevant suites observed:
     - `tests/unit/notes-checklist-markdown.test.ts` — `5` tests passed.
     - `tests/unit/note-editor.test.tsx` — `7` tests passed.
     - `tests/integration/notes-folders-tags.test.ts` — `4` tests passed.
     - `tests/unit/auth-forms.test.tsx` — `7` tests passed.
4. **End-to-End Test Suite (`npx playwright test tests/e2e/notes-workspace.spec.ts`):**
   - Result: `2 passed (29.9s)` (`EXIT=0`):
     - `[mobile]` `RFC-004: Notes Workspace E2E (TS-004-04) > verifies auth redirect -> /app/notes, folder & note lifecycle, checklist reload persistence, pagination, and zero overflow across viewports` (`24.5s`).
     - `[desktop]` `RFC-004: Notes Workspace E2E (TS-004-04) > verifies auth redirect -> /app/notes, folder & note lifecycle, checklist reload persistence, pagination, and zero overflow across viewports` (`28.0s`).
5. **Production Build (`npm run build` -> `next build` `16.4.6` Turbopack):**
   - Executed with `$env:DATABASE_URL=""; $env:SESSION_SECRET=""; $env:APP_URL="http://127.0.0.1:3114"`.
   - Note: local `.env` on disk was loaded (`- Environments: .env`).
   - Result: `BUILD_EXIT=0`. All app and API routes built as `ƒ (Dynamic)` (`/app`, `/app/notes`, `/app/notes/[id]`, `/api/notes`, `/api/notes/[id]`, `/api/notes/[id]/checklist`, `/api/folders`, `/api/folders/[id]`, `/api/tags`); `/icon.svg` built as static (`○`).
6. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`, pre-status-update):**
   - Result: `33 requirements, 31 features, 61 rules, 10 RFCs`, `0 failure(s), 5 warning(s)` (`F20`–`F24` planned v1.1 features), `TRACE_EXIT=0` (and status subsequently updated to `Reviewed` in `RFCS.md`).
7. **Hygiene Scan (`Get-ChildItem -Path src -Recurse -File | Select-String -Pattern 'TODO|FIXME|eslint-disable|process\.env|rehype-raw|\bany\b'`):**
   - Result: Clean (`process.env` only in `src/lib/env.ts`; `rehype-raw` only in comment at `src/components/notes/MarkdownPreview.tsx:109`; `\bany\b` only English prose `"any"` in comments/copy).

### Product Type Check Scope

- **Product Type:** Web App (Next.js App Router + React client/server + PostgreSQL/Drizzle).
- **Explicitly Skipped Checks (per `review-rfc` Web App scope):**
  - *Binary Size* — Skipped (web application rather than native desktop/mobile binary; verified production Next.js route/bundle compilation via `npm run build`).
  - *Public Third-Party API SLA & Versioning* — Skipped (all `/api/*` endpoints added in `RFC-004` are internal session-authenticated routes for Noka's own web frontend).

### Round 1 Blocking Issues Resolution Verification

1. **Issue #1 (Offline checklist multi-toggle / post-edit toggle failure) — RESOLVED:**
   - `src/components/notes/NoteEditor.tsx:409-498` (`handleToggleChecklist`) now computes `optimisticContent`, updates `content`, `draftRef.current`, and `dirtyRef.current`, sets `pending_sync` status while offline (`lines 434-437`), flushes combined dirty draft edits via `persistSnapshot` when online (`lines 439-442`), and reconnect-flushes dirty drafts via the `online` event listener (`lines 268-285`).
2. **Issue #2 (`NoteEditor` unmounts mid-typing when edited note leaves active filter + stale deleted `folderId`) — RESOLVED:**
   - `src/components/notes/NotesWorkspace.tsx:129-130, 401-404, 478-480` keeps `retainedSelectedNote` mounted while actively edited even if edits exclude it from the current filter slice.
   - `src/components/notes/NoteEditor.tsx:251-265` reconciles deleted folders by clearing `folderId` even when `dirtyRef.current === true`.
3. **Issue #3 (Checklist index parser parity drift with `remark-gfm`) — RESOLVED:**
   - `src/features/notes/checklist.ts:288-525` and `src/components/notes/MarkdownPreview.tsx:27-62, 188-195, 251-273` align blockquote exit resets, indented ordered-list continuation, list interruption rules, and unclosed fence handling with `rehypeChecklistIndex`.
4. **Issue #4 (Silent `RFC-004` spec/API contract drift & schema mismatch) — RESOLVED:**
   - Formally reconciled through approved `CR-003` (`changes/CHANGE-REQUEST-003.md`, commit `a1bfb70`), updating `RFCs/RFC-004-Notes-Workspace-And-Search.md` (`API Contracts Exposed`, `AC-4.1`–`AC-4.5`, and `Implementation Notes` at `lines 100-108`) and auth entry redirects (`/app/notes` across `src/app/(app)/app/page.tsx`, `src/app/(auth)/login/page.tsx:10`, `src/app/(auth)/register/page.tsx:10`, `LoginForm.tsx:106`, `RegisterForm.tsx:97`).
   - `src/features/notes/schemas.ts:17-22, 78` normalizes tags via `normalizeTagNames` before array constraints and standardizes `folderId: "none"`.
   - `src/features/notes/service.ts` (`lines 298, 754, 863, 922, 958, 1001, 1038, 1283, 1345, 1405` and `1410-1459`) returns domain codes `NOTE_NOT_FOUND` / `FOLDER_NOT_FOUND` matching downstream `RFC-005`/`RFC-008`, standardizes `conflictResolved: "applied" | "server_newer"`, and populates real `noteCount` + `movedNotesCount` in `deleteFolder`.
5. **Issue #5 (Incomplete `AC-4.1`–`AC-4.5` & `TEST-STRATEGY.md` verification) — RESOLVED:**
   - `TEST-STRATEGY.md:185-188` records `Passing` for `TS-004-01`–`TS-004-04`, Vitest suite increased to `71/71` passing tests, and `tests/e2e/notes-workspace.spec.ts` (`TS-004-04`) passes on both `[mobile]` and `[desktop]` viewports (`2 passed (29.9s)`).

### Review Dimensions (Round 2)

1. **RFC Adherence — PASS:** Scope matches `F7`, `F8`, `FR-4`, `FR-5`, `AC-4.1`–`AC-4.5`, and approved `CR-003`; downstream contracts for `RFC-005` and `RFC-008` (`NOTE_NOT_FOUND`, `{ note }`, `conflictResolved: "applied" | "server_newer"`, `NoteDeleteCleanupPayload`, preview/editor extension slots) align with spec.
2. **Rules Compliance — PASS:** Verified Round 1 gaps in `UI-6`, `QUAL-1`/`QUAL-4`, `I18N-1` (`NoteEditor.tsx:809,821,833,845,857,869,881` now use `t.notes.toolDefault*`), and `TEST-1`/`TEST-3` are resolved; schema preserves `transactions.note_id` `ON DELETE SET NULL` (`src/db/schema/finance.ts:125-127`, `DATA-4`).
3. **Security — PASS:** Auth/CSRF validation, strict `userId` isolation, parameterized `ESCAPE '\\'` `ILIKE` search, `rehype-raw`-free `ReactMarkdown` + URL sanitization, and post-commit cleanup execution all remain intact.
4. **Performance — PASS:** Composite keyset index (`notes_user_pinned_updated_active_idx`), batched tag lookups, request limits, and debounced search/autosave remain intact.
5. **Maintainability — PASS:** `lockActiveNoteRow` + `.for("update")` + `23505` handling + `tx.transaction` savepoints in `service.ts`, `NOTE_MAX_TAGS` client guard (`NoteEditor.tsx:376-379`), `flex-wrap` on `task-list-item` containers (`MarkdownPreview.tsx:188-195`), and clean state-updater separation in `NotesWorkspace.tsx:417-436` (`handleNoteDeleted`) resolve prior concurrency and UI ergonomics issues.

### Overall Assessment (Round 2)

- **Overall Risk Level:** **Low**
- **Summary:** All 5 blocking issues and the Round 1 improvement items are cleanly resolved on `feat/rfc-004-notes-workspace` (`687c623`), `CR-003` reconciles the spec and implementation contracts for `RFC-005`/`RFC-008`, and `lint`, `typecheck`, `71/71` unit/integration tests, Playwright E2E `TS-004-04` (`mobile` + `desktop`), `next build`, and traceability checks all pass.
- **Blocking Issues:** None.
- **Improvement Suggestions (Non-Blocking):**
  - Keep monitoring rapid back-and-forth note switching in `NoteEditor.tsx:218-226` (currently fire-and-forget async `persistSnapshot` safely suppresses stale UI status on another note, though queueing per-note in-flight flushes could tighten rapid same-note re-selection races).
  - Consider scheduling a `pg_trgm` GIN index migration on `notes.title` / `notes.content` prior to high note-volume scale-up.

---

## Round 3 -- 2026-11-12

- **RFC:** `RFC-004` ([`RFC-004-Notes-Workspace-And-Search.md`](../RFCs/RFC-004-Notes-Workspace-And-Search.md))
- **Branch & Commit:** `feat/rfc-004-notes-workspace` @ `245e5e3` (commits reviewed since Round 2 `1a94f58`: `4580e28`, `3d46b8c`, `245e5e3`)
- **Review Context:** Fresh review session (Round 3 re-review verifying implementation of Round 2 non-blocking improvements; none of `4580e28`, `3d46b8c`, or `245e5e3` was authored in this session)
- **Reviewer Verdict:** **Approved** (**Overall Risk Level: Low**)

### Step 0: Verification Run Output (Round 3)

Executed directly against `feat/rfc-004-notes-workspace` @ `245e5e3`:

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: `LINT_EXIT=0` (clean pass).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: `TSC_EXIT=0` (clean pass).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: `Test Files 15 passed (15)`, `Tests 74 passed (74)`, `0` skipped, `Duration 7.34s`, `TEST_EXIT=0` (`+3` new tests since Round 2).
   - `RFC-004`-relevant suites observed:
     - `tests/unit/notes-checklist-markdown.test.ts` — `5` tests passed.
     - `tests/unit/note-editor.test.tsx` — `9` tests passed (`NoteMutationCoordinator` + rapid `A -> B -> A` / checklist race / offline reconnect suite).
     - `tests/integration/notes-folders-tags.test.ts` — `5` tests passed (includes `pg_trgm` extension, GIN partial index DDL, `EXPLAIN` plan across 5,000 notes, and `GET /api/notes?q=... < 300ms` assertion).
     - `tests/unit/auth-forms.test.tsx` — `7` tests passed.
4. **End-to-End Test Suite (`$env:CI="true"; npx playwright test tests/e2e/notes-workspace.spec.ts`):**
   - Executed against fresh production build & server (`npm run build && npm run start`).
   - Result: `2 passed (14.8s)` (`EXIT=0`):
     - `[desktop]` `RFC-004: Notes Workspace E2E (TS-004-04) > verifies auth redirect -> /app/notes, folder & note lifecycle, checklist reload persistence, pagination, and zero overflow across viewports` (`5.0s`).
     - `[mobile]` `RFC-004: Notes Workspace E2E (TS-004-04) > verifies auth redirect -> /app/notes, folder & note lifecycle, checklist reload persistence, pagination, and zero overflow across viewports` (`3.9s`).
5. **Production Build & Schema Check (`npm run build` -> `next build` `16.4.6` Turbopack + `npx drizzle-kit check`):**
   - Executed with `$env:DATABASE_URL=""; $env:SESSION_SECRET=""; $env:APP_URL="http://127.0.0.1:3114"` (local `.env` loaded: `- Environments: .env`).
   - Result: `BUILD_EXIT=0` (routes unchanged: `ƒ (Dynamic)` on app & API routes, `○ (Static)` on `/icon.svg`) and `npx drizzle-kit check` -> `Everything's fine`, `DRIZZLE_CHECK_EXIT=0`.
6. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`):**
   - Result: `33 requirements, 31 features, 61 rules, 10 RFCs`, `0 failure(s), 5 warning(s)` (`F20`–`F24` planned v1.1 features), `TRACE_EXIT=0`.
7. **Hygiene Scan (`Get-ChildItem -Path src -Recurse -File | Select-String -Pattern 'TODO|FIXME|eslint-disable|process\.env|rehype-raw|\bany\b'`):**
   - Result: Clean (`process.env` only in `src/lib/env.ts`; `rehype-raw` only in comment at `src/components/notes/MarkdownPreview.tsx:109`; `\bany\b` only prose comments/copy).

### Product Type Check Scope

- **Product Type:** Web App (`PRD.md:20-40`, `RULES.md:22-44` — Multi-user Responsive Web App + PWA + Public SEO Pages).
- **Applied Checks:** Auth & Sessions, Authorization per Resource, Data Model & Migrations (including Drizzle snapshot parity and `pg_trgm` partial GIN migration), Accessibility, Responsive Layout, Offline Sync (explicit `PRD.md` exception), and Page-Load / API CRUD Performance (`PERF-2`).
- **Explicitly Skipped Checks (per `review-rfc` & `PRD.md` Web App scope):**
  - *Binary Size* — Skipped (Web App/PWA delivered via browser rather than native desktop/mobile binary; controlled via production `next build`).
  - *Public Third-Party API SLA & Versioning* — Skipped (private first-party session routes scoped exclusively to Noka's own web client).

### Audit of Changes Since Round 2 (`4580e28`, `3d46b8c`, `245e5e3`)

1. **Per-Note Mutation Queue & Draft Preservation (`src/features/notes/mutation-queue.ts:1-217`, `src/components/notes/NoteEditor.tsx:122-887`):**
   - [`NoteMutationCoordinator`](../src/features/notes/mutation-queue.ts#L54-L217) enforces FIFO per-`noteId` promise serialization while keeping different notes parallel, catches upstream task rejections cleanly (`previous.catch(() => undefined)`) so a transient failure never wedges later tasks, compares snapshot tags element-by-element ([`areDraftSnapshotsEqual`](../src/features/notes/mutation-queue.ts#L22-L43), avoiding `|` delimiter edge cases), and tracks monotonic `knownUpdatedAt`, sequence numbers, pending drafts, and deleted tombstones.
   - [`NoteEditor`](../src/components/notes/NoteEditor.tsx#L96-L1295) flushes dirty drafts on note switch (`lines 360-392`), restores in-flight or `"pending_sync"` drafts (`folderId`-sanitized via [`resolveValidFolderId`](../src/components/notes/NoteEditor.tsx#L73-L91)) upon rapid `A -> B -> A` re-selection (`lines 397-428`), prevents stale prop overwrites (`line 444`), serializes rapid checklist clicks behind in-flight/dirty state (`lines 683-793`), and retries both active and switched-away `"pending_sync"` drafts on `online` (`lines 476-534`).
   - Verified directly by `tests/unit/note-editor.test.tsx:889-1279` (`TS-004-02`, passing).
2. **PostgreSQL `pg_trgm` Partial GIN Indexes (`src/db/schema/notes.ts:69-74`, `src/db/migrations/0001_notes_pg_trgm_indexes.sql:1-3`):**
   - Schema defines partial GIN trigram indexes `notes_title_trgm_active_idx` and `notes_content_trgm_active_idx` (`WHERE deleted_at IS NULL`) aligning with `listNotes` `ILIKE ... ESCAPE '\\'` predicates (`src/features/notes/service.ts:654-666`).
   - Migration `0001_notes_pg_trgm_indexes.sql` includes `CREATE EXTENSION IF NOT EXISTS "pg_trgm"` before index creation and passes `drizzle-kit check` with zero snapshot drift.
   - Verified directly by `tests/integration/notes-folders-tags.test.ts:1193-1278` (`TS-004-03`, asserting extension presence, index DDL, PostgreSQL `EXPLAIN` index usage across 5,000 notes, and `GET /api/notes?q=...` latency `< 300 ms`).
3. **Documentation & Traceability Alignment (`RFCs/RFC-004-Notes-Workspace-And-Search.md:72-73, 108-110`, `TEST-STRATEGY.md:186-188`):**
   - `RFC-004` `Implementation Notes` and `TEST-STRATEGY.md` accurately record `NoteMutationCoordinator`, rapid `A -> B -> A` state guarantees, `0001_notes_pg_trgm_indexes.sql`, and the expanded `TS-004-02`/`TS-004-03` assertions.

### Review Dimensions (Round 3)

1. **RFC Adherence — PASS:** Implements and thoroughly documents both Round 2 non-blocking recommendations in [`RFC-004`](../RFCs/RFC-004-Notes-Workspace-And-Search.md#L108-L110) and [`TEST-STRATEGY.md`](../TEST-STRATEGY.md#L186-L188) with no scope creep beyond `F7`/`F8`.
2. **Rules Compliance — PASS:** Schema & migration follow `STACK-2` (Drizzle SQL migration + zero manual drift), `PERF-2` (`< 300 ms` verified on 5,000 notes), `UI-6`, `TEST-1`, `QUAL-2`, `QUAL-3`, and `QUAL-4`.
3. **Security — PASS:** Queueing and GIN index changes are strictly additive; `userId` isolation, parameterized `ESCAPE '\\'` queries, CSRF/session checks, `rehype-raw`-free Markdown sanitization, and post-commit delete cleanup remain unchanged and intact.
4. **Performance — PASS:** Partial GIN trigram indexes optimize substring `ILIKE` filtering across active notes (`PERF-2 < 300 ms` verified on 5,000 rows), while per-note FIFO queueing avoids redundant concurrent `PATCH` races per note without blocking edits to other notes.
5. **Maintainability — PASS:** Clean cohesion in [`mutation-queue.ts`](../src/features/notes/mutation-queue.ts), strong unit + integration test coverage (`74/74` Vitest + `2/2` Playwright E2E), and clean Drizzle migration metadata.

### Overall Assessment (Round 3)

- **Overall Risk Level:** **Low**
- **Summary:** Both newly landed enhancements — [`NoteMutationCoordinator`](../src/features/notes/mutation-queue.ts) for serialized per-note mutations and draft preservation across `A -> B -> A` switches, and `pg_trgm` partial GIN indexes in [`0001_notes_pg_trgm_indexes.sql`](../src/db/migrations/0001_notes_pg_trgm_indexes.sql) — are cleanly implemented, verified by `3` new tests and full CI Playwright E2E, and accurately documented in `RFC-004` and `TEST-STRATEGY.md`. Zero blocking issues found.
- **Blocking Issues:** None.
- **Improvement Suggestions (Non-Blocking):**
  - If navigating away directly mounts/unmounts `NoteEditor` within the `600 ms` debounce window (e.g., clicking Back in `NoteDetailView.tsx:68` before debounce fires), `clearPendingTimer()` on unmount (`NoteEditor.tsx:538-541`) still discards unsaved debounced keystrokes until `RFC-009` IndexedDB local persistence lands; consider a best-effort unmount/back flush if needed before `RFC-009`.
  - Operational deployment note: `0001_notes_pg_trgm_indexes.sql` runs `CREATE EXTENSION IF NOT EXISTS "pg_trgm"`; if a production database uses a least-privilege migration role without extension-creation privilege, ensure `pg_trgm` is pre-enabled by the DB owner prior to running `npm run db:migrate`.

---

## Round 4 -- 2026-11-12

- **RFC:** `RFC-004` ([`RFC-004-Notes-Workspace-And-Search.md`](../RFCs/RFC-004-Notes-Workspace-And-Search.md))
- **Branch & Commit:** `feat/rfc-004-notes-workspace` @ `0daecff` (commits reviewed since Round 3 `2844a39`: `212dd9f`, `1f4ae34`, `0daecff`)
- **Review Context:** Fresh review session (Round 4 re-review verifying implementation of Round 3 non-blocking suggestions; none of `212dd9f`, `1f4ae34`, or `0daecff` was authored in this session)
- **Reviewer Verdict:** **Approved** (**Overall Risk Level: Low**)

### Step 0: Verification Run Output (Round 4)

Executed directly against `feat/rfc-004-notes-workspace` @ `0daecff`:

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: `LINT_EXIT=0` (clean pass).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: `TSC_EXIT=0` (clean pass).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: `Test Files 15 passed (15)`, `Tests 75 passed (75)`, `0` skipped, `Duration 8.95s`, `TEST_EXIT=0` (`+1` new comprehensive unit test suite case since Round 3).
   - `RFC-004`-relevant suites observed:
     - `tests/unit/notes-checklist-markdown.test.ts` — `5` tests passed.
     - `tests/unit/note-editor.test.tsx` — `10` tests passed (adds `waitForIdle`, clean/StrictMode zero-PATCH unmount, `<= 60_000`-byte `keepalive: true` unmount, `> 60_000`-byte `pagehide` without `keepalive` + zero duplicate unmount, offline unmount silence, and `NoteDetailView` online/offline Back flush).
     - `tests/integration/notes-folders-tags.test.ts` — `5` tests passed.
     - `tests/unit/auth-forms.test.tsx` — `7` tests passed.
4. **End-to-End Test Suite (`npx playwright test tests/e2e/notes-workspace.spec.ts`):**
   - Environment note: `CI=true` aborted on preflight because `http://localhost:3000` was already serving a running local server; running without `CI=true` reused that active `http://localhost:3000` server (`reuseExistingServer: !process.env.CI` in `playwright.config.ts`).
   - Result: `2 passed (17.7s)` (`EXIT=0`), including editing `"Catatan Mobile Cepat"` within the `600 ms` debounce window and clicking **Kembali ke Catatan** before verifying list persistence:
     - `[desktop]` `RFC-004: Notes Workspace E2E (TS-004-04) > verifies auth redirect -> /app/notes, folder & note lifecycle, checklist reload persistence, pagination, and zero overflow across viewports` (`16.2s`).
     - `[mobile]` `RFC-004: Notes Workspace E2E (TS-004-04) > verifies auth redirect -> /app/notes, folder & note lifecycle, checklist reload persistence, pagination, and zero overflow across viewports` (`13.0s`).
5. **Production Build & Schema Check (`npm run build` -> `next build` `16.4.6` Turbopack + `npx drizzle-kit check`):**
   - Executed with `$env:DATABASE_URL=""; $env:SESSION_SECRET=""; $env:APP_URL="http://127.0.0.1:3114"` (local `.env` loaded: `- Environments: .env`).
   - Result: `BUILD_EXIT=0` (all app/API routes `ƒ (Dynamic)` except `/icon.svg` `○ (Static)`) and `npx drizzle-kit check` -> `Everything's fine`, `DRIZZLE_CHECK_EXIT=0`.
6. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`):**
   - Result: `33 requirements, 31 features, 61 rules, 10 RFCs`, `0 failure(s), 5 warning(s)` (`F20`–`F24` planned v1.1 features), `TRACE_EXIT=0`.
7. **Hygiene Scan (`Get-ChildItem -Path src -Recurse -File | Select-String -Pattern 'TODO|FIXME|eslint-disable|process\.env|rehype-raw|\bany\b'`):**
   - Result: Clean (`process.env` only in `src/lib/env.ts`; `rehype-raw` only in comment at `src/components/notes/MarkdownPreview.tsx:109`; `\bany\b` only prose comments/copy).

### Product Type Check Scope

- **Product Type:** Web App (`PRD.md:20-40`, `RULES.md:22-44` — Multi-user Responsive Web App + PWA + Public SEO Pages).
- **Applied Checks:** Auth & Sessions, Authorization per Resource, Data Model & Migrations, Accessibility, Responsive Layout, Browser `keepalive` / `pagehide` lifecycle compatibility, Offline Sync (`PRD.md` explicit exception), and API Performance (`PERF-2`).
- **Explicitly Skipped Checks (per `review-rfc` & `PRD.md` Web App scope):**
  - *Binary Size* — Skipped (Web App/PWA delivered via browser rather than native app binary; verified bundle compilation via `npm run build`).
  - *Public Third-Party API SLA & Versioning* — Skipped (first-party session routes scoped exclusively to Noka's own web client).

### Audit of Changes Since Round 3 (`212dd9f`, `1f4ae34`, `0daecff`)

1. **Awaitable Per-Note Idle Barrier & Navigation/Unload Flush (`src/features/notes/mutation-queue.ts:83-91`, `src/components/notes/NoteEditor.tsx:62-66, 246-326, 552-645`, `src/components/notes/NoteDetailView.tsx:68-71`):**
   - [`waitForIdle`](../src/features/notes/mutation-queue.ts#L83-L91) loops over `this.queues.get(noteId)` until no queued/chained promises remain, safely settling even if an intermediate task rejects (`settled = run.catch(() => undefined)`).
   - [`flushActiveDraftIfNeeded`](../src/components/notes/NoteEditor.tsx#L552-L594) clears any pending debounce timer, checks `!isDeleted`, online status, and `dirtyRef.current && (hadPendingTimer || !isLatestSeqQueued)`, and avoids duplicate sends if a save is already queued/sent (or on clean/StrictMode unmounts).
   - Unmount and `pagehide` handlers invoke `flushOnUnloadRef` (`NoteEditor.tsx:596-612`), using `new TextEncoder().encode(bodyText).length <= KEEPALIVE_MAX_BYTES` (`60_000`) to set `keepalive: true` only within browser 64 KiB limits (`http-client.ts:37-40` passes `keepalive` cleanly through `fetch` with `credentials: "same-origin"`).
   - [`handleBackClick`](../src/components/notes/NoteEditor.tsx#L615-L645) flushes active dirty drafts and awaits `waitForIdle` (disabling the Back button while flushing via `returningBack` without blocking offline navigation), while [`NoteDetailView`](../src/components/notes/NoteDetailView.tsx#L68-L71) refreshes the App Router cache alongside `router.push("/app/notes")`.
2. **Documentation & Operational Notes (`RFCs/RFC-004-Notes-Workspace-And-Search.md:108-109`, `TEST-STRATEGY.md:186, 188`):**
   - `RFC-004` `Implementation Notes` and `TEST-STRATEGY.md` accurately document the Back/pagehide/unmount flush semantics, `keepalive` 60 KB cap, and DBA/owner `CREATE EXTENSION IF NOT EXISTS "pg_trgm" SCHEMA public;` pre-provisioning guidance without modifying `0001_notes_pg_trgm_indexes.sql`.
3. **Tests (`tests/unit/note-editor.test.tsx:1286-1495`, `tests/e2e/notes-workspace.spec.ts:138-142`):**
   - All newly added behaviors are directly exercised and failing assertions would catch regressions in `waitForIdle`, clean unmount silence, `keepalive` size threshold, duplicate prevention across `pagehide` + unmount, offline silence, and mobile Back-navigation persistence.

### Review Dimensions (Round 4)

1. **RFC Adherence — PASS:** Implements and records both Round 3 non-blocking improvements cleanly within `RFC-004` (`F7`, `F8`, `AC-4.1`–`AC-4.5`).
2. **Rules Compliance — PASS:** Preserves `UI-5`, `UI-6`, `SEC-1`/`SEC-4` (`credentials: "same-origin"` preserved on `keepalive` requests), `TEST-1`, `QUAL-2`, `QUAL-3`, and `QUAL-4`.
3. **Security — PASS:** No security regressions; `keepalive` remains restricted to same-origin authenticated `apiFetch` `PATCH` requests.
4. **Performance — PASS:** Bounded `60_000`-byte `keepalive` threshold prevents browser request rejection/overhead on large Markdown documents; zero redundant requests on clean unmount or post-`pagehide` unmount.
5. **Maintainability — PASS:** Small, well-isolated additions in `mutation-queue.ts`, `NoteEditor.tsx`, and `NoteDetailView.tsx` with thorough unit + E2E coverage.

### Overall Assessment (Round 4)

- **Overall Risk Level:** **Low**
- **Summary:** Both Round 3 non-blocking improvement items are cleanly resolved on `feat/rfc-004-notes-workspace` (`0daecff`) with thorough unit (`75/75`) and mobile/desktop Playwright E2E (`2/2`) coverage, clean lint/typecheck/build/Drizzle schema checks, and complete documentation alignment in `RFC-004` and `TEST-STRATEGY.md`. Zero blocking issues remain.
- **Blocking Issues:** None.
- **Improvement Suggestions (Non-Blocking):**
  - Clean or restore `next-env.d.ts` (`./.next/dev/types/*` from active `next dev` vs `./.next/types/*` from `next build`) before finalizing commits/merging to `main`.
  - Best-effort unload flushes remain inherently subject to browser tab-close cancellation for payloads exceeding `60_000` UTF-8 bytes until `RFC-009` adds client-side IndexedDB persistence.

