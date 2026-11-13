# Implementation RFC Index: Noka

> **Tagline:** *"Seringan Notepad, Serapi Buku Kas."* *(EN: "Light as a Notepad, Tidy as a Ledger.")*  
> **Sumber Dokumen:** `PRD.md` (v2.0), `PRD-REVIEW.md`, `FEATURES.md` (`F1`–`F31`), `RULES.md` (`61` Rules)  
> **Tanggal:** 11 November 2026  
> **Status Workflow:** Siap untuk `/test-strategy` sebelum implementasi `RFC-001`  

---

## Product Type & Scope Alignment

Mengacu pada `## Product Type` di `PRD.md` dan `RULES.md`:
- **Tipe Produk:** **Web App** (Multi-user Responsive Web Application + PWA + Public SEO Pages).
- **Cek Diterapkan:** Auth & Sessions, Authorization per Resource, Data Model & Migrations, Accessibility (a11y), Responsive Layout, Browser Support, Page-Load Budget, SEO for Public Pages, serta **Offline Sync** *(pengecualian eksplisit dari default skip Web App karena diwajibkan `FR-16`)*.
- **Cek Dilewati (Visible Skip):**
  - *Binary Size*: Noka didistribusikan sebagai Web App/PWA di browser (`F31`), bukan biner App Store/Play Store native; ukuran dikontrol melalui *web bundle budget*.
  - *Public Third-Party API SLA & Versioning*: API backend bersifat *first-party internal* khusus web app Noka, bukan open API untuk developer pihak ketiga.

### Artifact Conflict Resolution (`QUAL-1`)
- **Prioritas `F6` vs. `FR-2` / `FR-22`:** `PRD.md` menempatkan pengaturan profil & tanggal siklus (`cycleStartDay`) di Must Have `FR-2` (yang dibutuhkan kalkulator *Safe-to-Spend* `FR-13`) dan penghapusan akun mandiri di Should Have `FR-22`, sementara `FEATURES.md` menggabungkan keduanya ke dalam `F6` (`Should Have`). Mengikuti urutan otoritas `PRD.md > FEATURES.md`:
  - Kolom `cycleStartDay` beserta nilai default (`'1'`) dibuat sejak fondasi database (`RFC-001`) dan dikembalikan oleh `GET /api/auth/me` (`RFC-002`) sehingga `RFC-007` (*Safe-to-Spend*) berfungsi penuh tanpa menunggu `RFC-010`.
  - Fitur `F6` secara utuh tidak ditunda dan masuk ke lingkup v1.0 pada `RFC-010` (`/app/settings` + `DELETE /api/account`), selaras dengan Hari 7 pada `PRD.md`.

---

## Master RFC List

> **Aturan Status:** Kolom **Status** dijaga tetap mutakhir oleh `/implement-rfc <id>` (`In progress` / `Implemented`) dan `/review-rfc <id>` (`Reviewed` / `Changes requested`).

| RFC | Title | Features | Predecessors | Complexity | Cold Read | Status |
|---|---|---|---|---|---|---|
| [RFC-001](RFCs/RFC-001-Foundation-Schema-And-Shell.md) | Project Foundation, Database Schema, Design Tokens & Bilingual Shell | F2, F3 | none | Medium | Passed | Reviewed |
| [RFC-002](RFCs/RFC-002-Authentication-And-Password-Reset.md) | Authentication, Session Security & Password Reset | F4, F5 | RFC-001 | Medium | Passed | Reviewed |
| [RFC-003](RFCs/RFC-003-Public-Landing-Page-And-SEO.md) | Public SEO Landing Page | F1 | RFC-001, RFC-002 | Medium | Passed | Reviewed |
| [RFC-004](RFCs/RFC-004-Notes-Workspace-And-Search.md) | Notes Workspace — Markdown, GFM Checklists, Folders, Tags & Instant Search | F7, F8 | RFC-001, RFC-002 | Medium | Passed | Reviewed |
| [RFC-005](RFCs/RFC-005-Note-Image-Attachments.md) | Secure Note Image Attachments (Online-Only v1.0) | F9 | RFC-001, RFC-002, RFC-004 | Medium | Passed | Reviewed |
| [RFC-006](RFCs/RFC-006-Finance-Core-Ledger.md) | Finance Core — Multi-Wallets, Categories, Ledger Transactions & Atomic Transfers | F10, F11, F12 | RFC-001, RFC-002 | High | Passed | Reviewed |
| [RFC-007](RFCs/RFC-007-Finance-Dashboard-SafeToSpend-Privacy.md) | Finance Dashboard, Safe-to-Spend & Privacy Blur Mode | F13, F16, F17 | RFC-001, RFC-002, RFC-006 | Medium | Passed | Reviewed |
| [RFC-008](RFCs/RFC-008-Smart-Quick-Capture-And-Linked-Notes.md) | Noka Synergy — Smart Quick Capture & Linked Notes ↔ Transactions | F14, F15 | RFC-004, RFC-006, RFC-007 | High | Passed | Reviewed |
| [RFC-009](RFCs/RFC-009-PWA-And-Offline-First-Sync.md) | PWA Installability, IndexedDB Local Mirror & iOS-Safe Offline Sync | F18, F19 | RFC-001, RFC-002, RFC-003, RFC-004, RFC-005, RFC-006, RFC-007, RFC-008 | High | Passed | Reviewed |
| [RFC-010](RFCs/RFC-010-Account-Settings-And-Deletion.md) | Account Settings, Cycle Configuration & Self-Service Account Deletion | F6 | RFC-001, RFC-002, RFC-005, RFC-007, RFC-009 | Medium | Passed | Not started |

