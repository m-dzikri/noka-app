# RFC-005: Secure Note Image Attachments (Online-Only v1.0)

**Features**: F9
**Depends on**: RFC-001, RFC-002, RFC-004
**Rules**: STACK-3, ARCH-2, ARCH-6, API-1, API-2, SEC-1, SEC-4, SEC-6, OFFLINE-4, UI-3, UI-5, I18N-1, OBS-2, OBS-3, TEST-1, TEST-3, QUAL-2, QUAL-3
**Complexity**: Medium

---

## Summary

Menambahkan dukungan lampiran gambar aman pada catatan saat **online** (`F9`, `FR-6`, `NFR-9`, `DEC-9`): maksimal **5 gambar per catatan** dan **5 MB per berkas**, validasi *magic bytes* (`file-type@22.3.0`) + header MIME hanya untuk `JPEG`, `PNG`, dan `WebP`, normalisasi key UUID internal, penyajian biner terautentikasi `userId` via `GET /api/attachments/[attachmentId]` (siap cache privat offline & dibersihkan saat logout), pembersihan berkas saat hapus gambar/catatan dan helper `{ failedKeys }` untuk hapus akun (`RFC-010`), serta penonaktifan unggah/hapus saat offline (`OFFLINE-4`).

---

## Technical Approach

### 1. StorageAdapter Abstraction (`STACK-3`, `ARCH-6`)
- `src/lib/storage/types.ts` mendefinisikan `StorageAdapter`:
  - `putObject(key: string, body: Buffer, contentType: string): Promise<void>`
  - `readObject(key: string): Promise<{ body: Buffer; contentType: string } | null>`
  - `deleteObject(key: string): Promise<void>` *(idempoten: mengabaikan `ENOENT`/`NoSuchKey`)*
  - `deleteObjects(keys: string[]): Promise<{ failedKeys: string[] }>` *(skip cepat `{ failedKeys: [] }` jika `keys.length === 0`; otomatis batch 1.000 key untuk S3 `DeleteObjects`, mengembalikan daftar key yang benar-benar gagal sementara error `NoSuchKey`/`ENOENT` dianggap sukses)*
  - `getSignedReadUrl(key: string, expiresInSeconds?: number): Promise<string | null>` *(untuk diagnostik/ops S3, selalu `null` di `LocalStorageAdapter`)*
- `src/lib/storage/index.ts` memilih adapter via `getEnv()`:
  - Jika grup `S3_*` terisi lengkap -> `S3StorageAdapter` (`@aws-sdk/client-s3@3.1166.0`, `region: env.S3_REGION`, `forcePathStyle: true` + `@aws-sdk/s3-request-presigner@3.1166.0` untuk `getSignedReadUrl`).
  - Jika grup `S3_*` **kosong seluruhnya** dan `NODE_ENV !== "production"` -> `LocalStorageAdapter` memakai `env.LOCAL_UPLOADS_DIR ?? path.join(process.cwd(), ".data", "uploads")` dengan penjagaan path traversal (`path.resolve(baseDir, key).startsWith(path.resolve(baseDir) + path.sep)`).
  - Jika grup `S3_*` **kosong seluruhnya** dan `NODE_ENV === "production"` -> setiap method `StorageAdapter` melempar `ApiError(503, "STORAGE_UNAVAILABLE", ...)` *(sedangkan konfigurasi S3 yang hanya terisi sebagian sudah gagal validasi startup `getEnv()` sesuai `STACK-3` & `RFC-001`)*.

