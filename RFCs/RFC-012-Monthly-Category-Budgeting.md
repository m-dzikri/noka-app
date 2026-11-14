# RFC-012: Monthly Category Budgeting & Overspending Alerts

**Features**: F20
**Depends on**: RFC-001, RFC-002, RFC-006, RFC-007, RFC-009, RFC-010
**Rules**: ARCH-2, API-1, API-2, DATA-1, DATA-2, DATA-4, SEC-1, OFFLINE-2, OFFLINE-3, UI-1, UI-3, I18N-1, TEST-1, TEST-2, QUAL-2
**Complexity**: Medium

---

## Summary

Mengimplementasikan fitur penetapan anggaran bulanan per kategori pengeluaran (`F20`, `FR-17`, `DEC-3`). Pengguna dapat menentukan batas maksimal pengeluaran (IDR integer) untuk setiap kategori pada siklus bulanan aktif pengguna (`cycleStartDay`). Sistem menyajikan indikator visual bilah progres pemakaian real-time, statistik sisa anggaran, dan peringatan ambang batas (*alert*) saat pemakaian mendekati (≥ 80%) atau melebihi (≥ 100%) anggaran. Mendukung *offline-first* dengan IndexedDB mirror dan antrean mutasi outbox.

---

## Technical Approach

### 1. Model Data Database & Migrasi Skema (`DATA-1`, `DATA-4`)
- Tabel baru: `category_budgets` (`src/db/schema/finance.ts`):
  - `id`: `uuid` PK default `gen_random_uuid()`
  - `user_id`: `uuid` NOT NULL, FK `users.id` ON DELETE CASCADE
  - `category_id`: `uuid` NOT NULL, FK `categories.id` ON DELETE CASCADE
  - `amount`: `bigint` NOT NULL (Batas anggaran IDR, wajib integer > 0)
  - `period_month`: `varchar(7)` NOT NULL (Format `YYYY-MM` selaras dengan awal siklus pengguna)
  - `created_at`: `timestamptz` NOT NULL default `NOW()`
  - `updated_at`: `timestamptz` NOT NULL default `NOW()`
  - *Constraints & Index:*
    - UNIQUE constraint pada `(user_id, category_id, period_month)`
    - Index pada `(user_id, period_month)` untuk pemuatan cepat di dashboard

### 2. Logika Agregasi Real-Time & Ambang Batas (*Thresholds*)
- Menghitung realisasi pengeluaran:
  - `spent_amount`: `SUM(transactions.amount)` untuk `type = 'EXPENSE'` pada kategori terkait dalam jendela siklus aktif `[cycleStartDate, cycleEndDate)`.
  - `remaining_amount`: `amount - spent_amount` (bisa bernilai negatif jika overbudget).
  - `percentage`: `floor((spent_amount * 100) / amount)` (0% jika belum ada pengeluaran).
- Klasifikasi Status & Indikator Warna:
  - `< 80%`: `normal` (Bilah Hijau / Aksen Noka)
  - `80% - 99%`: `warning` (Bilah Oranye / Kuning Waspada)
  - `≥ 100%`: `exceeded` (Bilah Merah / Peringatan Melebihi Anggaran)

### 3. API Contracts (`API-1`, `API-2`, `SEC-1`)
- `GET /api/finance/budgets?period=YYYY-MM`:
  - Mengembalikan daftar anggaran kategori pada periode terkait beserta kalkulasi `spentAmount`, `remainingAmount`, dan `percentage`.
- `POST /api/finance/budgets`:
  - Body: `{ categoryId: string, amount: number|string, period: string, idempotencyKey?: string }`
  - Upsert (insert atau update jika sudah ada anggaran pada kategori & periode yang sama).
- `DELETE /api/finance/budgets/[id]`:
  - Menghapus batas anggaran kategori (kategori tetap ada, hanya batas anggarannya yang dilepas).

### 4. Dukungan Offline-First & Sinkronisasi (`OFFLINE-2`, `OFFLINE-3`)
- Menambahkan store IndexedDB `category_budgets` pada `src/features/sync/db.ts`.
- Mutasi lokal melalui outbox:
  - `op: "upsert"`, `entity: "budget"`, `path: "/api/finance/budgets"`
  - `op: "delete"`, `entity: "budget"`, `path: "/api/finance/budgets/[id]"`
- Saat offline, ringkasan pemakaian anggaran dihitung langsung dari IndexedDB mirror (`transactions` lokal).
- Pembersihan total saat Logout / 401 selaras dengan `RFC-009` & `RFC-010`.

### 5. UI Integration pada Finance Workspace
- Bagian baru *"Anggaran Kategori"* (*Category Budgeting*) di `/app/finance` di bawah ringkasan Safe-to-Spend.
- Kartu kategori menampilkan:
  - Nama & icon kategori.
  - Nominal terpakai vs total anggaran (contoh: `Rp850.000 / Rp1.000.000`).
  - Bilah progres (*Progress Bar*) beranimasi halus dengan warna status.
  - Badge peringatan visual jika mencapai ambang batas 80% atau 100%.
