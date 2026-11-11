# Noka — Agent Workspace Instructions

Proyek **Noka** (*Note + Kas*) mengikuti workflow berbasis PRD → Features → Rules → RFCs → Test Strategy → Implementation → Review.

## Required Context Before Acting

Sebelum merancang arsitektur, membuat RFC, menulis kode, atau melakukan review, **baca dokumen sumber berikut secara langsung** (jangan hanya mengandalkan ringkasan):

1. `RULES.md` — Standar teknis lengkap, versi dependensi terverifikasi, dan ID aturan permanen (`STACK-*`, `ARCH-*`, `DATA-*`, `API-*`, `SEC-*`, `OFFLINE-*`, `UI-*`, `I18N-*`, `PERF-*`, `OBS-*`, `TEST-*`, `QUAL-*`).
2. `PRD.md` — Spesifikasi produk v2.0 (`FR-1`–`FR-22`, `NFR-1`–`NFR-11`) dan keputusan mengikat (`DEC-1`–`DEC-16`).
3. `FEATURES.md` — Katalog fitur (`F1`–`F31`), prioritas MoSCoW, dan *acceptance criteria*.
4. `PRD-REVIEW.md` — Temuan audit kritis (`HIGH-1`–`HIGH-4`, `MED-1`–`MED-3`) yang wajib terpenuhi.
5. `RFCS.md`, `RFCs/RFC-*.md`, dan `TEST-STRATEGY.md` (jika sudah tersedia).

> **Catatan:** Jangan menyisipkan `RULES.md` secara inline penuh ke file ini karena ukurannya (~35 KB) melebihi batas per-file 24 KB dan akan terpotong; selalu baca `RULES.md` langsung dengan tool pembaca file.

## Order of Authority

`PRD.md` > `FEATURES.md` > `RULES.md` > `RFCs/` > rencana implementasi (`QUAL-1`).  
Jika ditemukan kontradiksi antar-artefak atau perubahan kebutuhan, jangan diselesaikan diam-diam — laporkan secara eksplisit atau gunakan skill `manage-changes`.

## Non-Negotiable Project Guardrails

- **Stack Terverifikasi (`STACK-1`–`STACK-6`):** Next.js `16.4.6` (App Router, TypeScript `7.0.2`), React `19.3.1`, Tailwind CSS `4.3.5`, PostgreSQL + Drizzle ORM `0.45.4` (`pg@8.23.1`), `bcryptjs@3.0.3`, `zod@4.6.7`, `react-markdown@10.1.0` + `remark-gfm@4.0.1`, `@aws-sdk/client-s3@3.1166.0`, `file-type@22.3.0`, `resend@6.38.0`, `idb@8.0.4`, Vitest `5.1.0`, Playwright `1.65.0`. Gunakan versi persis di `RULES.md`; verifikasi ke `npm` sebelum menambah paket baru.
- **Integritas Finansial (`DATA-1`–`DATA-5`):** Nominal IDR wajib memakai `bigint` integer (bukan float). Saldo dompet **selalu diturunkan dari `initialBalance` + ledger transaksi/transfer**, tidak pernah ditimpa *Last-Write-Wins*. Transfer antar-dompet wajib atomik dan dikecualikan dari ringkasan pemasukan/pengeluaran maupun *Linked Notes*.
- **Integritas Referensial (`DATA-4`):** Dompet bertransaksi hanya boleh diarsipkan (bukan dihapus), kategori terhapus memindahkan transaksi ke *Lainnya / Other*, folder terhapus memindahkan catatan ke akar, dan catatan terhapus hanya melepas tautan transaksi (`ON DELETE SET NULL`).
- **Offline-First iOS-Safe (`OFFLINE-1`–`OFFLINE-5`):** Pakai `idb` + outbox berbekal UUID & `idempotencyKey` dengan pemicu `online`, `visibilitychange`/fokus, pembukaan aplikasi, dan tombol *Sync Now* — **dilarang bergantung pada `Background Sync API`**. Wajib hapus seluruh IndexedDB & cache Service Worker privat saat Logout atau Hapus Akun.
- **Keamanan & Privasi (`SEC-1`–`SEC-7`, `OBS-2`):** Isolasi `userId` ketat pada seluruh API/storage; jangan aktifkan `rehype-raw` di Markdown; jangan pernah menulis password, token reset, isi catatan, atau nominal transaksi ke log plaintext.
- **Kualitas & Lingkup (`QUAL-2`–`QUAL-4`, MoSCoW):** Fitur v1.1 (`F20`–`F24`) dan *Won't Have* (`F25`–`F31`) dilarang masuk ke kode v1.0. Bebas `TODO`/stub; wajib lulus lint, typecheck, dan test sebelum selesai.

## Workflow & Local Tooling Tips

- Gunakan skill di `.agents/skills/` sesuai tahap (`generate-rfcs` → `test-strategy` → `implement-rfc` → `review-rfc` → `workflow-status`).
- Saat menjalankan skrip pemeriksaan lintas artefak di Windows (jika alias `python3` mengarah ke Microsoft Store stub), jalankan menggunakan `python`:
  `python .agents/skills/workflow-status/scripts/trace-check.py .`

## Git & Branching Workflow (Wajib)

- **Branch per Fitur / RFC (*Conventional Branches*):** Jangan mengerjakan implementasi kode langsung di `main`. Sebelum memulai setiap RFC di `/implement-rfc <id>`, buat branch baru dari `main` terbaru dengan format **`feat/rfc-<id>-<slug>`** (contoh: `feat/rfc-001-foundation-schema-shell`, `feat/rfc-002-auth-password-reset`, dst.; gunakan `fix/...`, `test/...`, `docs/...` untuk perbaikan terpisah).
- **Commit Terstruktur (*Conventional Commits*):** Gunakan prefix standar (`feat(rfc-001): ...`, `fix(rfc-004): ...`, `test(rfc-001): ...`, `docs: ...`, `chore: ...`) secara atomik di branch fitur.
- **Alur Merge & Push ke `origin` (`https://github.com/m-dzikri/noka-app.git`):**
  1. `git checkout main && git pull origin main`
  2. `git checkout -b feat/rfc-<id>-<slug>`
  3. Selesaikan implementasi, lint, typecheck, test suite, dan audit `/review-rfc <id>` hingga bersih (`0 failure(s)` pada `trace-check.py`).
  4. Merge branch fitur yang sudah terverifikasi ke `main` (atau PR/merge bersih), lalu push branch / `main` ke remote `origin`.
- **Keamanan Repository:** Pastikan `.gitignore` mengecualikan `.env*` (kecuali `!.env.example`), `node_modules/`, `.next/`, `.data/`, dan hasil tes sebelum melakukan stage/commit berkas baru.


