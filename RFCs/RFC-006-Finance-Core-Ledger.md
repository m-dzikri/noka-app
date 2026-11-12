# RFC-006: Finance Core — Multi-Wallets, Categories, Ledger Transactions & Atomic Transfers

**Features**: F10, F11, F12
**Depends on**: RFC-001, RFC-002
**Rules**: ARCH-1, ARCH-2, DATA-1, DATA-2, DATA-3, DATA-4, DATA-6, API-1, API-2, API-3, API-5, SEC-1, SEC-4, UI-3, UI-4, UI-5, I18N-1, PERF-2, TEST-1, TEST-2, TEST-3, QUAL-2, QUAL-3
**Complexity**: High

---

## Summary

Membangun fondasi domain keuangan pribadi **Kas** (`F10`, `F11`, `F12`): pengelolaan Multi-Dompet (`cash`, `bank`, `ewallet`) IDR integer presisi aman (`bigint`) dengan saldo **selalu diturunkan dari ledger** (`DATA-2`, `DEC-11`) dan proteksi arsip wajib bagi dompet berriwayat (`DATA-4`), CRUD kategori custom dengan migrasi otomatis ke *Lainnya / Other* saat hapus kategori (`DATA-4`), pencatatan Pemasukan/Pengeluaran (termasuk query `unlinked=true` untuk `RFC-008`), dan **Transfer antar-dompet atomik** (`DATA-3`, `DEC-14`) beserta modal & dashboard dasar `/app/finance`.

*(Catatan integrasi: `RFC-006` menyediakan `formatIdr` dasar, komponen `FinanceWorkspace`, daftar dompet, dan 4 modal manajemen pada `/app/finance`; `RFC-007` memperkaya tampilan nominal dengan `<PrivacyAmount />`, Safe-to-Spend, dan ledger gabungan).*

---

## Technical Approach

### 1. Ledger-Derived Balances & Unified Currency Formatting (`F10`, `DATA-1`, `DATA-2`, `UI-4`)
- `src/features/finance/ledger.ts` (**100% pure TypeScript, bebas impor `@/db`/`pg`** agar aman dibundel di browser pada `RFC-009`): mengekspor `computeWalletBalances(wallets, transactions, transfers)`:
  ```text
  for each wallet w (w.deletedAt is null):
    income      = sum(tx.amount where tx.walletId == w.id and tx.type == 'income'  and tx.deletedAt is null)
    expense     = sum(tx.amount where tx.walletId == w.id and tx.type == 'expense' and tx.deletedAt is null)
    transferIn  = sum(tr.amount where tr.toWalletId == w.id   and tr.deletedAt is null)
    transferOut = sum(tr.amount where tr.fromWalletId == w.id and tr.deletedAt is null)
    currentBalance = w.initialBalance + income - expense + transferIn - transferOut
  ```
  - Helper agregasi SQL (`loadWalletsWithBalances(txOrDb, userId, options)`) tinggal di `src/features/finance/wallets-service.ts` dan memanggil `computeWalletBalances`.
- Field `balance`/`currentBalance` tidak pernah diterima dari payload klien (`DATA-2`).
- `src/features/finance/format.ts`: `formatIdr(amount: number, signMode: "plain" | "signed" = "plain"): string` memakai `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })` lalu membersihkan spasi/`\u00a0` antara `"Rp"` dan digit:
  - Contoh: `formatIdr(285000)` -> `"Rp285.000"`, `formatIdr(50000, "signed")` -> `"+Rp50.000"`, `formatIdr(-50000, "plain"|"signed")` -> `"-Rp50.000"`, `formatIdr(0, "plain"|"signed")` -> `"Rp0"`.

