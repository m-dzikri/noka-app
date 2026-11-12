import {
  and,
  asc,
  desc,
  eq,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { transactions, transfers, wallets } from "@/db/schema/finance";
import {
  bigintToSafeNumber,
  computeWalletBalances,
  type LedgerTransactionInput,
  type LedgerTransferInput,
} from "@/features/finance/ledger";
import type {
  CreateWalletInput,
  DeleteFinanceMutationBody,
  UpdateWalletInput,
  WalletListQueryInput,
  WalletType,
} from "@/features/finance/schemas";
import {
  isPgUniqueViolation,
  type ConflictResolution,
} from "@/features/finance/shared";
import { ApiError } from "@/lib/api-response";
import { resolveLwwTimestamp } from "@/lib/idempotency";

export interface WalletWithBalanceDto {
  id: string;
  name: string;
  type: WalletType;
  initialBalance: number;
  currentBalance: number;
  includeInSafeToSpend: boolean;
  isDefault: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletMutationResult {
  wallet: WalletWithBalanceDto;
  conflictResolved: ConflictResolution;
}

export interface WalletDeleteResult {
  deleted: boolean;
  id: string;
  conflictResolved: ConflictResolution;
  wallet?: WalletWithBalanceDto;
}

function serializeWalletRow(
  row: typeof wallets.$inferSelect,
  currentBalance: bigint,
): WalletWithBalanceDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type as WalletType,
    initialBalance: Number(row.initialBalance),
    currentBalance: bigintToSafeNumber(currentBalance),
    includeInSafeToSpend: row.includeInSafeToSpend,
    isDefault: row.isDefault,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Loads all user wallets ordered `isDefault DESC, createdAt ASC`, computing exact balances via SQL aggregation + `computeWalletBalances`.
 */
export async function loadWalletsWithBalances(
  txOrDb: DbOrTx,
  userId: string,
  options: Partial<WalletListQueryInput> = {},
): Promise<WalletWithBalanceDto[]> {
  const includeArchived = options.includeArchived ?? false;

  const walletRows = await txOrDb
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, userId), isNull(wallets.deletedAt)))
    .orderBy(desc(wallets.isDefault), asc(wallets.createdAt));

  if (walletRows.length === 0) {
    return [];
  }

  const txSums = await txOrDb
    .select({
      walletId: transactions.walletId,
      type: transactions.type,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .groupBy(transactions.walletId, transactions.type);

  const transferOutSums = await txOrDb
    .select({
      fromWalletId: transfers.fromWalletId,
      total: sql<string>`COALESCE(SUM(${transfers.amount}), 0)::text`,
    })
    .from(transfers)
    .where(and(eq(transfers.userId, userId), isNull(transfers.deletedAt)))
    .groupBy(transfers.fromWalletId);

  const transferInSums = await txOrDb
    .select({
      toWalletId: transfers.toWalletId,
      total: sql<string>`COALESCE(SUM(${transfers.amount}), 0)::text`,
    })
    .from(transfers)
    .where(and(eq(transfers.userId, userId), isNull(transfers.deletedAt)))
    .groupBy(transfers.toWalletId);

  const ledgerTxs: LedgerTransactionInput[] = txSums.map((row) => ({
    walletId: row.walletId,
    type: row.type,
    amount: row.total,
  }));

  const ledgerTransfers: LedgerTransferInput[] = [
    ...transferOutSums.map((row) => ({
      fromWalletId: row.fromWalletId,
      toWalletId: "",
      amount: row.total,
    })),
    ...transferInSums.map((row) => ({
      fromWalletId: "",
      toWalletId: row.toWalletId,
      amount: row.total,
    })),
  ];

  const { balances } = computeWalletBalances(
    walletRows,
    ledgerTxs,
    ledgerTransfers,
  );

  const mapped = walletRows.map((row) =>
    serializeWalletRow(row, balances[row.id] ?? BigInt(row.initialBalance)),
  );

  return includeArchived
    ? mapped
    : mapped.filter((wallet) => wallet.archivedAt === null);
}

async function lockUserWallets(tx: DbOrTx, userId: string): Promise<void> {
  await tx
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), isNull(wallets.deletedAt)))
    .for("update");
}

