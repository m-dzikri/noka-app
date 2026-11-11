# RFC-002: Authentication, Session Security & Password Reset

**Features**: F4, F5
**Depends on**: RFC-001
**Rules**: STACK-4, ARCH-2, ARCH-6, DATA-4, API-1, API-2, API-4, SEC-1, SEC-2, SEC-3, SEC-4, SEC-5, OFFLINE-5, UI-1, UI-2, UI-3, UI-5, I18N-1, I18N-2, OBS-2, OBS-3, TEST-1, TEST-3, QUAL-2, QUAL-3
**Complexity**: Medium

---

## Summary

Mengimplementasikan autentikasi multi-pengguna bebas friksi (`F4`, `FR-2`), meliputi pendaftaran langsung masuk tanpa verifikasi email wajib (`DEC-5`) dengan seeding 12 kategori bawaan dwibahasa (`ID/EN`), login, logout pencabut sesi DB, proteksi rute terautentikasi `(app)/app/layout.tsx`, grup rute auth terpisah `(auth)/` (agar tidak bertabrakan dengan Landing Page `(public)/` pada `RFC-003`), sesi cookie `HttpOnly` + `SameSite=Lax`, proteksi CSRF `Origin`/`Host`, *rate limiting* `SEC-5`, Lupa Password via email (`MailerAdapter`: Resend `6.38.0` + `DevOutboxMailer`) bertoken SHA-256 30 menit yang mencabut seluruh sesi lama (`F5`, `FR-3`), serta registry `client-cleanup.ts` dan `apiFetch()` (`401 UNAUTHORIZED` auto-wipe `OFFLINE-5`).

---

## Technical Approach

### 1. Frictionless Registration, Login, Logout & 12 Categories (`F4`, `DATA-4`, `API-1`, `API-2`)
- Menggunakan `ApiError`, `apiOk`, `apiError`, dan `handleApiError` dari `src/lib/api-response.ts` (`RFC-001`).
- **`POST /api/auth/register`**: `{ name: trim 1..120, email: trim lowercase email max 255, password: 8..128, locale?: "id"|"en", theme?: "light"|"dark" }` (klien mengirimkan preferensi `usePreferences()` aktif): hash password via `bcryptjs` (`cost = 12`), dalam `db.transaction` buat `users` (tangkap `23505` -> `409 EMAIL_ALREADY_EXISTS`), buat baris `sessions` (TTL `30 hari`), dan seed **12 kategori sistem** (`isSystem = true`, label awal terlokalisasi + `systemKey` untuk kamus UI `categories.*`):
  - **Expense (8):** `food_drink`, `transport`, `shopping`, `bills`, `entertainment`, `health`, `education`, `other_expense`.
  - **Income (4):** `salary`, `bonus`, `refund`, `other_income`.
  - Kembalikan `201` `{ ok: true, data: { user } }` (DTO tanpa `passwordHash`: `{ id, name, email, locale, theme, cycleStartDay }`), set cookie `noka_session`, `noka_locale`, dan `noka_theme`.
- **`POST /api/auth/login`**: `{ email: trim lowercase email max 255, password: 1..128 }`, verifikasi hash (`401 INVALID_CREDENTIALS`), buat baris `sessions` 30 hari, set cookie `noka_session`, `noka_locale` (= `user.locale`), & `noka_theme` (= `user.theme`), kembalikan `200` `{ ok: true, data: { user } }`.
- **`POST /api/auth/logout`**: verifikasi CSRF (tanpa `requireAuth` agar tetap idempoten); jika cookie `noka_session` ada, hapus baris `sessions` dengan `tokenHash = sha256(token)` (`SEC-3`), set cookie `noka_session` ber-`maxAge: 0` (atribut identik), kembalikan `200` `{ ok: true, data: { loggedOut: true } }`.
- **`GET /api/auth/me`**: `requireAuth(req)` -> kembalikan `200` `{ ok: true, data: { user } }` (termasuk `cycleStartDay`, tanpa `passwordHash`).

