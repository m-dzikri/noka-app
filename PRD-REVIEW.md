# PRD Review Report: Noka

> **Dokumen yang Direview:** `PRD.md` (v1.0)  
> **Hasil Perbaikan:** `PRD.v2.md` (v2.0 — disimpan terpisah karena proyek belum menggunakan version control Git)  
> **Tanggal Review:** 11 November 2026

---

## 1. Overall Assessment

Secara fondasi, `PRD.md` (v1.0) sudah sangat baik dalam mendefinisikan visi produk **Noka**, memisahkan ruang kerja Catatan dan Keuangan secara bersih namun terhubung, serta mengambil keputusan penting untuk memangkas fitur sekunder ke **v1.1** demi menjaga target rilis **1 minggu**. Namun, dokumen awal masih menyimpan **4 celah berdampak tinggi (*High Impact*)** yang berpotensi merusak integritas saldo saat sinkronisasi offline, menimbulkan ambiguitas rumus *Safe-to-Spend*, membiarkan skenario penghapusan data berisiko *orphan/cascade loss*, serta mengandalkan asumsi PWA yang tidak kompatibel di iOS Safari. Perbaikan telah dituangkan ke `PRD.v2.md` tanpa mengubah atau menomori ulang ID yang sudah ada (`FR-1`–`FR-21`, `NFR-1`–`NFR-10`).

---

## 2. Step 0: Grounding in Reality & Unverified Claims

1. **Referensi Desain `https://nomu.store/` (Belum Terverifikasi Langsung):**  
   `PRD.md` merujuk gaya visual `nomu.store` (minimalis, kontras tinggi, tipografi sans-serif tegas, kartu interaktif, animasi halus) berdasarkan ringkasan web sekunder, bukan inspeksi langsung *live DOM/CSS* di browser. Di `PRD.v2.md`, posisi ini dicatat jujur sebagai **inspirasi visual** yang tunduk pada token internal Noka (`NFR-4`) dan standar kontras WCAG 2.1 AA (`NFR-5`).
2. **Realitas Browser untuk Offline Sync (iOS Safari):**  
   `PRD.md` tidak menyebut pemicu sinkronisasi offline. Pada kenyataannya, **iOS Safari tidak mendukung `Background Sync API` (`SyncManager`)**, sehingga sinkronisasi offline pada web app lintas perangkat wajib bertumpu pada event `online`, fokus/pembukaan aplikasi, dan tombol sinkronisasi manual (`FR-16`, `DEC-8`).
3. **Tech Stack & Layanan Infrastruktur Belum Terkunci:**  
   `Open Question #1` masih menyebut contoh stack (*Next.js / PostgreSQL / SQLite / S3 / R2 / Resend*) yang belum teruji maupun terkunci. Keputusan stack akhir wajib ditetapkan pada tahap `RULES.md` (`/generate-rules`) agar selaras dengan batas target 7 hari dan hosting gratis/portofolio.
4. **Status Version Control & Pemeriksaan Otomatis (`trace-check.py`):**  
   - Direktori kerja belum berada di bawah Git (`.git` tidak ditemukan), sehingga versi perbaikan disimpan sebagai `PRD.v2.md` agar `PRD.md` asli tidak tertimpa tanpa jejak perbandingan.  
   - Inspeksi manual terhadap skrip `.agents/skills/verify-prd/scripts/trace-check.py` menemukan bahwa heading `## 2. Product Type` pada `PRD.md` v1.0 tidak cocok dengan pemeriksaan substring `"## Product Type"` pada skrip tersebut (akan memicu peringatan palsu). Hal ini sudah diperbaiki menjadi `## Product Type` pada `PRD.v2.md`.  
   - Eksekusi langsung `trace-check.py` tidak dapat dijalankan di mesin ini karena runtime Python belum terpasang.

---

## 3. Quality Assessment (Terhadap `PRD.md` v1.0)

| Kriteria | Skor (1–10) | Alasan Penilaian |
|---|---:|---|
| **Completeness** | **7.0 / 10** | Seluruh bagian wajib PRD, klasifikasi tipe produk, ID permanen, persona, dan timeline sudah ada. Nilai berkurang karena belum mencakup aturan penghapusan dompet/kategori/folder/catatan, kebijakan keamanan cache offline saat logout, detail token reset password, serta fitur hapus akun publik. |
| **Clarity** | **7.5 / 10** | Struktur dan bahasa sangat mudah dipahami, namun terdapat frasa ambigu di *Safe-to-Spend* (`"atau sisa siklus berjalan"`), format penyimpanan checklist (`FR-4`), ambiguitas deteksi angka di *Quick Capture* (`FR-11`), dan belum ada label MoSCoW eksplisit di tiap `FR-*`. |
| **Feasibility** | **6.5 / 10** | Pemangkasan v1.1 (`DEC-3`) sangat membantu, tetapi target 1 minggu masih berisiko meleset bila upload gambar diizinkan saat offline, saldo dompet disimpan bebas tanpa derivasi ledger, dan jalur kritis Hari 1–7 tidak dipisahkan dari fitur *Should Have*. |
| **User-Focus** | **8.5 / 10** | Sangat berakar pada masalah nyata mahasiswa dan pekerja kantoran (catatan cepat, privasi di tempat umum, bebas gerbang verifikasi email yang menghambat uji coba portofolio, serta bilingual ID/EN). |

