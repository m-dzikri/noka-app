# RFC-008: Noka Synergy — Smart Quick Capture & Linked Notes ↔ Transactions

**Features**: F14, F15
**Depends on**: RFC-004, RFC-006, RFC-007
**Rules**: STACK-6, ARCH-1, ARCH-2, ARCH-3, ARCH-4, ARCH-5, DATA-1, DATA-3, DATA-4, DATA-6, API-1, API-2, API-3, SEC-1, SEC-4, UI-3, UI-4, UI-5, I18N-1, I18N-2, I18N-3, PERF-2, TEST-1, TEST-2, TEST-3, QUAL-2, QUAL-3
**Complexity**: High

---

## Summary

Menghadirkan dua fitur pembeda inti yang menyatukan Catatan dan Keuangan Noka:
1. **Smart Quick Capture (`F14`, `FR-11`, `DEC-4`, `DEC-15`, `MED-1`)**: Bilah input cepat global pada `AppShell` (`Ctrl/Cmd + K`, `/` di luar field aktif, dan tombol cepat mobile) berbasis **parser aturan lokal** (`<= 50 ms`, 100% offline, tanpa LLM) beserta pratinjau instan & mode edit manual.
2. **Linked Notes ↔ Transactions (`F15`, `FR-12`, `DEC-13`, `DEC-14`)**: Penautan relasi 1 Catatan -> N Transaksi (`income`/`expense` saja, bukan `transfer`) beserta panel rekap **Total Keluar**, **Total Masuk**, dan **Selisih Bersih (Net)** via `<PrivacyAmount />` di `NoteEditor` (desktop & mobile) serta lencana tautan balik ke `/app/notes/[noteId]` pada `LedgerList`.

---

## Technical Approach

### 1. Conservative Rule-Based Quick Capture Parser (`F14`, `ARCH-3`, `I18N-3`, `DEC-15`, `MED-1`)
- `src/features/quick-capture/types.ts`: `QuickCaptureContext { wallets: WalletSummary[]; categories: CategorySummary[]; defaultWalletId: string | null }` dan `QuickCaptureParseResult`:
  - `{ intent: "note"; title: string; content: string }` *(untuk input kosong `{ title: "", content: "" }`; untuk input non-kosong `{ title: firstLine.slice(0, 120), content: trimmedInput }`)*
  - `{ intent: "transaction"; type: "income" | "expense"; amount: number; walletId: string | null; categoryId: string | null; description: string }`.
- `src/features/quick-capture/keywords.ts`: mendefinisikan `INCOME_KEYWORDS` + pengecualian frasa non-uang (`"terima kasih"`, `"thank you"`) serta sinonim bilingual (`ID`/`EN`) untuk seluruh **12 `systemKey`** (`RFC-002`: `food_drink`, `transport`, `shopping`, `bills`, `entertainment`, `health`, `education`, `other_expense`, `salary`, `bonus`, `refund`, `other_income`).
- `src/features/quick-capture/parser.ts` (`parseQuickCapture(input, context)`):
  ```text
  1. Trim input; if empty -> note { title: "", content: "" }.
  2. Mask non-monetary numeric tokens BEFORE scanning:
     - Tanggal: /\b\d{4}-\d{2}-\d{2}\b/g & /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g
     - Tahun: /\b(?:tahun|thn|year)\s+\d{4}\b/gi
     - Jam/waktu (tidak didahului rp/idr DAN tidak diikuti unit rb|ribu|k|jt|juta):
       /(?<!\b(?:rp\.?|idr)\s*)\b\d{1,2}[:.]\d{2}\b(?!\s*(?:rb|ribu|k|jt|juta)\b)/gi
     - Nomor konteks non-uang 1-2 digit (hanya bila TIDAK diikuti unit rb|ribu|k|jt|juta maupun pemisah desimal/ribuan `[.,]\d`):
       /\b(?:tgl|tanggal|date|bab|chapter|hal|halaman|page|jam|pukul|no|nomor|part|sesi|minggu|hari|ke)\s+\d{1,2}(?!\d|[.,]\d)(?!\s*(?:rb|ribu|k|jt|juta)\b)/gi
       # Menjaga "kopi 1.50 rb" -> 1500, "beli jam 25.000" -> 25000, & "beli jam 50 rb" -> 50000; memasking "meeting jam 10"!
  3. Scan token moneter pertama valid:
     /(?:^|\s)[+-]?\s*(?:rp\.?\s*|idr\s*)?(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(jt|juta|rb|ribu|k)?(?=\s|$|[,.!?;:)])/gi
     Diterima HANYA bila ada prefiks rp/idr, ATAU ada satuan (jt|juta|rb|ribu|k), ATAU ribuan "\d{1,3}(\.\d{3})+", ATAU integer polos >= 1000.
     Konversi Math.floor(num * mult); jika <= 0, > MAX_SAFE_INTEGER, atau absen -> note.
  4. Resolve transaction fields:
     - type: "income" jika "+" menempel di awal/token atau INCOME_KEYWORDS (setelah strip "terima kasih"/"thank you") cocok; else "expense".
     - walletId: filter dompet archivedAt === null; escape regex nama dompet, utamakan whole-word match terpanjang -> substring terpanjang -> active defaultWalletId -> dompet aktif pertama -> null jika 0 dompet aktif.
     - categoryId: cari kategori aktif bertipe sama (pencocokan kata/frasa batas kata nama kategori custom lebih dulu -> substring custom -> kamus sinonim systemKey -> fallback other_expense/other_income -> null).
     - description: sisa teks setelah membersihkan token nominal/dompet/prefix "+" dan spasi berlebih, fallback original trimmed input, dibatasi `.slice(0, 300)` agar selaras batas `RFC-006` (`varchar(300)`).
  ```

