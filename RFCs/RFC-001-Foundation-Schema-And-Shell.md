# RFC-001: Project Foundation, Database Schema, Design Tokens & Bilingual Shell

**Features**: F2, F3
**Depends on**: none
**Rules**: STACK-1, STACK-2, STACK-3, STACK-4, ARCH-1, ARCH-2, ARCH-4, ARCH-5, ARCH-6, DATA-1, DATA-4, DATA-6, API-1, API-2, API-3, UI-1, UI-2, UI-3, UI-5, I18N-1, I18N-2, PERF-4, OBS-1, OBS-2, TEST-1, QUAL-1, QUAL-2, QUAL-3
**Complexity**: Medium

---

## Summary

Menyiapkan fondasi proyek **Noka** memakai Next.js `16.4.6` (App Router, TypeScript `7.0.2`), Tailwind CSS `4.3.5`, PostgreSQL + Drizzle ORM `0.45.4`, validasi env terpusat (`src/lib/env.ts`), structured JSON logger dengan `requestId` & redaksi sensitif (`OBS-2`), kelas error & amplop respons terstandar (`src/lib/api-response.ts`), helper idempotensi/LWW bersama (`src/lib/idempotency.ts`), health check (`GET /api/health`), skema database relasional 13 tabel + migrasi awal, token desain `Light/Dark` WCAG 2.1 AA, sistem lokalisasi instan `ID/EN` tanpa reload, komponen UI primitif, dan `AppShell` responsif yang memisahkan navigasi **Catatan** dan **Keuangan**.

*(Catatan cakupan `F2`/`F3`: integrasi toggle di Landing Page publik diselesaikan di `RFC-003`, halaman auth terisolasi di `RFC-002`, sinkronisasi preferensi profil DB di `RFC-010`, dan handler Quick Capture di `RFC-008` via slot props `AppShell`).*

---

## Technical Approach

### 1. Project Scaffold, Scripts & Configs (`STACK-1`, `STACK-2`)
- `package.json` memasang seluruh paket terverifikasi di `RULES.md`:
  - Runtime: `next@16.4.6`, `react@19.3.1`, `react-dom@19.3.1`, `lucide-react@1.72.0`, `clsx@2.1.1`, `tailwind-merge@3.7.0`, `zod@4.6.7`, `react-markdown@10.1.0`, `remark-gfm@4.0.1`, `drizzle-orm@0.45.4`, `pg@8.23.1`, `bcryptjs@3.0.3`, `@aws-sdk/client-s3@3.1166.0`, `@aws-sdk/s3-request-presigner@3.1166.0`, `file-type@22.3.0`, `resend@6.38.0`, `idb@8.0.4`.
  - Dev: `typescript@7.0.2`, `@types/node@26.6.6`, `@types/react@19.3.0`, `@types/react-dom@19.3.0`, `@types/pg@8.23.1`, `@types/bcryptjs@3.0.0`, `tailwindcss@4.3.5`, `@tailwindcss/postcss@4.3.5`, `drizzle-kit@0.31.11`, `vitest@5.1.0`, `@vitejs/plugin-react@6.3.0`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `@testing-library/jest-dom@7.0.1`, `jsdom@31.0.0`, `fake-indexeddb@6.2.8`, `@playwright/test@1.65.0`, `eslint@10.14.0`, `eslint-config-next@16.4.6`.
- `package.json` scripts:
  - `"dev": "next dev"`, `"build": "next build"`, `"start": "next start"`, `"lint": "eslint ."`, `"typecheck": "tsc --noEmit"`, `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`, `"test": "vitest run"`, `"test:unit": "vitest run tests/unit"`, `"test:integration": "vitest run tests/integration"`, `"test:e2e": "playwright test"`.
