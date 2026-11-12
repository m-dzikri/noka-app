import {
  and,
  desc,
  eq,
  gte,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type DbOrTx } from "@/db";
import { users } from "@/db/schema/auth";
import {
  categories,
  transactions,
  transfers,
  wallets,
} from "@/db/schema/finance";
import { notes } from "@/db/schema/notes";
import {
  calculateSafeToSpend,
  resolveActiveCycleWindow,
  type CycleWindowInfo,
  type SafeToSpendResult,
} from "@/features/finance/safe-to-spend";
import {
  DEFAULT_TZ_OFFSET_MINUTES,
  FINANCE_LIST_DEFAULT_LIMIT,
  resolveDateFilterRange,
  type FinanceEntryType,
  type FinanceSummaryQueryInput,
} from "@/features/finance/schemas";
import {
  buildSummaryCursorPredicate,
  decodeSummaryCursor,
  encodeSummaryCursor,
  type DecodedSummaryCursor,
  type SummaryLedgerKind,
} from "@/features/finance/shared";
import type { TransactionDto } from "@/features/finance/transactions-service";
import type { TransferDto } from "@/features/finance/transfers-service";
import {
  loadWalletsWithBalances,
  type WalletWithBalanceDto,
} from "@/features/finance/wallets-service";

export interface FinanceCashflowSummary {
  totalIncome: number;
  totalExpense: number;
  net: number;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  categoryName: string;
  type: FinanceEntryType;
  total: number;
  percentage: number;
}

export interface SummaryLedgerTransactionItem extends TransactionDto {
  kind: "transaction";
  noteTitle: string | null;
}

export interface SummaryLedgerTransferItem extends TransferDto {
  kind: "transfer";
}

export type SummaryLedgerItem =
  | SummaryLedgerTransactionItem
  | SummaryLedgerTransferItem;

export interface FinanceSummaryDto {
  wallets: WalletWithBalanceDto[];
  totalBalance: number;
  cycle: CycleWindowInfo;
  safeToSpend: SafeToSpendResult;
  cashflow: FinanceCashflowSummary;
  categoryBreakdown: CategoryBreakdownItem[];
  ledger: {
    items: SummaryLedgerItem[];
    nextCursor: string | null;
  };
}

export interface FinanceSummaryOptions {
  nowDate?: Date;
  cycleStartDay?: string;
  txOrDb?: DbOrTx;
}

interface RawLedgerRow {
  sortKey: {
    occurredAt: Date;
    createdAt: Date;
    kind: SummaryLedgerKind;
    id: string;
  };
  dto: SummaryLedgerItem;
}

function compareLedgerSortDesc(
  a: RawLedgerRow["sortKey"],
  b: RawLedgerRow["sortKey"],
): number {
  const occDiff = b.occurredAt.getTime() - a.occurredAt.getTime();
  if (occDiff !== 0) return occDiff;
  const crtDiff = b.createdAt.getTime() - a.createdAt.getTime();
  if (crtDiff !== 0) return crtDiff;
  if (a.kind !== b.kind) {
    return a.kind < b.kind ? -1 : 1;
  }
  return b.id.localeCompare(a.id);
}

async function resolveUserCycleStartDay(
  db: DbOrTx,
  userId: string,
  override?: string,
): Promise<string> {
  if (override) {
    return override;
  }
  const rows = await db
    .select({ cycleStartDay: users.cycleStartDay })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.cycleStartDay ?? "1";
}

