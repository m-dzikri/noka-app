# Features Specification: Noka

> **Tagline:** *"Seringan Notepad, Serapi Buku Kas."* *(EN: "Light as a Notepad, Tidy as a Ledger.")*  
> **Sumber Dokumen:** `PRD.md` (v2.0) & `PRD-REVIEW.md`  
> **Tanggal:** 11 November 2026

---

## Product Overview

**Noka** (*Note + Kas*) adalah Web App / PWA pencatatan pribadi multi-pengguna yang menggabungkan catatan teks harian ala Notepad/Notes dengan pelacakan keuangan multi-dompet (IDR). Navigasi inti memisahkan ruang kerja **Catatan** dan **Keuangan** agar tetap bersih dan cepat, sekaligus menyatukan keduanya melalui **Smart Quick Capture** lokal (offline-ready), **Linked Notes ↔ Transaksi**, **Safe-to-Spend harian**, dan **Privacy Blur** sekali klik.

Target peluncuran **v1.0** adalah **1 minggu** untuk kebutuhan portofolio siap publik (Mobile, Tablet, Desktop, Light/Dark Mode bertema minimalis terinspirasi `nomu.store`, serta bilingual ID/EN), sementara modul finansial lanjutan masuk ke fase **v1.1**.

---

## Feature Summary

### Summary by Priority

| Priority | Count | Feature IDs | Scope Phase |
|---|---:|---|---|
| **Must** | 18 | F1, F2, F3, F4, F5, F7, F8, F9, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19 | v1.0 Critical Path |
| **Should** | 1 | F6 | v1.0 Public Readiness |
| **Could** | 5 | F20, F21, F22, F23, F24 | v1.1 Post-Launch |
| **Won't** | 7 | F25, F26, F27, F28, F29, F30, F31 | Out of Scope |
| **Total** | **31** | **F1–F31** | — |

### Summary by Category

| Category | Count | Feature IDs |
|---|---:|---|
| Public Showcase, Visual System & Localization | 3 | F1, F2, F3 |
| Authentication, Account & Security | 3 | F4, F5, F6 |
| Notes Workspace | 3 | F7, F8, F9 |
| Personal Finance (Kas) | 4 | F10, F11, F12, F13 |
| Noka Differentiators & Synergy | 4 | F14, F15, F16, F17 |
| PWA & Offline-First Synchronization | 2 | F18, F19 |
| Post-Launch v1.1 Extensions | 5 | F20, F21, F22, F23, F24 |
| Out of Scope | 7 | F25, F26, F27, F28, F29, F30, F31 |
| **Total** | **31** | **F1–F31** |

---

## Feature Catalog

> **Aturan ID Permanen:** ID `F1`–`F31` bersifat permanen dan dirujuk oleh `RFCS.md` serta `RFC-*`. Fitur baru di masa depan wajib memakai nomor lanjutan tanpa menomori ulang ID yang ada.

### 1. Public Showcase, Visual System & Localization

| ID | Feature | Priority | Source | Complexity | Acceptance Criteria |
|---|---|---|---|---|---|
| **F1** | Public Landing Page & SEO Showcase | Must | FR-1, NFR-2, NFR-4, NFR-10 | Medium | - Halaman `/` dapat diakses publik tanpa login dengan tata letak minimalis modern (whitespace lega, tipografi sans-serif tegas, kartu fitur interaktif, animasi halus yang mematuhi `prefers-reduced-motion`).<br>- Dirender ramah SEO (SSR/SSG) dengan heading semantik `h1`–`h3`, `<title>` & `<meta description>` dinamis ID/EN, Open Graph tags, `robots.txt`, dan `sitemap.xml`.<br>- Footer menampilkan ringkasan kebijakan privasi data serta CTA menuju Daftar/Masuk; target Lighthouse LCP ≤ 2,5 detik (4G) dan skor SEO ≥ 90. |
| **F2** | Bilingual UI (ID/EN) & Light/Dark Theme Switcher | Must | FR-15, NFR-4, NFR-5 | Low | - Pengguna dapat mengganti bahasa (**ID / EN**) dan tema (**Light / Dark**) kapan saja di Landing Page maupun di dalam aplikasi tanpa *full reload* dan tanpa menghapus teks yang sedang diketik.<br>- Seluruh kombinasi teks, tombol, dan kartu di kedua tema memenuhi rasio kontras minimum **WCAG 2.1 Level AA**.<br>- Preferensi tersimpan lokal di browser dan tersinkron ke profil pengguna saat login. |
| **F3** | Responsive App Shell & Accessibility Foundation | Must | FR-10, NFR-3, NFR-5, NFR-6 | Medium | - Navigasi utama memisahkan ruang kerja **Catatan** dan **Keuangan** secara jelas (`DEC-2`).<br>- Tidak ada *horizontal overflow* atau elemen terpotong pada lebar viewport Mobile (≥ 360px), Tablet (768px–1024px), dan Desktop (≥ 1280px); navigasi dan tombol Quick Capture mudah dijangkau di HP.<br>- Operasi inti mendukung navigasi keyboard penuh (termasuk pintasan Quick Capture), *focus ring* terlihat jelas, atribut ARIA akurat pada tombol ikon, serta berjalan normal pada Chrome, Safari (iOS/macOS), Firefox, dan Edge (2 versi mayor terakhir). |

