import {
  and,
  desc,
  eq,
  gte,
  isNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type DbOrTx } from "@/db";
import { transfers, wallets } from "@/db/schema/finance";
import {
  FINANCE_LIST_DEFAULT_LIMIT,
  parseOccurredAtValue,
  resolveDateFilterRange,
  type CreateTransferInput,
  type DeleteFinanceMutationBody,
  type TransferListQueryInput,
  type UpdateTransferInput,
} from "@/features/finance/schemas";
import {
  buildFinanceCursorPredicate,
  encodeFinanceCursor,
  isPgUniqueViolation,
  type ConflictResolution,
} from "@/features/finance/shared";
import { ApiError } from "@/lib/api-response";
import { resolveLwwTimestamp } from "@/lib/idempotency";

export interface TransferDto {
  id: string;
  fromWalletId: string;
  fromWalletName: string;
  toWalletId: string;
  toWalletName: string;
  amount: number;
  note: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransferListResult {
  items: TransferDto[];
  nextCursor: string | null;
}

export interface TransferMutationResult {
  transfer: TransferDto;
  conflictResolved: ConflictResolution;
}

export interface TransferDeleteResult {
  deleted: boolean;
  id: string;
  conflictResolved: ConflictResolution;
  transfer?: TransferDto;
}

function serializeTransferJoinedRow(row: {
  transfer: typeof transfers.$inferSelect;
  fromWalletName: string;
  toWalletName: string;
}): TransferDto {
  return {
    id: row.transfer.id,
    fromWalletId: row.transfer.fromWalletId,
    fromWalletName: row.fromWalletName,
    toWalletId: row.transfer.toWalletId,
    toWalletName: row.toWalletName,
    amount: Number(row.transfer.amount),
    note: row.transfer.note ?? null,
    occurredAt: row.transfer.occurredAt.toISOString(),
    createdAt: row.transfer.createdAt.toISOString(),
    updatedAt: row.transfer.updatedAt.toISOString(),
  };
}

async function fetchTransferDtoById(
  txOrDb: DbOrTx,
  userId: string,
  transferId: string,
): Promise<TransferDto> {
  const fromWallets = alias(wallets, "from_wallet");
  const toWallets = alias(wallets, "to_wallet");

  const rows = await txOrDb
    .select({
      transfer: transfers,
      fromWalletName: fromWallets.name,
      toWalletName: toWallets.name,
    })
    .from(transfers)
    .innerJoin(fromWallets, eq(transfers.fromWalletId, fromWallets.id))
    .innerJoin(toWallets, eq(transfers.toWalletId, toWallets.id))
    .where(
      and(
        eq(transfers.id, transferId),
        eq(transfers.userId, userId),
        isNull(transfers.deletedAt),
      ),
    )
    .limit(1);

  if (!rows[0]) {
    throw new ApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
  }

  return serializeTransferJoinedRow(rows[0]);
}

async function loadOwnedWalletOrThrow(
  tx: DbOrTx,
  userId: string,
  walletId: string,
) {
  const rows = await tx
    .select()
    .from(wallets)
    .where(
      and(
        eq(wallets.id, walletId),
        eq(wallets.userId, userId),
        isNull(wallets.deletedAt),
      ),
    )
    .limit(1);

  if (!rows[0]) {
    throw new ApiError(404, "WALLET_NOT_FOUND", "Wallet not found");
  }
  return rows[0];
}

/**
 * Lists wallet transfers using keyset pagination `(occurredAt DESC, createdAt DESC, id DESC)`.
 */
export async function listTransfers(
  userId: string,
  query: Partial<TransferListQueryInput> = {},
  txOrDb: DbOrTx = getDb(),
): Promise<TransferListResult> {
  const limit = query.limit ?? FINANCE_LIST_DEFAULT_LIMIT;
  const { fromDate, toDate } = resolveDateFilterRange(
    query.from,
    query.to,
    query.tzOffset,
  );

  const conditions: SQL[] = [
    eq(transfers.userId, userId),
    isNull(transfers.deletedAt),
  ];

  if (query.walletId !== undefined) {
    const walletFilter = or(
      eq(transfers.fromWalletId, query.walletId),
      eq(transfers.toWalletId, query.walletId),
    );
    if (walletFilter) {
      conditions.push(walletFilter);
    }
  }

  if (fromDate !== undefined) {
    conditions.push(gte(transfers.occurredAt, fromDate));
  }

  if (toDate !== undefined) {
    conditions.push(lte(transfers.occurredAt, toDate));
  }

  if (query.cursor !== undefined) {
    const cursorCondition = buildFinanceCursorPredicate(
      {
        occurredAt: transfers.occurredAt,
        createdAt: transfers.createdAt,
        id: transfers.id,
      },
      query.cursor,
    );
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }
  }

