# RFC-010: Account Settings, Cycle Configuration & Self-Service Account Deletion

**Features**: F6
**Depends on**: RFC-001, RFC-002, RFC-005, RFC-007, RFC-009
**Rules**: STACK-3, ARCH-1, ARCH-2, ARCH-4, DATA-5, API-1, API-2, SEC-1, SEC-2, SEC-3, SEC-4, SEC-6, OFFLINE-5, UI-3, UI-5, I18N-1, I18N-2, OBS-1, OBS-2, TEST-1, TEST-3, TEST-5, QUAL-2, QUAL-3
**Complexity**: Medium

---

## Summary

Menyelesaikan halaman **Pengaturan Akun (`/app/settings`)** dan kesiapan rilis v1.0 (`F6`, `FR-2`, `FR-22`, `HIGH-4`):
- Ubah profil (`name`, menampilkan `email` *read-only*) dan preferensi (`locale`, `theme`) tersinkron eksplisit tanpa `useEffect` loop (`I18N-2`) lewat client bridge `PreferencesSyncBridge.tsx` pada root `PreferencesProvider` (`RFC-001`),
- Atur **tanggal mulai siklus bulanan** (`cycleStartDay`: `'1'`–`'28'` atau `'end_of_month'`) yang memperbarui `SyncProvider.updateUserMeta()` (`RFC-009`) sehingga *Safe-to-Spend* (`RFC-007`) langsung berubah,
- Ubah password dengan verifikasi password lama (`FR-2`),
- **Hapus Akun Mandiri (*Self-Service Account Deletion*)** (`FR-22`) ber-konfirmasi ganda (`HAPUS`/`DELETE` + password), kunci `FOR UPDATE` + pembersihan atomik DB, penghapusan lampiran storage via `deleteUserAttachmentObjects` (`RFC-005`), dan wipe total IndexedDB + cache SW privat (`RFC-009`), serta ringkasan kebijakan privasi data. *(Health check `GET /api/health` (`F6`, `OBS-1`) tersedia sejak `RFC-001` dan ikut diverifikasi di E2E rilis).*

---

## Technical Approach

### 1. Profile, Preferences & Non-Looping Client Bridge (`FR-2`, `DATA-5`, `ARCH-4`, `I18N-2`)
- `PATCH /api/account/profile` (`src/features/account/schemas.ts`, `src/features/account/service.ts`):
  - Skema Zod: `{ name?: trim min 1 max 120, locale?: "id"|"en", theme?: "light"|"dark", cycleStartDay?: "1".."28" | "end_of_month" }`; menolak body kosong `{}` (`422 VALIDATION_ERROR`) dan nilai `cycleStartDay` lain (`422 INVALID_CYCLE_DAY`).
  - Memperbarui baris `users`, menyetel ulang cookie non-HttpOnly `noka_locale`/`noka_theme` (`Path=/; Max-Age=31536000; SameSite=Lax`) bila berubah, dan mengembalikan `200 { ok: true, data: { user: { id, name, email, locale, theme, cycleStartDay } } }`.
- **Anti-Loop & RSC-Safe Sync (`PreferencesSyncBridge.tsx`)**:
  - Komponen client tipis `src/components/providers/PreferencesSyncBridge.tsx` **wajib dipasang di dalam `<SyncProvider>`** pada `src/app/(app)/app/layout.tsx` (bukan passing function dari RSC ke Client Component, dan tidak men-nest `PreferencesProvider` kedua!).
  - Di dalam `useEffect`, meregistrasikan handler klik ke root `PreferencesProvider.registerPersistHandler` (`RFC-001`) dan mengembalikan fungsi `unregister` pada cleanup unmount (cleanup unmount **hanya** melepas listener — tidak memanggil `PATCH`); klik header `ThemeToggle`/`LocaleToggle` memanggil `PATCH /api/account/profile` secara *best-effort* (diam-diam melewati ketika `!useSync().isOnline` atau mengabaikan error jaringan agar toggle UI tetap instan offline!).
  - Ketika `ProfileSettingsForm` sukses menyimpan via `PATCH /api/account/profile`, ia memanggil `updatePreferences({ locale, theme }, { persist: false })` (mencegah PATCH ganda sekaligus menyinkronkan root context) dan memanggil `useSync().updateUserMeta(updatedUser)` (`RFC-009`).

