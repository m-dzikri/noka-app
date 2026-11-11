# Change Request 001: Icon-Only `ThemeToggle` & Single-Row Collapsible Mobile Header

- **Tanggal:** 2026-11-12
- **Status:** Approved & Integrated (`RFC-001`, `RFC-003`, `TEST-STRATEGY.md`, kode & suite uji)
- **Lingkup:** Global UI (`ThemeToggle`) dan header responsif pada Landing Page (`LandingHeader`) serta Workspace `/app` (`AppShell`)

---

## Ringkasan Evaluasi (*Executive Summary*)

Permintaan pengguna mengubah dua aspek antarmuka di seluruh aplikasi:
1. **`ThemeToggle` fokus ikon saja (`Sun`/`Moon`):** Menghapus label teks tampak (`Terang`/`Gelap`/`Light`/`Dark`) dari tombol pengalih tema di seluruh aplikasi (`LandingHeader`, `(auth)`, dan `AppShell`), sambil mempertahankan aksesibilitas lengkap (`aria-pressed`, terlokalisasi `aria-label` & `title`, serta area sentuh `>= 40×40 px`).
2. **Header mobile satu baris dengan menu hamburger (`LandingHeader` & `AppShell`):** Menghilangkan pembungkusan multi-baris (*downward wrap*) pada layar sempit sehingga bilah atas mobile tampil sebagai **satu baris ringkas** berisi Logo **Noka** (plus slot status singkat workspace pada `AppShell`) dan tombol hamburger (`Menu`/`X`), sedangkan kontrol sekunder (`LocaleToggle`, `ThemeToggle`, CTA auth / lencana user & tombol keluar) diletakkan rapi di panel menu mobile yang dapat dibuka-tutup.

Kedua perubahan disetujui dan langsung diintegrasikan pada sprint berjalan (`feat/rfc-003-public-landing-seo`) karena tidak bertentangan dengan satu pun aturan `RULES.md` maupun keputusan arsitektur `PRD.md` (`DEC-1`–`DEC-16`).

---

## 1. Change Classification

| Butir | Kategori | Ukuran | Prioritas |
|---|---|---|---|
| **CR-001.A — Icon-Only `ThemeToggle` Global** | Feature Modification (`F2`) | Small | Should have |
| **CR-001.B — Single-Row Collapsible Mobile Header** | Feature Modification (`F1`, `F3`) | Small–Medium | Must have *(mobile UX)* |

---

## 2. Impact Analysis

### A. Conflict Check (`RULES.md`, `PRD.md`, `PRD-REVIEW.md`)
- **`UI-1`, `UI-2`, `UI-3` (Mobile-First, Tap Target `>= 40px`, Zero Overflow):** Memperkuat kepatuhan. `ThemeToggle` memakai `min-h-10 min-w-10` (`>= 40×40 px`), dan header mobile `LandingHeader`/`AppShell` tidak lagi memakan tinggi ~171 px (multi-row wrapping pada `360px`), turun ke tinggi satu baris ringkas (`<= 72 px`).
- **`UI-5` (Keyboard Navigation & ARIA):** Terjaga melalui `aria-expanded`, `aria-controls`, `aria-label` terlokalisasi (`Buka/Tutup menu navigasi`), tombol ikon `Sun`/`Moon` dengan `aria-hidden="true"`, tombol `ThemeToggle` dengan `aria-pressed` & `aria-label` dinamis, penanganan tombol `Escape` yang mengembalikan fokus ke pemicu hamburger, serta penutupan otomatis saat tautan diklik atau klik di luar header.
- **`I18N-1` & `I18N-2` (Strict Bilingual Dictionary & Zero Reload):** Kontrak `Dictionary` menambah kunci `nav.openMenuAriaLabel`, `nav.closeMenuAriaLabel`, dan `nav.mobileMenuAriaLabel` pada `types.ts`, `id.ts`, serta `en.ts` tanpa teks hardcoded. Toggle tema/bahasa tetap seketika tanpa reload dan mempertahankan state lokal komponen (`FeaturePreviewCard` dan input editor).
- **Keputusan `PRD.md` (`DEC-1`–`DEC-16`) & Lingkup (`F20`–`F31`):** Tidak ada keputusan yang dibalik dan tidak ada fitur v1.1/out-of-scope yang masuk. Nilai kamus `preferences.lightMode` & `preferences.darkMode` tetap dipertahankan pada tipe/kamus agar kompatibel non-breaking.
- **`AuthLayout` (`(auth)/layout.tsx`):** Tetap satu baris aman (`<= 72 px`, ~198 px konten total <= 328 px area bersih di viewport `360px`) dengan `Noka` + `LocaleToggle` + `ThemeToggle` icon-only, sehingga tidak membutuhkan menu hamburger tambahan.