### 2. Stateful Sessions, Cookie Security & CSRF (`SEC-1`, `SEC-3`, `SEC-4`)
- `src/features/auth/password.ts`: helper `hashPassword`, `verifyPassword`, `generateTokenPair()` (`32` bytes `base64url` raw + `SHA-256` hex 64 char).
- Cookie `noka_session`: `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `maxAge: 30 * 24 * 60 * 60` (`0` saat hapus), `secure: getEnv().APP_URL.startsWith("https://")`.
- `src/features/auth/session.ts`:
  - `getSessionUser(): Promise<AuthUser | null>`: membaca `cookies()`, mengembalikan `null` **tanpa query DB** bila cookie kosong/panjang invalid; selain itu memvalidasi `tokenHash` dan `expiresAt > NOW()`.
  - `requireAuth(req?: NextRequest): Promise<{ user: AuthUser; sessionId: string }>`: melempar `ApiError(401, "UNAUTHORIZED", ...)` bila sesi tidak ada / kedaluwarsa.
- `verifyCsrfOrigin(req: NextRequest)` (`src/features/auth/csrf.ts`):
  - Mengekstrak origin dari `Origin` header, atau `new URL(referer).origin` jika `Origin` absen (bila keduanya kosong atau `Referer` bukan URL valid -> lempar `ApiError(403, "CSRF_ORIGIN_MISMATCH")`).
  - Membandingkan origin permintaan dengan himpunan origin yang diizinkan: `new URL(getEnv().APP_URL).origin` **ATAU** origin aktual dari `(x-forwarded-proto ?? "https") + "://" + (x-forwarded-host ?? host)` (bila `host` tidak kosong; mendukung port lokal/preview & request test tanpa header `Host`). Jika tidak ada yang cocok -> lempar `ApiError(403, "CSRF_ORIGIN_MISMATCH")`.

### 3. Sliding-Window Rate Limiter (`SEC-5`)
- `src/lib/rate-limit.ts`: `checkRateLimit(bucket, key, limit, windowMs)` & `clearRateLimitsForTest()` dengan automatic pruning. IP diambil dari IP pertama `x-forwarded-for`, fallback `x-real-ip`, fallback `"127.0.0.1"`.
- Urutan eksekusi handler mutasi auth: `verifyCsrfOrigin(req)` -> parse JSON (`400 INVALID_JSON`) -> ekstrak kunci IP (+ email lowercased jika `typeof body?.email === "string" && body.email.trim()` else `"anonymous"`) -> **`checkRateLimit()`** -> validasi Zod lengkap (`422 VALIDATION_ERROR`):
  - `/api/auth/register` & `/api/auth/login`: maks. `10` / `15 menit`, key `${ip}:${emailOrAnonymous}`.
  - `/api/auth/forgot-password`: maks. `5` / `15 menit`, key `${ip}:${emailOrAnonymous}`.
  - `/api/auth/reset-password`: maks. `5` / `15 menit`, key `${ip}`.
  - Melebihi batas -> `429 RATE_LIMITED` + header `Retry-After` (detik).

### 4. Forgot/Reset Password & MailerAdapter (`F5`, `API-4`, `STACK-4`, `OBS-3`, `HIGH-4`)
- `MailerAdapter` (`src/lib/mailer/types.ts`): `sendPasswordReset({ to, name, resetUrl, locale })`.
  - `src/lib/mailer/index.ts`: memakai `ResendMailer` bila `NODE_ENV !== "test"` dan `RESEND_API_KEY` + `EMAIL_FROM` tersedia; memakai `DevOutboxMailer` pada `development`/`test` (jika `RESEND_API_KEY` kosong); melempar `ApiError(503, "MAIL_DELIVERY_UNAVAILABLE")` pada `NODE_ENV === "production"` jika env Resend tidak tersedia.
  - `DevOutboxMailer` (`src/lib/mailer/dev.ts`): menyimpan array `OutboxEmail[]` (`{ to, subject, html, text, resetUrl, locale, createdAt }`) pada `globalThis` dengan `getOutboxEmails()`, `getLastOutboxEmail()`, `clearOutbox()`, dan diekspos melalui `GET /api/dev/outbox` (`200` `{ ok: true, data: { emails } }` di non-prod; `404 NOT_FOUND` di `production`).
  - `ResendMailer` (`src/lib/mailer/resend.ts`): mengirim email terlokalisasi ID/EN via `resend@6.38.0`; gagal runtime di-log aman -> `503 MAIL_DELIVERY_UNAVAILABLE`.
- `POST /api/auth/forgot-password`: `{ email: trim lowercase email max 255 }` -> bila user ada, simpan token `SHA-256` TTL `30 menit`, kirim `resetUrl = ${APP_URL}/reset-password?token=${rawToken}` memakai `user.locale` (token sebelumnya tetap valid hingga expiry/pemakaian). Selalu kembalikan `200` `{ ok: true, data: { message } }` (bahasa dari cookie `noka_locale`) entah email terdaftar atau tidak (`API-4`).
- `POST /api/auth/reset-password`: `{ token: min 1, newPassword: 8..128 }` -> `FOR UPDATE` pada `password_reset_tokens` (`used_at IS NULL AND expires_at > NOW()`, absen -> `400 INVALID_OR_EXPIRED_TOKEN`), hash password baru (`bcryptjs` cost `12`), set `usedAt = NOW()` pada semua token reset aktif milik user, hapus seluruh baris `sessions` milik user (`SEC-2`), return `200` `{ ok: true, data: { reset: true } }`.

### 5. Client Logout Cleanup, `apiFetch` & Grup Rute `(auth)` (`OFFLINE-5`, `DEC-16`)
- `src/features/auth/client-cleanup.ts`: `registerClientLogoutCleanup(fn)` & `runClientLogoutCleanup()` mempertahankan key `noka_theme`, `noka_locale`, `noka_privacy_blur` sambil menghapus key privat `noka_private_*`.
- `src/lib/http-client.ts`: `apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>` memeriksa respons `401`: **hanya bila** payload JSON memiliki `error.code === "UNAUTHORIZED"` (bukan `INVALID_CREDENTIALS` / `INVALID_PASSWORD` / `INVALID_CURRENT_PASSWORD`!), jalankan `await runClientLogoutCleanup()` dan redirect ke `/login`.
- **Isolasi Layout Grup `(auth)/`**: Auth pages (`/login`, `/register`, `/forgot-password`, `/reset-password`) berada di `src/app/(auth)/` dengan `src/app/(auth)/layout.tsx` merender **floating pill header (`rounded-full`)** satu baris (`max-w-[1360px]`, logo `Noka`, `LocaleToggle` & `ThemeToggle` ikon-saja) di mobile maupun desktop **tanpa menu hamburger**, serta menjaga `<main>` berfokus di tengah (`max-w-md`) agar tidak bentrok dengan Landing Page `(public)/` `RFC-003`!.
- `src/app/(app)/app/layout.tsx` diperbarui memeriksa `getSessionUser()` (redirect `/login` bila `null`) dan menyalurkan `<LogoutButton />` ke `logoutSlot` `AppShell`.

---

## API Contracts Exposed

Semua route memakai amplop `API-1` (`apiOk`/`apiError`/`handleApiError`), `verifyCsrfOrigin` pada mutasi (`403 CSRF_ORIGIN_MISMATCH`), dan `400 INVALID_JSON` bila JSON rusak:
- `POST /api/auth/register` — `{ name, email, password, locale?, theme? }` -> `201` `{ user }` | `409 EMAIL_ALREADY_EXISTS` | `422 VALIDATION_ERROR` | `429 RATE_LIMITED`.
- `POST /api/auth/login` — `{ email, password }` -> `200` `{ user }` | `401 INVALID_CREDENTIALS` | `422 VALIDATION_ERROR` | `429 RATE_LIMITED`.
- `POST /api/auth/logout` -> `200` `{ loggedOut: true }`.
- `GET /api/auth/me` -> `200` `{ user }` | `401 UNAUTHORIZED`.
- `POST /api/auth/forgot-password` — `{ email }` -> `200` `{ message }` | `422 VALIDATION_ERROR` | `429 RATE_LIMITED` | `503 MAIL_DELIVERY_UNAVAILABLE`.
- `POST /api/auth/reset-password` — `{ token, newPassword }` -> `200` `{ reset: true }` | `400 INVALID_OR_EXPIRED_TOKEN` | `422 VALIDATION_ERROR` | `429 RATE_LIMITED`.
- `GET /api/dev/outbox` — non-production -> `200` `{ emails }` (`404` di `production`).

---

## Implementation Details

### File Structure
- `src/lib/rate-limit.ts`, `src/lib/http-client.ts`, `src/lib/api-response.ts` (diperbarui: header opsional `Retry-After` pada `ApiError`), `src/lib/logger.ts` (diperbarui: redaksi kunci `reseturl`/`reset_url`)
- `src/lib/mailer/types.ts`, `src/lib/mailer/templates.ts`, `src/lib/mailer/resend.ts`, `src/lib/mailer/dev.ts`, `src/lib/mailer/index.ts`
- `src/features/auth/password.ts`, `src/features/auth/session.ts`, `src/features/auth/csrf.ts`, `src/features/auth/schemas.ts`, `src/features/auth/default-categories.ts`, `src/features/auth/service.ts`, `src/features/auth/route-helpers.ts`, `src/features/auth/client-cleanup.ts`
- `src/app/api/auth/{register,login,logout,me,forgot-password,reset-password}/route.ts`, `src/app/api/dev/outbox/route.ts`
- `src/components/ui/Card.tsx` (diperbarui: ekspor `CardFooter`), `src/components/auth/{auth-error.ts,LoginForm.tsx,RegisterForm.tsx,ForgotPasswordForm.tsx,ResetPasswordForm.tsx,LogoutButton.tsx}`
- `src/app/(auth)/layout.tsx`, `src/app/(auth)/{login,register,forgot-password,reset-password}/page.tsx`
- `src/app/(app)/app/layout.tsx` (diperbarui: guard `getSessionUser()` -> redirect `/login`, pasang `<LogoutButton />`)
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/{id,en}.ts` (menambahkan kunci error auth serta namespace `auth` dan `categories`)
- `tests/unit/auth-password-token.test.ts`, `tests/unit/auth-forms.test.tsx`, `tests/integration/auth-flow.test.ts`, `tests/integration/auth-reset.test.ts`