---

## Dependency Graph & Parallelization Matrix

### Directed Dependency Graph (Textual)

```text
RFC-001 (Foundation, DB Schema, Design Tokens, i18n, AppShell)
  └── RFC-002 (Auth, Sessions, Reset Password)
        ├── [Branch A] RFC-003 (Public SEO Landing Page) ──────────────────────┐
        ├── [Branch B] RFC-004 (Notes + GFM + Folders/Tags)                    │
        │                └── RFC-005 (Note Image Attachments + StorageAdapter) ┼──┐
        └── [Branch C] RFC-006 (Finance Core: Wallets, Categories, Tx, Xfer)   │  │
                         └── RFC-007 (Dashboard, Safe-to-Spend, Privacy Blur)  │  │
                               └── RFC-008 (Quick Capture & Linked Notes) ─────┘  │
                                     (also depends on RFC-004)                    │
                                                                                  ▼
                                                   RFC-009 (PWA + IndexedDB + Sync Engine)
                                                     └── RFC-010 (Settings, Cycle, Delete Account)
```

### Predecessors & Successors Table

| RFC | Direct Predecessors | Direct Successors | Parallelizable With |
|---|---|---|---|
| **RFC-001** | none | RFC-002, RFC-003, RFC-004, RFC-005, RFC-006, RFC-007, RFC-009, RFC-010 | — *(Critical Path Root)* |
| **RFC-002** | RFC-001 | RFC-003, RFC-004, RFC-005, RFC-006, RFC-007, RFC-009, RFC-010 | — *(Critical Path Gate)* |
| **RFC-003** | RFC-001, RFC-002 | RFC-009 | RFC-004, RFC-005, RFC-006, RFC-007 |
| **RFC-004** | RFC-001, RFC-002 | RFC-005, RFC-008, RFC-009 | RFC-003, RFC-006 |
| **RFC-005** | RFC-001, RFC-002, RFC-004 | RFC-009, RFC-010 | RFC-003, RFC-006, RFC-007 |
| **RFC-006** | RFC-001, RFC-002 | RFC-007, RFC-008, RFC-009 | RFC-003, RFC-004, RFC-005 |
| **RFC-007** | RFC-001, RFC-002, RFC-006 | RFC-008, RFC-009, RFC-010 | RFC-003, RFC-004, RFC-005 |
| **RFC-008** | RFC-004, RFC-006, RFC-007 | RFC-009 | RFC-003, RFC-005 |
| **RFC-009** | RFC-001, RFC-002, RFC-003, RFC-004, RFC-005, RFC-006, RFC-007, RFC-008 | RFC-010 | — *(Integration Gate)* |
| **RFC-010** | RFC-001, RFC-002, RFC-005, RFC-007, RFC-009 | none | — *(Public Readiness Finalizer)* |

---

## Feature Coverage & Deferred Scope (`FEATURES.md`)

### Assigned Features (v1.0 — 19 Features)

| Priority | Count | Feature IDs | RFC Mapping |
|---|---:|---|---|
| **Must Have** | 18 | F1–F5, F7–F19 | `F2,F3`→RFC-001; `F4,F5`→RFC-002; `F1`→RFC-003; `F7,F8`→RFC-004; `F9`→RFC-005; `F10,F11,F12`→RFC-006; `F13,F16,F17`→RFC-007; `F14,F15`→RFC-008; `F18,F19`→RFC-009 |
| **Should Have** | 1 | F6 | `F6`→RFC-010 *(v1.0 Public Readiness)* |

### Deferred Features (v1.1 Post-Launch — 5 Features)

