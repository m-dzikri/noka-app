import {
  and,
  desc,
  eq,
  gte,
  isNull,
  lte,
  type SQL,
} from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { categories, transactions, wallets } from "@/db/schema/finance";
import { notes } from "@/db/schema/notes";
import {
  FINANCE_LIST_DEFAULT_LIMIT,
  parseOccurredAtValue,
  resolveDateFilterRange,
  type CreateTransactionInput,
  type DeleteFinanceMutationBody,
  type FinanceEntryType,
  type TransactionListQueryInput,
  type UpdateTransactionInput,
} from "@/features/finance/schemas";
import {
  buildFinanceCursorPredicate,
  encodeFinanceCursor,
  isPgUniqueViolation,
  type ConflictResolution,
} from "@/features/finance/shared";
import { ApiError } from "@/lib/api-response";
import { resolveLwwTimestamp } from "@/lib/idempotency";

export interface TransactionDto {
  id: string;
  walletId: string;
  walletName: string;
  categoryId: string;
  categoryName: string;
  noteId: string | null;
  type: FinanceEntryType;
  amount: number;
  description: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionListResult {
  items: TransactionDto[];
  nextCursor: string | null;
}

export interface TransactionMutationResult {
  transaction: TransactionDto;
  conflictResolved: ConflictResolution;
}

export interface TransactionDeleteResult {
  deleted: boolean;
  id: string;
  conflictResolved: ConflictResolution;
  transaction?: TransactionDto;
}

function serializeTransactionJoinedRow(row: {
  tx: typeof transactions.$inferSelect;
  walletName: string;
  categoryName: string;
}): TransactionDto {
  return {
    id: row.tx.id,
    walletId: row.tx.walletId,
    walletName: row.walletName,
    categoryId: row.tx.categoryId,
    categoryName: row.categoryName,
    noteId: row.tx.noteId ?? null,
    type: row.tx.type as FinanceEntryType,
    amount: Number(row.tx.amount),
    description: row.tx.description ?? null,
    occurredAt: row.tx.occurredAt.toISOString(),
    createdAt: row.tx.createdAt.toISOString(),
    updatedAt: row.tx.updatedAt.toISOString(),
  };
}

async function fetchTransactionDtoById(
  txOrDb: DbOrTx,
  userId: string,
  transactionId: string,
): Promise<TransactionDto> {
  const rows = await txOrDb
    .select({
      tx: transactions,
      walletName: wallets.name,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(wallets, eq(transactions.walletId, wallets.id))
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1);

  if (!rows[0]) {
    throw new ApiError(404, "TRANSACTION_NOT_FOUND", "Transaction not found");
  }

  return serializeTransactionJoinedRow(rows[0]);
}

async function validateActiveNoteOwnership(
  tx: DbOrTx,
  userId: string,
  noteId: string,
): Promise<void> {
  const noteRows = await tx
    .select({ id: notes.id })
    .from(notes)
    .where(
      and(
        eq(notes.id, noteId),
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
      ),
    )
    .limit(1);

  if (noteRows.length === 0) {
    throw new ApiError(404, "NOTE_NOT_FOUND", "Linked note not found");
  }
}

/**
 * Lists income/expense ledger transactions using keyset cursor pagination `(occurredAt DESC, createdAt DESC, id DESC)`.
 */
export async function listTransactions(
  userId: string,
  query: Partial<TransactionListQueryInput> = {},
  txOrDb: DbOrTx = getDb(),
): Promise<TransactionListResult> {
  const limit = query.limit ?? FINANCE_LIST_DEFAULT_LIMIT;
  const { fromDate, toDate } = resolveDateFilterRange(
    query.from,
    query.to,
    query.tzOffset,
  );

  const conditions: SQL[] = [
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
  ];

  if (query.walletId !== undefined) {
    conditions.push(eq(transactions.walletId, query.walletId));
  }

  if (query.type !== undefined) {
    conditions.push(eq(transactions.type, query.type));
  }

  if (query.categoryId !== undefined) {
    conditions.push(eq(transactions.categoryId, query.categoryId));
  }

  if (query.unlinked === true) {
    conditions.push(isNull(transactions.noteId));
  }

  if (fromDate !== undefined) {
    conditions.push(gte(transactions.occurredAt, fromDate));
  }

  if (toDate !== undefined) {
    conditions.push(lte(transactions.occurredAt, toDate));
  }

  if (query.cursor !== undefined) {
    const cursorCondition = buildFinanceCursorPredicate(
      {
        occurredAt: transactions.occurredAt,
        createdAt: transactions.createdAt,
        id: transactions.id,
      },
      query.cursor,
    );
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }
  }

  const rows = await txOrDb
    .select({
      tx: transactions,
      walletName: wallets.name,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(wallets, eq(transactions.walletId, wallets.id))
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(
      desc(transactions.occurredAt),
      desc(transactions.createdAt),
      desc(transactions.id),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map(serializeTransactionJoinedRow),
    nextCursor:
      hasMore && lastRow ? encodeFinanceCursor(lastRow.tx) : null,
  };
}

/**
 * Records an income or expense transaction after checking active wallet, category type match, and optional note ownership.
 */
export async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
  txOrDb?: DbOrTx,
): Promise<TransactionDto> {
  const runInTx = async (tx: DbOrTx): Promise<TransactionDto> => {
    const walletRows = await tx
      .select()
      .from(wallets)
      .where(
        and(
          eq(wallets.id, input.walletId),
          eq(wallets.userId, userId),
          isNull(wallets.deletedAt),
        ),
      )
      .limit(1);

    const wallet = walletRows[0];
    if (!wallet) {
      throw new ApiError(404, "WALLET_NOT_FOUND", "Wallet not found");
    }
    if (wallet.archivedAt !== null) {
      throw new ApiError(
        409,
        "WALLET_ARCHIVED",
        "Cannot record a transaction on an archived wallet",
      );
    }

    const categoryRows = await tx
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, input.categoryId),
          eq(categories.userId, userId),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    const category = categoryRows[0];
    if (!category) {
      throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }
    if (category.type !== input.type) {
      throw new ApiError(
        422,
        "CATEGORY_TYPE_MISMATCH",
        "Category type does not match transaction type",
      );
    }

    if (input.noteId !== undefined && input.noteId !== null) {
      await validateActiveNoteOwnership(tx, userId, input.noteId);
    }

    const occurredAt = parseOccurredAtValue(input.occurredAt);
    if (!occurredAt) {
      throw new ApiError(422, "VALIDATION_ERROR", "Invalid occurredAt timestamp");
    }

    const createdTimestamp = resolveLwwTimestamp(
      new Date(0),
      input.updatedAt,
    ).nextUpdatedAt;
    const normalizedDescription =
      input.description === undefined || input.description === null
        ? null
        : input.description.length > 0
          ? input.description
          : null;

    try {
      const [inserted] = await tx
        .insert(transactions)
        .values({
          id: input.id,
          userId,
          walletId: wallet.id,
          categoryId: category.id,
          noteId: input.noteId ?? null,
          type: input.type,
          amount: input.amount,
          description: normalizedDescription,
          occurredAt,
          createdAt: createdTimestamp,
          updatedAt: createdTimestamp,
        })
        .returning();

      return serializeTransactionJoinedRow({
        tx: inserted,
        walletName: wallet.name,
        categoryName: category.name,
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new ApiError(
          409,
          "RESOURCE_ALREADY_EXISTS",
          "Transaction ID already exists",
        );
      }
      throw error;
    }
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}

/**
 * Updates a transaction with LWW checks, granular archive protection, category type alignment, and note linking semantics.
 */
export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: UpdateTransactionInput,
  txOrDb?: DbOrTx,
): Promise<TransactionMutationResult> {
  const runInTx = async (tx: DbOrTx): Promise<TransactionMutationResult> => {
    const existingRows = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
        ),
      )
      .for("update")
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "TRANSACTION_NOT_FOUND", "Transaction not found");
    }

    const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      const dto = await fetchTransactionDtoById(tx, userId, transactionId);
      return {
        transaction: dto,
        conflictResolved: "server_newer",
      };
    }

    const effectiveWalletId = input.walletId ?? existing.walletId;
    const effectiveCategoryId = input.categoryId ?? existing.categoryId;
    const effectiveType = input.type ?? (existing.type as FinanceEntryType);

    const walletRows = await tx
      .select()
      .from(wallets)
      .where(
        and(
          eq(wallets.id, effectiveWalletId),
          eq(wallets.userId, userId),
          isNull(wallets.deletedAt),
        ),
      )
      .limit(1);

    const targetWallet = walletRows[0];
    if (!targetWallet) {
      throw new ApiError(404, "WALLET_NOT_FOUND", "Wallet not found");
    }

    const walletChanged =
      input.walletId !== undefined && input.walletId !== existing.walletId;
    const amountChanged =
      input.amount !== undefined && input.amount !== Number(existing.amount);
    const typeChanged =
      input.type !== undefined && input.type !== existing.type;

    if (
      (walletChanged || amountChanged || typeChanged) &&
      targetWallet.archivedAt !== null
    ) {
      throw new ApiError(
        409,
        "WALLET_ARCHIVED",
        "Cannot move or alter amount/type of a transaction involving an archived wallet",
      );
    }

    const categoryRows = await tx
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, effectiveCategoryId),
          eq(categories.userId, userId),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    const targetCategory = categoryRows[0];
    if (!targetCategory) {
      throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }
    if (targetCategory.type !== effectiveType) {
      throw new ApiError(
        422,
        "CATEGORY_TYPE_MISMATCH",
        "Category type does not match transaction type",
      );
    }

    let nextNoteId = existing.noteId;
    if (input.noteId === null) {
      nextNoteId = null;
    } else if (input.noteId !== undefined) {
      await validateActiveNoteOwnership(tx, userId, input.noteId);
      nextNoteId = input.noteId;
    }

    let nextOccurredAt = existing.occurredAt;
    if (input.occurredAt !== undefined) {
      const parsed = parseOccurredAtValue(input.occurredAt);
      if (!parsed) {
        throw new ApiError(422, "VALIDATION_ERROR", "Invalid occurredAt timestamp");
      }
      nextOccurredAt = parsed;
    }

    let nextDescription = existing.description;
    if (input.description !== undefined) {
      nextDescription =
        input.description === null || input.description.length === 0
          ? null
          : input.description;
    }

    const [updated] = await tx
      .update(transactions)
      .set({
        walletId: effectiveWalletId,
        categoryId: effectiveCategoryId,
        noteId: nextNoteId,
        type: effectiveType,
        amount: input.amount ?? existing.amount,
        description: nextDescription,
        occurredAt: nextOccurredAt,
        updatedAt: lww.nextUpdatedAt,
      })
      .where(
        and(eq(transactions.id, transactionId), eq(transactions.userId, userId)),
      )
      .returning();

    return {
      transaction: serializeTransactionJoinedRow({
        tx: updated,
        walletName: targetWallet.name,
        categoryName: targetCategory.name,
      }),
      conflictResolved: "applied",
    };
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}

/**
 * Soft-deletes a transaction under LWW control.
 */
export async function deleteTransaction(
  userId: string,
  transactionId: string,
  input: DeleteFinanceMutationBody,
  txOrDb?: DbOrTx,
): Promise<TransactionDeleteResult> {
  const runInTx = async (tx: DbOrTx): Promise<TransactionDeleteResult> => {
    const existingRows = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
        ),
      )
      .for("update")
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "TRANSACTION_NOT_FOUND", "Transaction not found");
    }

    const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      const dto = await fetchTransactionDtoById(tx, userId, transactionId);
      return {
        deleted: false,
        id: transactionId,
        transaction: dto,
        conflictResolved: "server_newer",
      };
    }

    await tx
      .update(transactions)
      .set({
        deletedAt: new Date(),
        updatedAt: lww.nextUpdatedAt,
      })
      .where(
        and(eq(transactions.id, transactionId), eq(transactions.userId, userId)),
      );

    return {
      deleted: true,
      id: transactionId,
      conflictResolved: "applied",
    };
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}