### 2. Change Password & Auth 401 Safety (`FR-2`, `SEC-2`, `OBS-2`)
- `PATCH /api/account/password`: `{ currentPassword: min 1, newPassword: min 8 max 128 }` -> verifikasi `currentPassword` (`401 INVALID_CURRENT_PASSWORD`); dalam `db.transaction` hash `newPassword` (`bcryptjs` cost `12`), update `users`, dan hapus seluruh sesi lain (`DELETE FROM sessions WHERE user_id = userId AND id <> currentSessionId`).
- Karena `RFC-002` `apiFetch()` hanya memicu logout wipe saat `error.code === "UNAUTHORIZED"`, salah ketik password pada `ChangePasswordForm` (`401 INVALID_CURRENT_PASSWORD`) maupun `DeleteAccountSection` (`401 INVALID_PASSWORD`) menampilkan pesan error validasi di form tanpa menghapus IndexedDB maupun mengarahkan keluar sesi! *(Sesi yang benar-benar dicabut `401 UNAUTHORIZED` tetap langsung dibersihkan).*

### 3. Race-Safe Self-Service Account Deletion (`FR-22`, `SEC-6`, `OFFLINE-5`, `HIGH-4`)
```text
DELETE /api/account (body: { password: string }):
  1. requireAuth(req) + verifyCsrfOrigin(req) + parse JSON (400 INVALID_JSON) + Zod password min 1 (422 VALIDATION_ERROR).
  2. In db.transaction:
       a. Lock user row: SELECT id, password_hash FROM users WHERE id = userId FOR UPDATE.
       b. If !user (concurrent deletion already committed) -> throw ApiError(401, "UNAUTHORIZED").
       c. Verify bcryptjs.compare(password, user.passwordHash) -> throw ApiError(401, "INVALID_PASSWORD").
       d. Query storage keys INSIDE locked transaction:
            SELECT storage_key FROM note_attachments WHERE user_id = userId.
       e. Delete in RESTRICT-safe FK order:
            DELETE FROM transfers    WHERE user_id = userId
            DELETE FROM transactions WHERE user_id = userId
            DELETE FROM wallets      WHERE user_id = userId
            DELETE FROM categories   WHERE user_id = userId
            DELETE FROM users        WHERE id      = userId  # cascades sessions, reset tokens, notes, folders, tags, attachments, idempotency_keys
  3. Commit transaction.
     If keys.length > 0:
       { failedKeys } = await deleteUserAttachmentObjects(keys) (RFC-005).
       If failedKeys.length > 0: logger.warn("account_storage_cleanup_partial", { failedKeyCount: failedKeys.length, failedKeys }).
  4. Clear noka_session cookie (HttpOnly, Path=/, Max-Age=0, SameSite=Lax, Secure=APP_URL.startsWith("https://")) -> return 200 { ok: true, data: { deleted: true } }.
```
- Di UI (`DeleteAccountSection.tsx`): menampilkan tombol **Hapus Akun** yang membuka `Modal` konfirmasi ganda (input `"HAPUS"` / `"DELETE"` + input password + ringkasan dampak), lalu setelah respons `200` menjalankan `await runClientLogoutCleanup()` (`RFC-009` `wipeAllOfflineData()`) sebelum `window.location.assign("/")`.
- **Offline Guard (`FR-16`)**: Saat `!isOnline`, tombol submit pada `ProfileSettingsForm`, `ChangePasswordForm`, dan `DeleteAccountSection` dinonaktifkan dengan notice terlokalisasi.

---

## API Contracts Exposed

Semua route memakai amplop `API-1` (`apiOk`/`apiError`/`handleApiError`), `requireAuth(req)` (`401 UNAUTHORIZED`), `verifyCsrfOrigin(req)` (`403 CSRF_ORIGIN_MISMATCH`), `400 INVALID_JSON`, dan Zod (`422`):
- `PATCH /api/account/profile` -> `200` `{ user }` | `422 INVALID_CYCLE_DAY` / `VALIDATION_ERROR`.
- `PATCH /api/account/password` -> `200` `{ updated: true }` | `401 INVALID_CURRENT_PASSWORD` | `422 VALIDATION_ERROR`.
- `DELETE /api/account` -> `200` `{ deleted: true }` | `401 INVALID_PASSWORD` / `UNAUTHORIZED` | `422 VALIDATION_ERROR`.

