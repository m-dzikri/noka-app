# Product Requirements Document (PRD): Noka

> **Tagline:** *"Seringan Notepad, Serapi Buku Kas."* *(EN: "Light as a Notepad, Tidy as a Ledger.")*  
> **Versi Dokumen:** 2.0 (Hasil Verifikasi & Penyempurnaan `/verify-prd`)  
> **Tanggal:** 11 November 2026  
> **Status:** Verified & Implementation-Ready

---

## Overview

**Noka** (singkatan dari **No**te + **Ka**s) adalah aplikasi web (*Web App / PWA*) pencatatan pribadi terpadu yang menggabungkan kesederhanaan pencatatan teks harian ala Notepad/Notes dengan pencatatan keuangan pribadi multi-dompet yang rapi dan bebas stres.

Pengguna—terutama mahasiswa dan pekerja kantoran—sering kali memecah pencatatan hariannya ke dua tempat terpisah: catatan cepat di Notepad/Notes HP dan pencatatan keuangan di spreadsheet atau aplikasi finansial yang terasa kaku dan terlalu banyak form. **Noka** menyatukan keduanya dalam satu rumah dengan navigasi yang tetap terpisah secara bersih (**Catatan** dan **Keuangan**), namun terhubung secara opsional melalui **Smart Quick Capture**, **Linked Notes ↔ Transaksi**, **Safe-to-Spend harian**, serta **Privacy Blur** sekali klik.

Secara visual, Noka mengadopsi arah desain minimalis modern berkonsep kontras tinggi dengan tipografi sans-serif tegas, *whitespace* lega, dan komponen kartu interaktif yang terinspirasi dari `nomu.store`, dilengkapi mode **Light & Dark**, pilihan bahasa **Indonesia & Inggris (ID/EN)**, halaman perkenalan publik ramah SEO, serta kemampuan **PWA Offline-First**. Proyek ini dirancang dengan standar kualitas tinggi untuk menjadi proyek portofolio siap produksi dalam target **1 minggu (v1.0)** sebelum dilanjutkan ke modul finansial lanjutan (**v1.1**).

---

## Product Type

- **Klasifikasi Utama:** **Web App** (Multi-user Responsive Web Application + Progressive Web App / PWA dengan Halaman Publik SEO).
- **Platform Target:** Browser modern pada Mobile, Tablet, dan Desktop.

### Cakupan Pemeriksaan (*Applied & Skipped Checks*)

| Kategori Check | Status | Catatan / Alasan |
|---|---|---|
| Auth & Sessions | **Diterapkan** | Registrasi langsung masuk (Email + Password), login, sesi persisten, Lupa Password via email, dan pembersihan cache lokal saat logout. |
| Authorization per Resource | **Diterapkan** | Isolasi ketat berbasis kepemilikan akun (`userId`); 100% privat per pengguna pada API dan object storage tanpa akses lintas akun. |
| Data Model & Migrations | **Diterapkan** | Skema relasional terstruktur dengan saldo dompet terturunkan dari ledger transaksi/transfer serta migrasi skema terversi. |
| Accessibility (a11y) | **Diterapkan** | Kontras WCAG 2.1 AA pada Light & Dark Mode, navigasi keyboard, label semantik/ARIA, dan dukungan `prefers-reduced-motion`. |
| Responsive Layout | **Diterapkan** | Tata letak adaptif penuh untuk layar Mobile (≥ 360px), Tablet (768px–1024px), dan Desktop (≥ 1280px). |
| Browser Support | **Diterapkan** | Dukungan dua versi mayor terbaru Chrome, Safari (iOS/macOS), Firefox, dan Edge, dengan fallback aman jika penyimpanan offline dibatasi. |
| Page-Load Budget | **Diterapkan** | Anggaran muat ringan (LCP ≤ 2,5 detik pada simulasi 4G) agar nyaman dibuka cepat setiap hari di HP maupun desktop. |
| SEO for Public Pages | **Diterapkan** | Landing page publik menggunakan HTML semantik, metadata lokal ID/EN, Open Graph, `robots.txt`, dan `sitemap.xml`. |
| Offline Sync *(Pengecualian eksplisit dari default skip Web App)* | **Diterapkan** | Diminta eksplisit oleh pengguna; mendukung baca data tersinkron dan catat/edit teks catatan serta transaksi saat offline lewat IndexedDB + antrean sinkronisasi berbasis event. |
| Binary Size | **Dilewati** | Aplikasi didistribusikan sebagai Web App/PWA berbasis browser sehingga ukuran dikontrol melalui *web bundle budget*, bukan batas biner app store native. |
| Public Third-Party API SLA & Versioning | **Dilewati** | Backend API hanya melayani klien resmi Noka (*first-party web app*), bukan API terbuka untuk pengembang pihak ketiga. |

---

## Goals and Objectives

1. **Menyatukan Kebiasaan Catat Harian & Keuangan:** Menyediakan satu aplikasi ringan agar pengguna tidak lagi berpindah antara Notepad/Notes dan aplikasi/spreadsheet keuangan terpisah.
2. **Mengurangi Hambatan Mencatat (*Zero-Friction Capture*):** Memungkinkan pencatatan ide maupun pengeluaran selesai dalam ≤ 5 detik melalui input natural *Smart Quick Capture*, termasuk saat koneksi terputus.
3. **Kualitas Portofolio Siap Publik:** Menghadirkan antarmuka modern bertema Light & Dark dan bilingual ID/EN dengan keamanan isolasi multi-pengguna yang siap di-hosting untuk publik.
4. **Pengiriman Realistis 1 Minggu:** Mengirimkan versi **v1.0** yang stabil, teruji, dan utuh pada jalur kritis (*critical path*) dalam **7 hari**, sembari menjaga peta jalan **v1.1** untuk modul finansial lanjutan.

