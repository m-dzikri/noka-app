# Test Strategy: Noka (*Note + Kas*)

> **Tagline:** *"Seringan Notepad, Serapi Buku Kas."* *(EN: "Light as a Notepad, Tidy as a Ledger.")*  
> **Dokumen Sumber:** `PRD.md` (v2.0), `PRD-REVIEW.md`, `FEATURES.md` (`F1`–`F31`), `RULES.md` (`61` Rules), `RFCS.md`, `RFCs/RFC-001`–`RFC-010`  
> **Tanggal:** 11 November 2026  
> **Urutan Otoritas:** `PRD.md` > `FEATURES.md` > `RULES.md` > `RFCs/` > `TEST-STRATEGY.md` (`QUAL-1`)

---

## 0. Baseline & Scope Alignment

### Real Existing Test Suite Baseline (*Step 0*)

Pada tanggal `11 November 2026`, repositori `d:\Projects\noka-app` berada pada **fase spesifikasi pre-implementasi (*greenfield*)**:
- **Berkas di root workspace:** hanya `.agents/`, `.git/`, `RFCs/` (`RFC-001`–`RFC-010`), `AGENTS.md`, `FEATURES.md`, `PRD-REVIEW.md`, `PRD.md`, `RFCS.md`, dan `RULES.md`.
- **Sumber & suite terpasang:** **0 file sumber (`src/`)**, **0 file test (`tests/`)**, dan **belum ada `package.json`**.
- **Output pemeriksaan baseline langsung (`PowerShell`):**
  ```text
  No package.json or tests directory found yet (greenfield specs phase).
  Runtime terverifikasi: Node.js v24.20.0 | npm 11.19.0 | Python 3.13.17
  Database runtime: PostgreSQL 16+ (eksternal/belum diverifikasi di mesin ini hingga RFC-001)
  ```
- **Kebijakan Status Plan Ini:** Seluruh **31 file suite uji** (`17` unit, `11` integration, `3` E2E) + `tests/setup.ts` pada dokumen ini memiliki status per RFC (`Passing` pada RFC yang sudah terimplementasi, `Proposed` pada RFC berikutnya). Kolom status hanya boleh diubah ke `Passing` oleh `/implement-rfc <id>` dan `/review-rfc <id>` setelah kode & test dijalankan nyata tanpa skenario yang di-skip (`TEST-1`, `QUAL-3`).

### Resolusi Konflik Antar-Artefak (`QUAL-1`)
- **`F6` (*Should Have* di `FEATURES.md`) vs. `FR-2` (*Must Have* di `PRD.md`):** `PRD.md` mewajibkan `cycleStartDay` pada *Safe-to-Spend* (`FR-2`, `FR-13` *Must Have*), sedangkan `FEATURES.md` menggabungkan profil, siklus, dan hapus akun ke `F6` (*Should Have*). Mengikuti `PRD.md > FEATURES.md` dan `RFCS.md`, kolom `cycleStartDay` diuji sejak `RFC-001`, `RFC-002`, dan `RFC-007` (prioritas `Must`), sementara keseluruhan fitur `F6` (`/app/settings` + hapus akun) tetap memakai rating asli **`Should`** dari `FEATURES.md` pada `RFC-010` tanpa menimpa peringkat MoSCoW.

### Klasifikasi Product Type (`PRD.md` & `RULES.md`)

Aplikasi **Noka** diklasifikasikan sebagai **Web App** (*Multi-user Responsive Web Application + PWA + Public SEO Pages*).

