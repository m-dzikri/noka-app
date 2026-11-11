# Change Request 002: Palet Hangat Off-White/Off-Black + `#ff7448`, Floating Pill Header, Hero Grid Memudar & Layout Desktop Seimbang

- **Tanggal:** 2026-11-12
- **Status:** Approved & Integrated (`PRD.md`, `FEATURES.md`, `RULES.md`, `PRD-REVIEW.md`, `RFC-001`, `RFC-003`–`RFC-010`, `TEST-STRATEGY.md`, kode & suite uji)
- **Lingkup:** Sistem Token Desain Global (`tokens.css`, `globals.css`, aset brand), Header Floating Pill (`LandingHeader`, `AppShell`, `AuthLayout`), Landing Page (`LandingContent`, `FeaturePreviewCard`, `LandingFooter`), serta konsistensi layout workspace mendatang (`RFC-004`–`RFC-010`)

---

## Ringkasan Evaluasi (*Executive Summary*)

Pengguna menetapkan penyempurnaan sistem desain Noka sebelum implementasi `RFC-004`–`RFC-010` dimulai:
1. **Palet Tiga Warna Utama Tanpa Putih/Hitam Murni:** Menggunakan kanvas `#ededed`, tinta/permukaan gelap `#222222`, dan aksen oranye-koral `#ff7448`, tanpa warna `#ffffff` atau `#000000` murni di Light maupun Dark Mode (menggunakan *off-white* `#f7f7f6`/`#f0f0ee` dan *off-black* `#161616`/`#1a1a1a`), sekaligus memenuhi rasio kontras **WCAG 2.1 Level AA** (`UI-2`).
2. **Floating Pill Header Global & Menu Mobile Vertikal 1-Per-Baris:** Menerapkan header mengambang berbentuk pil penuh (`rounded-full`) pada seluruh grup rute (`LandingHeader`, `AppShell`, dan `AuthLayout`). Pada mobile (`LandingHeader` & `AppShell`), bilah atas tetap satu baris dengan tombol hamburger yang membuka panel menu mengambang dengan **seluruh item tersusun vertikal satu per baris ke bawah**. Khusus halaman autentikasi `(auth)` (`/login`, `/register`, `/forgot-password`, `/reset-password`), header mobile tetap satu baris langsung **tanpa menu hamburger**.
3. **Hero Penuh Satu Layar + Terpusat + Grid Kotak-Kotak Memudar Setelah Layar Pertama:** Hero Landing Page diposisikan terpusat (*center-aligned*) memenuhi tinggi penuh satu layar awal (`min-h-[calc(100dvh-4rem)] sm:min-h-[calc(100dvh-4.25rem)]`) baik di desktop maupun mobile sehingga bagian *Pratinjau Interaktif* baru muncul setelah satu layar penuh, di atas lapisan grid kotak-kotak CSS (`h-[135dvh]`) yang tetap jelas sepanjang layar pertama lalu memudar ke `--bg-canvas` setelah melewati satu layar penuh (`mask-image: linear-gradient(...)`, nol JavaScript scroll listener).
4. **Lebar Kontainer Desktop Seimbang & Bebas Nama Merek Pihak Ketiga:** Melebarkan kontainer utama desktop ke `max-w-[1360px]` dengan keseimbangan hierarki tipografi, ukuran font, kartu pratinjau lebar, dan komposisi fitur 2+3 kolom agar margin kanan-kiri tidak terasa kosong; serta menghapus seluruh penyebutan nama merek pihak ketiga dari seluruh artefak proyek.

---

## 1. Change Classification

| Butir | Kategori | Ukuran | Prioritas |
|---|---|---|---|
| **CR-002.A — Palet `#ededed` / `#222222` / `#ff7448` Tanpa `#ffffff`/`#000000` & Penghapusan Nama Merek Luar** | Technical & Visual Design Refinement (`F1`, `F2`) | Medium | Must have |
| **CR-002.B — Floating Pill Header Global, Drawer Mobile 1-Per-Baris & Auth Header Tanpa Hamburger** | Feature Modification (`F1`, `F3`) | Medium | Must have *(responsive UX)* |
| **CR-002.C — Hero Terpusat, Grid Kotak-Kotak CSS Memudar & Kontainer Desktop Seimbang (`max-w-[1360px]`)** | Feature Modification (`F1`, `F3`) | Medium | Must have |

---

## 2. Impact Analysis