---

### 2. Authentication, Account & Security

| ID | Feature | Priority | Source | Complexity | Acceptance Criteria |
|---|---|---|---|---|---|
| **F4** | Frictionless Sign Up, Login & Session Security | Must | FR-2, NFR-1, NFR-7, NFR-11 | Medium | - Pengguna dapat mendaftar (Email, Nama, Password ≥ 8 karakter) dan **langsung masuk ke workspace** tanpa verifikasi email wajib (`DEC-5`).<br>- Password di-hash menggunakan algoritma modern (*bcrypt/Argon2*); sesi memakai cookie `HttpOnly` + `Secure` + `SameSite` dengan proteksi CSRF serta *rate limiting* pada endpoint login.<br>- Setiap API kepemilikan data memvalidasi `userId` sesi aktif dan menolak akses lintas pengguna (HTTP 403/404).<br>- Aksi **Logout** langsung menghapus seluruh data privat di IndexedDB dan cache Service Worker (`DEC-16`). |
| **F5** | Forgot Password & Tokenized Email Reset | Must | FR-3, NFR-1, NFR-11 | Medium | - Form Lupa Password selalu menampilkan pesan sukses generik agar tidak membocorkan apakah suatu email terdaftar; endpoint dilindungi *rate limiting*.<br>- Sistem membuat token acak sekali pakai yang disimpan dalam bentuk hash di server dengan TTL **30 menit** dan mengirim tautan reset via layanan email.<br>- Penggantian password baru (≥ 8 karakter) langsung menghanguskan token, mencabut seluruh sesi aktif lama, dan menampilkan pesan error ramah pengguna bila layanan email sementara gagal tanpa membocorkan kredensial/stack trace ke klien. |
| **F6** | Profile, Cycle Settings & Self-Service Account Deletion | Should | FR-2, FR-22, NFR-1, NFR-9, NFR-11 | Medium | - Halaman Pengaturan memungkinkan ubah Nama, ganti Password (wajib verifikasi password lama), atur bahasa & tema default, serta tanggal mulai siklus bulanan (`1–28` atau `akhir bulan`, otomatis menyesuaikan hari terakhir pada bulan pendek).<br>- Fitur **Hapus Akun** (`FR-22`) mewajibkan konfirmasi password, menghapus permanen seluruh catatan, dompet, transaksi, transfer, dan file gambar terkait di object storage, lalu menghapus cache lokal dan sesi.<br>- Backend menyediakan endpoint `/health` untuk pemantauan hosting dan logging terstruktur bebas plaintext password, token, isi catatan, maupun nominal transaksi (`NFR-11`). |

---

### 3. Notes Workspace