  const fromWallets = alias(wallets, "from_wallet");
  const toWallets = alias(wallets, "to_wallet");

  const rows = await txOrDb
    .select({
      transfer: transfers,
      fromWalletName: fromWallets.name,
      toWalletName: toWallets.name,
    })
    .from(transfers)
    .innerJoin(fromWallets, eq(transfers.fromWalletId, fromWallets.id))
    .innerJoin(toWallets, eq(transfers.toWalletId, toWallets.id))
    .where(and(...conditions))
    .orderBy(
      desc(transfers.occurredAt),
      desc(transfers.createdAt),
      desc(transfers.id),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map(serializeTransferJoinedRow),
    nextCursor:
      hasMore && lastRow ? encodeFinanceCursor(lastRow.transfer) : null,
  };
}

/**
 * Records an atomic inter-wallet transfer without impacting income/expense cashflow summaries (DEC-6, DATA-3).
 */
export async function createTransfer(
  userId: string,
  input: CreateTransferInput,
  txOrDb?: DbOrTx,
): Promise<TransferDto> {
  if (input.fromWalletId === input.toWalletId) {
    throw new ApiError(
      422,
      "SAME_WALLET_TRANSFER",
      "Source and destination wallets must be different",
    );
  }

  const runInTx = async (tx: DbOrTx): Promise<TransferDto> => {
    const fromWallet = await loadOwnedWalletOrThrow(tx, userId, input.fromWalletId);
    const toWallet = await loadOwnedWalletOrThrow(tx, userId, input.toWalletId);

    if (fromWallet.archivedAt !== null || toWallet.archivedAt !== null) {
      throw new ApiError(
        409,
        "WALLET_ARCHIVED",
        "Cannot create a transfer involving an archived wallet",
      );
    }

    const occurredAt = parseOccurredAtValue(input.occurredAt);
    if (!occurredAt) {
      throw new ApiError(422, "VALIDATION_ERROR", "Invalid occurredAt timestamp");
    }

    const createdTimestamp = resolveLwwTimestamp(
      new Date(0),
      input.updatedAt,
    ).nextUpdatedAt;
    const normalizedNote =
      input.note === undefined || input.note === null
        ? null
        : input.note.length > 0
          ? input.note
          : null;

    try {
      const [inserted] = await tx
        .insert(transfers)
        .values({
          id: input.id,
          userId,
          fromWalletId: fromWallet.id,
          toWalletId: toWallet.id,
          amount: input.amount,
          note: normalizedNote,
          occurredAt,
          createdAt: createdTimestamp,
          updatedAt: createdTimestamp,
        })
        .returning();

      return serializeTransferJoinedRow({
        transfer: inserted,
        fromWalletName: fromWallet.name,
        toWalletName: toWallet.name,
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new ApiError(
          409,
          "RESOURCE_ALREADY_EXISTS",
          "Transfer ID already exists",
        );
      }
      throw error;
    }
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}

/**
 * Updates an inter-wallet transfer while enforcing distinct wallets, active wallet guards on balance-affecting edits, and LWW.
 */
export async function updateTransfer(
  userId: string,
  transferId: string,
  input: UpdateTransferInput,
  txOrDb?: DbOrTx,
): Promise<TransferMutationResult> {
  const runInTx = async (tx: DbOrTx): Promise<TransferMutationResult> => {
    const existingRows = await tx
      .select()
      .from(transfers)
      .where(
        and(
          eq(transfers.id, transferId),
          eq(transfers.userId, userId),
          isNull(transfers.deletedAt),
        ),
      )
      .for("update")
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    }

    const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      const dto = await fetchTransferDtoById(tx, userId, transferId);
      return {
        transfer: dto,
        conflictResolved: "server_newer",
      };
    }

    const effectiveFromWalletId =
      input.fromWalletId ?? existing.fromWalletId;
    const effectiveToWalletId = input.toWalletId ?? existing.toWalletId;

    if (effectiveFromWalletId === effectiveToWalletId) {
      throw new ApiError(
        422,
        "SAME_WALLET_TRANSFER",
        "Source and destination wallets must be different",
      );
    }

    const fromWallet = await loadOwnedWalletOrThrow(tx, userId, effectiveFromWalletId);
    const toWallet = await loadOwnedWalletOrThrow(tx, userId, effectiveToWalletId);

    const fromChanged =
      input.fromWalletId !== undefined &&
      input.fromWalletId !== existing.fromWalletId;
    const toChanged =
      input.toWalletId !== undefined && input.toWalletId !== existing.toWalletId;
    const amountChanged =
      input.amount !== undefined && input.amount !== Number(existing.amount);

    if (
      (fromChanged || toChanged || amountChanged) &&
      (fromWallet.archivedAt !== null || toWallet.archivedAt !== null)
    ) {
      throw new ApiError(
        409,
        "WALLET_ARCHIVED",
        "Cannot alter wallets or amount on a transfer involving an archived wallet",
      );
    }

    let nextOccurredAt = existing.occurredAt;
    if (input.occurredAt !== undefined) {
      const parsed = parseOccurredAtValue(input.occurredAt);
      if (!parsed) {
        throw new ApiError(422, "VALIDATION_ERROR", "Invalid occurredAt timestamp");
      }
      nextOccurredAt = parsed;
    }

    let nextNote = existing.note;
    if (input.note !== undefined) {
      nextNote =
        input.note === null || input.note.length === 0 ? null : input.note;
    }

    const [updated] = await tx
      .update(transfers)
      .set({
        fromWalletId: effectiveFromWalletId,
        toWalletId: effectiveToWalletId,
        amount: input.amount ?? existing.amount,
        note: nextNote,
        occurredAt: nextOccurredAt,
        updatedAt: lww.nextUpdatedAt,
      })
      .where(and(eq(transfers.id, transferId), eq(transfers.userId, userId)))
      .returning();

    return {
      transfer: serializeTransferJoinedRow({
        transfer: updated,
        fromWalletName: fromWallet.name,
        toWalletName: toWallet.name,
      }),
      conflictResolved: "applied",
    };
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}

/**
 * Soft-deletes a transfer, atomically reversing both wallet balances without touching cashflow totals (DATA-3).
 */
export async function deleteTransfer(
  userId: string,
  transferId: string,
  input: DeleteFinanceMutationBody,
  txOrDb?: DbOrTx,
): Promise<TransferDeleteResult> {
  const runInTx = async (tx: DbOrTx): Promise<TransferDeleteResult> => {
    const existingRows = await tx
      .select()
      .from(transfers)
      .where(
        and(
          eq(transfers.id, transferId),
          eq(transfers.userId, userId),
          isNull(transfers.deletedAt),
        ),
      )
      .for("update")
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    }

    const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      const dto = await fetchTransferDtoById(tx, userId, transferId);
      return {
        deleted: false,
        id: transferId,
        transfer: dto,
        conflictResolved: "server_newer",
      };
    }

    await tx
      .update(transfers)
      .set({
        deletedAt: new Date(),
        updatedAt: lww.nextUpdatedAt,
      })
      .where(and(eq(transfers.id, transferId), eq(transfers.userId, userId)));

    return {
      deleted: true,
      id: transferId,
      conflictResolved: "applied",
    };
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}