- Konfigurasi standar:
  - `tsconfig.json`: `strict: true`, `paths: { "@/*": ["./src/*"] }`.
  - `next.config.ts`: `images: { unoptimized: true }`.
  - `postcss.config.mjs`: `@tailwindcss/postcss`.
  - `eslint.config.mjs`: flat config `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`.
  - `vitest.config.ts`: alias `@/*`, `setupFiles: ["./tests/setup.ts"]` (`@testing-library/jest-dom/vitest`), environment `jsdom` default (`tests/unit/**` node files dapat memakai `// @vitest-environment node`) dan `node` untuk `tests/integration/**`, mengecualikan `tests/e2e/**`.
  - `playwright.config.ts`: `testDir: "./tests/e2e"`, projects `desktop` (`1280×800`) dan `mobile` (`375×812`), `webServer` `npm run build && npm run start` (atau `APP_URL`).
  - `drizzle.config.ts`: `schema: "./src/db/schema/index.ts"`, `out: "./src/db/migrations"`, `dialect: "postgresql"`.
  - `.gitignore`: `node_modules/`, `.next/`, `.env*`, `!.env.example`, `.data/`, `playwright-report/`, `test-results/`, `coverage/`.
  - `.env.example`: `DATABASE_URL`, `APP_URL`, `SESSION_SECRET`, grup opsional `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `LOCAL_UPLOADS_DIR`, serta `RESEND_API_KEY`, `EMAIL_FROM`.

### 2. Lazy Env, Logger, API Envelope, Idempotency & DB (`ARCH-6`, `OBS-1`, `OBS-2`, `API-1`, `API-3`)
- **`src/lib/env.ts`**: Mengekspor `getEnv()` (cached kecuali saat `NODE_ENV === "test"`), `getAppUrl()`, dan `resetEnvCacheForTest()`.
  - Pra-normalisasi string kosong `""` -> `undefined` untuk seluruh env opsional sebelum validasi Zod!
  - `getAppUrl(): string`: helper ringan yang **hanya mem-parsing `APP_URL`** melalui Zod (kosong `""`/absen -> `"http://localhost:3000"`, menormalisasi trailing slash `.replace(/\/+$/, "")`) **tanpa mewajibkan `DATABASE_URL` atau `SESSION_SECRET`**, sehingga aman dipakai di halaman/rute SEO publik saat `npm run build` maupun runtime (`ARCH-6`).
  - Wajib pada `getEnv()`: `DATABASE_URL` (`min(1)`), `APP_URL` (`url().default("http://localhost:3000")`, trailing slash dihapus), `SESSION_SECRET` (`min(32)`), `NODE_ENV` (`"development" | "test" | "production"` default `"development"`), `LOCAL_UPLOADS_DIR` (optional).
  - Grup opsional S3/R2 (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`): jika ada salah satu field S3 terisi, wajibkan `S3_ENDPOINT` (`url()`), `S3_BUCKET` (`min(1)`), `S3_ACCESS_KEY_ID` (`min(1)`), `S3_SECRET_ACCESS_KEY` (`min(1)`), dan terapkan fallback `S3_REGION ?? "auto"` hanya bila grup S3 aktif (`STACK-3`).
  - Grup opsional Mailer (`RESEND_API_KEY`, `EMAIL_FROM`): jika salah satu terisi, wajibkan `RESEND_API_KEY` (`min(1)`) dan `EMAIL_FROM` (`min(3)`, mendukung format email maupun `"Noka <noreply@domain>"`) (`STACK-4`).
- **`src/lib/logger.ts`**: Mengekspor `createLogger(requestId?: string | null)` (`requestId` default `null`) dan `logger`:
  - `info` & `warn` menulis JSON satu baris ke `stdout`; `error` menulis ke `stderr` dengan bentuk `{ timestamp, level, requestId, event, ...sanitizedMeta }` di mana field inti (`timestamp`, `level`, `requestId`, `event`) tidak dapat tertimpa `meta`.
  - `sanitizeLogValue()` menyensor **exact case-insensitive** key `{ "content", "amount" }` (agar `contentType`/`contentLength` tetap terbaca) dan **substring case-insensitive** `{ "password", "token", "secret", "cookie", "set-cookie", "authorization", "notecontent", "note_content", "initialbalance", "initial_balance" }` menjadi `"[REDACTED]"`; menserialisasi `Error` hanya dengan `{ name, message }` tanpa `stack`.
- **`src/lib/api-response.ts` & `src/lib/cn.ts`**:
  - `apiOk<T>(data: T, status = 200): NextResponse` -> `{ ok: true, data }`.
  - `apiError(status: number, code: string, message: string, details?: unknown): NextResponse` -> `{ ok: false, error: { code, message, ...(details !== undefined ? { details } : {}) } }`.
  - `class ApiError extends Error { constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) }`.
  - `handleApiError(error: unknown, log?: Logger): NextResponse`: mengonversi `ApiError` menjadi `apiError(error.status, error.code, error.message, error.details)`, error JSON parse (`SyntaxError`) menjadi `400 INVALID_JSON`, dan error tak terduga menjadi `500 INTERNAL_ERROR` setelah mencatat `log.error` tersanitasi.
  - `src/lib/cn.ts`: mengekspor `cn(...inputs: ClassValue[])` menggabungkan `clsx` dan `tailwind-merge`.
