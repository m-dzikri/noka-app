# RFC-004: Notes Workspace — Markdown, GFM Checklists, Folders, Tags & Instant Search

**Features**: F7, F8
**Depends on**: RFC-001, RFC-002
**Rules**: ARCH-1, ARCH-2, ARCH-4, ARCH-5, DATA-4, DATA-6, API-1, API-2, API-3, API-5, SEC-1, SEC-4, SEC-7, UI-3, UI-5, UI-6, I18N-1, PERF-2, TEST-1, TEST-3, QUAL-2, QUAL-3
**Complexity**: Medium

---

## Summary

Membangun ruang kerja **Catatan (*Notes*)** pada `/app/notes` dan `/app/notes/[id]` (`F7`, `F8`), memperbarui redirect pasca-login `/app`, `/login`, dan `/register` ke `/app/notes` (`RFC-001`, `RFC-002`), menyediakan *debounced auto-save* (`600 ms`), renderer Markdown aman via `react-markdown@10.1.0` + `remark-gfm@4.0.1` (`SEC-7`), toggle checklist GFM 1:1 selaras `remark-gfm`, Pin catatan, manajemen Folder (`folderId = null` saat folder dihapus), manajemen Tag bertombstone `deletedAt` (`DATA-6`), pencarian instan (`title` + `content` + `tags`) berpaginasi keyset (`limit <= 100`), serta `withIdempotency` + `resolveLwwTimestamp` dari `src/lib/idempotency.ts` (`RFC-001`).

---

## Technical Approach

### 1. Deterministic GFM Checklist Toggle & Safe Markdown (`F7`, `SEC-7`, `DEC-14`)
- `src/features/notes/checklist.ts` (`toggleMarkdownChecklistItem(markdown: string, taskIndex: number): string`):
  - Menormalisasi newline sementara (`\r\n` -> `\n`) dan memulihkan gaya akhir baris asli.
  - Melacak blok kode *fenced* panjang variabel (pembuka ```` ``` ````/`~~~` min. 3 hanya ditutup karakter sama panjang `>= N`), sehingga checklist di dalam code block diabaikan.
  - Memakai pola regex **selaras `remark-gfm@4.0.1`** yang mensyaratkan minimal 1 spasi setelah `]` (`^(\s*(?:>\s*)*(?:[-*+]|\d+\.)\s+\[)([ xX])(\](?:\s.*))$`) sehingga indeks ke-`taskIndex` selalu cocok 1:1 dengan elemen `<input type="checkbox">` yang dirender `MarkdownPreview`! Jika `taskIndex` di luar rentang, mengembalikan string asli.
- `MarkdownPreview.tsx`: props `{ content: string; onToggleChecklist?: (taskIndex: number) => void }`:
  - Memakai `react-markdown@10.1.0` + `remark-gfm@4.0.1` **tanpa `rehype-raw`**.
  - Custom `urlTransform`: hanya mengizinkan `http:`, `https:`, `mailto:`, fragment `#...`, atau relative path `/` yang **tidak** diawali `//` (`url.startsWith("/") && !url.startsWith("//")`), menolak `javascript:`, `data:`, `vbscript:`, dan protocol-relative URL (`//evil.com`).
  - Custom renderer `input` (`type="checkbox"`): menghitung urutan checkbox rendered secara deterministik, menghapus atribut `disabled` bila `onToggleChecklist` ada, dan memicu `onToggleChecklist(index)` pada klik/Spasi agar aksesibel via keyboard (`UI-5`).

### 2. Referential Integrity, Orphan Tags Soft-Delete & Cleanup Hook (`F8`, `DATA-4`, `DATA-6`, `HIGH-3`)
- **Soft-delete & Cleanup Hook (`service.ts`)**:
  - `folders`, `notes`, dan `tags` seluruhnya memakai tombstone `deletedAt` (`deleted_at IS NULL` pada seluruh query aktif).
  - Ekspor registry ringan `registerNoteDeleteCleanup(fn: (ctx: { tx: DbOrTx; noteId: string; userId: string }) => Promise<(() => Promise<void>) | void>)` di `src/features/notes/service.ts` sehingga `RFC-005` dapat menjalankan penghapusan DB dalam `tx` dan mengembalikan callback pembersihan objek storage yang dieksekusi oleh `service.ts` **hanya setelah transaksi commit** (`deleted === true`), tanpa meninggalkan stub kosong (`QUAL-2`).
- **Hapus Folder (`DELETE /api/folders/[id]`)**: Dalam `db.transaction`:
  - Verifikasi kepemilikan aktif (`404 FOLDER_NOT_FOUND`), jalankan LWW (`resolveLwwTimestamp`), lalu bila diterapkan: set `UPDATE notes SET folder_id = NULL, updated_at = NOW() WHERE user_id = userId AND folder_id = folderId AND deleted_at IS NULL` (`movedNotesCount`), dan set `folders.deletedAt = NOW(), updatedAt = nextUpdatedAt`.
