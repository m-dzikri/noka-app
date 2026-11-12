import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbOrTx } from "@/db";
import { categories, transactions, wallets } from "@/db/schema/finance";
import { notes } from "@/db/schema/notes";
import {
  CATEGORY_TYPES,
  TRANSACTION_DESCRIPTION_MAX_LENGTH,
  deleteFinanceMutationBodySchema,
  occurredAtSchema,
  optionalIdempotencyKeySchema,
  optionalUpdatedAtSchema,
  positiveIdrAmountSchema,
  uuidSchema,
  type FinanceEntryType,
} from "@/features/finance/schemas";
import type { ConflictResolution } from "@/features/finance/shared";
import {
  createTransaction,
  type TransactionDto,
} from "@/features/finance/transactions-service";
import { ApiError } from "@/lib/api-response";
import { resolveLwwTimestamp } from "@/lib/idempotency";

export interface LinkedTransactionsSummary {
  totalIncome: number;
  totalExpense: number;
  net: number;
}

export interface LinkedTransactionsListResult {
  items: TransactionDto[];
  summary: LinkedTransactionsSummary;
}

export interface LinkedTransactionLinkResult {
  status: 200 | 201;
  transaction: TransactionDto;
  summary: LinkedTransactionsSummary;
  conflictResolved: ConflictResolution;
}

export interface LinkedTransactionUnlinkResult {
  unlinked: boolean;
  txId: string;
  transaction?: TransactionDto;
  summary: LinkedTransactionsSummary;
  conflictResolved: ConflictResolution;
}

export const linkExistingNoteTransactionSchema = z
  .object({
    existingTransactionId: uuidSchema,
    updatedAt: optionalUpdatedAtSchema,
    idempotencyKey: optionalIdempotencyKeySchema,
  })
  .strict();

export const createLinkedNoteTransactionSchema = z
  .object({
    id: uuidSchema.optional(),
    walletId: uuidSchema,
    categoryId: uuidSchema,
    type: z.enum(CATEGORY_TYPES),
    amount: positiveIdrAmountSchema,
    description: z
      .string()
      .trim()
      .max(TRANSACTION_DESCRIPTION_MAX_LENGTH)
      .nullable()
      .optional(),
    occurredAt: occurredAtSchema,
    updatedAt: optionalUpdatedAtSchema,
    idempotencyKey: optionalIdempotencyKeySchema,
  })
  .strict();

export const postLinkedNoteTransactionSchema = z.union([
  linkExistingNoteTransactionSchema,
  createLinkedNoteTransactionSchema,
]);

export const unlinkLinkedNoteTransactionSchema = deleteFinanceMutationBodySchema;

export type PostLinkedNoteTransactionInput = z.infer<
  typeof postLinkedNoteTransactionSchema
>;

export type UnlinkLinkedNoteTransactionInput = z.infer<
  typeof unlinkLinkedNoteTransactionSchema
>;

async function assertActiveNoteOwnership(
  txOrDb: DbOrTx,
  userId: string,
  noteId: string,
): Promise<void> {
  const rows = await txOrDb
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

  if (rows.length === 0) {
    throw new ApiError(404, "NOTE_NOT_FOUND", "Note not found");
  }
}