- **`src/db/index.ts`**: Menggunakan **inisialisasi lazy** (`getPool()` dan `getDb()`, serta `export const db` berupa getter/Proxy aman) agar impor route saat `npm run build` di CI **tidak pernah memanggil `getEnv()` maupun membuka koneksi DB sebelum request masuk** (`ARCH-6`); menyimpan `pg.Pool` pada `globalThis` di development dan hanya menyalakan `ssl: { rejectUnauthorized: false }` bila host bukan `localhost`/`127.0.0.1` dan `sslmode !== 'disable'`.
- **`src/lib/idempotency.ts`** (`API-3`, `DATA-6`):
  - `canonicalJson(value: unknown): string`: serialisasi JSON deterministik dengan pengurutan kunci objek rekursif (`Object.keys(obj).sort()`), membuang properti objek bernilai `undefined`, menormalkan `bigint` ke string bila ada, dan mempertahankan urutan elemen array.
  - `withIdempotency<T>({ userId, idempotencyKey, method, path, payload, handler }: { userId: string; idempotencyKey?: string; method: string; path: string; payload: unknown; handler: (tx: DbOrTx) => Promise<{ status: number; body: T }> }): Promise<NextResponse>`:
    - Jika `idempotencyKey === undefined`: jalankan `getDb().transaction(async (tx) => handler(tx))` dan kembalikan `NextResponse.json({ ok: true, data: result.body }, { status: result.status })`.
    - Jika `idempotencyKey` dikirim: trim string dan validasi panjang `1..128` (bila kosong/whitespace atau `> 128`, lempar `ApiError(422, "VALIDATION_ERROR")`). Hapus properti `idempotencyKey` dari salinan top-level `payload` sebelum menghitung `requestHash = sha256(canonicalJson(cleanPayload))`.
    - Untuk mencegah race condition pada `READ COMMITTED` ketika dua request paralel mengirim key yang sama: jalankan `getDb().transaction(async (tx) => ...)`:
      1. Lakukan pre-insert ke `idempotency_keys` (`statusCode: 0`, `responseBody: {}`) memakai `ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING id`.
      2. Jika konflik (`0` baris kembali — PostgreSQL menunggu transaksi paralel yang menang sampai commit/abort): lakukan `SELECT` baris `idempotency_keys` milik `(userId, idempotencyKey)`. Bila `(method, path, requestHash)` tidak cocok -> lempar `ApiError(409, "IDEMPOTENCY_KEY_CONFLICT")`; bila cocok -> langsung kembalikan `NextResponse.json(row.responseBody, { status: row.statusCode })` tanpa menjalankan `handler`.
      3. Jika pre-insert berhasil: jalankan `result = await handler(tx)`, bentuk `responseBody = { ok: true, data: result.body }`, lalu `UPDATE idempotency_keys SET status_code = result.status, response_body = responseBody WHERE id`, dan kembalikan `{ status: result.status, responseBody }`.
    - Bila `handler` melempar `ApiError` berstatus `409`: biarkan transaksi domain mengalami rollback penuh, bentuk `errorBody = { ok: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } }`, simpan baris berstatus `409` ke `idempotency_keys` via `getDb()` memakai `ON CONFLICT (user_id, idempotency_key) DO NOTHING`, lalu kembalikan `NextResponse.json(errorBody, { status: 409 })`. Jangan pernah men-cache error `5xx`.
  - `resolveLwwTimestamp(rowUpdatedAt: Date, clientUpdatedAtIso?: string): { serverNewer: boolean; nextUpdatedAt: Date }`:
    - Bila `clientUpdatedAtIso` absen: `{ serverNewer: false, nextUpdatedAt: new Date(Math.max(Date.now(), rowUpdatedAt.getTime())) }`.
    - Bila ada: hitung `parsedMs = Date.parse(clientUpdatedAtIso)`; bila `Number.isNaN(parsedMs)` lempar `ApiError(422, "INVALID_TIMESTAMP")`. Clamp `clamped = new Date(Math.min(parsedMs, Date.now() + 60_000))`; `serverNewer = clamped.getTime() < rowUpdatedAt.getTime()`; `nextUpdatedAt = serverNewer ? rowUpdatedAt : new Date(Math.max(clamped.getTime(), Date.now()))`.

