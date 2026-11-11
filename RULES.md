# Engineering Rules & Technical Standards: Noka

> **Tagline:** *"Seringan Notepad, Serapi Buku Kas."* *(EN: "Light as a Notepad, Tidy as a Ledger.")*  
> **Dokumen Sumber:** `PRD.md` (v2.0), `PRD-REVIEW.md`, `FEATURES.md` (`F1`–`F31`)  
> **Tanggal:** 11 November 2026  
> **Status:** Active — Baseline v1.0  

---

## Project Overview

**Noka** (*Note + Kas*) adalah aplikasi web (*Responsive Web App / PWA*) pencatatan pribadi multi-pengguna yang menggabungkan editor catatan harian berbasis Markdown + GFM checklist dengan pelacakan keuangan multi-dompet dalam Rupiah (**IDR**). Navigasi inti memisahkan ruang kerja **Catatan** dan **Keuangan** (`DEC-2`), sambil menyatukan keduanya lewat empat pembeda utama: **Smart Quick Capture** lokal (`FR-11`, `DEC-4`), **Linked Notes ↔ Transaksi** (`FR-12`, `DEC-14`), **Safe-to-Spend harian** deterministik (`FR-13`, `DEC-12`), dan **Privacy Blur Mode** sekali klik (`FR-14`).

Target rilis **v1.0** adalah **7 hari** untuk kebutuhan portofolio siap publik dengan tampilan minimalis modern (`Light/Dark Mode`, bilingual `ID/EN`, ramah SEO di halaman publik, dan *offline-first* aman untuk iOS Safari).

### Existing Codebase Grounding

Pada saat `RULES.md` disusun, repositori `d:\Projects\noka-app` masih bersifat *greenfield* (hanya berisi `PRD.md`, `PRD-REVIEW.md`, `FEATURES.md`, `.agents/`, dan `.git/` tanpa berkas kode sumber). Seluruh konvensi struktur folder, penamaan, dan pola arsitektur di bawah menjadi standar awal proyek sejak **RFC-001**.

---

## Product Type

Mengacu pada bagian `## Product Type` di `PRD.md`:

- **Klasifikasi:** **Web App** (Multi-user Responsive Web Application + PWA + Public SEO Pages).
- **Platform Target:** Browser desktop, tablet, dan mobile modern (2 versi mayor terbaru Chrome, Safari iOS/macOS, Firefox, Microsoft Edge; `NFR-6`).

### Applied & Skipped Checks

| Kategori Check | Status | Cakupan / Alasan |
|---|---|---|
| Auth & Sessions | **Diterapkan** | Registrasi langsung masuk (`FR-2`), login, cookie sesi `HttpOnly`/`Secure`/`SameSite`, CSRF, rate limit, Lupa Password bertoken hash 30 menit (`FR-3`), dan wipe cache saat logout (`NFR-1`, `DEC-16`). |
| Authorization per Resource | **Diterapkan** | Isolasi ketat per `userId` pada semua endpoint API, query database, dan akses signed URL object storage (`NFR-1`, `NFR-9`, `DEC-7`). |
| Data Model & Migrations | **Diterapkan** | Skema PostgreSQL relasional via Drizzle ORM + migrasi SQL terversi, nominal IDR integer presisi aman, saldo terturunkan dari ledger (`NFR-7`, `DEC-11`). |
| Accessibility (a11y) | **Diterapkan** | Kontras WCAG 2.1 AA pada Light & Dark Mode, navigasi keyboard, *focus ring*, atribut ARIA, dan `prefers-reduced-motion` (`NFR-4`, `NFR-5`). |
| Responsive Layout | **Diterapkan** | Dukungan penuh Mobile (`≥ 360px`), Tablet (`768px–1024px`), dan Desktop (`≥ 1280px`) tanpa *horizontal overflow* (`NFR-3`). |
| Browser Support | **Diterapkan** | Chrome, Safari (iOS/macOS), Firefox, Edge dengan fallback mode online saat IndexedDB/Service Worker dibatasi mode privat (`NFR-6`). |
| Page-Load Budget | **Diterapkan** | Landing page LCP `≤ 2,5s` (4G), App Shell TTI `≤ 2,5s`, parser Quick Capture `≤ 50 ms`, dan CRUD API p95 `≤ 300 ms` (`NFR-2`). |
| SEO for Public Pages | **Diterapkan** | Landing page publik SSR/SSG dengan heading semantik, metadata dinamis ID/EN, Open Graph, `robots.txt`, dan `sitemap.xml` (`FR-1`, `NFR-10`). |
| Offline Sync *(Pengecualian eksplisit)* | **Diterapkan** | Diwajibkan PRD (`FR-16`, `NFR-8`, `DEC-8`) memakai IndexedDB mirror + outbox idempoten berbasis event (`online`/fokus/manual), bukan `Background Sync API`. |
| Binary Size | **Dilewati** | Distribusi berbasis browser Web App/PWA (`DEC-3`, `F31`), bukan biner native App Store/Play Store; ukuran dikendalikan lewat *web bundle budget*. |
| Public Third-Party API SLA & Versioning | **Dilewati** | API backend bersifat *first-party internal* khusus aplikasi web Noka, bukan API publik untuk pengembang pihak ketiga. |

---

## Rule Summary

> **Aturan ID Permanen:** Semua ID aturan (`STACK-*`, `ARCH-*`, `DATA-*`, `API-*`, `SEC-*`, `OFFLINE-*`, `UI-*`, `I18N-*`, `PERF-*`, `OBS-*`, `TEST-*`, `QUAL-*`) bersifat permanen dan *append-only*. RFC, ulasan kode, dan *change request* wajib merujuk ID ini.