| Kategori Check | Status | Aplikasi pada Strategi Uji |
|---|---|---|
| Auth & Sessions | **Diterapkan** | Cookies `HttpOnly`/`SameSite=Lax`/conditional `Secure`, CSRF `Origin`/`Host`, rate limiting `429`, SHA-256 reset token 30 menit, pencabutan sesi, wipe cache saat logout/`401` (`SEC-1`–`SEC-5`, `OFFLINE-5`). |
| Authorization per Resource | **Diterapkan** | Isolasi ketat `WHERE user_id = session.userId` di seluruh catatan, folder, tag, lampiran storage, dompet, kategori, transaksi, transfer, snapshot offline, & hapus akun (`SEC-1`, `SEC-6`). |
| Data Model & Migrations | **Diterapkan** | Drizzle ORM + PostgreSQL `bigint` IDR, saldo dompet terturunkan dari ledger, transfer atomik, constraints DB (`CHECK`, `UNIQUE`, `RESTRICT`/`SET NULL`), serta integritas referensial `DATA-1`–`DATA-6`. |
| Accessibility (a11y) | **Diterapkan** | Kontras WCAG 2.1 Level AA (`Light/Dark`), navigasi keyboard (`Tab`, `Escape`, `Ctrl/Cmd+K`, `/`), *focus ring*, `aria-pressed`/`aria-label`, dan `prefers-reduced-motion` (`UI-2`, `UI-5`, `TEST-5`). |
| Responsive Layout | **Diterapkan** | Verifikasi nol *horizontal overflow* di Mobile (`360px` & `375×812`), Tablet (`768px`), dan Desktop (`1280×800`) serta keterjangkauan kontrol di mobile (`UI-3`, `TEST-5`). |
| Browser Support | **Diterapkan** | Automated Playwright Chromium + Mobile viewport; uji parity fallback mode privat (IndexedDB/SW diblokir `SecurityError`) secara unit/E2E serta checklist verifikasi manual Safari iOS/macOS, Firefox, & Edge (`OFFLINE-1`, `NFR-6`). |
| Page-Load Budget | **Diterapkan** | Benchmark parser Quick Capture `≤ 50 ms`, query/API CRUD `p95 ≤ 300 ms`, dan audit Lighthouse produksi (`Performance ≥ 90`, `Accessibility ≥ 95`, `Best Practices ≥ 95`, `SEO ≥ 90`, `LCP ≤ 2,5s`, `TTI ≤ 2,5s`) (`PERF-1`–`PERF-4`). |
| SEO for Public Pages | **Diterapkan** | SSR HTML `/`, single `<h1>` + `<h2>`–`<h3>`, metadata terlokalisasi ID/EN via `getAppUrl()` (`force-dynamic` build-safe), `opengraph-image` `1200×630`, `robots.txt`, dan `sitemap.xml` (`PERF-3`, `ARCH-6`). |
| Offline Sync *(Pengecualian eksplisit)* | **Diterapkan** | Service Worker split cache (`noka-shell-v1` vs `noka-private-v1`), IndexedDB mirror + FIFO outbox iOS-safe (`online`/fokus/app-open/**Sync Now**, nol `Background Sync API`), *idempotency key*, dan kalkulasi ledger lokal (`OFFLINE-1`–`OFFLINE-5`). |
| Binary Size | **Dilewati** | Produk didistribusikan via browser web/PWA (`F31`, `DEC-3`), bukan biner native App Store/Play Store; anggaran ukuran dikontrol melalui *web bundle budget* (`PERF-4`). |
| Public Third-Party API SLA & Versioning | **Dilewati** | Seluruh route `/api/**` bersifat *first-party internal* khusus web app Noka, bukan API publik untuk pihak ketiga (`PRD.md`, `RULES.md`). |

---

## 1. Strategi Pengujian Lintas Lapisan

### 1.1 Unit Testing (`Vitest 5.1.0`, `jsdom@31.0.0` / `node`, `fake-indexeddb@6.2.8`)
- **Kebijakan Cakupan (`RULES.md` `TEST-1`, `TEST-2`, `TEST-4`):** Noka menerapkan pengujian kasus-tepi deterministik menyeluruh (bukan angka persentase cakupan sembarang) pada: env/logger/idempotency, auth/token/password helper, GFM checklist parser & XSS Markdown URL filter, validasi magic bytes & `StorageAdapter` guard, kalkulator saldo ledger `computeWalletBalances` & `formatIdr`, kalkulator *Safe-to-Spend* & clamping siklus tanggal, komponen `<PrivacyAmount />`/i18n/shell/editor, parser & UI bar *Smart Quick Capture*, serta mesin outbox IndexedDB `flushOutbox()`.
- **Strategi Mock & Stub:**
  - *Fungsi domain murni* (`checklist.ts`, `ledger.ts`, `format.ts`, `safe-to-spend.ts`, `quick-capture/parser.ts`, `canonicalJson`/`resolveLwwTimestamp`) **tidak pernah di-mock** — diuji langsung dengan *clock*/tanggal deterministik yang disuntikkan.
  - *Unit komponen UI* (`preferences-i18n`, `shell-layout`, `note-editor`, `privacy-blur`, `quick-capture-bar`) memakai `jsdom` + `@testing-library/react@16.3.3` + `@testing-library/jest-dom@7.0.1` (di `tests/setup.ts`) dengan mock callback/props terketik ketat.
  - *Lapisan offline & storage unit*: memakai `fake-indexeddb@6.2.8` untuk IndexedDB nyata di Vitest serta stub terkontrol untuk `fetch`, `navigator.onLine`/`locks`, dan SDK S3 (`@aws-sdk/client-s3`).

### 1.2 Integration Testing (`Vitest 5.1.0` `@vitest-environment node` + PostgreSQL Nyata)
- Menguji Service + Next.js Route Handlers secara langsung terhadap **database PostgreSQL migrasi Drizzle (`0000_init.sql`)**:
  - Validasi schema Zod, route param UUID (`422`), malformed JSON (`400 INVALID_JSON`), CSRF `Origin`/`Host` (`403`), rate limiter `429` + `Retry-After`, serta amplop `API-1`.
  - Isolasi multi-tenant `userId` (semua operasi lintas user -> `404`/`403` tanpa kebocoran eksistensi ID), integritas referensial (`HIGH-3`), race concurrency (`withIdempotency` paralel `0` duplikat; `FOR UPDATE` batas 5 lampiran, reset token, dan hapus akun), transaksi atomik transfer & kategori, serta rollback kompensasi storage.
  - Mailer menggunakan `DevOutboxMailer` terisolasi (ditambah simulasi gagal `ResendMailer` -> `503`); object storage diuji pada `LocalStorageAdapter` direktori sementara terisolasi + kontrak mock `S3StorageAdapter`.

### 1.3 End-to-End Testing (`Playwright 1.65.0`)
- Proyek Playwright: **`desktop` (`1280×800`)** dan **`mobile` (`375×812`)**, plus uji viewport tambahan **`360×800`** (batas minimum Mobile `UI-3`) dan **`768×1024`** (Tablet).
- Mencakup: SSR SEO publik (`/`, `robots.txt`, `sitemap.xml`, `opengraph-image`), navigasi keyboard (`Tab`, `Enter`, `Escape`, `Ctrl/Cmd+K`, `/`), pergantian `ID/EN` & `Light/Dark` tanpa hilangnya teks ketikan, mode offline-online (`context.setOffline(true/false)` + `localStorage` + `IndexedDB` + Service Worker cache `noka-shell-v1`/`noka-private-v1`), logout & hapus akun membersihkan cache privat 100%, serta alur ujung-ke-ujung rilis v1.0.

### 1.4 Security Testing (`SEC-1`–`SEC-7`, `OBS-2`, `HIGH-4`)
- Verifikasi cookie sesi (`HttpOnly`, `SameSite=Lax`, `Secure` bersyarat HTTPS) & pembatasan `verifyCsrfOrigin`.
- Verifikasi brute-force rate limit (`10/15m` login/register; `5/15m` forgot/reset) dan anti-enumerasi `POST /api/auth/forgot-password` (`200` identik).
- Verifikasi *horizontal privilege escalation* pada Notes, Folders, Attachments (endpoint & `storageKey`), Wallets, Categories, Transactions, Transfers, Linked Notes, & Snapshot.
- Verifikasi XSS Markdown (tanpa `rehype-raw`, blokir `javascript:`, `data:`, `vbscript:`, `//evil.com`), file spoofing (`exe`/SVG berkedok `.jpg` ditolak `fileTypeFromBuffer`), anti-path traversal di `LocalStorageAdapter`, bebas kebocoran sensitif pada `logger`, pemisahan `401 INVALID_CURRENT_PASSWORD` vs `401 UNAUTHORIZED` (hanya `UNAUTHORIZED` yang me-wipe klien), dan hapus akun membersihkan DB + storage + IndexedDB + SW private cache.

### 1.5 Performance Testing & Benchmarks (`PERF-1`–`PERF-4`)
- **Parser Micro-Benchmark (`RFC-008`):** `parseQuickCapture` wajib rata-rata/maks `< 50 ms` pada input panjang & konteks 100+ dompet/kategori.
- **API Latency Budget (`RFC-004`/`006`/`007`):** Query & paginasi keyset (`limit <= 100`, indeks parsial/komposit, agregasi SQL) diukur pada dataset seed uji untuk memastikan `p95 ≤ 300 ms` (`PERF-2`).
- **Build & Lighthouse Gate (`RFC-003`, `RFC-010`):** Build produksi (`npm run build` tanpa DB/secret aktif untuk membuktikan `ARCH-6`), pemeriksaan bundel awal bebas library berat (`PERF-4`), serta audit Lighthouse pada `npm run start` (`Performance ≥ 90`, `Accessibility ≥ 95`, `Best Practices ≥ 95`, `SEO ≥ 90`, `LCP ≤ 2,5s`, `TTI ≤ 2,5s`).

### 1.6 Test Data Strategy
- **Database & Env Terisolasi:** Menggunakan `DATABASE_URL` khusus database uji terpisah dan `NODE_ENV="test"`. Memanggil `resetEnvCacheForTest()`, `clearRateLimitsForTest()`, dan `clearOutbox()` pada `beforeEach`/`afterEach` unit & integrasi.
- **Pembersihan State Antar-Test:**
  - *Unit UI/Sync:* `tests/setup.ts` mereset DOM Testing Library + `localStorage`/cookie + memulihkan mock `fetch`; `fake-indexeddb` memakai ID database unik per user/test (`noka-offline-${userId}`) dan ditutup bersih di `afterEach`.
  - *Integration DB:* Migrasi Drizzle diterapkan sekali sebelum suite; setiap suite/test menggunakan user factory unik (`userA@example.test`, `userB@example.test` dengan UUID acak) atau truncation terurut FK dalam transaksi/cleanup hook agar test tetap paralel-aman dan bebas kontaminasi silang.
  - *Local Storage Fixture:* Berkas lampiran uji ditempatkan di folder sementara `.data/test-uploads-<runId>` dan dibersihkan via `afterAll`, tidak pernah menyentuh `public/`.
  - *Data Bebas PII Nyata:* Seluruh akun & catatan uji menggunakan kredensial sintetis (`*.test`, password dummy ≥ 8 char) tanpa kredensial produksi maupun data pribadi asli.

---

## 2. Ringkasan Suite & Matriks Prioritas (*Recounted*)

| RFC | Nama Singkat | Fitur & Prioritas (`FEATURES.md`) | Unit (`Proposed`) | Integration (`Proposed`) | E2E (`Proposed`) | Total Suite |
|---|---|---|---:|---:|---:|---:|
| **RFC-001** | Foundation, Schema & Shell | `F2`, `F3` (*Must*) | 6 (+`setup.ts`) | 2 | 0 | **8** |
| **RFC-002** | Auth, Session & Password Reset | `F4`, `F5` (*Must*) | 2 | 2 | 0 | **4** |
| **RFC-003** | Public SEO Landing Page | `F1` (*Must*) | 0 | 0 | 1 | **1** |
| **RFC-004** | Notes, Markdown, GFM & Search | `F7`, `F8` (*Must*) | 2 | 1 | 0 | **3** |
| **RFC-005** | Secure Note Image Attachments | `F9` (*Must*) | 1 | 1 | 0 | **2** |
| **RFC-006** | Finance Core & Atomic Transfers | `F10`, `F11`, `F12` (*Must*) | 1 | 2 | 0 | **3** |
| **RFC-007** | Dashboard, Safe-to-Spend & Blur | `F13`, `F16`, `F17` (*Must*) | 2 | 1 | 0 | **3** |
| **RFC-008** | Quick Capture & Linked Notes | `F14`, `F15` (*Must*) | 2 | 1 | 0 | **3** |
| **RFC-009** | PWA, IndexedDB & Offline Sync | `F18`, `F19` (*Must*) | 1 | 0 | 1 | **2** |
| **RFC-010** | Settings, Cycle & Account Delete | `F6` (*Should*) + Gate v1.0 | 0 | 1 | 1 | **2** |
| **Total** | — | **18 Must + 1 Should (v1.0)** | **17** | **11** | **3** | **31** |

> *(Cakupan tertunda/terkecuali `FEATURES.md`: `F20`–`F24` (*Could Have* v1.1) dan `F25`–`F31` (*Won't Have*) diverifikasi tidak diimplementasikan pada kode maupun rute API v1.0).*

---

## 3. Urutan Eksekusi Pengujian

Pengujian mengikuti urutan topologi implementasi `RFCS.md`:
1. **`RFC-001`** *(Critical Path Root)* → **`RFC-002`** *(Critical Path Gate)*
2. Cabang paralel pasca-`RFC-002`:
   - **Jalur Publik:** **`RFC-003`**
   - **Jalur Catatan:** **`RFC-004`** → **`RFC-005`**
   - **Jalur Keuangan:** **`RFC-006`** → **`RFC-007`**
3. **Konvergensi Sinergi:** **`RFC-008`** *(memerlukan `RFC-004`, `RFC-006`, `RFC-007`)*
4. **Konvergensi Offline-First:** **`RFC-009`** *(memerlukan `RFC-001`–`RFC-008`)*
5. **Finalisasi Rilis Publik:** **`RFC-010`** *(memerlukan `RFC-001`, `RFC-002`, `RFC-005`, `RFC-007`, `RFC-009`)*

Gerbang wajib tiap RFC sebelum status menjadi `Implemented`: **`npm run lint` + `npm run typecheck` + seluruh test RFC tersebut & dependensinya lulus (`0 skipped`, `QUAL-3`)**.

---

## 4. Rencana Uji Per RFC

## RFC-001: Project Foundation, Database Schema, Design Tokens & Bilingual Shell

- **Fitur & Prioritas:** `F2`, `F3` — **Must Have**
- **Prasyarat (*Depends on*):** `none`
- **Aturan Terkait:** `STACK-1`–`STACK-4`, `ARCH-1`, `ARCH-2`, `ARCH-4`–`ARCH-6`, `DATA-1`, `DATA-4`, `DATA-6`, `API-1`–`API-3`, `UI-1`–`UI-3`, `UI-5`, `I18N-1`, `I18N-2`, `PERF-4`, `OBS-1`, `OBS-2`, `TEST-1`, `QUAL-1`–`QUAL-3`
- **File Suite (`Passing`):** `tests/setup.ts`, `tests/setup.integration.ts`, `tests/unit/logger.test.ts`, `tests/unit/env.test.ts`, `tests/unit/db.test.ts`, `tests/unit/idempotency.test.ts`, `tests/unit/preferences-i18n.test.tsx`, `tests/unit/shell-layout.test.tsx`, `tests/integration/health.test.ts`, `tests/integration/idempotency-db.test.ts`

| Test ID | Status | File & Lapisan | Prioritas | Skenario & Langkah | Prasyarat | Hasil yang Diharapkan & Kriteria Gagal |
|---|---|---|---|---|---|---|
| **TS-001-01** | Passing | `tests/unit/env.test.ts` (Unit) | Must | Uji `getEnv()`, `getAppUrl()`, `resetEnvCacheForTest()` dengan S3/Resend kosong, parsial, lengkap, `""`, `SESSION_SECRET < 32`, serta `getAppUrl()` tanpa `DATABASE_URL`. | Node env stub | `""` dinormalisasi ke `undefined`; grup kosong lulus; grup S3/Resend parsial & `SESSION_SECRET < 32` gagal Zod; `S3_REGION` fallback `"auto"`; `getAppUrl()` kembalikan default/normalized URL tanpa `DATABASE_URL`. |
| **TS-001-02** | Passing | `tests/unit/logger.test.ts` (Unit) | Must | Panggil `createLogger(requestId)` / `logger.{info,warn,error}` dengan objek mengandung `content`, `amount`, `contentType`, `password`, `token`, `secret`, `authorization`, `noteContent`, `initialBalance`, key `timestamp`/`level` di `meta`, dan `new Error()`. | Spy `stdout`/`stderr` | Single-line JSON; field inti tidak tertimpa; exact `content`/`amount` + substring sensitif tersensor `"[REDACTED]"`, namun `contentType`/`contentLength` tetap utuh; `Error` diserialisasi hanya `{ name, message }` tanpa `stack`. |
| **TS-001-03** | Passing | `tests/unit/idempotency.test.ts` (Unit) | Must | Uji `canonicalJson` (urut kunci rekursif, hapus `undefined`, pertahankan urutan array, `bigint`->string), `apiOk`/`apiError`/`handleApiError` (`SyntaxError`->`400`, `ApiError`->statusnya, unknown->`500`), dan `resolveLwwTimestamp` (absen, future > `60s` ter-clamp, valid older->`serverNewer: true`, malformed->`422 INVALID_TIMESTAMP`). | Pure unit / unit DOM-free | Deterministik 100%; gagal jika hash bergantung urutan kunci objek atau clock future tidak di-clamp `<= now + 60_000 ms`. |
| **TS-001-04** | Passing | `tests/integration/idempotency-db.test.ts` (Integration) | Must | Jalankan migrasi `0000_init.sql`, uji `withIdempotency`: replay sukses (`2xx`), konflik beda payload (`409 IDEMPOTENCY_KEY_CONFLICT`), rollback domain + persist `409` `ApiError`, non-caching `5xx`, dan **2 request paralel identik** (`Promise.all`) dengan key sama; verifikasi pula `bigint` & `CHECK`/`FK` dasar 13 tabel. | PostgreSQL uji + Drizzle | Request paralel mengeksekusi handler **tepat 1 kali** (`0` duplikat, `2` respons `2xx` identik); error `5xx` tidak tersimpan di `idempotency_keys`. |
| **TS-001-05** | Passing | `tests/integration/health.test.ts` (Integration) | Must | Panggil `GET /api/health` pada koneksi DB sehat dan simulasikan timeout/error DB (`2000 ms`); uji pula `npm run build` tanpa `DATABASE_URL` aktif. | PostgreSQL uji + build check | DB sehat -> `200 { ok: true, data: { status: "ok", db: "connected" } }`; DB mati/timeout -> `503 DB_UNAVAILABLE`; `npm run build` tidak gagal mengimpor modul DB/env (`ARCH-6`). |
| **TS-001-06** | Passing | `tests/unit/preferences-i18n.test.tsx` (Unit) | Must | Render `PreferencesProvider` + `<ThemeToggle>` (ikon-saja tanpa teks tampak, `aria-pressed`, `aria-label`) + `<LocaleToggle>` + `<input>` berteks; cek `getServerPreferences` fallback `'id'`/`'light'`, fallback `localStorage` hanya bila cookie absen, `persist handler`, serta ketikan di `<input>` saat ganti tema & bahasa. | `jsdom` + `tests/setup.ts` | `ThemeToggle` merender ikon tanpa teks tampak (`textContent.trim() === ""`) dengan `aria-label`/`aria-pressed` valid; DOM `data-theme`/`lang`, `localStorage`, cookie non-HttpOnly, & `registerPersistHandler` terbarui seketika tanpa reload; isi `<input>` tidak hilang/ter-reset (`I18N-2`). |
| **TS-001-07** | Passing | `tests/unit/shell-layout.test.tsx` (Unit) | Must | Render `AppShell` (floating pill header `rounded-full` dalam kontainer `max-w-[1360px]`, bilah mobile satu baris + menu hamburger vertikal 1 item per baris untuk `LocaleToggle`/`ThemeToggle`/badge `user`/`logoutSlot`, `Escape` focus restore), `LandingHeader` (floating pill header, guest/auth menu mobile 1 item per baris, klik link & `Escape`), `WorkspaceNav` pill, `Button`, `Input`, `Card`, `Modal` (focus trap, `Escape`, backdrop click, `role="dialog"`, controlled input + inline `onClose` stability), token `danger`, `<h1>` pada `AppOverview`, uji fallback `onMobileQuickAction` (`#noka-quick-capture-input` -> `/app/notes`), boundary rute mobile nav, & `/app/page.tsx`. | `jsdom` + `tests/setup.ts` | Menu hamburger menutup via `Escape` (fokus kembali ke pemicu) dan klik tautan; seluruh baris menu mobile tersusun vertikal 1 item per baris; 3 tautan rute (`/app/notes`, `/app/finance`, `/app/settings`) terpisah & bebas false prefix match; controlled input tetap fokus saat re-render; tombol `danger` memakai `--danger-bg`/`--danger-fg`; navigasi keyboard/ARIA valid; bebas `TODO`/stub (`QUAL-2`). |
| **TS-001-08** | Passing | `tests/unit/db.test.ts` (Unit) | Must | Uji `getPool()` & `getDb()` pada `NODE_ENV="production"` (reuse singleton `Pool` & `AppDatabase`), reset singleton saat `DATABASE_URL` berubah, serta pengecekan SSL non-localhost vs IPv6 `[::1]` / `127.0.0.1` / `localhost` / `sslmode=disable`. | Mock `pg.Pool` + Node env | Hanya 1 instance `Pool` dibuat di `production` untuk URL yang sama; host `[::1]` tidak mengaktifkan SSL; perubahan URL menutup `Pool` lama dan menyegarkan instance Drizzle. |

---

## RFC-002: Authentication, Session Security & Password Reset

- **Fitur & Prioritas:** `F4`, `F5` — **Must Have**
- **Prasyarat (*Depends on*):** `RFC-001`
- **Aturan Terkait:** `STACK-4`, `ARCH-2`, `ARCH-6`, `DATA-4`, `API-1`, `API-2`, `API-4`, `SEC-1`–`SEC-5`, `OFFLINE-5`, `UI-1`–`UI-3`, `UI-5`, `I18N-1`, `I18N-2`, `OBS-2`, `OBS-3`, `TEST-1`, `TEST-3`, `QUAL-2`, `QUAL-3`
- **File Suite (`Passing`):** `tests/unit/auth-password-token.test.ts`, `tests/unit/auth-forms.test.tsx`, `tests/integration/auth-flow.test.ts`, `tests/integration/auth-reset.test.ts`

| Test ID | Status | File & Lapisan | Prioritas | Skenario & Langkah | Prasyarat | Hasil yang Diharapkan & Kriteria Gagal |
|---|---|---|---|---|---|---|
| **TS-002-01** | Passing | `tests/unit/auth-password-token.test.ts` (Unit) | Must | Uji `hashPassword`/`verifyPassword` (`bcryptjs` cost >= 12), `generateTokenPair` (raw 32-byte `base64url` vs `SHA-256` hex), `checkRateLimit` sliding window + `Retry-After` & retensi timestamp staggered saat sweep `>500` bucket, `verifyCsrfOrigin` (`Origin`, `Referer`, missing/mismatch), `ResendMailer` (mock SDK sukses/`{ error }`/exception -> `503` bebas PII), dan `apiFetch` pada `401 UNAUTHORIZED` vs `401 INVALID_CREDENTIALS`. | `clearRateLimitsForTest()` | Cost hash `>= 12`; sweep tidak menghapus bucket bertimestamp aktif; `ResendMailer` aman bebas PII/token di log; CSRF mismatch/absen -> `403 CSRF_ORIGIN_MISMATCH`; `apiFetch` **hanya** menjalankan `runClientLogoutCleanup()` (sambil menyisakan `noka_theme`/`noka_locale`/`noka_privacy_blur`) ketika `error.code === "UNAUTHORIZED"`. |
| **TS-002-02** | Passing | `tests/integration/auth-flow.test.ts` (Integration) | Must | Jalankan `POST /api/auth/register` (termasuk normalisasi email, duplikat `409`, seeding **12 kategori sistem** ID/EN, cookie `HttpOnly` + `SameSite=Lax` + `Secure` sesuai `APP_URL`), `POST /api/auth/login` (`401 INVALID_CREDENTIALS`), `GET /api/auth/me` (memuat `cycleStartDay`, tanpa `passwordHash`), `getSessionUser()` tanpa cookie (0 query DB), rate limit `> 10 / 15m` -> `429`, dan `POST /api/auth/logout` idempoten. | PostgreSQL uji | 12 `systemKey` terbentuk dalam transaksi registrasi; akses `/api/auth/me` pasca-logout atau sesi kedaluwarsa -> `401 UNAUTHORIZED`; log bebas password/cookie (`OBS-2`). |
| **TS-002-03** | Passing | `tests/integration/auth-reset.test.ts` (Integration) | Must | Uji `POST /api/auth/forgot-password` pada email terdaftar vs tidak terdaftar (`API-4`), cek token `SHA-256` TTL 30m di DB & `GET /api/dev/outbox` (`404` di `production`), simulasikan `MailerAdapter` error di `production` (`503 MAIL_DELIVERY_UNAVAILABLE`), rate limit `> 5 / 15m` -> `429`, dan `POST /api/auth/reset-password` (token valid, expired/used `400`, paralel `FOR UPDATE` race, pencabutan seluruh `sessions` user + login password baru). | PostgreSQL uji + `clearOutbox()` | Respons forgot-password `200` identik (anti-enumerasi); reset memutus 100% sesi aktif lama (`HIGH-4`); token ke-2 pada token sama atau race paralel ditolak `400 INVALID_OR_EXPIRED_TOKEN`. |
| **TS-002-04** | Passing | `tests/unit/auth-forms.test.tsx` (Unit) | Must | Uji komponen `LoginForm`, `RegisterForm`, `ForgotPasswordForm`, `ResetPasswordForm` (token absen maupun token aktif: validasi `<8` karakter/konfirmasi, `400 INVALID_OR_EXPIRED_TOKEN`, submit `200` + tautan `/login`), `LogoutButton`, serta guard server `AppWorkspaceLayout` (`/app` -> `/login`), `LoginPage`, & `RegisterPage` (`/app` bila sudah login). | jsdom + Testing Library | Seluruh teks form & error terlokalisasi ID/EN, state input bertahan saat switch locale/tema, guard server mengarahkan sesuai status sesi, dan `LogoutButton` menghapus cache privat sambil mempertahankan preferensi UI. |

---

## RFC-003: Public SEO Landing Page

- **Fitur & Prioritas:** `F1` — **Must Have**
- **Prasyarat (*Depends on*):** `RFC-001`, `RFC-002`
- **Aturan Terkait:** `ARCH-1`, `ARCH-4`, `ARCH-6`, `UI-1`–`UI-5`, `I18N-1`, `I18N-2`, `PERF-1`, `PERF-3`, `PERF-4`, `TEST-1`, `TEST-5`, `QUAL-2`, `QUAL-3`
- **File Suite (`Passing`):** `tests/e2e/landing-seo.spec.ts` (+ verifikasi `npm run build` & audit Lighthouse produksi)

| Test ID | Status | File & Lapisan | Prioritas | Skenario & Langkah | Prasyarat | Hasil yang Diharapkan & Kriteria Gagal |
|---|---|---|---|---|---|---|
| **TS-003-01** | Passing | `tests/e2e/landing-seo.spec.ts` (E2E) | Must | Buka `/` tanpa sesi (verifikasi `HTTP 200`, `<h1>` tunggal terpusat penuh satu layar awal desktop & mobile dengan `#landing-preview-heading` dimulai setelah satu layar penuh di atas `.noka-hero-grid` `>= 100dvh`, `<h2>` + 5 `<h3>` pada grid seimbang, CTA `/register` & `/login` — via menu hamburger vertikal satu item per baris pada mobile `< 640px` — 3 poin privasi footer), lalu login dan buka `/` (verifikasi CTA berubah ke `/app` & `#preview` serta tinggi header pill mobile satu baris `<= 72px`). Uji juga `/login` di mobile memakai floating pill header tanpa hamburger menu. Periksa juga respons `robots.ts` (`Sitemap:`, disallow `/app/`, `/api/`), `sitemap.ts` (memuat `/`, `/login`, `/register`; mengecualikan `/forgot-password`/`/reset-password`), dan `/opengraph-image` (`PNG 1200×630`). | Playwright server + DB uji | HTML SSR terrender lengkap; `metadataBase` & URL berasal dari `getAppUrl()` (`force-dynamic`); `npm run build` lulus tanpa `DATABASE_URL`/`SESSION_SECRET` (`ARCH-6`). |
| **TS-003-02** | Passing | `tests/e2e/landing-seo.spec.ts` (E2E) | Must | Uji `FeaturePreviewCard`: klik 3 preset Quick Capture (`(a)`), centang checklist GFM lokal (`(b)`), cek kartu *Safe-to-Spend* & *Linked Notes* (`(c)`), nyalakan demo Privacy Blur (`(d)` -> `Rp •••••` tanpa panggilan API), ganti `LocaleToggle` ID/EN & `ThemeToggle` ikon-saja Light/Dark (melalui panel menu hamburger vertikal di viewport mobile) tanpa reload serta cek state `FeaturePreviewCard` tetap utuh. Verifikasi CSS tokens bebas `#ffffff`/`#000000` murni dan memenuhi rasio kontras WCAG AA (`UI-2`). Uji navigasi keyboard dan ukur `scrollWidth <= innerWidth`, tinggi header pill tertutup `<= 72px`, serta tombol kontrol tampak `>= 40px` di `360px`, `375×812`, `768px`, dan `1280×800`. | Playwright (`desktop` & `mobile`) | Tidak ada reload; `ThemeToggle` bebas teks tampak; state interaktif `FeaturePreviewCard` bertahan saat toggle bahasa/tema (`I18N-2`); nol *horizontal overflow*; target sentuh kontrol tampak header `>= 40px`; palet `#ededed`/`#222222`/`#ff7448` lolos kontras AA; audit Lighthouse mencatat `Perf ≥ 90`, `A11y ≥ 95`, `BP ≥ 95`, `SEO ≥ 90`, `LCP ≤ 2,5s` (`PERF-1`). |

---

## RFC-004: Notes Workspace — Markdown, GFM Checklists, Folders, Tags & Instant Search

- **Fitur & Prioritas:** `F7`, `F8` — **Must Have**
- **Prasyarat (*Depends on*):** `RFC-001`, `RFC-002`
- **Aturan Terkait:** `ARCH-1`, `ARCH-2`, `ARCH-4`, `ARCH-5`, `DATA-4`, `DATA-6`, `API-1`–`API-3`, `API-5`, `SEC-1`, `SEC-4`, `SEC-7`, `UI-3`, `UI-5`, `UI-6`, `I18N-1`, `PERF-2`, `TEST-1`, `TEST-3`, `QUAL-2`, `QUAL-3`
- **File Suite (`Proposed`):** `tests/unit/notes-checklist-markdown.test.ts`, `tests/unit/note-editor.test.tsx`, `tests/integration/notes-folders-tags.test.ts`

| Test ID | Status | File & Lapisan | Prioritas | Skenario & Langkah | Prasyarat | Hasil yang Diharapkan & Kriteria Gagal |
|---|---|---|---|---|---|---|
| **TS-004-01** | Proposed | `tests/unit/notes-checklist-markdown.test.ts` (Unit) | Must | Uji `toggleMarkdownChecklistItem()` (CRLF, blockquote/indentasi, fenced code block ```` ``` ```` & `~~~` panjang variabel diabaikan, keselarasan spasi `remark-gfm` `1:1`, out-of-range aman) dan `<MarkdownPreview>` (`rehype-raw` tidak aktif, blokir `javascript:`, `data:`, `vbscript:`, `//evil.com`, checkbox keyboard-accessible). | `jsdom` + pure unit | Indeks klik UI selalu mengubah baris `- [ ]` ↔ `- [x]` yang tepat (`MED-2`); link berbahaya dibersihkan (`SEC-7`). |
| **TS-004-02** | Proposed | `tests/unit/note-editor.test.tsx` (Unit) | Must | Render `NoteEditor` & `NotesWorkspace`: uji debounced auto-save `600 ms`, mode Edit/Preview/Split, toolbar Markdown, kontrol **Pin** `aria-pressed`, pemilih Folder, editor Tags, badge status (`saved`/`saving`/`pendingSync`/`error`), dan `Modal` konfirmasi hapus; uji klik checklist memicu update Markdown + `onSaveNote`. | Fake timers + `jsdom` | Auto-save terpicu setelah jeda `600 ms` tanpa kehilangan ketikan cepat; kontrol keyboard & label ARIA berfungsi penuh. |
| **TS-004-03** | Proposed | `tests/integration/notes-folders-tags.test.ts` (Integration) | Must | Uji `/api/notes/**`, `/api/folders/**`, `/api/tags`: CRUD lengkap, pencarian `ILIKE` ber-escape `%`/`_`/`\` lintas `title`/`content`/`tags.name`, cursor base64url (`400 INVALID_CURSOR`, `limit <= 100`, urutan `isPinned DESC, updatedAt DESC, id DESC`), normalisasi tag sebelum `max(20)` + reaktivasi tombstone + cleanup tag yatim, duplikat folder `409` vs self-rename `200`, hapus folder -> `notes.folderId = NULL`, hapus note -> `transactions.noteId = NULL` + cleanup hook, LWW (`applied`/`server_newer` termasuk empty-body `DELETE`), `withIdempotency`, & isolasi lintas user (`404`/`403`). | PostgreSQL uji (2 user) | Lintas `userId` selalu `404` (`folderId` asing ditolak); tag tanpa catatan aktif tidak muncul di `GET /api/tags`; latensi query cari terjaga < `300 ms` (`PERF-2`); post-login redirect ke `/app/notes`. |

---

## RFC-005: Secure Note Image Attachments (Online-Only v1.0)

- **Fitur & Prioritas:** `F9` — **Must Have**
- **Prasyarat (*Depends on*):** `RFC-001`, `RFC-002`, `RFC-004`
- **Aturan Terkait:** `STACK-3`, `ARCH-2`, `ARCH-6`, `API-1`, `API-2`, `SEC-1`, `SEC-4`, `SEC-6`, `OFFLINE-4`, `UI-3`, `UI-5`, `I18N-1`, `OBS-2`, `OBS-3`, `TEST-1`, `TEST-3`, `QUAL-2`, `QUAL-3`
- **File Suite (`Proposed`):** `tests/unit/attachment-validation.test.ts`, `tests/integration/note-attachments.test.ts`

| Test ID | Status | File & Lapisan | Prioritas | Skenario & Langkah | Prasyarat | Hasil yang Diharapkan & Kriteria Gagal |
|---|---|---|---|---|---|---|
| **TS-005-01** | Proposed | `tests/unit/attachment-validation.test.ts` (Unit) | Must | Uji `fileTypeFromBuffer` (`JPEG`/`PNG`/`WebP` vs spoof `.jpg` berisi teks/EXE/SVG -> `422`), validasi ukuran `0 byte` (`422 EMPTY_FILE`) & `> 5 MB` (`413`), `LocalStorageAdapter` anti-path traversal (`../` ditolak), `S3StorageAdapter` batch `deleteObjects` per 1.000 key + abaikan `NoSuchKey`, production no-S3 -> `ApiError(503, "STORAGE_UNAVAILABLE")`, dan `NoteAttachmentsPanel` saat `!isOnline` (tombol unggah & hapus nonaktif, `offlinePlaceholder` muncul saat `onError`, auto-retry saat `online`, lightbox). | `jsdom` + mock SDK S3 + `.data/test-*` | Tidak ada penulisan ke luar direktori dasar storage; saat `!isOnline` unggah maupun hapus lampiran tidak dapat dikirim (`OFFLINE-4`). |
| **TS-005-02** | Proposed | `tests/integration/note-attachments.test.ts` (Integration) | Must | Uji `POST /api/notes/[id]/attachments` (multipart check `400`, CSRF `403`, unauth `401`, batas 5 gambar + `FOR UPDATE` paralel ke-6 -> `409 ATTACHMENT_LIMIT_REACHED`, UUID `storageKey` abaikan filename klien, rollback + kompensasi `deleteObject` saat DB gagal), `GET /api/attachments/[attachmentId]` (header `nosniff`, `Cache-Control: private, max-age=3600`, `404` lintas user & `404 ATTACHMENT_OBJECT_MISSING`), `DELETE` (`503` rollback), hapus note via `service.ts` menghapus objek pasca-commit tanpa gagal `503` bila storage error, serta `deleteUserAttachmentObjects`. | PostgreSQL uji + `LocalStorageAdapter` | File lintas user 100% ditolak `404` (`SEC-6`); unggah ke-6 paralel selalu menghasilkan maks `5` gambar di DB & disk; error S3 pasca-commit `deleteNote` tidak menggagalkan penghapusan catatan. |

---

## RFC-006: Finance Core — Multi-Wallets, Categories, Ledger Transactions & Atomic Transfers

- **Fitur & Prioritas:** `F10`, `F11`, `F12` — **Must Have**
- **Prasyarat (*Depends on*):** `RFC-001`, `RFC-002`
- **Aturan Terkait:** `ARCH-1`, `ARCH-2`, `DATA-1`–`DATA-4`, `DATA-6`, `API-1`–`API-3`, `API-5`, `SEC-1`, `SEC-4`, `UI-3`–`UI-5`, `I18N-1`, `PERF-2`, `TEST-1`–`TEST-3`, `QUAL-2`, `QUAL-3`
- **File Suite (`Proposed`):** `tests/unit/finance-ledger.test.ts`, `tests/integration/finance-wallets-categories.test.ts`, `tests/integration/finance-transfers.test.ts`

| Test ID | Status | File & Lapisan | Prioritas | Skenario & Langkah | Prasyarat | Hasil yang Diharapkan & Kriteria Gagal |
|---|---|---|---|---|---|---|
| **TS-006-01** | Proposed | `tests/unit/finance-ledger.test.ts` (Unit) | Must | Uji `ledger.ts` (`computeWalletBalances` murni bebas `@/db`) atas kombinasi `initialBalance`, `income`, `expense`, `transferIn`, `transferOut`, & tombstones (`deletedAt !== null`); uji `formatIdr` (`plain`/`signed`, `0`, negatif, ribuan) dan Zod `schemas.ts` (`bigint` `<= MAX_SAFE_INTEGER`, tolak float/0/negatif/payload `balance` klien/`PATCH {}`). | Pure unit (`TEST-2`) | Saldo cocok `initial + in - out + xferIn - xferOut`; nominal float/negatif/0 pada tx/transfer ditolak `422 VALIDATION_ERROR`. |
| **TS-006-02** | Proposed | `tests/integration/finance-wallets-categories.test.ts` (Integration) | Must | Uji `/api/wallets/**` & `/api/categories/**`: default `includeInSafeToSpend` (`bank: false`, lain `true`), promosi `isDefault` (create pertama, unarchive, archive/delete default), tolak `{ isDefault: true, archived: true }` (`422`) & set default dompet berarsip (`409 WALLET_ARCHIVED`), **tolak `DELETE` dompet berriwayat (termasuk tombstone) dengan `409 WALLET_HAS_HISTORY` setelah LWW**, izinkan delete `0`-riwayat; kategori sistem tolak `PATCH`/`DELETE` `403` **sebelum LWW**, `PATCH` tolak ubah `type`, duplikat inklusif kategori sistem (`409`), hapus custom migrasi transaksi ke `other_expense`/`other_income` (`reassignedCount`); `withIdempotency` + `23505 -> 409`. | PostgreSQL uji (2 user) | Riwayat ledger tetap utuh (`HIGH-3`); transaksi kategori terhapus 100% bermigrasi ke *Lainnya*; akses lintas `userId` & CSRF ditolak (`404`/`403`). |
| **TS-006-03** | Proposed | `tests/integration/finance-transfers.test.ts` (Integration) | Must | Uji `/api/transactions/**` & `/api/transfers/**`: cek dompet aktif (`409 WALLET_ARCHIVED`, tapi edit deskripsi/lepas `noteId: null` pada tx historis dompet berarsip tetap aman), `category.type` (`422 CATEGORY_TYPE_MISMATCH`), transfer tolak `from === to` pada `POST` & `PATCH` (`422 SAME_WALLET_TRANSFER`), atomisitas rollback transfer, soft-delete transfer membalik kedua saldo tanpa cashflow, filter `unlinked=true`, `from`/`to` `tzOffset` (`from > to -> 422`), `walletId` (`from OR to`), keyset cursor (`400 INVALID_CURSOR`), & `FinanceWorkspace.tsx` (`noka:finance-updated`). | PostgreSQL uji | Saldo kedua dompet selalu sinkron; transfer nol dampak ke cashflow (`DATA-3`); query terpaginasi `<= 100` mematuhi anggaran latensi (`PERF-2`). |

---

## RFC-007: Finance Dashboard, Safe-to-Spend & Privacy Blur Mode

- **Fitur & Prioritas:** `F13`, `F16`, `F17` — **Must Have**
- **Prasyarat (*Depends on*):** `RFC-001`, `RFC-002`, `RFC-006`
- **Aturan Terkait:** `ARCH-1`, `ARCH-2`, `ARCH-4`, `ARCH-5`, `DATA-1`–`DATA-3`, `DATA-5`, `API-1`, `API-2`, `API-5`, `SEC-1`, `UI-3`–`UI-5`, `I18N-1`, `I18N-2`, `PERF-2`, `TEST-1`–`TEST-3`, `QUAL-2`, `QUAL-3`
- **File Suite (`Proposed`):** `tests/unit/safe-to-spend.test.ts`, `tests/unit/privacy-blur.test.tsx`, `tests/integration/finance-summary.test.ts`

| Test ID | Status | File & Lapisan | Prioritas | Skenario & Langkah | Prasyarat | Hasil yang Diharapkan & Kriteria Gagal |
|---|---|---|---|---|---|---|
| **TS-007-01** | Proposed | `tests/unit/safe-to-spend.test.ts` (Unit) | Must | Uji `resolveActiveCycleWindow` & `calculateSafeToSpend`: siklus `'1'`..`'28'`, `'end_of_month'`, clamping defensif `'29'`–`'31'` pada Februari kabisat/non-kabisat, akhir siklus `remainingDays === 1`, urutan guard `no_included_wallets` sebelum `non_positive_balance` (`Rp0` + non-negatif), pembulatan `Math.floor`, & `tzOffsetMinutes` (`+420` UTC+7). | Pure unit (`TEST-2`, `HIGH-2`) | Tidak pernah mengembalikan nilai negatif maupun `Infinity`/pembagi `0`; tanggal pendek selalu ter-clamp ke hari terakhir bulan. |
| **TS-007-02** | Proposed | `tests/unit/privacy-blur.test.tsx` (Unit) | Must | Render `PrivacyProvider` (cookie SSR `"1"`/`"0"`/`null` + `localStorage`), `<PrivacyBlurToggle>` (`aria-pressed`), `<PrivacyAmount>` (`signMode` `"auto"`/`"plain"`/`"signed"`, `0` tanpa `+`, negatif `-Rp •••••`), dan `SafeToSpendCard` status `ok`/`no_included_wallets`/`non_positive_balance`. | `jsdom` + `tests/setup.ts` | Tidak ada flash unblurred jika cookie SSR `"1"`; toggle memperbarui seluruh `<PrivacyAmount />`, cookie `noka_privacy_blur`, & `localStorage` tanpa reload. |
| **TS-007-03** | Proposed | `tests/integration/finance-summary.test.ts` (Integration) | Must | Uji `GET /api/finance/summary` (`summary-service.ts`): `401` unauth, `400 INVALID_CURSOR`, `from > to -> 422`, konsistensi `cashflow` & `categoryBreakdown` pada filter `type=income|expense|transfer` (**transfer menghasilkan `cashflow: 0` & `categoryBreakdown: []`**), `totalBalance` mengecualikan dompet berarsip sementara `includeArchived=true` menampilkannya di `wallets`, `type=transfer & categoryId -> ledger.items: []`, dan paginasi keyset ledger gabungan (`tx` + `transfer`). | PostgreSQL uji + data seed campuran | Transfer tidak pernah mencemari pemasukan/pengeluaran (`DATA-3`); `Safe-to-Spend` memakai `user.cycleStartDay`; latensi `< 300 ms`. |

---

## RFC-008: Noka Synergy — Smart Quick Capture & Linked Notes ↔ Transactions

- **Fitur & Prioritas:** `F14`, `F15` — **Must Have**
- **Prasyarat (*Depends on*):** `RFC-004`, `RFC-006`, `RFC-007`
- **Aturan Terkait:** `STACK-6`, `ARCH-1`–`ARCH-5`, `DATA-1`, `DATA-3`, `DATA-4`, `DATA-6`, `API-1`–`API-3`, `SEC-1`, `SEC-4`, `UI-3`–`UI-5`, `I18N-1`–`I18N-3`, `PERF-2`, `TEST-1`–`TEST-3`, `QUAL-2`, `QUAL-3`
- **File Suite (`Proposed`):** `tests/unit/quick-capture-parser.test.ts`, `tests/unit/quick-capture-bar.test.tsx`, `tests/integration/linked-notes-transactions.test.ts`

| Test ID | Status | File & Lapisan | Prioritas | Skenario & Langkah | Prasyarat | Hasil yang Diharapkan & Kriteria Gagal |
|---|---|---|---|---|---|---|
| **TS-008-01** | Proposed | `tests/unit/quick-capture-parser.test.ts` (Unit) | Must | Uji `parseQuickCapture` pada: `"kopi kenangan 24rb gopay"`, `"+gaji 5jt bca"`, `"kopi 1.50 rb"`, `"beli jam 25.000"`, `"beli jam 50 rb"`, `"terima kasih bayar parkir 5000"` (`expense`), `"bab 3 skripsi"` (`note`), `"meeting jam 10"` (`note`), `"2026-11-11 jadwal"` (`note`), angka `< 1000` tanpa unit (`note`), pencocokan 12 `systemKey` + dompet aktif -> `defaultWalletId` -> `null`, `description.slice(0, 300)`, serta **benchmark `<= 50 ms`** dengan 100 dompet/kategori. | Pure unit (`STACK-6`, `MED-1`) | Seluruh pola non-nominal menjadi **Note**; seluruh nominal transaksi valid akurat; durasi eksekusi rata-rata & p99 `< 50 ms` (`PERF-2`) tanpa panggilan jaringan. |
| **TS-008-02** | Proposed | `tests/unit/quick-capture-bar.test.tsx` (Unit) | Must | Render `WorkspaceChrome`/`QuickCaptureBar` dalam `PreferencesProvider` + `PrivacyProvider`: uji pintasan `Ctrl/Cmd+K` & `/` (diabaikan saat fokus di `<input>`/`<textarea>`), `Escape`, `Enter`/`Shift+Enter`, switch manual *Catatan ↔ Transaksi*, CTA `/app/finance` saat 0 dompet aktif, `<PrivacyAmount />`, event `noka:finance-updated` & `noka:workspace-updated`, serta ganti bahasa/tema tidak menghapus teks input (`I18N-2`). | `jsdom` + `tests/setup.ts` | Teks ketikan tetap utuh pasca toggle ID/EN & Light/Dark; saat 0 dompet aktif tombol simpan Transaksi nonaktif sementara Catatan tetap aktif. |
| **TS-008-03** | Proposed | `tests/integration/linked-notes-transactions.test.ts` (Integration) | Must | Uji `GET/POST /api/notes/[id]/transactions` & `DELETE /api/notes/[id]/transactions/[txId]`: cek note aktif di **kedua** cabang `POST` (`404 NOTE_NOT_FOUND`), `existingTransactionId` (tolak ID transfer / user lain `404`, LWW sebelum relink, idempoten `200` pada note sama, `409 TRANSACTION_ALREADY_LINKED` pada note lain), buat baru `201 { conflictResolved: "applied" }` (`409 WALLET_ARCHIVED`, `422 CATEGORY_TYPE_MISMATCH`), unlink `DELETE` (`note_id = NULL`, `404` bila note tidak cocok, LWW `server_newer`), serta `summary-service.ts` menyertakan `noteTitle` (`LEFT JOIN notes`) untuk `LedgerList`. | PostgreSQL uji + `NoteLinkedTransactionsPanel` | Rekap `Total Keluar`/`Total Masuk`/`Net` akurat; `GET /api/transactions?unlinked=true` mendukung cursor `nextCursor` (**Load More**); menghapus note tidak menghapus transaksi (`MED-2`, `DATA-4`). |

---

## RFC-009: PWA Installability, IndexedDB Local Mirror & iOS-Safe Offline Sync

- **Fitur & Prioritas:** `F18`, `F19` — **Must Have**
- **Prasyarat (*Depends on*):** `RFC-001`–`RFC-008`
- **Aturan Terkait:** `STACK-5`, `ARCH-1`, `DATA-1`–`DATA-6`, `API-1`–`API-3`, `SEC-1`, `OFFLINE-1`–`OFFLINE-5`, `UI-3`, `UI-5`, `UI-6`, `I18N-1`, `I18N-2`, `PERF-2`, `TEST-1`, `TEST-4`, `TEST-5`, `QUAL-2`, `QUAL-3`
- **File Suite (`Proposed`):** `tests/unit/offline-sync-engine.test.ts`, `tests/e2e/offline-sync-and-logout.spec.ts`

| Test ID | Status | File & Lapisan | Prioritas | Skenario & Langkah | Prasyarat | Hasil yang Diharapkan & Kriteria Gagal |
|---|---|---|---|---|---|---|
| **TS-009-01** | Proposed | `tests/unit/offline-sync-engine.test.ts` (Unit) | Must | Gunakan `fake-indexeddb@6.2.8` & mock `fetch`: uji skema IDB bebas indeks invalid `boolean`/`null` (`notes` disortir di memori), `client-api.ts` online-direct vs offline-outbox (`Notes`, `Folders`, `Transactions`, `Transfers`), `flushOutbox()` lock paralel (`0` duplikat, `Idempotency-Key`), urutan **FIFO ketat** (`nextRetryAt > now` menghentikan item dependen lebih baru), `429 Retry-After`/`5xx` melewatkan Step 3 snapshot (`"sync_error"`), terminal `4xx` menjadi `"failed"` + `discardFailedMutation`, reapply seluruh `"pending"` setelah snapshot baru, kalkulasi lokal `computeWalletBalances`/`calculateSafeToSpend`, `capabilities.ts` (blokir IDB/SW -> banner fallback), dan `wipeAllOfflineData()`. | `fake-indexeddb@6.2.8` (`TEST-4`, `HIGH-1`) | Tidak ada `DataError` kunci `boolean`/`null`; **0 duplikasi** mutasi paralel/retry; tidak ada panggilan ke `Background Sync API` (`SyncManager`); saldo lokal pasca-sync cocok dengan ledger. |
| **TS-009-02** | Proposed | `tests/e2e/offline-sync-and-logout.spec.ts` (E2E) | Must | Verifikasi `manifest.webmanifest`, registrasi `sw.js`, isolasi cache `noka-shell-v1` (0 HTML privat `/app/*`) vs `noka-private-v1` (`/app/*` `!res.redirected && res.ok` & `/api/attachments/*`), catat teks/checklist + Quick Capture + transfer via `context.setOffline(true)` -> verifikasi `pendingSync` & nonaktifnya upload/hapus gambar + `WalletManager`/`CategoryManager` (`OFFLINE-4`) + placeholder gambar tidak ter-cache -> aktifkan `setOffline(false)` + picu `online`/`visibilitychange`/klik **Sync Now** -> cek sync 0 duplikat -> klik **Logout** (dan uji skenario sesi dicabut `401 UNAUTHORIZED`) -> periksa DB IndexedDB & cache `noka-private-*` terhapus **100%**. | Playwright + server + PostgreSQL | Setelah logout atau `401`, `indexedDB.databases()` bebas `noka-offline-*` dan `caches.keys()` bebas `noka-private-*` (`OFFLINE-5`, `HIGH-4`), sementara `noka-shell-v1` tetap utuh. |

---

## RFC-010: Account Settings, Cycle Configuration & Self-Service Account Deletion

- **Fitur & Prioritas:** `F6` — **Should Have** *(dan E2E gerbang rilis penuh untuk seluruh fitur `Must Have` v1.0 + `OBS-1`)*
- **Prasyarat (*Depends on*):** `RFC-001`, `RFC-002`, `RFC-005`, `RFC-007`, `RFC-009`
- **Aturan Terkait:** `STACK-3`, `ARCH-1`, `ARCH-2`, `ARCH-4`, `DATA-5`, `API-1`, `API-2`, `SEC-1`–`SEC-4`, `SEC-6`, `OFFLINE-5`, `UI-3`, `UI-5`, `I18N-1`, `I18N-2`, `OBS-1`, `OBS-2`, `TEST-1`, `TEST-3`, `TEST-5`, `QUAL-2`, `QUAL-3`
- **File Suite (`Proposed`):** `tests/integration/account-settings-deletion.test.ts`, `tests/e2e/full-user-journey-and-a11y.spec.ts`

| Test ID | Status | File & Lapisan | Prioritas | Skenario & Langkah | Prasyarat | Hasil yang Diharapkan & Kriteria Gagal |
|---|---|---|---|---|---|---|
| **TS-010-01** | Proposed | `tests/integration/account-settings-deletion.test.ts` (Integration) | Should | Uji `PATCH /api/account/profile` (tolak `{}`, `cycleStartDay` `'1'`..`'28'`|`'end_of_month'` vs `422 INVALID_CYCLE_DAY`, CSRF `403`, update cookie `noka_locale`/`noka_theme`, `{ user }` tanpa `passwordHash`), `PATCH /api/account/password` (salah `currentPassword` -> `401 INVALID_CURRENT_PASSWORD`, berhasil mencabut sesi lain), serta `DELETE /api/account` (`401 INVALID_PASSWORD`, `FOR UPDATE` race konfirmasi concurrent deletion -> `401 UNAUTHORIZED`, urutan hapus `transfers -> transactions -> wallets -> categories -> users` mematahkan `RESTRICT` aman, hapus objek `LocalStorageAdapter` & uji mock gagal parsial `deleteUserAttachmentObjects` -> `logger.warn` `failedKeys` tanpa gagal `500`, hapus cookie `noka_session`). | PostgreSQL uji + storage uji (`HIGH-4`) | Akun & seluruh 13 tabel anak user terhapus 100% bersih tanpa melanggar `RESTRICT` atau gagal saat storage gagal parsial; salah password **tidak** memicu `UNAUTHORIZED` wipe. |
| **TS-010-02** | Proposed | `tests/e2e/full-user-journey-and-a11y.spec.ts` (E2E) | Should / v1.0 Gate | Alur lengkap rilis v1.0: register -> unggah & tampilkan lampiran gambar catatan -> Quick Capture & toggle `ID/EN` / `Light/Dark` di `PreferencesSyncBridge` (di dalam `<SyncProvider>`, cek nol loop PATCH & offline guard pada 3 form `/app/settings`) -> Linked Note + `LedgerList` backlink -> ubah `cycleStartDay` di `/app/settings` & cek pembaruan instan *Safe-to-Spend* (`updateUserMeta`) -> Privacy Blur -> cek `GET /api/health` (`200`) -> navigasi keyboard penuh & zero overflow (`360px`, `375×812`, `768px`, `1280×800`) -> hapus akun dengan konfirmasi ganda (`HAPUS`/`DELETE` + password) -> cek redirect `/`, login lama ditolak, dan DB + storage + IndexedDB + SW private cache bersih. | Playwright (`desktop` + `mobile`) + `npm run build` | Seluruh alur sukses tanpa console error; nol overflow horizontal; kontras/ARIA valid; sisa data akun **0** di server & browser. |

---

## 5. Celah Uji & Verifikasi Manual

Area berikut tidak dapat sepenuhnya dijamin hanya oleh environment otomatis lokal Windows/Linux headless dan **wajib diverifikasi secara manual sebelum rilis publik v1.0**:
1. **iOS Safari Standalone PWA & Mode Privat Ketat (`F18`, `F19`, `NFR-6`, `DEC-8`):** Menginstal Noka ke *Home Screen* iPhone/iPad Safari dan menguji *background/focus sync* serta blokir IndexedDB di *Private Browsing* (Playwright Windows hanya mengemulasi viewport/WebKit terbatas, bukan siklus hidup WebKit iOS asli).
2. **Matriks Browser Fisik (Safari macOS, Firefox, Microsoft Edge — 2 versi mayor terakhir, `NFR-6`):** Uji asap (*smoke test*) rendering CSS tokens Light/Dark, *Privacy Blur*, dan GFM checklist.
3. **Kredensial Produksi Resend & Cloudflare R2 / S3 (`STACK-3`, `STACK-4`, `NFR-11`):** Uji asap 1x pada environment staging terhadap pengiriman email reset password nyata via Resend (verifikasi DNS/SPF/DKIM) dan kebijakan CORS/presigned/private access bucket R2/S3 (karena suite otomatis memakai `DevOutboxMailer`, mock SDK, & `LocalStorageAdapter`).
4. **Provisioning PostgreSQL Produksi & Audit Lighthouse Produksi (`NFR-2`, `NFR-10`, `PERF-1`):** Menjalankan `npm run db:migrate`, `/api/health`, serta Chrome Lighthouse (`4G throttling`) langsung terhadap URL deploy final HTTPS.

---

## 6. Self-Check & Keterlacakan

- **Rekonfirmasi Jumlah Tabel:** Ringkasan pada Bagian 2 (`17` unit + `11` integration + `3` E2E = `31` file suite + `tests/setup.ts`) cocok 1:1 dengan seluruh sub-bagian `## RFC-001`–`## RFC-010` di Bagian 4 dan daftar berkas pada masing-masing berkas `RFCs/RFC-*.md`.
- **Audit Otoritas & Prioritas:** Tidak ada penetapan ulang prioritas MoSCoW (`F1`–`F5`, `F7`–`F19` = `Must`; `F6` = `Should`; `F20`–`F24` & `F25`–`F31` di luar kode v1.0).
- **Cakupan `PRD-REVIEW.md`:** `HIGH-1` (`TS-006-*`, `TS-009-*`), `HIGH-2` (`TS-007-*`, `TS-010-*`), `HIGH-3` (`TS-004-*`, `TS-006-*`, `TS-008-*`), `HIGH-4` (`TS-002-*`, `TS-009-*`, `TS-010-*`), `MED-1` (`TS-008-01`), `MED-2` (`TS-004-01`, `TS-008-03`), `MED-3` (Bagian 2 & 3).