### 3. Design Tokens, Fonts, Modular i18n, UI Primitives & AppShell (`UI-1`–`UI-5`, `I18N-1`–`I18N-2`, `PERF-4`)
- **Fonts (`src/app/layout.tsx`)**: Muat `Plus_Jakarta_Sans` (`--font-sans`, `display: "swap"`) dan `JetBrains_Mono` (`--font-mono`, `display: "swap"`).
- **Design Tokens (`src/styles/tokens.css` & `src/app/globals.css`)**: `:root[data-theme="light"]` & `:root[data-theme="dark"]` dengan kontras **WCAG 2.1 Level AA** (`>= 4.5:1` teks normal, `>= 3:1` komponen UI `UI-2`): `--bg-canvas`, `--bg-surface`, `--bg-subtle`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-default`, `--border-strong`, `--accent-primary`, `--accent-hover`, `--accent-foreground`, `--status-income`, `--status-expense`, `--status-warning`, `--focus-ring`, `--shadow-sm`, `--radius-md`; `globals.css` mengikat `@theme inline` dan `@media (prefers-reduced-motion: reduce)`.
- **Modular `Dictionary` (`src/lib/i18n/types.ts`, `id.ts`, `en.ts`, `server.ts`, `context.tsx`)**:
  - Di `RFC-001`, interface `Dictionary` mewajibkan namespace fondasi `{ common, nav, errors, preferences }` (termasuk kode `"INVALID_TIMESTAMP"` pada `errors`) serta mendefinisikan field namespace domain berikutnya (`auth?`, `landing?`, `notes?`, `folders?`, `finance?`, `privacy?`, `quickCapture?`, `linkedNotes?`, `sync?`, `settings?`) sebagai opsional hingga RFC pemiliknya mengisi kamus nyata (**bebas dummy/stub `QUAL-2`**).
  - `src/lib/i18n/server.ts`: `getServerPreferences()` membaca cookie `noka_locale` (`"id"|"en"`, fallback `"id"`) & `noka_theme` (`"light"|"dark"`, fallback `"light"`) serta menyertakan penanda apakah masing-masing cookie tersedia (`hasCookieLocale`, `hasCookieTheme`).
  - `src/lib/i18n/context.tsx`: mengekspor `I18nContext`, `PreferencesContext`, `useI18n(): { locale: Locale; t: Dictionary; setLocale: (l: Locale) => void }`, dan `usePreferences(): { locale: Locale; theme: Theme; updatePreferences: (patch: { locale?: Locale; theme?: Theme }, options?: { persist?: boolean }) => void; registerPersistHandler: (fn: (patch: { locale?: Locale; theme?: Theme }) => Promise<void> | void) => () => void }`.
  - `PreferencesProvider.tsx` menyimpan state `{ locale, theme }` dari SSR prop awal (`initialLocale`, `initialTheme`); saat mount **hanya jika cookie SSR absen**, memeriksa `localStorage` (`noka_locale`/`noka_theme`) dalam `try/catch`. Ketika `updatePreferences(patch, { persist })` dijalankan (`persist` default `true`), ia memperbarui state React, `document.documentElement.dataset.theme`, `document.documentElement.lang`, `localStorage`, cookie non-HttpOnly (`Path=/; Max-Age=31536000; SameSite=Lax`), serta memanggil persist handler terdaftar (`RFC-010`) bila `persist !== false` **tanpa `router.refresh()`/reload** (`I18N-2`) dan tanpa me-nesting `PreferencesProvider` ganda!
- **UI Primitives & `AppShell` (`F3`, `ARCH-5`)**:
  - `Button.tsx`, `Input.tsx`, `Card.tsx`, `Modal.tsx` (focus trap, `Escape`, backdrop click, `role="dialog"`, `aria-modal="true"`), `ThemeToggle.tsx` (`aria-pressed`), `LocaleToggle.tsx` (`aria-pressed`).
  - `WorkspaceNav.tsx` (`{ currentPath: string }`) & `AppShell.tsx` (`{ children, currentPath?, user?: { id: string; name: string; email: string } | null, quickCaptureSlot?: ReactNode, privacyBlurSlot?: ReactNode, syncStatusSlot?: ReactNode, logoutSlot?: ReactNode, onMobileQuickAction?: () => void }`):
    - Merender `ThemeToggle` & `LocaleToggle` serta badge nama `user` di header kompak (`360px`+ wrap-safe), navigasi terpisah ke `/app/notes`, `/app/finance`, `/app/settings`, dan mobile bottom bar (tombol tengah memicu `onMobileQuickAction`, atau fallback default memfokuskan `#noka-quick-capture-input` jika ada, else navigasi ke `/app/notes`).
  - `src/app/(app)/app/layout.tsx` (Server Component) membungkus route `/app/*` dengan `<AppShell>` (belum memasang guard redirect login hingga `RFC-002`), sedangkan `src/app/(app)/app/page.tsx` merender ringkasan overview awal berisi kartu sambutan bilingual dan tautan cepat ke `/app/notes` dan `/app/finance` (sebelum nantinya dialihkan di `RFC-004`).

---

## Database Schema Changes

Seluruh 13 tabel pada `src/db/schema/*` (`auth.ts`, `notes.ts`, `finance.ts`, `sync.ts`, index via `index.ts`) + `src/db/migrations/0000_init.sql`. Kecuali `note_tags` yang memakai composite PK `(noteId, tagId)` tanpa `id`/timestamp, seluruh tabel memakai `id: uuid().defaultRandom().primaryKey()` dan `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()` (serta `updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()` pada entitas yang dapat diubah):