| Kategori | Prefix | Jumlah | Rentang ID | Fokus Utama |
|---|---|---:|---|---|
| Technology Stack | `STACK` | 6 | `STACK-1`–`STACK-6` | Versi paket terverifikasi registry & layanan eksternal |
| Architecture & Structure | `ARCH` | 6 | `ARCH-1`–`ARCH-6` | Struktur Next.js App Router, batas modul, & konvensi penamaan |
| Data Model & Financial Integrity | `DATA` | 6 | `DATA-1`–`DATA-6` | Skema Drizzle PostgreSQL, ledger IDR, transfer atomik, & integritas referensial |
| API Contracts & Validation | `API` | 5 | `API-1`–`API-5` | Kontrak REST JSON, validasi Zod, idempotensi, & kode status HTTP |
| Security & Privacy | `SEC` | 7 | `SEC-1`–`SEC-7` | Auth, `bcryptjs`, sesi cookie, rate limit, upload magic-bytes, & isolasi `userId` |
| PWA & Offline-First Sync | `OFFLINE` | 5 | `OFFLINE-1`–`OFFLINE-5` | Service Worker, IndexedDB mirror/outbox, iOS Safari sync, & logout wipe |
| UI, Theme & Accessibility | `UI` | 6 | `UI-1`–`UI-6` | Desain token `Light/Dark`, responsif, Privacy Blur, & WCAG 2.1 AA |
| Bilingual Localization | `I18N` | 3 | `I18N-1`–`I18N-3` | Kamus `ID/EN` tersinkron tanpa kehilangan input aktif |
| Performance & Budgets | `PERF` | 4 | `PERF-1`–`PERF-4` | LCP `≤ 2,5s`, parser `≤ 50 ms`, p95 API `≤ 300 ms`, & SEO |
| Observability & Ops | `OBS` | 3 | `OBS-1`–`OBS-3` | `/api/health`, structured logging bebas data sensitif, & graceful fallback |
| Testing & Verification | `TEST` | 5 | `TEST-1`–`TEST-5` | Vitest, `fake-indexeddb`, Playwright E2E, & cakupan temuan review |
| General & AI Agent Workflow | `QUAL` | 5 | `QUAL-1`–`QUAL-5` | Otoritas dokumen, standar kode, tanpa placeholder, & konfigurasi agent |
| **Total** | — | **61** | — | — |

---

## 1. Technology Stack Definition

Seluruh versi paket Node/npm di bawah telah **diverifikasi langsung terhadap registry `npm`** pada `11 November 2026` menggunakan `npm view <pkg> version` dan `npm view <pkg> peerDependencies`. Runtime lokal terverifikasi: **Node.js `v24.20.0`** dan **npm `11.19.0`**.

### Verified Dependency Matrix

| Layer | Paket / Teknologi | Versi Terverifikasi | Peran |
|---|---|---|---|
| **Framework & Runtime** | `next` | `16.4.6` | Full-stack App Router, SSR/SSG Landing Page, Route Handlers |
| | `react` | `19.3.1` | UI rendering library |
| | `react-dom` | `19.3.1` | React DOM renderer |
| | `typescript` | `7.0.2` | Strict static typing |
| | `@types/node` | `26.6.6` | Node.js type definitions |
| | `@types/react` | `19.3.0` | React type definitions |
| | `@types/react-dom` | `19.3.0` | React DOM type definitions |
| **Styling & UI Icons** | `tailwindcss` | `4.3.5` | Utility-first styling & CSS design tokens (`Light/Dark`) |
| | `@tailwindcss/postcss` | `4.3.5` | PostCSS integration untuk Tailwind CSS v4 |
| | `lucide-react` | `1.72.0` | Ikon UI konsisten dan ringan |
| | `clsx` | `2.1.1` | Conditional class builder |
| | `tailwind-merge` | `3.7.0` | Safe Tailwind class merging |
| **Validation & Markdown** | `zod` | `4.6.7` | Validasi input API, parser env, & kontrak skema |
| | `react-markdown` | `10.1.0` | Render Markdown aman pada catatan (`FR-4`) |
| | `remark-gfm` | `4.0.1` | Dukungan GFM task-list (`- [ ]` / `- [x]`) (`DEC-14`) |
| **Database & Migrations** | `PostgreSQL` | `16+` *(server runtime unverified — dikelola oleh Neon/Supabase/Docker)* | Primary relational ledger & document store (`NFR-7`) |
| | `drizzle-orm` | `0.45.4` | Type-safe SQL query builder & transaction runner |
| | `drizzle-kit` | `0.31.11` | Skema diff & migrasi SQL terversi |
| | `pg` | `8.23.1` | PostgreSQL driver (`node-postgres`) |
| | `@types/pg` | `8.23.1` | Type definitions untuk `pg` |
| **Auth, Storage & Email** | `bcryptjs` | `3.0.3` | Hashing password pure-JS portabel (`NFR-1`) |
| | `@types/bcryptjs` | `3.0.0` | Type definitions untuk `bcryptjs` |
| | `@aws-sdk/client-s3` | `3.1166.0` | Klien object storage S3/Cloudflare R2 (`FR-6`, `NFR-9`) |
| | `@aws-sdk/s3-request-presigner` | `3.1166.0` | Signed URL terautentikasi untuk lampiran gambar |
| | `file-type` | `22.3.0` | Deteksi *magic bytes* berkas gambar unggahan (`NFR-9`) |
| | `resend` | `6.38.0` | Pengiriman email tautan Lupa Password (`FR-3`) |
| **Offline & PWA** | `idb` | `8.0.4` | Wrapper IndexedDB bertipe untuk mirror & outbox (`FR-16`) |
| **Testing & Linting** | `vitest` | `5.1.0` | Unit & integration test runner |
| | `@vitejs/plugin-react` | `6.3.0` | React JSX transform untuk Vitest |
| | `@testing-library/react` | `16.3.3` | Pengujian komponen UI |
| | `@testing-library/dom` | `10.4.2` | Peer dependency DOM testing utilities |
| | `@testing-library/jest-dom` | `7.0.1` | Matcher DOM semantik & a11y |
| | `jsdom` | `31.0.0` | Browser DOM environment di Vitest |
| | `fake-indexeddb` | `6.2.8` | Simulasi IndexedDB untuk uji sinkronisasi offline |
| | `@playwright/test` | `1.65.0` | E2E browser testing (Desktop/Mobile, Offline, a11y) |
| | `eslint` | `10.14.0` | Static linting |
| | `eslint-config-next` | `16.4.6` | Aturan Next.js & Core Web Vitals |

