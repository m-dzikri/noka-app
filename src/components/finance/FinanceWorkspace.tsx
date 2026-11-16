"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeftRight,
  Download,
  FolderKanban,
  Plus,
  Repeat,
  Target,
  Wallet,
  X,
} from "lucide-react";
import { BudgetManagerModal } from "@/components/finance/BudgetManagerModal";
import { CashflowSummaryCards } from "@/components/finance/CashflowSummaryCards";
import { CategoryBudgetSection } from "@/components/finance/CategoryBudgetSection";
import { CategoryManagerModal } from "@/components/finance/CategoryManagerModal";
import { ExportDataModal } from "@/components/finance/ExportDataModal";
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
import { RecurringPendingBanner } from "@/components/finance/RecurringPendingBanner";
import { RecurringTemplateModal } from "@/components/finance/RecurringTemplateModal";
import { SafeToSpendCard } from "@/components/finance/SafeToSpendCard";
import { TransactionFormModal } from "@/components/finance/TransactionFormModal";
import { TransferFormModal } from "@/components/finance/TransferFormModal";
import { WalletListSection } from "@/components/finance/WalletListSection";
import { WalletManagerModal } from "@/components/finance/WalletManagerModal";
import { useOptionalSync } from "@/components/providers/SyncProvider";
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
import type { CategoryBudgetSummaryDto } from "@/features/finance/budgets-schemas";
import type { CategoryDto } from "@/features/finance/categories-service";
import type {
  PendingRecurringDto,
  RecurringTemplateDto,
} from "@/features/finance/recurring-schemas";
import type { FinanceSummaryDto } from "@/features/finance/summary-service";
import type { TransactionDto } from "@/features/finance/transactions-service";
import type { TransferDto } from "@/features/finance/transfers-service";
import {
  executeOfflineCapableMutation,
  isLikelyNetworkError,
} from "@/features/sync/client-api";
import {
  computeLocalCategoryBudgets,
  computeLocalFinanceSummary,
} from "@/features/sync/local-queries";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";

