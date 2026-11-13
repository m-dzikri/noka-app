import {
  bigintToSafeNumber,
  computeWalletBalances,
} from "@/features/finance/ledger";
import {
  calculateSafeToSpend,
  resolveActiveCycleWindow,
} from "@/features/finance/safe-to-spend";
import {
  DEFAULT_TZ_OFFSET_MINUTES,
  FINANCE_LIST_DEFAULT_LIMIT,
  resolveDateFilterRange,
  type FinanceEntryType,
  type FinanceSummaryFilterType,
} from "@/features/finance/schemas";
import type {
  CategoryBreakdownItem,
  FinanceCashflowSummary,
  FinanceSummaryDto,
  SummaryLedgerItem,
} from "@/features/finance/summary-service";
import type { TransactionDto } from "@/features/finance/transactions-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import type { LinkedTransactionsListResult } from "@/features/notes/linked-transactions-service";
import { NOTE_LIST_DEFAULT_LIMIT } from "@/features/notes/schemas";
import type { NoteListResult } from "@/features/notes/service";
import { sortNotesInMemory, type MirrorDataState } from "@/features/sync/db";

export interface LocalNotesQuery {
  search?: string;
  folderId?: string;
  tagId?: string;
  tag?: string;
  pinned?: boolean;
  limit?: number;
  cursor?: string;
}