---

## Implementation Details

### File Structure
- `src/features/account/schemas.ts`, `src/features/account/service.ts`
- `src/app/api/account/profile/route.ts`, `src/app/api/account/password/route.ts`, `src/app/api/account/route.ts`
- `src/components/settings/ProfileSettingsForm.tsx` (`email` *read-only*, `name`, `locale`, `theme`, `cycleStartDay`), `src/components/settings/ChangePasswordForm.tsx`, `src/components/settings/DeleteAccountSection.tsx`
- `src/components/providers/PreferencesSyncBridge.tsx` & `src/app/(app)/app/layout.tsx` (memasang bridge di dalam `/app/*` tanpa duplikasi provider)
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/{id,en}.ts` (menambahkan namespace `settings` termasuk `settings.privacySummary.*`)
- `src/app/(app)/app/settings/page.tsx` (Server Component memuat profil sesi, mempassing data ke forms & ringkasan kebijakan privasi data)
- `tests/integration/account-settings-deletion.test.ts`
- `tests/e2e/full-user-journey-and-a11y.spec.ts` (E2E akhir v1.0: register -> unggah & tampilkan lampiran catatan -> quick capture -> linked note -> ubah `cycleStartDay` & verifikasi Safe-to-Spend -> privacy blur -> cek `GET /api/health` -> zero horizontal overflow & keyboard a11y pada `360px`, `768px`/`375×812`, `1280×800` -> hapus akun & verifikasi DB/storage/IndexedDB/SW cache bersih)

---

## Acceptance Criteria

- [x] **AC-10.1 (Profile, Cycle Start Day, Cookies & Non-Looping Sync — `F6`, `DATA-5`, `API-1`, `I18N-2`):** `settings/page.tsx`, `ProfileSettingsForm`, `src/features/account/schemas.ts`, `src/features/account/service.ts`, dan `PATCH /api/account/profile` menampilkan `email` *read-only*, memvalidasi body non-kosong (`name` `1..120`, `locale`, `theme`) & `cycleStartDay` (`'1'`–`'28'` | `'end_of_month'`; selainnya `422 INVALID_CYCLE_DAY`, JSON rusak `400 INVALID_JSON`, auth `401`, CSRF `403`), mengembalikan `{ user }` ter-sanitasi tanpa `passwordHash`, menyetel cookie `noka_locale`/`noka_theme`, memanggil `updatePreferences(..., { persist: false })` + `useSync().updateUserMeta()` sehingga Safe-to-Spend langsung diperbarui; `PreferencesSyncBridge` dipasang di dalam `<SyncProvider>` di `(app)/app/layout.tsx`, hanya memicu PATCH dari klik eksplisit pengguna (cleanup unmount hanya unregister, bebas loop `useEffect` & reload, toleran offline).
- [x] **AC-10.2 (Ganti Password Aman & Error 401 Terpisah — `F6`, `SEC-2`, `OBS-2`):** `ChangePasswordForm`, `schemas.ts`, `service.ts`, & `PATCH /api/account/password` mengecek `401`/`403`/`400`/`422`, memverifikasi `currentPassword` (`401 INVALID_CURRENT_PASSWORD` tanpa memicu wipe/redirect `UNAUTHORIZED`), mewajibkan `newPassword` `8..128`, menghash `bcryptjs` `cost 12`, mencabut sesi perangkat lain, dan bebas kebocoran password di log.
- [x] **AC-10.3 (Hapus Akun Race-Safe & Wipe Total — `F6`, `SEC-1`, `SEC-4`, `SEC-6`, `OFFLINE-5`, `STACK-3`):** `service.ts` + `DELETE /api/account` memeriksa auth/CSRF/`400`/`422`, mengunci user `FOR UPDATE` (mengatasi concurrent deletion zero-row dengan `401 UNAUTHORIZED`), memverifikasi password (`401 INVALID_PASSWORD`), mengambil `storageKey` sebelum menghapus `transfers`, `transactions`, `wallets`, `categories`, `users`, melewati storage saat `keys.length === 0`, memanggil `deleteUserAttachmentObjects` (`RFC-005`, log warn hanya `failedKeys` UUID jika gagal parsial), menghapus cookie `noka_session`, serta `DeleteAccountSection` mewajibkan `Modal` konfirmasi ganda (`HAPUS`/`DELETE` + password + ringkasan dampak penghapusan) dan menjalankan `runClientLogoutCleanup()` (`RFC-009`) sebelum redirect `/`.
- [x] **AC-10.4 (Offline Guard, Privasi & Responsivitas — `F6`, `UI-3`, `UI-5`, `I18N-1`):** Seluruh teks memakai `settings.*` (termasuk `settings.privacySummary.*`) di `types.ts`/`id.ts`/`en.ts`; `/app/settings` menampilkan ringkasan kebijakan privasi data, menonaktifkan mutasi + menampilkan notice terlokalisasi saat `!isOnline` pada `ProfileSettingsForm`, `ChangePasswordForm`, & `DeleteAccountSection`, memenuhi navigasi keyboard/ARIA, dan bebas *horizontal overflow* di `360px`, `768px`, dan `1280px`.
- [x] **AC-10.5 (Tests, Lampiran E2E, Health & Release Gate — `OBS-1`, `TEST-1`, `TEST-3`, `TEST-5`, `QUAL-2`, `QUAL-3`):** `tests/integration/account-settings-deletion.test.ts` dan `tests/e2e/full-user-journey-and-a11y.spec.ts` (register -> unggah & tampilkan lampiran catatan -> quick capture -> linked note -> ubah `cycleStartDay` & verifikasi Safe-to-Spend -> privacy blur -> `GET /api/health` -> bebas overflow & keyboard a11y di `360px`/`375×812`/`768px`/`1280×800` -> hapus akun & verifikasi DB/storage/IndexedDB/cache SW privat bersih) lulus bersama `npm run lint`, `npx tsc --noEmit`, dan `npm run build`.

---

## Implementation Considerations

- **Ordering in Account Deletion**: FK `ON DELETE RESTRICT` pada `transactions`/`transfers` di `RFC-001` melindungi dompet/kategori dari hapus parsial (`DATA-4`), sehingga `DELETE /api/account` wajib menghapus `transfers`, `transactions`, `wallets`, dan `categories` sebelum menghapus `users`.
- **Visual System (`CHANGE-REQUEST-002`, `UI-1`–`UI-3`):** Halaman `/app/settings` (`ProfileSettingsForm`, `ChangePasswordForm`, `DeleteAccountSection`) berjalan di dalam `AppShell` (`max-w-[1360px]`), menjaga lebar baca form yang nyaman dengan kartu `rounded-2xl`, input `--bg-surface` + `--border-default`, tombol aksi pill/rounded sesuai palet `#ededed`/`#222222`/`#ff7448`, serta `Modal` konfirmasi hapus ber-backdrop `#161616/60`.