---

## Scope

### Included in v1.0 (MVP — Target 1 Minggu)
- **Public Landing Page & SEO:** Halaman perkenalan publik minimalis modern (Light/Dark, ID/EN), pratinjau fitur interaktif, kebijakan privasi ringkas, dan CTA Daftar/Masuk.
- **Autentikasi & Pengaturan Akun:** Daftar langsung masuk (Email + Nama + Password minimal 8 karakter), Login, Logout (termasuk pembersihan cache offline), Lupa Password via tautan email (single-use, kedaluwarsa 30 menit), ubah profil & password, preferensi ID/EN & Light/Dark, pengaturan tanggal mulai siklus bulanan, serta penghapusan akun mandiri.
- **Modul Catatan (*Notes*):** CRUD catatan dengan *debounced auto-save*, editor Markdown dengan checklist interaktif berbasis sintaks GFM (`- [ ]` / `- [x]`), Pin, Folder, Tag, pencarian instan, serta lampiran gambar (JPEG/PNG/WebP, maks. 5 MB/file, maks. 5 gambar/catatan; upload hanya saat online).
- **Modul Keuangan (*Kas*):** Multi-Dompet (Tunai, Bank, E-Wallet), saldo dompet diturunkan dari saldo awal + ledger transaksi/transfer, Transfer antar-dompet atomik, Pencatatan Pemasukan & Pengeluaran (IDR integer), kategori bawaan + kategori custom, serta ringkasan siklus bulanan.
- **4 Fitur Pembeda Inti Noka:**
  1. **Smart Quick Capture:** Kotak input cepat berbasis aturan lokal (*rule-based parser* offline-ready) yang membedakan teks transaksi vs. catatan biasa secara konservatif agar minim salah deteksi.
  2. **Linked Notes ↔ Transaksi:** Menautkan transaksi pemasukan/pengeluaran (non-transfer) ke suatu catatan beserta ringkasan total masuk, total keluar, dan net di dalam catatan.
  3. **Safe-to-Spend Harian:** Perhitungan batas aman pengeluaran harian deterministik dari saldo dompet terpilih dibagi sisa hari dalam siklus aktif (termasuk hari ini).
  4. **Privacy Blur Mode:** Tombol sekali klik untuk menyamarkan seluruh nominal keuangan (`Rp •••••`) secara persisten di perangkat.
- **PWA & Offline Sync v1.0:** Dapat dipasang sebagai PWA, membaca data teks tersinkron saat offline, serta mencatat/mengedit catatan dan transaksi (non-lampiran) ke antrean lokal untuk disinkronkan saat koneksi kembali (`online` event, fokus aplikasi, atau tombol sinkron manual).

### Planned for v1.1 (Could Have — Pasca-Launch Minggu 2+)
- **Anggaran (*Budgeting*) per Kategori** (`FR-17`)
- **Transaksi Berulang (*Recurring Transactions*)** (`FR-18`)
- **Buku Utang-Piutang** (`FR-19`)
- **Lampiran PDF di Catatan** (`FR-20`)
- **Export Data CSV/Excel/PDF** (`FR-21`)

### Explicitly Excluded (Won't Have — Out of Scope)
- **Multi-Mata Uang / Konversi Kurs Otomatis:** Hanya menggunakan Rupiah (**IDR**).
- **Kolaborasi / Berbagi Catatan & Keuangan Lintas Akun:** Seluruh data 100% privat per akun.
- **Integrasi AI/LLM Eksternal Berbayar:** Parsing *Smart Quick Capture* wajib berjalan lokal tanpa ketergantungan API eksternal.
- **Integrasi Open Banking / Mutasi Bank Otomatis:** Tidak ada penarikan otomatis mutasi bank/e-wallet.
- **Verifikasi Email Wajib Saat Registrasi:** Pengguna baru langsung masuk ke aplikasi setelah daftar agar bebas hambatan.
- **Upload Lampiran saat Offline & Sinkronisasi CRDT Kompleks:** Unggah gambar mewajibkan koneksi online pada v1.0, dan sinkronisasi memakai antrean idempoten + *Last-Write-Wins* untuk teks/metadata.
- **Aplikasi Native iOS/Android Terpisah:** Distribusi berfokus pada Web App & PWA responsif.

---

## User Personas & Target Audience

### Persona 1: Raka — Mahasiswa Perantau (20 Tahun)
- **Kebiasaan & Masalah:** Mencatat tugas kuliah, ide organisasi, dan daftar belanja di Notes HP, namun sering lupa ke mana perginya uang bulanan karena malas mengisi form aplikasi keuangan yang bertele-tele. Sering berada di kampus atau transportasi umum dengan sinyal internet naik-turun.
- **Kebutuhan di Noka:** Ingin mengetik cepat seperti `"makan siang 22rb gopay"` dalam ≤ 5 detik meski sinyal putus-nyambung, melihat batas aman jajan harian (*Safe-to-Spend*) sampai kiriman awal bulan, dan melacak total pengeluaran kepanitiaan langsung di dalam catatan rencananya.

### Persona 2: Dinda — Pekerja Kantoran / Young Professional (26 Tahun)
- **Kebiasaan & Masalah:** Bekerja di laptop sepanjang hari, sering menulis notulen rapat atau checklist pekerjaan, sambil mengelola uang di Tunai, rekening Bank, dan E-Wallet. Merasa tidak nyaman jika rekan kerja melihat saldo pribadinya saat ia membuka catatan di meja kerja atau kafe.
- **Kebutuhan di Noka:** Tampilan minimalis bersih dengan Dark Mode, pemisahan jelas antara dompet tabungan Bank (yang tidak ikut terhitung di jatah jajan) dengan dompet harian, transfer antar-dompet tanpa mengacaukan laporan pengeluaran, serta tombol **Privacy Blur** sekali klik.

