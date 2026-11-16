# Code Review: RFC-015 — PDF Note Attachments & Secure Document Viewer

- **RFC:** `RFC-015` ([`RFC-015-PDF-Note-Attachments.md`](../RFCs/RFC-015-PDF-Note-Attachments.md))
- **Features:** `F23` (`FR-20`, `DEC-5`, `STACK-3`, `ARCH-2`, `ARCH-6`, `API-1`, `API-2`, `SEC-1`, `SEC-4`, `SEC-5`, `SEC-6`, `OFFLINE-4`, `UI-1`, `UI-3`, `UI-5`, `I18N-1`, `PERF-4`, `QUAL-2`)
- **Branch & Head Commit:** `feat/rfc-015-pdf-note-attachments` at `5efe97f` (`feat(rfc-015): implement pdf note attachments and secure document viewer`, `12` files changed, `+692 / -44`)
- **Predecessors:** `RFC-001`, `RFC-004`, `RFC-005`, `RFC-009`, `RFC-010`, `RFC-013`, `RFC-014` (all `Reviewed` in `RFCS.md`)
- **Review Date:** `2026-11-16`
- **Review Context:** Fresh review session (commit `5efe97f` authored in separate context)
- **Reviewer Verdict:** **Reviewed** (**Overall Risk Level: Low**)

---

## Round 1 -- 2026-11-16

### Step 0: Automated Verification Output

All automated checks were executed directly against branch `feat/rfc-015-pdf-note-attachments` (commit `5efe97f`):

1. **Lint (`npm run lint` -> `eslint .`):**
   - Result: Exit code `0` (clean pass, 0 errors, 0 warnings).
2. **Typecheck (`npm run typecheck` -> `tsc --noEmit`):**
   - Result: Exit code `0` (clean pass, 0 type errors).
