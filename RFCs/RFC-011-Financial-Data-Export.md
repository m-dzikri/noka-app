# RFC-011: Financial Data Export & Reporting (CSV, Excel & Print/PDF)

**Features**: F24
**Depends on**: RFC-001, RFC-002, RFC-006, RFC-007
**Rules**: ARCH-2, API-1, API-2, DATA-1, DATA-2, SEC-1, UI-1, UI-2, I18N-1, PERF-4, TEST-1, TEST-3, QUAL-2
**Complexity**: Medium

---

## Summary

Mengimplementasikan fitur ekspor data keuangan komprehensif (`F24`, `FR-21`) yang memungkinkan pengguna mengunduh riwayat transaksi dan ringkasan arus kas ke format **CSV**, **Excel (XLSX)**, dan **Cetak/PDF**. Mendukung pemfilteran berdasarkan rentang tanggal (siklus bulanan aktif atau kustom), dompet terpilih, dan kategori pengeluaran/pemasukan. Mematuhi standar pemformatan IDR, encoding UTF-8 dengan BOM untuk kompatibilitas Microsoft Excel, serta bebas pemblokiran bundle awal (`PERF-4`).

---

## Technical Approach

### 1. Endpoint Ekspor Terpadu (`GET /api/finance/export`)
- Route: `src/app/api/finance/export/route.ts`
- Query Parameters:
  - `format`: `"csv"` | `"xlsx"` | `"pdf"` (wajib, enum Zod)
  - `startDate`: string ISO date opsional (default: awal siklus aktif pengguna)
  - `endDate`: string ISO date opsional (default: akhir siklus aktif pengguna)
  - `walletId`: string UUID opsional (filter per dompet)
  - `categoryId`: string UUID opsional (filter per kategori)
- Autentikasi & Proteksi (`SEC-1`, `API-2`):
  - Memverifikasi sesi `requireAuth(req)` dan isolasi `userId`.
  - Rate limiting standar API data export (maks 10 permintaan per menit per user untuk mencegah penyalahgunaan sumber daya server).

### 2. Format CSV Generator
- Mematuhi RFC 4180 dengan UTF-8 Byte Order Mark (`\uFEFF`) di awal stream untuk mencegah rusaknya karakter aksen/simbol dan pemformatan tanggal pada Microsoft Excel desktop.
- Header CSV:
  - `Tanggal (Date)`: format `YYYY-MM-DD HH:mm`
  - `Tipe (Type)`: `Pengeluaran (Expense)` | `Pemasukan (Income)` | `Transfer`
  - `Dompet (Wallet)`: nama dompet sumber / tujuan
  - `Kategori (Category)`: nama kategori atau tanda `-` untuk transfer
  - `Nominal IDR (Amount)`: format integer murni (tanpa desimal, selaras `DATA-1`)
  - `Catatan (Notes)`: deskripsi transaksi ter-escape (tanda kutip ganda di-escape menjadi `""`)