---

## 4. Summary of Findings (Celah, Kontradiksi & Risiko)

### Dampak Tinggi (*High Impact*)

- **[HIGH-1] Risiko Kerusakan Saldo Dompet Saat Offline Sync (`FR-7`, `FR-9`, `FR-16`, `NFR-7`, `NFR-8`)**  
  *Temuan:* `PRD.md` menetapkan *Last-Write-Wins (LWW)* untuk sinkronisasi offline sambil menyebut saldo dompet selalu aktual. Jika klien dan server menyinkronkan kolom saldo secara LWW saat dua perangkat mencatat transaksi secara offline, nilai saldo dompet akan saling menimpa dan menjadi tidak akurat. Selain itu, tidak dijelaskan mekanisme pemicu sinkronisasi yang aman untuk iOS Safari.  
  *Tindakan di `PRD.v2.md`:* Mengunci arsitektur saldo dompet sebagai nilai **terturunkan dari `saldoAwal` + ledger transaksi & transfer** (`FR-7`, `DEC-11`), melarang unggah gambar saat offline (`FR-6`, `DEC-9`), serta menetapkan pemicu sinkronisasi berbasis event `online`/fokus/manual (`FR-16`, `DEC-8`).

- **[HIGH-2] Ambiguitas Rumus & Kasus Tepi *Safe-to-Spend* (`FR-13`, `Open Question #2`)**  
  *Temuan:* `FR-13` menyebut `"total dana aktif pada dompet yang disertakan ... (atau sisa siklus berjalan) dibagi jumlah hari tersisa"`, sehingga menimbulkan dua interpretasi berbeda, belum menangani saldo nol/negatif, pembulatan rupiah, maupun bulan pendek (tgl 29–31).  
  *Tindakan di `PRD.v2.md`:* Menghapus frasa `"atau sisa siklus berjalan"`, mengunci rumus tunggal `max(0, floor(totalSaldoDompetTerpilih / jumlahHariTersisaDalamSiklus))`, menetapkan default dompet terpilih (Tunai & E-Wallet aktif, Bank nonaktif secara default), serta aturan penyesuaian tanggal siklus di bulan pendek (`FR-2`, `FR-13`, `DEC-12`).

- **[HIGH-3] Aturan Penghapusan & Integritas Referensial Belum Didefinisikan (`FR-5`, `FR-7`, `FR-8`, `FR-9`, `FR-12`)**  
  *Temuan:* `PRD.md` belum mengatur apa yang terjadi ketika pengguna menghapus dompet yang sudah berisi transaksi, menghapus kategori yang sudah dipakai, menghapus folder berisi catatan, menghapus catatan yang tertaut transaksi, atau mentransfer dari dompet ke dompet yang sama.  
  *Tindakan di `PRD.v2.md`:* Menetapkan aturan integritas referensial penuh (`FR-5`, `FR-7`, `FR-8`, `FR-9`, `FR-12`, `DEC-13`): arsip wajib bagi dompet bertransaksi, pengalihan transaksi ke `"Lainnya/Other"` saat kategori dihapus, pemindahan catatan ke akar saat folder dihapus, pelepasan tautan tanpa menghapus transaksi saat catatan dihapus, dan validasi `sumber ≠ tujuan` serta `nominal > 0` pada transfer.

- **[HIGH-4] Celah Keamanan Offline di Perangkat Bersama, Kebijakan Password & Kesiapan Publik (`FR-2`, `FR-3`, `NFR-1`, `Open Question #4`)**  
  *Temuan:* Belum ada aturan panjang password minimum, masa berlaku token reset password, pembersihan cache IndexedDB saat logout, maupun mekanisme hapus akun permanen ketika aplikasi di-hosting untuk publik.  
  *Tindakan di `PRD.v2.md`:* Menetapkan minimal 8 karakter password (`FR-2`), token reset sekali pakai ber-TTL 30 menit yang mencabut sesi lama (`FR-3`), pembersihan total IndexedDB & cache Service Worker saat logout (`FR-2`, `NFR-1`, `DEC-16`), serta menambah `FR-22` (*Penghapusan Akun Mandiri & Informasi Privasi Publik*).

### Dampak Sedang (*Medium Impact*)

- **[MED-1] Potensi Salah Deteksi Angka pada *Smart Quick Capture* (`FR-11`)**  
  *Temuan:* Catatan biasa yang mengandung angka seperti `"bab 3 skripsi"` atau `"meeting jam 10"` berisiko salah diklasifikasikan sebagai transaksi nominal kecil, serta belum jelas deteksi default Pemasukan vs. Pengeluaran dan dompet fallback.  
  *Tindakan di `PRD.v2.md`:* Menetapkan aturan parser konservatif (wajib penanda nominal/satuan atau bilangan ≥ 1000 di luar pola jam/tanggal), default Pengeluaran kecuali kata kunci pemasukan cocok, dan fallback ke dompet default pengguna (`FR-11`, `DEC-15`).

