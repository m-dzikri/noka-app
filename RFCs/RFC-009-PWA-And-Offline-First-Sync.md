# RFC-009: PWA Installability, IndexedDB Local Mirror & iOS-Safe Offline Sync

**Features**: F18, F19
**Depends on**: RFC-001, RFC-002, RFC-003, RFC-004, RFC-005, RFC-006, RFC-007, RFC-008
**Rules**: STACK-5, ARCH-1, DATA-1, DATA-2, DATA-3, DATA-4, DATA-5, DATA-6, API-1, API-2, API-3, SEC-1, OFFLINE-1, OFFLINE-2, OFFLINE-3, OFFLINE-4, OFFLINE-5, UI-3, UI-5, UI-6, I18N-1, I18N-2, PERF-2, TEST-1, TEST-4, TEST-5, QUAL-2, QUAL-3
**Complexity**: High

---

## Summary

Menjadikan Noka dapat dipasang sebagai **PWA (*Progressive Web App*)** dan bekerja secara **Offline-First** yang aman pada **iOS Safari** (`F18`, `F19`, `FR-16`, `FR-17`, `DEC-8`, `DEC-11`, `DEC-16`, `HIGH-1`, `HIGH-4`):
- `src/app/manifest.ts` + `public/sw.js` yang memisahkan **cache statis non-privat** (`noka-shell-v1`: `/_next/static/*`, `/icons/*`, `/offline.html` statis) dari **cache privat per sesi** (`noka-private-v1`: dokumen SSR `/app/*` berpenjaga `!res.redirected && res.ok` + gambar `/api/attachments/*`), sehingga **100% HTML SSR terautentikasi & foto ikut terhapus saat Logout (`OFFLINE-5`)**.
- Mirror lokal IndexedDB `idb@8.0.4` terisolasi per `userId` + antrean outbox iOS-safe (startup, `online`, `visibilitychange`/`focus`, **Sync Now** — zero `Background Sync API`).
- Cakupan write offline jelas: **Notes (+ tags/GFM), Folders, Transactions (+ Quick Capture & Linked Notes), dan Transfers**; sementara **Wallet CRUD, Category CRUD, Unggah/Hapus Lampiran Gambar (`RFC-005`), dan Pengaturan/Hapus Akun (`RFC-010`)** wajib online.

---

## Technical Approach

### 1. PWA Manifest, Zero-Leak Service Worker & Offline Routing (`F18`, `STACK-5`, `OFFLINE-1`, `OFFLINE-4`, `OFFLINE-5`)
- `src/app/manifest.ts` (`name: "Noka"`, `start_url: "/app/notes"`, `display: "standalone"`, `public/icons/icon-192.png`, `public/icons/icon-512.png`) + `public/offline.html` (halaman shell fallback statis non-privat yang memandu user online atau membaca mirror offline).
- `public/sw.js`:
  - **`noka-shell-v1` (non-privat, tetap saat logout)**: hanya `/_next/static/*`, `/icons/*`, `/offline.html` (*Cache-First*). **Tidak pernah menyimpan HTML `/app/*` SSR yang berisi data user.**
  - **`noka-private-v1` (terhapus total saat logout/`401`)**:
    - Dokumen HTML navigasi `/app/notes`, `/app/notes/[id]`, `/app/finance`, `/app/settings` (*Network-First*, **hanya** menyimpan bila `res.ok && !res.redirected && res.headers.get("content-type")?.includes("text/html")`, jatuh ke cached app document / `/app/notes` / `/offline.html` saat offline!). Catatan UUID baru yang dibuat saat offline disunting langsung lewat `NotesWorkspace` atau app-shell fallback `/app/notes/[id]` yang membaca catatan langsung dari IndexedDB (`SyncProvider`).
    - Gambar `GET /api/attachments/*` (*Cache-First / Stale-While-Revalidate* di `noka-private-v1`).
    - **Tidak pernah** meng-cache `/api/auth/*`, `/api/sync/snapshot`, atau mutasi. Permintaan RSC fragment (`?_rsc=`) memakai *Network-First* murni tanpa mencemari cache HTML; di UI, navigasi `<Link>` workspace saat `!isOnline` ditangani aman tanpa crash via fallback navigasi/state lokal.
  - Message `{ type: "CLEAR_PRIVATE_CACHE" }` menghapus seluruh cache `noka-private-*`; worker baru tidak me-reload halaman ketika editor kotor.