async function queryCashflowAndBreakdown(
  db: DbOrTx,
  userId: string,
  fromDate: Date,
  toDate: Date,
  filters: Pick<
    FinanceSummaryQueryInput,
    "walletId" | "categoryId" | "type"
  >,
): Promise<{
  cashflow: FinanceCashflowSummary;
  categoryBreakdown: CategoryBreakdownItem[];
}> {
  if (filters.type === "transfer") {
    return {
      cashflow: { totalIncome: 0, totalExpense: 0, net: 0 },
      categoryBreakdown: [],
    };
  }

  const predicates: SQL[] = [
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
    gte(transactions.occurredAt, fromDate),
    lte(transactions.occurredAt, toDate),
  ];

  if (filters.walletId) {
    predicates.push(eq(transactions.walletId, filters.walletId));
  }
  if (filters.categoryId) {
    predicates.push(eq(transactions.categoryId, filters.categoryId));
  }
  if (filters.type === "income" || filters.type === "expense") {
    predicates.push(eq(transactions.type, filters.type));
  }

  const grouped = await db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      type: transactions.type,
      totalText: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...predicates))
    .groupBy(categories.id, categories.name, transactions.type);

  let incomeTotalBig = 0n;
  let expenseTotalBig = 0n;

  for (const row of grouped) {
    const bucket = BigInt(row.totalText);
    if (row.type === "income") {
      incomeTotalBig += bucket;
    } else if (row.type === "expense") {
      expenseTotalBig += bucket;
    }
  }

  const effectiveIncome =
    filters.type === "expense" ? 0 : Number(incomeTotalBig);
  const effectiveExpense =
    filters.type === "income" ? 0 : Number(expenseTotalBig);
  const netBig =
    (filters.type === "expense" ? 0n : incomeTotalBig) -
    (filters.type === "income" ? 0n : expenseTotalBig);

  const breakdown: CategoryBreakdownItem[] = grouped
    .map((row) => {
      const entryType = row.type as FinanceEntryType;
      const totalBig = BigInt(row.totalText);
      const total = Number(totalBig);
      const typeBucketTotal =
        entryType === "income" ? incomeTotalBig : expenseTotalBig;
      const percentage =
        total <= 0 || typeBucketTotal <= 0n
          ? 0
          : Math.round((total / Number(typeBucketTotal)) * 100);

      return {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        type: entryType,
        total,
        percentage,
      };
    })
    .sort(
      (a, b) => b.total - a.total || a.categoryName.localeCompare(b.categoryName),
    );

  return {
    cashflow: {
      totalIncome: effectiveIncome,
      totalExpense: effectiveExpense,
      net: Number(netBig),
    },
    categoryBreakdown: breakdown,
  };
}

async function queryCombinedLedger(
  db: DbOrTx,
  userId: string,
  fromDate: Date,
  toDate: Date,
  filters: Pick<
    FinanceSummaryQueryInput,
    "walletId" | "categoryId" | "type" | "limit"
  >,
  decodedCursor: DecodedSummaryCursor | null,
): Promise<{ items: SummaryLedgerItem[]; nextCursor: string | null }> {
  const limit = filters.limit ?? FINANCE_LIST_DEFAULT_LIMIT;
  const includeTransactions = filters.type !== "transfer";
  const includeTransfers =
    (filters.type === "all" || filters.type === "transfer") &&
    !filters.categoryId;

  if (!includeTransactions && !includeTransfers) {
    return { items: [], nextCursor: null };
  }

  const txPromise: Promise<RawLedgerRow[]> = includeTransactions
    ? (async () => {
        const txPredicates: SQL[] = [
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
          gte(transactions.occurredAt, fromDate),
          lte(transactions.occurredAt, toDate),
        ];

        if (filters.walletId) {
          txPredicates.push(eq(transactions.walletId, filters.walletId));
        }
        if (filters.categoryId) {
          txPredicates.push(eq(transactions.categoryId, filters.categoryId));
        }
        if (filters.type === "income" || filters.type === "expense") {
          txPredicates.push(eq(transactions.type, filters.type));
        }
        if (decodedCursor) {
          const pred = buildSummaryCursorPredicate(
            transactions,
            "transaction",
            decodedCursor,
          );
          if (pred) {
            txPredicates.push(pred);
          }
        }

        const rows = await db
          .select({
            tx: transactions,
            walletName: wallets.name,
            categoryName: categories.name,
            noteTitle: notes.title,
          })
          .from(transactions)
          .innerJoin(wallets, eq(transactions.walletId, wallets.id))
          .innerJoin(categories, eq(transactions.categoryId, categories.id))
          .leftJoin(
            notes,
            and(eq(transactions.noteId, notes.id), isNull(notes.deletedAt)),
          )
          .where(and(...txPredicates))
          .orderBy(
            desc(transactions.occurredAt),
            desc(transactions.createdAt),
            desc(transactions.id),
          )
          .limit(limit + 1);

        return rows.map((row) => ({
          sortKey: {
            occurredAt: row.tx.occurredAt,
            createdAt: row.tx.createdAt,
            kind: "transaction" as const,
            id: row.tx.id,
          },
          dto: {
            kind: "transaction" as const,
            id: row.tx.id,
            walletId: row.tx.walletId,
            walletName: row.walletName,
            categoryId: row.tx.categoryId,
            categoryName: row.categoryName,
            noteId: row.tx.noteId ?? null,
            noteTitle: row.tx.noteId ? (row.noteTitle ?? null) : null,
            type: row.tx.type as FinanceEntryType,
            amount: Number(row.tx.amount),
            description: row.tx.description ?? null,
            occurredAt: row.tx.occurredAt.toISOString(),
            createdAt: row.tx.createdAt.toISOString(),
            updatedAt: row.tx.updatedAt.toISOString(),
          },
        }));
      })()
    : Promise.resolve([]);

  const transferPromise: Promise<RawLedgerRow[]> = includeTransfers
    ? (async () => {
        const trPredicates: SQL[] = [
          eq(transfers.userId, userId),
          isNull(transfers.deletedAt),
          gte(transfers.occurredAt, fromDate),
          lte(transfers.occurredAt, toDate),
        ];

        if (filters.walletId) {
          const walletMatch = or(
            eq(transfers.fromWalletId, filters.walletId),
            eq(transfers.toWalletId, filters.walletId),
          );
          if (walletMatch) {
            trPredicates.push(walletMatch);
          }
        }
        if (decodedCursor) {
          const pred = buildSummaryCursorPredicate(
            transfers,
            "transfer",
            decodedCursor,
          );
          if (pred) {
            trPredicates.push(pred);
          }
        }

        const fromWallets = alias(wallets, "from_wallet");
        const toWallets = alias(wallets, "to_wallet");

        const rows = await db
          .select({
            transfer: transfers,
            fromWalletName: fromWallets.name,
            toWalletName: toWallets.name,
          })
          .from(transfers)
          .innerJoin(fromWallets, eq(transfers.fromWalletId, fromWallets.id))
          .innerJoin(toWallets, eq(transfers.toWalletId, toWallets.id))
          .where(and(...trPredicates))
          .orderBy(
            desc(transfers.occurredAt),
            desc(transfers.createdAt),
            desc(transfers.id),
          )
          .limit(limit + 1);

        return rows.map((row) => ({
          sortKey: {
            occurredAt: row.transfer.occurredAt,
            createdAt: row.transfer.createdAt,
            kind: "transfer" as const,
            id: row.transfer.id,
          },
          dto: {
            kind: "transfer" as const,
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
          },
        }));
      })()
    : Promise.resolve([]);

  const [txRows, transferRows] = await Promise.all([txPromise, transferPromise]);
  const merged = [...txRows, ...transferRows].sort((a, b) =>
    compareLedgerSortDesc(a.sortKey, b.sortKey),
  );

  const hasMore = merged.length > limit;
  const page = hasMore ? merged.slice(0, limit) : merged;
  const lastRow = hasMore ? page[page.length - 1] : undefined;

  return {
    items: page.map((row) => row.dto),
    nextCursor: lastRow ? encodeSummaryCursor(lastRow.sortKey) : null,
  };
}