export interface FinanceWorkspaceProps {
  initialSummary: FinanceSummaryDto;
  initialCategories: CategoryDto[];
  initialBudgets?: CategoryBudgetSummaryDto | null;
  initialRecurringTemplates?: RecurringTemplateDto[];
  initialPendingRecurring?: PendingRecurringDto[];
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
  initialBudgets,
  initialRecurringTemplates,
  initialPendingRecurring,
}: FinanceWorkspaceProps) {
  const { t } = useI18n();
  const budgetsDict = t.finance?.budgets;
  const sync = useOptionalSync();

  const [summary, setSummary] = useState<FinanceSummaryDto>(initialSummary);
  const [categories, setCategories] = useState<CategoryDto[]>(initialCategories);
  const [budgetsSummary, setBudgetsSummary] =
    useState<CategoryBudgetSummaryDto | null>(initialBudgets ?? null);
  const [recurringTemplates, setRecurringTemplates] = useState<
    RecurringTemplateDto[]
  >(initialRecurringTemplates ?? []);
  const [pendingRecurring, setPendingRecurring] = useState<
    PendingRecurringDto[]
  >(initialPendingRecurring ?? []);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const activeCyclePeriod = summary.cycle.startDate.slice(0, 7);
  const [selectedBudgetPeriod, setSelectedBudgetPeriod] = useState<string>(
    initialBudgets?.period ?? activeCyclePeriod,
  );
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [loadingBudgets, setLoadingBudgets] = useState(false);

  const exceededBudgets = useMemo(() => {
    if (!budgetsSummary?.items) return [];
    return budgetsSummary.items.filter((b) => b.status === "exceeded");
  }, [budgetsSummary]);

  const exceededKey = useMemo(
    () =>
      exceededBudgets
        .map((b) => `${b.categoryId}:${b.remainingAmount}`)
        .sort()
        .join(","),
    [exceededBudgets],
  );
  const [lastDismissedExceededKey, setLastDismissedExceededKey] = useState<string | null>(null);
  const showOverbudgetBanner =
    exceededBudgets.length > 0 && lastDismissedExceededKey !== exceededKey;

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
  const [exportModalOpen, setExportModalOpen] = useState(false);

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

  const syncMirror = sync?.mirror ?? null;
  const applyLocalSummaryFromMirror = useCallback(
    (nextFilters: LedgerFiltersState, cursor?: string | null) => {
      if (!syncMirror) {
        return false;
      }
      const computed = computeLocalFinanceSummary(syncMirror, {
        from: nextFilters.from || undefined,
        to: nextFilters.to || undefined,
        walletId: nextFilters.walletId || undefined,
        type: nextFilters.type,
        categoryId:
          nextFilters.categoryId && nextFilters.type !== "transfer"
            ? nextFilters.categoryId
            : undefined,
        includeArchived: true,
        tzOffset: -new Date().getTimezoneOffset(),
        cursor: cursor ?? undefined,
      });

      if (cursor) {
        setSummary((prev) => ({
          ...computed,
          ledger: {
            items: [...prev.ledger.items, ...computed.ledger.items],
            nextCursor: computed.ledger.nextCursor,
          },
        }));
      } else {
        setSummary(computed);
      }

      if (syncMirror.categories.length > 0) {
        setCategories(syncMirror.categories);
      }
      if (syncMirror.recurringTemplates) {
        setRecurringTemplates(syncMirror.recurringTemplates);
      }
      const localBudgets = computeLocalCategoryBudgets(syncMirror, {
        period: selectedBudgetPeriod,
      });
      setBudgetsSummary(localBudgets);
      return true;
    },
    [selectedBudgetPeriod, syncMirror],
  );

  const fetchSummaryWithFilters = useCallback(
    async (nextFilters: LedgerFiltersState) => {
      setErrorMsg(null);
      const offlineNow =
        sync !== null
          ? !sync.isOnline
          : typeof navigator !== "undefined" && navigator.onLine === false;

      if (offlineNow && applyLocalSummaryFromMirror(nextFilters, null)) {
        return;
      }

      const summaryParams = buildSummaryQuery(nextFilters, null);
      try {
        setLoadingBudgets(true);

        if (!offlineNow) {
          try {
            const processRes = await apiFetch(
              "/api/finance/recurring/process",
              { method: "POST" },
            );
            if (processRes.ok) {
              const pData = await readJsonSafe<{
                data: {
                  appliedCount: number;
                  pendingConfirmations: PendingRecurringDto[];
                };
              }>(processRes);
              if (pData?.data?.pendingConfirmations) {
                setPendingRecurring(pData.data.pendingConfirmations);
              }
            }
          } catch {
            // Non-blocking for summary loading
          }
        }

        const [summaryRes, catsRes, budgetsRes, recurringRes] =
          await Promise.all([
            apiFetch(`/api/finance/summary?${summaryParams.toString()}`),
            apiFetch("/api/categories"),
            apiFetch(
              `/api/finance/budgets?period=${selectedBudgetPeriod}&tzOffset=${-new Date().getTimezoneOffset()}`,
            ),
            apiFetch("/api/finance/recurring"),
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

        if (budgetsRes.ok) {
          const payload = await readJsonSafe<{
            data: CategoryBudgetSummaryDto;
          }>(budgetsRes);
          if (payload?.data?.items && Array.isArray(payload.data.items)) {
            setBudgetsSummary(payload.data);
          }
        } else {
          await surfaceNonOkError(budgetsRes);
        }

        if (recurringRes.ok) {
          const payload = await readJsonSafe<{
            data: { templates: RecurringTemplateDto[] };
          }>(recurringRes);
          if (
            payload?.data?.templates &&
            Array.isArray(payload.data.templates)
          ) {
            setRecurringTemplates(payload.data.templates);
          }
        } else {
          await surfaceNonOkError(recurringRes);
        }
      } catch (err) {
        if (
          isLikelyNetworkError(err) &&
          applyLocalSummaryFromMirror(nextFilters, null)
        ) {
          return;
        }
        setErrorMsg(t.errors.generic);
      } finally {
        setLoadingBudgets(false);
      }
    },
    [
      applyLocalSummaryFromMirror,
      buildSummaryQuery,
      selectedBudgetPeriod,
      surfaceNonOkError,
      sync,
      t.errors.generic,
    ],
  );

  const handleSelectBudgetPeriod = useCallback(
    async (period: string) => {
      setSelectedBudgetPeriod(period);
      setLoadingBudgets(true);
      const offlineNow =
        sync !== null
          ? !sync.isOnline
          : typeof navigator !== "undefined" && navigator.onLine === false;

      if (offlineNow && syncMirror) {
        const localBudgets = computeLocalCategoryBudgets(syncMirror, {
          period,
        });
        setBudgetsSummary(localBudgets);
        setLoadingBudgets(false);
        return;
      }

      try {
        const res = await apiFetch(
          `/api/finance/budgets?period=${period}&tzOffset=${-new Date().getTimezoneOffset()}`,
        );
        if (res.ok) {
          const payload = await readJsonSafe<{
            data: CategoryBudgetSummaryDto;
          }>(res);
          if (payload?.data?.items && Array.isArray(payload.data.items)) {
            setBudgetsSummary(payload.data);
          }
        } else {
          await surfaceNonOkError(res);
        }
      } catch (err) {
        if (isLikelyNetworkError(err) && syncMirror) {
          const localBudgets = computeLocalCategoryBudgets(syncMirror, {
            period,
          });
          setBudgetsSummary(localBudgets);
        }
      } finally {
        setLoadingBudgets(false);
      }
    },
    [surfaceNonOkError, sync, syncMirror],
  );

  const refreshAllFinanceData = useCallback(async () => {
    await fetchSummaryWithFilters(filters);
  }, [fetchSummaryWithFilters, filters]);

  useEffect(() => {
    if (!sync?.mirror) {
      return;
    }
    if (!sync.isOnline || sync.pendingCount > 0 || sync.mirrorVersion > 1) {
      queueMicrotask(() => {
        applyLocalSummaryFromMirror(filters, null);
      });
    }
  }, [
    applyLocalSummaryFromMirror,
    filters,
    sync?.isOnline,
    sync?.mirror,
    sync?.mirrorVersion,
    sync?.pendingCount,
  ]);

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

    const offlineNow =
      sync !== null
        ? !sync.isOnline
        : typeof navigator !== "undefined" && navigator.onLine === false;

    try {
      if (
        (offlineNow || summary.ledger.nextCursor.startsWith("local-offset:")) &&
        applyLocalSummaryFromMirror(filters, summary.ledger.nextCursor)
      ) {
        return;
      }

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
    } catch (err) {
      if (
        !isLikelyNetworkError(err) ||
        !applyLocalSummaryFromMirror(filters, summary.ledger.nextCursor)
      ) {
        setErrorMsg(t.errors.generic);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDeleteTransaction(tx: TransactionDto): Promise<void> {
    setBusyDeleteId(tx.id);
    setErrorMsg(null);
    const nowIso = new Date().toISOString();
    try {
      const outcome = await executeOfflineCapableMutation(
        sync
          ? {
              userId: sync.userId,
              isOnline: sync.isOnline,
              storageAvailable: sync.storageAvailable,
              onMirrorChanged: () => void sync.reloadMirror(),
            }
          : null,
        {
          entity: "transaction",
          entityId: tx.id,
          op: "delete",
          method: "DELETE",
          path: `/api/transactions/${tx.id}`,
          updatedAt: tx.updatedAt,
          body: { updatedAt: tx.updatedAt },
          optimisticSnapshot: {
            kind: "transaction_delete",
            id: tx.id,
            deletedAt: nowIso,
          },
        },
      );

      if (outcome.mode === "online" && outcome.errorPayload) {
        setErrorMsg(resolveFinanceErrorMessage(t, outcome.errorPayload));
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
    const nowIso = new Date().toISOString();
    try {
      const outcome = await executeOfflineCapableMutation(
        sync
          ? {
              userId: sync.userId,
              isOnline: sync.isOnline,
              storageAvailable: sync.storageAvailable,
              onMirrorChanged: () => void sync.reloadMirror(),
            }
          : null,
        {
          entity: "transfer",
          entityId: transfer.id,
          op: "delete",
          method: "DELETE",
          path: `/api/transfers/${transfer.id}`,
          updatedAt: transfer.updatedAt,
          body: { updatedAt: transfer.updatedAt },
          optimisticSnapshot: {
            kind: "transfer_delete",
            id: transfer.id,
            deletedAt: nowIso,
          },
        },
      );

      if (outcome.mode === "online" && outcome.errorPayload) {
        setErrorMsg(resolveFinanceErrorMessage(t, outcome.errorPayload));
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

          <Button
            variant="secondary"
            onClick={() => setBudgetModalOpen(true)}
            data-testid="finance-manage-budgets-button"
          >
            <Target className="h-4 w-4" aria-hidden="true" />
            <span>{budgetsDict?.manageBudgetsButton ?? "Kelola Anggaran"}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => setRecurringModalOpen(true)}
            data-testid="finance-manage-recurring-button"
          >
            <Repeat className="h-4 w-4" aria-hidden="true" />
            <span>
              {t.finance?.recurring?.manageRecurringButton ?? "Atur Jadwal Rutin"}
            </span>
            {recurringTemplates.length > 0 ? (
              <span
                data-testid="recurring-active-count-badge"
                className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-primary)]/15 px-1.5 text-[10px] font-bold text-[var(--accent-primary)]"
              >
                {recurringTemplates.filter((t) => t.isActive).length}
              </span>
            ) : null}
          </Button>

          <Button
            variant="secondary"
            onClick={() => setExportModalOpen(true)}
            data-testid="finance-export-button"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>{t.finance.exportButton}</span>
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

      {showOverbudgetBanner ? (
        <div
          role="alert"
          aria-live="polite"
          data-testid="overbudget-alert-banner"
          className="flex flex-col gap-3 rounded-2xl border border-[var(--status-expense)]/40 bg-[var(--status-expense)]/10 p-4 text-sm text-[var(--text-primary)] shadow-xs transition-all sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-expense)]"
              aria-hidden="true"
            />
            <div>
              <h4 className="font-bold text-[var(--status-expense)]">
                {budgetsDict?.overbudgetBannerTitle ?? "Peringatan Batas Anggaran Terlampaui"}
              </h4>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {budgetsDict?.overbudgetBannerDesc ?? "Terdapat kategori pengeluaran yang telah melampaui batas anggaran bulan ini."}
              </p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {exceededBudgets.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--status-expense)]/30 bg-[var(--bg-surface)] px-2 py-0.5 font-medium text-[var(--status-expense)]"
                  >
                    <span>{b.categoryName}:</span>
                    <span>
                      +<PrivacyAmount amount={Math.abs(b.remainingAmount)} signMode="plain" />
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBudgetModalOpen(true)}
              className="h-8 text-xs"
            >
              {budgetsDict?.manageBudgetsButton ?? "Kelola Anggaran"}
            </Button>
            <button
              type="button"
              onClick={() => setLastDismissedExceededKey(exceededKey)}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] focus:outline-hidden"
              aria-label={budgetsDict?.dismissBanner ?? "Tutup peringatan"}
              data-testid="dismiss-overbudget-banner"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      <RecurringPendingBanner
        pendingItems={pendingRecurring}
        wallets={summary.wallets}
        onItemsMutated={refreshAllFinanceData}
      />

      <SafeToSpendCard
        safeToSpend={summary.safeToSpend}
        cycle={summary.cycle}
      />

      <CategoryBudgetSection
        summary={budgetsSummary}
        loading={loadingBudgets}
        onManageBudgets={() => setBudgetModalOpen(true)}
        currentPeriod={selectedBudgetPeriod}
        activeCyclePeriod={activeCyclePeriod}
        onSelectPeriod={handleSelectBudgetPeriod}
      />

      {recurringTemplates.length > 0 ? (
        <Card data-testid="recurring-quick-summary-card">
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]">
                <Repeat className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle as="h3" className="text-base">
                  {t.finance?.recurring?.sectionTitle ?? "Jadwal Rutin"}
                </CardTitle>
                <CardDescription>
                  {(
                    t.finance?.recurring?.quickCardActiveCount ??
                    "{count} jadwal rutin aktif"
                  ).replace(
                    "{count}",
                    String(recurringTemplates.filter((t) => t.isActive).length),
                  )}
                  {(() => {
                    const nextActive = recurringTemplates
                      .filter((t) => t.isActive)
                      .sort(
                        (a, b) =>
                          new Date(a.nextRunAt).getTime() -
                          new Date(b.nextRunAt).getTime(),
                      )[0];
                    if (!nextActive) return null;
                    return (
                      <>
                        {" • "}
                        {(
                          t.finance?.recurring?.quickCardNextDue ??
                          "Jatuh tempo terdekat: {date}"
                        ).replace(
                          "{date}",
                          nextActive.nextRunAt.slice(0, 10),
                        )}
                        {" ("}
                        {nextActive.description}
                        {")"}
                      </>
                    );
                  })()}
                </CardDescription>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRecurringModalOpen(true)}
              data-testid="recurring-quick-card-manage-btn"
            >
              <span>
                {t.finance?.recurring?.manageRecurringButton ?? "Atur Jadwal Rutin"}
              </span>
            </Button>
          </CardHeader>
        </Card>
      ) : null}

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

      <ExportDataModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        wallets={activeWallets}
        categories={categories}
        cycle={summary.cycle}
      />

      <BudgetManagerModal
        open={budgetModalOpen}
        onClose={() => setBudgetModalOpen(false)}
        categories={categories}
        budgets={budgetsSummary?.items ?? []}
        currentPeriod={selectedBudgetPeriod}
        onMutated={refreshAllFinanceData}
      />

      <RecurringTemplateModal
        open={recurringModalOpen}
        onClose={() => setRecurringModalOpen(false)}
        templates={recurringTemplates}
        wallets={summary.wallets}
        categories={categories}
        onMutated={refreshAllFinanceData}
      />
    </div>
  );
}