async function promoteOldestRemainingActiveWallet(
  tx: DbOrTx,
  userId: string,
  excludedWalletId: string,
  updatedAt: Date,
): Promise<boolean> {
  const candidates = await tx
    .select({ id: wallets.id })
    .from(wallets)
    .where(
      and(
        eq(wallets.userId, userId),
        isNull(wallets.deletedAt),
        isNull(wallets.archivedAt),
        ne(wallets.id, excludedWalletId),
      ),
    )
    .orderBy(asc(wallets.createdAt))
    .limit(1);

  if (candidates.length === 0) {
    return false;
  }

  await tx
    .update(wallets)
    .set({ isDefault: true, updatedAt })
    .where(and(eq(wallets.id, candidates[0].id), eq(wallets.userId, userId)));
  return true;
}

/**
 * Creates a wallet while preserving single active default wallet semantics (DATA-2, F10).
 */
export async function createWallet(
  userId: string,
  input: CreateWalletInput,
  txOrDb?: DbOrTx,
): Promise<WalletWithBalanceDto> {
  const runInTx = async (tx: DbOrTx): Promise<WalletWithBalanceDto> => {
    await lockUserWallets(tx, userId);

    const existingWallets = await tx
      .select({
        id: wallets.id,
        archivedAt: wallets.archivedAt,
        isDefault: wallets.isDefault,
      })
      .from(wallets)
      .where(and(eq(wallets.userId, userId), isNull(wallets.deletedAt)));

    const hasActiveWallet = existingWallets.some(
      (row) => row.archivedAt === null,
    );
    const shouldBeDefault = !hasActiveWallet ? true : input.isDefault === true;
    const includeInSafeToSpend =
      input.includeInSafeToSpend ?? input.type !== "bank";
    const createdTimestamp = resolveLwwTimestamp(
      new Date(0),
      input.updatedAt,
    ).nextUpdatedAt;

    if (shouldBeDefault) {
      await tx
        .update(wallets)
        .set({ isDefault: false })
        .where(
          and(
            eq(wallets.userId, userId),
            isNull(wallets.deletedAt),
            eq(wallets.isDefault, true),
          ),
        );
    }

    try {
      const [inserted] = await tx
        .insert(wallets)
        .values({
          id: input.id,
          userId,
          name: input.name,
          type: input.type,
          initialBalance: input.initialBalance,
          includeInSafeToSpend,
          isDefault: shouldBeDefault,
          createdAt: createdTimestamp,
          updatedAt: createdTimestamp,
        })
        .returning();

      return serializeWalletRow(inserted, BigInt(inserted.initialBalance));
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new ApiError(
          409,
          "RESOURCE_ALREADY_EXISTS",
          "Wallet ID already exists",
        );
      }
      throw error;
    }
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}

/**
 * Updates wallet properties, default promotion, or archive state under LWW concurrency control.
 */