### Stack Rules

- **STACK-1**: Proyek wajib menggunakan **Next.js `16.4.6`** (App Router, TypeScript strict mode) dengan **React `19.3.1`**, **Tailwind CSS `4.3.5`**, dan package manager **`npm`** (`package-lock.json` wajib di-commit ke Git).
- **STACK-2**: Penyimpanan data utama wajib menggunakan **PostgreSQL** (`pg@8.23.1`) melalui **Drizzle ORM `0.45.4`** dan **Drizzle Kit `0.31.11`** untuk migrasi SQL terversi (`NFR-7`). Perubahan skema hanya boleh dilakukan lewat file migrasi Drizzle, tidak melalui modifikasi tabel manual di database produksi.
- **STACK-3**: Penyimpanan berkas lampiran gambar wajib memakai antarmuka abstraksi storage (`StorageAdapter`) dengan implementasi produksi **Cloudflare R2 / S3-compatible** (`@aws-sdk/client-s3@3.1166.0`) dan implementasi fallback lokal terisolasi (`.data/uploads/` di luar `public/` dan masuk `.gitignore`) saat env `S3_*` tidak disetel pada mode pengembangan atau pengujian lokal (`FR-6`, `NFR-9`). Pada `src/lib/env.ts`, grup variabel `S3_*` bersifat opsional bersama-sama (jika sebagian diisi tanpa lengkap, startup gagal validasi; jika kosong di produksi, operasi storage mengembalikan `503`).
- **STACK-4**: Pengiriman email reset password wajib memakai antarmuka abstraksi mailer (`MailerAdapter`) dengan implementasi produksi **Resend `6.38.0`** dan fallback adapter log/outbox lokal terproteksi (hanya mencetak tautan reset di lingkungan non-produksi atau test) agar pengembangan lokal dan E2E berjalan tanpa ketergantungan SMTP eksternal (`FR-3`). Pada `src/lib/env.ts`, `RESEND_API_KEY` dan `EMAIL_FROM` bersifat opsional bersama-sama (jika kosong di produksi, kirim reset mengembalikan `503`).
- **STACK-5**: Fungsionalitas PWA (`FR-16`) wajib menggunakan dukungan bawaan Next.js (`src/app/manifest.ts`) dan Service Worker custom berversi (`public/sw.js`) bersama **`idb@8.0.4`**; dilarang menambah pustaka PWA berbasis Webpack-only yang bertentangan dengan build default Next.js 16 atau mengandalkan `Background Sync API` (`DEC-8`).
- **STACK-6**: Dilarang memanggil API AI/LLM eksternal untuk fitur *Smart Quick Capture* maupun fitur v1.0 lainnya; parser wajib berjalan deterministik 100% lokal di TypeScript (`DEC-4`, `F27`).

---

## 2. Architecture, Naming & Folder Structure

### Canonical Directory Layout

```text
src/
├── app/                      # Next.js App Router pages, layouts, manifest.ts, robots.ts, sitemap.ts
│   ├── (public)/             # Landing page SEO, login, register, forgot-password, reset-password
│   ├── (app)/                # Workspace terproteksi (notes, finance, settings)
│   └── api/                  # Thin Route Handlers (validasi Zod -> panggil domain service)
├── components/
│   ├── ui/                   # Primitif desain ulang-pakai (Button, Input, Modal, PrivacyAmount)
│   └── layout/               # AppShell, WorkspaceNav, QuickCaptureBar, SyncStatusBadge
├── features/
│   ├── auth/                 # Auth, session, reset token, account deletion
│   ├── notes/                # Notes CRUD, GFM checklist toggle, folders, tags, attachments
│   ├── finance/              # Wallets, transactions, transfers, categories, Safe-to-Spend
│   ├── quick-capture/        # Pure rule-based offline parser (tanpa dependency DOM/Node)
│   └── sync/                 # IndexedDB mirror, outbox queue, idempotent sync engine
├── db/
│   ├── schema/               # Drizzle table definitions (satu file per domain)
│   ├── migrations/           # File migrasi SQL Drizzle Kit
│   └── index.ts              # Pool PostgreSQL & Drizzle instance singleton
└── lib/
    ├── env.ts                # Validasi Zod untuk seluruh environment variables
    ├── i18n/                 # Kamus terjemahan ID/EN & locale helper
    ├── storage/              # StorageAdapter (R2/S3 & local dev fallback)
    ├── mailer/               # MailerAdapter (Resend & dev fallback)
    └── logger.ts             # Structured JSON logger dengan redaksi field sensitif

tests/
├── unit/                     # Vitest unit tests (parser, Safe-to-Spend, ledger calc)
├── integration/              # API & DB integration tests (isolasi userId, transfer atomik)
└── e2e/                      # Playwright specs (desktop/mobile, offline sync, a11y)
```