| ID | Feature | Priority | Source | Complexity | Acceptance Criteria |
|---|---|---|---|---|---|
| **F7** | Notes CRUD, Markdown Editor & GFM Checklists | Must | FR-4, NFR-2, NFR-7 | Medium | - Pengguna dapat membuat, melihat, mengedit, dan menghapus catatan (dengan dialog konfirmasi hapus).<br>- Mendukung Markdown standar (*heading, bold, italic, list, code, link*) serta checklist interaktif berbasis sintaks **GFM task-list** (`- [ ]` / `- [x]`) (`DEC-14`) yang dapat dicentang langsung lewat UI.<br>- Perubahan tersimpan melalui *debounced auto-save* dengan indikator status jelas (`Tersimpan`, `Menyimpan...`, `Menunggu sinkronisasi`). |
| **F8** | Notes Organization (Pin, Folders, Tags & Instant Search) | Must | FR-5, NFR-2 | Medium | - Pengguna dapat menyematkan (*Pin*) catatan agar tampil di urutan teratas, membuat/mengedit/menghapus **Folder**, serta menambahkan beberapa **Tag**.<br>- Menghapus sebuah Folder otomatis memindahkan catatan di dalamnya ke status *Tanpa Folder / Root* tanpa menghapus catatan (`DEC-13`).<br>- Pencarian instan memfilter berdasarkan judul, isi Markdown, dan tag, serta mendukung kombinasi filter Folder/Tag/Pin. |
| **F9** | Secure Note Image Attachments (Online-Only v1.0) | Must | FR-6, NFR-1, NFR-9 | Medium | - Saat **online**, pengguna dapat mengunggah maks. **5 gambar per catatan** (hanya `JPEG`, `PNG`, `WebP`, ukuran ≤ **5 MB/file**); server memeriksa tipe MIME & *magic bytes* serta menormalisasi nama file.<br>- Gambar disajikan hanya melalui URL terautentikasi / bertanda tangan milik pemilik catatan; menghapus gambar atau catatan ikut menghapus berkasnya dari object storage.<br>- Saat **offline**, kontrol unggah dinonaktifkan dengan keterangan jelas (`DEC-9`), dan gambar yang belum tersimpan di cache menampilkan placeholder offline yang rapi. |

---

### 4. Personal Finance (*Kas*)

| ID | Feature | Priority | Source | Complexity | Acceptance Criteria |
|---|---|---|---|---|---|
| **F10** | Multi-Wallet Management & Ledger-Derived Balances | Must | FR-7, NFR-1, NFR-7 | Medium | - Pengguna dapat membuat/mengedit dompet bertipe **Tunai**, **Bank**, atau **E-Wallet** (IDR integer presisi penuh) beserta opsi `includeInSafeToSpend` (default aktif pada **Tunai & E-Wallet**, nonaktif pada **Bank**; `DEC-12`).<br>- Saldo dompet selalu dihitung dari `saldoAwal + pemasukan - pengeluaran + transferMasuk - transferKeluar` (`DEC-11`), tidak pernah ditimpa langsung oleh *Last-Write-Wins*.<br>- Dompet yang sudah memiliki riwayat transaksi atau transfer hanya dapat **diarsipkan** (disembunyikan dari pemilih entri baru dengan riwayat tetap utuh); penghapusan permanen hanya diizinkan bila riwayat berjumlah 0 (`DEC-13`). |
| **F11** | Income & Expense Transactions & Custom Categories | Must | FR-8, NFR-1, NFR-7 | Medium | - Pengguna dapat membuat, mengedit, dan menghapus transaksi **Pemasukan** dan **Pengeluaran** dengan nominal IDR bilangan bulat positif (`> 0`), dompet, kategori, tanggal/waktu, dan keterangan opsional.<br>- Tersedia kategori bawaan (ID/EN) serta CRUD penuh untuk **kategori custom**.<br>- Menghapus kategori yang sudah pernah dipakai transaksi otomatis memindahkan transaksi historisnya ke kategori default `"Lainnya / Other"` agar tidak menjadi data yatim (`DEC-13`). |
| **F12** | Atomic Inter-Wallet Transfers | Must | FR-9, NFR-7 | Medium | - Pengguna dapat mentransfer nominal IDR bilangan bulat positif (`> 0`) antar dua dompet miliknya yang berbeda (`sumber ≠ tujuan`; ditolak bila dompet sama).<br>- Operasi berjalan dalam satu transaksi database atomik; memperbarui saldo sumber dan tujuan tanpa dihitung sebagai pemasukan atau pengeluaran bulanan.<br>- Mengedit atau menghapus catatan transfer memperbarui/membalikkan kedua sisi saldo secara bersamaan. |
| **F13** | Finance Dashboard & Cycle Summary | Must | FR-10, NFR-2, NFR-3 | Medium | - Menampilkan total saldo gabungan, daftar saldo per dompet aktif, ringkasan Pemasukan vs. Pengeluaran pada siklus gajian aktif, rincian per kategori, serta daftar transaksi terbaru.<br>- Daftar transaksi dapat difilter berdasarkan rentang tanggal, dompet, tipe (*Pemasukan / Pengeluaran / Transfer*), dan kategori.<br>- Latensi query CRUD API terjaga pada p95 ≤ 300 ms. |

---

### 5. Noka Differentiators & Synergy

