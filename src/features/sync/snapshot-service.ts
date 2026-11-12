import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type DbOrTx } from "@/db";
import {
  categories,
  transactions,
  transfers,
  wallets,
} from "@/db/schema/finance";
import {
  folders,
  noteAttachments,
  notes,
  noteTags,
  tags,
} from "@/db/schema/notes";
import type { AuthUser } from "@/features/auth/session";
import { listCategories } from "@/features/finance/categories-service";
import type { FinanceEntryType } from "@/features/finance/schemas";
import type { TransactionDto } from "@/features/finance/transactions-service";
import type { TransferDto } from "@/features/finance/transfers-service";
import { loadWalletsWithBalances } from "@/features/finance/wallets-service";
import { parseChecklists } from "@/features/notes/checklist";
import type {
  FolderDto,
  NoteDto,
  NoteTagItemDto,
  TagDto,
} from "@/features/notes/service";
import type { SnapshotDto, SnapshotNoteAttachmentDto } from "@/features/sync/types";

/**
 * Loads the complete authenticated user's offline mirror snapshot in minimal projections (RFC-009, SEC-1, PERF-2).
 */
export async function buildUserSyncSnapshot(
  user: AuthUser,
  txOrDb?: DbOrTx,
): Promise<SnapshotDto> {
  const db = txOrDb ?? getDb();

  const [
    folderRows,
    folderCountsRows,
    noteRows,
    tagRows,
    tagCountsRows,
    attachmentRows,
    walletDtos,
    categoryDtos,
    transactionRows,
    transferRows,
  ] = await Promise.all([
    db
      .select()
      .from(folders)
      .where(and(eq(folders.userId, user.id), isNull(folders.deletedAt)))
      .orderBy(asc(folders.name)),
    db
      .select({
        folderId: notes.folderId,
        count: sql<number>`count(*)::int`,
      })
      .from(notes)
      .where(and(eq(notes.userId, user.id), isNull(notes.deletedAt)))
      .groupBy(notes.folderId),
    db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, user.id), isNull(notes.deletedAt)))
      .orderBy(desc(notes.isPinned), desc(notes.updatedAt), desc(notes.id)),
    db
      .select()
      .from(tags)
      .where(and(eq(tags.userId, user.id), isNull(tags.deletedAt)))
      .orderBy(asc(tags.name)),
    db
      .select({
        tagId: noteTags.tagId,
        count: sql<number>`count(*)::int`,
      })
      .from(noteTags)
      .innerJoin(notes, eq(notes.id, noteTags.noteId))
      .where(and(eq(notes.userId, user.id), isNull(notes.deletedAt)))
      .groupBy(noteTags.tagId),
    db
      .select({
        id: noteAttachments.id,
        noteId: noteAttachments.noteId,
        mimeType: noteAttachments.mimeType,
        sizeBytes: noteAttachments.sizeBytes,
        createdAt: noteAttachments.createdAt,
      })
      .from(noteAttachments)
      .innerJoin(notes, eq(notes.id, noteAttachments.noteId))
      .where(and(eq(noteAttachments.userId, user.id), isNull(notes.deletedAt)))
      .orderBy(asc(noteAttachments.createdAt)),
    loadWalletsWithBalances(db, user.id, { includeArchived: true }),
    listCategories(user.id, {}, db),
    db
      .select({
        id: transactions.id,
        walletId: transactions.walletId,
        walletName: wallets.name,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        noteId: transactions.noteId,
        type: transactions.type,
        amount: transactions.amount,
        description: transactions.description,
        occurredAt: transactions.occurredAt,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt,
      })
      .from(transactions)
      .innerJoin(wallets, eq(wallets.id, transactions.walletId))
      .innerJoin(categories, eq(categories.id, transactions.categoryId))
      .where(
        and(eq(transactions.userId, user.id), isNull(transactions.deletedAt)),
      )
      .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt)),
    (() => {
      const fromWallets = alias(wallets, "snap_from_wallets");
      const toWallets = alias(wallets, "snap_to_wallets");
      return db
        .select({
          id: transfers.id,
          fromWalletId: transfers.fromWalletId,
          fromWalletName: fromWallets.name,
          toWalletId: transfers.toWalletId,
          toWalletName: toWallets.name,
          amount: transfers.amount,
          note: transfers.note,
          occurredAt: transfers.occurredAt,
          createdAt: transfers.createdAt,
          updatedAt: transfers.updatedAt,
        })
        .from(transfers)
        .innerJoin(fromWallets, eq(fromWallets.id, transfers.fromWalletId))
        .innerJoin(toWallets, eq(toWallets.id, transfers.toWalletId))
        .where(and(eq(transfers.userId, user.id), isNull(transfers.deletedAt)))
        .orderBy(desc(transfers.occurredAt), desc(transfers.createdAt));
    })(),
  ]);

  const folderNameMap = new Map<string, string>(
    folderRows.map((row) => [row.id, row.name]),
  );
  const folderCountMap = new Map<string, number>();
  for (const row of folderCountsRows) {
    if (row.folderId) {
      folderCountMap.set(row.folderId, row.count);
    }
  }

  const tagCountMap = new Map<string, number>(
    tagCountsRows.map((row) => [row.tagId, row.count]),
  );

  const noteIds = noteRows.map((row) => row.id);
  const noteTagMap = new Map<string, NoteTagItemDto[]>();
  if (noteIds.length > 0) {
    const joinedTags = await db
      .select({
        noteId: noteTags.noteId,
        tagId: tags.id,
        tagName: tags.name,
      })
      .from(noteTags)
      .innerJoin(tags, eq(tags.id, noteTags.tagId))
      .where(and(inArray(noteTags.noteId, noteIds), isNull(tags.deletedAt)))
      .orderBy(asc(tags.name));

    for (const row of joinedTags) {
      const existing = noteTagMap.get(row.noteId) ?? [];
      existing.push({ id: row.tagId, name: row.tagName });
      noteTagMap.set(row.noteId, existing);
    }
  }

  const folderDtos: FolderDto[] = folderRows.map((row) => ({
    id: row.id,
    name: row.name,
    noteCount: folderCountMap.get(row.id) ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  const tagDtos: TagDto[] = tagRows.map((row) => ({
    id: row.id,
    name: row.name,
    noteCount: tagCountMap.get(row.id) ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  const noteDtos: NoteDto[] = noteRows.map((row) => {
    const checklists = parseChecklists(row.content);
    return {
      id: row.id,
      folderId: row.folderId,
      folderName: row.folderId ? (folderNameMap.get(row.folderId) ?? null) : null,
      title: row.title,
      content: row.content,
      isPinned: row.isPinned,
      tags: noteTagMap.get(row.id) ?? [],
      checklistTotal: checklists.length,
      checklistCompleted: checklists.filter((item) => item.checked).length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  const attachmentDtos: SnapshotNoteAttachmentDto[] = attachmentRows.map((row) => ({
    id: row.id,
    noteId: row.noteId,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    url: `/api/attachments/${row.id}`,
    createdAt: row.createdAt.toISOString(),
  }));

  const transactionDtos: TransactionDto[] = transactionRows.map((row) => ({
    id: row.id,
    walletId: row.walletId,
    walletName: row.walletName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    noteId: row.noteId,
    type: row.type as FinanceEntryType,
    amount: row.amount,
    description: row.description,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  const transferDtos: TransferDto[] = transferRows.map((row) => ({
    id: row.id,
    fromWalletId: row.fromWalletId,
    fromWalletName: row.fromWalletName,
    toWalletId: row.toWalletId,
    toWalletName: row.toWalletName,
    amount: row.amount,
    note: row.note,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return {
    user,
    notes: noteDtos,
    folders: folderDtos,
    tags: tagDtos,
    noteAttachments: attachmentDtos,
    wallets: walletDtos,
    categories: categoryDtos,
    transactions: transactionDtos,
    transfers: transferDtos,
    serverTime: new Date().toISOString(),
  };
}

