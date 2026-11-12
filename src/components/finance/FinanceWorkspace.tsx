"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, FolderKanban, Plus, Wallet } from "lucide-react";
import { CashflowSummaryCards } from "@/components/finance/CashflowSummaryCards";
import { CategoryManagerModal } from "@/components/finance/CategoryManagerModal";
import {
  dispatchFinanceUpdated,
  FINANCE_UPDATED_EVENT,
  WORKSPACE_UPDATED_EVENT,
  readJsonSafe,
  resolveFinanceErrorMessage,
  type ApiErrorPayload,
  type WorkspaceUpdatedDetail,
} from "@/components/finance/finance-client-helpers";
import {
  LedgerFilterBar,
  type LedgerFiltersState,
} from "@/components/finance/LedgerFilterBar";
import { LedgerList } from "@/components/finance/LedgerList";
import { SafeToSpendCard } from "@/components/finance/SafeToSpendCard";
import { TransactionFormModal } from "@/components/finance/TransactionFormModal";
import { TransferFormModal } from "@/components/finance/TransferFormModal";
import { WalletListSection } from "@/components/finance/WalletListSection";
import { WalletManagerModal } from "@/components/finance/WalletManagerModal";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { FinanceSummaryDto } from "@/features/finance/summary-service";
import type { TransactionDto } from "@/features/finance/transactions-service";
import type { TransferDto } from "@/features/finance/transfers-service";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";

export interface FinanceWorkspaceProps {
  initialSummary: FinanceSummaryDto;
  initialCategories: CategoryDto[];
}

const DEFAULT_FILTERS: LedgerFiltersState = {
  walletId: "",
  type: "all",
  categoryId: "",
  from: "",
  to: "",
};

/**
 * Prevents single-sided or inverted `from`/`to` edits from falling outside active cycle defaults and causing 422 `from > to`.
 */
function normalizeLedgerDateBounds(
  patch: Pick<Partial<LedgerFiltersState>, "from" | "to">,
  current: Pick<LedgerFiltersState, "from" | "to">,
  cycle: { startDate: string; endDate: string },
): { from: string; to: string } {
  let from = patch.from ?? current.from;
  let to = patch.to ?? current.to;

  if (patch.from !== undefined) {
    if (!from && to && to < cycle.startDate) {
      to = "";
    } else if (from && ((to && from > to) || (!to && from > cycle.endDate))) {
      to = from;
    }
  }

  if (patch.to !== undefined) {
    if (!to && from && from > cycle.endDate) {
      from = "";
    } else if (to && ((from && to < from) || (!from && to < cycle.startDate))) {
      from = to;
    }
  }

  return { from, to };
}

/**
 * Interactive bilingual Finance Dashboard integrating Safe-to-Spend, Cashflow Summary, Wallet balances, Unified Ledger, and Privacy Blur (`F10`–`F13`, `F16`, `F17`).
 */
