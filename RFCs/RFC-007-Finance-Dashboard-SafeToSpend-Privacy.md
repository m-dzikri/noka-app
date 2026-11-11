# RFC-007: Finance Dashboard, Safe-to-Spend & Privacy Blur Mode

**Features**: F13, F16, F17
**Depends on**: RFC-001, RFC-002, RFC-006
**Rules**: ARCH-1, ARCH-2, ARCH-4, ARCH-5, DATA-1, DATA-2, DATA-3, DATA-5, API-1, API-2, API-5, SEC-1, UI-3, UI-4, UI-5, I18N-1, I18N-2, PERF-2, TEST-1, TEST-2, TEST-3, QUAL-2, QUAL-3
**Complexity**: Medium

---

## Summary

Menghadirkan **Dashboard Keuangan (`/app/finance`)** yang utuh (`F13`), kalkulator **Safe-to-Spend harian deterministik** (`F16`, `DEC-12`, `HIGH-2`), serta **Privacy Blur Mode** global di `/app/*` melalui `<PrivacyAmount />` tanpa SSR flash dan tanpa memengaruhi Landing Page publik (`F17`, `UI-4`, `FR-14`).

*(Catatan cakupan `F17`: `RFC-007` menerapkan `<PrivacyAmount />` di seluruh header `/app/*`, dashboard keuangan, dompet, cashflow, dan ledger; integrasi ke Quick Capture & Linked Notes diselesaikan pada `RFC-008`).*

---

## Technical Approach

### 1. Cycle Window & Deterministic Safe-to-Spend Algorithm (`F16`, `DATA-5`, `DEC-12`, `HIGH-2`)
- `src/features/finance/safe-to-spend.ts`:
  1. `resolveActiveCycleWindow(nowDate: Date, cycleStartDay: string, tzOffsetMinutes = 420)`:
     - Konvensi tanda `tzOffsetMinutes`: menit di depan UTC (`+420` = `UTC+7`, setara `-new Date().getTimezoneOffset()`; validasi `-720..840`).
     - Hitung tanggal kalender lokal via `new Date(nowDate.getTime() + tzOffsetMinutes * 60_000)` (`getUTC*`) agar bebas bug TZ server.
     - Mendukung `'1'`..`'28'`, `'end_of_month'`, serta *defensive clamping* `'29'`–`'31'` menggunakan `min(day, daysInMonth(year, month))` (`TEST-2`).
     - Mengembalikan `{ startDate, endDate, startUtcIso, endExclusiveUtcIso, remainingDays, cycleStartDay }` dengan `remainingDays = Math.max(1, diffCalendarDays(todayLocal, cycleEnd) + 1)`.
  2. `calculateSafeToSpend(walletsWithBalance, nowDate, cycleStartDay, tzOffsetMinutes = 420)`:
     - Filter dompet aktif (`archivedAt === null && includeInSafeToSpend === true`).
     - **Urutan guard wajib**:
       1. `includedWallets.length === 0` -> `{ safeToSpend: 0, totalIncludedBalance: 0, remainingDays, includedWalletCount: 0, status: "no_included_wallets" }`.
       2. `totalIncludedBalance <= 0` -> `{ safeToSpend: 0, totalIncludedBalance, remainingDays, includedWalletCount: includedWallets.length, status: "non_positive_balance" }`.
       3. Selain itu -> `{ safeToSpend: Math.floor(totalIncludedBalance / remainingDays), totalIncludedBalance, remainingDays, includedWalletCount: includedWallets.length, status: "ok" }`.

### 2. Finance Cycle Summary API (`F13`, `DATA-3`, `API-1`, `API-5`, `PERF-2`)
- `GET /api/finance/summary`: amplop `API-1` (`handleApiError`), `requireAuth(req)`, query `{ from?: YYYY-MM-DD, to?: YYYY-MM-DD, walletId?: uuid, type?: "all"|"income"|"expense"|"transfer", categoryId?: uuid, includeArchived?: "true"|"false", tzOffset?: int(-720..840, default 420), limit?: int(1..100, default 50), cursor?: string }`:
  - `from` & `to` masing-masing opsional independen (`from` fallback ke `cycle.startDate`, `to` fallback ke `cycle.endDate`); `YYYY-MM-DD` dikonversi ke batas UTC memakai `tzOffset` (`00:00:00.000`–`23:59:59.999`). Jika `from > to` -> `422 VALIDATION_ERROR`; `cursor` rusak -> `400 INVALID_CURSOR`.
  - **Aturan filter eksplisit pada setiap panel respons**:
    - `wallets`: `WalletWithBalanceDto[]` (`includeArchived === "true"` menyertakan berarsip); `totalBalance` selalu menjumlahkan dompet aktif saja.
    - `cycle` & `safeToSpend`: memakai seluruh dompet aktif & `cycleStartDay` user.
    - `cashflow`: `{ totalIncome, totalExpense, net }` dari transaksi aktif sesuai rentang `[from, to]`, `walletId`, dan `categoryId` (**tidak pernah menghitung transfer**); bila `type === "transfer"` maka `{ totalIncome: 0, totalExpense: 0, net: 0 }`; bila `type === "income"` maka `totalExpense = 0`; bila `type === "expense"` maka `totalIncome = 0`.
    - `categoryBreakdown`: menerapkan filter `[from, to]`, `walletId`, `categoryId`, dan `type` (`"transfer"` -> `[]`), mengurutkan `total DESC, name ASC`, serta menghitung `percentage = Math.round((total / filteredBucketTypeTotal) * 100)` (`total === 0` -> `0`).
    - `ledger`: gabungan diskriminasi `kind: "transaction" | "transfer"` urut `(occurredAt DESC, createdAt DESC, kind ASC, id DESC)` ber-cursor base64url. Filter `walletId` mencocokkan `fromWalletId = walletId OR toWalletId` pada transfer; bila `categoryId` terisi maka item `transfer` dikecualikan (`type === "transfer"` & `categoryId` -> `items: []`).