### 2. Referential Integrity, Edge Cases & Atomic Transfers (`DATA-3`, `DATA-4`, `HIGH-3`)
- **Dompet (`wallets-service.ts`)**:
  - `GET /api/wallets`: default `includeArchived = "false"`; urut `isDefault DESC, createdAt ASC`.
  - `POST /api/wallets`: default `includeInSafeToSpend = (type !== "bank")` bila omitted; dompet aktif pertama dipaksa `isDefault = true`; bila `isDefault: true`, clear `isDefault = false` pada dompet lain user dalam transaksi DB sama.
  - `PATCH /api/wallets/[id]`: tolak body `{}` kosong (`422 VALIDATION_ERROR`); menolak `{ isDefault: true, archived: true }` (`422 VALIDATION_ERROR`); mengubah `type` **tidak** mengubah `includeInSafeToSpend` kecuali eksplisit dikirim; menyetel `isDefault: true` pada dompet berarsip (tanpa `archived: false`) ditolak `409 WALLET_ARCHIVED`; bila `isDefault: true` valid -> clear `isDefault` pada dompet user lain; `isDefault: false` diperbolehkan; `archived: true` pada dompet `isDefault = true` menonaktifkan `isDefault` dan mempromosikan dompet aktif tertua tersisa (`deletedAt IS NULL AND archivedAt IS NULL ORDER BY createdAt ASC LIMIT 1`); `archived: false` menghapus `archivedAt` dan mempromosikan `isDefault = true` bila belum ada default aktif.
  - `DELETE /api/wallets/[id]`: dalam `db.transaction`, verifikasi ownership aktif (`404 WALLET_NOT_FOUND`), jalankan LWW (`resolveLwwTimestamp`), lalu hitung **semua** `transactions` (`walletId = id`, termasuk tombstones `deletedAt IS NOT NULL`) + **semua** `transfers` (`fromWalletId = id OR toWalletId = id`, termasuk tombstones `deletedAt IS NOT NULL`). Jika `> 0` -> lempar `ApiError(409, "WALLET_HAS_HISTORY")`. Jika `0` -> hard-delete dompet dan promosikan dompet aktif tertua tersisa bila tadinya `isDefault`.
- **Kategori (`categories-service.ts`)**:
  - `GET /api/categories`: urut `isSystem DESC, name ASC`.
  - Keunikan custom category mengecek seluruh kategori aktif `(userId, type, lower(name)) WHERE deleted_at IS NULL` **termasuk kategori sistem** (`409 CATEGORY_ALREADY_EXISTS`; self-rename case-insensitive -> `200`). Kategori sistem menolak `PATCH` (`403 CANNOT_MODIFY_SYSTEM_CATEGORY`) & `DELETE` (`403 CANNOT_DELETE_SYSTEM_CATEGORY`) **sebelum** pengecekan `resolveLwwTimestamp` (kategori sistem tidak dapat diubah/dihapus dengan timestamp mana pun). `PATCH /api/categories/[id]` hanya menerima `{ name, idempotencyKey?, updatedAt? }` (`422 VALIDATION_ERROR` jika mencoba mengubah `type` atau mengirim field tidak dikenal).
  - `DELETE /api/categories/[id]`: setelah LWW, dalam `db.transaction` pindahkan seluruh transaksi aktif (`WHERE user_id = userId AND category_id = targetId AND deleted_at IS NULL`) ke kategori `other_expense` / `other_income` (`reassignedCount`), lalu soft-delete kategori (`deletedAt = NOW(), updatedAt = nextUpdatedAt`).
- **Transaksi (`transactions-service.ts`)**:
  - `POST`/`PATCH`: validasi ownership `walletId` (`404 WALLET_NOT_FOUND`), `categoryId` (`404 CATEGORY_NOT_FOUND`), dan kecocokan `category.type === effectiveType` (`422 CATEGORY_TYPE_MISMATCH`). Cek `wallet.archivedAt === null` (`409 WALLET_ARCHIVED`) diberlakukan saat `POST`, saat `PATCH` mengganti `walletId`, atau saat `PATCH` mengubah `amount`/`type` (sedangkan pelepasan `noteId: null` atau edit deskripsi catatan historis pada dompet yang baru diarsipkan tetap aman!). Jika `noteId` non-null dikirim, cek note aktif milik `userId` (`404 NOTE_NOT_FOUND`); `noteId: null` melepas tautan, `undefined` mempertahankan. `DELETE` menandai `deletedAt = NOW()`.
- **Transfer (`transfers-service.ts`)**:
  - Zod & service menolak `effectiveFromWalletId === effectiveToWalletId` (`422 SAME_WALLET_TRANSFER`, termasuk saat `PATCH` mengubah satu sisi wallet!), cek `archivedAt === null` pada kedua dompet saat `POST`, ganti wallet, atau ubah nominal (`409 WALLET_ARCHIVED`). `DELETE` melakukan soft-delete (`deletedAt = NOW()`) yang membalikkan saldo kedua dompet secara atomik tanpa menyentuh cashflow (`FR-9`, `DATA-3`).