---

## Acceptance Criteria

- [x] **AC-2.1 (Sign Up, 12 Kategori & Preferensi — `F4`, `SEC-2`, `DATA-4`, `API-1`, `API-2`, `I18N-1`):** `POST /api/auth/register` (`schemas.ts`, `password.ts`, `default-categories.ts`, `service.ts`) menormalkan email lowercase (`max 255`), memvalidasi JSON (`400 INVALID_JSON`) dan payload (`422 VALIDATION_ERROR`), menangani duplikat (`409 EMAIL_ALREADY_EXISTS`), menghash password (`bcryptjs` cost `12`), men-seed 12 kategori bawaan (`isSystem = true`) terhubung kamus `categories.*` (`types.ts`/`id.ts`/`en.ts`) dalam transaksi, menyetel cookie `noka_session` (`HttpOnly`, `SameSite=Lax`, `Secure` hanya bila `APP_URL` HTTPS) serta `noka_locale`/`noka_theme`, dan mengembalikan `201` `{ ok: true, data: { user } }` (tanpa `passwordHash`).
- [x] **AC-2.2 (Login, Logout, Session Guard, CSRF & 401 Cleanup — `F4`, `SEC-1`, `SEC-3`, `SEC-4`, `OFFLINE-5`):** `POST /api/auth/login` menerbitkan sesi `30 hari` & menyinkronkan cookie preferensi user atau menolak `401 INVALID_CREDENTIALS`; `getSessionUser()` mengembalikan `null` tanpa query DB bila cookie absen; `requireAuth()`, `GET /api/auth/me` (`200` `{ user }` ber-`cycleStartDay`), dan `(app)/app/layout.tsx` menolak sesi invalid/kedaluwarsa; `verifyCsrfOrigin()` mengizinkan `Origin`/`Referer` cocok dan menolak mismatch/hilang (`403 CSRF_ORIGIN_MISMATCH`); `POST /api/auth/logout` mencabut sesi di DB, menghapus cookie secara idempoten (`200` `{ loggedOut: true }`); `LogoutButton` & `apiFetch()` (`http-client.ts`, memicu cleanup **hanya** untuk `401 UNAUTHORIZED`, bukan `INVALID_CREDENTIALS`/`INVALID_PASSWORD`) menjalankan `runClientLogoutCleanup()` sambil mempertahankan `noka_theme`/`noka_locale`/`noka_privacy_blur`.
- [x] **AC-2.3 (Forgot/Reset Password & MailerAdapter — `F5`, `API-4`, `SEC-2`, `OBS-3`, `STACK-4`, `ARCH-6`):** `src/lib/mailer/{types,resend,dev,index}.ts` memilih `DevOutboxMailer` di non-prod (terekspos via `GET /api/dev/outbox`, `404` di prod) dan `ResendMailer` di prod (`503 MAIL_DELIVERY_UNAVAILABLE` bila gagal/unconfigured); `POST /api/auth/forgot-password` (`422`/`400`) mengembalikan `200` generik (`{ message }`) terlepas dari status email, menyimpan `SHA-256(token)` TTL `30 menit`, mempertahankan token lama sebelum terpakai/kedaluwarsa, dan mengirim email memakai `user.locale`; `POST /api/auth/reset-password` memakai `FOR UPDATE`, menolak token invalid/kedaluwarsa (`400 INVALID_OR_EXPIRED_TOKEN`), menghash password (`cost 12`), menandai semua token user terpakai, dan mencabut seluruh `sessions` user.
- [x] **AC-2.4 (Rate Limiting & Log Privacy — `SEC-5`, `OBS-2`):** `src/lib/rate-limit.ts` membatasi `/register` & `/login` (`10/15m` per `ip:email|anonymous`), `/forgot-password` (`5/15m` per `ip:email|anonymous`), dan `/reset-password` (`5/15m` per `ip`) sebelum validasi Zod dalam `429 RATE_LIMITED` + `Retry-After`; log bebas password, token, maupun header cookie.
- [x] **AC-2.5 (Halaman Auth `(auth)/`, UI & Verifikasi — `I18N-1`, `I18N-2`, `UI-1`–`UI-3`, `UI-5`, `TEST-1`, `TEST-3`, `QUAL-2`, `QUAL-3`):** `src/app/(auth)/layout.tsx` + halaman `/login`, `/register` (keduanya redirect ke `/app` bila sudah login dan ke `/app` pasca-submit; tautan `/forgot-password`, `/register`, konfirmasi password pada `RegisterForm` & `ResetPasswordForm`, penanganan token absen & tautan `/login` di `ForgotPasswordForm`/`ResetPasswordForm`) memakai kamus `auth.*` ID/EN + `ThemeToggle`/`LocaleToggle`, bebas overflow di `360px`/`768px`/`1280px` & keyboard-accessible; `tests/unit/auth-password-token.test.ts`, `tests/integration/auth-flow.test.ts`, `tests/integration/auth-reset.test.ts`, `npm run lint`, dan `npx tsc --noEmit` lulus penuh.