### Architecture Rules

- **ARCH-1**: Gunakan **React Server Components (RSC)** secara default untuk *initial data fetch* dan halaman publik SEO (`FR-1`, `NFR-10`), dan tandai `"use client"` hanya pada batas komponen daun (*leaf*) interaktif (editor catatan, *Quick Capture*, tombol *Privacy Blur*, dan lapisan sinkronisasi IndexedDB).
- **ARCH-2**: Route handler di `src/app/api/**` harus tipis: hanya melakukan autentikasi sesi, parsing & validasi input dengan `zod`, memanggil *domain service* di `src/features/<domain>/`, lalu memetakan hasilnya ke respons HTTP. Logika bisnis dan query Drizzle tidak boleh ditulis langsung di komponen UI maupun tersebar di route handler.
- **ARCH-3**: Modul *Smart Quick Capture* parser (`src/features/quick-capture/parser.ts`) wajib berupa fungsi murni (*pure TypeScript*) tanpa ketergantungan DOM, browser API, maupun database agar dapat dijalankan identik di klien offline, server fallback, dan Vitest (`FR-11`, `DEC-4`).
- **ARCH-4**: Konvensi penamaan wajib konsisten: `kebab-case` untuk folder/file non-komponen dan route URL (`quick-capture/`, `forgot-password/`), `PascalCase` untuk komponen React (`PrivacyAmount.tsx`), `camelCase` untuk fungsi/variabel TypeScript, `SCREAMING_SNAKE_CASE` untuk konstanta global, dan `snake_case` jamak untuk nama tabel PostgreSQL serta kolom SQL (dipetakan ke property `camelCase` di Drizzle).
- **ARCH-5**: Navigasi utama workspace terproteksi wajib memisahkan ruang kerja **Catatan** (`/app/notes`) dan **Keuangan** (`/app/finance`) secara jelas (`FR-10`, `DEC-2`), dengan *Quick Capture Bar* (`FR-11`) dan tombol *Privacy Blur* (`FR-14`) mudah diakses dari shell global.
- **ARCH-6**: Konfigurasi environment wajib divalidasi di `src/lib/env.ts` memakai `zod` saat startup/build server; akses langsung ke `process.env.*` di luar `src/lib/env.ts` (kecuali `NODE_ENV` atau variabel `NEXT_PUBLIC_*` standar) dilarang.

---

## 3. Data Model & Financial Integrity

- **DATA-1**: Seluruh nominal uang Rupiah (**IDR**) wajib disimpan sebagai bilangan bulat presisi penuh di PostgreSQL menggunakan `bigint` (`bigint("amount", { mode: "number" })` di Drizzle) dengan validasi ketat bilangan bulat positif (`> 0` dan `<= Number.MAX_SAFE_INTEGER`) untuk transaksi dan transfer (`FR-8`, `FR-9`, `NFR-7`, `DEC-6`). Untuk `initial_balance` dompet diizinkan `>= 0` (bilangan bulat). Dilarang keras memakai `float`, `real`, `double precision`, atau aritmetika desimal.
- **DATA-2**: Saldo aktual setiap dompet wajib diturunkan secara deterministik dari `initialBalance + sum(income) - sum(expense) + sum(transferIn) - sum(transferOut)` (`FR-7`, `DEC-11`). Dilarang menyimpan kolom saldo akhir bebas yang dapat ditimpa langsung oleh klien atau resolusi konflik *Last-Write-Wins* (`HIGH-1`).
- **DATA-3**: Operasi **Transfer antar-dompet** (`FR-9`) wajib berjalan di dalam satu transaksi database atomik (`db.transaction(...)`), menolak `fromWalletId === toWalletId`, memverifikasi bahwa kedua dompet dimiliki oleh `userId` yang sama dan berstatus aktif (`archivedAt IS NULL`), serta menautkan kedua sisi melalui entitas/grup transfer tunggal sehingga edit/hapus transfer memperbarui/membalik kedua sisi bersamaan (`HIGH-3`). Transfer tidak boleh ikut dihitung dalam total Pemasukan/Pengeluaran arus kas bulanan maupun ditautkan ke Catatan (`DEC-14`).
- **DATA-4**: Aturan **Integritas Referensial & Penghapusan** wajib ditegakkan di lapisan database dan service (`DEC-13`, `HIGH-3`):
  1. **Dompet:** Dompet dengan `>= 1` riwayat transaksi atau transfer hanya boleh diarsipkan (`archivedAt` diisi), tidak boleh dihapus permanen (`DELETE` mengembalikan `409 Conflict`). Penghapusan permanen hanya diizinkan bila riwayat berjumlah `0`.
  2. **Kategori:** Kategori bawaan sistem (termasuk `"Lainnya / Other"`) tidak dapat dihapus. Jika kategori custom dihapus, seluruh transaksi terkait wajib dipindahkan secara atomik ke kategori `"Lainnya / Other"` milik user/sistem sebelum baris kategori dihapus (`FR-8`).
  3. **Folder Catatan:** Jika folder dihapus, seluruh catatan di dalamnya dipindahkan secara atomik ke `folderId = NULL` (*Tanpa Folder*), bukan dihapus (`FR-5`).
  4. **Linked Notes ↔ Transaksi:** Relasi memakai `transactions.noteId` (`ON DELETE SET NULL`, hanya untuk `income`/`expense`, bukan `transfer`). Menghapus catatan otomatis melepas tautan (`noteId = NULL`) tanpa menghapus transaksi keuangan (`FR-12`, `DEC-14`).