| ID | Feature | Priority | Source | Complexity | Acceptance Criteria |
|---|---|---|---|---|---|
| **F14** | Smart Quick Capture (Offline-Ready Dual-Intent Bar) | Must | FR-11, NFR-2, NFR-5 | High | - Kotak input cepat tersedia konsisten di ruang kerja (beserta pintasan keyboard di desktop) dan diproses oleh parser lokal berbasis aturan dalam **≤ 50 ms** tanpa memanggil API AI eksternal (`DEC-4`).<br>- Klasifikasi **Transaksi** hanya aktif jika terdapat penanda nominal/satuan sah (`rp`, `idr`, `rb`, `ribu`, `k`, `jt`, `juta`, `25.000`) atau bilangan bulat ≥ `1000` di luar pola jam/tanggal (`10:00`, `tgl 15`) sehingga input seperti `"bab 3 skripsi"` atau `"meeting jam 10"` tetap menjadi **Catatan** (`DEC-15`).<br>- Default transaksi adalah **Pengeluaran** kecuali kata kunci pemasukan cocok (`+`, `gaji`, `salary`, `bonus`, `terima`, `masuk`, `refund`, `income`); mencocokkan dompet secara *case-insensitive* (jatuh ke dompet default) serta kategori.<br>- Menampilkan kartu pratinjau instan dengan tombol ubah manual (*Catatan ↔ Transaksi*) sebelum disimpan, mendukung alur catat **≤ 5 detik** baik online maupun offline. |
| **F15** | Linked Notes ↔ Transactions (Money Journal Bridge) | Must | FR-12, NFR-7 | Medium | - Satu catatan dapat ditautkan ke nol atau lebih transaksi **Pemasukan/Pengeluaran** (tidak termasuk Transfer antar-dompet; `DEC-14`).<br>- Dari detail catatan, pengguna dapat menautkan transaksi yang ada atau membuat transaksi baru yang langsung tertaut; catatan menampilkan daftar transaksi tertaut beserta total **Keluar**, **Masuk**, dan **Net**.<br>- Pada detail transaksi muncul lencana tautan balik ke catatan induk; menghapus catatan hanya melepas tautan tanpa menghapus transaksi keuangan (`DEC-13`). |
| **F16** | Deterministic Safe-to-Spend Daily Allowance | Must | FR-13, NFR-7 | Low | - Menghitung jatah aman harian dengan rumus pasti: `max(0, floor(totalSaldoDompetTerpilih / jumlahHariTersisaDalamSiklus))`, di mana hari tersisa dihitung inklusif dari hari ini hingga 1 hari sebelum tanggal mulai siklus berikutnya (minimal `1` hari; `DEC-12`).<br>- Menampilkan `Rp0` beserta keterangan informatif (tanpa angka minus) jika total saldo terpilih ≤ 0 atau belum ada dompet yang disertakan. |
| **F17** | One-Click Privacy Blur Mode | Must | FR-14, NFR-3, NFR-5 | Low | - Tombol sekali klik (`Hide Nominal` / ikon mata berlabel ARIA jelas) di header langsung menyamarkan seluruh angka nominal uang di layar (saldo dompet, total saldo, daftar transaksi, *Safe-to-Spend*, dan total *Linked Notes*) menjadi `Rp •••••`.<br>- Status *Privacy Blur* tetap bertahan saat berpindah halaman atau memuat ulang browser pada perangkat tersebut. |

---

### 6. PWA & Offline-First Synchronization

| ID | Feature | Priority | Source | Complexity | Acceptance Criteria |
|---|---|---|---|---|---|
| **F18** | PWA Installability & Private-Mode Fallback | Must | FR-16, NFR-6 | Medium | - Menyediakan `manifest.webmanifest` dan Service Worker untuk instalasi PWA serta caching aset shell aplikasi (*App Shell TTI ≤ 2,5 detik*).<br>- Jika browser dijalankan pada mode privat yang membatasi IndexedDB/Service Worker, aplikasi tetap berjalan normal dalam mode online dengan banner informasi ringan tanpa *crash*. |
| **F19** | IndexedDB Local Mirror & Event-Driven Offline Write Queue | Must | FR-16, NFR-1, NFR-7, NFR-8 | High | - Menyimpan salinan lokal teks catatan, folder, tag, dompet, kategori, dan transaksi di IndexedDB untuk akses baca saat offline.<br>- Saat offline, pengguna dapat membuat/mengedit catatan (teks/GFM checklist) serta mencatat transaksi & transfer baru ke antrean outbox lokal berbekal UUID klien dan *idempotency key*, dengan lencana status jelas (`Online/Synced`, `Offline`, `Syncing`, `Sync Error`).<br>- Sinkronisasi dipicu pada pembukaan aplikasi, fokus jendela saat online, event `online`, dan tombol *Sync Now* (tanpa bergantung pada `Background Sync API` yang tidak didukung iOS Safari; `DEC-8`).<br>- Pengulangan sinkronisasi tidak membuat duplikasi (0 duplikat); konflik catatan/metadata memakai *Last-Write-Wins* (`updatedAt`) sementara saldo dompet dihitung ulang dari ledger server (`DEC-11`); seluruh cache lokal dihapus saat Logout (`DEC-16`). |