### Persona Sekunder: Perekrut / Reviewer Portofolio
- **Tujuan:** Mengunjungi landing page publik Noka, mencoba daftar dan fitur unggulan dari desktop maupun HP, serta menilai kualitas desain, ketepatan teknis, performa, dan keamanan isolasi data.

---

## Functional Requirements

> **Aturan ID Permanen:** Seluruh ID `FR-*` bersifat permanen dan tidak pernah dinomori ulang. Prioritas MoSCoW pada tiap item menentukan jalur kritis (*critical path*) v1.0 vs. v1.1.

### Jalur Kritis & Inti v1.0 (*Must Have*)

- **FR-1** *(Must Have — v1.0)* — **Public Landing Page & Bilingual Showcase:**  
  Sistem menyediakan landing page publik (dapat diakses tanpa login) dengan estetika minimalis modern terinspirasi arah visual `nomu.store` (tipografi sans-serif tegas, *whitespace* lega, kartu fitur interaktif, animasi halus yang menghormati *reduced motion*), dilengkapi pengalih tema Light/Dark, pengalih bahasa ID/EN, metadata SEO, ringkasan privasi data di footer, dan CTA menuju Daftar/Masuk.

- **FR-2** *(Must Have — v1.0)* — **Autentikasi Langsung Masuk & Manajemen Profil:**  
  Pengguna dapat mendaftar menggunakan Email, Nama, dan Password (minimal 8 karakter) lalu langsung masuk ke aplikasi tanpa verifikasi email wajib. Pengguna dapat login, logout (yang sekaligus menghapus cache privat offline pada browser), mengubah profil, mengganti password (dengan verifikasi password lama), memilih bahasa default (ID/EN), memilih tema (Light/Dark), dan mengatur tanggal mulai siklus bulanan (1–28 atau `akhir bulan`, dengan penyesuaian otomatis ke hari terakhir bulan untuk bulan yang lebih pendek).

- **FR-3** *(Must Have — v1.0)* — **Alur Lupa Password via Email:**  
  Pada halaman login, pengguna dapat meminta reset password dengan memasukkan alamat email. Jika terdaftar, sistem mengirim tautan reset bertoken acak sekali pakai (disimpan dalam bentuk hash di server, masa berlaku **30 menit**). Respons API/UI selalu bersifat generik agar tidak membocorkan apakah email terdaftar, dan perubahan password otomatis mencabut sesi login aktif sebelumnya.

- **FR-4** *(Must Have — v1.0)* — **Manajemen Catatan (Markdown & GFM Checklist):**  
  Pengguna dapat membuat, membaca, mengedit, dan menghapus catatan (dengan dialog konfirmasi hapus). Editor mendukung Markdown standar (*heading, bold, italic, list, code, link*) serta checklist interaktif berbasis sintaks GFM (`- [ ]` / `- [x]`) yang status centangnya dapat diklik langsung tanpa menulis kode mentah, dilengkapi *debounced auto-save* dan indikator status simpan (`Tersimpan` / `Menyimpan...` / `Menunggu sinkronisasi`).

- **FR-5** *(Must Have — v1.0)* — **Organisasi & Pencarian Catatan:**  
  Pengguna dapat menyematkan (*Pin*) catatan ke bagian teratas, mengelompokkan catatan ke dalam **Folder**, memberi satu atau lebih **Tag**, dan melakukan pencarian instan berdasarkan judul, isi, maupun tag. Jika sebuah **Folder** dihapus, seluruh catatan di dalamnya dipindahkan otomatis ke status *Tanpa Folder* (tidak ikut terhapus).

- **FR-6** *(Must Have — v1.0)* — **Lampiran Gambar pada Catatan:**  
  Saat terhubung ke internet (*online*), pengguna dapat mengunggah dan melihat lampiran gambar (**JPEG, PNG, WebP**) di dalam catatan dengan batas maksimal **5 MB per file** dan maksimal **5 gambar per catatan**. Menghapus gambar atau catatan menghapus berkas terkait di object storage. Saat offline, tombol unggah dinonaktifkan dengan penjelasan jelas dan gambar yang belum ter-cache menampilkan penanda offline rapi.

- **FR-7** *(Must Have — v1.0)* — **Multi-Dompet / Akun Keuangan & Integritas Penghapusan (IDR):**  
  Pengguna dapat membuat, mengubah nama/tipe/saldo awal, dan mengarsipkan dompet berdasarkan tipe (**Tunai**, **Bank**, **E-Wallet**) dalam mata uang IDR, serta menandai apakah dompet tersebut ikut dihitung dalam *Safe-to-Spend* (default: **aktif** untuk Tunai & E-Wallet, **nonaktif** untuk Bank). Saldo aktual dompet selalu dihitung secara konsisten dari `saldoAwal + pemasukan - pengeluaran + transferMasuk - transferKeluar`. Dompet yang sudah memiliki riwayat transaksi atau transfer hanya dapat **diarsipkan** (tidak dihapus permanen) agar riwayat laporan tetap utuh; dompet tanpa riwayat dapat dihapus permanen.

- **FR-8** *(Must Have — v1.0)* — **Pencatatan Pemasukan, Pengeluaran & Kategori Custom:**  
  Pengguna dapat mencatat transaksi **Pemasukan** dan **Pengeluaran** dengan nominal IDR bilangan bulat positif (`> 0`), dompet terkait, kategori, tanggal/waktu, dan keterangan opsional. Aplikasi menyediakan kategori bawaan (ID/EN) serta CRUD **kategori custom**. Jika suatu kategori yang sudah pernah dipakai transaksi dihapus pengguna, seluruh transaksi historisnya otomatis dipindahkan ke kategori bawaan `"Lainnya / Other"` agar tidak menjadi data yatim (*orphan*).

