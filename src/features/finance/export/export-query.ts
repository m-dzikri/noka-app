import { and, desc, eq, gte, isNull, lte, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type DbOrTx } from "@/db";
import { users } from "@/db/schema/auth";
import { categories, transactions, transfers, wallets } from "@/db/schema/finance";
import { notes } from "@/db/schema/notes";
import { resolveActiveCycleWindow } from "@/features/finance/safe-to-spend";
import { DEFAULT_TZ_OFFSET_MINUTES } from "@/features/finance/schemas";
import { loadWalletsWithBalances } from "@/features/finance/wallets-service";
import { ApiError } from "@/lib/api-response";
import type {
  ExportCategorySummary,
  ExportDataset,
  ExportLedgerRow,
  ExportQueryParams,
  ExportWalletSummary,
} from "./types";

export const MAX_EXPORT_RANGE_DAYS = 731; // 2 years
export const MAX_EXPORT_ROW_LIMIT = 20_000;

export function formatExportDateTime(date: Date, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES): string {
  const targetTime = date.getTime() + tzOffsetMinutes * 60_000;
  const d = new Date(targetTime);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function formatExportDateOnly(date: Date, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES): string {
  const targetTime = date.getTime() + tzOffsetMinutes * 60_000;
  const d = new Date(targetTime);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export interface LoadExportDatasetOptions {
  txOrDb?: DbOrTx;
  cycleStartDay?: string;
  nowDate?: Date;
}

export async function loadFinanceExportDataset(
  userId: string,
  params: Partial<ExportQueryParams> = {},
  options: LoadExportDatasetOptions = {},
): Promise<ExportDataset> {
  const db = options.txOrDb ?? getDb();
  const nowDate = options.nowDate ?? new Date();
  const tzOffset = params.tzOffset ?? DEFAULT_TZ_OFFSET_MINUTES;

  // Resolve user cycle start day
  let userCycleStartDay = options.cycleStartDay;
  if (!userCycleStartDay) {
    const userRows = await db
      .select({ cycleStartDay: users.cycleStartDay })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    userCycleStartDay = userRows[0]?.cycleStartDay ? String(userRows[0].cycleStartDay) : "1";
  }

  // Resolve dates
  let startDate: Date;
  let endDate: Date;

  if (params.startDate && params.endDate) {
    startDate = new Date(params.startDate);
    endDate = new Date(params.endDate);

    // If string was just YYYY-MM-DD, set bounds
    if (params.startDate.length === 10) {
      startDate = new Date(`${params.startDate}T00:00:00.000Z`);
      startDate = new Date(startDate.getTime() - tzOffset * 60_000);
    }
    if (params.endDate.length === 10) {
      endDate = new Date(`${params.endDate}T23:59:59.999Z`);
      endDate = new Date(endDate.getTime() - tzOffset * 60_000);
    }
  } else if (params.startDate && !params.endDate) {
    startDate = new Date(params.startDate);
    if (params.startDate.length === 10) {
      startDate = new Date(`${params.startDate}T00:00:00.000Z`);
      startDate = new Date(startDate.getTime() - tzOffset * 60_000);
    }
    const cycle = resolveActiveCycleWindow(nowDate, userCycleStartDay, tzOffset);
    endDate = new Date(cycle.endDate);
  } else if (!params.startDate && params.endDate) {
    const cycle = resolveActiveCycleWindow(nowDate, userCycleStartDay, tzOffset);
    startDate = new Date(cycle.startDate);
    endDate = new Date(params.endDate);
    if (params.endDate.length === 10) {
      endDate = new Date(`${params.endDate}T23:59:59.999Z`);
      endDate = new Date(endDate.getTime() - tzOffset * 60_000);
    }
  } else {
    const cycle = resolveActiveCycleWindow(nowDate, userCycleStartDay, tzOffset);
    startDate = new Date(cycle.startDate);
    endDate = new Date(cycle.endDate);
  }

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid start or end date parameter", {
      field: isNaN(startDate.getTime()) ? "startDate" : "endDate",
    });
  }

  if (startDate > endDate) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "End date must be greater than or equal to start date",
      { field: "endDate" },
    );
  }

  const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > MAX_EXPORT_RANGE_DAYS) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      `Export date range cannot exceed ${MAX_EXPORT_RANGE_DAYS} days (2 years)`,
      { field: "endDate" },
    );
  }

  // Fetch wallets with balances
  const allWallets = await loadWalletsWithBalances(db, userId, { includeArchived: true });
  const walletsSummary: ExportWalletSummary[] = allWallets.map((w) => ({
    id: w.id,
    name: w.name,
    currentBalance: w.currentBalance,
  }));

  // Build transaction query predicates
  const txPredicates: SQL[] = [
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
    gte(transactions.occurredAt, startDate),
    lte(transactions.occurredAt, endDate),
  ];

  if (params.walletId) {
    txPredicates.push(eq(transactions.walletId, params.walletId));
  }
  if (params.categoryId) {
    txPredicates.push(eq(transactions.categoryId, params.categoryId));
  }

  const txRows = await db
    .select({
      tx: transactions,
      walletName: wallets.name,
      categoryName: categories.name,
      noteTitle: notes.title,
    })
    .from(transactions)
    .innerJoin(wallets, eq(transactions.walletId, wallets.id))
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(notes, and(eq(transactions.noteId, notes.id), isNull(notes.deletedAt)))
    .where(and(...txPredicates))
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt), desc(transactions.id))
    .limit(MAX_EXPORT_ROW_LIMIT);

  // Build transfers query if categoryId is not specified
  const shouldIncludeTransfers = !params.categoryId;
  let transferRows: Array<{
    transfer: typeof transfers.$inferSelect;
    fromWalletName: string;
    toWalletName: string;
  }> = [];

  if (shouldIncludeTransfers) {
    const trPredicates: SQL[] = [
      eq(transfers.userId, userId),
      isNull(transfers.deletedAt),
      gte(transfers.occurredAt, startDate),
      lte(transfers.occurredAt, endDate),
    ];

    if (params.walletId) {
      const walletMatch = or(
        eq(transfers.fromWalletId, params.walletId),
        eq(transfers.toWalletId, params.walletId),
      );
      if (walletMatch) {
        trPredicates.push(walletMatch);
      }
    }

    const fromWallets = alias(wallets, "from_wallet");
    const toWallets = alias(wallets, "to_wallet");

    transferRows = await db
      .select({
        transfer: transfers,
        fromWalletName: fromWallets.name,
        toWalletName: toWallets.name,
      })
      .from(transfers)
      .innerJoin(fromWallets, eq(transfers.fromWalletId, fromWallets.id))
      .innerJoin(toWallets, eq(transfers.toWalletId, toWallets.id))
      .where(and(...trPredicates))
      .orderBy(desc(transfers.occurredAt), desc(transfers.createdAt), desc(transfers.id))
      .limit(MAX_EXPORT_ROW_LIMIT);
  }

  // Combine rows
  const ledgerRows: ExportLedgerRow[] = [];
  let totalIncomeBig = 0n;
  let totalExpenseBig = 0n;
  const categoryTotals = new Map<string, { name: string; type: "income" | "expense"; totalBig: bigint }>();

  for (const row of txRows) {
    const amountBig = BigInt(row.tx.amount);
    const amountNum = Number(amountBig);
    const isIncome = row.tx.type === "income";

    if (isIncome) {
      totalIncomeBig += amountBig;
    } else {
      totalExpenseBig += amountBig;
    }

    // Accumulate category total
    const catEntry = categoryTotals.get(row.tx.categoryId) ?? {
      name: row.categoryName,
      type: row.tx.type as "income" | "expense",
      totalBig: 0n,
    };
    catEntry.totalBig += amountBig;
    categoryTotals.set(row.tx.categoryId, catEntry);

    const descParts: string[] = [];
    if (row.tx.description) {
      descParts.push(row.tx.description);
    }
    if (row.noteTitle) {
      descParts.push(`[Catatan: ${row.noteTitle}]`);
    }

    ledgerRows.push({
      id: row.tx.id,
      occurredAt: row.tx.occurredAt,
      occurredAtFormatted: formatExportDateTime(row.tx.occurredAt, tzOffset),
      type: row.tx.type as "income" | "expense",
      typeLabel: isIncome ? "Pemasukan (Income)" : "Pengeluaran (Expense)",
      walletName: row.walletName,
      categoryName: row.categoryName,
      amount: amountNum,
      notes: descParts.join(" "),
    });
  }

  for (const row of transferRows) {
    const amountNum = Number(row.transfer.amount);
    ledgerRows.push({
      id: row.transfer.id,
      occurredAt: row.transfer.occurredAt,
      occurredAtFormatted: formatExportDateTime(row.transfer.occurredAt, tzOffset),
      type: "transfer",
      typeLabel: "Transfer",
      walletName: `${row.fromWalletName} -> ${row.toWalletName}`,
      categoryName: "-",
      amount: amountNum,
      notes: row.transfer.note ?? "",
    });
  }

  // Sort merged rows descending by occurredAt, then id
  ledgerRows.sort((a, b) => {
    const timeDiff = b.occurredAt.getTime() - a.occurredAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.id.localeCompare(a.id);
  });

  const categoriesSummary: ExportCategorySummary[] = Array.from(categoryTotals.entries()).map(
    ([id, val]) => ({
      id,
      name: val.name,
      type: val.type,
      total: Number(val.totalBig),
    }),
  );
  categoriesSummary.sort((a, b) => b.total - a.total);

  const netCashflowBig = totalIncomeBig - totalExpenseBig;

  return {
    userId,
    generatedAt: nowDate,
    generatedAtFormatted: formatExportDateTime(nowDate, tzOffset),
    startDate,
    endDate,
    startDateFormatted: formatExportDateOnly(startDate, tzOffset),
    endDateFormatted: formatExportDateOnly(endDate, tzOffset),
    totalIncome: Number(totalIncomeBig),
    totalExpense: Number(totalExpenseBig),
    netCashflow: Number(netCashflowBig),
    wallets: walletsSummary,
    categories: categoriesSummary,
    rows: ledgerRows,
  };
}