### 3. Global Privacy Blur Bebas Flash & `SafeToSpendCard` (`F17`, `UI-4`, `ARCH-4`)
- `src/features/finance/privacy-server.ts`: membaca cookie `noka_privacy_blur` (`"1"` => `true`, `"0"` => `false`, absent => `null`) di Server Component `(app)/app/layout.tsx`.
- `PrivacyProvider.tsx` (dipasang di `src/app/(app)/app/layout.tsx`, bukan di `src/app/layout.tsx`):
  - State awal memakai nilai SSR (`initialCookieBlurred ?? false`); saat mount **hanya jika cookie SSR absen (`null`)**, baca `localStorage.getItem("noka_privacy_blur")` (`"true"`/`"false"`) dalam `try/catch` agar preferensi pasca-logout tetap bertahan saat login ulang! Setiap toggle menulis ke state React, atribut `data-privacy-blur="true"|"false"`, cookie `noka_privacy_blur` (`"1"`/`"0"`, `Path=/; Max-Age=31536000; SameSite=Lax`), dan `localStorage` (`"true"`/`"false"`).
- `<PrivacyAmount amount={number} signMode?: "auto" | "plain" | "signed" type?: "income" | "expense" | "transfer" />` (`src/components/ui/PrivacyAmount.tsx`):
  - Default `signMode = "auto"`: memetakan `"income"` -> signed `+`, `"expense"` -> minus `-`, `"transfer"` -> tanpa tanda. Memakai `formatIdr` (`RFC-006`) saat unblurred (`"Rp285.000"`, `"+Rp50.000"`, `"-Rp50.000"`, `"Rp0"`, atau `"-Rp125.000"` untuk nilai negatif pada `"plain"`), dan `"Rp •••••"` / `"+Rp •••••"` / `"-Rp •••••"` (untuk `0` tetap `"Rp •••••"`) saat blur aktif dengan `aria-label` terlokalisasi (`privacy.hiddenLabel`).
- `<PrivacyBlurToggle />` dipasang ke `AppShell` `privacyBlurSlot` (`(app)/app/layout.tsx`) dengan `aria-pressed` & `focus-visible` ring (`UI-5`), ramah lebar `360px`.
- **`SafeToSpendCard.tsx`**: merender nominal `<PrivacyAmount />` harian + `remainingDays` + `totalIncludedBalance` + rentang tanggal `cycle`; saat `status === "no_included_wallets"` atau `"non_positive_balance"`, menampilkan `Rp0` (atau terblur) bersama pesan panduan terlokalisasi (`finance.safeToSpend.*`).
- `src/components/finance/FinanceWorkspace.tsx` (dirender di Server Component `src/app/(app)/app/finance/page.tsx`) memuat ulang ringkasan (`GET /api/finance/summary`) dan memancarkan `noka:finance-updated` setiap selesai mutasi modal `RFC-006`.

---

## API Contracts Exposed

- `GET /api/finance/summary` — `requireAuth(req)`, amplop `API-1`:
  - Query: `{ from?, to?, walletId?, type?, categoryId?, includeArchived?, tzOffset?, limit?, cursor? }`
  - `200`: `{ ok: true, data: { wallets, totalBalance, cycle, safeToSpend, cashflow, categoryBreakdown, ledger: { items, nextCursor } } }`
  - `400 INVALID_CURSOR` | `401 UNAUTHORIZED` | `422 VALIDATION_ERROR`.

---

## Implementation Details