/**
 * Computes the unified Finance cycle summary including ledger-derived wallet balances, Safe-to-Spend allowance, cashflow, category breakdown, and paginated combined ledger.
 */
export async function getFinanceSummary(
  userId: string,
  query: Partial<FinanceSummaryQueryInput> = {},
  options: FinanceSummaryOptions = {},
): Promise<FinanceSummaryDto> {
  const db = options.txOrDb ?? getDb();
  const nowDate = options.nowDate ?? new Date();
  const tzOffset = query.tzOffset ?? DEFAULT_TZ_OFFSET_MINUTES;
  const filterType = query.type ?? "all";
  const includeArchived = query.includeArchived ?? false;
  const limit = query.limit ?? FINANCE_LIST_DEFAULT_LIMIT;

  const decodedCursor = query.cursor ? decodeSummaryCursor(query.cursor) : null;

  const [cycleStartDay, allWallets] = await Promise.all([
    resolveUserCycleStartDay(db, userId, options.cycleStartDay),
    loadWalletsWithBalances(db, userId, { includeArchived: true }),
  ]);

  const activeWallets = allWallets.filter((w) => w.archivedAt === null);
  let totalBalanceBig = 0n;
  for (const wallet of activeWallets) {
    totalBalanceBig += BigInt(Math.trunc(wallet.currentBalance));
  }

  const cycle = resolveActiveCycleWindow(nowDate, cycleStartDay, tzOffset);
  const safeToSpend = calculateSafeToSpend(
    activeWallets,
    nowDate,
    cycleStartDay,
    tzOffset,
  );

  const { fromDate, toDate } = resolveDateFilterRange(
    query.from ?? cycle.startDate,
    query.to ?? cycle.endDate,
    tzOffset,
  );

  const resolvedFrom = fromDate ?? new Date(cycle.startUtcIso);
  const resolvedTo = toDate ?? new Date(cycle.endExclusiveUtcIso);

  const [{ cashflow, categoryBreakdown }, ledger] = await Promise.all([
    queryCashflowAndBreakdown(db, userId, resolvedFrom, resolvedTo, {
      walletId: query.walletId,
      categoryId: query.categoryId,
      type: filterType,
    }),
    queryCombinedLedger(
      db,
      userId,
      resolvedFrom,
      resolvedTo,
      {
        walletId: query.walletId,
        categoryId: query.categoryId,
        type: filterType,
        limit,
      },
      decodedCursor,
    ),
  ]);

  return {
    wallets: includeArchived ? allWallets : activeWallets,
    totalBalance: Number(totalBalanceBig),
    cycle,
    safeToSpend,
    cashflow,
    categoryBreakdown,
    ledger,
  };
}