---

## Implementation Notes

1. **Profile, Cycle Start Day & Preferences Sync (`src/features/account/service.ts`, `PreferencesSyncBridge.tsx`, `DATA-5`, `I18N-2`)**:
   - `updateProfile`: Memvalidasi `name`, `locale`, `theme`, dan `cycleStartDay` (`1..28` atau `end_of_month`), mengembalikan objek user ter-sanitasi tanpa `passwordHash`.
   - `PreferencesSyncBridge`: Menghubungkan context preferensi (`PreferencesProvider`) dengan backend API saat pengguna mengubah bahasa atau tema secara eksplisit di navbar/header. Menggunakan `registerPersistHandler` dengan opsi `{ persist: false }` pada bootstrap untuk mencegah infinite loop atau request ganda saat mount.
   - Sinkronisasi instan ke state offline/client: Memanggil `useSync().updateUserMeta()` saat `cycleStartDay` diperbarui sehingga perhitungan *Safe-to-Spend* langsung mengadopsi siklus baru tanpa refresh halaman.

2. **Error Code Separation & Session Management (`SEC-2`, `OBS-2`)**:
   - Pemisahan kode error autentikasi yang presisi: kegagalan verifikasi password saat ganti password menghasilkan `401 INVALID_CURRENT_PASSWORD`, dan saat hapus akun menghasilkan `401 INVALID_PASSWORD`.
   - Kode error ini tidak mengacaukan penanganan `401 UNAUTHORIZED` di client interceptor (`client-api.ts`), sehingga sesi aktif pengguna tidak terhapus secara keliru akibat typo password.
   - Mengganti password secara atomik mencabut seluruh sesi lain milik pengguna dengan menghapus token dari tabel `sessions` (`userId = session.userId AND id != session.id`).

