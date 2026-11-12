import "fake-indexeddb/auto";
import fs from "node:fs";
import path from "node:path";
import { createElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { SyncProvider } from "@/components/providers/SyncProvider";
import type { AuthUser } from "@/features/auth/session";
import { detectOfflineCapabilities, probeIndexedDbAvailability } from "@/features/sync/capabilities";
import { wipeAllOfflineData } from "@/features/sync/cleanup";
import {
  buildOptimisticFolderDto,
  buildOptimisticNoteDto,
  buildOptimisticTransactionDto,
  buildOptimisticTransferDto,
  executeOfflineCapableMutation,
} from "@/features/sync/client-api";
import {
  applySnapshotWithPendingReplay,
  closeAllOfflineDbs,
  enqueueOutboxMutation,
  getOfflineDb,
  listOutboxItems,
  readFullMirror,
  suppressOfflineDbs,
} from "@/features/sync/db";
import { discardOutboxMutation, flushOutbox } from "@/features/sync/engine";
import {
  computeLocalFinanceSummary,
  computeLocalLinkedTransactions,
  queryLocalNotes,
  queryLocalTransactionsForPicker,
} from "@/features/sync/local-queries";
import type { SnapshotDto } from "@/features/sync/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WALLET_CASH_ID = "22222222-2222-4222-8222-222222222221";
const WALLET_BANK_ID = "22222222-2222-4222-8222-222222222222";
const WALLET_ARCHIVED_ID = "22222222-2222-4222-8222-222222222223";
const CAT_FOOD_ID = "33333333-3333-4333-8333-333333333331";
const CAT_SALARY_ID = "33333333-3333-4333-8333-333333333332";
const NOTE_ID = "44444444-4444-4444-8444-444444444441";
const FOLDER_ID = "55555555-5555-4555-8555-555555555551";

const SAMPLE_USER: AuthUser = {
  id: USER_ID,
  name: "Sync Tester",
  email: "sync@noka.test",
  locale: "id",
  theme: "light",
  cycleStartDay: "1",
};

function makeSampleSnapshot(overrides: Partial<SnapshotDto> = {}): SnapshotDto {
  const now = new Date().toISOString();
  return {
    serverTime: now,
    user: SAMPLE_USER,
    folders: [
      {
        id: FOLDER_ID,
        name: "Belanja",
        noteCount: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
    tags: [
      {
        id: "66666666-6666-4666-8666-666666666661",
        name: "penting",
        noteCount: 1,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
    ],
    notes: [
      {
        id: NOTE_ID,
        folderId: FOLDER_ID,
        folderName: "Belanja",
        title: "Catatan Awal",
        content: "- [ ] Beras",
        isPinned: true,
        tags: [{ id: "66666666-6666-4666-8666-666666666661", name: "penting" }],
        checklistTotal: 1,
        checklistCompleted: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    noteAttachments: [],
    wallets: [
      {
        id: WALLET_CASH_ID,
        name: "Kas Tunai",
        type: "cash",
        initialBalance: 500_000,
        currentBalance: 500_000,
        includeInSafeToSpend: true,
        isDefault: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: WALLET_BANK_ID,
        name: "Tabungan",
        type: "bank",
        initialBalance: 1_000_000,
        currentBalance: 1_000_000,
        includeInSafeToSpend: false,
        isDefault: false,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: WALLET_ARCHIVED_ID,
        name: "Dompet Arsip",
        type: "ewallet",
        initialBalance: 250_000,
        currentBalance: 250_000,
        includeInSafeToSpend: true,
        isDefault: false,
        archivedAt: "2026-10-01T00:00:00.000Z",
        createdAt: now,
        updatedAt: now,
      },
    ],
    categories: [
      {
        id: CAT_FOOD_ID,
        name: "Makan & Minum",
        type: "expense",
        isSystem: true,
        systemKey: "food_drink",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: CAT_SALARY_ID,
        name: "Gaji",
        type: "income",
        isSystem: true,
        systemKey: "salary",
        createdAt: now,
        updatedAt: now,
      },
    ],
    transactions: [],
    transfers: [],
    ...overrides,
  };
}

function collectFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

describe("RFC-009 Offline Sync Engine, Local Mirror, Capabilities & Purge (TS-009-01)", () => {
  const originalIndexedDb = globalThis.indexedDB;
  const originalCaches = (globalThis as { caches?: CacheStorage }).caches;

  beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      writable: true,
      value: new IDBFactory(),
    });
  });

  afterEach(async () => {
    await closeAllOfflineDbs();
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      writable: true,
      value: originalIndexedDb,
    });
    if (originalCaches === undefined) {
      delete (globalThis as { caches?: CacheStorage }).caches;
    } else {
      Object.defineProperty(globalThis, "caches", {
        configurable: true,
        writable: true,
        value: originalCaches,
      });
    }
  });

  it("contains zero Background Sync API / SyncManager references in src/ and public/sw.js (OFFLINE-3)", () => {
    const root = process.cwd();
    const filesToScan = [
      ...collectFilesRecursive(path.join(root, "src")),
      path.join(root, "public", "sw.js"),
    ];

    const forbiddenPatterns = [
      /\bSyncManager\b/,
      /\.sync\.register\b/,
      /addEventListener\(\s*["']sync["']/,
      /\bonsync\b/,
    ];

    for (const file of filesToScan) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(
          pattern.test(content),
          `Forbidden Background Sync pattern ${pattern.source} found in ${file}`,
        ).toBe(false);
      }
    }
  });

  it("opens IndexedDB mirror without invalid boolean/null indexes and replays pending outbox on snapshot refresh", async () => {
    const initialSnapshot = makeSampleSnapshot();
    await applySnapshotWithPendingReplay(USER_ID, initialSnapshot);

    const db = await getOfflineDb(USER_ID);
    expect(Array.from(db.objectStoreNames)).toEqual(
      expect.arrayContaining([
        "notes",
        "folders",
        "tags",
        "noteAttachments",
        "wallets",
        "categories",
        "transactions",
        "transfers",
        "meta",
        "outbox",
      ]),
    );

    // Notes contain boolean (isPinned) and nullable (folderId) values; no DataError occurs.
    const pendingNoteId = "77777777-7777-4777-8777-777777777771";
    const optimisticNote = buildOptimisticNoteDto({
      id: pendingNoteId,
      title: "Offline Catatan Baru",
      content: "- [x] Item selesai",
      folderId: null,
      folderName: null,
      isPinned: false,
      tagNames: ["offline"],
    });

    await enqueueOutboxMutation(USER_ID, {
      mutationId: "88888888-8888-4888-8888-888888888881",
      createdAt: 1000,
      idempotencyKey: "idem-note-pending",
      entity: "note",
      entityId: pendingNoteId,
      op: "upsert",
      method: "POST",
      path: "/api/notes",
      body: { id: pendingNoteId, title: "Offline Catatan Baru", content: "- [x] Item selesai" },
      optimisticSnapshot: { kind: "note_upsert", note: optimisticNote },
      updatedAt: optimisticNote.updatedAt,
      status: "pending",
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
    });

    // Server snapshot arrives before outbox flushed -> pending item must be replayed on top!
    const refreshedMirror = await applySnapshotWithPendingReplay(USER_ID, makeSampleSnapshot());
    expect(refreshedMirror.notes.some((n) => n.id === pendingNoteId)).toBe(true);
    expect(refreshedMirror.notes).toHaveLength(2);
  });

  it("detects blocked IndexedDB in restricted private mode and renders non-blocking online-only fallback banner (OFFLINE-1)", async () => {
    const blockedIdb = {
      open: vi.fn(() => {
        throw new DOMException("IndexedDB disabled in private mode", "SecurityError");
      }),
    };

    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      writable: true,
      value: blockedIdb,
    });

    const probe = await probeIndexedDbAvailability();
    expect(probe.available).toBe(false);

    const caps = await detectOfflineCapabilities();
    expect(caps.indexedDbAvailable).toBe(false);

    function wrap<P extends { children: ReactNode }>(
      component: ComponentType<P>,
      props: Omit<P, "children">,
      child: ReactNode,
    ): ReactElement {
      return createElement(component, props as P, child);
    }

    render(
      wrap(
        PreferencesProvider,
        {
          initialLocale: "id",
          initialTheme: "light",
        },
        wrap(
          SyncProvider,
          {
            user: SAMPLE_USER,
          },
          createElement(
            "div",
            { "data-testid": "child-ok" },
            "App Ready",
          ),
        ),
      ),
    );

    expect(screen.getByTestId("child-ok")).toHaveTextContent("App Ready");
    await waitFor(() => {
      expect(screen.getByTestId("offline-capability-banner")).toBeInTheDocument();
    });
  });

  it("queues mutations offline across Notes, Folders, Transactions, and Transfers and computes ledger + Safe-to-Spend locally", async () => {
    await applySnapshotWithPendingReplay(USER_ID, makeSampleSnapshot());

    const folderId = "99999999-9999-4999-8999-999999999991";
    const offlineCtx = {
      userId: USER_ID,
      isOnline: false,
      storageAvailable: true,
    };

    const folderRes = await executeOfflineCapableMutation(offlineCtx, {
      entity: "folder",
      entityId: folderId,
      op: "upsert",
      method: "POST",
      path: "/api/folders",
      body: { id: folderId, name: "Kerja" },
      optimisticSnapshot: {
        kind: "folder_upsert",
        folder: buildOptimisticFolderDto({ id: folderId, name: "Kerja" }),
      },
    });
    expect(folderRes.mode).toBe("queued");

    const txId = "99999999-9999-4999-8999-999999999992";
    const txDto = buildOptimisticTransactionDto({
      id: txId,
      walletId: WALLET_CASH_ID,
      walletName: "Kas Tunai",
      categoryId: CAT_FOOD_ID,
      categoryName: "Makan & Minum",
      noteId: NOTE_ID,
      type: "expense",
      amount: 50_000,
      description: "Beli kopi",
      occurredAt: new Date().toISOString(),
    });
    const txRes = await executeOfflineCapableMutation(offlineCtx, {
      entity: "transaction",
      entityId: txId,
      op: "upsert",
      method: "POST",
      path: "/api/transactions",
      body: { id: txId, walletId: WALLET_CASH_ID, categoryId: CAT_FOOD_ID, type: "expense", amount: 50_000 },
      optimisticSnapshot: { kind: "transaction_upsert", transaction: txDto },
    });
    expect(txRes.mode).toBe("queued");

    const trId = "99999999-9999-4999-8999-999999999993";
    const trDto = buildOptimisticTransferDto({
      id: trId,
      fromWalletId: WALLET_CASH_ID,
      fromWalletName: "Kas Tunai",
      toWalletId: WALLET_BANK_ID,
      toWalletName: "Tabungan",
      amount: 100_000,
      note: "Topup tabungan",
      occurredAt: new Date().toISOString(),
    });
    const trRes = await executeOfflineCapableMutation(offlineCtx, {
      entity: "transfer",
      entityId: trId,
      op: "upsert",
      method: "POST",
      path: "/api/transfers",
      body: { id: trId, fromWalletId: WALLET_CASH_ID, toWalletId: WALLET_BANK_ID, amount: 100_000 },
      optimisticSnapshot: { kind: "transfer_upsert", transfer: trDto },
    });
    expect(trRes.mode).toBe("queued");

    const mirror = await readFullMirror(USER_ID);
    const outbox = await listOutboxItems(USER_ID);
    expect(outbox).toHaveLength(3);

    const summary = computeLocalFinanceSummary(mirror, { includeArchived: true });
    // Kas Tunai: 500,000 - 50,000 (expense) - 100,000 (transfer out) = 350,000
    // Tabungan: 1,000,000 + 100,000 (transfer in) = 1,100,000
    const cashWallet = summary.wallets.find((w) => w.id === WALLET_CASH_ID);
    const bankWallet = summary.wallets.find((w) => w.id === WALLET_BANK_ID);
    expect(cashWallet?.currentBalance).toBe(350_000);
    expect(bankWallet?.currentBalance).toBe(1_100_000);
    // Total active balance excludes archived (250,000): 350,000 + 1,100,000 = 1,450,000
    expect(summary.totalBalance).toBe(1_450_000);
    // Safe-to-Spend includes only active wallets with includeInSafeToSpend=true (Kas Tunai: 350,000)
    expect(summary.safeToSpend.totalIncludedBalance).toBe(350_000);
    // Cashflow excludes transfers (DATA-3)
    expect(summary.cashflow.totalExpense).toBe(50_000);
    expect(summary.cashflow.totalIncome).toBe(0);

    // Linked Notes summary matches (also excludes transfers)
    const linked = computeLocalLinkedTransactions(mirror, NOTE_ID);
    expect(linked.items).toHaveLength(1);
    expect(linked.summary.totalExpense).toBe(50_000);

    // Query filters work locally
    expect(queryLocalNotes(mirror, { search: "Beras" }).items).toHaveLength(1);
    expect(queryLocalTransactionsForPicker(mirror, { unlinkedOnly: true }).items).toHaveLength(0);
    expect(queryLocalTransactionsForPicker(mirror, { unlinkedOnly: false }).items).toHaveLength(1);
  });

  it("serializes concurrent flushOutbox calls without duplicate requests and preserves Idempotency-Key", async () => {
    await applySnapshotWithPendingReplay(USER_ID, makeSampleSnapshot());

    await enqueueOutboxMutation(USER_ID, {
      mutationId: "m-1",
      createdAt: 100,
      idempotencyKey: "key-1",
      entity: "note",
      entityId: NOTE_ID,
      op: "upsert",
      method: "PATCH",
      path: `/api/notes/${NOTE_ID}`,
      body: { title: "Updated Offline" },
      optimisticSnapshot: {
        kind: "note_upsert",
        note: buildOptimisticNoteDto({
          id: NOTE_ID,
          title: "Updated Offline",
          content: "",
          folderId: null,
          folderName: null,
          isPinned: true,
          tagNames: [],
        }),
      },
      updatedAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
    });

    const sentRequests: Array<{ url: string; key: string | null }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/sync/snapshot") {
        return new Response(JSON.stringify({ ok: true, data: makeSampleSnapshot() }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const headers = new Headers(init?.headers);
      sentRequests.push({ url, key: headers.get("Idempotency-Key") });
      await new Promise((r) => setTimeout(r, 25));
      return new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const [resA, resB] = await Promise.all([
      flushOutbox(USER_ID, { fetchImpl: fetchMock as unknown as typeof fetch, isOnlineFn: () => true }),
      flushOutbox(USER_ID, { fetchImpl: fetchMock as unknown as typeof fetch, isOnlineFn: () => true }),
    ]);

    expect(sentRequests).toHaveLength(1);
    expect(sentRequests[0]).toEqual({ url: `/api/notes/${NOTE_ID}`, key: "key-1" });
    expect(resA.status).toBe("synced");
    expect(resB.status).toBe("synced");
    expect(await listOutboxItems(USER_ID)).toHaveLength(0);
  });

  it("enforces strict causal FIFO gating on 429 Retry-After / 5xx and isolates terminal 4xx failures", async () => {
    await applySnapshotWithPendingReplay(USER_ID, makeSampleSnapshot());

    await enqueueOutboxMutation(USER_ID, {
      mutationId: "m-first",
      createdAt: 100,
      idempotencyKey: "idem-1",
      entity: "folder",
      entityId: FOLDER_ID,
      op: "upsert",
      method: "POST",
      path: "/api/folders",
      body: { id: FOLDER_ID, name: "Folder First" },
      optimisticSnapshot: {
        kind: "folder_upsert",
        folder: buildOptimisticFolderDto({ id: FOLDER_ID, name: "Folder First" }),
      },
      updatedAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
    });

    await enqueueOutboxMutation(USER_ID, {
      mutationId: "m-second",
      createdAt: 200,
      idempotencyKey: "idem-2",
      entity: "note",
      entityId: NOTE_ID,
      op: "upsert",
      method: "POST",
      path: "/api/notes",
      body: { id: NOTE_ID, folderId: FOLDER_ID, title: "Child Note" },
      optimisticSnapshot: {
        kind: "note_upsert",
        note: buildOptimisticNoteDto({
          id: NOTE_ID,
          title: "Child Note",
          content: "",
          folderId: FOLDER_ID,
          folderName: "Folder First",
          isPinned: false,
          tagNames: [],
        }),
      },
      updatedAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
    });

    let nowMs = 1_000_000;
    const calledPaths: string[] = [];

    // 1. 429 Retry-After: 30 on m-first -> halts BEFORE m-second AND skips snapshot
    const rateLimitFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calledPaths.push(url);
      return new Response(JSON.stringify({ ok: false, error: { code: "RATE_LIMITED" } }), {
        status: 429,
        headers: { "Retry-After": "30" },
      });
    });

    const haltedRes = await flushOutbox(USER_ID, {
      fetchImpl: rateLimitFetch as unknown as typeof fetch,
      nowFn: () => nowMs,
      isOnlineFn: () => true,
    });
    expect(haltedRes.halted).toBe(true);
    expect(haltedRes.status).toBe("sync_error");
    expect(calledPaths).toEqual(["/api/folders"]);

    const itemsAfter429 = await listOutboxItems(USER_ID);
    expect(itemsAfter429[0].retryCount).toBe(1);
    expect(itemsAfter429[0].nextRetryAt).toBe(nowMs + 30_000);

    // 2. Retrying before nextRetryAt halts cleanly without hitting network (m-second MUST NOT overtake!)
    nowMs += 5_000;
    calledPaths.length = 0;
    const gatedRes = await flushOutbox(USER_ID, {
      fetchImpl: rateLimitFetch as unknown as typeof fetch,
      nowFn: () => nowMs,
      isOnlineFn: () => true,
    });
    expect(gatedRes.halted).toBe(true);
    expect(calledPaths).toHaveLength(0);

    // 3. Past nextRetryAt: m-first gets terminal 409 Conflict -> marked "failed", m-second succeeds (201) + snapshot runs
    nowMs += 30_000;
    calledPaths.length = 0;
    const conflictThenOkFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calledPaths.push(url);
      if (url === "/api/folders") {
        return new Response(
          JSON.stringify({ ok: false, error: { code: "CONFLICT", message: "Folder conflict" } }),
          { status: 409 },
        );
      }
      if (url === "/api/notes") {
        return new Response(JSON.stringify({ ok: true, data: {} }), { status: 201 });
      }
      return new Response(JSON.stringify({ ok: true, data: makeSampleSnapshot() }), { status: 200 });
    });

    const terminalRes = await flushOutbox(USER_ID, {
      fetchImpl: conflictThenOkFetch as unknown as typeof fetch,
      nowFn: () => nowMs,
      isOnlineFn: () => true,
    });
    expect(calledPaths).toEqual(["/api/folders", "/api/notes", "/api/sync/snapshot"]);
    expect(terminalRes.failedCount).toBe(1);
    expect(terminalRes.status).toBe("sync_error");

    const remaining = await listOutboxItems(USER_ID);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("failed");

    // 4. Discard failed item restores "synced" state & refreshes snapshot
    const afterDiscard = await discardOutboxMutation(USER_ID, remaining[0].mutationId, {
      fetchImpl: conflictThenOkFetch as unknown as typeof fetch,
      isOnlineFn: () => true,
    });
    expect(afterDiscard.status).toBe("synced");
    expect(afterDiscard.failedCount).toBe(0);
    expect(await listOutboxItems(USER_ID)).toHaveLength(0);
  });

  it("wipes all noka-offline-* DBs and noka-private-* caches on logout and on 401 UNAUTHORIZED while keeping noka-shell-*", async () => {
    await applySnapshotWithPendingReplay(USER_ID, makeSampleSnapshot());

    const cacheStore = new Map<string, boolean>([
      ["noka-shell-v1", true],
      ["noka-private-v1", true],
    ]);
    const mockCaches = {
      keys: vi.fn(async () => Array.from(cacheStore.keys())),
      delete: vi.fn(async (key: string) => cacheStore.delete(key)),
    };
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      writable: true,
      value: mockCaches,
    });

    await wipeAllOfflineData(USER_ID);
    expect(cacheStore.has("noka-private-v1")).toBe(false);
    expect(cacheStore.has("noka-shell-v1")).toBe(true);

    const dbsAfterWipe = await globalThis.indexedDB.databases();
    expect(dbsAfterWipe.some((d) => d.name?.startsWith("noka-offline-"))).toBe(false);

    // Verify 401 during flushOutbox triggers full wipe + onUnauthorized
    suppressOfflineDbs(false);
    await applySnapshotWithPendingReplay(USER_ID, makeSampleSnapshot());
    cacheStore.set("noka-private-v1", true);

    await enqueueOutboxMutation(USER_ID, {
      mutationId: "m-unauth",
      createdAt: 100,
      idempotencyKey: "idem-unauth",
      entity: "note",
      entityId: NOTE_ID,
      op: "upsert",
      method: "PATCH",
      path: `/api/notes/${NOTE_ID}`,
      body: { title: "Should Wipe" },
      optimisticSnapshot: {
        kind: "note_upsert",
        note: buildOptimisticNoteDto({
          id: NOTE_ID,
          title: "Should Wipe",
          content: "",
          folderId: null,
          folderName: null,
          isPinned: false,
          tagNames: [],
        }),
      },
      updatedAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
    });

    const onUnauthorized = vi.fn();
    const unauthFetch = vi.fn(async () => new Response(null, { status: 401 }));

    const unauthResult = await flushOutbox(USER_ID, {
      fetchImpl: unauthFetch as unknown as typeof fetch,
      isOnlineFn: () => true,
      onUnauthorized,
    });

    expect(unauthResult.unauthorized).toBe(true);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(cacheStore.has("noka-private-v1")).toBe(false);
    expect(cacheStore.has("noka-shell-v1")).toBe(true);
    const dbsAfter401 = await globalThis.indexedDB.databases();
    expect(dbsAfter401.some((d) => d.name?.startsWith("noka-offline-"))).toBe(false);
  });
});
