# Change Request 003: Penyelarasan Dua Arah Kontrak API, DTO, Error Code, LWW & Helper Notes (`RFC-004`)

- **Tanggal:** 2026-11-12
- **Status:** Approved & Integrated (`RFC-004`, `TEST-STRATEGY.md`, kode & suite uji `RFC-004`; `RFCS.md` tetap `Changes requested` menunggu tindak lanjut temuan implementasi lain di `/implement-rfc 004`)
- **Lingkup:** Kontrak API, tipe DTO, kode error i18n, semantik konflik LWW, validasi skema, helper checklist/route, komponen UI catatan, dan rencana uji `RFC-004` (*Blocking Issue #4* pada `reviews/REVIEW-RFC-004.md`)

---

## Ringkasan Evaluasi (*Executive Summary*)

Audit `reviews/REVIEW-RFC-004.md` (*Blocking Issue #4*) menemukan *contract drift* dua arah antara spesifikasi `RFCs/RFC-004-Notes-Workspace-And-Search.md` dengan implementasi aktual di `src/features/notes/`, `src/app/api/`, `src/components/notes/`, `src/lib/i18n/`, serta ketidaksesuaian minor pada `TEST-STRATEGY.md`:

1. **Tambahan Aman yang Disahkan ke Spesifikasi (`RFC-004` & `TEST-STRATEGY.md`):**
   - Endpoint khusus **`PATCH /api/notes/[id]/checklist`** (`src/app/api/notes/[id]/checklist/route.ts`) untuk toggle item checklist GFM secara deterministik dengan idempotensi dan LWW.
   - Kapasitas konten & paginasi yang lebih realistis untuk Markdown/offline preview: `NOTE_CONTENT_MAX_LENGTH = 200_000` (naik dari `100_000`) dan `NOTE_LIST_DEFAULT_LIMIT = 50` (naik dari `30`, tetap `<= 100`).
   - Filter query `tagId?` (UUID) di `GET /api/notes` melengkapi filter `tag` (case-insensitive), serta pengayaan `NoteDto` (`tags: Array<{ id, name }>`, `checklistTotal`, `checklistCompleted`) dan `TagDto` (`createdAt`, `updatedAt`).
   - Formalisasi modul pembantu `src/features/notes/route-helpers.ts`, `src/components/notes/NoteDetailView.tsx`, ekspor [`parseChecklists`](../src/features/notes/checklist.ts) & [`toggleChecklistInMarkdown`](../src/features/notes/checklist.ts), tanda tangan [`registerNoteDeleteCleanup`](../src/features/notes/service.ts) (`NoteDeleteCleanupPayload`), serta kode error `FOLDER_NAME_EXISTS`, `NOTE_ALREADY_EXISTS`, `FOLDER_ALREADY_EXISTS`.
2. **Deviasi Kontrak yang Dikembalikan ke Standar `RFC-004` / `RFC-005` / `RFC-008` / `RFC-009`:**
   - Error `404` terpisah **`NOTE_NOT_FOUND`** dan **`FOLDER_NOT_FOUND`** (menggantikan `NOT_FOUND` generik) beserta kamus terlokalisasi ID/EN.
   - Nilai LWW seragam **`conflictResolved: "applied" | "server_newer"`** (menggantikan `"server_wins"` atau ketiadaan field pada `"applied"`).
   - Wrapper respons konsisten: `GET /api/notes` -> `{ items, nextCursor }` (menghapus `hasMore` & `initialHasMore`), `POST /api/notes` / `GET /api/notes/[id]` -> `{ note }`, `PATCH /api/notes/[id]` & `PATCH /api/notes/[id]/checklist` -> `{ note, conflictResolved }`, `POST /api/folders` -> `{ folder }`, `PATCH /api/folders/[id]` -> `{ folder, conflictResolved }`.
   - Literal filter catatan tanpa folder memakai **`folderId="none"`** (menggantikan `"unfiled"` di query API maupun `NotesWorkspace`).
   - `DELETE /api/folders/[id]` mengembalikan **`movedNotesCount`** & `conflictResolved: "applied"` saat terhapus, serta menghitung **`noteCount` aktif sebenarnya** (bukan `0`) saat `conflictResolved: "server_newer"`.
   - `tagListSchema` melakukan trim & membuang string kosong/spasi (`normalizeTagNames`) **sebelum** pengecekan batas `max(20)` sehingga `[""]` atau `["   "]` dinormalisasi bersih menjadi `[]`.
   - Memperbaiki penukaran label `TS-004-02` vs `TS-004-03` dan detail ekspektasi di `TEST-STRATEGY.md`, `tests/unit/note-editor.test.tsx`, serta `tests/integration/notes-folders-tags.test.ts`.

Perubahan **tidak mencakup** *Blocking Issue #1* (toggle checklist saat editor kotor & offline), *#2* (`NoteEditor` unmount saat filter aktif tidak lagi cocok), *#3* (paritas `checklist.ts` untuk blockquote berspasi > 1 & list bernomor non-1), dan *#5* (cakupan layout/E2E tambahan Playwright), yang tetap berada pada lingkup `/implement-rfc 004`. Oleh karena itu, status `RFC-004` pada `RFCS.md` tetap `Changes requested` dan suite `TS-004` di `TEST-STRATEGY.md` tetap `Proposed`.

---

## 1. Change Classification

| Butir | Kategori | Ukuran | Prioritas |
|---|---|---|---|
| **CR-003.A — Pengesahan `PATCH /api/notes/[id]/checklist`, Kapasitas `200_000` / Limit `50`, Filter `tagId`, Enriched `NoteDto`/`TagDto`, `route-helpers`, `NoteDetailView` & Cleanup Payload** | Technical Refinement & Additive Spec Alignment (`F7`, `F8`, `F9`) | Small–Medium | Should have |
| **CR-003.B — Pemulihan Kontrak Seragam (`NOTE_NOT_FOUND`/`FOLDER_NOT_FOUND`, `applied`/`server_newer`, `{ items, nextCursor }`, `{ note }`/`{ folder }`, `folderId="none"`, `movedNotesCount`, `noteCount`, Tag Trim-First)** | Bug / Contract Reconciliation (`F7`, `F8`, `API-1`, `DATA-4`, `DATA-6`) | Medium | Must have *(Audit Blocker #4)* |
| **CR-003.C — Sinkronisasi Label & Skenario `TS-004-01`–`TS-004-03`** | Test Specification Alignment (`TEST-1`, `QUAL-4`) | Small | Must have |

---

## 2. Impact Analysis

### A. Conflict Check (`RULES.md`, `PRD.md`, `FEATURES.md`, `PRD-REVIEW.md`)
- **`PRD.md` (`FR-4`, `FR-5`, `FR-6`, `NFR-1`, `NFR-6`) & `DEC-1`–`DEC-16`:** Tidak ada perubahan keputusan produk. Penyimpanan IDR `bigint`, isolasi auth, strategi *offline-first* (`idb` + outbox LWW), maupun batasan fitur v1.0 (`F1`–`F19` tanpa `F20`–`F31`) tetap utuh seratus persen.
- **`FEATURES.md`:** Seluruh ID permanen `F1`–`F31` tetap utuh tanpa penomoran ulang (`F7` Notes Workspace & Markdown, `F8` Organization & Search).
- **`RULES.md` (`QUAL-1`, `QUAL-4`, `API-1`–`API-3`, `API-5`, `DATA-4`, `DATA-6`, `SEC-1`, `SEC-7`, `I18N-1`):**
  - Memulihkan kepatuhan **`QUAL-1`** (*Order of Authority*) & **`QUAL-4`** dengan menghilangkan *contract drift* antara `RFC-004`, kode implementasi, dan `TEST-STRATEGY.md`.
  - **`API-1` & `API-3`:** Penyeragaman `{ items, nextCursor }`, `{ note }`/`{ folder }`, `conflictResolved: "applied" | "server_newer"`, dan `NOTE_NOT_FOUND`/`FOLDER_NOT_FOUND` memudahkan klien outbox generik di `RFC-009` tanpa percabangan khusus.
  - **`DATA-4` & `DATA-6`:** `DELETE /api/folders/[id]` sekarang melaporkan `movedNotesCount` eksplisit saat berhasil dan `noteCount` akurat saat kalah LWW (`server_newer`).
  - **`I18N-1`:** Kunci `errors.NOTE_NOT_FOUND` dan `errors.FOLDER_NOT_FOUND` ditambahkan pada [`Dictionary`](../src/lib/i18n/types.ts), [`id.ts`](../src/lib/i18n/dictionaries/id.ts), dan [`en.ts`](../src/lib/i18n/dictionaries/en.ts).

### B. Komponen, Fitur & RFC Terdampak
- **Artefak Kode & Uji `RFC-004` yang Diperbarui:**
  - `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/id.ts`, `src/lib/i18n/dictionaries/en.ts`
  - `src/features/notes/schemas.ts`, `src/features/notes/service.ts`
  - `src/app/api/notes/route.ts`, `src/app/api/notes/[id]/route.ts`, `src/app/api/folders/route.ts` *(memverifikasi `notes/[id]/checklist/route.ts` & `folders/[id]/route.ts` meneruskan struktur hasil baru dari `service.ts`)*
  - `src/app/(app)/app/notes/page.tsx`, `src/components/notes/NotesWorkspace.tsx`, `src/components/notes/NoteEditor.tsx`, `src/components/notes/FolderManagerModal.tsx`
  - `tests/unit/note-editor.test.tsx`, `tests/integration/notes-folders-tags.test.ts`
- **RFC Terkait & Hilir (`RFC-005`, `RFC-006`, `RFC-008`, `RFC-009`):**
  - **`RFC-005` (`F9` Lampiran Gambar):** Dokumen `RFC-005` dibiarkan tetap seperti adanya; penyesuaian kontrak dari `RFC-004` (`registerNoteDeleteCleanup((payload: NoteDeleteCleanupPayload) => Promise<void> | void)` pasca-commit dengan `{ userId, noteId, storageKeys }` serta prop `renderAttachmentsSlot`) dicatat di sini agar saat `/implement-rfc 005` dijalankan tidak bergantung pada penamaan awal (`cleanupNoteAttachments({ tx, ... })` / `attachmentsSlot`).
  - **`RFC-006` / `RFC-008` (`Linked Notes` & Quick Capture):** Pemulihan `NOTE_NOT_FOUND`, `{ note }` pada `GET/POST /api/notes`, serta `conflictResolved: "applied" | "server_newer"` selaras dengan desain `RFC-006`–`RFC-008` (slot UI memakai `renderLinkedTransactionsSlot` pada `NotesWorkspace`/`NoteEditor`).
  - **`RFC-009` (Offline-First & Outbox Sync):** Penyeragaman `"applied" | "server_newer"`, `{ note, conflictResolved }`, `{ folder, conflictResolved }`, dan `{ deleted, id, conflictResolved, ... }` memungkinkan `RFC-009` memakai resolver konflik outbox tunggal di seluruh modul *notes*, *folders*, dan *finance*.

---

## 3. Implementation Strategy

- **Penyelarasan Atomik pada Branch Fitur (`feat/rfc-004-notes-workspace`):**
  1. Memperbarui skema validasi, kamus i18n, layanan domain `service.ts`, route API `/api/notes/**` & `/api/folders/**`, serta konsumen React (`page.tsx`, `NotesWorkspace`, `NoteEditor`, `FolderManagerModal`) secara serentak agar *zero build breakage*.
  2. Memperbarui suite `tests/unit/note-editor.test.tsx` (label `TS-004-02`, payload wrapper & tanpa `initialHasMore`) dan `tests/integration/notes-folders-tags.test.ts` (label `TS-004-03`, `NOTE_NOT_FOUND`/`FOLDER_NOT_FOUND`, `folderId=none`, `items`/`nextCursor`, `movedNotesCount`, `noteCount` aktual pada `server_newer`, dan normalisasi tag string kosong).
  3. Memperbarui `RFCs/RFC-004-Notes-Workspace-And-Search.md`, `TEST-STRATEGY.md`, dan mencatat CR ini pada `changes/CHANGE-REQUEST-003.md`.
- **Verifikasi Wajib:** `npm run lint`, `npm run typecheck`, `npm test` (PostgreSQL integration + unit), `python .agents/skills/workflow-status/scripts/trace-check.py .`, dan clean production build `npm run build` tanpa env rahasia.

---

## 4. Documentation Updates

- `changes/CHANGE-REQUEST-003.md` — Dokumen evaluasi formal & catatan keputusan perubahan ini.
- `RFCs/RFC-004-Notes-Workspace-And-Search.md` — Memperbarui spesifikasi `Technical Approach`, `API Contracts Exposed`, `File Structure`, `AC-4.4` (`"applied" | "server_newer"`), serta `Implementation Notes` agar 100% akurat terhadap kontrak final.
- `TEST-STRATEGY.md` — Memperbarui rincian skenario `TS-004-01`, `TS-004-02`, dan `TS-004-03` sesuai penamaan fungsi & kontrak API final *(tetap berstatus `Proposed` hingga temuan lain di `REVIEW-RFC-004.md` diselesaikan)*.
- `PRD.md`, `FEATURES.md`, `RULES.md`, `RFCS.md` — Tidak diubah (keputusan, ID fitur, aturan teknis, dan status `Changes requested` pada `RFC-004` tetap akurat apa adanya).

---

## 5. Stakeholder Impact

- **Pengerjaan Lanjutan `/implement-rfc 004`:** Tidak lagi terbebani ketidakcocokan kontrak dokumen vs kode saat menyelesaikan *Blocking Issues #1, #2, #3, #5* pada `reviews/REVIEW-RFC-004.md`.
- **Pengembang `RFC-005` (`F9`):** Cukup mendaftarkan callback pada [`registerNoteDeleteCleanup`](../src/features/notes/service.ts) menerima `NoteDeleteCleanupPayload` (`{ userId, noteId, storageKeys }`) untuk menghapus objek R2/lokal setelah transaksi DB berhasil commit.
- **Pengembang `RFC-008` & `RFC-009`:** Dapat langsung mengandalkan amplop `{ items, nextCursor }`, `{ note, conflictResolved }`, `{ folder, conflictResolved }`, nilai `"applied" | "server_newer"`, `NOTE_NOT_FOUND` / `FOLDER_NOT_FOUND`, dan parameter `folderId="none"`.

---

## 6. Risk Assessment & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Pengembang `RFC-005`/`RFC-009` membaca asumsi kontrak lama (`"server_wins"`, flat DTO, `NOT_FOUND` generik, atau `"unfiled"`) | Sedang *(miskomunikasi integrasi lintas RFC)* | Seluruh kode server/klien, `RFC-004`, `TEST-STRATEGY.md`, dan suite tes diselaraskan serentak lalu diverifikasi lewat `tsc --noEmit` & tes integrasi DB nyata |
| Input tag `["", "   "]` gagal `422` sebelum normalisasi apabila `min(1)` dijalankan terlalu awal | Rendah *(UX edit tag tersendat)* | `tagListSchema` memvalidasi panjang maksimal `40` + trim per elemen terlebih dahulu, menjalankan `normalizeTagNames`, baru memvalidasi `.min(1).max(40)` serta batas `.max(20)` |
| Perubahan parsial memecahkan UI `NotesWorkspace`/`NoteEditor`/`FolderManagerModal` | Tinggi *(regresi runtime catatan)* | Seluruh penelepon UI diperbarui pada komit yang sama dan diuji melalui unit test komponen (`note-editor.test.tsx`) + build produksi penuh |
