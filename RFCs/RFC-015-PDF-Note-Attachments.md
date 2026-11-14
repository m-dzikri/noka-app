# RFC-015: PDF Note Attachments & Secure Document Viewer

**Features**: F23
**Depends on**: RFC-001, RFC-002, RFC-004, RFC-005, RFC-009, RFC-010
**Rules**: STACK-3, ARCH-2, ARCH-6, API-1, API-2, SEC-1, SEC-4, SEC-5, SEC-6, OFFLINE-4, UI-3, UI-5, I18N-1, PERF-4, OBS-2, OBS-3, TEST-1, TEST-3, QUAL-2
**Complexity**: Medium

---

## Summary

Memperluas modul lampiran catatan (`RFC-005`) agar mendukung dokumen **PDF** (`F23`, `FR-20`, `DEC-3`, `DEC-9`). Mendukung unggah berkas PDF hingga **5 MB per file** dengan verifikasi ketat *magic bytes* (`%PDF-`) dan MIME `application/pdf`, penanganan kuota gabungan lampiran per catatan, penyajian biner privat terproteksi isolasi `userId`, penampil dokumen aman (*sandboxed document viewer*), unduhan satu-klik, serta penonaktifan unggah saat offline (`OFFLINE-4`).

---

## Technical Approach

### 1. Ekstensi Validasi Berkas & Magic Bytes (`SEC-5`, `SEC-6`)
- Memperluas `src/features/notes/attachments-service.ts`:
  - Mengizinkan MIME `application/pdf` di samping `image/jpeg`, `image/png`, `image/webp`.
  - Verifikasi buffer biner via `file-type@22.3.0`:
    - Memeriksa signature magic byte `%PDF-` (`0x25 0x50 0x44 0x46`).
    - Jika header `file.type` mengklaim PDF tetapi signature tidak cocok -> tolak `422 UNSUPPORTED_ATTACHMENT_TYPE`.
  - Batas ukuran file: Maksimal 5 MB per berkas (`413 FILE_TOO_LARGE`).
  - Kuota lampiran: Maksimal 5 lampiran gabungan (gambar + PDF) per catatan dengan penguncian `FOR UPDATE` saat transaksi DB berlangsung.
  - Normalisasi Storage Key: `users/{userId}/notes/{noteId}/{attachmentId}.pdf` (selaras `RFC-005`).

### 2. Penyajian Privat Dokumen & Proteksi XSS (`SEC-1`, `SEC-4`)
- Endpoint `GET /api/attachments/[attachmentId]`:
  - Jika berkas bertipe `application/pdf`:
    - Headers response:
      - `Content-Type: application/pdf`
      - `Content-Disposition: inline; filename="{sanitizedFilename}.pdf"`
      - `X-Content-Type-Options: nosniff`
      - `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox allow-scripts` (mencegah eksekusi script jahat di dalam PDF)
      - `Cache-Control: private, max-age=3600` (kompatibel dengan Service Worker cache `noka-private-v1`)

### 3. Komponen UI Penampil Dokumen (`NoteAttachmentsPanel.tsx`)
- Panel lampiran membedakan representasi visual:
  - **Gambar:** Thumbnail gambar dengan lightbox preview.
  - **PDF:** Kartu dokumen PDF elegan:
    - Ikon badge PDF merah khas dokumen.
    - Nama file asli yang diunggah dan ukuran berkas (misal: `proposal-final.pdf · 2.4 MB`).
    - Tombol *"Lihat"* (*Preview*) membuka modal pratinjau PDF layar penuh yang aman.
    - Tombol *"Unduh"* (*Download*) memicu pengunduhan berkas lokal.
    - Tombol *"Hapus"* dengan dialog konfirmasi `Modal`.
- **Offline Lock (`OFFLINE-4`):**
  - Tombol unggah PDF dan hapus dinonaktifkan saat mode offline.
  - Jika PDF sudah pernah dibuka saat online, dokumen dapat dibuka dari cache Service Worker privat; jika belum, menampilkan placeholder dokumen belum terunduh.