- **FR-9** *(Must Have — v1.0)* — **Transfer Antar-Dompet Atomik:**  
  Pengguna dapat memindahkan dana IDR bernilai positif (`> 0`) antara dua dompet miliknya yang berbeda (`sumber ≠ tujuan`) dalam satu operasi atomik. Transfer memengaruhi saldo masing-masing dompet tanpa tercatat sebagai pemasukan maupun pengeluaran di ringkasan arus kas bulanan, dan penghapusan/pengubahan transfer membalikkan kedua sisi secara bersamaan.

- **FR-10** *(Must Have — v1.0)* — **Dashboard Keuangan & Navigasi Terpisah:**  
  Navigasi utama memisahkan ruang kerja **Catatan** dan **Keuangan** secara jelas. Bagian Keuangan menampilkan total saldo (serta rincian per dompet aktif), ringkasan pemasukan vs. pengeluaran pada siklus berjalan, ringkasan per kategori, dan daftar transaksi yang dapat difilter menurut rentang tanggal, dompet, tipe (Pemasukan/Pengeluaran/Transfer), serta kategori.

- **FR-11** *(Must Have — v1.0)* — **Smart Quick Capture (Dual-Intent Notepad Bar):**  
  Tersedia kotak input cepat yang selalu mudah diakses di aplikasi (termasuk pintasan keyboard di desktop). Parser lokal berbasis aturan (*rule-based*, berjalan offline) mendeteksi niat input secara konservatif:
  - Input diklasifikasikan sebagai kandidat **Transaksi** hanya jika mengandung pola nominal yang valid (memiliki satuan/penanda mata uang seperti `rp`, `idr`, `rb`, `ribu`, `k`, `jt`, `juta`, format ribuan `25.000`, atau angka bulat ≥ `1000` di luar pola jam/tanggal seperti `10:00` atau `tgl 15`) sehingga catatan seperti `"bab 3 skripsi"` atau `"meeting jam 10"` tetap terdeteksi sebagai **Catatan**.
  - Default tipe transaksi adalah **Pengeluaran**, dan berubah ke **Pemasukan** jika kata kunci pemasukan terdeteksi (misal `+`, `gaji`, `salary`, `bonus`, `terima`, `masuk`, `refund`, `income`).
  - Parser mencocokkan nama dompet pengguna secara *case-insensitive* (jatuh ke dompet default jika tidak cocok) dan kata kunci kategori bawaan/custom.
  - UI menampilkan kartu pratinjau instan dengan 1 klik simpan serta tombol ubah manual mode (*Catatan* ↔ *Transaksi*) sebelum tersimpan.

- **FR-12** *(Must Have — v1.0)* — **Linked Notes ↔ Transaksi:**  
  Satu **Catatan** dapat ditautkan ke nol atau lebih transaksi **Pemasukan/Pengeluaran** (tidak termasuk Transfer antar-dompet). Dari detail catatan, pengguna dapat menautkan transaksi yang sudah ada atau membuat transaksi baru yang langsung tertaut. Panel catatan menampilkan daftar transaksi tertaut beserta rekap **Total Keluar**, **Total Masuk**, dan **Selisih Bersih (Net)**, sedangkan detail transaksi menampilkan tautan balik ke catatan induk. Jika catatan dihapus, transaksi tertaut **tidak ikut terhapus** dan hanya dilepas tautannya.

- **FR-13** *(Must Have — v1.0)* — **Safe-to-Spend Harian Deterministik:**  
  Aplikasi menghitung batas aman pengeluaran harian dengan rumus pasti:  
  `safeToSpend = max(0, floor(totalSaldoDompetTerpilih / jumlahHariTersisaDalamSiklus))`, di mana `jumlahHariTersisaDalamSiklus` mencakup hari ini hingga 1 hari sebelum tanggal mulai siklus berikutnya (minimal `1` hari). Jika belum ada dompet terpilih atau total saldo ≤ 0, indikator menampilkan `Rp0` dengan pesan informatif tanpa angka negatif yang membingungkan.

- **FR-14** *(Must Have — v1.0)* — **Privacy Blur Mode Sekali Klik:**  
  Header aplikasi menyediakan tombol sekali klik (`Hide Nominal` / ikon mata) yang langsung menyamarkan seluruh angka nominal uang di layar (saldo dompet, total saldo, daftar transaksi, *Safe-to-Spend*, dan total pada *Linked Notes*) menjadi `Rp •••••`, dengan status tersimpan secara persisten di perangkat pengguna.

- **FR-15** *(Must Have — v1.0)* — **Bilingual UI (ID/EN) & Light/Dark Mode:**  
  Pengguna dapat mengganti bahasa tampilan (**Bahasa Indonesia** / **English**) serta tema (**Light** / **Dark**) kapan saja secara instan di landing page maupun aplikasi tanpa kehilangan input yang sedang diketik.

- **FR-16** *(Must Have — v1.0)* — **PWA Installable & Offline-First Sync v1.0:**  
  Aplikasi menyediakan Web App Manifest dan Service Worker agar dapat dipasang sebagai PWA. Data teks (catatan, folder, tag, dompet, kategori, dan transaksi) di-cache ke IndexedDB agar tetap terbaca saat offline. Saat offline, pengguna dapat membuat dan mengedit catatan (teks/GFM checklist) serta mencatat transaksi/transfer baru ke antrean lokal dengan indikator status jelas (*Online/Synced*, *Offline*, *Syncing*, *Sync Error*). Sinkronisasi otomatis berjalan saat aplikasi dibuka, saat fokus kembali dengan koneksi aktif, saat event `online` terpicu, atau lewat tombol *Sync Now* (tidak bergantung pada `Background Sync API` karena keterbatasan iOS Safari), memakai UUID + *idempotency key* serta resolusi konflik *Last-Write-Wins* untuk entitas teks/catatan sementara saldo dompet selalu dihitung ulang dari ledger.

