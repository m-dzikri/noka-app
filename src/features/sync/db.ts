import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AuthUser } from "@/features/auth/session";
import type { CategoryDto } from "@/features/finance/categories-service";
import { bigintToSafeNumber, computeWalletBalances } from "@/features/finance/ledger";
import type { TransactionDto } from "@/features/finance/transactions-service";
import type { TransferDto } from "@/features/finance/transfers-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import type { FolderDto, NoteDto, TagDto } from "@/features/notes/service";
import type {
  OutboxItemRecord,
  OutboxOptimisticPayload,
  SnapshotDto,
  SnapshotNoteAttachmentDto,
  SyncMetaRecord,
} from "@/features/sync/types";

export const OFFLINE_DB_PREFIX = "noka-offline-";
export const OFFLINE_DB_VERSION = 1;

export function getOfflineDbName(userId: string): string {
  return `${OFFLINE_DB_PREFIX}${userId}`;
}

export interface NokaOfflineDbSchema extends DBSchema {
  notes: {
    key: string;
    value: NoteDto;
    indexes: { "by-updatedAt": string };
  };
  folders: {
    key: string;
    value: FolderDto;
  };
  tags: {
    key: string;
    value: TagDto;
  };
  noteAttachments: {
    key: string;
    value: SnapshotNoteAttachmentDto;
    indexes: { "by-noteId": string };
  };
  wallets: {
    key: string;
    value: WalletWithBalanceDto;
  };
  categories: {
    key: string;
    value: CategoryDto;
  };
  transactions: {
    key: string;
    value: TransactionDto;
    indexes: { "by-occurredAt": string; "by-walletId": string };
  };
  transfers: {
    key: string;
    value: TransferDto;
    indexes: {
      "by-occurredAt": string;
      "by-fromWalletId": string;
      "by-toWalletId": string;
    };
  };
  meta: {
    key: string;
    value: SyncMetaRecord;
  };
  outbox: {
    key: string;
    value: OutboxItemRecord;
    indexes: { "by-createdAt": number; "by-status": string };
  };
}

export interface MirrorDataState {
  userProfile: AuthUser | null;
  lastSyncedAt: string | null;
  notes: NoteDto[];
  folders: FolderDto[];
  tags: TagDto[];
  noteAttachments: SnapshotNoteAttachmentDto[];
  wallets: WalletWithBalanceDto[];
  categories: CategoryDto[];
  transactions: TransactionDto[];
  transfers: TransferDto[];
  outbox: OutboxItemRecord[];
}

let offlineDbsSuppressed = false;

/**
 * Suppresses or re-enables IndexedDB mirror opens during logout or session destruction.
 */
export function suppressOfflineDbs(suppress = true): void {
  offlineDbsSuppressed = suppress;
}

export function isOfflineDbsSuppressed(): boolean {
  return offlineDbsSuppressed;
}

const openConnections = new Map<string, Promise<IDBPDatabase<NokaOfflineDbSchema>>>();
const activeDbInstances = new Map<string, IDBPDatabase<NokaOfflineDbSchema>>();

/**
 * Opens (or reuses) the user-isolated IndexedDB mirror (`noka-offline-${userId}`) with schema free of invalid boolean/null indexes.
 */
