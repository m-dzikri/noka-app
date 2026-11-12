"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  FolderKanban,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Wallet,
} from "lucide-react";
import { CategoryManagerModal } from "@/components/finance/CategoryManagerModal";
import {
  dispatchFinanceUpdated,
  FINANCE_UPDATED_EVENT,
  readJsonSafe,
  resolveFinanceErrorMessage,
  type ApiErrorPayload,
} from "@/components/finance/finance-client-helpers";
import { TransactionFormModal } from "@/components/finance/TransactionFormModal";
import { TransferFormModal } from "@/components/finance/TransferFormModal";
import { WalletManagerModal } from "@/components/finance/WalletManagerModal";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { CategoryDto } from "@/features/finance/categories-service";
import { formatIdr } from "@/features/finance/format";
import type { FinanceEntryType } from "@/features/finance/schemas";
import type { TransactionDto } from "@/features/finance/transactions-service";
import type { TransferDto } from "@/features/finance/transfers-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

export interface FinanceWorkspaceProps {
  initialWallets: WalletWithBalanceDto[];
  initialCategories: CategoryDto[];
  initialTransactions: TransactionDto[];
  initialTransactionsNextCursor: string | null;
  initialTransfers: TransferDto[];
  initialTransfersNextCursor: string | null;
}

type LedgerTab = "transactions" | "transfers";

/**
 * Interactive bilingual Finance workspace rendering multi-wallet balances, category-filtered ledger transactions, and atomic transfers (F10–F12).
 */