### 2. Global Client Controller (`WorkspaceChrome.tsx`) & `QuickCaptureBar` (`F14`, `UI-4`, `UI-5`)
- `src/components/layout/QuickCaptureBar.tsx`: props `{ wallets, categories, defaultWalletId, onSubmitNote, onSubmitTransaction, onClose? }` (`#noka-quick-capture-input`):
  - Pintasan `Ctrl/Cmd + K` dan `/` (abaikan bila `activeElement` adalah `INPUT`/`TEXTAREA`/`SELECT`/`[contenteditable]`), `Escape` menutup pratinjau, `Enter` submit (`Shift+Enter` baris baru di mode Catatan).
  - Cek **0 dompet aktif**: `activeWallets = wallets.filter(w => w.archivedAt === null)`. Jika `activeWallets.length === 0`, tombol simpan transaksi nonaktif dengan CTA menuju `/app/finance`, sementara simpan Catatan tetap aktif.
  - Tombol ubah manual (*Catatan ↔ Transaksi*) menyediakan editor chip/nominal inline (`type`, nominal integer saat konversi ke Transaksi, dompet, kategori), serta menampilkan pratinjau nominal via `<PrivacyAmount />`. State input Quick Capture dipertahankan oleh `PreferencesProvider` ketika tema/bahasa diganti tanpa reload (`I18N-2`).
- **Bridging RSC → Client (`src/components/layout/WorkspaceChrome.tsx`)**: komponen `"use client"` yang dipasang di `src/app/(app)/app/layout.tsx` untuk memanggil API submit note/transaction, menyambungkan `onMobileQuickAction` ke fokus `QuickCaptureBar`, menyegarkan daftar dompet/kategori saat menerima event `noka:finance-updated` (dari `RFC-006`/`007` modal), dan memancarkan `window.dispatchEvent(new CustomEvent("noka:workspace-updated"))` pasca-simpan.
  - Baik `FinanceWorkspace.tsx` (`/app/finance`) maupun `NotesWorkspace.tsx` (`/app/notes`) berlangganan event `noka:workspace-updated`: `FinanceWorkspace` menyegarkan `GET /api/finance/summary`, sementara `NotesWorkspace` menyegarkan daftar catatan/tag/folder **tanpa menimpa konten editor aktif yang belum tersimpan**.

### 3. Linked Notes ↔ Transactions (`F15`, `DATA-3`, `DATA-4`, `API-1`–`API-3`)
- `linked-transactions-service.ts` menggunakan `ApiError`/`handleApiError` & `withIdempotency`/`resolveLwwTimestamp` (`RFC-001`), memvalidasi UUID `[id]` & `[txId]` (`422 VALIDATION_ERROR`), `requireAuth`, dan `verifyCsrfOrigin`.
- `GET /api/notes/[id]/transactions`: verifikasi catatan aktif (`404 NOTE_NOT_FOUND`), return `{ items: TransactionDto[], summary: { totalIncome, totalExpense, net } }`.
- `POST /api/notes/[id]/transactions`: wajib memverifikasi kepemilikan catatan aktif (`notes.userId = userId AND deletedAt IS NULL -> 404 NOTE_NOT_FOUND`) pada **kedua** cabang body union `{ existingTransactionId: uuid, idempotencyKey?, updatedAt? }` (`200`) maupun `{ id?, walletId, categoryId, type, amount: int > 0, description?, occurredAt, idempotencyKey?, updatedAt? }` (`201`):
  - Untuk `existingTransactionId`: cari di `transactions` aktif milik `userId` (id transfer/user lain -> `404 TRANSACTION_NOT_FOUND`), cek **`resolveLwwTimestamp(tx.updatedAt, updatedAt)` terlebih dulu** -> bila `serverNewer` return `200 { transaction, summary, conflictResolved: "server_newer" }`; bila sudah tertaut ke `id` sama -> idempoten `200 { transaction, summary, conflictResolved: "applied" }`; bila tertaut ke catatan lain milik user -> `409 TRANSACTION_ALREADY_LINKED`; selain itu tautkan `note_id = id` -> `200 { transaction, summary, conflictResolved: "applied" }`.
  - Untuk buat transaksi baru langsung tertaut: validasi dompet non-arsip (`409 WALLET_ARCHIVED`), `category.type === type` (`422 CATEGORY_TYPE_MISMATCH`), UUID duplikat `23505 -> 409 RESOURCE_ALREADY_EXISTS`, lalu kembalikan `201 { transaction, summary, conflictResolved: "applied" }`.