3. **Atomic Self-Service Account Deletion (`service.ts`, `DELETE /api/account`, `SEC-1`, `SEC-4`, `SEC-6`, `STACK-3`)**:
   - Penguncian baris `SELECT id, password_hash FROM users WHERE id = userId FOR UPDATE` di awal transaksi untuk mencegah race condition konkurensi (penghapusan ganda menghasilkan `401 UNAUTHORIZED`).
   - Eksekusi penghapusan database dalam urutan RESTRICT-safe yang ketat: `transfers` -> `transactions` -> `wallets` -> `categories` -> `users` (yang meng-cascade sesi, token reset, notes, folders, tags, idempotency keys, dan note attachments).
   - Pengambilan seluruh `storageKey` attachment milik user di dalam transaksi terkunci sebelum baris terhapus, lalu menghapus objek fisik dari storage backend (`deleteUserAttachmentObjects`) setelah commit transaksi. Kegagalan storage parsial dicatat via `logger.warn` (`failedKeys`) tanpa membatalkan transaksi atau mengembalikan status `500`.
   - Penghapusan cookie sesi `noka_session` dengan atribut keamanan lengkap (`HttpOnly`, `Path=/`, `Max-Age=0`, `SameSite=Lax`).

4. **Client Cleanup & Offline Protection (`DeleteAccountSection.tsx`, `OFFLINE-4`, `OFFLINE-5`)**:
   - Modal konfirmasi ganda yang mewajibkan input teks konfirmasi `"HAPUS"` atau `"DELETE"` (sesuai bahasa aktif) serta password pengguna sebelum tombol eksekusi aktif.
   - Eksekusi `await runClientLogoutCleanup()` sebelum redirect untuk membersihkan database IndexedDB lokal `noka-offline-*` dan seluruh cache Service Worker privat `noka-private-*`.
   - Guard `!isOnline` pada ketiga form di `/app/settings` (`ProfileSettingsForm`, `ChangePasswordForm`, `DeleteAccountSection`) dengan pesan terlokalisasi dan status disabled untuk mencegah error jaringan saat offline.
   - Kartu `PrivacySummaryCard.tsx` menyajikan ringkasan kebijakan privasi data dan kedaulatan informasi secara transparan.

5. **Test Coverage & Release Gate Verification (`TEST-1`, `TEST-3`, `TEST-5`, `QUAL-2`, `QUAL-3`)**:
   - Integration suite `tests/integration/account-settings-deletion.test.ts` (11 tes) mencakup validasi profile, penolakan cycleStartDay tidak valid, proteksi CSRF, sanitasi respons, penolakan password saat ini yang salah, pencabutan sesi lain, proteksi race deletion, dan penghapusan RESTRICT-safe beserta cleanup storage.
   - Unit suite `tests/unit/account-settings-ui.test.tsx` (6 tes) memverifikasi rendering formulir pengaturan, mode offline guard, konfirmasi kata kunci modal hapus akun, aktivasi input, dan dirty check tanpa network call.
   - E2E suite `tests/e2e/full-user-journey-and-a11y.spec.ts` bertindak sebagai release gate v1.0 penuh di Desktop & Mobile (Chrome & Mobile Chrome) menguji perjalanan pengguna lengkap dari registrasi hingga penghapusan akun mandiri beserta audit aksesibilitas dan zero horizontal overflow.

6. **Post-Review Refinements (Non-Blocking Improvements)**:
   - Menambahkan *dirty check* eksplisit pada `ProfileSettingsForm.tsx` yang membandingkan keempat field (`name`, `locale`, `theme`, `cycleStartDay`) terhadap nilai server aktual (`currentUser`), sehingga submit tanpa perubahan data langsung menampilkan pesan sukses tanpa memicu panggilan `PATCH /api/account/profile` yang redundan.
   - Mengonfigurasi `playwright.config.ts` dengan default `workers: 1` (dapat di-override via `PLAYWRIGHT_WORKERS`) untuk menjamin eksekusi E2E yang deterministik pada skenario destruktif (logout, penghapusan akun, pembersihan IndexedDB/SW cache) tanpa risiko *timing contention* antar-sesi paralel.