1. **`users`** (`auth.ts`): `id`, `name` (`varchar(120)`), `email` (`varchar(255)` unique), `passwordHash` (`text`), `locale` (`varchar(2)` default `'id'`), `theme` (`varchar(5)` default `'light'`), `cycleStartDay` (`varchar(16)` default `'1'`), `createdAt`, `updatedAt`.
2. **`sessions`** (`auth.ts`): `id`, `userId` (FK `users.id` `ON DELETE CASCADE`), `tokenHash` (`varchar(64)` unique), `expiresAt` (`timestamptz`), `createdAt`. Index `(userId)`.
3. **`password_reset_tokens`** (`auth.ts`): `id`, `userId` (FK `users.id` `ON DELETE CASCADE`), `tokenHash` (`varchar(64)` unique), `expiresAt` (`timestamptz`), `usedAt` (`timestamptz` nullable), `createdAt`. Index `(userId)`.
4. **`folders`** (`notes.ts`): `id`, `userId` (FK `users.id` `ON DELETE CASCADE`), `name` (`varchar(80)`), `createdAt`, `updatedAt`, `deletedAt` (`timestamptz` nullable). Partial unique index `folders_user_name_active_idx` pada `(userId, lower(name)) WHERE deleted_at IS NULL`.
5. **`notes`** (`notes.ts`): `id`, `userId` (FK `users.id` `ON DELETE CASCADE`), `folderId` (FK `folders.id` `ON DELETE SET NULL`, **nullable**), `title` (`varchar(200)` default `''`), `content` (`text` default `''`), `isPinned` (`boolean` default `false`), `createdAt`, `updatedAt`, `deletedAt` (`timestamptz` nullable). Index `(userId, isPinned DESC, updatedAt DESC, id DESC) WHERE deleted_at IS NULL`.
6. **`tags`** (`notes.ts`): `id`, `userId` (FK `users.id` `ON DELETE CASCADE`), `name` (`varchar(40)`), `createdAt`, `updatedAt`, `deletedAt` (`timestamptz` nullable). Partial unique index `(userId, lower(name)) WHERE deleted_at IS NULL`.
7. **`note_tags`** (`notes.ts`): `noteId` (FK `notes.id` `ON DELETE CASCADE`), `tagId` (FK `tags.id` `ON DELETE CASCADE`), composite PK `(noteId, tagId)`.
8. **`note_attachments`** (`notes.ts`): `id`, `userId` (FK `users.id` `ON DELETE CASCADE`), `noteId` (FK `notes.id` `ON DELETE CASCADE`), `storageKey` (`text` unique), `mimeType` (`varchar(32)`), `sizeBytes` (`integer`), `createdAt`. Index `(noteId)`.
9. **`wallets`** (`finance.ts`): `id`, `userId` (FK `users.id` `ON DELETE CASCADE`), `name` (`varchar(80)`), `type` (`varchar(16)` `'cash'|'bank'|'ewallet'`), `initialBalance` (`bigint({ mode: 'number' })` default `0`), `includeInSafeToSpend` (`boolean` `.notNull().default(true)`), `isDefault` (`boolean` `.notNull().default(false)`), `archivedAt` (`timestamptz` nullable), `createdAt`, `updatedAt`, `deletedAt` (`timestamptz` nullable). Index `(userId)`, `CHECK (initial_balance >= 0)`.
10. **`categories`** (`finance.ts`): `id`, `userId` (FK `users.id` `ON DELETE CASCADE`), `name` (`varchar(60)`), `type` (`varchar(16)` `'income'|'expense'`), `isSystem` (`boolean` default `false`), `systemKey` (`varchar(40)` nullable), `createdAt`, `updatedAt`, `deletedAt` (`timestamptz` nullable). Partial unique index `(userId, systemKey) WHERE system_key IS NOT NULL AND deleted_at IS NULL`.
11. **`transfers`** (`finance.ts`): `id`, `userId` (FK `users.id` `ON DELETE CASCADE`), `fromWalletId` (FK `wallets.id` `ON DELETE RESTRICT`), `toWalletId` (FK `wallets.id` `ON DELETE RESTRICT`), `amount` (`bigint({ mode: 'number' })`), `note` (`varchar(300)` nullable), `occurredAt` (`timestamptz`), `createdAt`, `updatedAt`, `deletedAt` (`timestamptz` nullable). Index `(userId, occurredAt)`, `(fromWalletId)`, `(toWalletId)`, `CHECK (amount > 0)`, `CHECK (from_wallet_id <> to_wallet_id)`.
12. **`transactions`** (`finance.ts`): `id`, `userId` (FK `users.id` `ON DELETE CASCADE`), `walletId` (FK `wallets.id` `ON DELETE RESTRICT`), `categoryId` (FK `categories.id` `ON DELETE RESTRICT`), `noteId` (FK `notes.id` `ON DELETE SET NULL`, **nullable**), `type` (`varchar(16)` `'income'|'expense'`), `amount` (`bigint({ mode: 'number' })`), `description` (`varchar(300)` nullable), `occurredAt` (`timestamptz`), `createdAt`, `updatedAt`, `deletedAt` (`timestamptz` nullable). Index `(userId, occurredAt)`, `(userId, walletId)`, `(noteId)`, `CHECK (amount > 0)`.
13. **`idempotency_keys`** (`sync.ts`): `id`, `userId` (FK `users.id` `ON DELETE CASCADE`), `idempotencyKey` (`varchar(128)`), `method` (`varchar(10)`), `path` (`varchar(200)`), `requestHash` (`varchar(64)`), `statusCode` (`integer`), `responseBody` (`jsonb`), `createdAt`. Unique index `(userId, idempotencyKey)` (`DATA-6`).

