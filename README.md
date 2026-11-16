# Noka (Note + Kas)

<p align="center">
  <strong>Seringan Notepad, Serapi Buku Kas.</strong><br>
  <em>Light as a Notepad, Tidy as a Ledger.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.4.6-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19.3.1-blue?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-7.0.2-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.3.5-38bdf8?style=flat-square&logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/PostgreSQL-Drizzle_ORM_0.45.4-336791?style=flat-square&logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PWA-Offline--First-orange?style=flat-square" alt="PWA Offline First" />
  <img src="https://img.shields.io/badge/Vitest-256_Tests_Passing-green?style=flat-square&logo=vitest" alt="Vitest" />
  <img src="https://img.shields.io/badge/Playwright-16_E2E_Passing-green?style=flat-square&logo=playwright" alt="Playwright" />
</p>

---

## 📖 Tentang Noka / About Noka

**Noka** (*Note + Kas*) adalah Web Application & PWA pencatatan pribadi multi-pengguna yang menggabungkan kemudahan menulis catatan harian dengan kerapihan pembukuan keuangan pribadi multi-dompet (IDR).

Navigasi inti Noka memisahkan ruang kerja **Catatan** dan **Keuangan** agar tetap bersih, cepat, dan fokus, sembari menyatukan keduanya melalui fitur pembeda:
- **Smart Quick Capture:** Kotak input cerdas lokal yang membedakan niat Catatan vs Transaksi dalam < 50 ms tanpa AI berbayar.
- **Linked Notes ↔ Transaksi:** Tautkan transaksi pemasukan/pengeluaran langsung ke catatan kegiatan atau riset (*Money Journal Bridge*).
- **Safe-to-Spend Harian:** Algoritma deterministik penghitung jatah belanja aman harian hingga tanggal gajian berikutnya.
- **One-Click Privacy Blur:** Sekali klik untuk menyamarkan seluruh nominal angka finansial saat membuka aplikasi di tempat umum.
- **Offline-First iOS-Safe:** Caching IndexedDB dan antrean mutasi lokal yang berjalan mulus bahkan di iOS Safari tanpa bergantung pada Background Sync API.

---

## ✨ Fitur Utama / Key Features

### 1. 📝 Catatan & Produktivitas (*Notes Workspace*)
- **Editor Markdown:** Pemformatan teks kaya (*heading, bold, italic, list, code block, quote*).
- **GFM Interactive Checklist:** Checklist berbasis task-list GitHub (`- [ ]` / `- [x]`) yang interaktif dan dapat dicentang langsung dari antarmuka.
- **Organisasi Fleksibel:** Sematkan catatan (*Pin*), kelompokkan dalam **Folder**, dan tandai dengan **Multi-Tags**.
- **Instant Search:** Pencarian instan secepat ketikan memfilter judul, isi konten, dan tag catatan.
- **Lampiran Gambar & Dokumen PDF:** Unggah hingga 5 lampiran per catatan (JPEG, PNG, WebP, PDF hingga 5 MB). Dilengkapi *in-app sandboxed PDF viewer* dengan indikator jumlah halaman dan retensi nama file asli desktop.

### 2. 💰 Buku Kas Digital (*Personal Finance*)
- **Multi-Dompet:** Kelola dompet bertipe *Tunai*, *Bank*, atau *E-Wallet* dengan penghitungan saldo berbasis ledger atomik (`initialBalance + sum(transaksi)`).
- **Kategori Bawaan & Custom:** CRUD penuh kategori pemasukan dan pengeluaran dengan pengalihan otomatis ke *"Lainnya / Other"* jika kategori yang pernah digunakan dihapus.
- **Transfer Antar-Dompet:** Pindahkan dana antar-dompet secara atomik tanpa mengotori ringkasan arus kas bulanan.
- **Safe-to-Spend Allowance:** Penghitungan jatah harian otomatis berbasis siklus gajian (`cycleStartDay`).
- **Mode Privacy Blur:** Tombol mata di header untuk menyembunyikan seluruh nominal uang menjadi `Rp •••••`.

### 3. 🚀 Modul Lanjutan (*Advanced Modules*)
- **Anggaran Kategori Bulanan (*Category Budgeting*):** Tetapkan batas pengeluaran per kategori dengan bar progres visual dan peringatan overspending. Fitur *Copy dari bulan lalu* dengan sekali klik.
- **Penjadwal Transaksi Berulang (*Recurring Scheduler*):** Penjadwalan transaksi harian/mingguan/bulanan yang dievaluasi secara atomik saat diakses tanpa memerlukan cron server berbayar. Mendukung mode otomatis dan konfirmasi manual.
- **Buku Utang & Piutang (*Debt & Receivables Ledger*):** Lacak pinjaman dan piutang per kontak dengan batas jatuh tempo, pelunasan kas atau non-kas/barter secara bertahap, dan pembalikan (*reversal*) pelunasan atomik.
- **Ekspor Laporan Finansial:** Unduh riwayat transaksi terfilter ke dalam format **CSV**, **Excel (.xlsx)**, dan cetak **PDF**.