- **DATA-5**: Perhitungan **Safe-to-Spend** (`FR-13`, `DEC-12`, `HIGH-2`) wajib menggunakan rumus tunggal di shared helper murni:
  - `safeToSpend = Math.max(0, Math.floor(totalIncludedWalletBalance / remainingDaysInCycleInclusive))`
  - Default `includeInSafeToSpend`: `true` untuk tipe `cash` (Tunai) dan `ewallet` (E-Wallet), `false` untuk `bank` (Bank).
  - Tanggal mulai siklus (`cycleStartDay`: `'1'`–`'28'` atau `'end_of_month'` di input API/UI) pada bulan yang lebih pendek otomatis dipetakan ke hari terakhir bulan tersebut (`FR-2`), helper perhitungan juga memetakan defensif `'29'`–`'31'` ke hari terakhir bulan bila diuji langsung (`TEST-2`), dan `remainingDaysInCycleInclusive` bernilai minimal `1`.
- **DATA-6**: Setiap entitas yang mendukung sinkronisasi/mirror offline (`notes`, `folders`, `tags`, `wallets`, `categories`, `transactions`, `transfers`) wajib menggunakan **UUID v4** (`id`), kolom `updatedAt` UTC berpresisi milidetik, serta `deletedAt` nullable untuk soft-tombstone; mutasi idempoten menggunakan tabel `idempotency_keys` ber-index unik `(userId, idempotencyKey)` disertai `method`, `path`, dan `requestHash` (`NFR-8`).

---

## 4. API Contracts & Validation

- **API-1**: Seluruh endpoint di `src/app/api/**` wajib memakai format respons JSON yang seragam: `{ ok: true, data: ... }` untuk sukses dan `{ ok: false, error: { code: string, message: string, details?: unknown } }` untuk gagal, menggunakan status HTTP semantik (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `413`, `422`, `429`, `500`, `503`).
- **API-2**: Setiap request body, query string, dan route param wajib divalidasi dengan `zod` sebelum menyentuh database; kegagalan validasi wajib mengembalikan `400`/`422` beserta daftar field yang bermasalah tanpa mengekspos *stack trace* atau skema internal DB.
- **API-3**: Setiap endpoint mutasi yang dipakai antrean offline (`POST`, `PUT`, `PATCH`, `DELETE` pada catatan, folder, transaksi, transfer, dompet, kategori) wajib menerima `Idempotency-Key` (header atau payload) serta timestamp `updatedAt` untuk resolusi konflik *Last-Write-Wins* deterministik pada teks/metadata (`NFR-8`). Permintaan ulang dengan `idempotencyKey` yang sama milik `userId` yang sama wajib mengembalikan hasil asli tanpa membuat baris duplikat (`0 duplikat`).
- **API-4**: Endpoint `POST /api/auth/forgot-password` wajib selalu mengembalikan HTTP `200` dengan pesan sukses generik terlepas dari apakah email terdaftar di database, untuk mencegah enumerasi akun (`FR-3`).
- **API-5**: Endpoint pencarian dan daftar transaksi (`FR-10`, `FR-11`) wajib mendukung filter `from`, `to`, `walletId`, `type`, `categoryId`, dan paginasi berbasis cursor/limit (maks. `100` item per halaman) agar latensi CRUD tetap berada di bawah anggaran `p95 ≤ 300 ms` (`NFR-2`).

---

## 5. Security, Authentication & Privacy

- **SEC-1**: Setiap API route terproteksi dan endpoint/signed-URL lampiran gambar wajib memverifikasi sesi aktif di server dan membatasi seluruh query/mutasi dengan `WHERE user_id = session.userId` (`NFR-1`, `DEC-7`). Akses ke resource milik user lain wajib mengembalikan `403` atau `404` tanpa membocorkan keberadaan ID tersebut.
- **SEC-2**: Password minimal **8 karakter** (`FR-2`), wajib di-hash dengan **`bcryptjs` (`3.0.3`)** memakai cost factor minimal `12`. Token reset password (`FR-3`) harus dibuat menggunakan CSPRNG (`crypto.randomBytes(32)`), disimpan di database **hanya dalam bentuk hash SHA-256**, bertipe sekali pakai, memiliki TTL **30 menit**, dan saat berhasil dipakai wajib menghanguskan token serta mencabut seluruh sesi aktif pengguna tersebut (`HIGH-4`).
- **SEC-3**: Sesi autentikasi wajib memakai token acak tersimpan di tabel `sessions` (atau token tervalidasi sisi server agar pencabutan sesi pada `FR-3` & `FR-22` bekerja seketika) yang dikirim dalam cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, dan `Secure` di lingkungan HTTPS/produksi (`NFR-1`).
- **SEC-4**: Seluruh endpoint mutasi (`POST`, `PUT`, `PATCH`, `DELETE`) wajib memverifikasi header `Origin` / `Host` (atau CSRF token) agar terlindung dari serangan CSRF (`NFR-1`).
- **SEC-5**: Endpoint sensitif publik (`/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/reset-password`) wajib dilindungi *rate limiting* berbasis kombinasi `IP + normalizedEmail` (atau `IP` saja pada endpoint tanpa email seperti `/reset-password`) yang teruji dan mengembalikan `429 Too Many Requests` beserta header `Retry-After` (`NFR-1`).
- **SEC-6**: Unggahan lampiran gambar catatan (`FR-6`, `NFR-9`, `DEC-9`) wajib:
  1. Dibatasi maks. **5 MB per berkas** (`5 * 1024 * 1024` bytes) dan maks. **5 gambar per catatan**.
  2. Memeriksa header **magic bytes** menggunakan `file-type@22.3.0` (hanya mengizinkan `image/jpeg`, `image/png`, `image/webp`; menolak ekstensi/MIME palsu).
  3. Menormalisasi nama berkas ke UUID key internal (`users/<userId>/notes/<noteId>/<uuid>.<ext>`) tanpa menggunakan nama asli pengguna di path storage.
  4. Menyajikan gambar hanya lewat endpoint/signed URL yang terverifikasi `userId`, bukan bucket publik terbuka.
  5. Menghapus berkas di object storage saat gambar dihapus, catatan dihapus, atau akun dihapus (`FR-22`).