### 3. Zod Bounds, Uniform `API-3` / LWW, Pagination & Modals (`API-1`–`API-5`, `DATA-6`)
- **Validasi Ketat (`schemas.ts`, `API-2`)**: Semua `[id]` route params divalidasi UUID (`422 VALIDATION_ERROR`). Nominal: `amount` integer `1..Number.MAX_SAFE_INTEGER`, `initialBalance` integer `0..Number.MAX_SAFE_INTEGER`. Strings: wallet `name` `1..80`, category `name` `1..60`, `description`/`note` `max 300 | null`, `occurredAt` ISO-8601 datetime (`YYYY-MM-DD` diterima sebagai tengah malam atau konversi UTC eksplisit). Semua `PATCH` menolak body `{}` kosong (`422`).
- **Idempotency & LWW (`src/lib/idempotency.ts` dari `RFC-001`)**:
  - Seluruh mutasi `POST`/`PATCH`/`DELETE` menerima `Idempotency-Key` (header atau property JSON `idempotencyKey` `1..128` char; dihapus sebelum hashing). Pada `POST`, bila `id?` duplikat atau keunikan kategori dilanggar di dalam `withIdempotency`, lemparkan `ApiError(409, "RESOURCE_ALREADY_EXISTS" | "CATEGORY_ALREADY_EXISTS")` (termasuk menerjemahkan PG `23505` sebelum keluar handler TX) sehingga transaksi domain mengalami rollback penuh namun status `409` tetap dipersistensikan di `idempotency_keys` (`RFC-001`); `POST` `updatedAt?` opsional di-clamp `<= serverNow + 60_000 ms` tanpa LWW.
  - `PATCH` dan `DELETE` menerapkan `resolveLwwTimestamp(row.updatedAt, clientUpdatedAt)`. HTTP `DELETE` dengan body kosong diperlakukan sebagai `{}` (tanpa `400 INVALID_JSON`); bila `serverNewer === true`, kembalikan `200` `{ deleted: false, id, [entity], conflictResolved: "server_newer" }` sebelum cek hapus (`409 WALLET_HAS_HISTORY` tetap dicek sesudah LWW)!
- **Query Date Bounds & Cursor (`API-5`)**:
  - `GET /api/transactions` (hanya `income`/`expense`, mendukung `unlinked?: "true"` untuk `note_id IS NULL` milik `RFC-008`) & `GET /api/transfers` (`walletId` cocok `fromWalletId OR toWalletId`): menerima `from`/`to` (`YYYY-MM-DD` dipetakan ke awal/akhir hari berdasarkan `tzOffset` `-720..840` default `420` UTC+7, atau ISO-8601; `from > to -> 422`), `limit` `1..100` (default `50`), `ORDER BY occurred_at DESC, created_at DESC, id DESC`, dan keyset cursor base64url `{ o, c, i }` (`400 INVALID_CURSOR`).
- **UI Modals & Client Workspace (`FinanceWorkspace.tsx`)**:
  - Server Component `src/app/(app)/app/finance/page.tsx` memuat dompet & kategori awal di server (`ARCH-1`) lalu merender `src/components/finance/FinanceWorkspace.tsx` (`"use client"`) yang mengelola daftar dompet ber-saldo serta ke-4 modal (`WalletManagerModal`, `CategoryManagerModal` dengan kunci kategori sistem & konfirmasi migrate *Lainnya*, `TransactionFormModal` mode `create`/`edit`, `TransferFormModal` mode `create`/`edit`). Sukses mutasi memanggil `onSuccess()` untuk menyegarkan state dan memancarkan `window.dispatchEvent(new CustomEvent("noka:finance-updated"))` agar `QuickCaptureBar` (`RFC-008`) tersinkron; `409 WALLET_HAS_HISTORY` memunculkan tawaran **Arsipkan Dompet** satu-klik.

---

## API Contracts Exposed