---

## Implementation Considerations

- **Redirect Target Pasca-Notes**: Ketika `RFC-004` menambahkan `/app/notes`, target redirect pasca-login/register di `(auth)/login/page.tsx`, `(auth)/register/page.tsx`, `LoginForm.tsx`, dan `RegisterForm.tsx` diperbarui ke `/app/notes`.

---

## Implementation Notes

- **Ekstraksi Helper Bersama**: Untuk mencegah duplikasi di rute API, mailer, dan form UI, diekstrak modul fokus `src/features/auth/route-helpers.ts` (parsing JSON & penanganan `rate-limit`/`CSRF`/`error`), `src/lib/mailer/templates.ts` (templat email reset password ID/EN ber-escape HTML + `subject` terlokalisasi), dan `src/components/auth/auth-error.ts` (`resolveAuthErrorMessage` dengan pemetaan `Retry-After` serta `t.errors.*`).
- **Primitif UI & Navigasi Klien**: `src/components/ui/Card.tsx` ditambah ekspor `CardFooter` (termasuk `flex-wrap` agar tautan footer aman di viewport sempit) untuk footer aksi form auth, dan `src/lib/http-client.ts` memakai `new URL("/login", window.location.origin).toString()` saat memanggil `window.location.assign()` sehingga lolos aturan ESLint `@next/next/no-location-assign-relative-destination` tanpa membungkam lint (`eslint-disable`).
- **Dukungan `NextRequest` pada Session Reader**: `getSessionUser(req?)`, `requireAuth(req?)`, `readSessionCookieToken(req?)`, dan `getSessionContext(req?)` menerima parameter opsional `req?: NextRequest` untuk membaca cookie `noka_session` secara langsung di *Route Handler* maupun tes integrasi langsung, dan fallback ke `(await cookies())` pada *Server Components*.
- **Cakupan Uji UI Tambahan**: Selain tiga suite pada rencana awal, ditambahkan `tests/unit/auth-forms.test.tsx` (`TS-002-04` di `TEST-STRATEGY.md`) untuk memverifikasi rendering kelima komponen form auth (termasuk `ResetPasswordForm` bertoken aktif), sinkronisasi preferensi ID/EN & mode gelap tanpa kehilangan input, guard server (`AppWorkspaceLayout`, `LoginPage`, `RegisterPage`), serta pembersihan `LogoutButton` di jsdom.
- **Perbaikan Pasca-Audit `reviews/REVIEW-RFC-002.md`**: Memperbaiki perhitungan `expiresAt` pada `checkRateLimit` (`src/lib/rate-limit.ts`) agar memakai timestamp terbaru (`Math.max(...recentTimestamps) + windowMs`) sehingga sweep `> 500` bucket tidak menghapus percobaan aktif staggered; menambahkan verifikasi dummy bcrypt (`DUMMY_PASSWORD_HASH`) di `loginUser()` (`src/features/auth/service.ts`) untuk mitigasi timing side-channel; serta melengkapi uji regresi di `auth-password-token.test.ts` (staggered sweep & mock SDK `ResendMailer`), `logger.test.ts` (`resetUrl`/`reset_url`), `auth-flow.test.ts` (pencabutan sesi aktif di `sessions` saat logout), dan `auth-forms.test.tsx` (`ResetPasswordForm` bertoken aktif + server route/layout guards).
- **Pembaruan `CHANGE-REQUEST-002` (`UI-1`–`UI-3`):** `src/app/(auth)/layout.tsx` menerapkan **floating pill header (`rounded-full`)** satu baris (`max-w-[1360px]`) di desktop maupun mobile **tanpa menu hamburger**, serta form auth (`LoginForm`, `RegisterForm`, `ForgotPasswordForm`, `ResetPasswordForm`) mengikuti token palet hangat `#ededed`/`#222222`/`#ff7448` (`Button` pill & divider `--border-subtle`) sambil tetap memusatkan form card (`max-w-md`) agar nyaman dibaca.
