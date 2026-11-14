# RFC-013: Recurring Transactions Scheduler (Serverless-Safe On-Access)

**Features**: F21
**Depends on**: RFC-001, RFC-002, RFC-006, RFC-007, RFC-009, RFC-012
**Rules**: ARCH-2, API-1, API-2, DATA-1, DATA-2, DATA-3, DATA-4, SEC-1, OFFLINE-2, OFFLINE-3, UI-1, UI-2, I18N-1, TEST-1, TEST-3, QUAL-2
**Complexity**: High

---

## Summary

Mengimplementasikan penjadwalan transaksi rutin (`F21`, `FR-18`) untuk pos pengeluaran/pemasukan berkala (misal: langganan bulanan, sewa, gaji, tagihan internet). Menggunakan arsitektur **Serverless-Safe On-Access Execution** yang dievaluasi saat pengguna membuka aplikasi/dashboard tanpa memerlukan worker cron mandiri yang mahal. Menyediakan dua mode eksekusi: **Otomatis (*Auto-apply*)** atau **Berbasis Konfirmasi (*Prompt on Due*)**. Seluruh transaksi yang diterapkan dicatat ke ledger kas standar (`transactions`) dengan jaminan integritas saldo IDR integer (`DATA-1`, `DATA-2`).

---

## Technical Approach

### 1. Skema Database Template Transaksi Berulang (`DATA-1`, `DATA-4`)
- Tabel baru: `recurring_templates` (`src/db/schema/finance.ts`):
  - `id`: `uuid` PK default `gen_random_uuid()`
  - `user_id`: `uuid` NOT NULL, FK `users.id` ON DELETE CASCADE
  - `wallet_id`: `uuid` NOT NULL, FK `wallets.id` (Restriksi: hanya dompet aktif, dompet terarsip ditolak)
  - `category_id`: `uuid` NOT NULL, FK `categories.id` ON DELETE RESTRICT
  - `type`: `varchar(10)` NOT NULL (`EXPENSE` | `INCOME`)
  - `amount`: `bigint` NOT NULL (> 0 IDR integer)
  - `description`: `varchar(255)` NOT NULL
  - `frequency`: `varchar(20)` NOT NULL (`DAILY`, `WEEKLY`, `MONTHLY`)
  - `interval_step`: `integer` NOT NULL default 1 (contoh: setiap 1 bulan, setiap 2 minggu)
  - `day_of_month`: `integer` opsional (1–31 untuk jadwal bulanan)
  - `day_of_week`: `integer` opsional (0–6 untuk jadwal mingguan)
  - `start_date`: `timestamptz` NOT NULL default `NOW()`
  - `end_date`: `timestamptz` opsional (bisa tanpa batas/null)
  - `auto_apply`: `boolean` NOT NULL default `false` (jika false: meminta konfirmasi pengguna)
  - `next_run_at`: `timestamptz` NOT NULL (waktu jatuh tempo berikutnya)
  - `last_run_at`: `timestamptz` opsional (waktu eksekusi terakhir)
  - `is_active`: `boolean` NOT NULL default `true`
  - `created_at`, `updated_at`: `timestamptz` default `NOW()`
- Referensi balik pada tabel `transactions`:
  - Kolom opsional `recurring_template_id` (`uuid`, FK `recurring_templates.id` ON DELETE SET NULL) untuk melacak transaksi mana yang berasal dari jadwal berulang.

### 2. Logika On-Access Scheduler & Anti-Duplicate Guard (`DATA-3`, `SEC-1`)
- Pemicu: Saat klien memuat data keuangan (`/app/finance` atau `AppShell`), klien memanggil `POST /api/finance/recurring/process`:
  - Mengambil seluruh template milik pengguna dengan `is_active = true AND next_run_at <= NOW()`.
  - Mengunci baris template dengan `FOR UPDATE`.
  - **Jika `auto_apply = true`:**
    - Buat baris baru pada `transactions` dalam transaksi database atomik.
    - Hitung `next_run_at` baru (misal +1 bulan, menangani kasus akhir bulan 28/29/30/31).
    - Perbarui `last_run_at = NOW()`.
    - Jika `end_date` terlewati, set `is_active = false`.
  - **Jika `auto_apply = false`:**
    - Catat ke daftar *"Jatuh Tempo Perlu Konfirmasi"* dan kembalikan ke klien agar UI memunculkan modal/banner persetujuan.

### 3. Dialog Konfirmasi Jatuh Tempo & Eksekusi Batch
- Ketika ada transaksi rutin manual yang jatuh tempo:
  - Header workspace menampilkan banner: *"Ada X transaksi rutin jatuh tempo."*
  - Pengguna dapat:
    1. *"Terapkan Semua"* (*Apply All*).
    2. *"Terapkan Satuan"* dengan opsi mengubah nominal/dompet sebelum dicatat.
    3. *"Lewati Siklus Ini"* (*Skip this cycle*, memajukan `next_run_at` tanpa membuat transaksi).