- Response Headers:
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="noka-transaksi-{YYYYMMDD}.csv"`
  - `Cache-Control: private, no-cache`

### 3. Format Excel (XLSX) Generator
- Menggunakan dynamic import / server-side builder ringan tanpa mencemari client bundle (`PERF-4`).
- Struktur Multi-Sheet:
  - **Sheet 1 — Ringkasan Keuangan (Summary):**
    - Periode laporan, total pemasukan, total pengeluaran, arus kas bersih (net cashflow), saldo per dompet pada awal dan akhir periode.
  - **Sheet 2 — Buku Transaksi (Ledger):**
    - Daftar seluruh transaksi dan transfer dengan kolom ID, Waktu, Dompet, Kategori, Tipe, Nominal (tipe sel numerik integer), dan Catatan.
- Response Headers:
  - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `Content-Disposition: attachment; filename="noka-laporan-keuangan-{YYYYMMDD}.xlsx"`

### 4. Format Laporan Cetak / PDF Responsif
- Menyediakan endpoint tampilan laporan cetak web khusus: `/app/finance/report?startDate=...&endDate=...` atau opsi download PDF.
- Memanfaatkan stylesheet `@media print` yang mengoptimalkan layout dokumen ukuran A4:
  - Menghilangkan navigasi header pil dan elemen interaktif.
  - Tipografi hitam/gelap kontras tinggi untuk cetak hemat tinta.
  - Ringkasan statistik eksekutif di bagian atas diikuti tabel transaksi yang terpaginasi rapi saat dicetak (`break-inside: avoid` pada baris tabel).
  - Dilengkapi tombol satu-klik *"Cetak / Simpan sebagai PDF"* via `window.print()`.

### 5. UI Integration pada Finance Workspace
- Tombol *"Ekspor Data"* (`ExportDataModal.tsx`) diletakkan pada toolbar `/app/finance`.
- Modal interaktif memungkinkan pengguna memilih:
  - Format berkas (Radio: CSV, Excel XLSX, Print/PDF).
  - Periode: *"Siklus Aktif Ini"*, *"Bulan Lalu"*, atau *"Kustom Tanggal"*.
  - Filter opsional: Semua Dompet vs Dompet Tertentu, Semua Kategori vs Kategori Tertentu.
- Tombol aksi dengan status *loading spinner* saat pembuatan berkas berlangsung.

---

## API Contracts Exposed

- `GET /api/finance/export`
  - Headers: Cookie session wajib
  - Query Params: `format` (`csv`|`xlsx`|`pdf`), `startDate` (ISO), `endDate` (ISO), `walletId` (UUID opsional), `categoryId` (UUID opsional)
  - Success `200`: Binary file stream sesuai `Content-Type` format terkait
  - Error:
    - `401 UNAUTHORIZED`: Sesi tidak valid / belum masuk
    - `422 VALIDATION_ERROR`: Format tidak didukung atau parameter tanggal cacat
    - `429 RATE_LIMIT_EXCEEDED`: Permintaan ekspor terlalu sering
    - `500 INTERNAL_ERROR`: Kegagalan kompilasi file spreadsheet

---

## Implementation Details

### File Structure
- `src/features/finance/export/types.ts`: Interface filter, opsi ekspor, dan representasi DTO baris laporan.
- `src/features/finance/export/csv-builder.ts`: Generator CSV RFC 4180 dengan UTF-8 BOM.
- `src/features/finance/export/excel-builder.ts`: Generator spreadsheet multi-sheet (dynamic imported).
- `src/app/api/finance/export/route.ts`: API route handler terproteksi autentikasi.
- `src/components/finance/ExportDataModal.tsx`: Modal konfigurasi ekspor & download trigger.
- `src/app/(app)/app/finance/report/page.tsx`: Halaman tampilan cetak ramah `@media print` dan PDF.
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/{id,en}.ts`: Key terlokalisasi `finance.export.*`.
- `tests/unit/finance-export.test.ts`: Uji format CSV, escaping koma/kutip, UTF-8 BOM, dan kalkulasi ringkasan.
- `tests/integration/finance-export-api.test.ts`: Uji endpoint API, isolasi data, filter tanggal, dan header respons.

---

## Acceptance Criteria

- [ ] **AC-11.1 (Validasi Parameter & Autentikasi — `F24`, `SEC-1`, `API-1`, `API-2`):** `GET /api/finance/export` menolak permintaan tanpa sesi valid (`401 UNAUTHORIZED`), menolak format di luar `csv`/`xlsx`/`pdf` (`422 VALIDATION_ERROR`), dan menerapkan isolasi `userId` ketat sehingga tidak ada transaksi milik akun lain yang bocor.
- [ ] **AC-11.2 (Generasi CSV RFC 4180 & Excel BOM — `F24`, `DATA-1`):** Ekspor CSV menyertakan prefix byte `\uFEFF` (BOM UTF-8), meng-escape karakter koma, baris baru, dan tanda kutip ganda (`""`), serta menampilkan nominal IDR sebagai integer murni (`bigint` tanpa desimal).
- [ ] **AC-11.3 (Pemfilteran Rentang & Dompet/Kategori — `F24`):** Data yang diekspor menghormati filter `startDate`, `endDate`, `walletId`, dan `categoryId`. Transaksi transfer ditampilkan dengan jelas menyertakan dompet asal dan dompet tujuan.
- [ ] **AC-11.4 (Penyajian Multi-Sheet XLSX & Performa Bundel — `F24`, `PERF-4`):** Format Excel memuat Sheet Ringkasan dan Sheet Ledger terstruktur, dimuat secara dinamis di server tanpa membebani ukuran bundel JavaScript awal klien.
- [ ] **AC-11.5 (Tampilan Cetak / PDF Print-Friendly — `F24`, `UI-1`):** Halaman `/app/finance/report` memuat CSS `@media print` yang menyembunyikan header pil navigasi dan menampilkan laporan keuangan rapi siap cetak atau disimpan sebagai PDF dengan tombol satu klik.
- [ ] **AC-11.6 (UI Modal Ekspor Terlokalisasi — `F24`, `I18N-1`):** Modal `ExportDataModal` terintegrasi pada `/app/finance` di desktop dan mobile dengan pilihan format, rentang waktu, status loading interaktif, dan teks dwibahasa ID/EN.

---

## Implementation Considerations

- **Karakter Delimiter:** Nilai nominal IDR menggunakan pemisah koma pada CSV standar, namun nilai numerik tidak boleh menggunakan tanda baca ribuan di dalam sel CSV agar dapat langsung dihitung rumus `=SUM()` di spreadsheet.
- **Handling Data Kosong:** Jika rentang tanggal tidak memiliki transaksi, file CSV/Excel tetap digenerasi dengan baris header lengkap dan keterangan ringkasan bernilai Rp 0.