Semua route memakai amplop `API-1` (`apiOk`/`apiError`/`handleApiError`), `requireAuth`, `verifyCsrfOrigin` pada mutasi, validasi UUID param (`422`), `400 INVALID_JSON` (kecuali DELETE body kosong), dan Zod (`422`):
- **DTOs**: `WalletWithBalanceDto`, `CategoryDto`, `TransactionDto`, `TransferDto` (semua timestamp ISO-8601).
- `GET /api/wallets` (`{ includeArchived? }`) -> `200` `{ wallets }`; `POST /api/wallets` -> `201` `{ wallet }` | `409 RESOURCE_ALREADY_EXISTS`; `PATCH /api/wallets/[id]` -> `200` `{ wallet, conflictResolved }` | `404 WALLET_NOT_FOUND` | `409 WALLET_ARCHIVED`; `DELETE /api/wallets/[id]` -> `200` `{ deleted: true, id, conflictResolved: "applied" }` | `{ deleted: false, id, wallet, conflictResolved: "server_newer" }` | `404 WALLET_NOT_FOUND` | `409 WALLET_HAS_HISTORY`.
- `GET /api/categories` (`{ type? }`) -> `200` `{ categories }`; `POST /api/categories` -> `201` `{ category }` | `409 CATEGORY_ALREADY_EXISTS` / `RESOURCE_ALREADY_EXISTS`; `PATCH /api/categories/[id]` -> `200` `{ category, conflictResolved }` | `403 CANNOT_MODIFY_SYSTEM_CATEGORY` | `404 CATEGORY_NOT_FOUND` | `409 CATEGORY_ALREADY_EXISTS`; `DELETE /api/categories/[id]` -> `200` `{ deleted: true, id, reassignedCount, conflictResolved: "applied" }` | `{ deleted: false, id, category, conflictResolved: "server_newer" }` | `403 CANNOT_DELETE_SYSTEM_CATEGORY` | `404 CATEGORY_NOT_FOUND`.
- `GET /api/transactions` (`{ from?, to?, tzOffset?, walletId?, type?, categoryId?, unlinked?, limit?, cursor? }`) -> `200` `{ items, nextCursor }` | `400 INVALID_CURSOR`; `POST /api/transactions` -> `201` `{ transaction }` | `404 WALLET_NOT_FOUND` / `CATEGORY_NOT_FOUND` / `NOTE_NOT_FOUND` | `409 WALLET_ARCHIVED` / `RESOURCE_ALREADY_EXISTS` | `422 CATEGORY_TYPE_MISMATCH`; `PATCH /api/transactions/[id]` -> `200` `{ transaction, conflictResolved }` | `404 TRANSACTION_NOT_FOUND` / `WALLET_NOT_FOUND` / `CATEGORY_NOT_FOUND` / `NOTE_NOT_FOUND` | `409 WALLET_ARCHIVED` | `422 CATEGORY_TYPE_MISMATCH`; `DELETE /api/transactions/[id]` -> `200` `{ deleted, id, transaction?, conflictResolved }` | `404 TRANSACTION_NOT_FOUND`.
- `GET /api/transfers` (`{ from?, to?, tzOffset?, walletId?, limit?, cursor? }`) -> `200` `{ items, nextCursor }` | `400 INVALID_CURSOR`; `POST /api/transfers` -> `201` `{ transfer }` | `404 WALLET_NOT_FOUND` | `409 WALLET_ARCHIVED` / `RESOURCE_ALREADY_EXISTS` | `422 SAME_WALLET_TRANSFER`; `PATCH /api/transfers/[id]` -> `200` `{ transfer, conflictResolved }` | `404 TRANSFER_NOT_FOUND` / `WALLET_NOT_FOUND` | `409 WALLET_ARCHIVED` | `422 SAME_WALLET_TRANSFER`; `DELETE /api/transfers/[id]` -> `200` `{ deleted, id, transfer?, conflictResolved }` | `404 TRANSFER_NOT_FOUND`.

---

## Implementation Details