### 4. Pembersihan Data & Hapus Akun (`RFC-010`)
- Integrasi dengan `cleanupNoteAttachments` dan `deleteUserAttachmentObjects`:
  - Menghapus objek PDF dari storage (S3 / Local Storage) saat lampiran atau catatan dihapus.
  - Hapus akun mandiri (`DELETE /api/account`) membersihkan seluruh lampiran gambar dan PDF tanpa menyisakan *orphan files*.

---

## API Contracts Exposed

- `POST /api/notes/[id]/attachments`:
  - Multipart field: `file` (bisa Gambar atau PDF ≤ 5 MB).
  - Mengembalikan `201 Created` dengan `AttachmentDto` menyertakan `mimeType: "application/pdf"`, `originalName`, `sizeBytes`, `url`.
- `GET /api/attachments/[attachmentId]`:
  - Menyajikan biner PDF dengan proteksi CSP sandbox dan cache privat.
- `DELETE /api/attachments/[attachmentId]`:
  - Menghapus lampiran PDF dan storage object terkait.

---

## Implementation Details

### File Structure
- `src/features/notes/attachments-service.ts` (penambahan dukungan deteksi dan validasi PDF)
- `src/components/notes/NoteAttachmentsPanel.tsx` (pembaruan rendering kartu dokumen PDF & tombol viewer)
- `src/components/notes/PdfDocumentModal.tsx` (modal sandboxed viewer untuk membaca PDF)
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/{id,en}.ts` (key `notes.attachments.pdf.*`)
- `tests/unit/pdf-attachments.test.ts`: Uji validasi magic bytes `%PDF-`, penolakan biner palsu, dan batas 5 MB.
- `tests/integration/pdf-attachments-api.test.ts`: Uji upload PDF, serving privat dengan CSP headers, dan penghapusan berkas.

---

## Acceptance Criteria

- [ ] **AC-15.1 (Validasi Magic Bytes & Ekstensi PDF — `F23`, `SEC-5`, `SEC-6`):** `POST /api/notes/[id]/attachments` memverifikasi magic bytes `%PDF-` (`0x25 0x50 0x44 0x46`) via `file-type`. Berkas non-PDF atau berkas yang diganti ekstensinya secara manipulatif ditolak dengan `422 UNSUPPORTED_ATTACHMENT_TYPE`.
- [ ] **AC-15.2 (Batas Ukuran 5 MB & Kuota Gabungan — `F23`):** Berkas PDF dengan ukuran `> 5 MB` ditolak dengan `413 FILE_TOO_LARGE`. Catatan yang telah memiliki 5 lampiran gabungan (gambar + PDF) ditolak dengan `409 ATTACHMENT_LIMIT_REACHED`.
- [ ] **AC-15.3 (Penyajian Privat dengan CSP Sandboxing — `F23`, `SEC-4`):** Endpoint `GET /api/attachments/[attachmentId]` menyertakan header keamanan `Content-Security-Policy: sandbox allow-scripts` dan `X-Content-Type-Options: nosniff` untuk mencegah serangan XSS melalui dokumen PDF.
- [ ] **AC-15.4 (UI Kartu Dokumen & Penampil PDF — `F23`, `UI-3`, `I18N-1`):** `NoteAttachmentsPanel` menampilkan kartu dokumen PDF yang jelas dengan nama berkas, ukuran, tombol buka pratinjau, dan tombol unduh.
- [ ] **AC-15.5 (Aturan Offline-Only Guard — `F23`, `OFFLINE-4`):** Tombol unggah dan hapus PDF dinonaktifkan saat `!isOnline`, dengan indikator placeholder yang jelas jika dokumen belum tersedia di cache privat lokal.
- [ ] **AC-15.6 (Pembersihan Siklus Hidup & Hapus Akun — `F23`, `RFC-010`):** Berkas PDF di storage terhapus bersih saat lampiran dihapus, catatan dihapus, atau akun pengguna dihapus secara mandiri.

---

## Implementation Considerations

- **Iframe Sandboxing:** Komponen penampil PDF menggunakan `<iframe sandbox="allow-scripts allow-same-origin" src="..." />` di dalam modal responsif untuk isolasi konteks eksekusi dokumen.