- **Hapus Catatan (`DELETE /api/notes/[id]`)**: Dalam `db.transaction` (dan sesudah commit):
  - Verifikasi note aktif milik `userId` (`404 NOTE_NOT_FOUND`), jalankan LWW (`resolveLwwTimestamp`), lalu bila diterapkan:
    1. Set `UPDATE transactions SET note_id = NULL, updated_at = NOW() WHERE user_id = userId AND note_id = noteId` (`DATA-4`).
    2. Panggil registered note-delete cleanup hooks dan kumpulkan callback pasca-commit yang dikembalikan (`RFC-005`).
    3. Hapus `note_tags` untuk `noteId`, soft-delete baris `tags` milik `userId` yang tidak lagi punya relasi ke catatan aktif mana pun (`SET deleted_at = NOW(), updated_at = NOW()`), lalu set `notes.deletedAt = NOW(), updatedAt = nextUpdatedAt`.
  - Setelah transaksi DB commit (`deleted === true` dan bukan idempotency replay / `server_newer`), jalankan seluruh callback pasca-commit yang terkumpul.
- **Normalisasi & Soft-Delete Tags**: Pada `POST`/`PATCH /api/notes`, normalisasi input `tags?: string[]` **sebelum** cek batas `max(20)`: trim tiap elemen, buang string kosong, deduplikasi case-insensitive (pertahankan kemunculan pertama), lalu validasi setiap tag `1..40` char dan total `<= 20` (`422 VALIDATION_ERROR`). Upsert tag aktif (jika ada tag bertombstone `deletedAt IS NOT NULL` dengan `lower(name)` sama, reaktifkan `deletedAt = null, name = newName, updatedAt = NOW()`); pada `PATCH`, bila `tags` diubah, bersihkan `tags` yatim milik `userId` dengan menyetel `deletedAt = NOW(), updatedAt = NOW()` (`GET /api/tags` mengembalikan tag dengan `noteCount > 0` urut `noteCount DESC, name ASC`).

### 3. Uniform Idempotency (`API-3`), LWW (`DATA-6`) & Instant Search (`API-5`)
- Memakai `withIdempotency({ userId, idempotencyKey, method, path, payload, handler })` dan `resolveLwwTimestamp(row.updatedAt, clientUpdatedAt)` dari `src/lib/idempotency.ts` (`RFC-001`):
  - **Validasi parameter route (`API-2`)**: `[id]` wajib divalidasi sebagai UUID v4/standard (`422 VALIDATION_ERROR`, mencegah PG `22P02` `500`).
  - `POST /api/notes` dan `POST /api/folders`: menerima `Idempotency-Key` (header atau field body opsional `idempotencyKey`, dihapus sebelum hashing), `id?` UUID opsional (`23505` tanpa key -> `409 RESOURCE_ALREADY_EXISTS`), dan `updatedAt?` opsional (di-clamp `<= serverNow + 60_000 ms`). Tidak memakai LWW pada `POST`.
  - `PATCH` dan `DELETE` pada `/api/notes/[id]` & `/api/folders/[id]`: mendukung `Idempotency-Key` dan LWW `updatedAt`. Pada `DELETE`, body HTTP kosong dianggap `{}` (bukan `400 INVALID_JSON`); bila `serverNewer === true`, kembalikan `200` `{ deleted: false, id, note/folder, conflictResolved: "server_newer" }` tanpa menghapus row!
