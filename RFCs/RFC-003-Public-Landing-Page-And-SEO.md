# RFC-003: Public SEO Landing Page

**Features**: F1
**Depends on**: RFC-001, RFC-002
**Rules**: ARCH-1, ARCH-4, ARCH-6, UI-1, UI-2, UI-3, UI-4, UI-5, I18N-1, I18N-2, PERF-1, PERF-3, PERF-4, TEST-1, TEST-5, QUAL-2, QUAL-3
**Complexity**: Medium

---

## Summary

Membangun halaman perkenalan publik Noka (`/`) pada route group terisolasi `(public)/` (`RFC-002` auth pages berada di `(auth)/`, sehingga tidak ada duplikasi header/toggle) yang dirender SSR di server (`FR-1`, `NFR-10`, `PERF-3`), minimalis modern (`NFR-4`), mendukung pengalih `Light/Dark` dan `ID/EN` instan tanpa mereset state demo (`I18N-2`), menampilkan `FeaturePreviewCard` interaktif (Quick Capture, GFM checklist, kartu *Safe-to-Spend* & *Linked Notes*, dan Demo Privacy Blur `Rp •••••`), ringkasan kebijakan privasi footer, metadata SEO / Open Graph (`1200×630`), serta `robots.txt` dan `sitemap.xml` dinamis build-safe.

---

## Technical Approach

### 1. Dynamic SSR SEO + Zero-Reload Instant Bilingual Content (`PERF-3`, `I18N-2`, `ARCH-1`, `ARCH-4`)
- `src/app/(public)/page.tsx` adalah **Server Component** (mengekspor `export const dynamic = "force-dynamic"`):
  - Memanggil `getServerPreferences()` (`RFC-001`) untuk locale/theme awal dan `Boolean(await getSessionUser())` (`RFC-002` — langsung me-return `null` **tanpa query DB** ketika cookie `noka_session` absen agar TTFB/LCP pengunjung anonim tetap cepat).
  - Merender `<LandingContent isAuthenticated={initialIsAuthenticated} />` (`"use client"` tipis yang tetap di-SSR-kan ke HTML penuh). `LandingContent` langsung membaca kamus dari `useI18n()` milik root `PreferencesProvider` (sudah di-hydrate dari SSR cookie `RFC-001` — tidak membutuhkan prop `initialDict` tambahan).
  - Mengubah `LocaleToggle` / `ThemeToggle` pada `<LandingHeader />` memperbarui seluruh teks & tema Landing Page **instan tanpa reload** dan tanpa mereset state di `FeaturePreviewCard` (`I18N-2`).
- `generateMetadata()` pada `(public)/page.tsx`: memanggil `getServerPreferences()` untuk `locale` serta `getAppUrl()` dari `src/lib/env.ts` (`RFC-001`, `ARCH-6` — tidak mewajibkan `DATABASE_URL`/`SESSION_SECRET` saat build) sebagai `metadataBase`, menghasilkan `title` dan `description` terlokalisasi, `alternates: { canonical: "/" }`, `openGraph: { type: "website", siteName: "Noka", locale: locale === "id" ? "id_ID" : "en_US", url: "/", title, description, images: ["/opengraph-image"] }`, dan `twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] }`.

### 2. Build-Safe Dynamic SEO Routes (`robots.ts`, `sitemap.ts`, `opengraph-image.tsx`)
- `src/app/robots.ts` & `src/app/sitemap.ts` mengekspor **`export const dynamic = "force-dynamic"`** dan menyelesaikan `baseUrl = getAppUrl()` dari `src/lib/env.ts` (`RFC-001`, `ARCH-6` — `APP_URL` dengan default `http://localhost:3000`, trailing slash dinormalisasi via Zod) agar **`npm run build` di CI tetap lulus tanpa `DATABASE_URL`/`SESSION_SECRET` aktif**, sekaligus memancarkan URL produksi aktual saat runtime!
  - `robots.ts`: `rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/api/"] }]`, `sitemap: `${baseUrl}/sitemap.xml``.
  - `sitemap.ts`: mencantumkan `/`, `/login`, dan `/register` (tidak memasukkan `/forgot-password`/`/reset-password`) dengan `lastModified: new Date()`, `changeFrequency: "weekly"` (untuk `/`) / `"monthly"` (`/login`, `/register`), dan `priority: 1.0` (`/`) / `0.6` (`/login`, `/register`).