### Kelengkapan Kesiapan Publik v1.0 (*Should Have*)

- **FR-22** *(Should Have — v1.0)* — **Penghapusan Akun Mandiri & Informasi Privasi Publik:**  
  Di halaman Pengaturan Akun, pengguna dapat menghapus akunnya secara permanen dengan konfirmasi password. Penghapusan akun menghapus seluruh data catatan, dompet, transaksi, serta lampiran gambar di object storage secara bersih dan mengeluarkan sesi pengguna. Footer landing page dan halaman pengaturan juga menampilkan ringkasan kebijakan privasi data.

### Peta Jalan Pasca-Launch v1.1 (*Could Have*)

- **FR-17** *(Could Have — v1.1)* — **Anggaran (*Budgeting*) per Kategori:** Penetapan batas anggaran bulanan per kategori pengeluaran dengan indikator persentase pemakaian dan peringatan ambang batas.
- **FR-18** *(Could Have — v1.1)* — **Transaksi Berulang (*Recurring*):** Penjadwalan transaksi rutin (harian/mingguan/bulanan) yang tercatat otomatis atau siap dikonfirmasi saat jatuh tempo.
- **FR-19** *(Could Have — v1.1)* — **Buku Utang-Piutang:** Pencatatan daftar hutang dan piutang per nama pihak beserta tanggal jatuh tempo dan status pelunasan terpisah dari pengeluaran rutin.
- **FR-20** *(Could Have — v1.1)* — **Lampiran PDF pada Catatan:** Memperluas FR-6 agar catatan mendukung dokumen PDF (maks. 5 MB/file) dengan pratinjau atau unduhan aman.
- **FR-21** *(Could Have — v1.1)* — **Export Data Keuangan:** Mengunduh riwayat transaksi dan ringkasan bulanan ke format CSV/Excel maupun PDF.

---

## Non-Functional Requirements

> **Aturan ID Permanen:** Seluruh ID `NFR-*` bersifat permanen dan dirujuk oleh fitur maupun RFC implementasi.

- **NFR-1 — Keamanan, Sesi & Isolasi Data Pengguna:**  
  Setiap endpoint API dan akses object storage wajib memverifikasi sesi autentikasi serta kepemilikan sumber daya (`userId`). Password di-hash menggunakan algoritma modern (*bcrypt/Argon2*), sesi memakai cookie `HttpOnly` + `Secure` + `SameSite` dengan proteksi CSRF, endpoint login dan reset password dilindungi *rate limiting*, token reset password disimpan ter-hash dengan TTL 30 menit, dan seluruh trafik produksi menggunakan HTTPS. Saat pengguna keluar (*Logout*), seluruh data privat pada IndexedDB dan cache Service Worker wajib dibersihkan.

- **NFR-2 — Performa & Anggaran Muat Halaman:**  
  Landing page publik mencapai *Largest Contentful Paint (LCP)* ≤ 2,5 detik pada simulasi 4G, *App Shell* siap berinteraksi ≤ 2,5 detik, eksekusi parser lokal *Smart Quick Capture* selesai ≤ 50 ms di sisi klien, dan latensi API CRUD p95 ≤ 300 ms.

- **NFR-3 — Desain Responsif Lintas Perangkat:**  
  Seluruh halaman dan modal berfungsi rapi tanpa *horizontal overflow* atau elemen terpotong pada Mobile (≥ 360px), Tablet (768px–1024px), dan Desktop (≥ 1280px), dengan navigasi utama dan tombol *Quick Capture* nyaman dijangkau satu tangan di ponsel.

- **NFR-4 — Estetika Visual (`nomu.store` Inspiration) & Konsistensi Tema:**  
  Menggunakan token desain minimalis modern berkonsep kontras tinggi dengan tipografi sans-serif terstruktur, *whitespace* lega, kartu interaktif bersih pada **Light Mode** dan **Dark Mode**, serta mematuhi preferensi sistem `prefers-reduced-motion`. *(Catatan Grounding: Karena referensi `nomu.store` tidak diaudit kode sumber/token pastinya secara langsung, detail palet dan animasi ditetapkan sebagai token desain internal Noka pada tahap aturan/RFC).*

- **NFR-5 — Aksesibilitas (a11y):**  
  Rasio kontras teks memenuhi standar minimum **WCAG 2.1 Level AA** pada Light Mode dan Dark Mode. Seluruh aksi inti dapat dioperasikan lewat keyboard (termasuk pintasan *Quick Capture*), memiliki *focus ring* terlihat jelas, serta atribut ARIA akurat pada tombol ikon seperti *Privacy Blur*, *Pin*, dan pengalih tema/bahasa.

- **NFR-6 — Kompatibilitas Browser & Fallback Penyimpanan:**  
  Berjalan konsisten pada dua versi mayor terbaru Chrome, Safari (termasuk iOS Safari), Firefox, dan Microsoft Edge. Jika browser membatasi Service Worker atau IndexedDB (misal mode privat ketat), aplikasi tetap berjalan normal dalam mode online dengan pemberitahuan non-mengganggu.

- **NFR-7 — Integritas Data Finansial & Migrasi Skema:**  
  Seluruh nominal IDR disimpan sebagai bilangan bulat presisi penuh (integer/bigint, bukan *floating-point*). Saldo dompet diturunkan dari ledger transaksi dan transfer yang dijalankan dalam transaksi database atomik. Seluruh perubahan skema dikelola melalui migrasi terversi yang dapat diulang secara deterministik.