function parseOffsetCursor(cursor: string | undefined): number {
  if (!cursor || !cursor.startsWith("local-offset:")) {
    return 0;
  }
  const parsed = Number(cursor.slice("local-offset:".length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function encodeOffsetCursor(offset: number): string {
  return `local-offset:${offset}`;
}

/**
 * Filters, searches, sorts (`isPinned DESC, updatedAt DESC, id DESC`), and paginates notes locally in memory.
 */
export function queryLocalNotes(
  state: MirrorDataState,
  query: LocalNotesQuery = {},
): NoteListResult {
  const limit = query.limit ?? NOTE_LIST_DEFAULT_LIMIT;
  const searchLower = query.search?.trim().toLowerCase() ?? "";
  const tagNameLower = query.tag?.trim().toLowerCase() ?? "";

  const filtered = sortNotesInMemory(state.notes).filter((note) => {
    if (query.pinned && !note.isPinned) {
      return false;
    }
    if (query.folderId === "none") {
      if (note.folderId !== null) return false;
    } else if (query.folderId) {
      if (note.folderId !== query.folderId) return false;
    }
    if (query.tagId) {
      if (!note.tags.some((tag) => tag.id === query.tagId)) return false;
    }
    if (tagNameLower) {
      if (!note.tags.some((tag) => tag.name.toLowerCase() === tagNameLower)) {
        return false;
      }
    }
    if (searchLower) {
      const inTitle = note.title.toLowerCase().includes(searchLower);
      const inContent = note.content.toLowerCase().includes(searchLower);
      const inTags = note.tags.some((tag) =>
        tag.name.toLowerCase().includes(searchLower),
      );
      if (!inTitle && !inContent && !inTags) {
        return false;
      }
    }
    return true;
  });

  const offset = parseOffsetCursor(query.cursor);
  const slice = filtered.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  return {
    items: slice,
    nextCursor: nextOffset < filtered.length ? encodeOffsetCursor(nextOffset) : null,
  };
}

export interface LocalFinanceSummaryFilters {
  from?: string;
  to?: string;
  walletId?: string;
  type?: FinanceSummaryFilterType;
  categoryId?: string;
  includeArchived?: boolean;
  tzOffset?: number;
  limit?: number;
  cursor?: string;
}

/**
 * Computes the complete Finance Dashboard DTO (`wallets`, `totalBalance`, `cycle`,
 * `safeToSpend`, `cashflow`, `categoryBreakdown`, combined `ledger`) purely from the local IndexedDB mirror (`RFC-007` parity).
 */
export function computeLocalFinanceSummary(
  state: MirrorDataState,
  filters: LocalFinanceSummaryFilters = {},
  nowDate: Date = new Date(),
): FinanceSummaryDto {
  const tzOffset = filters.tzOffset ?? DEFAULT_TZ_OFFSET_MINUTES;
  const cycleStartDay = String(state.userProfile?.cycleStartDay ?? "1");
  const cycle = resolveActiveCycleWindow(nowDate, cycleStartDay, tzOffset);

  const range = resolveDateFilterRange(filters.from, filters.to, tzOffset);
  const fromMs = range.fromDate ? range.fromDate.getTime() : Date.parse(cycle.startUtcIso);
  const toMs = range.toDate
    ? range.toDate.getTime()
    : Date.parse(cycle.endExclusiveUtcIso) - 1;

  // Always recompute wallet balances deterministically via bigint ledger engine (DATA-2).
  const ledgerResult = computeWalletBalances(
    state.wallets,
    state.transactions,
    state.transfers,
  );
  const computedWallets: WalletWithBalanceDto[] = state.wallets.map((w) => ({
    ...w,
    currentBalance: bigintToSafeNumber(
      ledgerResult.balances[w.id] ?? BigInt(w.initialBalance),
    ),
  }));

  const safeToSpend = calculateSafeToSpend(
    computedWallets,
    nowDate,
    cycleStartDay,
    tzOffset,
  );
  const totalBalanceBig = computedWallets
    .filter((w) => w.archivedAt === null)
    .reduce((acc, w) => acc + BigInt(w.currentBalance), 0n);

  const visibleWallets = filters.includeArchived
    ? computedWallets
    : computedWallets.filter((w) => w.archivedAt === null);

  const filterType: FinanceSummaryFilterType = filters.type ?? "all";
  const activeNotesMap = new Map(state.notes.map((n) => [n.id, n.title]));

  // Cashflow & categoryBreakdown exclude transfers strictly (DATA-3).
  let incomeTotalBig = 0n;
  let expenseTotalBig = 0n;
  const breakdownBuckets = new Map<
    string,
    { categoryId: string; categoryName: string; type: FinanceEntryType; total: bigint }
  >();

  if (filterType !== "transfer") {
    for (const tx of state.transactions) {
      const occMs = Date.parse(tx.occurredAt);
      if (occMs < fromMs || occMs > toMs) continue;
      if (filters.walletId && tx.walletId !== filters.walletId) continue;
      if (filters.categoryId && tx.categoryId !== filters.categoryId) continue;
      if (
        (filterType === "income" || filterType === "expense") &&
        tx.type !== filterType
      ) {
        continue;
      }

      const amt = BigInt(tx.amount);
      if (tx.type === "income") {
        incomeTotalBig += amt;
      } else if (tx.type === "expense") {
        expenseTotalBig += amt;
      }

      const key = `${tx.categoryId}:${tx.type}`;
      const existing = breakdownBuckets.get(key);
      if (existing) {
        existing.total += amt;
      } else {
        breakdownBuckets.set(key, {
          categoryId: tx.categoryId,
          categoryName: tx.categoryName,
          type: tx.type,
          total: amt,
        });
      }
    }
  }

  const cashflow: FinanceCashflowSummary = {
    totalIncome: filterType === "transfer" || filterType === "expense"
      ? 0
      : bigintToSafeNumber(incomeTotalBig),
    totalExpense: filterType === "transfer" || filterType === "income"
      ? 0
      : bigintToSafeNumber(expenseTotalBig),
    net:
      filterType === "transfer"
        ? 0
        : bigintToSafeNumber(
            (filterType === "expense" ? 0n : incomeTotalBig) -
              (filterType === "income" ? 0n : expenseTotalBig),
          ),
  };

  const categoryBreakdown: CategoryBreakdownItem[] =
    filterType === "transfer"
      ? []
      : Array.from(breakdownBuckets.values())
          .map((bucket) => {
            const total = bigintToSafeNumber(bucket.total);
            const bucketTypeTotal =
              bucket.type === "income" ? incomeTotalBig : expenseTotalBig;
            const percentage =
              total <= 0 || bucketTypeTotal <= 0n
                ? 0
                : Math.round((total / Number(bucketTypeTotal)) * 100);
            return {
              categoryId: bucket.categoryId,
              categoryName: bucket.categoryName,
              type: bucket.type,
              total,
              percentage,
            };
          })
          .sort(
            (a, b) =>
              b.total - a.total || a.categoryName.localeCompare(b.categoryName),
          );

  const rawLedger: SummaryLedgerItem[] = [];

  if (filterType !== "transfer") {
    for (const tx of state.transactions) {
      const occMs = Date.parse(tx.occurredAt);
      if (occMs < fromMs || occMs > toMs) continue;
      if (filters.walletId && tx.walletId !== filters.walletId) continue;
      if (filters.categoryId && tx.categoryId !== filters.categoryId) continue;
      if (
        (filterType === "income" || filterType === "expense") &&
        tx.type !== filterType
      ) {
        continue;
      }
      rawLedger.push({
        ...tx,
        kind: "transaction",
        noteTitle: tx.noteId ? (activeNotesMap.get(tx.noteId) ?? null) : null,
      });
    }
  }

  const includeTransfers =
    (filterType === "all" || filterType === "transfer") && !filters.categoryId;
  if (includeTransfers) {
    for (const tr of state.transfers) {
      const occMs = Date.parse(tr.occurredAt);
      if (occMs < fromMs || occMs > toMs) continue;
      if (
        filters.walletId &&
        tr.fromWalletId !== filters.walletId &&
        tr.toWalletId !== filters.walletId
      ) {
        continue;
      }
      rawLedger.push({
        ...tr,
        kind: "transfer",
      });
    }
  }

  rawLedger.sort((a, b) => {
    const occDiff = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    if (occDiff !== 0) return occDiff;
    const crtDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (crtDiff !== 0) return crtDiff;
    if (a.kind !== b.kind) {
      return a.kind < b.kind ? -1 : 1;
    }
    return b.id.localeCompare(a.id);
  });

  const limit = filters.limit ?? FINANCE_LIST_DEFAULT_LIMIT;
  const offset = parseOffsetCursor(filters.cursor);
  const items = rawLedger.slice(offset, offset + limit);
  const nextOffset = offset + items.length;

  return {
    wallets: visibleWallets,
    totalBalance: bigintToSafeNumber(totalBalanceBig),
    cycle,
    safeToSpend,
    cashflow,
    categoryBreakdown,
    ledger: {
      items,
      nextCursor: nextOffset < rawLedger.length ? encodeOffsetCursor(nextOffset) : null,
    },
  };
}

/**
 * Computes linked transactions and income/expense summary for one note directly from local mirror.
 */
export function computeLocalLinkedTransactions(
  state: MirrorDataState,
  noteId: string,
): LinkedTransactionsListResult {
  const items = state.transactions
    .filter((tx) => tx.noteId === noteId)
    .sort((a, b) => {
      const occDiff = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
      if (occDiff !== 0) return occDiff;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });

  let totalIncome = 0n;
  let totalExpense = 0n;
  for (const tx of items) {
    const amt = BigInt(tx.amount);
    if (tx.type === "income") {
      totalIncome += amt;
    } else {
      totalExpense += amt;
    }
  }

  return {
    items,
    summary: {
      totalIncome: bigintToSafeNumber(totalIncome),
      totalExpense: bigintToSafeNumber(totalExpense),
      net: bigintToSafeNumber(totalIncome - totalExpense),
    },
  };
}

/**
 * Queries candidate linkable transactions locally with `unlinked` and pagination support.
 */
export function queryLocalTransactionsForPicker(
  state: MirrorDataState,
  options: { unlinkedOnly?: boolean; limit?: number; cursor?: string } = {},
): { items: TransactionDto[]; nextCursor: string | null } {
  const sorted = [...state.transactions]
    .filter((tx) => (options.unlinkedOnly ? tx.noteId === null : true))
    .sort((a, b) => {
      const occDiff = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
      if (occDiff !== 0) return occDiff;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  const limit = options.limit ?? 30;
  const offset = parseOffsetCursor(options.cursor);
  const items = sorted.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    nextCursor: nextOffset < sorted.length ? encodeOffsetCursor(nextOffset) : null,
  };
}