- **SEC-7**: Konten Markdown catatan yang dirender via `react-markdown@10.1.0` dilarang mengaktifkan HTML mentah (`rehype-raw` tidak boleh dipasang), dan seluruh URL tautan wajib memblokir skema berbahaya (`javascript:`, `data:` pada link) agar bebas dari XSS.

---

## 6. PWA & Offline-First Synchronization

- **OFFLINE-1**: Aplikasi wajib menyediakan `manifest.webmanifest` (via `src/app/manifest.ts`) dan Service Worker (`public/sw.js`) yang meng-cache aset App Shell dan rute baca inti, serta menangani browser dalam mode privat yang membatasi IndexedDB atau Service Worker dengan fallback graceful ke mode online + banner informasi non-mengganggu (`FR-16`, `NFR-6`, `F18`).
- **OFFLINE-2**: Penyimpanan lokal klien wajib memakai **IndexedDB** (`idb@8.0.4`) yang hanya diaktifkan untuk user terautentikasi (dipisahkan/diberi kunci `userId`), menyimpan mirror data teks (`notes`, `folders`, `tags`, `wallets`, `categories`, `transactions`, `transfers`) dan antrean mutasi lokal (`outbox`), dengan indikator status sinkronisasi persisten (`Online/Synced`, `Offline`, `Syncing`, `Sync Error`) (`FR-16`, `F19`).
- **OFFLINE-3**: Sinkronisasi antrean outbox ke server wajib dipicu oleh: (1) aplikasi dibuka dalam keadaan online, (2) event `window` `online`, (3) `visibilitychange` / fokus jendela saat koneksi aktif, dan (4) tombol manual **Sync Now** (`FR-16`, `DEC-8`). Dilarang bergantung pada `Background Sync API` (`SyncManager`) karena tidak didukung iOS Safari (`HIGH-1`).
- **OFFLINE-4**: Saat offline, pengguna tetap dapat membuat/mengedit catatan teks/checklist GFM dan mencatat transaksi/transfer baru ke outbox; namun tombol unggah gambar (`FR-6`) wajib dinonaktifkan dengan pesan yang jelas (`DEC-9`), dan gambar yang belum ter-cache menampilkan placeholder offline yang rapi.
- **OFFLINE-5**: Saat pengguna menekan **Logout** (`FR-2`) atau **Hapus Akun** (`FR-22`), atau saat sesi terdeteksi `401 Unauthorized` karena sesi dicabut, klien wajib **menghapus seluruh data privat di IndexedDB dan membersihkan cache data privat pada Service Worker** sebelum mengarahkan ke halaman login (`NFR-1`, `DEC-16`, `HIGH-4`).

---

## 7. UI, Visual Design System & Accessibility

- **UI-1**: Sistem desain wajib mendukung **Light Mode** dan **Dark Mode** berbasis CSS custom properties (`tokens.css`) dengan estetika minimalis modern berkonsep kontras tinggi terinspirasi arah visual `nomu.store`: tipografi sans-serif tegas, hierarki ukuran jelas, *whitespace* lega, kartu interaktif dengan batas halus, dan tanpa dekorasi berlebihan (`FR-1`, `NFR-4`).
- **UI-2**: Seluruh kombinasi warna teks, ikon fungsional, batas input, dan badge status pada **Light Mode** maupun **Dark Mode** wajib memenuhi standar minimum rasio kontras **WCAG 2.1 Level AA** (`≥ 4.5:1` teks normal, `≥ 3:1` teks besar dan komponen UI) (`NFR-5`).
- **UI-3**: Seluruh elemen antarmuka wajib responsif pada Mobile (`≥ 360px`), Tablet (`768px–1024px`), dan Desktop (`≥ 1280px`) tanpa *horizontal overflow*, dengan navigasi utama dan tombol *Quick Capture* ditempatkan pada jangkauan satu tangan di layar ponsel (`NFR-3`).
- **UI-4**: Seluruh angka nominal keuangan di UI (total saldo, saldo dompet, daftar transaksi, *Safe-to-Spend*, dan ringkasan *Linked Notes*) wajib dirender melalui komponen tunggal `<PrivacyAmount />` agar saat **Privacy Blur Mode** aktif (`FR-14`), seluruh angka langsung tersamarkan menjadi `Rp •••••` dengan status tersimpan di `localStorage` perangkat (`F17`).
- **UI-5**: Seluruh alur inti—termasuk pintasan keyboard *Smart Quick Capture* (mis. `Ctrl/Cmd + K` atau `/` di luar field input), toggle checklist GFM (`FR-4`), tombol *Privacy Blur*, *Pin*, serta pengalih tema dan bahasa—wajib dapat dioperasikan penuh via keyboard dengan *focus ring* jelas, atribut `aria-label`/`aria-pressed` akurat, dan menghormati media query `prefers-reduced-motion: reduce` (`NFR-4`, `NFR-5`).
- **UI-6**: Editor catatan wajib menyediakan *debounced auto-save* (mis. `500–800 ms`) dengan indikator status real-time (`Tersimpan`, `Menyimpan...`, `Menunggu sinkronisasi`) serta membolehkan klik langsung pada kotak centang checklist GFM (`- [ ]` ↔ `- [x]`) yang memperbarui teks Markdown sumber secara deterministik (`FR-4`, `DEC-14`).

