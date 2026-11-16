import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import {
  categories,
  debtSettlements,
  debtsReceivables,
  transactions,
  wallets,
} from "@/db/schema/finance";
import { ApiError } from "@/lib/api-response";
import { parseOccurredAtValue } from "@/features/finance/schemas";
import type {
  CreateDebtInput,
  CreateSettlementInput,
  DebtFilterInput,
  DebtReceivableDetailDto,
  DebtReceivableDto,
  DebtSettlementDto,
  DebtsSummaryDto,
  UpdateDebtInput,
} from "./debt-schemas";

function mapDebtRow(
  row: typeof debtsReceivables.$inferSelect,
  now = new Date(),
): DebtReceivableDto {
  const remainingAmount = Math.max(0, row.totalAmount - row.settledAmount);
  const settlementPercentage =
    row.totalAmount > 0
      ? Math.min(100, Math.round((row.settledAmount / row.totalAmount) * 100))
      : 100;

  const dueDateObj = row.dueDate ? new Date(row.dueDate) : null;
  const isOverdue =
    row.status === "active" &&
    dueDateObj !== null &&
    dueDateObj.getTime() < now.getTime();

  const isDueSoon =
    row.status === "active" &&
    !isOverdue &&
    dueDateObj !== null &&
    dueDateObj.getTime() - now.getTime() <= 3 * 24 * 60 * 60 * 1000 &&
    dueDateObj.getTime() >= now.getTime();

  return {
    id: row.id,
    userId: row.userId,
    type: row.type as "debt" | "receivable",
    personName: row.personName,
    totalAmount: row.totalAmount,
    settledAmount: row.settledAmount,
    remainingAmount,
    settlementPercentage,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    notes: row.notes ?? null,
    status: row.status as "active" | "settled",
    isOverdue,
    isDueSoon,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Calculates global debt summary and lists debts matching filters.
 */
export async function listDebts(
  userId: string,
  filters: Partial<DebtFilterInput> = {},
  txOrDb: DbOrTx = getDb(),
): Promise<{ summary: DebtsSummaryDto; items: DebtReceivableDto[] }> {
  const now = new Date();

  // 1. Fetch all non-deleted debts for this user to compute accurate global summary
  const allDebts = await txOrDb
    .select()
    .from(debtsReceivables)
    .where(
      and(
        eq(debtsReceivables.userId, userId),
        isNull(debtsReceivables.deletedAt),
      ),
    )
    .orderBy(desc(debtsReceivables.createdAt));

  let totalDebt = 0;
  let totalReceivable = 0;
  let activeDebtsCount = 0;
  let activeReceivablesCount = 0;
  let overdueCount = 0;

  for (const row of allDebts) {
    if (row.status === "active") {
      const remaining = Math.max(0, row.totalAmount - row.settledAmount);
      if (row.type === "debt") {
        totalDebt += remaining;
        activeDebtsCount += 1;
      } else {
        totalReceivable += remaining;
        activeReceivablesCount += 1;
      }

      if (row.dueDate && new Date(row.dueDate).getTime() < now.getTime()) {
        overdueCount += 1;
      }
    }
  }

  const summary: DebtsSummaryDto = {
    totalDebt,
    totalReceivable,
    netPosition: totalReceivable - totalDebt,
    activeDebtsCount,
    activeReceivablesCount,
    overdueCount,
  };

  // 2. Filter items according to user query
  let filteredRows = allDebts;

  if (filters.type) {
    filteredRows = filteredRows.filter((r) => r.type === filters.type);
  }
  if (filters.status) {
    filteredRows = filteredRows.filter((r) => r.status === filters.status);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filteredRows = filteredRows.filter(
      (r) =>
        r.personName.toLowerCase().includes(q) ||
        (r.notes && r.notes.toLowerCase().includes(q)),
    );
  }

  const items = filteredRows.map((r) => mapDebtRow(r, now));

  return { summary, items };
}

/**
 * Fetches distinct person names recorded by this user for autocomplete suggestions.
 */
export async function listContactNames(
  userId: string,
  txOrDb: DbOrTx = getDb(),
): Promise<string[]> {
  const rows = await txOrDb
    .select({ personName: debtsReceivables.personName })
    .from(debtsReceivables)
    .where(
      and(
        eq(debtsReceivables.userId, userId),
        isNull(debtsReceivables.deletedAt),
      ),
    )
    .groupBy(debtsReceivables.personName)
    .orderBy(asc(debtsReceivables.personName));

  return rows.map((r) => r.personName);
}

/**
 * Retrieves a single debt or receivable by ID, including its full settlement history.
 */
export async function getDebtById(
  userId: string,
  debtId: string,
  txOrDb: DbOrTx = getDb(),
): Promise<DebtReceivableDetailDto> {
  const [debt] = await txOrDb
    .select()
    .from(debtsReceivables)
    .where(
      and(
        eq(debtsReceivables.id, debtId),
        eq(debtsReceivables.userId, userId),
        isNull(debtsReceivables.deletedAt),
      ),
    )
    .limit(1);

  if (!debt) {
    throw new ApiError(404, "NOT_FOUND", "Data utang/piutang tidak ditemukan");
  }

  const settlementsRows = await txOrDb
    .select({
      settlement: debtSettlements,
      walletName: wallets.name,
    })
    .from(debtSettlements)
    .leftJoin(wallets, eq(debtSettlements.walletId, wallets.id))
    .where(eq(debtSettlements.debtId, debtId))
    .orderBy(desc(debtSettlements.settledAt), desc(debtSettlements.createdAt));

  const settlements: DebtSettlementDto[] = settlementsRows.map((row) => ({
    id: row.settlement.id,
    debtId: row.settlement.debtId,
    walletId: row.settlement.walletId ?? null,
    transactionId: row.settlement.transactionId ?? null,
    amount: row.settlement.amount,
    notes: row.settlement.notes ?? null,
    settledAt: row.settlement.settledAt.toISOString(),
    createdAt: row.settlement.createdAt.toISOString(),
    walletName: row.walletName ?? null,
  }));

  return {
    ...mapDebtRow(debt),
    settlements,
  };
}

/**
 * Creates a new debt or receivable record.
 * Principal amounts do not alter regular monthly spending or cash ledger balances (DEC-3, AC-14.1).
 */
export async function createDebt(
  userId: string,
  input: CreateDebtInput,
  txOrDb: DbOrTx = getDb(),
): Promise<DebtReceivableDto> {
  let dueDateObj: Date | null = null;
  if (input.dueDate) {
    dueDateObj = parseOccurredAtValue(input.dueDate);
    if (!dueDateObj) {
      throw new ApiError(400, "INVALID_DATE", "Format tanggal jatuh tempo tidak valid");
    }
  }

  const [created] = await txOrDb
    .insert(debtsReceivables)
    .values({
      id: input.id,
      userId,
      type: input.type,
      personName: input.personName.trim(),
      totalAmount: input.totalAmount,
      settledAmount: 0,
      dueDate: dueDateObj,
      notes: input.notes?.trim() || null,
      status: "active",
    })
    .returning();

  return mapDebtRow(created);
}

/**
 * Updates an existing debt or receivable's details.
 */
export async function updateDebt(
  userId: string,
  debtId: string,
  input: UpdateDebtInput,
  txOrDb: DbOrTx = getDb(),
): Promise<DebtReceivableDto> {
  const [existing] = await txOrDb
    .select()
    .from(debtsReceivables)
    .where(
      and(
        eq(debtsReceivables.id, debtId),
        eq(debtsReceivables.userId, userId),
        isNull(debtsReceivables.deletedAt),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new ApiError(404, "NOT_FOUND", "Data utang/piutang tidak ditemukan");
  }

  const patch: Partial<typeof debtsReceivables.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.personName !== undefined) {
    patch.personName = input.personName.trim();
  }

  if (input.dueDate !== undefined) {
    if (input.dueDate === null) {
      patch.dueDate = null;
    } else {
      const parsed = parseOccurredAtValue(input.dueDate);
      if (!parsed) {
        throw new ApiError(400, "INVALID_DATE", "Format tanggal jatuh tempo tidak valid");
      }
      patch.dueDate = parsed;
    }
  }

  if (input.notes !== undefined) {
    patch.notes = input.notes?.trim() || null;
  }

  const [updated] = await txOrDb
    .update(debtsReceivables)
    .set(patch)
    .where(
      and(
        eq(debtsReceivables.id, debtId),
        eq(debtsReceivables.userId, userId),
      ),
    )
    .returning();

  return mapDebtRow(updated);
}

/**
 * Soft-deletes a debt/receivable record while preserving past cash ledger transactions (AC-14.6).
 */
export async function deleteDebt(
  userId: string,
  debtId: string,
  txOrDb: DbOrTx = getDb(),
): Promise<{ deleted: true }> {
  const [existing] = await txOrDb
    .select()
    .from(debtsReceivables)
    .where(
      and(
        eq(debtsReceivables.id, debtId),
        eq(debtsReceivables.userId, userId),
        isNull(debtsReceivables.deletedAt),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new ApiError(404, "NOT_FOUND", "Data utang/piutang tidak ditemukan");
  }

  await txOrDb
    .update(debtsReceivables)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(debtsReceivables.id, debtId),
        eq(debtsReceivables.userId, userId),
      ),
    );

  return { deleted: true };
}

/**
 * Records a settlement payment.
 * If walletId is supplied, creates an atomic cash ledger transaction (EXPENSE for debt, INCOME for receivable).
 * If walletId is null/omitted, records the settlement without mutating wallet balances.
 * Automatically marks debt as SETTLED when settledAmount >= totalAmount.
 * Rejects payments exceeding remaining principal (AC-14.2, AC-14.3).
 */
export async function recordSettlement(
  userId: string,
  debtId: string,
  input: CreateSettlementInput,
): Promise<{ settlement: DebtSettlementDto; debt: DebtReceivableDto }> {
  const db = getDb();

  return await db.transaction(async (tx) => {
    // 1. Lock debt row
    const [debt] = await tx
      .select()
      .from(debtsReceivables)
      .where(
        and(
          eq(debtsReceivables.id, debtId),
          eq(debtsReceivables.userId, userId),
          isNull(debtsReceivables.deletedAt),
        ),
      )
      .for("update");

    if (!debt) {
      throw new ApiError(404, "NOT_FOUND", "Data utang/piutang tidak ditemukan");
    }

    if (debt.status === "settled" || debt.settledAmount >= debt.totalAmount) {
      throw new ApiError(422, "DEBT_ALREADY_SETTLED", "Utang/piutang ini sudah lunas");
    }

    const remainingAmount = debt.totalAmount - debt.settledAmount;
    if (input.amount > remainingAmount) {
      throw new ApiError(
        422,
        "OVER_SETTLEMENT",
        `Nominal pelunasan (Rp ${input.amount.toLocaleString("id-ID")}) melebihi sisa pokok (Rp ${remainingAmount.toLocaleString("id-ID")})`,
      );
    }

    let settledAtDate = new Date();
    if (input.settledAt) {
      const parsed = parseOccurredAtValue(input.settledAt);
      if (parsed) {
        settledAtDate = parsed;
      }
    }

    let createdTransactionId: string | null = null;
    let walletName: string | null = null;

    // 2. If walletId is provided, verify wallet and create cash ledger transaction
    if (input.walletId) {
      const [wallet] = await tx
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

      if (!wallet) {
        throw new ApiError(404, "WALLET_NOT_FOUND", "Dompet tidak ditemukan");
      }
      walletName = wallet.name;

      const txType: "expense" | "income" =
        debt.type === "debt" ? "expense" : "income";

      let categoryId = input.categoryId;

      if (categoryId) {
        const [cat] = await tx
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.id, categoryId),
              eq(categories.userId, userId),
              isNull(categories.deletedAt),
            ),
          )
          .limit(1);
        if (!cat) {
          throw new ApiError(404, "CATEGORY_NOT_FOUND", "Kategori tidak ditemukan");
        }
      } else {
        // Fallback to system category: other_expense or other_income
        const fallbackSystemKey =
          txType === "expense" ? "other_expense" : "other_income";

        const [systemCat] = await tx
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.userId, userId),
              eq(categories.systemKey, fallbackSystemKey),
              isNull(categories.deletedAt),
            ),
          )
          .limit(1);

        if (systemCat) {
          categoryId = systemCat.id;
        } else {
          // Fallback to any active category of matching type
          const [anyCat] = await tx
            .select()
            .from(categories)
            .where(
              and(
                eq(categories.userId, userId),
                eq(categories.type, txType),
                isNull(categories.deletedAt),
              ),
            )
            .limit(1);

          if (!anyCat) {
            throw new ApiError(
              400,
              "CATEGORY_REQUIRED",
              "Kategori tidak ditemukan untuk transaksi pelunasan",
            );
          }
          categoryId = anyCat.id;
        }
      }

      const txDescription =
        debt.type === "debt"
          ? `Pelunasan Utang: ${debt.personName}${input.notes ? ` - ${input.notes}` : ""}`
          : `Pelunasan Piutang: ${debt.personName}${input.notes ? ` - ${input.notes}` : ""}`;

      const [txRow] = await tx
        .insert(transactions)
        .values({
          userId,
          walletId: input.walletId,
          categoryId,
          type: txType,
          amount: input.amount,
          description: txDescription.slice(0, 300),
          occurredAt: settledAtDate,
        })
        .returning({ id: transactions.id });

      createdTransactionId = txRow.id;
    }

    // 3. Record debt settlement row
    const [settlementRow] = await tx
      .insert(debtSettlements)
      .values({
        id: input.id,
        debtId,
        walletId: input.walletId ?? null,
        transactionId: createdTransactionId,
        amount: input.amount,
        notes: input.notes?.trim() || null,
        settledAt: settledAtDate,
      })
      .returning();

    // 4. Update debt settled amount and status
    const newSettledAmount = debt.settledAmount + input.amount;
    const newStatus =
      newSettledAmount >= debt.totalAmount ? "settled" : "active";

    const [updatedDebt] = await tx
      .update(debtsReceivables)
      .set({
        settledAmount: newSettledAmount,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(debtsReceivables.id, debtId))
      .returning();

    const settlementDto: DebtSettlementDto = {
      id: settlementRow.id,
      debtId: settlementRow.debtId,
      walletId: settlementRow.walletId ?? null,
      transactionId: settlementRow.transactionId ?? null,
      amount: settlementRow.amount,
      notes: settlementRow.notes ?? null,
      settledAt: settlementRow.settledAt.toISOString(),
      createdAt: settlementRow.createdAt.toISOString(),
      walletName,
    };

    return {
      settlement: settlementDto,
      debt: mapDebtRow(updatedDebt),
    };
  });
}