### A. Conflict Check (`RULES.md`, `PRD.md`, `PRD-REVIEW.md`, `CHANGE-REQUEST-001.md`)
- **`UI-1` & `NFR-4` (Estetika Visual Minimalis Modern):** Menghapus seluruh penyebutan nama merek eksternal pada `PRD.md`, `FEATURES.md`, `RULES.md`, dan `PRD-REVIEW.md` serta menguncinya pada sistem desain internal Noka sendiri (*palet hangat `#ededed` / `#222222` / `#ff7448` tanpa putih/hitam murni, floating pill header, grid fade, dan whitespace seimbang*).
- **`UI-2` (WCAG 2.1 Level AA Contrast):**
  - *Temuan Konflik Awal yang Dimigasi:* Teks `#ffffff` di atas tombol `#ff7448` hanya menghasilkan kontras **2.68:1** (gagal WCAG AA `4.5:1`), dan teks `#ff7448` di atas `#ededed` hanya **2.29:1**. Begitu pula `--border-default` lama (`#7c8b9e`) di atas `#ededed` turun menjadi **2.97:1** (< `3.0:1`).
  - *Solusi Desain Sesuai Aturan:*
    - Tombol aksen `--accent-primary: #ff7448` (`hover: #e66238`) memakai `--accent-foreground: #222222` di Light Mode (**5.94:1** normal, **4.67:1** hover) dan `#1a1a1a` di Dark Mode (**6.50:1**).
    - Teks sorotan oranye pada permukaan terang memakai token baru `--accent-text: #c23d15` (**4.52:1** di `#ededed`, **4.93:1** di `#f7f7f6`, **4.63:1** di `#f0f0ee`), sedangkan di Dark Mode memakai `#ff7448` langsung (**6.76:1** di `#161616`, **5.94:1** di `#222222`).
    - Border interaktif memakai `--border-default: #767676` (Light: **3.88:1** di `#ededed`, **4.24:1** di `#f7f7f6`) dan `#6e6e6e` (Dark: **3.55:1** di `#161616`, **3.12:1** di `#222222`), dilengkapi `--border-subtle` (`#d6d6d4` Light / `#333333` Dark) untuk pembatas dekoratif halus.
    - Status keuangan: Light Mode `--status-income: #147538` (**4.94:1** di `#ededed`), `--status-expense` / `--danger-bg: #b42318` dengan `--danger-fg: #f7f7f6` (**6.13:1**); Dark Mode `--status-income: #4ade80`, `--status-expense: #f87171`, `--danger-bg: #dc2626` dengan `--danger-fg: #f7f7f6` (**4.51:1**).
- **`UI-3`, `UI-5`, `I18N-1`, `I18N-2`:**
  - Header floating pill mempertahankan tinggi tertutup `<= 72px`, target sentuh `>= 40×40 px`, bebas *horizontal overflow* di `360px`/`375px`/`768px`/`1280px`, dan mempertahankan state komponen saat ganti `ID/EN` atau `Light/Dark`.
  - Menu mobile pada `LandingHeader` dan `AppShell` memakai tata letak vertikal 1 kontrol per baris penuh (`flex-col`), menggunakan kunci kamus terketik (`nav.languageLabel`, `nav.themeLabel`) agar tidak ada teks *hardcoded*, sambil menjaga `<ThemeToggle />` sendiri tetap tombol ikon-saja tanpa teks di dalam `<button>` (`CHANGE-REQUEST-001`).
  - `AuthLayout` tetap menggunakan floating pill 1 baris di mobile **tanpa hamburger** (cukup untuk Logo + `LocaleToggle` + `ThemeToggle` pada lebar `360px`).
- **`PERF-1`, `PERF-4`:** Grid latar hero memakai CSS `background-image` + `mask-image` statis murni tanpa JavaScript scroll listener dan tanpa ketergantungan gambar eksternal, sehingga menjaga skor Lighthouse (`Performance >= 90`, `LCP <= 2,5s`) dan menghormati `prefers-reduced-motion`.
- **Keputusan `DEC-1`–`DEC-16` & Lingkup `F20`–`F31`:** Tidak ada keputusan arsitektur/produk yang diubah dan tidak ada fitur v1.1/out-of-scope yang masuk.

### B. Komponen, Fitur & RFC Terdampak
- **Fitur:** `F1` (Landing Page), `F2` (Bilingual & Theme Tokens), `F3` (AppShell & Responsive Navigation), serta keselarasan visual `F4`–`F19`.
- **RFC Terdampak:**
  - `RFC-001` (`tokens.css`, `globals.css`, `Button`, `Card`, `Input`, `Modal`, `MobileMenuButton`, `AppShell`, `WorkspaceNav`, `AppOverview`, `i18n/{types,id,en}.ts`).
  - `RFC-002` (`AuthLayout` floating pill tanpa hamburger di mobile, komponen auth card/footer subtle divider).
  - `RFC-003` (`LandingHeader`, `LandingContent`, `FeaturePreviewCard`, `LandingFooter`, `icon.svg`, `opengraph-image.tsx`, `tests/e2e/landing-seo.spec.ts`).
  - `RFC-004`–`RFC-010` *(belum diimplementasikan; mewarisi lebar shell `max-w-[1360px]`, token `#ff7448`/`#ededed`/`#222222`, radius `rounded-2xl`/`rounded-full`, dan tombol pil konsisten)*.