---

## 8. Bilingual Localization (ID/EN)

- **I18N-1**: Aplikasi dan landing page publik wajib mendukung **Bahasa Indonesia (`id`)** dan **Bahasa Inggris (`en`)** melalui kamus terstruktur bertipe kuat (`src/lib/i18n/dictionaries/id.ts` dan `en.ts`) tanpa teks UI yang di-*hardcode* langsung di komponen (`FR-15`).
- **I18N-2**: Pengalih bahasa (`ID / EN`) dan pengalih tema (`Light / Dark`) wajib bekerja secara instan di sisi klien tanpa *full page reload* dan **tidak boleh menghapus atau me-reset input yang sedang diketik** di editor catatan maupun *Quick Capture* (`FR-15`, `F2`), sembari menyimpan preferensi ke cookie/localStorage dan menyinkronkannya ke profil akun saat login.
- **I18N-3**: Parser lokal *Smart Quick Capture* (`FR-11`) wajib mengenali sinonim kata kunci dan satuan nominal dalam Bahasa Indonesia maupun Inggris (mis. `rb`, `ribu`, `k`, `jt`, `juta`, `rp`, `idr`, `gaji`, `salary`, `bonus`, `refund`, `income`, `masuk`, `terima`) dan menerapkan aturan konservatif agar frasa mengandung angka non-nominal seperti `"bab 3 skripsi"` atau `"meeting jam 10"` tetap terdeteksi sebagai Catatan (`DEC-15`, `MED-1`).

---

## 9. Performance Budgets & SEO

- **PERF-1**: Landing page publik (`/`) wajib mencapai **Lighthouse Performance ≥ 90**, **Accessibility ≥ 95**, **Best Practices ≥ 95**, **SEO ≥ 90**, serta **LCP ≤ 2,5 detik** pada simulasi koneksi 4G (`NFR-2`, `Success Metrics`). App Shell workspace wajib siap berinteraksi (**TTI ≤ 2,5 detik**).
- **PERF-2**: Eksekusi parser lokal *Smart Quick Capture* wajib selesai dalam **≤ 50 ms** di sisi klien (`NFR-2`) dan latensi endpoint API CRUD pada beban normal terjaga pada **p95 ≤ 300 ms** (`NFR-2`, `F13`).
- **PERF-3**: Landing page publik (`FR-1`, `NFR-10`) wajib dirender di server (SSR/SSG) dengan struktur heading semantik (`h1` tunggal, `h2`–`h3` terurut), `<title>` dan `<meta name="description">` dinamis sesuai bahasa aktif (`ID/EN`), Open Graph / Twitter metadata, `src/app/robots.ts`, dan `src/app/sitemap.ts`.
- **PERF-4**: Gambar aset statis dan lampiran dioptimalkan tanpa memblokir *initial render*, font dimuat menggunakan `next/font` dengan `display: "swap"`, dan tidak ada impor paket besar (seperti library PDF/Excel v1.1 atau editor berat) di bundel awal v1.0.

---

## 10. Observability & Error Handling

- **OBS-1**: Backend wajib menyediakan endpoint `GET /api/health` yang memeriksa koneksi server dan database PostgreSQL dengan respons ringan (`200 OK` / `503 Service Unavailable`) untuk pemantauan hosting (`NFR-11`).
- **OBS-2**: Seluruh logging backend wajib memakai helper terstruktur (`src/lib/logger.ts`) dalam format JSON dengan level (`info`, `warn`, `error`) dan request ID, serta **wajib menyensor/melarang penulisan password, token reset, cookie sesi, isi catatan pengguna, dan nominal transaksi ke log plaintext** (`NFR-11`).
- **OBS-3**: Kegagalan layanan pihak ketiga sementara (mis. timeout Resend saat reset password atau gangguan S3/R2 saat unggah gambar) wajib ditangani dengan kode status terkontrol dan pesan error ramah pengguna terlokalisasi (`ID/EN`) tanpa crash maupun kebocoran detail internal ke klien (`NFR-11`, `F5`).

---

## 11. Testing & Verification Standards

- **TEST-1**: Setiap fitur v1.0 wajib memiliki pengujian otomatis yang berjalan di **Vitest `5.1.0`** dan/atau **Playwright `1.65.0`**; RFC tidak boleh ditandai `Implemented` sebelum seluruh test suite lulus tanpa skenario yang di-skip diam-diam.
- **TEST-2**: Logika domain deterministik wajib memiliki **unit test menyeluruh (`Vitest`)**, minimal mencakup: (a) parser *Smart Quick Capture* untuk kasus transaksi ID/EN, catatan berangka seperti `"bab 3 skripsi"` / `"meeting jam 10"`, dan performa `≤ 50 ms`; (b) kalkulator *Safe-to-Spend* termasuk saldo `0`/negatif, pembulatan `floor`, dan tanggal siklus `28`–`31` / `akhir bulan`; serta (c) kalkulasi saldo dompet berbasis ledger.
- **TEST-3**: Endpoint API & layanan database wajib memiliki **integration test** yang memverifikasi seluruh temuan `PRD-REVIEW.md`:
  1. Isolasi lintas pengguna (`403`/`404` pada catatan, folder, dompet, transaksi, transfer, dan signed URL gambar; `NFR-1`).
  2. Transfer antar-dompet atomik (`sumber ≠ tujuan`, `nominal > 0`, rollback penuh saat gagal; `FR-9`).
  3. Integritas referensial saat hapus dompet bertransaksi (`409` / arsip), hapus kategori (migrasi ke *Lainnya*), hapus folder (*Tanpa Folder*), hapus catatan (lepas tautan transaksi), dan hapus akun bersih (`FR-5`, `FR-7`, `FR-8`, `FR-12`, `FR-22`).
  4. Validasi magic bytes + batas 5 MB / 5 gambar (`NFR-9`) dan pencabutan sesi setelah reset password (`FR-3`).