- **Registrasi SW & Private-Mode Fallback (`SyncProvider.tsx`, `capabilities.ts`, `OFFLINE-1`)**:
  - `SyncProvider.tsx` (`"use client"`, dipasang di `(app)/app/layout.tsx`) mendaftarkan `navigator.serviceWorker.register("/sw.js")` di dalam `useEffect` dengan penjagaan `try/catch` bila `"serviceWorker"` absen atau diblokir private mode.
  - `src/features/sync/capabilities.ts` menguji ketersediaan **IndexedDB** (`SecurityError` / open error) **maupun** dukungan registrasi **Service Worker** (`detectOfflineCapabilities()`). Bila salah satu atau keduanya diblokir, `SyncProvider` menyetel `storageAvailable` / `swAvailable`, menampilkan banner ID/EN non-blocking, dan meneruskan operasi mode online-only via server API tanpa crash.

### 2. IndexedDB Schema, Snapshot DTO & `SyncProvider.tsx` (`F19`, `DATA-2`, `OFFLINE-2`)
- `src/features/sync/db.ts` (`idb@8.0.4`, `noka-offline-${userId}`, `DB_VERSION = 1`):
  - Object stores (`keyPath: "id"` kecuali disebut): `notes` (indeks `updatedAt` saja — **tidak** membuat indeks IDB untuk boolean `isPinned` maupun `folderId: null` karena W3C IndexedDB & `fake-indexeddb@6.2.8` menolak key `boolean`/`null`; filter `isPinned`/`folderId`, pencarian, & sort `isPinned DESC, updatedAt DESC, id DESC` dijalankan via helper memori setelah `getAll()`), `folders`, `tags`, `noteAttachments`, `wallets`, `categories`, `transactions` (indeks `occurredAt`, `walletId`, `noteId`), `transfers` (indeks `occurredAt`, `fromWalletId`, `toWalletId`), `meta` (`keyPath: "key"`: `userProfile`, `lastSyncedAt`), dan `outbox` (`keyPath: "mutationId"`, indeks `createdAt`, `status`).
  - Setiap entri `outbox`: `{ mutationId, createdAt, idempotencyKey, entity: "note"|"folder"|"transaction"|"transfer"|"noteLink", entityId, op: "upsert"|"delete"|"link"|"unlink", method, path, body, optimisticSnapshot, updatedAt, status: "pending" | "failed", retryCount, nextRetryAt: number | null, lastError: string | null }`.
- `GET /api/sync/snapshot` (`snapshot-service.ts` + `route.ts`): `requireAuth`, `API-1`, `Cache-Control: no-store`, menyertakan **`includeArchived: true`** pada `wallets` (agar toggle arsip & resolusi nama dompet riwayat ledger bekerja offline, sementara `calculateSafeToSpend` & `totalBalance` otomatis menyaring `archivedAt === null`), proyeksi minimal (`PERF-2`): `{ user: { id, name, email, locale, theme, cycleStartDay }, notes: NoteDto[], folders: FolderDto[], tags: TagDto[], noteAttachments: Array<{ id, noteId, mimeType, sizeBytes, url, createdAt }>, wallets: WalletWithBalanceDto[], categories: CategoryDto[], transactions: TransactionDto[], transfers: TransferDto[], serverTime }`.
- `SyncProvider.tsx` mengekspor hook `useSync()` -> `{ status: "synced" | "offline" | "syncing" | "sync_error", isOnline, storageAvailable, swAvailable, pendingCount, failedItems, lastSyncedAt, syncNow(), discardFailedMutation(mutationId), updateUserMeta(patch), ... }`. `updateUserMeta` (`RFC-010`) memperbarui state React serta store `meta.userProfile` di IndexedDB secara aman (no-op pada DB bila `storageAvailable === false`).