- `DELETE /api/notes/[id]/transactions/[txId]`: body opsional (`{}` diizinkan pada body kosong); cek note & transaksi milik `userId` dengan `tx.noteId === id` (`404 TRANSACTION_NOT_FOUND` bila absen atau tertaut ke note lain), jalankan LWW (`serverNewer` -> `{ unlinked: false, txId, transaction, summary, conflictResolved: "server_newer" }`), else set `note_id = NULL` -> `200 { unlinked: true, txId, summary, conflictResolved: "applied" }`.
- **UI & Ledger Wiring**:
  - `NoteLinkedTransactionsPanel.tsx` dipasang ke `linkedTransactionsSlot` pada `NoteEditor` baik lewat `NotesWorkspace.tsx` (`renderLinkedTransactionsSlot` desktop split view `/app/notes`) maupun `notes/[id]/page.tsx`. Memuat pemilih transaksi **belum tertaut** melalui `GET /api/transactions?unlinked=true` (`RFC-006`) lengkap dengan dukungan paginasi `nextCursor` (**Muat Lebih Banyak / Load More**) sehingga transaksi lama di luar halaman pertama tetap dapat dipilih (`API-5`), menangani kondisi 0 dompet aktif pada form buat transaksi baru, dan menampilkan `Total Keluar`, `Total Masuk`, & `Net` lewat `<PrivacyAmount />`.
  - `src/features/finance/summary-service.ts` (`RFC-007`) diperbarui melakukan `LEFT JOIN notes ON transactions.note_id = notes.id AND notes.deleted_at IS NULL` untuk mengisi `noteTitle: string | null` pada DTO `LedgerItemDto` ledger `GET /api/finance/summary`.
  - `LedgerList.tsx` (`RFC-007`) menampilkan lencana tautan `<Link href={`/app/notes/${item.noteId}`}>` dengan `item.noteTitle || t.linkedNotes.untitledNote`.

---

## API Contracts Exposed

Semua route memakai amplop `API-1`, validasi UUID param (`422`), `400 INVALID_JSON` (kecuali DELETE kosong), `401`, `403 CSRF`:
- `GET /api/notes/[id]/transactions` -> `200` `{ items: TransactionDto[], summary: { totalIncome, totalExpense, net } }` | `404 NOTE_NOT_FOUND`.
- `POST /api/notes/[id]/transactions` -> `{ existingTransactionId, ... }` (`200`) atau `{ walletId, categoryId, type, amount, ... }` (`201`) -> `{ transaction, summary, conflictResolved }` | `404 NOTE_NOT_FOUND` / `TRANSACTION_NOT_FOUND` / `WALLET_NOT_FOUND` / `CATEGORY_NOT_FOUND` | `409 WALLET_ARCHIVED` / `TRANSACTION_ALREADY_LINKED` / `IDEMPOTENCY_KEY_CONFLICT` / `RESOURCE_ALREADY_EXISTS` | `422 CATEGORY_TYPE_MISMATCH`.
- `DELETE /api/notes/[id]/transactions/[txId]` -> `200` `{ unlinked: true | false, txId, transaction?, summary, conflictResolved }` | `404 NOTE_NOT_FOUND` / `TRANSACTION_NOT_FOUND`.

---

## Implementation Details