### 2. Upload Validation, Locking & Compensation (`SEC-6`, `API-2`, `OBS-3`)
1. Seluruh route memvalidasi parameter UUID (`id`, `attachmentId`) dengan Zod (`422 VALIDATION_ERROR`) dan memeriksa `requireAuth(req)` + `verifyCsrfOrigin(req)` untuk mutasi.
2. Pada `POST /api/notes/[id]/attachments`: cek `Content-Type` `multipart/form-data` (`400 INVALID_MULTIPART`) dan pre-check `Content-Length > 5 * 1024 * 1024 + 65536` (`413 PAYLOAD_TOO_LARGE`).
3. Ekstrak tepat satu field `file` bertipe `File` (`422 VALIDATION_ERROR`), cek `file.size > 0` (`422 EMPTY_FILE`) dan `file.size <= 5 * 1024 * 1024` (`413 FILE_TOO_LARGE`).
4. Baca `Buffer`, periksa `fileTypeFromBuffer(buffer)` (`file-type@22.3.0`): hanya `image/jpeg`, `image/png`, `image/webp` (`422 UNSUPPORTED_IMAGE_TYPE`); bila `file.type` diisi (bukan kosong/`application/octet-stream`), wajib cocok dengan magic bytes (`image/jpg` dianggap alias `image/jpeg`). Petakan ke `jpg`/`png`/`webp`.
5. Dalam `db.transaction`:
   - Kunci baris catatan: `SELECT id FROM notes WHERE id = noteId AND user_id = userId AND deleted_at IS NULL FOR UPDATE` (absen -> `404 NOTE_NOT_FOUND`).
   - Cek `COUNT(*) FROM note_attachments WHERE note_id = noteId` (`>= 5` -> `409 ATTACHMENT_LIMIT_REACHED`).
   - Buat `attachmentId = crypto.randomUUID()`, `storageKey = "users/" + userId + "/notes/" + noteId + "/" + attachmentId + "." + ext`, insert `note_attachments`, update `notes.updatedAt = NOW()`.
   - Panggil `StorageAdapter.putObject(storageKey, buffer, detected.mime)`: jika gagal, rollback transaksi -> `503 STORAGE_UNAVAILABLE`; jika commit transaksi gagal setelah `putObject` sukses, panggil best-effort `deleteObject(storageKey)` + `logger.error` tersanitasi.

### 3. Authenticated Serving & Deletion Hooks (`FR-6`, `NFR-9`, `OFFLINE-4`, `SEC-6`)
- `GET /api/notes/[id]/attachments`: `requireAuth`, validasi UUID & kepemilikan note aktif (`404 NOTE_NOT_FOUND`), kembalikan `{ ok: true, data: { attachments: Array<{ id, noteId, mimeType, sizeBytes, url: "/api/attachments/" + id, createdAt }> } }`.
- `GET /api/attachments/[attachmentId]`: `requireAuth`, query `note_attachments` join `notes` dengan `user_id = session.userId AND notes.deleted_at IS NULL` (`404 ATTACHMENT_NOT_FOUND`), panggil `StorageAdapter.readObject(row.storageKey)` (`null` -> `404 ATTACHMENT_OBJECT_MISSING`, error storage -> `503 STORAGE_UNAVAILABLE`), lalu kembalikan `Buffer` pada response `200` dengan header `Content-Type: row.mimeType`, `Content-Length`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, dan `Cache-Control: private, max-age=3600` (kompatibel dengan Service Worker cache `noka-private-v1` pada `RFC-009`).
- `DELETE /api/attachments/[attachmentId]`: dalam `db.transaction`, verifikasi kepemilikan `userId` & **`notes.deleted_at IS NULL`** (`404 ATTACHMENT_NOT_FOUND`), hapus baris `note_attachments`, perbarui `notes.updatedAt = NOW()`, lalu panggil `StorageAdapter.deleteObject(row.storageKey)` sebelum commit (error storage memicu rollback transaksi DB -> `503 STORAGE_UNAVAILABLE`).
- `attachments-service.ts` mengekspor `cleanupNoteAttachments({ tx, noteId, userId })` (tanpa mengimpor `service.ts` agar bebas circular import): di dalam `tx`, mengambil & menghapus baris `note_attachments` milik `(noteId, userId)`, lalu mengembalikan callback pasca-commit `async () => { ... }` yang memanggil `deleteUserAttachmentObjects(keys)` dan hanya mencatat `logger.warn` berisi opaque `failedKeys` (sehingga kegagalan S3 pasca-commit tidak pernah mengubah delete yang sudah commit menjadi `503`/`500`). Di `src/features/notes/service.ts`, registrasikan hook ini secara langsung via `registerNoteDeleteCleanup(cleanupNoteAttachments)` agar selalu aktif saat `DELETE /api/notes/[id]` tanpa bergantung pada module side-effect.
- Ekspor `deleteUserAttachmentObjects(keys: string[]): Promise<{ failedKeys: string[] }>` dari `attachments-service.ts`: langsung mengembalikan `{ failedKeys: [] }` jika `keys.length === 0`; selain itu memanggil `StorageAdapter.deleteObjects(keys)` di dalam `try/catch` sehingga error storage apa pun (termasuk `ApiError(503, "STORAGE_UNAVAILABLE")` saat production storage belum terkonfigurasi) ditangkap dan mengembalikan `{ failedKeys: keys }` agar penghapusan akun `RFC-010` maupun cleanup catatan pasca-commit tidak gagal!