- `src/app/opengraph-image.tsx`: `next/og` `ImageResponse` ukuran **`1200×630`**, `contentType = "image/png"`, menampilkan logo **Noka** & tagline dengan kontras tinggi.

### 3. Section Hierarchy & Interactive `FeaturePreviewCard`
- `<LandingHeader />`: Logo `Noka`, `LocaleToggle`, `ThemeToggle`, dan CTA kanan — jika `isAuthenticated` menampilkan 1 tombol **`Buka Workspace` (`/app`)**, selain itu **`Masuk` (`/login`)** & **`Daftar` (`/register`)**. Pada lebar `360px` tersusun rapi tanpa *horizontal overflow* (`flex-wrap`, tap target `>= 40px`).
- **Hero (`<h1>` tunggal)**: Judul utama, subjudul ringkas, dan CTA yang konsisten dengan status sesi — jika `!isAuthenticated`: CTA primer **`Mulai Gratis` (`/register`)** + sekunder **`Masuk` (`/login`)**; jika `isAuthenticated`: CTA primer **`Buka Workspace` (`/app`)** + sekunder gulir ke pratinjau **`#preview`**.
- **Section Keunggulan (`<h2>` + 5 kartu `<h3>`)**: (1) Catatan Markdown & Checklist GFM, (2) Smart Quick Capture Offline, (3) Linked Notes ↔ Transaksi, (4) Safe-to-Spend Harian, (5) Privacy Blur Sekali Klik.
- **`FeaturePreviewCard.tsx` (`"use client"`, id `preview`)** menampilkan 4 blok interaktif/statis lokal tanpa memanggil API:
  - `(a)` 3 chip preset Quick Capture (`"kopi kenangan 24rb gopay"`, `"+gaji 5jt bca"`, `"bab 3 skripsi"`) dengan kartu hasil deteksi lokal statis (Pengeluaran `Rp24.000` / Pemasukan `+Rp5.000.000` / Catatan),
  - `(b)` checklist GFM lokal yang dapat dicentang interaktif,
  - `(c)` kartu pratinjau statis **Safe-to-Spend** (`"Rp85.000 / hari • 12 hari tersisa"`) & **Linked Notes** (`"Skripsi & Riset • 2 transaksi • Net -Rp125.000"`) dengan nilai contoh tetap,
  - `(d)` tombol **Demo Privacy Blur** lokal (state React lokal agar tidak mengubah setting akun) yang langsung menyamarkan **seluruh nominal** pada blok `(a)` dan `(c)` menjadi `Rp •••••` / `+Rp •••••` / `-Rp •••••` (`UI-4`, `FR-14`).
- **`<LandingFooter />`**: 3 poin kebijakan privasi publik (data privat per akun, parsing Quick Capture 100% lokal tanpa AI eksternal, kontrol hapus akun & wipe cache offline).
- Transisi UI hanya memakai `opacity` dan `transform` serta tunduk pada `prefers-reduced-motion` (`RFC-001` `globals.css`).

---

## Implementation Details