- **[MED-2] Format Checklist Catatan, *Auto-Save*, & Kardinalitas *Linked Notes* (`FR-4`, `FR-12`)**  
  *Temuan:* Belum pasti apakah checklist disimpan terpisah dari Markdown dan apakah relasi *Linked Notes* mendukung *many-to-many* atau *one-to-many*, serta bagaimana perlakuan Transfer di dalamnya.  
  *Tindakan di `PRD.v2.md`:* Mengunci checklist sebagai sintaks GFM task-list (`- [ ]` / `- [x]`) dalam Markdown dengan *debounced auto-save* (`FR-4`, `DEC-14`), serta relasi 1 Catatan → banyak Transaksi non-transfer dengan tampilan Total Keluar, Total Masuk, dan Net (`FR-12`, `DEC-14`).

- **[MED-3] Kelayakan Jalur Kritis 1 Minggu & Prioritas MoSCoW (`Section 6`, `Section 10`)**  
  *Temuan:* `FR-1`–`FR-16` belum memiliki label MoSCoW untuk membedakan jalur kritis 7 hari dan kelengkapan yang dapat diprioritaskan paling akhir.  
  *Tindakan di `PRD.v2.md`:* Memberi tag MoSCoW eksplisit pada seluruh `FR-1`–`FR-22` (*16 Must Have v1.0, 1 Should Have v1.0, 5 Could Have v1.1*) dan menandai Hari 1–5 sebagai jalur kritis (`Section 10`).

### Dampak Rendah (*Low Impact*)

- **[LOW-1] Ketidaksesuaian Heading `## Product Type` dengan Skrip `trace-check.py`**  
  *Temuan:* Heading `## 2. Product Type` pada `PRD.md` tidak terdeteksi oleh pemeriksaan literal `"## Product Type"` di `trace-check.py`.  
  *Tindakan di `PRD.v2.md`:* Mengubah seluruh heading H2 menjadi format bersih tanpa nomor, termasuk `## Product Type`.

- **[LOW-2] Ketiadaan Standar Observabilitas & *Health Check* Produksi**  
  *Temuan:* Sebagai portofolio yang di-hosting publik dengan fitur email reset dan storage gambar, belum ada standar *health check* dan logging aman bebas kebocoran data sensitif.  
  *Tindakan di `PRD.v2.md`:* Menambahkan `NFR-11` (*Observabilitas & Pemulihan Error Produksi*).

---

## 5. Specific Recommendations & Before/After Examples

1. **Kunci Kontrak Data Sebelum Coding (Hari 1):**  
   Pastikan `RULES.md` dan `RFC-1` menetapkan model ledger transaksi (`amount > 0` integer, `walletId`, `optional noteId`, `transferId`) sehingga perhitungan saldo dompet dan *Safe-to-Spend* tidak pernah menyimpang saat mode offline aktif.
2. **Contoh Klarifikasi Persyaratan Ambigu:**
   - *Sebelum (`FR-13`):* *"menghitung indikator batas aman pengeluaran harian berdasarkan total dana aktif pada dompet yang disertakan dalam perhitungan (atau sisa siklus berjalan) dibagi jumlah hari tersisa..."*  
   - *Sesudah (`PRD.v2.md` `FR-13`):* *"menghitung dengan rumus pasti `safeToSpend = max(0, floor(totalSaldoDompetTerpilih / jumlahHariTersisaDalamSiklus))`, mencakup hari ini hingga 1 hari sebelum siklus berikutnya (min. 1 hari), default aktif pada Tunai & E-Wallet."*
   - *Sebelum (`FR-11`):* *"mendeteksi apakah input mengandung pola transaksi (nominal `rb`/`k`/`jt`/angka...)"*  
   - *Sesudah (`PRD.v2.md` `FR-11`):* *"hanya diklasifikasikan sebagai kandidat Transaksi jika memiliki penanda mata uang/satuan (`rp`, `idr`, `rb`, `ribu`, `k`, `jt`, `juta`, `25.000`) atau bilangan bulat ≥ `1000` di luar pola jam/tanggal (`10:00`, `tgl 15`) sehingga `'bab 3 skripsi'` tetap terdeteksi sebagai Catatan."*
3. **Kesiapan Langkah Berikutnya:**  
   - Promosikan `PRD.v2.md` menjadi `PRD.md` (disarankan menginisialisasi `git init` terlebih dahulu agar riwayat perubahan tercatat).  
   - Lanjutkan ke `/extract-features` untuk menghasilkan `FEATURES.md`, pastikan seluruh temuan `[HIGH-1]` s.d. `[HIGH-4]` tetap terlacak pada kriteria penerimaan fitur dan RFC terkait.