---

## 3. Implementation Strategy

- **Jadwal Eksekusi:** Diterapkan pada branch fitur terpisah `feat/design-warm-pill-shell` dari `main`, menyelaraskan seluruh artefak dokumen terlebih dahulu lalu memperbarui kode `RFC-001`–`RFC-003` dan suite uji sebelum melanjutkan implementasi `RFC-004`.
- **Strategi Pengujian (`TEST-STRATEGY.md`):**
  - Unit (`Vitest`): Memverifikasi `shell-layout.test.tsx` untuk tata letak menu mobile 1-item-per-baris pada `AppShell` dan `LandingHeader`, tetap mempertahankan `ThemeToggle` ikon-saja, dan memverifikasi kontras/token serta `preferences-i18n.test.tsx`.
  - E2E (`Playwright`): Memverifikasi `tests/e2e/landing-seo.spec.ts` termasuk keberadaan grid hero memudar, komposisi kartu fitur, tinggi header floating pill tertutup `<= 72px`, kontrol drawer mobile 1-item-per-baris dengan target sentuh `>= 40×40 px`, serta `0` overflow di `360px`/`375×812`/`768px`/`1280×800`.

---

## 4. Documentation Updates

Seluruh artefak diperbarui bersama dalam change request ini:
- `PRD.md` — Menghapus nama merek eksternal dan menyelaraskan deskripsi visual `Overview`, `FR-1`, `NFR-4`, `DEC-10`, dan *Open Questions #2* ke sistem desain internal Noka (`#ededed` / `#222222` / `#ff7448`, floating pill header, grid hero memudar, layout lebar seimbang).
- `FEATURES.md` — Menghapus nama merek eksternal dan memperbarui kriteria penerimaan `F1`–`F3`.
- `RULES.md` — Menghapus nama merek eksternal pada `UI-1` serta mendokumentasikan aturan palet tanpa `#ffffff`/`#000000` murni, floating pill header, menu mobile 1-per-baris, auth header tanpa hamburger, dan lebar `max-w-[1360px]`.
- `PRD-REVIEW.md` — Menetralkan nama merek eksternal pada catatan review historis.
- `RFCs/RFC-001-Foundation-Schema-And-Shell.md` & `RFCs/RFC-003-Public-Landing-Page-And-SEO.md` — Menambahkan spesifikasi implementasi token baru, floating pill header, grid CSS memudar, layout 2+3 kartu, dan menu mobile vertikal.
- `RFCs/RFC-004`–`RFC-010` — Menambahkan catatan konsistensi sistem visual & lebar workspace `max-w-[1360px]`.
- `TEST-STRATEGY.md` — Memperbarui `TS-001-07`, `TS-003-01`, dan `TS-003-02` sesuai pembaruan header pil, drawer 1-per-baris, dan layout baru.

---

## 5. Stakeholder Impact

- **Implementasi `RFC-004`–`RFC-010`:** Seluruh halaman dan modal berikutnya otomatis mewarisi kontainer `max-w-[1360px]`, palet `#ededed`/`#222222`/`#ff7448` (off-white/off-black), border subtil vs border interaktif WCAG AA, dan tombol CTA pill. Ruang ekstra di desktop membuat *split-view* `NotesWorkspace` (`RFC-004`), panel *Linked Transactions* (`RFC-008`), dan *Finance Dashboard* (`RFC-007`) lebih lega tanpa menumpuk.

---

## 6. Risk Assessment & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Aksen `#ff7448` melanggar WCAG 2.1 AA bila dipasangkan dengan teks putih `#ffffff` atau di latar terang | Tinggi (`UI-2`, Lighthouse A11y) | Memakai `--accent-foreground: #222222` (`5.94:1`) pada tombol `#ff7448` dan `--accent-text: #c23d15` (`4.52:1`–`4.93:1`) untuk teks sorotan di Light Mode. |
| Header floating pill melebihi batas tinggi `72px` pada mobile (`360px`) | Sedang (`TS-003-01`/`02`) | Membungkus pill dengan padding atas ringkas (`pt-2.5 pb-0`) dan tinggi pil `min-h-[54px]` sehingga tinggi total `<header>` tertutup tetap `<= 68px`. |
| Penambahan kontrol di header desktop `768px` (tablet) menyempitkan floating pill | Sedang (`UI-3`) | Tautan jangkar landing (`#preview`, `#features`) hanya muncul pada `lg:flex` (`>= 1024px`), dan `UserBadge` `AppShell` pada `lg:inline-flex` agar `768px` tetap lega. |