### File Structure
- `src/features/finance/safe-to-spend.ts`, `src/features/finance/summary-service.ts`, `src/features/finance/privacy-server.ts`
- `src/app/api/finance/summary/route.ts`
- `src/components/providers/PrivacyProvider.tsx`, `src/components/ui/PrivacyAmount.tsx`, `src/components/finance/PrivacyBlurToggle.tsx`
- `src/components/finance/SafeToSpendCard.tsx`, `src/components/finance/CashflowSummaryCards.tsx`, `src/components/finance/WalletListSection.tsx`, `src/components/finance/LedgerFilterBar.tsx`, `src/components/finance/LedgerList.tsx`
- `src/components/layout/AppShell.tsx` & `src/app/(app)/app/layout.tsx` (membungkus `/app/*` dengan `PrivacyProvider`, menyambungkan `privacyBlurSlot={<PrivacyBlurToggle />}`, menjaga header `360px` tanpa overflow)
- `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/{id,en}.ts` (menambahkan namespace `privacy` dan key `finance.summary.*` + `finance.safeToSpend.*`)
- `src/components/finance/FinanceWorkspace.tsx` & `src/app/(app)/app/finance/page.tsx` (mengintegrasikan semua panel dashboard + modal `RFC-006`)
- `tests/unit/safe-to-spend.test.ts`, `tests/unit/privacy-blur.test.tsx`, `tests/integration/finance-summary.test.ts`

---

## Acceptance Criteria

- [ ] **AC-7.1 (Safe-to-Spend Deterministik & `SafeToSpendCard` — `F16`, `DATA-5`, `TEST-2`):** `safe-to-spend.ts` (`resolveActiveCycleWindow`, `calculateSafeToSpend`) memeriksa `no_included_wallets` sebelum `non_positive_balance`, memakai `tzOffsetMinutes` (default `420`), `Math.floor(totalIncludedBalance / remainingDays)`, `'end_of_month'`, defensive clamping `'29'`–`'31'`, `remainingDays >= 1`; `SafeToSpendCard.tsx` menampilkan nominal harian `<PrivacyAmount />`, sisa hari, saldo tergabung, tanggal siklus, serta `Rp0` + pesan panduan terlokalisasi saat kondisi `no_included_wallets`/`non_positive_balance`.
- [ ] **AC-7.2 (Finance Summary API & Filter Konsisten — `F13`, `DATA-3`, `API-1`, `API-5`, `PERF-2`):** `GET /api/finance/summary` (`summary-service.ts`) memakai `API-1`, menolak `401 UNAUTHORIZED` (`SEC-1`), `400 INVALID_CURSOR`, `from > to -> 422`, memetakan `from`/`to` opsional independen via `tzOffset`, menghitung `cashflow` & `categoryBreakdown` selaras filter `type` (transfer dikecualikan -> `0` / `[]`) & `walletId`/`categoryId`, serta keyset cursor ledger gabungan (`limit <= 100`, `type="transfer" & categoryId -> items: []`).
- [ ] **AC-7.3 (Privacy Blur Bebas Flash & `<PrivacyAmount />` — `F17`, `UI-4`, `UI-5`, `ARCH-4`):** `privacy-server.ts` & `PrivacyProvider` di `(app)/app/layout.tsx` (bukan root Landing Page) menyinkronkan cookie `noka_privacy_blur` (`"1"`/`"0"`) dan `localStorage` (`"true"`/`"false"`, dibaca saat cookie absen) tanpa flash SSR; `PrivacyBlurToggle` (`AppShell` `privacyBlurSlot`) memiliki `aria-pressed` & `focus-visible` ring; `<PrivacyAmount />` (`signMode` default `"auto"`, `0` tanpa `+`, negatif dengan `-`) mengubah seluruh nominal di dashboard & toggle langsung tanpa reload.
- [ ] **AC-7.4 (Dashboard UI Terintegrasi & Responsif — `F13`, `UI-3`, `I18N-1`, `I18N-2`):** `FinanceWorkspace.tsx` (di dalam `src/app/(app)/app/finance/page.tsx`) merender `SafeToSpendCard`, `CashflowSummaryCards`, `WalletListSection` (dengan toggle arsip), `LedgerFilterBar`, `LedgerList` Load More, serta modal `RFC-006` dengan refresh ringkasan otomatis; seluruh teks ID/EN terketik di `types.ts`/`id.ts`/`en.ts` tanpa overflow di `360px`, `768px`, `1280px`.
- [ ] **AC-7.5 (Tests & Quality — `TEST-1`, `TEST-2`, `TEST-3`, `QUAL-2`, `QUAL-3`):** `tests/unit/safe-to-spend.test.ts`, `tests/unit/privacy-blur.test.tsx`, dan `tests/integration/finance-summary.test.ts` lulus penuh bersama `npm run lint` dan `npx tsc --noEmit`.