export async function updateWallet(
  userId: string,
  walletId: string,
  input: UpdateWalletInput,
  txOrDb?: DbOrTx,
): Promise<WalletMutationResult> {
  const runInTx = async (tx: DbOrTx): Promise<WalletMutationResult> => {
    await lockUserWallets(tx, userId);

    const existingRows = await tx
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

    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "WALLET_NOT_FOUND", "Wallet not found");
    }

    const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      const allWallets = await loadWalletsWithBalances(tx, userId, {
        includeArchived: true,
      });
      const current = allWallets.find((w) => w.id === walletId);
      return {
        wallet:
          current ?? serializeWalletRow(existing, BigInt(existing.initialBalance)),
        conflictResolved: "server_newer",
      };
    }

    if (
      existing.archivedAt !== null &&
      input.isDefault === true &&
      input.archived !== false
    ) {
      throw new ApiError(
        409,
        "WALLET_ARCHIVED",
        "Cannot set an archived wallet as default without unarchiving it",
      );
    }

    let nextArchivedAt = existing.archivedAt;
    if (input.archived === true) {
      nextArchivedAt = existing.archivedAt ?? lww.nextUpdatedAt;
    } else if (input.archived === false) {
      nextArchivedAt = null;
    }

    let nextIsDefault = existing.isDefault;

    if (input.archived === true) {
      nextIsDefault = false;
      if (existing.isDefault) {
        await promoteOldestRemainingActiveWallet(
          tx,
          userId,
          walletId,
          lww.nextUpdatedAt,
        );
      }
    } else if (input.archived === false) {
      if (input.isDefault === true) {
        await tx
          .update(wallets)
          .set({ isDefault: false, updatedAt: lww.nextUpdatedAt })
          .where(
            and(
              eq(wallets.userId, userId),
              isNull(wallets.deletedAt),
              ne(wallets.id, walletId),
              eq(wallets.isDefault, true),
            ),
          );
        nextIsDefault = true;
      } else if (input.isDefault === false) {
        nextIsDefault = false;
      } else {
        const otherDefault = await tx
          .select({ id: wallets.id })
          .from(wallets)
          .where(
            and(
              eq(wallets.userId, userId),
              isNull(wallets.deletedAt),
              isNull(wallets.archivedAt),
              ne(wallets.id, walletId),
              eq(wallets.isDefault, true),
            ),
          )
          .limit(1);
        nextIsDefault = otherDefault.length === 0 ? true : existing.isDefault;
      }
    } else if (input.isDefault === true) {
      await tx
        .update(wallets)
        .set({ isDefault: false, updatedAt: lww.nextUpdatedAt })
        .where(
          and(
            eq(wallets.userId, userId),
            isNull(wallets.deletedAt),
            ne(wallets.id, walletId),
            eq(wallets.isDefault, true),
          ),
        );
      nextIsDefault = true;
    } else if (input.isDefault === false) {
      if (existing.isDefault && nextArchivedAt === null) {
        const promoted = await promoteOldestRemainingActiveWallet(
          tx,
          userId,
          walletId,
          lww.nextUpdatedAt,
        );
        nextIsDefault = !promoted;
      } else {
        nextIsDefault = false;
      }
    }

    await tx
      .update(wallets)
      .set({
        name: input.name ?? existing.name,
        type: input.type ?? existing.type,
        initialBalance: input.initialBalance ?? existing.initialBalance,
        includeInSafeToSpend:
          input.includeInSafeToSpend ?? existing.includeInSafeToSpend,
        isDefault: nextIsDefault,
        archivedAt: nextArchivedAt,
        updatedAt: lww.nextUpdatedAt,
      })
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)));

    const reloaded = await loadWalletsWithBalances(tx, userId, {
      includeArchived: true,
    });
    const updatedWallet = reloaded.find((w) => w.id === walletId);
    if (!updatedWallet) {
      throw new ApiError(404, "WALLET_NOT_FOUND", "Wallet not found");
    }

    return {
      wallet: updatedWallet,
      conflictResolved: "applied",
    };
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}

/**
 * Deletes a 0-history wallet permanently or rejects wallets with any historical transactions/transfers (DATA-4, HIGH-3).
 */
export async function deleteWallet(
  userId: string,
  walletId: string,
  input: DeleteFinanceMutationBody,
  txOrDb?: DbOrTx,
): Promise<WalletDeleteResult> {
  const runInTx = async (tx: DbOrTx): Promise<WalletDeleteResult> => {
    await lockUserWallets(tx, userId);

    const existingRows = await tx
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

    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "WALLET_NOT_FOUND", "Wallet not found");
    }

    const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      const allWallets = await loadWalletsWithBalances(tx, userId, {
        includeArchived: true,
      });
      const current = allWallets.find((w) => w.id === walletId);
      return {
        deleted: false,
        id: walletId,
        wallet:
          current ?? serializeWalletRow(existing, BigInt(existing.initialBalance)),
        conflictResolved: "server_newer",
      };
    }

    // Count ALL referenced rows including soft-deleted tombstones so financial referential history is never broken (HIGH-3).
    const txHistoryRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.walletId, walletId),
        ),
      );

    const transferHistoryRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(transfers)
      .where(
        and(
          eq(transfers.userId, userId),
          or(
            eq(transfers.fromWalletId, walletId),
            eq(transfers.toWalletId, walletId),
          ),
        ),
      );

    const totalHistoryCount =
      Number(txHistoryRows[0]?.count ?? 0) +
      Number(transferHistoryRows[0]?.count ?? 0);

    if (totalHistoryCount > 0) {
      throw new ApiError(
        409,
        "WALLET_HAS_HISTORY",
        "Wallet has transaction or transfer history; archive it instead",
      );
    }

    await tx
      .delete(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)));

    if (existing.isDefault) {
      await promoteOldestRemainingActiveWallet(
        tx,
        userId,
        walletId,
        lww.nextUpdatedAt,
      );
    }

    return {
      deleted: true,
      id: walletId,
      conflictResolved: "applied",
    };
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}