### 4. UI Integration (`NoteAttachmentsPanel.tsx` di Desktop & Mobile)
- `src/components/notes/NoteAttachmentsPanel.tsx` dipasang lewat `attachmentsSlot` ke `NoteEditor` baik di `src/app/(app)/app/notes/[id]/page.tsx` **maupun** di `src/components/notes/NotesWorkspace.tsx` (split view desktop `/app/notes/page.tsx`).
- Unggah memakai `apiFetch()` (`RFC-002`) dengan status busy spinner terlokalisasi (bukan XHR, menjaga konsistensi `401` cleanup), dialog konfirmasi hapus `Modal`, pratinjau lightbox ber-`alt={t.notes.attachments.imageAlt}`, placeholder offline/gambar-rusak terlokalisasi (`t.notes.attachments.offlinePlaceholder`) ketika gambar yang belum ter-cache gagal dimuat (`onError`), reset error gambar saat event `online`, serta **menonaktifkan tombol unggah maupun tombol hapus lampiran** saat `!isOnline` (`OFFLINE-4`, `FR-6`).

---

## API Contracts Exposed

Semua route memakai amplop `API-1` (`apiOk`/`apiError`/`handleApiError`), validasi UUID param (`422 VALIDATION_ERROR`):
- `GET /api/notes/[id]/attachments` -> `200` `{ attachments }` | `401` | `404 NOTE_NOT_FOUND` | `422`.
- `POST /api/notes/[id]/attachments` -> `201` `{ attachment }` | `400 INVALID_MULTIPART` | `401` | `403 CSRF_ORIGIN_MISMATCH` | `404` | `409 ATTACHMENT_LIMIT_REACHED` | `413 PAYLOAD_TOO_LARGE` / `FILE_TOO_LARGE` | `422 EMPTY_FILE` / `UNSUPPORTED_IMAGE_TYPE` / `VALIDATION_ERROR` | `503 STORAGE_UNAVAILABLE`.
- `GET /api/attachments/[attachmentId]` -> `200` binary response (`Content-Type`, `Content-Length`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=3600`) | `401` | `404 ATTACHMENT_NOT_FOUND` / `ATTACHMENT_OBJECT_MISSING` | `422` | `503`.
- `DELETE /api/attachments/[attachmentId]` -> `200` `{ deleted: true, id }` | `401` | `403` | `404` | `422` | `503`.

---

## Implementation Details

### File Structure
- `src/lib/storage/types.ts`, `src/lib/storage/s3.ts`, `src/lib/storage/local.ts`, `src/lib/storage/index.ts`
- `src/features/notes/attachments-service.ts`
- `src/features/notes/service.ts` (diperbarui registrasi statis `registerNoteDeleteCleanup(cleanupNoteAttachments)` saat `deleteNote`)
- `src/app/api/notes/[id]/attachments/route.ts`, `src/app/api/attachments/[attachmentId]/route.ts`
- `src/components/notes/NoteAttachmentsPanel.tsx`
- `src/components/notes/NotesWorkspace.tsx` & `src/app/(app)/app/notes/page.tsx` & `src/app/(app)/app/notes/[id]/page.tsx` (diperbarui menyalurkan `<NoteAttachmentsPanel />` ke `attachmentsSlot` `NoteEditor` di split view desktop & halaman detail mobile)
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/{id,en}.ts` (mendefinisikan & mengisi key `notes.attachments.*` termasuk `offlinePlaceholder`)
- `tests/unit/attachment-validation.test.ts`, `tests/integration/note-attachments.test.ts`

---

## Acceptance Criteria

- [x] **AC-5.1 (Validasi Ketat Ukuran, Param, Batas, Key UUID & Magic Bytes — `F9`, `SEC-6`, `API-1`, `API-2`):** Route memvalidasi param UUID (`422 VALIDATION_ERROR`) & `POST` menolak `401`/`403 CSRF_ORIGIN_MISMATCH`; `POST /api/notes/[id]/attachments` memverifikasi multipart (`400`), menolak field `file` kosong/ganda/non-File (`422`), memeriksa ukuran `> 0` (`422 EMPTY_FILE`) dan `<= 5 MB` termasuk pre-check `Content-Length` (`413`), memeriksa ownership catatan aktif (`404 NOTE_NOT_FOUND`), batas 5 lampiran dengan `FOR UPDATE` (`409 ATTACHMENT_LIMIT_REACHED`), serta `fileTypeFromBuffer` (`file-type@22.3.0`) + `file.type` (alias `image/jpg`) hanya untuk `JPEG`/`PNG`/`WebP` (`422 UNSUPPORTED_IMAGE_TYPE`), menormalkan `storageKey` berbasis UUID `users/<userId>/notes/<noteId>/<attachmentId>.<ext>` (mengabaikan nama file asli klien), lalu memperbarui `notes.updatedAt`.
- [x] **AC-5.2 (`StorageAdapter` & Recovery — `STACK-3`, `ARCH-6`, `OBS-2`, `OBS-3`):** `src/lib/storage/{types,s3,local,index}.ts` mendukung `S3StorageAdapter` (`forcePathStyle`, `region`, `getSignedReadUrl`), `LocalStorageAdapter` (`LOCAL_UPLOADS_DIR`, anti path traversal), melempar `503 STORAGE_UNAVAILABLE` di production hanya ketika seluruh env `S3_*` kosong (partial sudah ditolak startup `RFC-001`), batch `deleteObjects` per 1.000 mengembalikan `{ failedKeys }`, serta menjalankan kompensasi/rollback saat error DB atau storage tanpa kebocoran log.
- [x] **AC-5.3 (Isolasi Akses, Serving & Cleanup — `F9`, `SEC-1`, `SEC-4`, `SEC-6`):** `attachments-service.ts`, `GET /api/notes/[id]/attachments`, `GET /api/attachments/[attachmentId]` (`200` biner dengan `Content-Type`, `Content-Length`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=3600`; `404 ATTACHMENT_OBJECT_MISSING`; `503 STORAGE_UNAVAILABLE`), dan `DELETE /api/attachments/[attachmentId]` (cek `notes.deleted_at IS NULL`, bump `notes.updatedAt`, `503` rollback) menolak akses lintas user (`401`/`404`) dan CSRF (`403`); hapus catatan (`service.ts`) mendaftarkan & mengeksekusi cleanup lampiran pasca-commit tanpa gagal `503`/`500` saat error storage; `deleteUserAttachmentObjects` mengembalikan `{ failedKeys }` (cepat bila `[]`, fallback aman saat error storage).
- [x] **AC-5.4 (UI `NoteAttachmentsPanel`, Desktop Split + Mobile & Mode Offline — `F9`, `OFFLINE-4`, `UI-3`, `UI-5`, `I18N-1`):** `NoteAttachmentsPanel.tsx` dipasang ke `attachmentsSlot` di `NotesWorkspace.tsx` (`notes/page.tsx`) dan `notes/[id]/page.tsx`, memakai `apiFetch()`, menampilkan indikator progress upload, dialog konfirmasi hapus `Modal`, pratinjau lightbox (`alt={t.notes.attachments.imageAlt}`), teks `types.ts`/`id.ts`/`en.ts`, akses keyboard, bebas overflow `360px`/`768px`/`1280px`, menonaktifkan tombol **unggah maupun hapus** saat `!isOnline`, merender placeholder offline terlokalisasi (`offlinePlaceholder`) saat gambar gagal dimuat offline, dan auto-retry saat event `online`.
- [x] **AC-5.5 (Tests & Quality — `TEST-1`, `TEST-3`, `QUAL-2`, `QUAL-3`):** `tests/unit/attachment-validation.test.ts` dan `tests/integration/note-attachments.test.ts` (menguji `StorageAdapter` S3 batch/local path traversal/prod `503`, kompensasi rollback, magic bytes, batas 5 MB & 5 gambar, cross-user `404`/`401`/`403` pada `POST`/`GET`/`DELETE`, `deleteUserAttachmentObjects`, serta state offline disabled upload+delete, placeholder offline, & lightbox UI) lulus bersama `npm run lint` dan `npx tsc --noEmit`.

---

## Implementation Notes

- **Post-Commit Note Delete Cleanup (`src/features/notes/service.ts`, `src/features/notes/attachments-service.ts`):** `deleteNoteInTx` mengumpulkan `storageKeys` dan menghapus baris `note_attachments` di dalam transaksi DB, sedangkan penghapusan biner di adapter storage (`cleanupNoteAttachments`) didaftarkan secara statis lewat `registerNoteDeleteCleanup(cleanupNoteAttachments)` dan hanya berjalan pasca-commit sehingga error storage tidak menggagalkan penghapusan catatan.
- **LWW & Parent Sync Header (`POST /api/notes/[id]/attachments`, `DELETE /api/attachments/[attachmentId]`, `NoteAttachmentsPanel.tsx`):** Mutasi lampiran mengembalikan header `X-Note-Updated-At` serta memperbarui state induk (`onNoteUpdatedAt`) agar `NoteEditor` dan `NoteMutationCoordinator` menjaga timestamp `updatedAt` tetap sinkron dengan server pasca unggah/hapus gambar.
- **SSR Prefetch, `enableAttachments`, & Hydration Safety (`app/(app)/app/notes/page.tsx`, `app/(app)/app/notes/[id]/page.tsx`, `NotesWorkspace.tsx`, `NoteDetailView.tsx`, `NoteAttachmentsPanel.tsx`):** Halaman SSR menyalurkan `enableAttachments` beserta daftar awal lampiran ter-prefetch (`initialAttachments`, `initialAttachmentsNoteId`) ke slot `renderAttachmentsSlot` (menjaga isolasi mock `tests/unit/note-editor.test.tsx` ketika fitur belum diaktifkan). Status koneksi peramban dibaca melalui `useSyncExternalStore` (`getServerOnlineSnapshot` mengembalikan `true` saat SSR Node.js) agar bebas *hydration mismatch*.
- **Cross-Realm Buffer Check, Turbopack Trace Guard, & E2E Coverage:** Deteksi magic bytes (`validateAttachmentImageBuffer`) membungkus buffer ke `Uint8Array` di realm lokal untuk kompatibilitas `file-type@22.3.0` di Node maupun `jsdom`, dan `LocalStorageAdapter` (`src/lib/storage/local.ts`) memberi anotasi `path.resolve(/*turbopackIgnore: true*/ baseDir)` agar *output file tracing* Next.js tidak ikut membundel seluruh proyek. Selain unit (`TS-005-01`) dan integrasi (`TS-005-02`), [`tests/e2e/note-attachments.spec.ts`](../tests/e2e/note-attachments.spec.ts) memverifikasi unggah, akses privat pasca-reload, lightbox, mode offline, bebas overflow, dan hapus modal pada desktop & mobile (termasuk melewati *background prefetch* `404` `<Link>` untuk rute masa depan `/app/finance` dan `/app/settings` saat berjalan di server produksi `next start` yang mengonfigurasi `S3_*`).
- **Review Fixes (`reviews/REVIEW-RFC-005.md`):** (1) `NotesWorkspace.tsx` mengelola `ssrAttachmentsAvailable` & `selectNote` sehingga snapshot SSR `initialSelectedAttachments` dinonaktifkan segera saat mutasi lampiran pada catatan pertama atau perpindahan ke catatan lain, menjamin *live fetch* saat kembali ke catatan awal tanpa reload; (2) `NoteAttachmentsPanel.tsx` tetap meneruskan `X-Note-Updated-At` ke induk lewat `notifyNoteTimestamp` meski pengguna berpindah catatan sebelum `POST`/`DELETE` selesai; (3) `NoteAttachmentsPanel.tsx` mengekstrak tombol coba ulang seragam (`AttachmentRetryButton`) pada kondisi `loadFailed`, fallback thumbnail, dan fallback lightbox; (4) `tests/unit/attachment-validation.test.ts`, `tests/integration/note-attachments.test.ts`, dan `tests/e2e/note-attachments.spec.ts` menambahkan uji regresi `A -> B -> A`, seluruh endpoint UUID tidak valid (`422`), `loadFailed`/lightbox retry, propagasi timestamp lintas catatan, serta `offlinePlaceholder` saat gambar gagal dimuat offline.