- **TEST-4**: Alur offline-first wajib diuji baik di level unit (`Vitest` + `fake-indexeddb@6.2.8`) maupun E2E (`Playwright` mode offline → online) untuk membuktikan **0 duplikasi** mutasi idempoten, konsistensi saldo dompet setelah sync ganda, penonaktifan upload gambar saat offline, serta pembersihan total IndexedDB dan Cache Storage saat logout (`NFR-8`, `DEC-16`).
- **TEST-5**: E2E Playwright wajib menguji viewport Desktop (`1280×800`) dan Mobile (`375×812`) untuk memeriksa ketiadaan *horizontal overflow*, navigasi keyboard, *Privacy Blur*, pergantian `ID/EN` dan `Light/Dark` tanpa kehilangan input aktif, serta audit aksesibilitas dasar dan Lighthouse pada build produksi (`NFR-2`, `NFR-3`, `NFR-5`).

---

## 12. Implementation Priorities & General Guidelines

### MoSCoW & 7-Day Phasing Alignment

| Fase | Fitur (`FEATURES.md`) | Prioritas | Aturan Eksekusi |
|---|---|---|---|
| **v1.0 Critical Path (Hari 1–6)** | `F1`–`F5`, `F7`–`F19` (18 fitur) | **Must Have** | Wajib selesai, teruji, dan terverifikasi penuh sebagai jalur kritis v1.0. |
| **v1.0 Public Readiness (Hari 7)** | `F6` (1 fitur) | **Should Have** | Wajib hadir untuk rilis publik portofolio (`FR-22`), dikerjakan setelah jalur kritis aman (`PRD.md` §Timeline). |
| **v1.1 Post-Launch (Minggu 2+)** | `F20`–`F24` (5 fitur) | **Could Have** | Dilarang diimplementasikan sebelum seluruh v1.0 selesai dan lolos review (`DEC-3`). |
| **Out of Scope** | `F25`–`F31` (7 fitur) | **Won't Have** | Dilarang ditambahkan ke kode atau skema v1.0/v1.1 tanpa proses `/manage-changes`. |

### General & Agent Workflow Rules

- **QUAL-1**: Urutan otoritas artefak bersifat mutlak: **`PRD.md` > `FEATURES.md` > `RULES.md` > `RFCs/` > rencana implementasi**. Jika ditemukan kontradiksi di tengah implementasi, hentikan eksekusi yang menyimpang dan laporkan secara eksplisit atau gunakan `/manage-changes` — dilarang menyelesaikan kontradiksi secara diam-diam.
- **QUAL-2**: Seluruh kode produksi wajib bebas dari `TODO`, `FIXME`, stub kosong, `any` implisit/eksplisit tanpa justifikasi ketat, maupun *hardcoded secret*.
- **QUAL-3**: Setiap perubahan kode wajib lolos `npm run lint`, typecheck (`tsc --noEmit`), dan test terkait sebelum dilaporkan selesai; dilarang menonaktifkan rule ESLint atau menukar assertion test hanya agar lulus.
- **QUAL-4**: Perubahan arsitektur, penambahan dependency baru di luar daftar terverifikasi, atau pengubahan kontrak `DEC-1`–`DEC-16` wajib diajukan dan dicatat melalui `/manage-changes` atau bagian `## Implementation Notes` pada RFC terkait.
- **QUAL-5**: *(Agent Configuration)* Agar aturan di berkas ini selalu aktif dalam konteks kerja agent di setiap sesi baru, tautkan `RULES.md` dari berkas konfigurasi instruksi agent di root proyek: **`AGENTS.md`** / **`GEMINI.md`** (untuk Antigravity & Codex), **`CLAUDE.md`** (untuk Claude Code), atau **`.cursor/rules/`** (untuk Cursor) dengan referensi langsung `@RULES.md` atau ringkasan pointer ke berkas ini.

---

## Verification & Self-Check Note

- Tabel ringkasan aturan di atas (`61` aturan: `STACK` 6, `ARCH` 6, `DATA` 6, `API` 5, `SEC` 7, `OFFLINE` 5, `UI` 6, `I18N` 3, `PERF` 4, `OBS` 3, `TEST` 5, `QUAL` 5) telah dihitung ulang langsung dari seluruh definisi `- **PREFIX-N**:` di atas.
- Seluruh versi paket pada bagian *Verified Dependency Matrix* telah diverifikasi terhadap registry `npm` sebelum penulisan, dan runtime server PostgreSQL eksternal dicatat jujur sebagai `16+ (unverified)` karena bergantung pada penyedia database (Neon/Supabase/Docker).
- Pemeriksaan mekanis lintas artefak dijalankan setelah penulisan menggunakan `python .agents/skills/generate-rules/scripts/trace-check.py .`.