---

## API Contracts Exposed

- `GET /api/health` (`OBS-1`): Menjalankan `SELECT 1` ber-timeout `2000 ms` + `createLogger(requestId)`.
  - Sukses: `200` `{ ok: true, data: { status: "ok", db: "connected", timestamp: "<ISO-8601>" } }`.
  - Gagal: `503` `{ ok: false, error: { code: "DB_UNAVAILABLE", message: "Database health check failed" } }`.

---

## Implementation Details

### File Structure
- Root configs: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `drizzle.config.ts`, `.env.example`, `.gitignore`
- Core libs: `src/lib/env.ts`, `src/lib/logger.ts`, `src/lib/api-response.ts`, `src/lib/idempotency.ts`, `src/lib/cn.ts`
- DB: `src/db/index.ts`, `src/db/schema/index.ts`, `src/db/schema/auth.ts`, `src/db/schema/notes.ts`, `src/db/schema/finance.ts`, `src/db/schema/sync.ts`, `src/db/migrations/0000_init.sql`
- Styles & i18n: `src/styles/tokens.css`, `src/app/globals.css`, `src/lib/i18n/types.ts`, `src/lib/i18n/dictionaries/id.ts`, `src/lib/i18n/dictionaries/en.ts`, `src/lib/i18n/context.tsx`, `src/lib/i18n/server.ts`
- UI & Layout: `src/components/providers/PreferencesProvider.tsx`, `src/components/ui/Button.tsx`, `src/components/ui/Input.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/Modal.tsx`, `src/components/ui/ThemeToggle.tsx`, `src/components/ui/LocaleToggle.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/WorkspaceNav.tsx`, `src/components/layout/AppOverview.tsx`
- App routes: `src/app/layout.tsx`, `src/app/(app)/app/layout.tsx`, `src/app/(app)/app/page.tsx`, `src/app/api/health/route.ts`
- Tests: `tests/setup.ts`, `tests/setup.integration.ts`, `tests/unit/logger.test.ts`, `tests/unit/env.test.ts`, `tests/unit/db.test.ts`, `tests/unit/idempotency.test.ts`, `tests/unit/preferences-i18n.test.tsx`, `tests/unit/shell-layout.test.tsx`, `tests/integration/health.test.ts`, `tests/integration/idempotency-db.test.ts`

---

## Acceptance Criteria