| Feature | Title | Priority | Status | Deferral Reason |
|---|---|---|---|---|
| **F20** | Monthly Category Budgeting | Could | Deferred (v1.1) | Ditunda ke pasca-launch sesuai `DEC-3` agar target rilis v1.0 dalam 7 hari tetap stabil. |
| **F21** | Recurring Transactions Scheduler | Could | Deferred (v1.1) | Ditunda ke pasca-launch sesuai `DEC-3`. |
| **F22** | Debt & Receivables Ledger (*Utang-Piutang*) | Could | Deferred (v1.1) | Ditunda ke pasca-launch sesuai `DEC-3`. |
| **F23** | PDF Note Attachments | Could | Deferred (v1.1) | Lampiran v1.0 dibatasi gambar saja (`DEC-3`, `DEC-9`). |
| **F24** | Financial Data Export (CSV / Excel / PDF) | Could | Deferred (v1.1) | Ditunda ke pasca-launch sesuai `DEC-3`. |

### Explicitly Excluded (Out of Scope — 7 Features)

`F25` (Multi-Currency FX), `F26` (Cross-Account Collaboration), `F27` (Paid External AI/LLM Parser), `F28` (Open Banking Sync), `F29` (Mandatory Signup Email Verification Gate), `F30` (Offline Image Upload & CRDT Sync), dan `F31` (Separate Native iOS/Android Binaries) tidak dijadwalkan pada RFC mana pun (`Won't Have` sesuai `PRD.md` Scope).

---

## Audit Traceability (`PRD-REVIEW.md` Findings)

| Review Finding | Severity | Assigned RFC(s) | Verification Target |
|---|---|---|---|
| **HIGH-1** (Ledger balance integrity & iOS-safe sync) | High | RFC-001, RFC-006, RFC-009 | Saldo diturunkan dari ledger (`DATA-2`); sync via `online`/`visibilitychange`/manual tanpa `Background Sync API`. |
| **HIGH-2** (Safe-to-Spend formula & short-month edge cases) | High | RFC-007, RFC-010 | `max(0, floor(includedBalance / remainingDays))`, `end_of_month` & `28–31`, `0` saat non-positif. |
| **HIGH-3** (Referential integrity & atomic transfers) | High | RFC-001, RFC-004, RFC-006, RFC-008 | Arsip dompet (`409`), migrasi kategori *Lainnya*, folder→root, note→`noteId=NULL`, transfer atomik `from ≠ to`. |
| **HIGH-4** (Min password, 30m reset token, logout wipe, account delete) | High | RFC-002, RFC-009, RFC-010 | Password ≥ 8 char, SHA-256 token 30m cabut semua sesi, wipe IndexedDB + SW, `DELETE /api/account`. |
| **MED-1** (Conservative Quick Capture parser) | Medium | RFC-008 | `"bab 3 skripsi"` / `"meeting jam 10"` terdeteksi sebagai Catatan (`DEC-15`). |
| **MED-2** (GFM checklist & 1-to-N Linked Notes) | Medium | RFC-004, RFC-008 | GFM `- [ ]`/`- [x]` toggle deterministik + relasi `1 Note -> N Transactions` non-transfer. |
| **MED-3** (Critical path 7 days vs Should Have) | Medium | RFC-001–RFC-010 | Jalur kritis `F1–F5, F7–F19` selesai pada `RFC-001`–`RFC-009`; `F6` di `RFC-010`. |

---

## Implementation Roadmap (7-Day Target)

1. **Hari 1:** `RFC-001` (Foundation, DB Schema, Design Tokens, i18n, AppShell) → `RFC-002` (Auth & Reset Password).
2. **Hari 2:** `RFC-003` (Public SEO Landing Page) paralel dengan `RFC-004` (Notes Workspace).
3. **Hari 3:** `RFC-005` (Note Image Attachments) paralel dengan `RFC-006` (Finance Core Ledger).
4. **Hari 4:** `RFC-007` (Finance Dashboard, Safe-to-Spend & Privacy Blur).
5. **Hari 5:** `RFC-008` (Smart Quick Capture & Linked Notes ↔ Transactions).
6. **Hari 6:** `RFC-009` (PWA Manifest, Service Worker, IndexedDB Mirror & iOS-Safe Sync).
7. **Hari 7:** `RFC-010` (Account Settings, Cycle Settings, Account Deletion, Full E2E & Lighthouse Deploy).

---

## Implementation Handoff

- **Langkah sebelum implementasi:** Jalankan `/test-strategy` untuk menyusun `TEST-STRATEGY.md` per RFC sebelum menulis kode pertama.
- **Cara implementasi setiap RFC:** Jalankan `/implement-rfc <id>` (contoh: `/implement-rfc 001`) secara berurutan setelah seluruh pendahulunya (*Predecessors*) selesai.
- **Cara review setiap RFC:** Setelah satu RFC selesai diimplementasikan, jalankan `/review-rfc <id>` pada sesi baru yang bersih untuk memverifikasi kode terhadap *acceptance criteria*, `RULES.md`, dan `TEST-STRATEGY.md` lalu menyimpannya ke `reviews/REVIEW-RFC-<id>.md`.