---

### 7. Post-Launch v1.1 Extensions

| ID | Feature | Priority | Source | Complexity | Acceptance Criteria |
|---|---|---|---|---|---|
| **F20** | Monthly Category Budgeting | Could | FR-17 | Medium | - Pengguna dapat menetapkan batas anggaran bulanan IDR per kategori pengeluaran dan melihat bar progres pemakaian serta peringatan saat mendekati/melewati batas. *(Ditunda ke v1.1 sesuai `DEC-3`)*. |
| **F21** | Recurring Transactions Scheduler | Could | FR-18 | Medium | - Pengguna dapat menjadwalkan transaksi rutin harian/mingguan/bulanan untuk otomatis tercatat atau dikonfirmasi pada tanggal jatuh tempo. *(Ditunda ke v1.1 sesuai `DEC-3`)*. |
| **F22** | Debt & Receivables Ledger (*Utang-Piutang*) | Could | FR-19 | Medium | - Pencatatan pinjaman dan piutang per nama pihak beserta tanggal jatuh tempo dan riwayat cicilan/lunas yang terpisah dari pengeluaran bulanan biasa. *(Ditunda ke v1.1 sesuai `DEC-3`)*. |
| **F23** | PDF Note Attachments | Could | FR-20 | Low | - Memperluas **F9** agar catatan mendukung unggah, validasi MIME/magic-byte, dan pratinjau/unduh dokumen PDF (maks. 5 MB/file). *(Ditunda ke v1.1 sesuai `DEC-3`, `DEC-9`)*. |
| **F24** | Financial Data Export (CSV / Excel / PDF) | Could | FR-21 | Medium | - Pengguna dapat mengekspor riwayat transaksi terfilter dan ringkasan arus kas bulanan ke format CSV/Excel maupun PDF. *(Ditunda ke v1.1 sesuai `DEC-3`)*. |

---

### 8. Out of Scope (*Won't Have*)

| ID | Feature | Priority | Source | Complexity | Acceptance Criteria |
|---|---|---|---|---|---|
| **F25** | Multi-Currency & Automatic FX Conversion | Won't | PRD Scope (`DEC-6`) | High | - Seluruh transaksi dan saldo hanya menggunakan IDR; kurs mata uang asing tidak didukung pada v1.0 maupun v1.1 awal. |
| **F26** | Cross-Account Collaboration & Shared Split-Bills | Won't | PRD Scope (`DEC-7`) | High | - Seluruh data bersifat 100% privat per akun; berbagi catatan, akses tim, dan patungan antar-akun tidak disertakan. |
| **F27** | Paid External AI/LLM Quick-Capture Parsing | Won't | PRD Scope (`DEC-4`) | Medium | - *Smart Quick Capture* wajib menggunakan parser aturan lokal offline tanpa panggilan ke layanan AI/LLM berbayar. |
| **F28** | Open Banking / Automatic Bank Statement Sync | Won't | PRD Scope | High | - Tidak ada integrasi otomatis mutasi bank atau e-wallet; pencatatan berasal dari input pengguna. |
| **F29** | Mandatory Signup Email Verification Gate | Won't | PRD Scope (`DEC-5`) | Low | - Pengguna baru langsung masuk ke aplikasi setelah mendaftar; email hanya dikirim untuk alur Lupa Password. |
| **F30** | Offline Image Upload Queuing & CRDT Sync | Won't | PRD Scope (`DEC-8`, `DEC-9`) | High | - Unggahan gambar mewajibkan koneksi online pada v1.0, dan resolusi konflik offline memakai *Last-Write-Wins* bukan CRDT. |
| **F31** | Separate Native iOS / Android Store Binaries | Won't | PRD Scope | High | - Distribusi mobile ditangani melalui Web App responsif dan PWA, bukan aplikasi native App Store / Play Store. |