- [x] **AC-1.1 (Scaffold, Configs & Pin Versi — `STACK-1`, `STACK-2`):** Seluruh file root config (`package.json`, `package-lock.json`, `tsconfig.json` `strict: true` + alias `@/*`, `next.config.ts` `images: { unoptimized: true }`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts` dengan `setupFiles: ["./tests/setup.ts"]`, environment `jsdom`/`node`, & eksklusi `tests/e2e/**`, `playwright.config.ts` `1280×800` & `375×812`, `drizzle.config.ts`, `.env.example`, `.gitignore` mengecualikan `.env*` + `.data/`) ada lengkap beserta script (`dev`, `build`, `start`, `lint`, `typecheck`, `db:generate`, `db:migrate`, `test`, `test:unit`, `test:integration`, `test:e2e`) dan versi paket exact sesuai `RULES.md`.
- [x] **AC-1.2 (Lazy Env, Logger, API Envelope, Idempotency & Health — `ARCH-6`, `OBS-1`, `OBS-2`, `API-1`, `API-3`, `STACK-3`, `STACK-4`):** `getEnv()` / `getAppUrl()` / `resetEnvCacheForTest()` menormalkan `""` ke `undefined`, mewajibkan `SESSION_SECRET >= 32`, `APP_URL`, mengizinkan grup S3/Resend kosong, menolak grup parsial, menyetel fallback `S3_REGION ?? "auto"`, memvalidasi `S3_ENDPOINT`/`EMAIL_FROM` saat aktif, dan membiarkan `getAppUrl()` berjalan tanpa `DATABASE_URL`/`SESSION_SECRET` (`tests/unit/env.test.ts`); `createLogger(requestId)` / `logger` menulis single-line JSON (`stdout`/`stderr`) tanpa penimpaan field inti, menyensor key sensitif exact (`content`, `amount`) & substring (`password`, `token`, `secret`, dll.), dan memformat Error menjadi `{ name, message }` tanpa stack (`tests/unit/logger.test.ts`); `apiOk`/`apiError`/`ApiError`/`handleApiError` (termasuk `400 INVALID_JSON` & `500 INTERNAL_ERROR`), `withIdempotency` (`1..128` char key, `canonicalJson` tanpa `idempotencyKey`, race-safe `ON CONFLICT DO NOTHING` pre-insert, cache `2xx`/`409`, skip `5xx`), & `resolveLwwTimestamp` (60s future skew clamp & `422 INVALID_TIMESTAMP`) (`tests/unit/idempotency.test.ts` & `tests/integration/idempotency-db.test.ts`) berfungsi penuh; `src/db/index.ts` (`getPool()`, `getDb()`, `db`, dev `globalThis` pool cache, SSL kondisional non-localhost) lazy-initialized + `GET /api/health` (`2000 ms` timeout, `200`/`503`) lulus `tests/integration/health.test.ts` dan `npm run build` tanpa env DB aktif.
- [x] **AC-1.3 (Skema DB 13 Tabel & Migrasi — `DATA-1`, `DATA-4`, `DATA-6`):** Semua 13 tabel pada `src/db/schema/*` (`index`, `auth`, `notes`, `finance`, `sync`) & `0000_init.sql` mendefinisikan `timestamptz`, PK UUID `.defaultRandom()` (dan composite PK `(noteId, tagId)` pada `note_tags`), nominal finansial `bigint({ mode: 'number' })` pada `wallets.initialBalance`, `transfers.amount`, & `transactions.amount`, constraint unik (`users.email`, `sessions.token_hash`, `password_reset_tokens.token_hash`, `note_attachments.storage_key`, `(user_id, idempotency_key)`), nullable `notes.folder_id` & `transactions.note_id` (`ON DELETE SET NULL`), `ON DELETE CASCADE`/`RESTRICT`, `CHECK (initial_balance >= 0)`/`amount > 0`/`from_wallet_id <> to_wallet_id`, `.notNull().default(...)` pada flag wallet, serta index parsial/query.
- [x] **AC-1.4 (Bilingual, Tokens Kontras AA & Theme Tanpa Reload — `F2`, `I18N-1`, `I18N-2`, `UI-1`, `UI-2`, `PERF-4`, `QUAL-2`):** `tokens.css` & `globals.css` (`@theme inline`, `@media (prefers-reduced-motion: reduce)`, rasio kontras Light/Dark WCAG AA `>= 4.5:1`), `next/font/google` `display: "swap"` di `src/app/layout.tsx`, `i18n/{types,context,server}` (`Dictionary` mewajibkan `{ common, nav, errors, preferences }` termasuk `INVALID_TIMESTAMP` serta membiarkan namespace domain mendatang opsional tanpa stub; `getServerPreferences()` default `'id'`/`'light'`; `useI18n`, `usePreferences`, `registerPersistHandler`), kamus `id.ts`/`en.ts`, `PreferencesProvider` (fallback `localStorage` hanya saat cookie SSR absen; perbarui DOM `data-theme`/`lang`, `localStorage`, cookie non-HttpOnly & persist handler), `ThemeToggle` (`aria-pressed`), dan `LocaleToggle` (`aria-pressed`) mengubah tema/bahasa tanpa refresh/reset `<input>` (`tests/unit/preferences-i18n.test.tsx`).
- [x] **AC-1.5 (UI Primitives, Responsive AppShell & a11y — `F3`, `ARCH-5`, `UI-3`, `UI-5`):** `src/lib/cn.ts`, `Button`, `Input`, `Card`, `Modal` (focus trap, `Escape`, backdrop click, ARIA), `WorkspaceNav` (navigasi terpisah ke `/app/notes`, `/app/finance`, `/app/settings`), `AppShell` (slots, `user`, mobile quick action fallback memfokuskan `#noka-quick-capture-input` -> `/app/notes`, wrap-safe `360px`+), `src/app/(app)/app/layout.tsx`, dan `src/app/(app)/app/page.tsx` (kartu sambutan bilingual & tautan cepat `/app/notes` + `/app/finance`) terverifikasi keyboard/ARIA/struktur responsif di `tests/unit/shell-layout.test.tsx` (`tests/setup.ts`).
- [x] **AC-1.6 (Build & Verification — `QUAL-2`, `QUAL-3`, `TEST-1`):** Bebas `TODO`/stub (`QUAL-2`), dan `npm run lint`, `npm run typecheck`, `npm test`, serta `npm run build` lulus penuh.

---

## Implementation Considerations

- **Build-Time Safety**: Karena `npm run build` mengimpor module API route tanpa koneksi PostgreSQL, `src/db/index.ts` dan `getEnv()` hanya dievaluasi saat pemanggilan fungsi request-time, bukan di level top-level modul.

---

## Implementation Notes

- **Side-by-Side TypeScript 7.0 + TypeScript 6.0 (`QUAL-4`)**: `eslint-config-next@16.4.6` memuat `typescript-eslint@^8.56.0` yang melempar error runtime apabila `require("typescript")` menunjuk ke TypeScript 7.0 (`typescript-eslint does not support TS 7.0.`). Mengikuti panduan resmi Microsoft TS 7.0 side-by-side (Opsi A disetujui pengguna), `package.json` memasang `"@typescript/native": "npm:typescript@7.0.2"` (menyediakan biner CLI `tsc` v7.0.2 untuk `npm run typecheck`) bersama alias `"typescript": "npm:@typescript/typescript6@6.0.2"` (menyediakan API JS TS 6.0 untuk ESLint/`typescript-eslint`).
- **Vitest 5 `projects`**: `vitest.config.ts` memakai opsi `projects` (`unit` → `jsdom`, `integration` → `node`) karena `vitest@5.1.0` menggantikan `environmentMatchGlobs` dengan `projects`.
- **Komponen Daun `AppOverview.tsx` (`ARCH-1`, `I18N-2`)**: Ekstraksi `src/components/layout/AppOverview.tsx` sebagai leaf `"use client"` memungkinkan `src/app/(app)/app/page.tsx` tetap menjadi Server Component sambil mendukung pergantian bahasa instan tanpa reload di kartu sambutan `/app`.
- **Isolasi Migrasi & DB Uji (`TEST-1`, `TEST-3`)**: Ditambahkan `tests/setup.integration.ts` (khusus proyek `integration` di `vitest.config.ts`) yang mengarahkan `/noka_dev` ke `/noka_test` saat `DATABASE_URL` env shell tidak disetel eksplisit serta menserialisasikan `drizzle-orm` `migrate()` dengan PostgreSQL `pg_advisory_lock(78421001)` agar eksekusi paralel worker Vitest bebas konflik `CREATE SCHEMA IF NOT EXISTS "drizzle"`. `drizzle.config.ts` juga membaca `.env` melalui `process.loadEnvFile()` jika `DATABASE_URL` belum ada di environment shell.
- **Perbaikan Audit `REVIEW-RFC-001.md` (`STACK-4`, `DATA-6`, `UI-2`, `UI-5`, `OBS-1`, `TEST-1`)**:
  - `src/db/index.ts` kini men-cache singleton `Pool` & `AppDatabase` di `production` (beserta reset otomatis saat `DATABASE_URL` berubah dan normalisasi IPv6 `[::1]` di `shouldEnableSsl()`), diverifikasi pada `tests/unit/db.test.ts`.
  - `src/styles/tokens.css`, `src/app/globals.css`, dan `src/components/ui/Button.tsx` menggunakan token khusus `--danger-bg` (`#b91c1c` light / `#dc2626` dark) & `--danger-fg` (`#ffffff`) untuk memenuhi kontras WCAG 2.1 Level AA pada `Button variant="danger"`.
  - `src/components/ui/Modal.tsx` menyimpan `onClose` di `onCloseRef` sehingga `useEffect` bergantung `[open]` saja dan tidak mereset fokus controlled input saat komponen induk re-render.
  - `src/components/ui/Card.tsx` mendukung prop `as?: "h1" | "h2" | "h3"` dan `src/components/layout/AppOverview.tsx` merender judul sambutan sebagai `<h1>`; `src/components/layout/WorkspaceNav.tsx` mengekspor `isWorkspaceRouteActive()` untuk digunakan bersama oleh navigasi mobile `AppShell.tsx`.
  - `src/components/providers/PreferencesProvider.tsx` melewati pembaruan no-op saat `locale` dan `theme` tidak berubah, dan `src/app/api/health/route.ts` menormalisasi serta membatasi header `x-request-id` (maks 128 karakter tanpa karakter kontrol).
  - Ditambahkan regression test pada `tests/unit/idempotency.test.ts`, `tests/integration/idempotency-db.test.ts` (key `undefined`, batas 1/128/129 karakter, konflik method/path `409`), `tests/unit/env.test.ts`, `tests/unit/preferences-i18n.test.tsx`, `tests/unit/shell-layout.test.tsx`, dan `tests/integration/health.test.ts`.

