# RFC-014: Debt & Receivables Ledger (Buku Utang-Piutang & Pelunasan)

**Features**: F22
**Depends on**: RFC-001, RFC-002, RFC-006, RFC-007, RFC-009, RFC-013
**Rules**: ARCH-2, API-1, API-2, DATA-1, DATA-2, DATA-4, SEC-1, OFFLINE-2, OFFLINE-3, UI-1, UI-3, I18N-1, TEST-1, TEST-2, TEST-3, QUAL-2
**Complexity**: High

---

## Summary

Mengimplementasikan Buku Utang-Piutang (*Debt & Receivables Ledger*) (`F22`, `FR-19`, `DEC-3`) untuk melacak kewajiban pinjaman (utang kita ke orang lain) dan piutang (orang lain berutang ke kita). Sesuai mandat `PRD.md`, pencatatan saldo pokok utang/piutang dikelola terpisah dari pengeluaran bulanan rutin, dengan dukungan pencatatan cicilan/pelunasan bertahap yang dapat dihubungkan ke dompet kas riil. Menyediakan ringkasan total utang vs piutang aktif, pelacakan tanggal jatuh tempo, dan riwayat pelunasan komprehensif.

---

## Technical Approach

### 1. Model Data Buku Utang-Piutang & Cicilan (`DATA-1`, `DATA-4`)
- Tabel `debts_receivables` (`src/db/schema/finance.ts`):
  - `id`: `uuid` PK default `gen_random_uuid()`
  - `user_id`: `uuid` NOT NULL, FK `users.id` ON DELETE CASCADE
  - `type`: `varchar(15)` NOT NULL (`DEBT` [utang] | `RECEIVABLE` [piutang])
  - `person_name`: `varchar(100)` NOT NULL (nama kontak / rekanan)
  - `total_amount`: `bigint` NOT NULL (> 0 IDR integer)
  - `settled_amount`: `bigint` NOT NULL default 0 (agregasi cicilan yang sudah dibayar)
  - `due_date`: `timestamptz` opsional
  - `notes`: `text` opsional
  - `status`: `varchar(15)` NOT NULL default `ACTIVE` (`ACTIVE` | `SETTLED`)
  - `created_at`, `updated_at`: `timestamptz` default `NOW()`
- Tabel `debt_settlements` (`src/db/schema/finance.ts`):
  - `id`: `uuid` PK default `gen_random_uuid()`
  - `debt_id`: `uuid` NOT NULL, FK `debts_receivables.id` ON DELETE CASCADE
  - `wallet_id`: `uuid` opsional, FK `wallets.id` (jika pembayaran memotong/menambah saldo kas)
  - `transaction_id`: `uuid` opsional, FK `transactions.id` ON DELETE SET NULL (tautan ke transaksi kas)
  - `amount`: `bigint` NOT NULL (> 0 IDR integer)
  - `settled_at`: `timestamptz` NOT NULL default `NOW()`
  - `notes`: `varchar(255)` opsional
  - `created_at`: `timestamptz` default `NOW()`

### 2. Hubungan dengan Buku Kas Operasional & Ledger Saldo (`DATA-2`)
- **Pencatatan Awal Pokok Pinjaman:**
  - Pembuatan entitas utang atau piutang murni mencatat komitmen finansial tanpa mempengaruhi Safe-to-Spend atau cashflow bulanan konsumtif.
- **Pencatatan Cicilan / Pelunasan (Settlement):**
  - Pengguna dapat memilih:
    1. *Pembayaran Kas Riil:* Memilih dompet (misal: Kas Tunai / Bank BCA).
       - Untuk **Utang (DEBT)**: Membuat baris transaksi pengeluaran kas (`EXPENSE`) dengan kategori bawaan *Bayar Utang* atau *Lainnya*.
       - Untuk **Piutang (RECEIVABLE)**: Membuat baris transaksi pemasukan kas (`INCOME`) dengan kategori bawaan *Terima Piutang*.
       - Saldo dompet riil terpotong/bertambah secara atomik via ledger `transactions`.
    2. *Pembayaran Non-Kas / Catatan Manual:* Tanpa memilih dompet (misal: barter barang atau pelunasan lewat pihak ketiga). Tidak ada transaksi ledger yang dibuat.
- **Kalkulasi Status Lunas (SETTLED):**
  - Jika `settled_amount >= total_amount`, status otomatis beralih menjadi `SETTLED`.

### 3. API Endpoints (`API-1`, `API-2`, `SEC-1`)
- `GET /api/finance/debts`:
  - Query: `type` (`DEBT`|`RECEIVABLE`|`ALL`), `status` (`ACTIVE`|`SETTLED`|`ALL`), `search`
  - Mengembalikan daftar utang-piutang beserta ringkasan `totalDebt`, `totalReceivable`, `netPosition` (`totalReceivable - totalDebt`).
- `POST /api/finance/debts`:
  - Membuat catatan utang/piutang baru.
- `GET /api/finance/debts/[id]`:
  - Mendapatkan detail utang/piutang beserta seluruh riwayat cicilan `settlements`.
- `POST /api/finance/debts/[id]/settlements`:
  - Mencatat cicilan/pelunasan baru (opsional membuat transaksi kas).