### 3. Flush Outbox State Machine, Online-Direct & Local Recompute (`F19`, `API-3`, `DATA-6`, `OFFLINE-3`)
- **`client-api.ts` (`Online-Direct + Offline Fallback`)**:
  - Ketika `isOnline === true`, mutasi langsung dikirim ke server via `apiFetch()` ber-`Idempotency-Key` & `updatedAt` sehingga validasi/konflik sinkron (`409 FOLDER_ALREADY_EXISTS`, dll.) langsung tampil di modal; bila jaringan gagal (`TypeError`/offline) dan entitas termasuk lingkup write offline (`Notes`, `Folders`, `Transactions`, `Transfers`), mutasi otomatis diantrekan ke `outbox` + mirror optimistis! Saat `!isOnline`, langsung masuk `outbox` + mirror optimistis (`NoteEditor` badge -> `notes.status.pendingSync`).
  - Saat `!isOnline`, kontrol unggah & **hapus gambar** (`NoteAttachmentsPanel.tsx` `RFC-005`), **`WalletManagerModal`**, dan **`CategoryManagerModal`** (`RFC-006`) dinonaktifkan dengan notice ID/EN jelas (`OFFLINE-4`, `FR-16`).
- **Kalkulasi Keuangan Lokal Offline (`RFC-007` parity)**:
  - Saat offline, `FinanceWorkspace.tsx` (`/app/finance`) menghitung `computeWalletBalances`, `calculateSafeToSpend`, serta helper lokal pada `client-api.ts` untuk `cashflow`, `categoryBreakdown`, dan `ledger` terfilter/terpaginasi langsung dari mirror IndexedDB!
- **`flushOutbox()` (`engine.ts`)**: lock `navigator.locks?.request("noka-sync-" + userId, ...)` (plus in-memory mutex fallback):
  1. Cek `navigator.onLine`; bila offline -> UI status `"offline"`. Set UI status `"syncing"`.
  2. Ambil seluruh item `status === "pending"` berurutan `createdAt ASC`:
     - Bila ditemukan item pending dengan `nextRetryAt !== null && nextRetryAt > Date.now()`: **hentikan loop** (`halted = true`) dan tetapkan status `"sync_error"` demi menjaga **urutan kausal FIFO** (mutasi dependen yang lebih baru tidak mendahului mutasi awal yang tertunda!).
     - Kirim `fetch(item.path, { method, headers: { "Content-Type": "application/json", "Idempotency-Key": item.idempotencyKey }, body })`.
     - `401`: panggil `wipeAllOfflineData(userId)` + redirect `/login` + abort.
     - `2xx`: hapus item dari `outbox`.
     - `400`/`403`/`404`/`409`/`422`: ubah `item.status = "failed"`, simpan `lastError`, pertahankan item di `outbox` agar muncul di `SyncStatusBadge` (**tidak diam-diam dihapus!**), lanjutkan item berikutnya. *(Tombol **Buang** / `discardFailedMutation` di `SyncStatusBadge` menghapus item `"failed"` dan memicu refresh/re-sync mirror dari server + hitung ulang ledger).*
     - `429` (hitung `nextRetryAt = Date.now() + parseRetryAfterMs(res)`) / `5xx` / network error: increment `retryCount` (tetap `"pending"`!), set `halted = true`, set status akhir `"sync_error"`, dan **hentikan loop** (`break`).
  3. **Hanya bila `!halted`** (loop tidak terhenti oleh `429` / `nextRetryAt` / `5xx` / network error): panggil `GET /api/sync/snapshot` (`ok`), tulis snapshot baru, terapkan ulang **seluruh** mutasi berstatus `"pending"` yang masih ada di `outbox` (`createdAt ASC`, baik yang masuk sebelum maupun selama flush berlangsung melalui `optimisticSnapshot` delta), perbarui `meta.lastSyncedAt`, dan tetapkan status akhir UI (`"sync_error"` bila masih ada item `"failed"` atau `"pending"`, `"synced"` hanya bila `pending === 0 && failed === 0`).
- **4 Trigger iOS-Safe (`OFFLINE-3`)**: app mount online, `window.online`, `document.visibilitychange`/`window.focus`, dan tombol **Sync Now** (`0` referensi `Background Sync API`).