### B. Komponen, Fitur & RFC Terdampak
- **Fitur:** `F1` (Landing Page), `F2` (Bilingual & Theme Switching), `F3` (AppShell & Responsive Workspace Navigation).
- **RFC Terdampak:**
  - `RFC-001` (`ThemeToggle.tsx`, `AppShell.tsx`, `i18n/{types,id,en}.ts`, penambahan `MobileMenuButton.tsx`).
  - `RFC-003` (`LandingHeader.tsx`, penyesuaian `scroll-mt-24` pada `FeaturePreviewCard.tsx`, `tests/e2e/landing-seo.spec.ts`).
  - `RFC-007` / `RFC-009` *(belum diimplementasikan; tetap kompatibel penuh karena `syncStatusSlot` & `privacyBlurSlot` tetap dapat tampil ringkas pada bilah atas `AppShell`)*.
- **Dampak pada Pekerjaan yang Sudah Selesai:**
  - Tidak mengubah skema DB, API, atau alur autentikasi (`RFC-002`).
  - Mengeliminasi kebutuhan kompensasi `scroll-mt-48` di `FeaturePreviewCard.tsx` (disederhanakan menjadi `scroll-mt-24`) karena header sticky mobile kini selalu satu baris saat tertutup.

---

## 3. Implementation Strategy

- **Jadwal Eksekusi:** Diterapkan langsung pada branch `feat/rfc-003-public-landing-seo` dan disinkronkan bersama `RFC-001`, `RFC-003`, serta `TEST-STRATEGY.md` sebelum audit Round 2 `RFC-003` dan merge ke `main`.
- **Arsitektur Komponen:**
  - Ekstraksi hook `useMobileMenu` & tombol `<MobileMenuButton />` di `src/components/ui/MobileMenuButton.tsx` agar `LandingHeader` dan `AppShell` berbagi logika keyboard `Escape`, fokus, dan outside-click tanpa duplikasi kode (`QUAL-2`).
  - Render kondisional panel menu mobile (`isOpen ? ... : null`) agar bebas *hydration mismatch* SSR dan tidak menggandakan `data-testid="app-shell-user-badge"` atau tombol `Keluar` di DOM `jsdom` saat tertutup.
- **Strategi Pengujian (`TEST-STRATEGY.md`):**
  - Unit (`Vitest`): Verifikasi `ThemeToggle` bebas teks tampak (`textContent.trim() === ""`) di `preferences-i18n.test.tsx`; verifikasi siklus buka/tutup menu hamburger, isi drawer, navigasi tautan, dan `Escape` focus-restore pada `AppShell` & `LandingHeader` di `shell-layout.test.tsx`.
  - E2E (`Playwright`): Verifikasi tinggi header mobile tertutup `<= 72 px`, interaksi menu mobile (`Masuk`/`Daftar`/`Buka Workspace`/`EN`/`ThemeToggle`), kontrol tampak `>= 40×40 px`, jangkar `#preview`, serta `0` *horizontal overflow* di `360px`, `375×812`, `768px`, dan `1280×800`.

---

## 4. Documentation Updates

Seluruh artefak diperbarui bersama secara atomik:
- `RFCs/RFC-001-Foundation-Schema-And-Shell.md` — Memperbarui spesifikasi & Implementation Notes `ThemeToggle`, `MobileMenuButton`, dan `AppShell` mobile header.
- `RFCs/RFC-003-Public-Landing-Page-And-SEO.md` — Memperbarui deskripsi `<LandingHeader />`, `AC-3.1`, dan Implementation Notes (`scroll-mt-24` & menu mobile).
- `TEST-STRATEGY.md` — Memperbarui cakupan `TS-001-06`, `TS-001-07`, `TS-003-01`, dan `TS-003-02`.
- `PRD.md`, `FEATURES.md`, `RULES.md` — Tidak memerlukan perubahan butir fitur/aturan karena perilaku baru sepenuhnya berada di dalam batas `F1`–`F3`, `UI-1`–`UI-5`, dan `I18N-1`–`I18N-2`.

---

## 5. Stakeholder Impact

- **Pengembang berikutnya (`RFC-004`–`RFC-010`):** Saat memasang `syncStatusSlot` (`RFC-009`) dan `privacyBlurSlot` (`RFC-007`) ke `AppShell`, kedua slot tersebut tetap dirancang ringkas (ikon/pill kompak) agar bilah atas `< md` bersama Logo + hamburger tetap `<= 72 px` tanpa overflow pada `360px`.

---

## 6. Risk Assessment & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kontrol `LocaleToggle`/`ThemeToggle`/`Masuk`/`Daftar` tersembunyi di balik menu mobile sehingga E2E atau pengguna melewatkannya | Sedang | Memasang `aria-expanded`/`aria-controls`/`aria-label` jelas pada hamburger, menyertakan uji E2E & unit khusus buka-tutup menu mobile pada guest maupun user login |
| Duplikasi elemen DOM antara bilah desktop `hidden md:flex` dan menu mobile | Sedang | Panel menu mobile hanya di-mount saat `isOpen === true`, dan komponen pembantu internal (`LandingAuthActions`, `UserBadge`) diparameterisasi agar bebas duplikasi logika |
| Penumpukan header dengan slot workspace mendatang (`syncStatusSlot` / `privacyBlurSlot`) di `360px` | Rendah | Logo memakai `shrink-0`, container kanan memakai `shrink-0` minimal, dan tombol kontrol ikon berukuran kompak `40×40 px` |