export function FinanceWorkspace({
  initialWallets,
  initialCategories,
  initialTransactions,
  initialTransactionsNextCursor,
  initialTransfers,
  initialTransfersNextCursor,
}: FinanceWorkspaceProps) {
  const { locale, t } = useI18n();

  const [wallets, setWallets] = useState<WalletWithBalanceDto[]>(initialWallets);
  const [categories, setCategories] = useState<CategoryDto[]>(initialCategories);
  const [transactions, setTransactions] =
    useState<TransactionDto[]>(initialTransactions);
  const [transactionsNextCursor, setTransactionsNextCursor] = useState<
    string | null
  >(initialTransactionsNextCursor);
  const [transfers, setTransfers] = useState<TransferDto[]>(initialTransfers);
  const [transfersNextCursor, setTransfersNextCursor] = useState<string | null>(
    initialTransfersNextCursor,
  );

  const [showArchivedWallets, setShowArchivedWallets] = useState(false);
  const [activeTab, setActiveTab] = useState<LedgerTab>("transactions");

  const [filterWalletId, setFilterWalletId] = useState("");
  const [filterType, setFilterType] = useState<"" | FinanceEntryType>("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [loadingMore, setLoadingMore] = useState(false);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionDto | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<TransferDto | null>(
    null,
  );

  const visibleWallets = useMemo(
    () =>
      showArchivedWallets
        ? wallets
        : wallets.filter((w) => w.archivedAt === null),
    [showArchivedWallets, wallets],
  );

  const activeWallets = useMemo(
    () => wallets.filter((w) => w.archivedAt === null),
    [wallets],
  );

  const totalActiveBalance = useMemo(
    () => activeWallets.reduce((sum, w) => sum + BigInt(w.currentBalance), 0n),
    [activeWallets],
  );

  const buildFilterQuery = useCallback(
    (
      filters: {
        walletId: string;
        from: string;
        to: string;
      },
      cursor?: string | null,
    ) => {
      const sp = new URLSearchParams();
      if (filters.walletId) sp.set("walletId", filters.walletId);
      if (filters.from) sp.set("from", filters.from);
      if (filters.to) sp.set("to", filters.to);
      if (filters.from || filters.to) {
        const tzOffset = -new Date().getTimezoneOffset();
        sp.set("tzOffset", String(tzOffset));
      }
      if (cursor) sp.set("cursor", cursor);
      return sp;
    },
    [],
  );

  const fetchFinanceWithFilters = useCallback(
    async (nextFilters: {
      walletId: string;
      type: "" | FinanceEntryType;
      categoryId: string;
      from: string;
      to: string;
    }) => {
      setErrorMsg(null);
      const txParams = buildFilterQuery(nextFilters, null);
      if (nextFilters.type) txParams.set("type", nextFilters.type);
      if (nextFilters.categoryId) {
        txParams.set("categoryId", nextFilters.categoryId);
      }

      const trParams = buildFilterQuery(nextFilters, null);

      const [walletsRes, catsRes, txsRes, transfersRes] = await Promise.all([
        apiFetch("/api/wallets?includeArchived=true"),
        apiFetch("/api/categories"),
        apiFetch(`/api/transactions?${txParams.toString()}`),
        apiFetch(`/api/transfers?${trParams.toString()}`),
      ]);

      if (walletsRes.ok) {
        const payload = await readJsonSafe<{
          data: { wallets: WalletWithBalanceDto[] };
        }>(walletsRes);
        if (payload?.data?.wallets) {
          setWallets(payload.data.wallets);
        }
      }

      if (catsRes.ok) {
        const payload = await readJsonSafe<{ data: { categories: CategoryDto[] } }>(
          catsRes,
        );
        if (payload?.data?.categories) {
          setCategories(payload.data.categories);
        }
      }

      if (txsRes.ok) {
        const payload = await readJsonSafe<{
          data: { items: TransactionDto[]; nextCursor: string | null };
        }>(txsRes);
        if (payload?.data) {
          setTransactions(payload.data.items);
          setTransactionsNextCursor(payload.data.nextCursor);
        }
      } else {
        const errPayload = await readJsonSafe<ApiErrorPayload>(txsRes);
        setErrorMsg(resolveFinanceErrorMessage(t, errPayload));
      }

      if (transfersRes.ok) {
        const payload = await readJsonSafe<{
          data: { items: TransferDto[]; nextCursor: string | null };
        }>(transfersRes);
        if (payload?.data) {
          setTransfers(payload.data.items);
          setTransfersNextCursor(payload.data.nextCursor);
        }
      }
    },
    [buildFilterQuery, t],
  );

  const refreshAllFinanceData = useCallback(async () => {
    await fetchFinanceWithFilters({
      walletId: filterWalletId,
      type: filterType,
      categoryId: filterCategoryId,
      from: filterFrom,
      to: filterTo,
    });
  }, [
    fetchFinanceWithFilters,
    filterCategoryId,
    filterFrom,
    filterTo,
    filterType,
    filterWalletId,
  ]);

  function handleFilterChange(
    patch: Partial<{
      walletId: string;
      type: "" | FinanceEntryType;
      categoryId: string;
      from: string;
      to: string;
    }>,
  ): void {
    const nextFilters = {
      walletId: patch.walletId ?? filterWalletId,
      type: patch.type ?? filterType,
      categoryId: patch.categoryId ?? filterCategoryId,
      from: patch.from ?? filterFrom,
      to: patch.to ?? filterTo,
    };

    if (patch.walletId !== undefined) setFilterWalletId(patch.walletId);
    if (patch.type !== undefined) setFilterType(patch.type);
    if (patch.categoryId !== undefined) setFilterCategoryId(patch.categoryId);
    if (patch.from !== undefined) setFilterFrom(patch.from);
    if (patch.to !== undefined) setFilterTo(patch.to);

    void fetchFinanceWithFilters(nextFilters);
  }

  useEffect(() => {
    function handleExternalFinanceUpdate(event: Event): void {
      const custom = event as CustomEvent<{ source?: string } | undefined>;
      if (custom.detail?.source === "finance-workspace") {
        return;
      }
      void refreshAllFinanceData();
    }

    window.addEventListener(FINANCE_UPDATED_EVENT, handleExternalFinanceUpdate);
    return () => {
      window.removeEventListener(
        FINANCE_UPDATED_EVENT,
        handleExternalFinanceUpdate,
      );
    };
  }, [refreshAllFinanceData]);

  async function handleResetFilters(): Promise<void> {
    handleFilterChange({
      walletId: "",
      type: "",
      categoryId: "",
      from: "",
      to: "",
    });
  }

  async function handleLoadMore(): Promise<void> {
    if (loadingMore) return;
    setLoadingMore(true);

    try {
      if (activeTab === "transactions" && transactionsNextCursor) {
        const params = buildFilterQuery(
          { walletId: filterWalletId, from: filterFrom, to: filterTo },
          transactionsNextCursor,
        );
        if (filterType) params.set("type", filterType);
        if (filterCategoryId) params.set("categoryId", filterCategoryId);
        const res = await apiFetch(`/api/transactions?${params.toString()}`);
        if (res.ok) {
          const payload = await readJsonSafe<{
            data: { items: TransactionDto[]; nextCursor: string | null };
          }>(res);
          if (payload?.data) {
            setTransactions((prev) => [...prev, ...payload.data.items]);
            setTransactionsNextCursor(payload.data.nextCursor);
          }
        }
      } else if (activeTab === "transfers" && transfersNextCursor) {
        const params = buildFilterQuery(
          { walletId: filterWalletId, from: filterFrom, to: filterTo },
          transfersNextCursor,
        );
        const res = await apiFetch(`/api/transfers?${params.toString()}`);
        if (res.ok) {
          const payload = await readJsonSafe<{
            data: { items: TransferDto[]; nextCursor: string | null };
          }>(res);
          if (payload?.data) {
            setTransfers((prev) => [...prev, ...payload.data.items]);
            setTransfersNextCursor(payload.data.nextCursor);
          }
        }
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
        const errPayload = await readJsonSafe<ApiErrorPayload>(res);
        setErrorMsg(resolveFinanceErrorMessage(t, errPayload));
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
        const errPayload = await readJsonSafe<ApiErrorPayload>(res);
        setErrorMsg(resolveFinanceErrorMessage(t, errPayload));
        return;
      }

      await refreshAllFinanceData();
      dispatchFinanceUpdated();
    } finally {
      setBusyDeleteId(null);
    }
  }

  function formatOccurredDisplay(iso: string): string {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
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
              {formatIdr(totalActiveBalance)}
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

      <section aria-labelledby="wallets-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="wallets-heading"
            className="text-base font-semibold text-[var(--text-primary)]"
          >
            {t.finance.walletsSectionTitle}
          </h2>
          {wallets.some((w) => w.archivedAt !== null) ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={showArchivedWallets}
                onChange={(e) => setShowArchivedWallets(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent-primary)]"
              />
              <span>{t.finance.showArchivedLabel}</span>
            </label>
          ) : null}
        </div>

        {visibleWallets.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle as="h3" className="text-base">
                {t.finance.noWalletsTitle}
              </CardTitle>
              <CardDescription>{t.finance.noWalletsDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setWalletModalOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>{t.finance.createFirstWalletCta}</span>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleWallets.map((wallet) => (
              <Card
                key={wallet.id}
                data-testid={`wallet-card-${wallet.name}`}
                className={cn(
                  "flex flex-col justify-between gap-2 p-4",
                  wallet.archivedAt !== null && "opacity-75",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate font-semibold text-[var(--text-primary)]">
                    {wallet.name}
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {wallet.isDefault ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-primary)]/15 px-2 py-0.5 text-xs font-medium text-[var(--accent-text)]">
                        <Star className="h-3 w-3" aria-hidden="true" />
                        {t.finance.defaultBadge}
                      </span>
                    ) : null}
                    {wallet.archivedAt !== null ? (
                      <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                        {t.finance.archivedBadge}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-2 pt-1">
                  <span className="text-lg font-bold text-[var(--text-primary)]">
                    {formatIdr(wallet.currentBalance)}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {t.finance.walletTypes[wallet.type]}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle as="h2" className="text-lg">
              {t.finance.ledger.sectionTitle}
            </CardTitle>

            <div className="flex gap-2" role="tablist" aria-label={t.finance.ledger.sectionTitle}>
              <Button
                size="sm"
                variant={activeTab === "transactions" ? "primary" : "secondary"}
                role="tab"
                aria-selected={activeTab === "transactions"}
                onClick={() => setActiveTab("transactions")}
              >
                {t.finance.ledger.transactionsTab}
              </Button>
              <Button
                size="sm"
                variant={activeTab === "transfers" ? "primary" : "secondary"}
                role="tab"
                aria-selected={activeTab === "transfers"}
                onClick={() => setActiveTab("transfers")}
              >
                {t.finance.ledger.transfersTab}
              </Button>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="filter-wallet"
                className="text-xs font-medium text-[var(--text-secondary)]"
              >
                {t.finance.transactionModal.walletLabel}
              </label>
              <select
                id="filter-wallet"
                value={filterWalletId}
                onChange={(e) =>
                  handleFilterChange({ walletId: e.target.value })
                }
                className="min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
              >
                <option value="">{t.finance.filters.allWallets}</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            {activeTab === "transactions" ? (
              <>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="filter-type"
                    className="text-xs font-medium text-[var(--text-secondary)]"
                  >
                    {t.finance.transactionModal.typeLabel}
                  </label>
                  <select
                    id="filter-type"
                    value={filterType}
                    onChange={(e) =>
                      handleFilterChange({
                        type: e.target.value as "" | FinanceEntryType,
                      })
                    }
                    className="min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                  >
                    <option value="">{t.finance.filters.allTypes}</option>
                    <option value="expense">{t.finance.filters.expense}</option>
                    <option value="income">{t.finance.filters.income}</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="filter-category"
                    className="text-xs font-medium text-[var(--text-secondary)]"
                  >
                    {t.finance.transactionModal.categoryLabel}
                  </label>
                  <select
                    id="filter-category"
                    value={filterCategoryId}
                    onChange={(e) =>
                      handleFilterChange({ categoryId: e.target.value })
                    }
                    className="min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                  >
                    <option value="">{t.finance.filters.allCategories}</option>
                    {categories
                      .filter((c) => !filterType || c.type === filterType)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </>
            ) : null}

            <Input
              label={t.finance.filters.fromDate}
              type="date"
              value={filterFrom}
              onChange={(e) => handleFilterChange({ from: e.target.value })}
            />

            <Input
              label={t.finance.filters.toDate}
              type="date"
              value={filterTo}
              onChange={(e) => handleFilterChange({ to: e.target.value })}
            />

            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => void handleResetFilters()}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.finance.filters.reset}</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {activeTab === "transactions" ? (
            transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--text-secondary)]">
                {t.finance.ledger.emptyTransactions}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
                {transactions.map((tx) => {
                  const signedAmount =
                    tx.type === "income" ? tx.amount : -tx.amount;
                  return (
                    <li
                      key={tx.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[var(--text-primary)]">
                            {tx.categoryName}
                          </span>
                          <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                            {tx.walletName}
                          </span>
                          {tx.noteId ? (
                            <span className="rounded-full bg-[var(--accent-primary)]/15 px-2 py-0.5 text-xs text-[var(--accent-text)]">
                              {t.finance.ledger.linkedBadge}
                            </span>
                          ) : null}
                        </div>
                        {tx.description ? (
                          <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                            {tx.description}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {formatOccurredDisplay(tx.occurredAt)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            tx.type === "income"
                              ? "text-[var(--status-income)]"
                              : "text-[var(--status-expense)]",
                          )}
                        >
                          {formatIdr(signedAmount, "signed")}
                        </span>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingTx(tx);
                            setTxModalOpen(true);
                          }}
                          aria-label={`${t.finance.ledger.editButton} ${tx.categoryName}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          loading={busyDeleteId === tx.id}
                          onClick={() => void handleDeleteTransaction(tx)}
                          aria-label={`${t.finance.ledger.deleteButton} ${tx.categoryName}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : transfers.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-secondary)]">
              {t.finance.ledger.emptyTransfers}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
              {transfers.map((tr) => (
                <li
                  key={tr.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 font-medium text-[var(--text-primary)]">
                      <span>{tr.fromWalletName}</span>
                      <span aria-label={t.finance.ledger.transferArrowAria}>
                        →
                      </span>
                      <span>{tr.toWalletName}</span>
                    </div>
                    {tr.note ? (
                      <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                        {tr.note}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {formatOccurredDisplay(tr.occurredAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">
                      {formatIdr(tr.amount)}
                    </span>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingTransfer(tr);
                        setTransferModalOpen(true);
                      }}
                      aria-label={`${t.finance.ledger.editButton} ${tr.fromWalletName}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busyDeleteId === tr.id}
                      onClick={() => void handleDeleteTransfer(tr)}
                      aria-label={`${t.finance.ledger.deleteButton} ${tr.fromWalletName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {(activeTab === "transactions" && transactionsNextCursor) ||
          (activeTab === "transfers" && transfersNextCursor) ? (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                loading={loadingMore}
                onClick={() => void handleLoadMore()}
              >
                {loadingMore
                  ? t.finance.ledger.loadingMore
                  : t.finance.ledger.loadMore}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <WalletManagerModal
        open={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        wallets={wallets}
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
        wallets={wallets}
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
        wallets={wallets}
        editingTransfer={editingTransfer}
        onMutated={refreshAllFinanceData}
      />
    </div>
  );
}