### 4. 🔒 Keamanan & Privasi (*Security & Privacy*)
- Autentikasi sesi cookie aman (`HttpOnly`, `SameSite=Lax`, `Secure`).
- Hashing password dengan bcrypt (salt rounds >= 12).
- Proteksi CSRF berbasis verifikasi origin ketat.
- Isolasi multi-tenant ketat pada setiap query database dan object storage.
- Penghapusan akun mandiri (*Self-service Account Deletion*) yang menghapus permanen seluruh data dan file fisik.

---

## 🛠️ Tech Stack & Arsitektur

| Komponen | Teknologi | Keterangan |
|---|---|---|
| **Framework** | Next.js 16.4.6 (App Router + Turbopack) | React 19.3.1, TypeScript 7.0.2 |
| **Styling** | Tailwind CSS 4.3.5 | CSS Variables, Dark/Light Mode, Warm Minimalist |
| **Database** | PostgreSQL | Relational storage dengan indexing trigram & btree |
| **ORM** | Drizzle ORM 0.45.4 (`pg@8.23.1`) | Type-safe SQL migrations & schema modeling |
| **Offline Engine**| IndexedDB v4 (`idb@8.0.4`) | Local mirror, outbox queue, dan snapshot sync |
| **Storage** | S3 Client (`@aws-sdk/client-s3`) | Mendukung AWS S3, Cloudflare R2, atau fallback lokal |
| **Email** | Resend (`resend@6.38.0`) | Notifikasi reset password + dev outbox lokal |
| **Testing** | Vitest 5.1.0 + Playwright 1.65.0 | 256 unit/integration tests + 16 E2E tests |

---

## 🚀 Memulai Proyek / Getting Started

### Prasyarat
- **Node.js** >= 20.0.0
- **PostgreSQL** database (lokal atau cloud seperti Supabase / Neon / Railway)
- **npm** (atau pnpm / yarn)

### 1. Kloning Repositori
```bash
git clone https://github.com/m-dzikri/noka-app.git
cd noka-app
```

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Konfigurasi Environment Variables
Salin template `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```

Buka file `.env` dan sesuaikan nilainya:
```env
# Konfigurasi Wajib
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/noka_dev
APP_URL=http://localhost:3000
SESSION_SECRET=ganti-dengan-string-acak-minimal-32-karakter

# Opsional: Penyimpanan File Lokal (default: .data/uploads)
LOCAL_UPLOADS_DIR=.data/uploads

# Opsional: S3 / Cloudflare R2 Object Storage
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# Opsional: Resend Transactional Mailer
RESEND_API_KEY=
EMAIL_FROM=
```

### 4. Menjalankan Migrasi Database
Jalankan migrasi Drizzle untuk menginisialisasi tabel PostgreSQL:
```bash
npm run db:migrate
```

### 5. Menjalankan Development Server
```bash
npm run dev
```
Buka [http://localhost:3000](http://localhost:3000) di browser Anda.

---

## 🧪 Skrip Pengujian & Quality Gates

Noka menerapkan standar rekayasa ketat berbasis RFC dan automated testing 100%:

```bash
# Menjalankan seluruh test suite Vitest (Unit + Integration)
npm test

# Menjalankan spesifik unit test
npm run test:unit

# Menjalankan spesifik integration test
npm run test:integration

# Menjalankan pengujian Playwright E2E
npm run test:e2e

# Pemeriksaan tipe TypeScript
npm run typecheck

# Linting ESLint
npm run lint

# Build produksi Next.js Turbopack
npm run build
```

---

## 📁 Struktur Direktori

```text
noka-app/
├── .agents/             # Konfigurasi skills AI Agent PRD workflow
├── changes/             # Dokumen Change Request (CR)
├── public/              # Aset statis PWA (icons, offline.html, sw.js)
├── reviews/             # Arsip hasil code review independen (RFC-001 s/d RFC-015)
├── RFCs/                # Dokumen spesifikasi teknis RFC-001 s/d RFC-015
├── src/
│   ├── app/             # Next.js App Router (Public, Auth, Workspaces & API)
│   ├── components/      # UI components (Atomic, Shell, Notes, Finance, Providers)
│   ├── db/              # Skema Drizzle ORM, koneksi PG, & file migrasi SQL
│   ├── features/        # Business logic terisolasi (Notes, Finance, Sync, Auth)
│   ├── lib/             # Shared utilities (i18n, storage, mailer, logger, env)
│   └── styles/          # Design tokens & tema Tailwind CSS 4
├── tests/
│   ├── e2e/             # Playwright End-to-End Specs
│   ├── integration/     # Vitest API & Database Integration Tests
│   └── unit/            # Vitest Component & Utility Unit Tests
├── .env.example         # Template environment variables
├── FEATURES.md          # Katalog fitur F1–F31 & prioritas MoSCoW
├── PRD.md               # Product Requirements Document v2.0
├── RFCS.md              # Indeks seluruh master RFC
├── RULES.md             # Dokumen standar teknis & 61 aturan kualitas
└── TEST-STRATEGY.md     # Strategi pengujian komprehensif tiap RFC
```

---

## 📄 Lisensi / License

Hak Cipta © 2026 **Noka App**. Seluruh hak cipta dilindungi.
Didistribusikan untuk keperluan pengembangan pribadi dan portofolio profesional.