- **NFR-8 — Keandalan Sinkronisasi Offline:**  
  Setiap pembuatan entitas saat offline membawa UUID klien dan *idempotency key* agar pengulangan permintaan tidak menghasilkan duplikasi catatan atau transaksi. Konflik pembaruan catatan dan metadata diselesaikan deterministik dengan *Last-Write-Wins* (`updatedAt`), sementara perhitungan saldo dompet tetap bersumber dari agregasi ledger server saat sinkronisasi selesai.

- **NFR-9 — Higienitas Penyimpanan Berkas:**  
  Validasi unggahan gambar memeriksa tipe MIME dan *magic bytes* (hanya JPEG, PNG, WebP pada v1.0), membatasi ukuran ≤ 5 MB/file dan maks. 5 gambar/catatan, menormalisasi nama berkas, dan menyajikan berkas melalui URL bertanda tangan (*signed/authenticated URL*) yang memverifikasi kepemilikan.

- **NFR-10 — SEO Halaman Publik:**  
  Landing page publik dirender ramah mesin pencari (SSR/SSG) dengan struktur heading semantik (`h1`–`h3`), tag `<title>` dan `<meta description>` dinamis ID/EN, tag Open Graph untuk pratinjau portofolio, serta berkas `robots.txt` dan `sitemap.xml`.

- **NFR-11 — Observabilitas & Pemulihan Error Produksi:**  
  Backend menyediakan endpoint *health check* untuk pemantauan hosting, mencatat log error terstruktur tanpa pernah menuliskan password, token reset, atau isi catatan/nominal sensitif pengguna ke log plaintext, serta menampilkan pesan error ramah pengguna saat layanan pihak ketiga (seperti pengiriman email reset atau unggah storage) mengalami gangguan sementara.

---

## User Journeys

### Perjalanan 1: Pengunjung Portofolio / Pengguna Baru hingga Pemakaian Pertama
1. Pengunjung membuka URL publik Noka dan melihat **Landing Page** minimalis modern dengan animasi halus, mencoba ganti bahasa ID/EN dan Light/Dark Mode.
2. Pengguna menekan **Mulai Gratis / Daftar**, mengisi Nama, Email, dan Password (≥ 8 karakter), lalu langsung masuk ke ruang kerja tanpa terhambat verifikasi email.
3. Panduan ringkas opsional mengajak pengguna menetapkan **tanggal siklus gajian** (misal tanggal 25) dan membuat **dompet awal** (misal Tunai & Bank).

### Perjalanan 2: Catat Cepat dalam ≤ 5 Detik (Online maupun Offline)
1. Saat mengantre membeli kopi atau berada di ruangan tanpa sinyal, pengguna membuka PWA Noka di HP.
2. Pengguna mengetik `"kopi kenangan 24rb gopay"` di bar **Smart Quick Capture** (atau `"bab 3 baca ulang"` untuk catatan biasa).
3. Parser lokal (< 50 ms) menampilkan chip pratinjau akurat; pengguna menekan Simpan (atau mengubah tipe secara manual jika ingin).
4. Bila online, transaksi tersimpan ke server dan *Safe-to-Spend* langsung terbarui; bila offline, item masuk ke antrean sinkronisasi berstatus *"Menunggu sinkronisasi"* dan terkirim otomatis begitu koneksi kembali.

### Perjalanan 3: Rencana di Catatan & Realisasi Biaya (*Linked Notes*)
1. Pengguna membuat catatan *"Perbaikan Motor & Servis"* berisi checklist GFM (`- [ ] Ganti oli`, `- [ ] Cek rem`) dan mengunggah foto nota bengkel saat online.
2. Pengguna menekan **"Tautkan Transaksi"** dan mencatat pengeluaran `Rp285.000` dari dompet Tunai.
3. Catatan merangkum total biaya tertaut (`Total Keluar: Rp285.000`), sementara tab Keuangan menampilkan transaksi dengan tautan balik ke catatan tersebut. Jika nanti catatan dihapus, transaksi keuangan tetap utuh di buku kas.

### Perjalanan 4: Membuka Noka di Tempat Umum (*Privacy Blur*)
1. Di kantor atau kafe, pengguna mengklik tombol **Privacy Blur** di header.
2. Seluruh saldo dompet, *Safe-to-Spend*, dan nominal transaksi tersamarkan menjadi `Rp •••••`, memungkinkan pengguna fokus mengedit catatan tanpa mengumbar data finansial.

### Perjalanan 5: Lupa Password & Keamanan Sesi
1. Pengguna lupa password lalu mengklik **Lupa Password?** dan memasukkan emailnya.
2. Aplikasi menampilkan pesan netral dan mengirim tautan reset bertoken sekali pakai (berlaku 30 menit) jika email terdaftar.
3. Setelah password baru disimpan, tautan kedaluwarsa, sesi lama dicabut, dan pengguna login dengan password barunya.

---

## Success Metrics

| Aspek | Indikator Keberhasilan | Target v1.0 |
|---|---|---|
| **Kecepatan Catat** | Waktu dari fokus ke *Quick Capture* hingga tersimpan | ≤ 5 detik untuk catatan maupun transaksi tunggal |
| **Performa Web & SEO** | Skor Lighthouse pada Landing Page & App (Mobile/Desktop) | Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90 |
| **Keandalan Offline** | Simulasi buat/edit catatan & transaksi offline lalu sinkronisasi ulang | 0 duplikasi transaksi, saldo dompet tetap akurat sesuai ledger, 100% antrean terkirim saat online |
| **Keamanan Isolasi** | Uji akses lintas akun pada API catatan, keuangan, gambar & logout cache wipe | 0 kebocoran data antar pengguna (100% ditolak HTTP 403/404) + IndexedDB bersih setelah logout |
| **Adopsi & Portofolio** | Kesiapan publikasi dan penggunaan nyata sehari-hari | Live di URL publik, dipakai harian oleh kreator tanpa kembali ke Notepad |

---

## Timeline