### 4. Wipe Total Saat Logout / `401` (`OFFLINE-5`, `DEC-16`, `HIGH-4`)
- `wipeAllOfflineData()` (`cleanup.ts`, terdaftar via `registerClientLogoutCleanup` di `SyncProvider`/`LogoutButton`) menutup `idb`, menghapus seluruh `noka-offline-*`, mengirim `CLEAR_PRIVATE_CACHE` ke SW, dan memanggil `caches.delete()` untuk semua `noka-private-*` (bekerja walau `controller === null`).

---

## API Contracts Exposed

- `GET /api/sync/snapshot` (`requireAuth`, `API-1`, `Cache-Control: no-store`) -> `200` `{ ok: true, data: SnapshotDto }` | `401 UNAUTHORIZED`.

---

## Implementation Details

### File Structure
- `src/app/manifest.ts`, `public/sw.js`, `public/offline.html`, `public/icons/icon-192.png`, `public/icons/icon-512.png`
- `src/features/sync/{capabilities,db,engine,cleanup,client-api,snapshot-service}.ts`, `src/app/api/sync/snapshot/route.ts`
- `src/components/providers/SyncProvider.tsx`, `src/components/layout/SyncStatusBadge.tsx`
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/{id,en}.ts` (menambahkan namespace `sync` & `notes.status.pendingSync`)
- Wiring client di `src/app/(app)/app/layout.tsx` (`SyncProvider`, `SyncStatusBadge` di `syncStatusSlot`), `src/components/layout/AppShell.tsx`, `src/components/layout/WorkspaceChrome.tsx` (`RFC-008` offline Quick Capture), `src/components/layout/QuickCaptureBar.tsx`, `src/components/notes/NotesWorkspace.tsx`, `src/components/notes/NoteEditor.tsx`, `src/components/notes/FolderManagerModal.tsx`, `src/components/notes/NoteAttachmentsPanel.tsx` (disable unggah & hapus lampiran saat offline sambil tampilkan cache offline), `src/components/notes/NoteLinkedTransactionsPanel.tsx`, `src/app/(app)/app/notes/page.tsx`, `src/app/(app)/app/notes/[id]/page.tsx`, `src/components/finance/FinanceWorkspace.tsx` & `src/app/(app)/app/finance/page.tsx`, `src/components/finance/WalletManagerModal.tsx`, `src/components/finance/CategoryManagerModal.tsx`, `src/components/finance/TransactionFormModal.tsx`, `src/components/finance/TransferFormModal.tsx`, `src/components/auth/LogoutButton.tsx`
- `tests/unit/offline-sync-engine.test.ts`, `tests/e2e/offline-sync-and-logout.spec.ts`

---

## Acceptance Criteria

- [x] **AC-9.1 (PWA, SW Registration, Safe Private Cache & Private-Mode Fallback — `F18`, `STACK-5`, `OFFLINE-1`, `OFFLINE-5`):** `manifest.ts`, `public/sw.js`, `public/offline.html`, dan ikon `192`/`512` terdaftar lewat `SyncProvider.tsx` (`navigator.serviceWorker.register("/sw.js")`) tanpa `Background Sync API` (`SyncManager`); `noka-shell-v1` hanya meng-cache aset statis + `/offline.html` (nol SSR HTML privat), sedangkan dokumen `/app/*` (`!res.redirected && res.ok`) dan gambar `GET /api/attachments/*` masuk `noka-private-v1` (tidak menyentuh `/api/auth/*` atau `/api/sync/snapshot`); `capabilities.ts` (`detectOfflineCapabilities()`) + `SyncProvider` menyuguhkan fallback online-only + banner terlokalisasi saat **IndexedDB maupun Service Worker** diblokir private mode.
- [x] **AC-9.2 (IndexedDB Mirror, Snapshot API, Offline Scope & UI Wiring — `F19`, `API-1`, `SEC-1`, `OFFLINE-2`, `OFFLINE-4`, `UI-6`, `I18N-1`):** `GET /api/sync/snapshot` (`snapshot-service.ts`) memakai `API-1`, `Cache-Control: no-store`, & isolasi `session.userId` (`401` bila invalid), dan menyertakan dompet berarsip (`includeArchived: true`); `db.ts` menyimpan 8 domain store + `meta` (`userProfile`, `lastSyncedAt`) + `outbox` tanpa indeks IDB tidak valid pada key `boolean`/`null` (`notes` disaring/diurutkan di memori sesudah `getAll()`); `SyncProvider` (`useSync()`, `updateUserMeta`), `src/app/(app)/app/layout.tsx`, `AppShell` (`syncStatusSlot`), `WorkspaceChrome`, `QuickCaptureBar`, `NotesWorkspace`, `NoteEditor` (`pendingSync`), `FolderManagerModal`, `notes/page.tsx`, `notes/[id]/page.tsx`, `NoteLinkedTransactionsPanel`, `FinanceWorkspace` (`/app/finance/page.tsx`), `TransactionFormModal`, dan `TransferFormModal` bekerja offline untuk Notes, Folders, Transactions, Transfers, serta menghitung `cashflow`/`categoryBreakdown`/`ledger` lokal; sementara `NoteAttachmentsPanel` (unggah & hapus, tampilkan gambar ter-cache), `WalletManagerModal`, dan `CategoryManagerModal` nonaktif saat `!isOnline` dengan teks ID/EN (`sync.*` di `types.ts`/`id.ts`/`en.ts`).
- [x] **AC-9.3 (Outbox State Machine, FIFO Ordering, Retry & Ledger Integrity — `F19`, `DATA-1`–`DATA-6`, `API-3`, `OFFLINE-3`, `PERF-2`):** `client-api.ts` mencoba API online lebih dulu dan fallback ke outbox saat offline/error jaringan; `flushOutbox()` di `engine.ts` memakai concurrency lock, `Idempotency-Key` + `updatedAt` (`0 duplikat`), menjaga urutan kausal FIFO (`nextRetryAt > Date.now()` menghentikan antrean lebih baru), menghentikan loop & melewatkan Step 3 `GET /api/sync/snapshot` pada `429` (`Retry-After`)/`nextRetryAt`/`5xx`/network error (tetap `"pending"`, `retryCount++`, UI `"sync_error"`), menandai terminal `4xx` sebagai `"failed"` (tampil di `SyncStatusBadge` bersama tombol **Buang** & **Sync Now**), menerapkan ulang **seluruh** mutasi `"pending"` yang masih ada setelah snapshot baru, menghitung ulang saldo via `computeWalletBalances` + `calculateSafeToSpend`, serta terpicu app-open, `online`, `visibilitychange`/`focus`, dan manual.
- [x] **AC-9.4 (Wipe Total Saat Logout / `401` — `OFFLINE-5`, `SEC-1`):** `cleanup.ts` via `LogoutButton` & `401 UNAUTHORIZED` menghapus seluruh DB IndexedDB `noka-offline-*` dan menghapus **seluruh** cache `noka-private-*` (termasuk SSR HTML `/app/*` & lampiran gambar via SW message dan `caches.delete` langsung).
- [x] **AC-9.5 (Tests & Quality — `UI-3`, `UI-5`, `I18N-2`, `TEST-1`, `TEST-4`, `TEST-5`, `QUAL-2`, `QUAL-3`):** `tests/unit/offline-sync-engine.test.ts` (`fake-indexeddb@6.2.8`) dan `tests/e2e/offline-sync-and-logout.spec.ts` lulus penuh bersama `npm run lint` dan `npx tsc --noEmit`.

---

## Implementation Notes

1. **PWA Shell & Strict Cache Splitting (`public/sw.js`, `manifest.ts`, `OFFLINE-1`, `OFFLINE-5`, `DEC-16`, `HIGH-4`)**:
   - `noka-shell-v1`: Menyimpan precache `/offline.html`, `/icons/*`, dan static chunks `/_next/static/*`. Tidak pernah meng-cache HTML SSR privat dari rute terautentikasi `/app/*`.
   - `noka-private-v1`: Menyimpan dokumen HTML `/app/*` (`!res.redirected && res.ok`) dan biner gambar privat `/api/attachments/*`.
   - Pada Logout atau respons `401 UNAUTHORIZED`, pesan Service Worker `{ type: "CLEAR_PRIVATE_CACHE" }` bersama penghapusan langsung via `caches.delete()` menghapus seluruh cache berawalan `noka-private-` hingga bersih tanpa menyentuh shell statis atau preferensi tema/bahasa.
   - Nol dependensi pada `Background Sync API` / `SyncManager` untuk menjamin kompatibilitas penuh dan aman pada iOS Safari (`OFFLINE-3`).

2. **IndexedDB Mirror & Clean Lifecycle (`src/features/sync/db.ts`, `capabilities.ts`, `idb@8.0.4`)**:
   - Skema IndexedDB `noka-offline-${userId}` versi 1 dengan 8 object stores domain (`notes`, `folders`, `tags`, `noteAttachments`, `wallets`, `categories`, `transactions`, `transfers`), `meta`, dan `outbox`.
   - Bebas indeks boolean/null pada store `notes` demi kepatuhan spesifikasi W3C IDB dan kompatibilitas `fake-indexeddb`. Pengurutan dan filter catatan dijalankan secara deterministik di memori (`sortNotesInMemory`).
   - Pelacakan instance koneksi aktif (`activeDbInstances`) dan suppression flag (`suppressOfflineDbs`) mencegah pembukaan kembali database saat proses teardown logout/sesi kadaluarsa.
   - Deteksi kapabilitas browser (`detectOfflineCapabilities`) mendeteksi mode privasi/incognito yang memblokir IndexedDB atau Service Worker, memicu banner peringatan ID/EN non-blocking dan mengarahkan aplikasi ke fallback online-only tanpa error.

3. **iOS-Safe Outbox & Concurrency Control (`src/features/sync/engine.ts`, `client-api.ts`)**:
   - Outbox mutasi FIFO dengan concurrency lock per-user (`navigator.locks` / in-memory mutex).
   - Pengiriman mutasi berurutan kausal dengan preservasi `Idempotency-Key` dan pembaruan timestamp monotonik (`resolveCausalOutgoingItem`) untuk mencegah resolusi LWW server yang salah pada mutasi berantai saat offline.
   - Replay mutasi pending di atas snapshot server baru (`applySnapshotWithPendingReplay`) menjaga mutasi yang masuk bersamaan saat proses flush tetap utuh.
   - 4 pemicu sinkronisasi iOS-safe: peluncuran aplikasi saat online, event `window.online`, event `visibilitychange` / `window.focus`, dan tombol manual **Sync Now**.

4. **UI Offline Wiring & Guards (`OFFLINE-4`, `FR-16`, `FR-17`)**:
   - Paritas mutasi offline penuh untuk Notes (termasuk checklist GFM dan tag), Folders, Transaksi Keuangan (termasuk Quick Capture dan Linked Notes), serta Transfer Antar-Dompet atomik.
   - Perhitungan keuangan lokal offline via `computeWalletBalances` dan `calculateSafeToSpend` di `FinanceWorkspace.tsx`.
   - Guard online-only dengan notifikasi ID/EN yang jelas pada `NoteAttachmentsPanel.tsx` (unggah dan hapus lampiran), `WalletManagerModal.tsx`, dan `CategoryManagerModal.tsx`.
   - Badge status sinkronisasi terpadu (`SyncStatusBadge.tsx`) dengan indikator status (`synced`, `syncing`, `offline`, `sync_error`), hitungan antrean pending, dan modal penanganan kegagalan dengan opsi Buang dan Sinkron Sekarang.

5. **Post-Review Refinements (Non-Blocking Improvements)**:
   - Menambahkan timer sinkronisasi berkala (interval 5 menit) di `SyncProvider.tsx` khusus saat tab berstatus aktif/terlihat (`document.visibilityState === "visible"`) dan perangkat online (`navigator.onLine !== false`) guna menjamin pembaruan data antar-perangkat pada tab yang dibiarkan terbuka lama.
   - Meningkatkan ketegasan kontras border dark mode dan menambahkan indikator dot status netral pada state `"offline"` di `SyncStatusBadge.tsx`.