export function FinanceWorkspace({
  initialSummary,
  initialCategories,
}: FinanceWorkspaceProps) {
  const { t } = useI18n();

  const [summary, setSummary] = useState<FinanceSummaryDto>(initialSummary);
  const [categories, setCategories] = useState<CategoryDto[]>(initialCategories);

  const [showArchivedWallets, setShowArchivedWallets] = useState(false);
  const [filters, setFilters] = useState<LedgerFiltersState>(DEFAULT_FILTERS);

  const [loadingMore, setLoadingMore] = useState(false);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "transaction"; item: TransactionDto }
    | { kind: "transfer"; item: TransferDto }
    | null
  >(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionDto | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<TransferDto | null>(
    null,
  );

  const activeWallets = useMemo(
    () => summary.wallets.filter((w) => w.archivedAt === null),
    [summary.wallets],
  );

  const surfaceNonOkError = useCallback(
    async (res: Response): Promise<void> => {
      const errPayload = await readJsonSafe<ApiErrorPayload>(res);
      setErrorMsg(resolveFinanceErrorMessage(t, errPayload));
    },
    [t],
  );

  const buildSummaryQuery = useCallback(
    (nextFilters: LedgerFiltersState, cursor?: string | null) => {
      const sp = new URLSearchParams();
      sp.set("includeArchived", "true");
      sp.set("tzOffset", String(-new Date().getTimezoneOffset()));
      if (nextFilters.walletId) sp.set("walletId", nextFilters.walletId);
      if (nextFilters.type !== "all") sp.set("type", nextFilters.type);
      if (nextFilters.categoryId && nextFilters.type !== "transfer") {
        sp.set("categoryId", nextFilters.categoryId);
      }
      if (nextFilters.from) sp.set("from", nextFilters.from);
      if (nextFilters.to) sp.set("to", nextFilters.to);
      if (cursor) sp.set("cursor", cursor);
      return sp;
    },
    [],
  );

  const fetchSummaryWithFilters = useCallback(
    async (nextFilters: LedgerFiltersState) => {
      setErrorMsg(null);
      const summaryParams = buildSummaryQuery(nextFilters, null);

      const [summaryRes, catsRes] = await Promise.all([
        apiFetch(`/api/finance/summary?${summaryParams.toString()}`),
        apiFetch("/api/categories"),
      ]);

      if (summaryRes.ok) {
        const payload = await readJsonSafe<{ data: FinanceSummaryDto }>(
          summaryRes,
        );
        if (payload?.data) {
          setSummary(payload.data);
        }
      } else {
        await surfaceNonOkError(summaryRes);
      }

      if (catsRes.ok) {
        const payload = await readJsonSafe<{
          data: { categories: CategoryDto[] };
        }>(catsRes);
        if (payload?.data?.categories) {
          setCategories(payload.data.categories);
        }
      } else {
        await surfaceNonOkError(catsRes);
      }
    },
    [buildSummaryQuery, surfaceNonOkError],
  );

  const refreshAllFinanceData = useCallback(async () => {
    await fetchSummaryWithFilters(filters);
  }, [fetchSummaryWithFilters, filters]);

  useEffect(() => {
    const onExternalFinanceUpdate = () => {
      void refreshAllFinanceData();
    };
    const onWorkspaceUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<WorkspaceUpdatedDetail | undefined>;
      const source = customEvent.detail?.source;
      if (
        (!customEvent.detail?.kind ||
          customEvent.detail.kind === "transaction") &&
        source !== "finance-workspace" &&
        source !== "quick-capture" &&
        source !== "linked-transactions-panel"
      ) {
        void refreshAllFinanceData();
      }
    };
    window.addEventListener(FINANCE_UPDATED_EVENT, onExternalFinanceUpdate);
    window.addEventListener(WORKSPACE_UPDATED_EVENT, onWorkspaceUpdated);
    return () => {
      window.removeEventListener(
        FINANCE_UPDATED_EVENT,
        onExternalFinanceUpdate,
      );
      window.removeEventListener(WORKSPACE_UPDATED_EVENT, onWorkspaceUpdated);
    };
  }, [refreshAllFinanceData]);

  function handleFilterChange(patch: Partial<LedgerFiltersState>): void {
    const nextType = patch.type ?? filters.type;
    let nextCategoryId = patch.categoryId ?? filters.categoryId;

    if (patch.type !== undefined) {
      if (nextType === "transfer") {
        nextCategoryId = "";
      } else if (nextType !== "all" && nextCategoryId) {
        const selectedCategory = categories.find(
          (cat) => cat.id === nextCategoryId,
        );
        if (!selectedCategory || selectedCategory.type !== nextType) {
          nextCategoryId = "";
        }
      }
    }

    const { from, to } = normalizeLedgerDateBounds(patch, filters, summary.cycle);

    const nextFilters: LedgerFiltersState = {
      walletId: patch.walletId ?? filters.walletId,
      type: nextType,
      categoryId: nextCategoryId,
      from,
      to,
    };

    setFilters(nextFilters);
    void fetchSummaryWithFilters(nextFilters);
  }

  async function handleResetFilters(): Promise<void> {
    setFilters(DEFAULT_FILTERS);
    await fetchSummaryWithFilters(DEFAULT_FILTERS);
  }

  async function handleLoadMore(): Promise<void> {
    if (loadingMore || !summary.ledger.nextCursor) return;
    setLoadingMore(true);
    setErrorMsg(null);

    try {
      const params = buildSummaryQuery(filters, summary.ledger.nextCursor);
      const res = await apiFetch(`/api/finance/summary?${params.toString()}`);
      if (res.ok) {
        const payload = await readJsonSafe<{ data: FinanceSummaryDto }>(res);
        if (payload?.data) {
          setSummary((prev) => ({
            ...payload.data,
            ledger: {
              items: [...prev.ledger.items, ...payload.data.ledger.items],
              nextCursor: payload.data.ledger.nextCursor,
            },
          }));
        }
      } else {
        await surfaceNonOkError(res);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDeleteTransaction(tx: TransactionDto): Promise<void> {
    setBusyDeleteId(tx.id);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/transactions/${tx.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ updatedAt: tx.updatedAt }),
      });

      if (!res.ok) {
        await surfaceNonOkError(res);
        return;
      }

      await refreshAllFinanceData();
      dispatchFinanceUpdated();
    } finally {
      setBusyDeleteId(null);
    }
  }

  async function handleDeleteTransfer(transfer: TransferDto): Promise<void> {
    setBusyDeleteId(transfer.id);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/transfers/${transfer.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ updatedAt: transfer.updatedAt }),
      });

      if (!res.ok) {
        await surfaceNonOkError(res);
        return;
      }

      await refreshAllFinanceData();
      dispatchFinanceUpdated();
    } finally {
      setBusyDeleteId(null);
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    const target = pendingDelete;
    try {
      if (target.kind === "transaction") {
        await handleDeleteTransaction(target.item);
      } else {
        await handleDeleteTransfer(target.item);
      }
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="mb-0 gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle as="h1" className="text-2xl">
              {t.finance.pageTitle}
            </CardTitle>
            <CardDescription>{t.finance.pageSubtitle}</CardDescription>
          </div>
          <div className="flex shrink-0 flex-col sm:items-end">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {t.finance.totalBalanceLabel}
            </span>
            <span
              data-testid="finance-total-balance"
              className="text-2xl font-bold tracking-tight text-[var(--text-primary)]"
            >
              <PrivacyAmount amount={summary.totalBalance} signMode="plain" />
            </span>
          </div>
        </CardHeader>

        <CardContent className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setEditingTx(null);
              setTxModalOpen(true);
            }}
            disabled={activeWallets.length === 0}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{t.finance.newTransactionButton}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              setEditingTransfer(null);
              setTransferModalOpen(true);
            }}
            disabled={activeWallets.length < 2}
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            <span>{t.finance.newTransferButton}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => setWalletModalOpen(true)}
          >
            <Wallet className="h-4 w-4" aria-hidden="true" />
            <span>{t.finance.manageWalletsButton}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => setCategoryModalOpen(true)}
          >
            <FolderKanban className="h-4 w-4" aria-hidden="true" />
            <span>{t.finance.manageCategoriesButton}</span>
          </Button>
        </CardContent>
      </Card>

      {errorMsg ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--status-expense)]/40 bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--status-expense)]"
        >
          {errorMsg}
        </p>
      ) : null}

      <SafeToSpendCard
        safeToSpend={summary.safeToSpend}
        cycle={summary.cycle}
      />

      <WalletListSection
        wallets={summary.wallets}
        showArchived={showArchivedWallets}
        onToggleShowArchived={setShowArchivedWallets}
        onOpenWalletModal={() => setWalletModalOpen(true)}
      />

      <CashflowSummaryCards
        cashflow={summary.cashflow}
        categoryBreakdown={summary.categoryBreakdown}
      />

      <Card>
        <CardHeader className="gap-3">
          <CardTitle as="h2" className="text-lg">
            {t.finance.ledger.sectionTitle}
          </CardTitle>

          <LedgerFilterBar
            filters={filters}
            wallets={summary.wallets}
            categories={categories}
            cycle={{
              startDate: summary.cycle.startDate,
              endDate: summary.cycle.endDate,
            }}
            onFilterChange={handleFilterChange}
            onReset={() => void handleResetFilters()}
          />
        </CardHeader>

        <CardContent>
          <LedgerList
            items={summary.ledger.items}
            filterType={filters.type}
            nextCursor={summary.ledger.nextCursor}
            loadingMore={loadingMore}
            busyDeleteId={busyDeleteId}
            onEditTransaction={(tx) => {
              setEditingTx(tx);
              setTxModalOpen(true);
            }}
            onRequestDeleteTransaction={(tx) =>
              setPendingDelete({ kind: "transaction", item: tx })
            }
            onEditTransfer={(tr) => {
              setEditingTransfer(tr);
              setTransferModalOpen(true);
            }}
            onRequestDeleteTransfer={(tr) =>
              setPendingDelete({ kind: "transfer", item: tr })
            }
            onLoadMore={() => void handleLoadMore()}
          />
        </CardContent>
      </Card>

      <WalletManagerModal
        open={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        wallets={summary.wallets}
        onMutated={refreshAllFinanceData}
      />

      <CategoryManagerModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        categories={categories}
        onMutated={refreshAllFinanceData}
      />

      <TransactionFormModal
        open={txModalOpen}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
        }}
        wallets={summary.wallets}
        categories={categories}
        editingTransaction={editingTx}
        onMutated={refreshAllFinanceData}
      />

      <TransferFormModal
        open={transferModalOpen}
        onClose={() => {
          setTransferModalOpen(false);
          setEditingTransfer(null);
        }}
        wallets={summary.wallets}
        editingTransfer={editingTransfer}
        onMutated={refreshAllFinanceData}
      />

      <Modal
        open={pendingDelete !== null}
        onClose={() => {
          if (!busyDeleteId) setPendingDelete(null);
        }}
        title={t.finance.ledger.deleteButton}
        description={
          pendingDelete
            ? pendingDelete.kind === "transfer"
              ? t.finance.ledger.confirmDeleteTransfer
              : t.finance.ledger.confirmDeleteTransaction
            : undefined
        }
      >
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={Boolean(busyDeleteId)}
            onClick={() => setPendingDelete(null)}
          >
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={busyDeleteId === pendingDelete?.item.id}
            onClick={() => void handleConfirmDelete()}
          >
            {t.finance.ledger.deleteButton}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