- `DELETE /api/finance/debts/[id]`:
  - Menghapus catatan utang/piutang. Transaksi kas yang pernah dibuat dari cicilan masa lalu tetap dipertahankan (`transaction_id = NULL`).

### 4. UI Integration pada Finance Workspace
- Tab navigasi baru atau sub-halaman di `/app/finance/debts`:
  - Kartu Ringkasan: Total Piutang (Aset), Total Utang (Kewajiban), dan Posisi Bersih (*Net Debt/Receivable*).
  - Tab Pengalih: *"Piutang Saya"* vs *"Utang Saya"*.
  - Indikator Visual Progres Pelunasan (contoh: `Rp 500.000 / Rp 1.500.000 (33%)`).
  - Penanda Jatuh Tempo: Badge merah jika lewat jatuh tempo (*Overdue*), kuning jika jatuh tempo dalam 3 hari.
  - Modal Catat Cicilan (`RecordSettlementModal.tsx`).

---

## API Contracts Exposed

- `GET /api/finance/debts` -> `{ ok: true, data: { summary: { totalDebt, totalReceivable, netPosition }, items: Array<DebtReceivableDto> } }`
- `POST /api/finance/debts` -> Body: `{ type, personName, totalAmount, dueDate?, notes? }` -> `201 Created`
- `GET /api/finance/debts/[id]` -> `{ ok: true, data: { item: DebtReceivableDetailDto } }`
- `POST /api/finance/debts/[id]/settlements` -> Body: `{ amount, walletId?, notes?, settledAt? }` -> `201 Created`
- `DELETE /api/finance/debts/[id]` -> `200 OK`

---

## Implementation Details

### File Structure
- `src/db/schema/finance.ts` (penambahan `debtsReceivables`, `debtSettlements`)
- `src/features/finance/debt-service.ts`: Logika bisnis utang-piutang, kalkulasi cicilan, dan transaksi atomik kas.
- `src/app/api/finance/debts/route.ts`, `src/app/api/finance/debts/[id]/route.ts`
- `src/app/api/finance/debts/[id]/settlements/route.ts`
- `src/app/(app)/app/finance/debts/page.tsx`: Halaman Buku Utang-Piutang.
- `src/components/finance/debts/DebtCard.tsx`: Kartu utang-piutang dengan progress bar pelunasan.
- `src/components/finance/debts/DebtFormModal.tsx`: Modal tambah/edit utang-piutang.
- `src/components/finance/debts/RecordSettlementModal.tsx`: Modal pencatatan cicilan & opsi potong dompet.
- `src/features/sync/db.ts`: Store IndexedDB `debts_receivables` dan `debt_settlements`.
- `tests/unit/debts-receivables.test.ts`: Uji kalkulasi sisa utang, status pelunasan otomatis, dan validasi nominal.
- `tests/integration/debts-api.test.ts`: Uji isolasi tenant, pencatatan cicilan kas atomik, dan penghapusan aman.

---

## Acceptance Criteria

- [ ] **AC-14.1 (Skema Database & Pemisahan Pengeluaran Bulanan — `F22`, `DATA-1`, `DATA-4`):** Tabel `debts_receivables` dan `debt_settlements` menggunakan nominal `bigint` integer IDR. Nilai pokok utang/piutang tidak mempengaruhi kalkulasi arus kas bulanan konsumtif.
- [ ] **AC-14.2 (Pencatatan Cicilan Kas & Non-Kas — `F22`, `DATA-2`):** Ketika cicilan dicatat dengan memilih dompet, sistem membuat transaksi ledger kas bertipe `EXPENSE` (untuk utang) atau `INCOME` (untuk piutang) secara atomik; ketika tanpa dompet, cicilan dicatat tanpa memodifikasi saldo dompet.
- [ ] **AC-14.3 (Status Pelunasan Otomatis — `F22`):** Sistem otomatis mengubah status dari `ACTIVE` ke `SETTLED` saat `settled_amount >= total_amount`, serta menolak nominal cicilan yang melebihi sisa pokok utang/piutang.
- [ ] **AC-14.4 (Deteksi Tanggal Jatuh Tempo — `F22`, `UI-1`):** UI menampilkan indikator badge jelas untuk utang/piutang yang mendekati atau telah melewati tanggal jatuh tempo (*overdue*).
- [ ] **AC-14.5 (Penyimpanan Offline & Sinkronisasi Idempoten — `F22`, `OFFLINE-2`, `OFFLINE-3`):** Data utang-piutang dapat dibaca dan dicatat saat offline via IndexedDB mirror dan tersinkronisasi idempoten saat online.
- [ ] **AC-14.6 (Integritas Hapus & Pembersihan Akun — `F22`, `DATA-4`):** Penghapusan utang-piutang tidak merusak saldo kas masa lalu, dan penghapusan akun mandiri (`RFC-010`) membersihkan seluruh data utang-piutang beserta cicilannya.

---

## Implementation Considerations

- **Nama Kontak Konsisten:** Input nama pihak menggunakan auto-complete dari daftar nama yang pernah dicatat sebelumnya untuk mempermudah konsistensi penulisan nama rekanan.