/**
 * Reverts / deletes a settlement payment.
 * If the settlement created a cash ledger transaction, that transaction is atomically deleted
 * (restoring the wallet balance). The debt settled amount is decremented, and if it was settled,
 * its status is restored to 'active'.
 */
export async function deleteSettlement(
  userId: string,
  debtId: string,
  settlementId: string,
): Promise<{ deleted: true; settlementId: string; debt: DebtReceivableDto }> {
  const db = getDb();

  return await db.transaction(async (tx) => {
    // 1. Lock debt row
    const [debt] = await tx
      .select()
      .from(debtsReceivables)
      .where(
        and(
          eq(debtsReceivables.id, debtId),
          eq(debtsReceivables.userId, userId),
          isNull(debtsReceivables.deletedAt),
        ),
      )
      .for("update");

    if (!debt) {
      throw new ApiError(404, "NOT_FOUND", "Data utang/piutang tidak ditemukan");
    }

    // 2. Find settlement row
    const [settlement] = await tx
      .select()
      .from(debtSettlements)
      .where(
        and(
          eq(debtSettlements.id, settlementId),
          eq(debtSettlements.debtId, debtId),
        ),
      )
      .limit(1);

    if (!settlement) {
      throw new ApiError(404, "NOT_FOUND", "Riwayat cicilan tidak ditemukan");
    }

    // 3. If there was a linked cash transaction, delete it to restore wallet balance
    if (settlement.transactionId) {
      await tx
        .delete(transactions)
        .where(
          and(
            eq(transactions.id, settlement.transactionId),
            eq(transactions.userId, userId),
          ),
        );
    }

    // 4. Delete settlement row
    await tx
      .delete(debtSettlements)
      .where(eq(debtSettlements.id, settlementId));

    // 5. Decrement settled amount and update status
    const newSettledAmount = Math.max(0, debt.settledAmount - settlement.amount);
    const newStatus =
      newSettledAmount >= debt.totalAmount ? "settled" : "active";

    const [updatedDebt] = await tx
      .update(debtsReceivables)
      .set({
        settledAmount: newSettledAmount,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(debtsReceivables.id, debtId))
      .returning();

    return {
      deleted: true,
      settlementId,
      debt: mapDebtRow(updatedDebt),
    };
  });
}