### File Structure
- `src/features/quick-capture/{types,keywords,parser}.ts`
- `src/features/notes/linked-transactions-service.ts`
- `src/features/finance/summary-service.ts` (diperbarui `LEFT JOIN notes WHERE deleted_at IS NULL` untuk menyertakan `noteTitle` pada `LedgerItemDto`)
- `src/app/api/notes/[id]/transactions/route.ts`, `src/app/api/notes/[id]/transactions/[txId]/route.ts`
- `src/components/layout/QuickCaptureBar.tsx`, `src/components/layout/WorkspaceChrome.tsx`, `src/app/(app)/app/layout.tsx`
- `src/components/notes/NoteLinkedTransactionsPanel.tsx`, `src/components/notes/NoteEditor.tsx`, `src/components/notes/NotesWorkspace.tsx`, `src/app/(app)/app/notes/page.tsx`, `src/app/(app)/app/notes/[id]/page.tsx`
- `src/components/finance/FinanceWorkspace.tsx` (listener `noka:workspace-updated` untuk menyegarkan summary/ledger) & `src/components/finance/LedgerList.tsx` (lencana backlink + fallback `untitledNote`)
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/{id,en}.ts` (menambahkan namespace `quickCapture` dan `linkedNotes`)
- `tests/unit/quick-capture-parser.test.ts`, `tests/unit/quick-capture-bar.test.tsx`, `tests/integration/linked-notes-transactions.test.ts`

---

## Acceptance Criteria

- [ ] **AC-8.1 (Parser Lokal Konservatif ≤ 50 ms — `F14`, `STACK-6`, `ARCH-3`, `I18N-3`, `PERF-2`):** `parseQuickCapture` (`types/keywords/parser.ts`) berjalan `< 50 ms` tanpa AI eksternal (`tests/unit/quick-capture-parser.test.ts`), memetakan Catatan `{ title, content }` rapi, mendukung ribuan multi-grup, desimal+unit (`1.5jt`, `kopi 1.50 rb`, `beli jam 25.000`, `beli jam 50 rb`), `+50rb`, `INCOME_KEYWORDS` vs `"terima kasih"` & default `"expense"`, integer `>= 1000` vs `< 1000`, `description` dibatasi `<= 300` char, pengecualian waktu/tanggal/tahun/nomor non-uang (`"bab 3 skripsi"`, `"meeting jam 10"` -> Catatan), pemilihan dompet aktif & `defaultWalletId` non-archived -> `null`, serta pencocokan custom category + seluruh 12 `systemKey` -> fallback `other_*`.
- [ ] **AC-8.2 (Global `WorkspaceChrome`, `QuickCaptureBar` & Live Refresh — `F14`, `ARCH-4`, `ARCH-5`, `I18N-2`, `UI-3`–`UI-5`):** `WorkspaceChrome.tsx` menghubungkan `QuickCaptureBar.tsx` + `onMobileQuickAction` di `(app)/app/layout.tsx`, merespons `Ctrl/Cmd + K`, `/` (kecuali field aktif), `Escape`, `Enter`/`Shift+Enter` (Catatan), mempertahankan input saat ganti bahasa/tema (`I18N-2`), mendukung edit/switch *Catatan ↔ Transaksi*, format `<PrivacyAmount />`, pesan nonaktif transaksi + CTA `/app/finance` saat 0 dompet aktif, listener `noka:finance-updated` & emit `noka:workspace-updated` (ditangkap `FinanceWorkspace` & `NotesWorkspace` tanpa menimpa draft editor aktif), bebas overflow `360px`/`768px`/`1280px` (`tests/unit/quick-capture-bar.test.tsx`).
- [ ] **AC-8.3 (Linked Notes ↔ Transactions & Ledger Backlink — `F15`, `DATA-3`, `DATA-4`, `API-1`–`API-3`, `SEC-1`, `SEC-4`):** `linked-transactions-service.ts`, `/api/notes/[id]/transactions/**` (`GET`, `POST` `200`/`201` dengan `conflictResolved: "applied"` + cek note aktif di kedua cabang, `DELETE` `[txId]`), serta `NoteLinkedTransactionsPanel.tsx` di `NoteEditor` (`NotesWorkspace`/`notes/page.tsx` & `notes/[id]/page.tsx`) memvalidasi UUID (`422`), isolasi `userId` (`404` termasuk transfer ID), CSRF (`403`), `withIdempotency` (`409`), `resolveLwwTimestamp` (`applied`/`server_newer`), `409 TRANSACTION_ALREADY_LINKED` / `WALLET_ARCHIVED`, `422 CATEGORY_TYPE_MISMATCH`, idempoten `200` re-link sama, `GET /api/transactions?unlinked=true` picker ber-cursor `nextCursor` (**Load More**), state 0 dompet aktif, dan rekap `Total Keluar`/`Total Masuk`/`Net` via `<PrivacyAmount />`; `summary-service.ts` menyertakan `noteTitle` (`LEFT JOIN notes`) dan `LedgerList.tsx` menampilkan link note (beserta fallback judul kosong) tanpa overflow `360px`/`768px`/`1280px`.
- [ ] **AC-8.4 (i18n & Tests — `I18N-1`, `TEST-1`–`TEST-3`, `QUAL-2`, `QUAL-3`):** Namespace `quickCapture` & `linkedNotes` terketik lengkap di `types.ts`/`id.ts`/`en.ts`; `tests/unit/quick-capture-parser.test.ts`, `tests/unit/quick-capture-bar.test.tsx`, `tests/integration/linked-notes-transactions.test.ts`, `npm run lint`, dan `npx tsc --noEmit` lulus penuh.
