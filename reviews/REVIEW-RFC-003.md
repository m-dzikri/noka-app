# Review: RFC-003 -- Public SEO Landing Page

## Round 1 -- 2026-11-12

- **RFC:** [RFC-003](file:///d:/Projects/noka-app/RFCs/RFC-003-Public-Landing-Page-And-SEO.md) -- Public SEO Landing Page
- **Branch / Commit Reviewed:** `feat/rfc-003-public-landing-seo` (`HEAD` at `bc63cf7`; commits `26785ef`, `4dbdaf1`, `bc63cf7` ahead of `main` `7486d24`)
- **Review Basis:** Fresh-eyes inspection of [PRD.md](file:///d:/Projects/noka-app/PRD.md), [FEATURES.md](file:///d:/Projects/noka-app/FEATURES.md), [RULES.md](file:///d:/Projects/noka-app/RULES.md), [PRD-REVIEW.md](file:///d:/Projects/noka-app/PRD-REVIEW.md), [RFCS.md](file:///d:/Projects/noka-app/RFCS.md), [RFC-003](file:///d:/Projects/noka-app/RFCs/RFC-003-Public-Landing-Page-And-SEO.md), [TEST-STRATEGY.md](file:///d:/Projects/noka-app/TEST-STRATEGY.md), dan seluruh implementasi serta pengujian langsung.
- **Product Type Scope ([PRD.md](file:///d:/Projects/noka-app/PRD.md#L20-L40)):** **Web App** *(Multi-user Responsive Web Application + PWA + Public SEO Pages)*.
  - *Cek Diterapkan:* Public SSR/SEO (`generateMetadata()`, `<title>`, `<meta name="description">`, canonical, Open Graph, Twitter Card, `robots.txt`, `sitemap.xml`, `opengraph-image`), Auth-aware CTA (`getSessionUser()` bypass query DB saat cookie absen), Accessibility (`WCAG 2.1 Level AA` kontras Light/Dark, skip-link, `aria-pressed`/`aria-label`, keyboard `Tab`/`Enter`, `prefers-reduced-motion`), Responsive Layout (`360px`, `375×812`, `768px`, `1280×800`), Bilingual `ID/EN` + `Light/Dark` state preservation, dan build-safe env (`ARCH-6`).
  - *Cek Dilewati (Visible Skip):* *Binary Size* (Noka adalah Web App/PWA, dikendalikan melalui web bundle budget), *Public Third-Party API SLA & Versioning* (API bersifat *first-party internal*), dan *Offline Sync / Storage* (diimplementasikan pada `RFC-009` / `RFC-004`–`RFC-008` sesuai `RFCS.md`).
- **Overall Risk Level:** Low
- **Verdict:** **PASS (`Reviewed`)** -- Seluruh *acceptance criteria* (`AC-3.1`–`AC-3.5`) dan rencana uji (`TS-003-01` & `TS-003-02`) terpenuhi tanpa temuan blocking.

---

### Step 0: Verification Output

1. **`npm run lint` (`eslint .`) & `npm run typecheck` (`tsc --noEmit`):**
   - `LINT_EXIT=0`, `TSC_EXIT=0`
2. **`npm test` (`vitest run` v5.1.0):**
   - `Test Files  12 passed (12)`, `Tests  51 passed (51)` (`0` skipped), `Duration  6.06s`, `TEST_EXIT=0`
3. **`npm run build` (`next build` Next.js `16.4.6` Turbopack dengan `DATABASE_URL=""` & `SESSION_SECRET=""`):**
   - `BUILD_NOENV_EXIT=0` -- Route `/`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image`, `/app`, `/login`, `/register`, `/forgot-password`, `/reset-password` ter-build sukses sebagai `ƒ (Dynamic)` tanpa error env DB/secret.
4. **`npm run test:e2e` (`playwright test` dengan `PORT=3105`, `APP_URL=http://127.0.0.1:3105`):**
   - `4 passed (27.4s)`, `E2E_EXIT=0`
     - `[desktop] TS-003-01` (`4.6s`): SSR HTML ID/EN, `robots.txt`, `sitemap.xml`, PNG `1200×630` `/opengraph-image`, CTA guest vs authenticated (`/app` + `#preview`).
     - `[mobile] TS-003-01` (`4.6s`): Lulus.
     - `[desktop] TS-003-02` (`14.0s`): 3 preset Quick Capture, GFM checklist toggle, *Safe-to-Spend* & *Linked Notes*, Demo Privacy Blur (`0` request `/api/`), toggle `ID/EN` + `Dark` tanpa reload & mempertahankan state `FeaturePreviewCard`, navigasi keyboard, `scrollWidth <= innerWidth` & kontrol header `>= 40px` di `360px`/`375×812`/`768px`/`1280×800`.
     - `[mobile] TS-003-02` (`13.6s`): Lulus.
5. **Verifikasi Runtime Tambahan (`next start` terisolasi port `3106` & `3107`, Playwright + perhitungan kontras WCAG):**
   - Uji SSR dengan `APP_URL="https://noka.example"` & `DATABASE_URL=""`/`SESSION_SECRET=""`: `/` mengembalikan `HTTP 200` dengan `<title>`, `<meta name="description">`, `<link rel="canonical" href="https://noka.example"/>`, `og:image` `https://noka.example/opengraph-image` (tanpa duplikasi tag), `robots.txt` (`Sitemap: https://noka.example/sitemap.xml`), dan `sitemap.xml` memuat `/`, `/login`, `/register` dengan `changefreq`/`priority`.
   - Audit runtime `/` di Chromium (`360×800`, mode `EN` + `Dark`): `0` HTTP error (`badResponses: []`), `0` `console.error`/`pageerror`, `scrollW: 360 === innerW: 360`, `domContentLoadedEventEnd: 319 ms`, dan `localStorage.getItem("noka_privacy_blur")` tetap `null` sesudah Demo Privacy Blur diaktifkan.
   - Audit rasio kontras WCAG 2.1 AA ([tokens.css](file:///d:/Projects/noka-app/src/styles/tokens.css)): Light (`#0f172a`/`#ffffff` `17.85`, `#334155`/`#f1f5f9` `9.45`, `#15803d`/`#f1f5f9` `4.58`, `#b91c1c`/`#f1f5f9` `5.91`, border `#7c8b9e`/`#ffffff` `3.47`) dan Dark (`#f8fafc`/`#09090b` `19.02`, `#cbd5e1`/`#1c1c21` `11.43`, `#4ade80`/`#1c1c21` `9.74`, `#f87171`/`#1c1c21` `6.14`, border `#71717a`/`#111114` `3.90`).
6. **`python .agents/skills/workflow-status/scripts/trace-check.py .`:**
   - Pra-edit (`RFCS.md` = `Implemented`): `0 failure(s), 6 warning(s)` (5 untuk `F20`–`F24` + 1 untuk status `RFC-003` belum direview).
   - Pasca-edit (`RFCS.md` = `Reviewed`): `0 failure(s), 5 warning(s)` (`F20`–`F24`), `TRACE_EXIT=0`.
   - *(Audit Chrome Lighthouse CLI yang tercantum di `RFC-003` §Implementation Notes baris 74–76 belum dijalankan ulang secara independen pada sesi ini karena biner `lighthouse` CLI tidak terpasang lokal; verifikasi tetap dilakukan langsung via SSR inspection, Chromium timing, dan perhitungan kontras WCAG).*

---

### Review Dimensions

#### 1. RFC Adherence
- **Verdict:** **PASS**
- **Findings:**
  - Seluruh kriteria penerimaan [AC-3.1 s.d. AC-3.5](file:///d:/Projects/noka-app/RFCs/RFC-003-Public-Landing-Page-And-SEO.md#L61-L65) dan rencana uji [TS-003-01 / TS-003-02](file:///d:/Projects/noka-app/TEST-STRATEGY.md#L162-L173) telah terpenuhi.
  - Route group `(public)/` terisolasi bersih di [page.tsx](file:///d:/Projects/noka-app/src/app/(public)/page.tsx) tanpa duplikasi header/layout dengan [AuthLayout](file:///d:/Projects/noka-app/src/app/(auth)/layout.tsx) maupun `(app)`.
  - Seluruh 3 butir `## Implementation Notes` di [RFC-003](file:///d:/Projects/noka-app/RFCs/RFC-003-Public-Landing-Page-And-SEO.md#L71-L76) ([RootLayout generateMetadata](file:///d:/Projects/noka-app/src/app/layout.tsx#L21-L28), [LocaleToggle min-h-10](file:///d:/Projects/noka-app/src/components/ui/LocaleToggle.tsx#L31-L54), dan kontrak tipe [LandingDictionary](file:///d:/Projects/noka-app/src/lib/i18n/types.ts#L40-L103)) konsisten dengan implementasi kode dan aturan `ARCH-6`/`UI-2`.
  - Tidak ada fitur di luar ruang lingkup (`F20`–`F31`) yang masuk ke implementasi.
- **Suggestions:** Tidak ada isu blocking; lihat perbaikan UX opsional di bawah.

#### 2. Rules Compliance
- **Verdict:** **PASS**
- **Findings:**
  - **Architecture & Scope (`ARCH-1`, `ARCH-4`, `ARCH-6`, `QUAL-1`–`QUAL-3`):** Server Component [PublicLandingPage](file:///d:/Projects/noka-app/src/app/(public)/page.tsx#L49-L52) merender leaf interaktif [LandingContent](file:///d:/Projects/noka-app/src/components/landing/LandingContent.tsx), [LandingHeader](file:///d:/Projects/noka-app/src/components/landing/LandingHeader.tsx), [FeaturePreviewCard](file:///d:/Projects/noka-app/src/components/landing/FeaturePreviewCard.tsx), dan [LandingFooter](file:///d:/Projects/noka-app/src/components/landing/LandingFooter.tsx). Hasil scan diff `src/` menunjukkan nol `TODO`/`FIXME`, nol `any`, nol `eslint-disable`, dan nol akses langsung `process.env` (seluruh resolver URL menggunakan [`getAppUrl`](file:///d:/Projects/noka-app/src/lib/env.ts#L163-L165)).
  - **Bilingual (`I18N-1`, `I18N-2`) & Visual Tokens (`UI-1`–`UI-5`, `PERF-4`):** Seluruh teks landing tersimpan terketik penuh di [id.ts](file:///d:/Projects/noka-app/src/lib/i18n/dictionaries/id.ts#L143-L263) dan [en.ts](file:///d:/Projects/noka-app/src/lib/i18n/dictionaries/en.ts#L143-L263); pergantian bahasa/tema berlangsung instan tanpa reload serta menjaga state [FeaturePreviewCard](file:///d:/Projects/noka-app/src/components/landing/FeaturePreviewCard.tsx#L30-L41); font `Plus_Jakarta_Sans` & `JetBrains_Mono` memakai `display: "swap"` ([layout.tsx](file:///d:/Projects/noka-app/src/app/layout.tsx#L9-L19)); transisi memakai `transition-transform` / `transition-colors` dengan [`prefers-reduced-motion`](file:///d:/Projects/noka-app/src/app/globals.css#L40-L49).
- **Suggestions:** Lihat saran minor ukuran lebar tombol `"ID"` di [`LocaleToggle`](file:///d:/Projects/noka-app/src/components/ui/LocaleToggle.tsx#L26-L39) dan `scroll-mt-*` pada `#preview`.

#### 3. Security
- **Verdict:** **PASS**
- **Findings:**
  - Halaman publik hanya menampilkan data statis/terlokalisasi dan status boolean `Boolean(user)` tanpa membocorkan profil/PII maupun query DB untuk pengunjung tanpa sesi ([getSessionContext](file:///d:/Projects/noka-app/src/features/auth/session.ts#L63-L70)).
  - [robots.ts](file:///d:/Projects/noka-app/src/app/robots.ts#L12-L21) melarang pengindeksan `/app/` dan `/api/`; [sitemap.ts](file:///d:/Projects/noka-app/src/app/sitemap.ts#L9-L33) hanya mempublikasikan `/`, `/login`, `/register` (mengecualikan `/forgot-password` dan `/reset-password`).
  - [FeaturePreviewCard](file:///d:/Projects/noka-app/src/components/landing/FeaturePreviewCard.tsx) memproses seluruh interaksi secara lokal (`0` request `/api/`) dan tidak menyentuh `localStorage` `noka_privacy_blur`.
- **Suggestions:** Tidak ada.

#### 4. Performance
- **Verdict:** **PASS**
- **Findings:**
  - Pengunjung anonim mem-bypass query PostgreSQL sepenuhnya (`getSessionContext` mengembalikan `null` bila cookie `noka_session` tidak ada/tidak valid); teruji berjalan `200 OK` bahkan saat `DATABASE_URL=""` dan `SESSION_SECRET=""`.
  - [opengraph-image.tsx](file:///d:/Projects/noka-app/src/app/opengraph-image.tsx) menghasilkan `ImageResponse` `1200×630` PNG dengan styling inline tanpa fetch font eksternal yang berisiko timeout.
  - Tidak ada paket berat yang diimpor pada route `(public)/` (`domContentLoadedEventEnd: 319 ms` pada build produksi lokal).
- **Suggestions:** Lakukan satu kali verifikasi Lighthouse CLI/Chrome DevTools pada build staging/deploy (`TEST-STRATEGY.md` §5 Item 4) untuk memvalidasi metrik skor produksi secara independen.

#### 5. Maintainability
- **Verdict:** **PASS**
- **Findings:**
  - Komponen terpecah bersih (`LandingHeader`, `LandingContent`, `FeaturePreviewCard`, `LandingFooter`), docstring ringkas konsisten, kontrak dictionary tervalidasi compiler TypeScript strict, dan E2E suite [tests/e2e/landing-seo.spec.ts](file:///d:/Projects/noka-app/tests/e2e/landing-seo.spec.ts) melakukan pembersihan akun sintetis di blok `finally` (`deleteSyntheticE2eUser`).
- **Suggestions:** Lihat saran penambahan assertion E2E pada Bagian Improvement Suggestions di bawah.

---

### Summary

Implementasi **RFC-003** memenuhi spesifikasi [PRD.md](file:///d:/Projects/noka-app/PRD.md), [FEATURES.md](file:///d:/Projects/noka-app/FEATURES.md), [RULES.md](file:///d:/Projects/noka-app/RULES.md), dan [TEST-STRATEGY.md](file:///d:/Projects/noka-app/TEST-STRATEGY.md) secara bersih dan menyeluruh. SSR SEO (`generateMetadata()`, `robots.ts`, `sitemap.ts`, `opengraph-image.tsx`), jalur cepat zero-DB untuk pengunjung anonim, hierarki heading/kontras WCAG AA, ketahanan state `FeaturePreviewCard` saat toggle `ID/EN` & `Light/Dark`, serta keutuhan responsif di `360px`–`1280px` semuanya teruji lulus tanpa isu blocking.

### Blocking Issues

0 blocking issues.

### Improvement Suggestions (Non-Blocking)

1. **Offset scroll jangkar `#preview` terhadap header `sticky`:** `<section id="preview">` di [FeaturePreviewCard.tsx](file:///d:/Projects/noka-app/src/components/landing/FeaturePreviewCard.tsx#L55) belum memiliki utility `scroll-mt-*` sementara [LandingHeader](file:///d:/Projects/noka-app/src/components/landing/LandingHeader.tsx#L19) memakai `sticky top-0 z-20` (tinggi terukur `171px` saat wrap di `360px`; `previewTopAfterScrollIntoView: 0`). Tambahkan `scroll-mt-24` (atau `sm:sticky` pada header dan `sm:scroll-mt-24 scroll-mt-48`) agar tautan CTA `"Lihat Pratinjau"` (`#preview`) bagi pengguna terautentikasi tidak tertutup header saat digulir.
2. **Target sentuh horizontal penuh pada tombol `"ID"`:** Pada [LocaleToggle.tsx](file:///d:/Projects/noka-app/src/components/ui/LocaleToggle.tsx#L26-L39), dimensi tombol `"ID"` di viewport `360px` terukur `36×40` px (tinggi sudah `>= 40px` sesuai cek, namun lebar sedikit di bawah `40px`). Tambahkan `min-w-10 inline-flex items-center justify-center` agar kedua dimensi tombol mencapai `>= 40×40` px.
3. **Perketat cakupan assertion di E2E SEO spec:** Pada [tests/e2e/landing-seo.spec.ts](file:///d:/Projects/noka-app/tests/e2e/landing-seo.spec.ts#L59-L108), tambahkan assertion eksplisit untuk `<meta name="description">`, `<changefreq>`/`<priority>` pada `sitemap.xml`, `localStorage.getItem("noka_privacy_blur") === null` pasca Demo Privacy Blur, serta pemeriksaan `0` error `console`/`pageerror` (dan dokumentasikan jalannya verifikasi Lighthouse produksi pada tahap staging/deploy sesuai [TEST-STRATEGY.md](file:///d:/Projects/noka-app/TEST-STRATEGY.md#L284)).