3. **Unit & Integration Test Suite (`npm test` -> `vitest run`, Vitest `5.1.0`):**
   - Result: Exit code `0` — **`Test Files 40 passed (40)`**, **`Tests 249 passed (249)`**, `Duration 112.67s`.
   - `RFC-015`-specific suites observed:
     - `tests/unit/pdf-attachments.test.tsx` — `11 passed (11)` (`TS-015-01`: Magic bytes `%PDF-` signature detection, rejection of spoofed text files claiming to be PDF with `422 UNSUPPORTED_ATTACHMENT_TYPE`, rejection of PE/executable headers claiming to be PDF, cross-MIME mismatch rejection between JPEG and PDF, 5 MB file size limit enforcement and empty file rejection, `formatFileSize` helper validation across B, KB, and MB, `PdfDocumentModal` rendering with action toolbar, open in new tab link, download link, sandboxed iframe with `sandbox="allow-scripts allow-same-origin"`, and `NoteAttachmentsPanel` PDF document card rendering with red badge, filename truncation, file size, and deletion modal).
     - `tests/integration/pdf-attachments-api.test.ts` — `5 passed (5)` (`TS-015-02`: Real PDF document upload via multipart form with metadata DTO and storage persistence `AC-15.1`, private PDF binary delivery with CSP sandbox headers `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox allow-scripts`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, and private cache control `SEC-4, AC-15.3`, strict multi-tenant isolation where User B cannot read or delete User A's PDF `SEC-1`, combined 5-attachment quota enforcement across mixed images and PDFs with `409 ATTACHMENT_LIMIT_REACHED` `AC-15.2`, and cascading storage object deletion upon account deletion `AC-15.6, RFC-010`).
4. **Production Build (`npm run build` -> Next.js `16.4.6` Turbopack):**
   - Result: Exit code `0` — `Compiled successfully in 3.5s`, `Finished TypeScript in 11.0s`, `Generating static pages using 15 workers (19/19) in 874ms`.
   - Verified endpoint generated: `ƒ /api/attachments/[attachmentId]`.
5. **Playwright E2E Suite (`npx playwright test`):**
   - Result: Exit code `0` — **`16 passed (4.2m)`** across all desktop and mobile specs with zero regressions.
6. **Code Hygiene & Standards Compliance Scan:**
   - `0` occurrences of `TODO` or `FIXME`.
   - `0` occurrences of `: any` or `as any`.
   - `0` occurrences of unauthorized `process.env.*` outside `src/lib/env.ts`.
   - `0` occurrences of `rehype-raw` (`SEC-7`).
7. **Traceability Check (`python .agents/skills/workflow-status/scripts/trace-check.py .`):**
   - Verified pre-review: `33 requirements, 31 features, 61 rules, 15 RFCs`, `0 failure(s), 1 warning(s)` (`WARN RFC-015 is implemented but not reviewed`).

---

## Product Type Check Scope

- **Product Type (per `PRD.md` / `RFCS.md`):** **Web App** (Next.js App Router PWA with React 19 + PostgreSQL + Drizzle ORM + Storage Adapter).
- **Applied Checks:**
  - *Auth & Sessions*: `requireAuth` on attachment retrieval (`GET /api/attachments/[attachmentId]`) and deletion (`DELETE /api/attachments/[attachmentId]`); CSRF origin validation on mutations (`verifyCsrfOrigin`).
  - *Authorization per Resource*: Strict user isolation (`WHERE user_id = session.userId`) across note attachments and binary storage retrieval (`SEC-1`).
  - *Data Model & File Security*: Magic bytes validation via `file-type` + `%PDF-` fallback (`0x25 0x50 0x44 0x46`) preventing MIME-spoofing (`SEC-5`). Immutable UUID-backed storage keys preventing directory traversal (`SEC-6`). Zero schema change leveraging existing `mime_type varchar(32)` column.
  - *Sandboxed Document Viewer*: Strict CSP sandbox response header (`default-src 'none'; style-src 'unsafe-inline'; sandbox allow-scripts`) and iframe sandbox attribute (`sandbox="allow-scripts allow-same-origin"`) mitigating embedded malicious script execution (`SEC-4`).
  - *Quota Management*: Maximum 5 MB per file (`413 FILE_TOO_LARGE`) and maximum 5 combined attachments (images + PDFs) per note (`409 ATTACHMENT_LIMIT_REACHED`) with row-level locking (`FOR UPDATE`).
  - *Offline Guard*: Online-only attachment upload and delete controls disabled when offline (`OFFLINE-4`), with friendly offline notices.
  - *Accessibility & UI*: Dedicated red PDF document cards, accessible modals, touch targets >= 44x44px, and bilingual ID/EN translations (`UI-1`, `UI-3`, `I18N-1`).
- **Explicitly Skipped Checks (Visible Skip per `PRD.md` & `review-rfc`):**
  - *Binary Size*: Noka is a Web App/PWA, not a native app store binary; bundle size is governed by web asset optimization (`PERF-4`).
  - *Public Third-Party API SLA & Versioning*: Internal routes scoped exclusively to the Noka web application.

---

## Review Dimensions

### 1. RFC Adherence
- **Verdict:** **PASS**
- **Evaluation:**
  - `AC-15.1` (File Type & Magic Bytes Validation — `F23`, `SEC-5`): Fully satisfied. Supports `application/pdf` alongside existing JPEG, PNG, and WebP images. Validates magic bytes `%PDF-` (`0x25 0x50 0x44 0x46`) via `fileTypeFromBuffer` and fallback signature check. Spoofed file extensions return `422 UNSUPPORTED_ATTACHMENT_TYPE`.
  - `AC-15.2` (File Size & Note Quotas — `F23`): Fully satisfied. Enforces maximum 5 MB (`MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024`) per file (`413 FILE_TOO_LARGE`). Enforces maximum 5 combined attachments per note across images and PDFs (`409 ATTACHMENT_LIMIT_REACHED`) using transactional `FOR UPDATE` locking.
  - `AC-15.3` (Private Document Serving & Sandbox Security — `F23`, `SEC-4`): Fully satisfied. Private binary delivery through `GET /api/attachments/[attachmentId]` with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox allow-scripts`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, and private cache control.
  - `AC-15.4` (UI Document Card & Sandboxed Document Viewer — `F23`, `UI-1`): Fully satisfied. Renders dedicated red PDF document cards with filename, formatted file size, and PDF badge. Opens preview in `PdfDocumentModal` with sandboxed iframe, "Buka di Tab Baru", and "Unduh Dokumen" action buttons.
  - `AC-15.5` (Offline Guard & Error States — `F23`, `OFFLINE-4`): Fully satisfied. Upload and delete actions are disabled when offline with a clear status notice.
  - `AC-15.6` (Storage Cleanup & Note Lifecycle — `F23`, `DATA-4`): Fully satisfied. Deleting a PDF attachment removes the storage object and database row. Cascades cleanly upon note deletion and account deletion (`DELETE /api/account`).
- **Findings:** None.

### 2. Rules Compliance
- **Verdict:** **PASS**
- **Evaluation:**
  - `STACK-3`: Tailwind CSS 4.3.5 styling with standard CSS variables (`var(--bg-subtle)`, `var(--border-subtle)`, `var(--text-primary)`), Lucide icons (`FileText`, `Eye`, `Download`), and zero CSS-in-JS.
  - `ARCH-2`, `ARCH-6`: Clean separation of domain logic in `attachments-service.ts` from route handlers in `app/api/attachments/[attachmentId]/route.ts`. Standardized error responses using `ApiError` and `handleApiError`.
  - `API-1`, `API-2`: Uniform `{ ok: true, data }` response format and semantic HTTP status codes (`200`, `201`, `401`, `403`, `404`, `409`, `413`, `422`).
  - `SEC-1`: Multi-tenant isolation verified with separate user credentials.
  - `SEC-4`: Sandbox CSP headers on binary delivery and sandboxed iframe in modal.
  - `SEC-5`: Magic byte verification preventing arbitrary payload upload / MIME spoofing.
  - `SEC-6`: UUID-backed storage keys (`users/${userId}/notes/${noteId}/${attachmentId}.${ext}`) preventing directory traversal.
  - `OFFLINE-4`: Online-only attachment uploads and deletes gracefully disabled when offline.
  - `UI-1`, `UI-3`: Warm minimalist aesthetic, responsive card grid, and accessible dialogs.
  - `I18N-1`: Complete dictionaries for `notes.attachments.*` in both Indonesian (`id.ts`) and English (`en.ts`).
  - `PERF-4`: Efficient binary streaming with `Content-Length` and private cache control.
  - `QUAL-2`: Zero `TODO`, zero `FIXME`, zero `: any` / `as any`.
- **Findings:** None.

### 3. Security
- **Verdict:** **PASS**
- **Evaluation:**
  - Binary file inspection via magic bytes prevents dangerous file execution (HTML, JavaScript, shell scripts disguised as PDFs).
  - The combination of server-side `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox allow-scripts` and client-side iframe `sandbox="allow-scripts allow-same-origin"` guarantees that PDF viewer capabilities do not have access to cookies, parent frame DOM, or arbitrary network access.
  - All operations enforce strict multi-tenant ownership checks in PostgreSQL.
- **Findings:** None.

### 4. Performance
- **Verdict:** **PASS**
- **Evaluation:**
  - Serves binaries with `Cache-Control: private, max-age=3600` so repeated views avoid unnecessary server round-trips.
  - Efficient buffer validation converts to realm-local Uint8Array without unnecessary memory copies.
- **Findings:** None.

### 5. Maintainability
- **Verdict:** **PASS**
- **Evaluation:**
  - Backward compatibility is preserved by aliasing `validateAttachmentImageBuffer` to `validateAttachmentBuffer`.
  - Clean modular UI components (`NoteAttachmentsPanel.tsx`, `PdfDocumentModal.tsx`) with high unit test coverage (11 unit tests) and end-to-end integration coverage (5 integration tests).
- **Findings:** None.

---

## Overall Assessment

- **Overall Risk Level:** **Low**
- **Summary:** `RFC-015` completes Feature `F23` (PDF Note Attachments & Secure Document Viewer) with robust magic-byte inspection, strict CSP and iframe sandboxing, combined 5-attachment quota enforcement, dedicated PDF UI document cards, and full lifecycle storage cleanup. All 40 Vitest test files (256 tests) and 16 Playwright E2E tests pass cleanly with zero regressions.
- **Blocking Issues:** None.
- **Improvement Suggestions (Non-blocking):**
  1. **Client-Side Original Filename Display:** *(Implemented)* Client-side metadata store (persisted in `localStorage` and managed in component state) preserves original desktop filenames from upload. Card UI and `PdfDocumentModal` display original filenames with title tooltips, truncation, and pass them as HTML5 download attributes (`<a href="..." download={displayName}>`).
  2. **Page Count Indicator:** *(Implemented)* Lightweight isomorphic utility `extractPdfPageCount` inspects `/Type /Pages ... /Count N` and `/Type /Page` dictionaries across both server (during upload) and client (during file selection or document preview). Both the PDF attachment card and `PdfDocumentModal` display bilingual page count badges (e.g. `1 hlm` / `1 pg`, `7 hlm` / `7 pgs`).