- Modal kelola anggaran (`BudgetManagerModal.tsx`) untuk menambah/mengedit batas per kategori dalam siklus aktif.

---

## API Contracts Exposed

- `GET /api/finance/budgets`
  - Query: `period` (`YYYY-MM` opsional, default: bulan siklus aktif)
  - Success `200`: `{ ok: true, data: { period, items: Array<CategoryBudgetDto> } }`
  - Error: `401`, `422 VALIDATION_ERROR`
- `POST /api/finance/budgets`
  - Body: `{ categoryId: UUID, amount: string|number, period: YYYY-MM, idempotencyKey?: UUID }`
  - Success `200` / `201`: `{ ok: true, data: { budget: CategoryBudgetDto } }`
  - Error: `400`, `401`, `403 CSRF`, `404 CATEGORY_NOT_FOUND`, `422 INVALID_AMOUNT`
- `DELETE /api/finance/budgets/[id]`
  - Success `200`: `{ ok: true, data: { deleted: true, id: UUID } }`
  - Error: `401`, `403 CSRF`, `404 BUDGET_NOT_FOUND`

---

## Implementation Details

### File Structure
- `src/db/schema/finance.ts` (penambahan tabel `categoryBudgets`)
- `src/features/finance/budget-service.ts`: Logika CRUD dan agregasi anggaran per siklus.
- `src/app/api/finance/budgets/route.ts`, `src/app/api/finance/budgets/[id]/route.ts`
- `src/components/finance/CategoryBudgetSection.tsx`: Komponen UI daftar bilah progres anggaran.
- `src/components/finance/BudgetManagerModal.tsx`: Modal penetapan batas anggaran.
- `src/features/sync/db.ts`: Skema IndexedDB mirror store `category_budgets`.
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/{id,en}.ts`: Key `finance.budgets.*`.
- `tests/unit/category-budgets.test.ts`: Uji kalkulasi persentase, ambang batas 80%/100%, dan penanganan overbudget.
- `tests/integration/category-budgets-api.test.ts`: Uji endpoint API, upsert atomik, dan proteksi tenant.

---

## Acceptance Criteria

- [ ] **AC-12.1 (Skema Database & Integritas IDR — `F20`, `DATA-1`, `DATA-4`):** Tabel `category_budgets` menyimpan nominal batas anggaran dalam `bigint` (integer IDR > 0), terikat ke `userId` dan `categoryId` dengan constraint UNIQUE per `(user_id, category_id, period_month)`. Penghapusan kategori otomatis mengalir (*CASCADE*) ke anggarannya.
- [ ] **AC-12.2 (Kalkulasi Persentase & Status Ambang Batas — `F20`, `UI-1`):** Sistem menghitung pemakaian anggaran secara real-time terhadap transaksi pengeluaran dalam rentang tanggal siklus aktif. Status diklasifikasikan dengan akurat: `<80%` (Normal), `80%–99%` (Warning), dan `≥100%` (Exceeded).
- [ ] **AC-12.3 (API Lifecycle & Upsert Idempoten — `F20`, `API-1`, `API-2`):** `POST /api/finance/budgets` dapat membuat batas baru atau memperbarui batas yang ada secara atomik dan idempoten berdasarkan parameter `idempotencyKey`.
- [ ] **AC-12.4 (Offline Mirror & Outbox Sync — `F20`, `OFFLINE-2`, `OFFLINE-3`):** Batas anggaran tersimpan di IndexedDB mirror; pengguna dapat menetapkan anggaran saat offline dan perubahan disinkronkan tanpa konflik saat online kembali.
- [ ] **AC-12.5 (Peringatan Visual & UI Responsif — `F20`, `UI-3`, `I18N-1`):** Komponen `CategoryBudgetSection` menampilkan bilah progres interaktif dan badge peringatan visual yang mudah dibaca di mobile dan desktop dalam bahasa Indonesia dan Inggris.
- [ ] **AC-12.6 (Pembersihan Data saat Logout — `F20`, `OFFLINE-5`):** Seluruh data anggaran lokal di IndexedDB terhapus bersih saat pengguna melakukan Logout atau terjadi sesi 401.

---

## Implementation Considerations

- **Siklus Tanggal Kustom (`cycleStartDay`):** Format `period_month` merepresentasikan bulan awal siklus. Jika siklus pengguna dimulai tanggal 25, maka periode `2026-11` mencakup rentang `25 Nov 2026 – 24 Des 2026`.
- **Handling Kategori Tanpa Anggaran:** Kategori yang belum memiliki anggaran tidak menampilkan bilah persentase, tetapi tersedia di daftar pembuat anggaran baru.