- **Instant Search (`GET /api/notes`)**:
  - `q` mengeksekusi escape wildcard PostgreSQL `ILIKE` (`%`, `_`, `\`) yang mencocokkan **`notes.title` OR `notes.content` OR `tags.name`** (pada tag terhubung aktif, memenuhi `FR-5`/`F8`). Mendukung filter `folderId` (`"none"` = `IS NULL`, atau UUID), `tag` (case-insensitive exact match), `pinned` (`"true"` | `"false"`), `limit` (`1..100`, default `30`), dan cursor keyset base64url `{ p, u, i }` (`ORDER BY is_pinned DESC, updated_at DESC, id DESC`, malformed -> `400 INVALID_CURSOR`).

---

## API Contracts Exposed

Semua route memakai amplop `API-1` (`apiOk`/`apiError`/`handleApiError`), `requireAuth`, `verifyCsrfOrigin` pada mutasi, validasi UUID param (`422`), `400 INVALID_JSON`, dan Zod validation (`422 VALIDATION_ERROR`):
- `GET /api/notes` — `{ q?, folderId?, tag?, pinned?, limit?, cursor? }` -> `200` `{ items: NoteDto[], nextCursor: string | null }`. (`NoteDto`: `{ id, folderId, folderName, title, content, isPinned, tags: string[], createdAt, updatedAt }`).
- `POST /api/notes` — `{ id?, idempotencyKey?, title?: max 200, content?: max 100000 default "", folderId?: uuid | null, isPinned?: boolean, tags?: string[], updatedAt? }` -> `201` `{ note: NoteDto }` | `404 FOLDER_NOT_FOUND` | `409 IDEMPOTENCY_KEY_CONFLICT` / `RESOURCE_ALREADY_EXISTS`.
- `GET /api/notes/[id]` -> `200` `{ note: NoteDto }` | `404 NOTE_NOT_FOUND`.
- `PATCH /api/notes/[id]` — `{ idempotencyKey?, title?, content?, folderId?: uuid | null, isPinned?, tags?, updatedAt? }` -> `200` `{ note: NoteDto, conflictResolved: "applied" | "server_newer" }` | `404`.
- `DELETE /api/notes/[id]` — body opsional `{ idempotencyKey?, updatedAt? }` -> `200` `{ deleted: true, id, conflictResolved: "applied" }` atau `{ deleted: false, id, note, conflictResolved: "server_newer" }` | `404`.
- `GET /api/folders` -> `200` `{ folders: FolderDto[] }` (`{ id, name, noteCount, createdAt, updatedAt }`, urut `name ASC`).
- `POST /api/folders` — `{ id?, idempotencyKey?, name: 1..80, updatedAt? }` -> `201` `{ folder }` | `409 FOLDER_ALREADY_EXISTS`.
- `PATCH /api/folders/[id]` — `{ idempotencyKey?, name, updatedAt? }` -> `200` `{ folder, conflictResolved }` | `404` | `409 FOLDER_ALREADY_EXISTS` (self-rename case-insensitive -> `200`).
- `DELETE /api/folders/[id]` — body opsional `{ idempotencyKey?, updatedAt? }` -> `200` `{ deleted: true, id, movedNotesCount, conflictResolved: "applied" }` atau `{ deleted: false, id, folder, conflictResolved: "server_newer" }` | `404`.
- `GET /api/tags` -> `200` `{ tags: Array<{ id, name, noteCount }> }`.

---

## Implementation Details

### File Structure
- `src/features/notes/schemas.ts`, `src/features/notes/checklist.ts`, `src/features/notes/service.ts` (memakai ulang `src/lib/idempotency.ts` dari `RFC-001`)
- `src/app/api/notes/route.ts`, `src/app/api/notes/[id]/route.ts`, `src/app/api/folders/route.ts`, `src/app/api/folders/[id]/route.ts`, `src/app/api/tags/route.ts`
- `src/components/notes/NotesWorkspace.tsx` (`{ initialNotes, initialNextCursor, initialFolders, initialTags, renderAttachmentsSlot?, renderLinkedTransactionsSlot? }`: split view `>= 1024px` + daftar mobile `< 1024px` ke `/app/notes/[id]`, empty state, filter Folder/*Tanpa Folder*/Tag/Pin, debounced search `180 ms`, tombol **Load More**, tombol **Catatan Baru** langsung memanggil `POST /api/notes`)
- `src/components/notes/NoteEditor.tsx` (`{ initialNote, folders, attachmentsSlot?, linkedTransactionsSlot?, onSaveNote?: (id, patch) => Promise<{ note: NoteDto; syncStatus: "saved" | "pendingSync" }>, onDeleteNote?: (id) => Promise<void> }`: toolbar Markdown, mode Edit/Preview/Split, debounced auto-save `600 ms`, kontrol **Pin** `aria-pressed`, pemilih **Folder**, input chip **Tags**, badge status `saved`/`saving`/`pendingSync`/`error`, dialog konfirmasi hapus `Modal`)
- `src/components/notes/MarkdownPreview.tsx`, `src/components/notes/FolderManagerModal.tsx`
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/{id,en}.ts` (menambahkan namespace `notes` dan `folders`)
- `src/app/(app)/app/page.tsx` (redirect ke `/app/notes`), `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/components/auth/LoginForm.tsx`, `src/components/auth/RegisterForm.tsx` (diperbarui redirect ke `/app/notes`), `src/app/(app)/app/notes/page.tsx`, `src/app/(app)/app/notes/[id]/page.tsx`
- `tests/unit/notes-checklist-markdown.test.ts`, `tests/unit/note-editor.test.tsx`, `tests/integration/notes-folders-tags.test.ts`

---

## Acceptance Criteria

- [ ] **AC-4.1 (Notes CRUD, Lifecycle, Navigation & Auto-Save — `F7`, `F8`, `UI-6`, `I18N-1`):** `service.ts` dan `/api/notes/**` mendukung CRUD lengkap; `/app`, `/login`, `/register` (saat auth/pasca-submit di `LoginForm`/`RegisterForm`) mengarahkan ke `/app/notes`; desktop (`>= 1024px`) `/app/notes` menampilkan split view (daftar + empty state + `renderAttachmentsSlot`/`renderLinkedTransactionsSlot`) & mobile (`< 1024px`) menavigasi ke `/app/notes/[id]`; tombol **Catatan Baru** langsung membuat catatan ber-UUID; `NotesWorkspace` menyediakan **Load More**; `NoteEditor` menampilkan toolbar Markdown, mode Edit/Preview/Split, debounced auto-save `600 ms` (`onSaveNote`), badge status terlokalisasi (`notes.*`, `folders.*` di `types.ts`/`id.ts`/`en.ts`), kontrol **Pin** (`aria-pressed`), pemilih **Folder**, editor **Tags**, dan dialog konfirmasi hapus (`onDeleteNote`).
- [ ] **AC-4.2 (Markdown Aman & Toggle Checklist 1:1 — `F7`, `SEC-7`, `UI-5`):** `MarkdownPreview` (`{ content, onToggleChecklist }`) memakai `react-markdown@10.1.0` + `remark-gfm@4.0.1` tanpa `rehype-raw`, memblokir `javascript:`/`data:`/`//` protocol-relative URL, serta merender checkbox interaktif keyboard-accessible; `toggleMarkdownChecklistItem()` selaras 1:1 dengan aturan spasi `remark-gfm`, mengabaikan fenced code block panjang variabel, dan mendukung CRLF/indentasi/blockquote.
- [ ] **AC-4.3 (Search Lintas Title/Content/Tags, Folders & Soft-Deleted Tags — `F8`, `DATA-4`, `DATA-6`, `API-5`, `PERF-2`):** `NotesWorkspace` (debounce `180 ms`) dan `GET /api/notes` mencari di `title`, `content`, dan `tags.name` (escape wildcard `ILIKE`), menyaring `folderId`/`tag`/`pinned`, mengurutkan `isPinned DESC, updatedAt DESC, id DESC` dengan cursor keyset base64url (`400 INVALID_CURSOR`, `limit <= 100`); `FolderManagerModal` & `/api/folders/**` menolak duplikat (`409`, kecuali self-rename) dan memindah catatan ke `null` saat hapus; `tags` mendukung normalisasi trim/dedup sebelum `max(20)` + reaktivasi soft-delete + cleanup yatim saat `PATCH`/`DELETE` catatan (`GET /api/tags` hanya `noteCount > 0`).
- [ ] **AC-4.4 (Isolasi `userId`, Idempotensi & LWW — `SEC-1`, `SEC-4`, `API-1`–`API-3`, `DATA-4`, `DATA-6`):** Semua route memakai amplop `API-1`, memvalidasi UUID param & body via `schemas.ts` (`422`), `400 INVALID_JSON`, auth (`401`), CSRF (`403`), menolak akses lintas user pada `GET/PATCH/DELETE /api/notes/[id]` & `PATCH/DELETE /api/folders/[id]` + `folderId` asing (`404`), mendukung `Idempotency-Key` (`withIdempotency`, `409 IDEMPOTENCY_KEY_CONFLICT`) pada semua mutasi `POST`/`PATCH`/`DELETE`, menerapkan LWW (`resolveLwwTimestamp`: `applied` vs `server_newer` termasuk empty-body `DELETE` `deleted: false`), dan `DELETE /api/notes/[id]` menyetel `transactions.note_id = NULL` serta menjalankan registered note cleanup hooks.
- [ ] **AC-4.5 (Responsive & Tests — `ARCH-1`, `ARCH-2`, `UI-3`, `TEST-1`, `TEST-3`, `QUAL-2`, `QUAL-3`):** Bebas overflow di `360px`/`768px`/`1280px`; `tests/unit/notes-checklist-markdown.test.ts`, `tests/unit/note-editor.test.tsx`, dan `tests/integration/notes-folders-tags.test.ts` lulus penuh bersama `npm run lint` dan `npm run typecheck`.

---

## Implementation Considerations

- **Visual System (`CHANGE-REQUEST-002`, `UI-1`–`UI-3`):** `NotesWorkspace`, `NoteEditor`, `MarkdownPreview`, dan `FolderManagerModal` berjalan di dalam kontainer `max-w-[1360px]` `AppShell` dengan token palet hangat `#ededed` / `#222222` / `#ff7448` (off-white/off-black tanpa `#ffffff`/`#000000` murni), kontrol `rounded-full`/`rounded-2xl`, `--border-default` untuk border input/kontrol interaktif AA (`>= 3:1`), dan `--border-subtle` untuk pemisah panel split view serta kartu.