### File Structure
- `src/app/(public)/page.tsx`
- `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/opengraph-image.tsx`
- `src/lib/env.ts` (memakai ulang helper `getAppUrl()` dari `RFC-001`)
- `src/components/landing/LandingContent.tsx`, `src/components/landing/LandingHeader.tsx`, `src/components/landing/FeaturePreviewCard.tsx`, `src/components/landing/LandingFooter.tsx`
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/id.ts`, `src/lib/i18n/dictionaries/en.ts` (mengisi & mewajibkan namespace `landing`)
- `tests/e2e/landing-seo.spec.ts`

---

## Acceptance Criteria

- [ ] **AC-3.1 (Landing Page Publik, Header Mobile, Auth-Aware CTA & Footer Privasi — `F1`, `UI-1`–`UI-4`):** Route `src/app/(public)/page.tsx` dapat diakses tanpa login (`HTTP 200`), bebas duplikasi layout dengan `(auth)/`, mem-bypass query DB di `getSessionUser()` ketika cookie `noka_session` absen; `LandingContent`, `LandingHeader` (logo `Noka`, `LocaleToggle`, `ThemeToggle`, CTA auth-aware `Buka Workspace` `/app` vs `Masuk` `/login` & `Daftar` `/register`, `flex-wrap`, tap target `>= 40px`), `FeaturePreviewCard`, dan `LandingFooter` merender `<h1>` hero (CTA `/register` + `/login` saat anonim, atau `/app` + `#preview` saat login), `<h2>` + 5 kartu `<h3>`, 3 poin privasi footer, serta bebas *horizontal overflow* di `360px`, `768px`, `1280px` dengan kontras WCAG 2.1 AA.
- [ ] **AC-3.2 (Interactive `FeaturePreviewCard` 4 Blok — `F1`, `UI-4`, `UI-5`):** Di `FeaturePreviewCard.tsx`, pengunjung dapat memilih 3 preset Quick Capture (`(a)`), mencentang checklist GFM lokal (`(b)`), melihat kartu contoh *Safe-to-Spend* & *Linked Notes* (`(c)`), dan menyalakan demo Privacy Blur lokal (`(d)`) yang menyamarkan seluruh nominal di `(a)` dan `(c)` menjadi `Rp •••••` (`UI-4`) tanpa memanggil API.
- [ ] **AC-3.3 (SSR SEO, Build-Safe Dynamic Routes & OG — `F1`, `ARCH-6`, `PERF-3`):** HTML SSR `/` memiliki tepat satu `<h1>` & hierarki `<h2>`–`<h3>`; `generateMetadata()` memanggil `getServerPreferences()` dan `getAppUrl()` (`src/lib/env.ts`, `ARCH-6`) untuk metadata terlokalisasi (`title`, `description`, `metadataBase`, `canonical`, `openGraph.locale` `id_ID`/`en_US`, `images: ["/opengraph-image"]`, `twitter: summary_large_image`); `src/app/opengraph-image.tsx` menghasilkan PNG `1200×630`; `src/app/(public)/page.tsx`, `src/app/robots.ts`, dan `src/app/sitemap.ts` mengekspor `force-dynamic` (aman saat `npm run build` tanpa DB/secret), memancarkan `Sitemap:` (`robots.txt`), melarang `/app/` & `/api/`, mencantumkan `/`, `/login`, dan `/register` beserta `changeFrequency`/`priority`, serta mengecualikan `/forgot-password` dan `/reset-password` dari `sitemap.ts`.
- [ ] **AC-3.4 (Bilingual Instan, Font & Animasi — `I18N-1`, `I18N-2`, `UI-5`, `PERF-4`):** Seluruh string landing diketik & diisi pada `src/lib/i18n/{types,dictionaries/id,dictionaries/en}.ts`; pergantian `ID/EN` & `Light/Dark` berjalan seketika tanpa reload dan tanpa mereset state `FeaturePreviewCard`; memakai `next/font` `display: "swap"`, animasi hanya `opacity`/`transform` menghormati `prefers-reduced-motion`, dan kontrol dapat diakses keyboard.
- [ ] **AC-3.5 (Playwright E2E, Lighthouse & Quality — `ARCH-6`, `PERF-1`, `TEST-1`, `TEST-5`, `QUAL-2`, `QUAL-3`):** `tests/e2e/landing-seo.spec.ts` memverifikasi SSR HTML, metadata SEO, `robots.txt`, `sitemap.xml`, `opengraph-image`, switch ID/EN & Light/Dark, CTA anonim (`/login`, `/register`) maupun sesi login (`isAuthenticated === true` -> `/app` & `#preview`), semua interaksi `FeaturePreviewCard` + navigasi keyboard, serta bebas overflow pada `360px`, `768px` (`375×812` & `768px`), dan `1280×800`; `npm run build` lulus tanpa `DATABASE_URL`/`SESSION_SECRET` aktif; audit produksi mencatat Lighthouse `Performance >= 90`, `Accessibility >= 95`, `Best Practices >= 95`, `SEO >= 90`, `LCP <= 2,5s`; `npm run lint` dan `npx tsc --noEmit` lulus penuh.