### Fase 1: v1.0 Launch — Target 1 Minggu (Hari 1–7)

> **Catatan Jalur Kritis (*Critical Path*):** Hari 1–5 merupakan jalur kritis wajib agar produk berfungsi penuh. Jika terjadi kendala infrastruktur pada Hari 3/6, fitur `Should Have` (`FR-22`) dapat diselesaikan pada akhir Hari 7 tanpa menahan fungsionalitas inti.

- **Hari 1 — Fondasi Sistem, Autentikasi & Design Tokens:**  
  Inisialisasi proyek, skema database & migrasi awal, Auth (`FR-2`, `FR-3` dengan email reset + rate limit), *health check* (`NFR-11`), sistem i18n ID/EN (`FR-15`), dan token tema Light/Dark (`NFR-4`).
- **Hari 2 — Landing Page Publik SEO, App Shell & Privacy Blur:**  
  Landing page publik (`FR-1`, `NFR-10`), App Shell responsif dengan navigasi terpisah Catatan vs. Keuangan (`FR-10`, `NFR-3`), serta *Privacy Blur* (`FR-14`).
- **Hari 3 — Modul Catatan & Penyimpanan Gambar:**  
  CRUD catatan dengan Markdown + GFM checklist + auto-save (`FR-4`), Pin/Folder/Tag/Search (`FR-5`), dan unggah lampiran gambar aman online-only (`FR-6`, `NFR-9`).
- **Hari 4 — Modul Keuangan Multi-Dompet & Safe-to-Spend:**  
  Dompet dengan saldo berbasis ledger & aturan arsip (`FR-7`), kategori bawaan + custom (`FR-8`), Transfer atomik (`FR-9`), Dashboard siklus bulanan (`FR-10`), dan *Safe-to-Spend* deterministik (`FR-13`).
- **Hari 5 — Fitur Pembeda & Sinergi Noka:**  
  *Smart Quick Capture* (*rule-based parser* konservatif ID/EN, `FR-11`) dan *Linked Notes ↔ Transaksi* (`FR-12`).
- **Hari 6 — PWA & Offline-First Sync:**  
  Web App Manifest, Service Worker app-shell caching, penyimpanan IndexedDB + pembersihan saat logout, antrean sinkronisasi idempoten berbasis event, dan indikator status sinkronisasi (`FR-16`, `NFR-8`).
- **Hari 7 — Penghapusan Akun, Audit Kualitas & Hosting Publik:**  
  Implementasi hapus akun & ringkasan privasi (`FR-22`), uji integrasi/E2E (isolasi akun, transfer atomik, simulasi offline, parser quick capture), audit Lighthouse (`NFR-2`, `NFR-5`, `NFR-10`), dan deployment produksi.

### Fase 2: v1.1 Post-Launch — Minggu 2+
- Penambahan **Anggaran per Kategori** (`FR-17`), **Transaksi Berulang** (`FR-18`), **Buku Utang-Piutang** (`FR-19`), **Lampiran PDF** (`FR-20`), dan **Export Data CSV/Excel/PDF** (`FR-21`).

---

## Decisions

Keputusan-keputusan berikut mengikat desain produk dan arsitektur; setiap perubahan di masa depan wajib melalui `/manage-changes`:

| ID | Keputusan | Alasan | Alternatif yang Ditolak |
|---|---|---|---|
| **DEC-1** | Nama produk adalah **Noka** dengan tagline *"Seringan Notepad, Serapi Buku Kas."* | Singkat, mudah diingat, menyatukan makna *Note + Kas*, dan menonjolkan nilai kesederhanaan. | *Catatanku* (terlalu panjang), *Saku* (berisiko mirip merek finansial yang sudah ada). |
| **DEC-2** | Navigasi **Catatan** dan **Keuangan** dipisah secara bersih, namun terhubung opsional via *Linked Notes* & *Quick Capture*. | Menjaga fokus masing-masing ruang kerja tanpa membingungkan, sekaligus memberi nilai unik yang menyatukan keduanya. | Satu feed campur aduk, atau dua fitur terputus total tanpa sinergi. |
| **DEC-3** | Cakupan v1.0 dalam **1 minggu** memprioritaskan fitur inti + 4 pembeda + PWA offline dasar, sementara Budgeting, Recurring, Utang-Piutang, PDF, dan Export masuk **v1.1**. | Menjaga kualitas UI/UX, keamanan, dan stabilitas portofolio dalam batas waktu 7 hari yang sangat ketat. | Memaksakan seluruh modul lanjutan masuk minggu pertama dengan kualitas setengah matang. |
| **DEC-4** | *Smart Quick Capture* menggunakan **parser lokal berbasis aturan** (*rule-based*), bukan API LLM eksternal. | Berjalan instan (≤ 50 ms), bebas biaya API untuk portofolio publik, dan tetap bekerja 100% saat mode offline. | Memanggil API AI eksternal (mahal, lambat, dan gagal saat offline). |
| **DEC-5** | Autentikasi menggunakan Email + Password dengan **masuk langsung tanpa verifikasi email wajib**, disertai alur **Lupa Password via email** (token sekali pakai 30 menit). | Mengurangi friksi bagi pengunjung portofolio/pengguna baru sambil tetap menyediakan pemulihan akun aman. | Memblokir akses sebelum verifikasi email, atau menunda fitur reset password. |
| **DEC-6** | Mata uang di v1.0–v1.1 hanya **Rupiah (IDR)** menggunakan integer presisi penuh. | Sesuai dengan fokus pengguna awal di Indonesia dan menghindari kompleksitas kurs valuta asing. | Dukungan multi-currency dan konversi otomatis sejak v1.0. |
| **DEC-7** | Seluruh data bersifat **100% privat per akun** pada v1.0. | Menjaga arsitektur otorisasi tetap sederhana, aman, dan selesai tepat waktu dalam 1 minggu. | Kolaborasi multi-user atau berbagi catatan publik antar-akun. |
| **DEC-8** | Mode offline v1.0 menggunakan **IndexedDB cache + antrean tulis offline + *Last-Write-Wins*** untuk teks/catatan, dipicu oleh event `online`/fokus/manual. | Memberikan pengalaman offline-first andal termasuk di iOS Safari (tanpa bergantung pada `Background Sync API`). | Online-only, CRDT kompleks, atau mengandalkan `SyncManager` yang gagal di iOS Safari. |
| **DEC-9** | Lampiran catatan pada v1.0 dibatasi **gambar saja (JPEG/PNG/WebP), maks. 5 MB/file dan 5 gambar/catatan, serta hanya dapat diunggah saat online**. | Menjaga konsumsi storage tetap terkendali dan menghindari kerumitan antrean unggah blob biner offline di minggu pertama. | Unggahan file bebas ukuran/format atau antrean blob 5 MB offline di v1.0. |
| **DEC-10** | UI dan Landing Page mendukung **Bilingual (ID/EN)** serta **Light & Dark Mode** berinspirasi desain `nomu.store`. | Meningkatkan daya tarik untuk target lokal maupun penilai portofolio internasional, serta kenyamanan siang/malam. | Aplikasi satu bahasa saja atau tanpa Dark Mode. |
| **DEC-11** | **Saldo dompet diturunkan dari `saldoAwal` + ledger transaksi & transfer**, bukan kolom saldo bebas yang ditimpa *Last-Write-Wins*. | Mencegah saldo dompet korup atau selisih saat dua perangkat mencatat transaksi secara offline lalu melakukan sinkronisasi. | Menimpa kolom saldo akhir dompet langsung dengan LWW dari klien. |
| **DEC-12** | **Safe-to-Spend** menggunakan rumus pasti `max(0, floor(totalSaldoDompetTerpilih / sisaHariSiklusInklusif))`, default aktif hanya pada Tunai & E-Wallet. | Menghilangkan ambiguitas perhitungan dan mencegah dana tabungan di Bank ikut terhitung sebagai jatah jajan harian. | Menggabungkan seluruh saldo Bank secara paksa atau menampilkan rumus ganda yang ambigu. |
| **DEC-13** | Kebijakan **integritas referensial**: dompet bertransaksi diarsipkan (bukan dihapus), kategori terhapus memindahkan transaksi ke *Lainnya*, folder terhapus memindahkan catatan ke akar, dan catatan terhapus melepas tautan transaksi tanpa menghapus transaksi. | Menjaga keakuratan buku kas historis dan mencegah hilangnya data keuangan atau catatan secara tidak sengaja. | Penghapusan berantai (*cascade delete*) yang diam-diam menghapus transaksi atau catatan. |
| **DEC-14** | Checklist interaktif catatan disimpan sebagai **sintaks GFM task-list (`- [ ]` / `- [x]`) di dalam Markdown**, dan *Linked Notes* berelasi **1 Catatan → banyak Transaksi (non-transfer)**. | Menyederhanakan model data dan sinkronisasi offline sambil mendukung ekspor/portabilitas Markdown yang bersih. | Skema blok terpisah ala Notion atau relasi *many-to-many* yang rumit di v1.0. |
| **DEC-15** | Parser *Smart Quick Capture* menerapkan aturan **deteksi angka konservatif** (wajib penanda nominal/satuan atau bilangan ≥ 1000 di luar pola jam/tanggal). | Mencegah catatan biasa seperti `"bab 3"` atau `"meeting jam 10"` salah diklasifikasikan sebagai pengeluaran Rp3 atau Rp10. | Memperlakukan semua angka di kalimat sebagai nominal transaksi. |
| **DEC-16** | Logout wajib **membersihkan seluruh data privat di IndexedDB dan cache Service Worker**. | Melindungi privasi pengguna yang membuka Noka di perangkat bersama atau komputer kantor. | Membiarkan cache data offline tetap tertinggal di browser setelah pengguna logout. |

---

## Open Questions & Assumptions

1. **Pemilihan Tech Stack, Layanan Email & Object Storage Hosting:**  
   Stack implementasi konkret (misalnya Next.js full-stack + PostgreSQL/SQLite + S3/R2/Supabase Storage + Resend/SMTP untuk reset password) belum dikunci agar tetap fleksibel untuk dievaluasi pada tahap penyusunan aturan teknis (`RULES.md`) dan arsitektur (`RFCs`).
2. **Verifikasi Visual Referensi `nomu.store`:**  
   Desain `nomu.store` dalam dokumen ini mengacu pada ringkasan gaya visual (minimalis, kontras tinggi, tipografi sans-serif, kartu interaktif), bukan hasil inspeksi token warna/font langsung di browser. Pada tahap implementasi UI/Landing Page, seluruh token warna dan rasio kontras tetap mengikuti standar aksesibilitas internal Noka (`NFR-4`, `NFR-5`).
3. **Kamus Kategori Bawaan & Sinonim Parser Lokal:**  
   Daftar lengkap kategori awal (misal Makanan & Minuman, Transportasi, Belanja, Tagihan, Hiburan, Gaji, Bonus, Lainnya) beserta daftar sinonim kata kunci ID/EN untuk parser *Smart Quick Capture* (`FR-11`) akan dispesifikasikan secara rinci pada RFC fitur terkait.
4. **Batas Kuota Hosting Gratis / Portofolio:**  
   Diasumsikan hosting awal memakai tier gratis/berbiaya rendah sehingga batas lampiran (5 MB/file, 5 gambar/catatan) dan jumlah pengiriman email reset password harian (*rate limit*) disesuaikan agar tidak melampaui kuota penyedia layanan.