### File Structure
- `src/features/finance/schemas.ts`, `src/features/finance/format.ts`, `src/features/finance/ledger.ts` (`computeWalletBalances` murni bebas `@/db`)
- `src/features/finance/wallets-service.ts` (`loadWalletsWithBalances` SQL + CRUD), `src/features/finance/categories-service.ts`, `src/features/finance/transactions-service.ts`, `src/features/finance/transfers-service.ts`
- `src/app/api/wallets/route.ts`, `src/app/api/wallets/[id]/route.ts`, `src/app/api/categories/route.ts`, `src/app/api/categories/[id]/route.ts`
- `src/app/api/transactions/route.ts`, `src/app/api/transactions/[id]/route.ts`, `src/app/api/transfers/route.ts`, `src/app/api/transfers/[id]/route.ts`
- `src/components/finance/FinanceWorkspace.tsx`, `src/components/finance/WalletManagerModal.tsx`, `src/components/finance/CategoryManagerModal.tsx`, `src/components/finance/TransactionFormModal.tsx`, `src/components/finance/TransferFormModal.tsx`
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/{id,en}.ts` (menambahkan namespace `finance` & memperkaya key `categories`)
- `src/app/(app)/app/finance/page.tsx`
- `tests/unit/finance-ledger.test.ts`, `tests/integration/finance-wallets-categories.test.ts`, `tests/integration/finance-transfers.test.ts`

---

## Acceptance Criteria

- [x] **AC-6.1 (IDR Bigint, `formatIdr`, Ledger Balance & Envelopes — `F10`, `DATA-1`, `DATA-2`, `API-1`, `API-2`, `UI-4`):** Seluruh endpoint finance memakai amplop `API-1` dan skema di `src/features/finance/schemas.ts`, validasi `[id]` UUID & nominal integer (`0/1..MAX_SAFE_INTEGER`, tolak `balance` klien & `PATCH {}`), `400 INVALID_JSON`, dan `401`; `ledger.ts` (murni tanpa impor `@/db`) menghitung saldo via `computeWalletBalances` dari `initialBalance + income - expense + transferIn - transferOut` (tanpa tombstones) dan dipanggil oleh `wallets-service.ts` (`loadWalletsWithBalances`); `format.ts` (`formatIdr`) memformat `"Rp285.000"`, `"+Rp50.000"`, `"-Rp50.000"`, `"Rp0"`.
- [x] **AC-6.2 (Lifecycle Dompet, Default, Arsip, Idempotency & LWW — `F10`, `DATA-4`, `API-3`, `DATA-6`):** `wallets-service.ts` + `/api/wallets/**` mendukung `includeArchived` (urut `isDefault DESC, createdAt ASC`), default `includeInSafeToSpend`, promosi `isDefault` saat dompet pertama/unarchive/archive/delete & pembersihan default lama, penolakan `{ isDefault: true, archived: true }` (`422`) & menyetel `isDefault: true` pada dompet berarsip tanpa membuka arsip (`409 WALLET_ARCHIVED`), penolakan `DELETE` berriwayat (termasuk tombstones) via `409 WALLET_HAS_HISTORY` sesudah LWW (+ tawaran arsip di `WalletManagerModal`), `withIdempotency` + `23505 -> 409`, dan LWW `resolveLwwTimestamp` termasuk empty-body `DELETE`.
- [x] **AC-6.3 (Kategori Custom, Migrasi, Idempotency & LWW — `F11`, `DATA-4`, `API-3`, `DATA-6`, `I18N-1`):** `categories-service.ts`, `/api/categories/**` (`?type=`, urut `isSystem DESC, name ASC`), dan `CategoryManagerModal` menolak duplikat inklusif kategori sistem (`409`, kecuali self-rename `200`), melindungi `isSystem = true` (`403` sebelum LWW) serta menolak perubahan `type` di `PATCH`, menerapkan `withIdempotency` + `resolveLwwTimestamp`, melokalisasi via `id.ts`/`en.ts`, serta memindah transaksi aktif ke `other_expense`/`other_income` (`reassignedCount`) + soft-delete saat hapus custom.
- [x] **AC-6.4 (Transaksi, Transfer Atomik, Filter & Keyset Cursor — `F11`, `F12`, `DATA-3`, `API-3`, `API-5`):** `transactions-service.ts`, `transfers-service.ts`, `/api/transactions/**`, dan `/api/transfers/**` memvalidasi dompet aktif (`409`), `category.type` (termasuk ubah `type` di `PATCH`), `noteId` (`404` / `null` unlinks / `undefined` preserved), same-wallet check di `POST` & `PATCH` transfer (`422`), soft-delete pembalik saldo atomik bebas cashflow, `withIdempotency` + `resolveLwwTimestamp`, query `unlinked=true`, `from`/`to` berbasis `tzOffset` (`from > to -> 422`), `walletId` transfer (`from OR to`), serta keyset cursor (`occurredAt DESC, createdAt DESC, id DESC`, default `50` max `100`, `400 INVALID_CURSOR`).
- [x] **AC-6.5 (UI Workspace/Modals, Event Sync, i18n, Security & Tests — `SEC-1`, `SEC-4`, `UI-3`, `UI-5`, `TEST-1`–`TEST-3`, `QUAL-2`, `QUAL-3`):** Server Component `/app/finance/page.tsx` merender `FinanceWorkspace.tsx` (`"use client"`) yang menampilkan daftar dompet ber-saldo terformat & 4 modal (`WalletManagerModal`, `CategoryManagerModal`, `TransactionFormModal` create/edit, `TransferFormModal` create/edit) dengan kamus `finance.*` ID/EN (`types.ts`), keyboard/focus-visible/ARIA (`UI-5`), `noka:finance-updated` event, bebas overflow `360px`/`768px`/`1280px`; akses lintas `userId`/CSRF ditolak (`404`/`403`); `tests/unit/finance-ledger.test.ts`, `tests/integration/finance-wallets-categories.test.ts`, `tests/integration/finance-transfers.test.ts`, `npm run lint`, dan `npx tsc --noEmit` lulus penuh.

---

## Implementation Considerations

- **Visual System (`CHANGE-REQUEST-002`, `UI-1`–`UI-3`):** `FinanceWorkspace` dan seluruh 4 modal (`WalletManagerModal`, `CategoryManagerModal`, `TransactionFormModal`, `TransferFormModal`) memakai kontainer `max-w-[1360px]` `AppShell`, primitif `Modal`/`Button`/`Input`/`Card` ber-radius lembut (`rounded-2xl`/`rounded-full`), dan token kontras AA (`--bg-surface` `#f7f7f6`/`#222222`, `--border-default` `>= 3:1` untuk input, `--status-income`/`--status-expense` terkalibrasi di atas `#ededed`/`#f7f7f6` tanpa `#ffffff`/`#000000` murni).

---

## Implementation Notes

- **Shared Route Helpers (`src/lib/route-helpers.ts`):** Mengekstraksi `parseUuidRouteParam`, `parseOptionalJsonBody`, `resolveIdempotencyKey`, dan `validateZodSchema` ke modul bersama agar endpoint Notes dan Finance berbagi kontrak validasi/idempotensi identik tanpa duplikasi (`src/features/notes/route-helpers.ts` tetap me-re-export demi kompatibilitas).
- **Atomic Category Uniqueness Index (`src/db/migrations/0002_categories_active_name_idx.sql`):** Menambahkan partial unique index `(user_id, type, lower(name)) WHERE deleted_at IS NULL` pada tabel `categories` untuk menjamin keunikan nama kategori aktif case-insensitive bebas race condition di level PostgreSQL.
- **Pure Client Test & E2E Additions:** Menambahkan `tests/unit/finance-workspace.test.tsx` (untuk menguji perilaku komponen React `FinanceWorkspace` + tawaran arsip `409 WALLET_HAS_HISTORY` + listener `noka:finance-updated` di `jsdom` karena proyek Vitest `integration` berjalan di lingkungan `node`) serta `tests/e2e/finance-workspace.spec.ts` untuk cakupan end-to-end desktop & mobile.
- **Post-Review Hardening (`REVIEW-RFC-006`):** Menyetel `fileParallelism: false` dan `testTimeout: 15_000` pada proyek `integration` di `vitest.config.ts` agar `npm test` penuh berjalan deterministik; mempromosikan dompet aktif lain saat `PATCH /api/wallets/:id` melepas `isDefault: false` di `src/features/finance/wallets-service.ts`; serta mereset `filterCategoryId` saat `filterType` berubah ke tipe yang tidak cocok, mewajibkan modal konfirmasi sebelum menghapus transaksi/transfer ledger, dan menampilkan error respons non-2xx untuk seluruh permintaan sekunder maupun `Muat Lebih Banyak` di `src/components/finance/FinanceWorkspace.tsx`.