export async function getOfflineDb(
  userId: string,
): Promise<IDBPDatabase<NokaOfflineDbSchema>> {
  if (offlineDbsSuppressed) {
    throw new Error("IndexedDB is suppressed during logout cleanup");
  }
  const dbName = getOfflineDbName(userId);
  const existing = openConnections.get(dbName);
  if (existing) {
    return existing;
  }

  const connectionPromise = openDB<NokaOfflineDbSchema>(
    dbName,
    OFFLINE_DB_VERSION,
    {
      upgrade(db) {
        if (!db.objectStoreNames.contains("notes")) {
          const notesStore = db.createObjectStore("notes", { keyPath: "id" });
          // Intentionally avoid boolean/null IDB indexes (isPinned/folderId) for W3C & fake-indexeddb compatibility.
          notesStore.createIndex("by-updatedAt", "updatedAt");
        }
        if (!db.objectStoreNames.contains("folders")) {
          db.createObjectStore("folders", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("tags")) {
          db.createObjectStore("tags", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("noteAttachments")) {
          const attStore = db.createObjectStore("noteAttachments", {
            keyPath: "id",
          });
          attStore.createIndex("by-noteId", "noteId");
        }
        if (!db.objectStoreNames.contains("wallets")) {
          db.createObjectStore("wallets", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("categories")) {
          db.createObjectStore("categories", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("transactions")) {
          const txStore = db.createObjectStore("transactions", {
            keyPath: "id",
          });
          txStore.createIndex("by-occurredAt", "occurredAt");
          txStore.createIndex("by-walletId", "walletId");
        }
        if (!db.objectStoreNames.contains("transfers")) {
          const trStore = db.createObjectStore("transfers", { keyPath: "id" });
          trStore.createIndex("by-occurredAt", "occurredAt");
          trStore.createIndex("by-fromWalletId", "fromWalletId");
          trStore.createIndex("by-toWalletId", "toWalletId");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          const outboxStore = db.createObjectStore("outbox", {
            keyPath: "mutationId",
          });
          outboxStore.createIndex("by-createdAt", "createdAt");
          outboxStore.createIndex("by-status", "status");
        }
      },
      blocking() {
        const active = activeDbInstances.get(dbName);
        if (active) {
          try {
            active.close();
          } catch {
            // Ignore.
          }
          activeDbInstances.delete(dbName);
        }
        connectionPromise.then((db) => db.close()).catch(() => undefined);
        openConnections.delete(dbName);
      },
      terminated() {
        activeDbInstances.delete(dbName);
        openConnections.delete(dbName);
      },
    },
  );

  openConnections.set(dbName, connectionPromise);
  try {
    const db = await connectionPromise;
    activeDbInstances.set(dbName, db);
    return db;
  } catch (error) {
    openConnections.delete(dbName);
    activeDbInstances.delete(dbName);
    throw error;
  }
}

/**
 * Closes all tracked IndexedDB connections cleanly prior to database deletion.
 */
export async function closeAllOfflineDbs(): Promise<void> {
  const activeDbs = Array.from(activeDbInstances.values());
  for (const db of activeDbs) {
    try {
      db.close();
    } catch {
      // Ignore already closed.
    }
  }
  activeDbInstances.clear();

  const entries = Array.from(openConnections.entries());
  await Promise.allSettled(
    entries.map(async ([, promise]) => {
      try {
        const db = await promise;
        db.close();
      } catch {
        // Ignore.
      }
    }),
  );
  openConnections.clear();
}

/**
 * Deletes a single user's IndexedDB mirror cleanly after closing tracked connections.
 */
export async function deleteUserOfflineDb(userId: string): Promise<void> {
  const dbName = getOfflineDbName(userId);
  const active = activeDbInstances.get(dbName);
  if (active) {
    try {
      active.close();
    } catch {
      // Ignore already closed.
    }
    activeDbInstances.delete(dbName);
  }

  const existing = openConnections.get(dbName);
  openConnections.delete(dbName);
  if (existing) {
    try {
      const db = await existing;
      db.close();
    } catch {
      // Ignore already failed opens.
    }
  }

  await deleteDB(dbName, {
    blocked() {
      active?.close();
      existing?.then((db) => db.close()).catch(() => undefined);
    },
  });
}

/**
 * Sorts notes deterministically in memory: `isPinned DESC, updatedAt DESC, id DESC`.
 */
export function sortNotesInMemory(notes: readonly NoteDto[]): NoteDto[] {
  return [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    const timeDiff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (!Number.isNaN(timeDiff) && timeDiff !== 0) {
      return timeDiff;
    }
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    return b.id.localeCompare(a.id);
  });
}

/**
 * Recomputes wallet balances deterministically from `initialBalance` + active transactions/transfers (`DATA-2`, `HIGH-1`).
 */
export function recomputeWalletBalancesFromMirror(
  wallets: readonly WalletWithBalanceDto[],
  transactions: readonly TransactionDto[],
  transfers: readonly TransferDto[],
): WalletWithBalanceDto[] {
  const result = computeWalletBalances(wallets, transactions, transfers);
  return wallets.map((wallet) => ({
    ...wallet,
    currentBalance: bigintToSafeNumber(
      result.balances[wallet.id] ?? BigInt(wallet.initialBalance),
    ),
  }));
}

/**
 * Recomputes folder & tag counts and folderName labels across all mirror entities in memory.
 */
function recomputeNoteRelationsAndBalances(state: {
  notes: NoteDto[];
  folders: FolderDto[];
  tags: TagDto[];
  wallets: WalletWithBalanceDto[];
  transactions: TransactionDto[];
  transfers: TransferDto[];
}): void {
  const folderNameMap = new Map(state.folders.map((f) => [f.id, f.name]));
  const folderCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  state.notes = sortNotesInMemory(
    state.notes.map((note) => {
      if (note.folderId && folderNameMap.has(note.folderId)) {
        folderCounts.set(
          note.folderId,
          (folderCounts.get(note.folderId) ?? 0) + 1,
        );
      } else if (note.folderId && !folderNameMap.has(note.folderId)) {
        // Folder was deleted locally/remotely -> fall back to unfiled cleanly (DATA-4).
        note = { ...note, folderId: null, folderName: null };
      }

      for (const tag of note.tags) {
        tagCounts.set(tag.id, (tagCounts.get(tag.id) ?? 0) + 1);
      }

      return {
        ...note,
        folderName: note.folderId
          ? (folderNameMap.get(note.folderId) ?? null)
          : null,
      };
    }),
  );

  state.folders = [...state.folders]
    .map((folder) => ({
      ...folder,
      noteCount: folderCounts.get(folder.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Ensure any optimistic tag references exist in mirror tag catalog.
  const knownTags = new Map(state.tags.map((tag) => [tag.id, tag]));
  for (const note of state.notes) {
    for (const noteTag of note.tags) {
      if (!knownTags.has(noteTag.id)) {
        knownTags.set(noteTag.id, {
          id: noteTag.id,
          name: noteTag.name,
          noteCount: tagCounts.get(noteTag.id) ?? 0,
          createdAt: note.updatedAt,
          updatedAt: note.updatedAt,
        });
      }
    }
  }
  state.tags = Array.from(knownTags.values())
    .map((tag) => ({
      ...tag,
      noteCount: tagCounts.get(tag.id) ?? 0,
    }))
    .filter((tag) => tag.noteCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  state.wallets = recomputeWalletBalancesFromMirror(
    state.wallets,
    state.transactions,
    state.transfers,
  );
}

/**
 * Pure helper applying one optimistic outbox payload over an in-memory mirror state.
 */
export function applyOptimisticPayloadInMemory(
  state: MirrorDataState,
  payload: OutboxOptimisticPayload,
): MirrorDataState {
  const next: MirrorDataState = {
    ...state,
    notes: [...state.notes],
    folders: [...state.folders],
    tags: [...state.tags],
    noteAttachments: [...state.noteAttachments],
    wallets: [...state.wallets],
    categories: [...state.categories],
    transactions: [...state.transactions],
    transfers: [...state.transfers],
    outbox: [...state.outbox],
  };

  switch (payload.kind) {
    case "note_upsert": {
      const idx = next.notes.findIndex((n) => n.id === payload.note.id);
      if (idx >= 0) {
        next.notes[idx] = payload.note;
      } else {
        next.notes.unshift(payload.note);
      }
      break;
    }
    case "note_delete": {
      next.notes = next.notes.filter((n) => n.id !== payload.id);
      next.noteAttachments = next.noteAttachments.filter(
        (a) => a.noteId !== payload.id,
      );
      // Unlink transactions cleanly when note deleted (DATA-4).
      next.transactions = next.transactions.map((tx) =>
        tx.noteId === payload.id ? { ...tx, noteId: null } : tx,
      );
      break;
    }
    case "folder_upsert": {
      const idx = next.folders.findIndex((f) => f.id === payload.folder.id);
      if (idx >= 0) {
        next.folders[idx] = payload.folder;
      } else {
        next.folders.push(payload.folder);
      }
      break;
    }
    case "folder_delete": {
      next.folders = next.folders.filter((f) => f.id !== payload.id);
      next.notes = next.notes.map((n) =>
        n.folderId === payload.id
          ? { ...n, folderId: null, folderName: null }
          : n,
      );
      break;
    }
    case "transaction_upsert": {
      const idx = next.transactions.findIndex(
        (tx) => tx.id === payload.transaction.id,
      );
      if (idx >= 0) {
        next.transactions[idx] = payload.transaction;
      } else {
        next.transactions.unshift(payload.transaction);
      }
      break;
    }
    case "transaction_delete": {
      next.transactions = next.transactions.filter((tx) => tx.id !== payload.id);
      break;
    }
    case "transfer_upsert": {
      const idx = next.transfers.findIndex(
        (tr) => tr.id === payload.transfer.id,
      );
      if (idx >= 0) {
        next.transfers[idx] = payload.transfer;
      } else {
        next.transfers.unshift(payload.transfer);
      }
      break;
    }
    case "transfer_delete": {
      next.transfers = next.transfers.filter((tr) => tr.id !== payload.id);
      break;
    }
    case "note_link": {
      const idx = next.transactions.findIndex(
        (tx) => tx.id === payload.transactionId,
      );
      if (idx >= 0) {
        next.transactions[idx] = {
          ...(payload.transaction ?? next.transactions[idx]),
          noteId: payload.noteId,
        };
      } else if (payload.transaction) {
        next.transactions.unshift({
          ...payload.transaction,
          noteId: payload.noteId,
        });
      }
      break;
    }
    case "note_unlink": {
      next.transactions = next.transactions.map((tx) =>
        tx.id === payload.transactionId && tx.noteId === payload.noteId
          ? { ...tx, noteId: null }
          : tx,
      );
      break;
    }
  }

  recomputeNoteRelationsAndBalances(next);
  return next;
}

/**
 * Reads the complete offline mirror + sorted outbox for a user.
 */
export async function readFullMirror(userId: string): Promise<MirrorDataState> {
  const db = await getOfflineDb(userId);
  const [
    notes,
    folders,
    tags,
    noteAttachments,
    wallets,
    categories,
    transactions,
    transfers,
    metaRows,
    outboxRows,
  ] = await Promise.all([
    db.getAll("notes"),
    db.getAll("folders"),
    db.getAll("tags"),
    db.getAll("noteAttachments"),
    db.getAll("wallets"),
    db.getAll("categories"),
    db.getAll("transactions"),
    db.getAll("transfers"),
    db.getAll("meta"),
    db.getAll("outbox"),
  ]);

  let userProfile: AuthUser | null = null;
  let lastSyncedAt: string | null = null;
  for (const row of metaRows) {
    if (row.key === "userProfile") {
      userProfile = row.value;
    } else if (row.key === "lastSyncedAt") {
      lastSyncedAt = row.value;
    }
  }

  const state: MirrorDataState = {
    userProfile,
    lastSyncedAt,
    notes,
    folders,
    tags,
    noteAttachments,
    wallets,
    categories,
    transactions,
    transfers,
    outbox: [...outboxRows].sort((a, b) => a.createdAt - b.createdAt),
  };

  recomputeNoteRelationsAndBalances(state);
  return state;
}

/**
 * Persists a full state's 8 domain stores + meta atomically inside IndexedDB while preserving outbox.
 */
async function writeDomainMirrorState(
  db: IDBPDatabase<NokaOfflineDbSchema>,
  state: Pick<
    MirrorDataState,
    | "notes"
    | "folders"
    | "tags"
    | "noteAttachments"
    | "wallets"
    | "categories"
    | "transactions"
    | "transfers"
    | "userProfile"
    | "lastSyncedAt"
  >,
): Promise<void> {
  const tx = db.transaction(
    [
      "notes",
      "folders",
      "tags",
      "noteAttachments",
      "wallets",
      "categories",
      "transactions",
      "transfers",
      "meta",
    ],
    "readwrite",
  );

  const notesStore = tx.objectStore("notes");
  const foldersStore = tx.objectStore("folders");
  const tagsStore = tx.objectStore("tags");
  const attachmentsStore = tx.objectStore("noteAttachments");
  const walletsStore = tx.objectStore("wallets");
  const categoriesStore = tx.objectStore("categories");
  const transactionsStore = tx.objectStore("transactions");
  const transfersStore = tx.objectStore("transfers");
  const metaStore = tx.objectStore("meta");

  await Promise.all([
    notesStore.clear(),
    foldersStore.clear(),
    tagsStore.clear(),
    attachmentsStore.clear(),
    walletsStore.clear(),
    categoriesStore.clear(),
    transactionsStore.clear(),
    transfersStore.clear(),
  ]);

  await Promise.all([
    ...state.notes.map((item) => notesStore.put(item)),
    ...state.folders.map((item) => foldersStore.put(item)),
    ...state.tags.map((item) => tagsStore.put(item)),
    ...state.noteAttachments.map((item) => attachmentsStore.put(item)),
    ...state.wallets.map((item) => walletsStore.put(item)),
    ...state.categories.map((item) => categoriesStore.put(item)),
    ...state.transactions.map((item) => transactionsStore.put(item)),
    ...state.transfers.map((item) => transfersStore.put(item)),
    ...(state.userProfile
      ? [metaStore.put({ key: "userProfile", value: state.userProfile })]
      : []),
    ...(state.lastSyncedAt
      ? [metaStore.put({ key: "lastSyncedAt", value: state.lastSyncedAt })]
      : []),
  ]);

  await tx.done;
}

/**
 * Replaces domain mirror from a fresh server snapshot AND replays ALL remaining `"pending"` outbox
 * mutations (`createdAt ASC`) on top so concurrent/queued edits during flush are never lost.
 */
export async function applySnapshotWithPendingReplay(
  userId: string,
  snapshot: SnapshotDto,
): Promise<MirrorDataState> {
  const db = await getOfflineDb(userId);
  const currentOutbox = [...(await db.getAll("outbox"))].sort(
    (a, b) => a.createdAt - b.createdAt,
  );

  let state: MirrorDataState = {
    userProfile: snapshot.user,
    lastSyncedAt: snapshot.serverTime,
    notes: snapshot.notes,
    folders: snapshot.folders,
    tags: snapshot.tags,
    noteAttachments: snapshot.noteAttachments,
    wallets: snapshot.wallets,
    categories: snapshot.categories,
    transactions: snapshot.transactions,
    transfers: snapshot.transfers,
    outbox: currentOutbox,
  };

  for (const item of currentOutbox) {
    if (item.status === "pending") {
      state = applyOptimisticPayloadInMemory(state, item.optimisticSnapshot);
    }
  }

  recomputeNoteRelationsAndBalances(state);
  await writeDomainMirrorState(db, state);
  return state;
}

/**
 * Applies one optimistic payload directly into the IndexedDB mirror without queuing to outbox
 * (used after successful direct online mutations to keep the local mirror fresh immediately).
 */
export async function applyOptimisticToMirror(
  userId: string,
  payload: OutboxOptimisticPayload,
): Promise<MirrorDataState> {
  const current = await readFullMirror(userId);
  const next = applyOptimisticPayloadInMemory(current, payload);
  const db = await getOfflineDb(userId);
  await writeDomainMirrorState(db, next);
  return next;
}

/**
 * Queues a mutation in `outbox` and writes its optimistic projection into IndexedDB mirror.
 */
export async function enqueueOutboxMutation(
  userId: string,
  item: OutboxItemRecord,
): Promise<MirrorDataState> {
  const db = await getOfflineDb(userId);
  await db.put("outbox", item);
  return applyOptimisticToMirror(userId, item.optimisticSnapshot);
}

/**
 * Lists all outbox items ordered `createdAt ASC`.
 */
export async function listOutboxItems(userId: string): Promise<OutboxItemRecord[]> {
  const db = await getOfflineDb(userId);
  const rows = await db.getAll("outbox");
  return [...rows].sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Updates one existing outbox item if still present.
 */
export async function updateOutboxItem(
  userId: string,
  mutationId: string,
  updater: (prev: OutboxItemRecord) => OutboxItemRecord,
): Promise<OutboxItemRecord | null> {
  const db = await getOfflineDb(userId);
  const existing = await db.get("outbox", mutationId);
  if (!existing) {
    return null;
  }
  const updated = updater(existing);
  await db.put("outbox", updated);
  return updated;
}

/**
 * Deletes an outbox entry by `mutationId`.
 */
export async function removeOutboxItem(
  userId: string,
  mutationId: string,
): Promise<void> {
  const db = await getOfflineDb(userId);
  await db.delete("outbox", mutationId);
}

/**
 * Safely merges partial updates into `meta.userProfile` inside IndexedDB (`updateUserMeta`).
 */
export async function patchUserProfileMeta(
  userId: string,
  patch: Partial<AuthUser>,
): Promise<AuthUser | null> {
  const db = await getOfflineDb(userId);
  const existing = await db.get("meta", "userProfile");
  if (!existing || existing.key !== "userProfile") {
    return null;
  }
  const merged: AuthUser = { ...existing.value, ...patch, id: existing.value.id };
  await db.put("meta", { key: "userProfile", value: merged });
  return merged;
}

/**
 * Updates cached attachments for a specific note in IndexedDB mirror (`RFC-005` read parity offline).
 */
export async function replaceNoteAttachmentsInMirror(
  userId: string,
  noteId: string,
  attachments: readonly SnapshotNoteAttachmentDto[],
): Promise<void> {
  const db = await getOfflineDb(userId);
  const existingAll = await db.getAll("noteAttachments");
  const tx = db.transaction("noteAttachments", "readwrite");
  const store = tx.objectStore("noteAttachments");
  await Promise.all(
    existingAll
      .filter((att) => att.noteId === noteId)
      .map((att) => store.delete(att.id)),
  );
  await Promise.all(attachments.map((att) => store.put(att)));
  await tx.done;
}