function serializeTransactionRow(row: {
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

function summarizeFromDtos(
  items: TransactionDto[],
): LinkedTransactionsSummary {
  let incomeBig = 0n;
  let expenseBig = 0n;

  for (const item of items) {
    const amountBig = BigInt(item.amount);
    if (item.type === "income") {
      incomeBig += amountBig;
    } else if (item.type === "expense") {
      expenseBig += amountBig;
    }
  }

  return {
    totalIncome: Number(incomeBig),
    totalExpense: Number(expenseBig),
    net: Number(incomeBig - expenseBig),
  };
}

async function computeLinkedSummaryFromDb(
  txOrDb: DbOrTx,
  userId: string,
  noteId: string,
): Promise<LinkedTransactionsSummary> {
  const grouped = await txOrDb
    .select({
      type: transactions.type,
      totalText: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.noteId, noteId),
        isNull(transactions.deletedAt),
      ),
    )
    .groupBy(transactions.type);

  let incomeBig = 0n;
  let expenseBig = 0n;

  for (const row of grouped) {
    const total = BigInt(row.totalText);
    if (row.type === "income") {
      incomeBig += total;
    } else if (row.type === "expense") {
      expenseBig += total;
    }
  }

  return {
    totalIncome: Number(incomeBig),
    totalExpense: Number(expenseBig),
    net: Number(incomeBig - expenseBig),
  };
}

async function fetchJoinedTransactionRow(
  txOrDb: DbOrTx,
  userId: string,
  transactionId: string,
) {
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

  return rows[0] ?? null;
}

/**
 * Lists all active income/expense transactions linked to a note along with exact integer summary (`F15`, `DATA-3`, `SEC-1`).
 */
export async function listNoteLinkedTransactions(
  userId: string,
  noteId: string,
  txOrDb: DbOrTx = getDb(),
): Promise<LinkedTransactionsListResult> {
  await assertActiveNoteOwnership(txOrDb, userId, noteId);

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
        eq(transactions.userId, userId),
        eq(transactions.noteId, noteId),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(
      desc(transactions.occurredAt),
      desc(transactions.createdAt),
      desc(transactions.id),
    );

  const items = rows.map(serializeTransactionRow);
  return {
    items,
    summary: summarizeFromDtos(items),
  };
}

/**
 * Links an existing transaction or atomically creates a new linked transaction on a note (`F15`, `API-3`).
 */
export async function linkOrCreateNoteTransaction(
  userId: string,
  noteId: string,
  input: PostLinkedNoteTransactionInput,
  txOrDb?: DbOrTx,
): Promise<LinkedTransactionLinkResult> {
  const runInTx = async (tx: DbOrTx): Promise<LinkedTransactionLinkResult> => {
    await assertActiveNoteOwnership(tx, userId, noteId);

    if ("existingTransactionId" in input) {
      const existingRow = await fetchJoinedTransactionRow(
        tx,
        userId,
        input.existingTransactionId,
      );
      if (!existingRow) {
        throw new ApiError(
          404,
          "TRANSACTION_NOT_FOUND",
          "Transaction not found",
        );
      }

      const lww = resolveLwwTimestamp(existingRow.tx.updatedAt, input.updatedAt);
      if (lww.serverNewer) {
        return {
          status: 200,
          transaction: serializeTransactionRow(existingRow),
          summary: await computeLinkedSummaryFromDb(tx, userId, noteId),
          conflictResolved: "server_newer",
        };
      }

      if (existingRow.tx.noteId === noteId) {
        return {
          status: 200,
          transaction: serializeTransactionRow(existingRow),
          summary: await computeLinkedSummaryFromDb(tx, userId, noteId),
          conflictResolved: "applied",
        };
      }

      if (existingRow.tx.noteId !== null) {
        throw new ApiError(
          409,
          "TRANSACTION_ALREADY_LINKED",
          "Transaction is already linked to another note",
        );
      }

      const [updatedTx] = await tx
        .update(transactions)
        .set({
          noteId,
          updatedAt: lww.nextUpdatedAt,
        })
        .where(
          and(
            eq(transactions.id, existingRow.tx.id),
            eq(transactions.userId, userId),
            isNull(transactions.deletedAt),
          ),
        )
        .returning();

      const updatedDto = serializeTransactionRow({
        tx: updatedTx ?? existingRow.tx,
        walletName: existingRow.walletName,
        categoryName: existingRow.categoryName,
      });

      return {
        status: 200,
        transaction: updatedDto,
        summary: await computeLinkedSummaryFromDb(tx, userId, noteId),
        conflictResolved: "applied",
      };
    }

    const created = await createTransaction(
      userId,
      {
        ...input,
        noteId,
      },
      tx,
    );

    const summary = await computeLinkedSummaryFromDb(tx, userId, noteId);
    return {
      status: 201,
      transaction: created,
      summary,
      conflictResolved: "applied",
    };
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}

/**
 * Safely detaches a linked transaction from a note (`note_id = NULL`) without deleting the transaction (`DATA-4`, `MED-2`).
 */
export async function unlinkNoteTransaction(
  userId: string,
  noteId: string,
  txId: string,
  input: UnlinkLinkedNoteTransactionInput,
  txOrDb?: DbOrTx,
): Promise<LinkedTransactionUnlinkResult> {
  const runInTx = async (
    tx: DbOrTx,
  ): Promise<LinkedTransactionUnlinkResult> => {
    await assertActiveNoteOwnership(tx, userId, noteId);

    const existingRow = await fetchJoinedTransactionRow(tx, userId, txId);
    if (!existingRow || existingRow.tx.noteId !== noteId) {
      throw new ApiError(
        404,
        "TRANSACTION_NOT_FOUND",
        "Linked transaction not found",
      );
    }

    const lww = resolveLwwTimestamp(existingRow.tx.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      return {
        unlinked: false,
        txId,
        transaction: serializeTransactionRow(existingRow),
        summary: await computeLinkedSummaryFromDb(tx, userId, noteId),
        conflictResolved: "server_newer",
      };
    }

    await tx
      .update(transactions)
      .set({
        noteId: null,
        updatedAt: lww.nextUpdatedAt,
      })
      .where(
        and(
          eq(transactions.id, existingRow.tx.id),
          eq(transactions.userId, userId),
          eq(transactions.noteId, noteId),
          isNull(transactions.deletedAt),
        ),
      );

    return {
      unlinked: true,
      txId,
      summary: await computeLinkedSummaryFromDb(tx, userId, noteId),
      conflictResolved: "applied",
    };
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}