### 4. Offline Synchronization & Outbox Flow (`OFFLINE-2`, `OFFLINE-3`)
- Template berulang disimpan di IndexedDB mirror `recurring_templates`.
- Saat offline: Pengguna tetap dapat melihat daftar template, menambah template baru, atau mengedit/menjeda template via antrean outbox.
- Penerapan transaksi berulang otomatis ditunda hingga aplikasi kembali online atau dijalankan secara lokal dengan outbox queue jika dipicu manual oleh user.

---

## API Contracts Exposed

- `GET /api/finance/recurring`:
  - Mengembalikan daftar seluruh template berulang milik pengguna aktif beserta status aktif/jeda.
- `POST /api/finance/recurring`:
  - Membuat template jadwal berulang baru.
  - Body: `{ walletId, categoryId, type, amount, description, frequency, intervalStep?, dayOfMonth?, autoApply?, startDate? }`
- `PATCH /api/finance/recurring/[id]`:
  - Mengedit konfigurasi jadwal, nominal, atau mengubah `is_active` (Pause/Resume).
- `DELETE /api/finance/recurring/[id]`:
  - Menghapus jadwal berulang (transaksi historis yang pernah dibuat tetap tersimpan dengan `recurring_template_id = NULL`).
- `POST /api/finance/recurring/process`:
  - Menjalankan evaluasi template yang jatuh tempo. Mengembalikan `{ appliedCount, pendingConfirmations: Array<PendingRecurringDto> }`.
- `POST /api/finance/recurring/confirm`:
  - Mengonfirmasi transaksi jatuh tempo manual. Body: `{ templateId, action: "apply"|"skip", customAmount?, customWalletId? }`.

---

## Implementation Details

### File Structure
- `src/db/schema/finance.ts` (penambahan `recurringTemplates` dan relasi ke `transactions`)
- `src/features/finance/recurring-service.ts`: Logika penjadwalan, kalkulasi tanggal berikutnya, eksekusi atomik, dan konfirmasi.
- `src/app/api/finance/recurring/route.ts`, `src/app/api/finance/recurring/[id]/route.ts`
- `src/app/api/finance/recurring/process/route.ts`, `src/app/api/finance/recurring/confirm/route.ts`
- `src/components/finance/RecurringTemplateModal.tsx`: Modal CRUD jadwal rutin.
- `src/components/finance/RecurringPendingBanner.tsx`: Notifikasi transaksi jatuh tempo.
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/{id,en}.ts`: Key `finance.recurring.*`.
- `tests/unit/recurring-scheduler.test.ts`: Uji kalkulasi interval (harian, mingguan, bulanan akhir bulan 31 -> 28/30 Feb/Apr), dan anti-duplikasi.
- `tests/integration/recurring-api.test.ts`: Uji auto-apply atomik, mutasi saldo ledger, skip siklus, dan jeda template.

---

## Acceptance Criteria

- [ ] **AC-13.1 (Skema Database & Validasi Aturan Finansial — `F21`, `DATA-1`, `DATA-4`):** Tabel `recurring_templates` menyimpan data jadwal dengan tipe `EXPENSE`/`INCOME`, nominal integer `bigint`, dan relasi `walletId`/`categoryId`. Dompet yang diarsipkan ditolak saat pembuatan jadwal baru.
- [ ] **AC-13.2 (Kalkulasi Tanggal Jatuh Tempo Akurat — `F21`):** Algoritma penjadwalan menangani frekuensi harian, mingguan, dan bulanan secara deterministik, termasuk penanganan tanggal 31 pada bulan pendek (contoh: 31 Januari -> 28/29 Februari -> 31 Maret).
- [ ] **AC-13.3 (Eksekusi On-Access Bebas Duplikasi — `F21`, `DATA-3`, `SEC-1`):** Pemanggilan `process` mengunci baris template dengan `FOR UPDATE`, membuat baris `transactions` baru secara atomik, dan memperbarui `next_run_at` sehingga tidak ada transaksi ganda meskipun dipanggil beberapa kali secara simultan.
- [ ] **AC-13.4 (Alur Konfirmasi & Opsi Skip — `F21`, `UI-1`):** Template dengan `auto_apply: false` menampilkan daftar transaksi jatuh tempo di UI, di mana pengguna dapat memilih untuk Menerapkan (Apply), Mengubah dompet/nominal, atau Melewati (Skip).
- [ ] **AC-13.5 (Integritas Riwayat Historis — `F21`, `DATA-4`):** Penghapusan jadwal berulang melepaskan referensi `recurring_template_id = NULL` pada transaksi ledger tanpa menghapus riwayat transaksi masa lalu.
- [ ] **AC-13.6 (Penyimpanan Offline & Sinkronisasi — `F21`, `OFFLINE-2`):** Daftar jadwal tersimpan di IndexedDB mirror dan dapat dikonfigurasi saat offline melalui antrean outbox.

---

## Implementation Considerations

- **Penanganan Zona Waktu (Timezone):** Evaluasi `day_of_month` dan `next_run_at` menggunakan zona waktu lokal pengguna (`Intl.DateTimeFormat`) agar transaksi jatuh tempo tepat pada jam awal tanggal lokal pengguna.
