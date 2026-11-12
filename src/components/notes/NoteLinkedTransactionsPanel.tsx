"use client";

import Link from "next/link";
import {
  Link2,
  Plus,
  Receipt,
  Search,
  Unlink2,
  Wallet,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  FINANCE_UPDATED_EVENT,
  WORKSPACE_UPDATED_EVENT,
  dispatchFinanceUpdated,
  dispatchWorkspaceUpdated,
  fromDateTimeLocalValue,
  readJsonSafe,
  resolveFinanceErrorMessage,
  toDateTimeLocalValue,
  type ApiErrorPayload,
  type WorkspaceUpdatedDetail,
} from "@/components/finance/finance-client-helpers";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { FinanceEntryType } from "@/features/finance/schemas";
import type {
  TransactionDto,
  TransactionListResult,
} from "@/features/finance/transactions-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import type { LinkedTransactionsListResult } from "@/features/notes/linked-transactions-service";
import { cn } from "@/lib/cn";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";
import type { Dictionary } from "@/lib/i18n/types";

export interface NoteLinkedTransactionsPanelProps {
  noteId: string;
  wallets?: WalletWithBalanceDto[];
  categories?: CategoryDto[];
  initialData?: LinkedTransactionsListResult;
  initialNoteId?: string;
}

const EMPTY_DATA: LinkedTransactionsListResult = {
  items: [],
  summary: { totalIncome: 0, totalExpense: 0, net: 0 },
};

function resolveCategoryDisplayName(
  category: CategoryDto,
  t: Dictionary,
): string {
  if (category.systemKey && category.systemKey in t.categories) {
    return t.categories[category.systemKey as keyof Dictionary["categories"]];
  }
  return category.name;
}

function summarizeClientItems(items: TransactionDto[]): {
  totalIncome: number;
  totalExpense: number;
  net: number;
} {
  let incomeBig = 0n;
  let expenseBig = 0n;
  for (const item of items) {
    const amountBig = BigInt(Math.trunc(item.amount));
    if (item.type === "income") {
      incomeBig += amountBig;
    } else {
      expenseBig += amountBig;
    }
  }
  return {
    totalIncome: Number(incomeBig),
    totalExpense: Number(expenseBig),
    net: Number(incomeBig - expenseBig),
  };
}

/**
 * Displays transactions linked directly to a note with live integer totals (`Income`,
 * `Expense`, `Net`), atomic Create & Link modal, Existing Transaction Picker with Load More,
 * and safe Unlink (`note_id = NULL`, `F15`, `AC-8.3`, `SEC-4`).
 */
export function NoteLinkedTransactionsPanel({
  noteId,
  wallets: propWallets,
  categories: propCategories,
  initialData,
  initialNoteId,
}: NoteLinkedTransactionsPanelProps) {
  const { locale, t } = useI18n();
  const hasMatchingInitialData = Boolean(
    initialData && initialNoteId === noteId,
  );

  const [data, setData] = useState<LinkedTransactionsListResult>(() =>
    hasMatchingInitialData && initialData ? initialData : EMPTY_DATA,
  );
  const [loading, setLoading] = useState(!hasMatchingInitialData);
  const [fetchedWallets, setFetchedWallets] = useState<
    WalletWithBalanceDto[] | null
  >(null);
  const [fetchedCategories, setFetchedCategories] = useState<
    CategoryDto[] | null
  >(null);

  const wallets = useMemo(
    () => fetchedWallets ?? propWallets ?? [],
    [fetchedWallets, propWallets],
  );
  const categories = useMemo(
    () => fetchedCategories ?? propCategories ?? [],
    [fetchedCategories, propCategories],
  );

  const [busyUnlinkId, setBusyUnlinkId] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelStatus, setPanelStatus] = useState<string | null>(null);

  // Create & Link modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<FinanceEntryType>("expense");
  const [createWalletId, setCreateWalletId] = useState("");
  const [createCategoryId, setCreateCategoryId] = useState("");
  const [createAmount, setCreateAmount] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createOccurredAt, setCreateOccurredAt] = useState(() =>
    toDateTimeLocalValue(),
  );
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Existing Picker modal state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerItems, setPickerItems] = useState<TransactionDto[]>([]);
  const [pickerNextCursor, setPickerNextCursor] = useState<string | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerLoadingMore, setPickerLoadingMore] = useState(false);
  const [pickerBusyId, setPickerBusyId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerUnlinkedOnly, setPickerUnlinkedOnly] = useState(true);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const loadFinanceContext = useCallback(async () => {
    try {
      const [walletsRes, categoriesRes] = await Promise.all([
        apiFetch("/api/wallets"),
        apiFetch("/api/categories"),
      ]);
      if (walletsRes.ok) {
        const wPayload = await readJsonSafe<{
          ok?: boolean;
          data?: { wallets?: WalletWithBalanceDto[] };
        }>(walletsRes);
        if (wPayload?.ok && wPayload.data?.wallets) {
          setFetchedWallets(wPayload.data.wallets);
        }
      }
      if (categoriesRes.ok) {
        const cPayload = await readJsonSafe<{
          ok?: boolean;
          data?: { categories?: CategoryDto[] };
        }>(categoriesRes);
        if (cPayload?.ok && cPayload.data?.categories) {
          setFetchedCategories(cPayload.data.categories);
        }
      }
    } catch {
      // Retain existing wallets/categories offline
    }
  }, []);

  const loadLinkedTransactions = useCallback(async () => {
    setLoading(true);
    setPanelError(null);
    try {
      const response = await apiFetch(`/api/notes/${noteId}/transactions`);
      const payload = await readJsonSafe<
        ApiErrorPayload & {
          ok?: boolean;
          data?: LinkedTransactionsListResult;
        }
      >(response);

      if (!response.ok || !payload?.ok || !payload.data) {
        setPanelError(resolveFinanceErrorMessage(t, payload));
        return;
      }
      setData(payload.data);
    } catch {
      setPanelError(t.errors.generic);
    } finally {
      setLoading(false);
    }
  }, [noteId, t]);

  useEffect(() => {
    let active = true;
    const shouldFetchLinked = !hasMatchingInitialData;
    const shouldFetchContext = !propWallets || !propCategories;

    if (!shouldFetchLinked && !shouldFetchContext) {
      return () => {
        active = false;
      };
    }

    const runInitialFetch = async () => {
      if (shouldFetchLinked) {
        try {
          const response = await apiFetch(`/api/notes/${noteId}/transactions`);
          const payload = await readJsonSafe<
            ApiErrorPayload & {
              ok?: boolean;
              data?: LinkedTransactionsListResult;
            }
          >(response);

          if (active) {
            if (!response.ok || !payload?.ok || !payload.data) {
              setPanelError(resolveFinanceErrorMessage(t, payload));
            } else {
              setData(payload.data);
              setPanelError(null);
            }
            setLoading(false);
          }
        } catch {
          if (active) {
            setPanelError(t.errors.generic);
            setLoading(false);
          }
        }
      }

      if (shouldFetchContext && active) {
        try {
          const [walletsRes, categoriesRes] = await Promise.all([
            apiFetch("/api/wallets"),
            apiFetch("/api/categories"),
          ]);
          if (active && walletsRes.ok) {
            const wPayload = await readJsonSafe<{
              ok?: boolean;
              data?: { wallets?: WalletWithBalanceDto[] };
            }>(walletsRes);
            if (wPayload?.ok && wPayload.data?.wallets) {
              setFetchedWallets(wPayload.data.wallets);
            }
          }
          if (active && categoriesRes.ok) {
            const cPayload = await readJsonSafe<{
              ok?: boolean;
              data?: { categories?: CategoryDto[] };
            }>(categoriesRes);
            if (cPayload?.ok && cPayload.data?.categories) {
              setFetchedCategories(cPayload.data.categories);
            }
          }
        } catch {
          // Retain cached context when offline
        }
      }
    };

    void runInitialFetch();
    return () => {
      active = false;
    };
  }, [hasMatchingInitialData, noteId, propCategories, propWallets, t]);

  useEffect(() => {
    const onFinanceUpdated = () => {
      void loadFinanceContext();
      void loadLinkedTransactions();
    };
    const onWorkspaceUpdated = (event: Event) => {
      const custom = event as CustomEvent<WorkspaceUpdatedDetail | undefined>;
      if (
        custom.detail?.kind === "transaction" &&
        custom.detail?.source !== "linked-transactions-panel"
      ) {
        void loadFinanceContext();
        void loadLinkedTransactions();
      }
    };

    window.addEventListener(FINANCE_UPDATED_EVENT, onFinanceUpdated);
    window.addEventListener(WORKSPACE_UPDATED_EVENT, onWorkspaceUpdated);
    return () => {
      window.removeEventListener(FINANCE_UPDATED_EVENT, onFinanceUpdated);
      window.removeEventListener(WORKSPACE_UPDATED_EVENT, onWorkspaceUpdated);
    };
  }, [loadFinanceContext, loadLinkedTransactions]);

  const activeWallets = useMemo(
    () => wallets.filter((w) => w.archivedAt === null),
    [wallets],
  );

  const createCategoriesForType = useMemo(
    () => categories.filter((c) => c.type === createType),
    [categories, createType],
  );

  const defaultWalletId = useMemo(
    () =>
      activeWallets.find((w) => w.isDefault)?.id ??
      activeWallets[0]?.id ??
      "",
    [activeWallets],
  );

  const openCreateModal = () => {
    setCreateError(null);
    setCreateType("expense");
    setCreateWalletId(defaultWalletId);
    const expenseCats = categories.filter((c) => c.type === "expense");
    const defaultCat =
      expenseCats.find((c) => c.systemKey === "food_drink") ?? expenseCats[0];
    setCreateCategoryId(defaultCat?.id ?? "");
    setCreateAmount("");
    setCreateDescription("");
    setCreateOccurredAt(toDateTimeLocalValue());
    setCreateOpen(true);
    if (wallets.length === 0 || categories.length === 0) {
      void loadFinanceContext();
    }
  };

  const handleCreateTypeChange = (nextType: FinanceEntryType) => {
    setCreateType(nextType);
    const nextCats = categories.filter((c) => c.type === nextType);
    const fallback =
      nextCats.find((c) =>
        nextType === "income"
          ? c.systemKey === "other_income"
          : c.systemKey === "other_expense",
      ) ?? nextCats[0];
    setCreateCategoryId(fallback?.id ?? "");
  };

  const handleSubmitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createSubmitting) {
      return;
    }

    setCreateError(null);
    const amountNum = Number(createAmount.trim());
    if (!Number.isSafeInteger(amountNum) || amountNum <= 0) {
      setCreateError(t.linkedNotes.invalidAmountError);
      return;
    }

    const walletId = createWalletId || defaultWalletId;
    const categoryId = createCategoryId || createCategoriesForType[0]?.id;
    if (!walletId || !categoryId) {
      setCreateError(t.errors.generic);
      return;
    }

    const occurredIso =
      fromDateTimeLocalValue(createOccurredAt) ?? new Date().toISOString();

    setCreateSubmitting(true);
    try {
      const txId = crypto.randomUUID();
      const response = await apiFetch(`/api/notes/${noteId}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: txId,
          walletId,
          categoryId,
          type: createType,
          amount: amountNum,
          description: createDescription.trim() || null,
          occurredAt: occurredIso,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const payload = await readJsonSafe<
        ApiErrorPayload & {
          ok?: boolean;
          data?: {
            transaction?: TransactionDto;
            summary?: LinkedTransactionsListResult["summary"];
          };
        }
      >(response);

      if (!response.ok || !payload?.ok || !payload.data?.transaction) {
        setCreateError(resolveFinanceErrorMessage(t, payload));
        return;
      }

      const createdTx = payload.data.transaction;
      setData((prev) => {
        const nextItems = [
          createdTx,
          ...prev.items.filter((item) => item.id !== createdTx.id),
        ];
        return {
          items: nextItems,
          summary: payload.data?.summary ?? summarizeClientItems(nextItems),
        };
      });

      setCreateOpen(false);
      setPanelError(null);
      setPanelStatus(t.linkedNotes.createdSuccess);
      dispatchFinanceUpdated("linked-transactions-panel");
      dispatchWorkspaceUpdated({
        kind: "transaction",
        id: createdTx.id,
        source: "linked-transactions-panel",
      });
    } catch {
      setCreateError(t.errors.generic);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const fetchPickerPage = useCallback(
    async (cursor?: string | null, unlinkedOnlyOverride?: boolean) => {
      const isMore = Boolean(cursor);
      const effectiveUnlinkedOnly = unlinkedOnlyOverride ?? pickerUnlinkedOnly;
      if (isMore) {
        setPickerLoadingMore(true);
      } else {
        setPickerLoading(true);
        setPickerError(null);
      }

      try {
        const params = new URLSearchParams({ limit: "25" });
        if (effectiveUnlinkedOnly) {
          params.set("unlinked", "true");
        }
        if (cursor) {
          params.set("cursor", cursor);
        }
        const response = await apiFetch(`/api/transactions?${params.toString()}`);
        const payload = await readJsonSafe<
          ApiErrorPayload & {
            ok?: boolean;
            data?: TransactionListResult;
          }
        >(response);

        if (!response.ok || !payload?.ok || !payload.data) {
          setPickerError(resolveFinanceErrorMessage(t, payload));
          return;
        }

        if (isMore) {
          setPickerItems((prev) => {
            const seen = new Set(prev.map((item) => item.id));
            const appended = payload.data!.items.filter(
              (item) => !seen.has(item.id),
            );
            return [...prev, ...appended];
          });
        } else {
          setPickerItems(payload.data.items);
        }
        setPickerNextCursor(payload.data.nextCursor);
      } catch {
        setPickerError(t.errors.generic);
      } finally {
        setPickerLoading(false);
        setPickerLoadingMore(false);
      }
    },
    [pickerUnlinkedOnly, t],
  );

  const openPickerModal = () => {
    setPickerSearch("");
    setPickerUnlinkedOnly(true);
    setPickerError(null);
    setPickerOpen(true);
    void fetchPickerPage(null, true);
  };

  const handleLinkExisting = async (tx: TransactionDto) => {
    if (pickerBusyId) {
      return;
    }

    setPickerBusyId(tx.id);
    setPickerError(null);
    try {
      const response = await apiFetch(`/api/notes/${noteId}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existingTransactionId: tx.id,
          updatedAt: tx.updatedAt,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const payload = await readJsonSafe<
        ApiErrorPayload & {
          ok?: boolean;
          data?: {
            transaction?: TransactionDto;
            summary?: LinkedTransactionsListResult["summary"];
          };
        }
      >(response);

      if (!response.ok || !payload?.ok || !payload.data?.transaction) {
        setPickerError(resolveFinanceErrorMessage(t, payload));
        return;
      }

      const linkedTx = payload.data.transaction;
      setData((prev) => {
        const nextItems = [
          linkedTx,
          ...prev.items.filter((item) => item.id !== linkedTx.id),
        ];
        return {
          items: nextItems,
          summary: payload.data?.summary ?? summarizeClientItems(nextItems),
        };
      });
      setPickerItems((prev) =>
        prev.map((item) => (item.id === linkedTx.id ? linkedTx : item)),
      );
      setPickerOpen(false);
      setPanelError(null);
      setPanelStatus(t.linkedNotes.linkedSuccess);
      dispatchFinanceUpdated("linked-transactions-panel");
      dispatchWorkspaceUpdated({
        kind: "transaction",
        id: linkedTx.id,
        source: "linked-transactions-panel",
      });
    } catch {
      setPickerError(t.errors.generic);
    } finally {
      setPickerBusyId(null);
    }
  };

  const handleUnlink = async (tx: TransactionDto) => {
    if (busyUnlinkId) {
      return;
    }

    setBusyUnlinkId(tx.id);
    setPanelError(null);
    setPanelStatus(null);
    try {
      const response = await apiFetch(
        `/api/notes/${noteId}/transactions/${tx.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            updatedAt: tx.updatedAt,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );

      const payload = await readJsonSafe<
        ApiErrorPayload & {
          ok?: boolean;
          data?: {
            unlinked?: boolean;
            summary?: LinkedTransactionsListResult["summary"];
          };
        }
      >(response);

      if (!response.ok || !payload?.ok) {
        setPanelError(resolveFinanceErrorMessage(t, payload));
        return;
      }

      setData((prev) => {
        const nextItems = prev.items.filter((item) => item.id !== tx.id);
        return {
          items: nextItems,
          summary: payload.data?.summary ?? summarizeClientItems(nextItems),
        };
      });
      setPanelStatus(t.linkedNotes.unlinkSuccess);
      dispatchFinanceUpdated("linked-transactions-panel");
      dispatchWorkspaceUpdated({
        kind: "transaction",
        id: tx.id,
        source: "linked-transactions-panel",
      });
    } catch {
      setPanelError(t.errors.generic);
    } finally {
      setBusyUnlinkId(null);
    }
  };

  const filteredPickerItems = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return pickerItems.filter((item) => {
      if (pickerUnlinkedOnly && item.noteId !== null) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        (item.description ?? "").toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q) ||
        item.walletName.toLowerCase().includes(q) ||
        String(item.amount).includes(q)
      );
    });
  }, [pickerItems, pickerSearch, pickerUnlinkedOnly]);

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
    <section
      aria-label={t.linkedNotes.sectionTitle}
      data-testid="note-linked-transactions-panel"
      className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/35 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            <Receipt
              className="h-4 w-4 shrink-0 text-[var(--accent-text)]"
              aria-hidden="true"
            />
            <span>{t.linkedNotes.sectionTitle}</span>
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {t.linkedNotes.sectionSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="linked-tx-open-picker"
            onClick={openPickerModal}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.linkedNotes.linkExistingButton}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="linked-tx-open-create"
            onClick={openCreateModal}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.linkedNotes.createNewButton}</span>
          </Button>
        </div>
      </div>

      <div
        data-testid="linked-tx-summary"
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
          <p className="text-[11px] font-medium text-[var(--text-secondary)]">
            {t.linkedNotes.totalIncome}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--status-income)]">
            <PrivacyAmount
              amount={data.summary.totalIncome}
              type="income"
              signMode={data.summary.totalIncome > 0 ? "signed" : "plain"}
            />
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
          <p className="text-[11px] font-medium text-[var(--text-secondary)]">
            {t.linkedNotes.totalExpense}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--status-expense)]">
            <PrivacyAmount
              amount={data.summary.totalExpense}
              type="expense"
              signMode={data.summary.totalExpense > 0 ? "signed" : "plain"}
            />
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
          <p className="text-[11px] font-medium text-[var(--text-secondary)]">
            {t.linkedNotes.netAmount}
          </p>
          <p
            className={cn(
              "mt-0.5 text-sm font-semibold",
              data.summary.net > 0
                ? "text-[var(--status-income)]"
                : data.summary.net < 0
                  ? "text-[var(--status-expense)]"
                  : "text-[var(--text-primary)]",
            )}
          >
            <PrivacyAmount amount={data.summary.net} signMode="signed" />
          </p>
        </div>
      </div>

      {panelError ? (
        <p role="alert" className="text-xs font-medium text-[var(--status-danger)]">
          {panelError}
        </p>
      ) : null}
      {panelStatus ? (
        <p role="status" className="text-xs font-medium text-[var(--status-success)]">
          {panelStatus}
        </p>
      ) : null}

      {loading ? (
        <p className="text-xs text-[var(--text-muted)]">
          {t.linkedNotes.pickerLoading}
        </p>
      ) : data.items.length === 0 ? (
        <div
          data-testid="linked-tx-empty"
          className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 px-3.5 py-4 text-center"
        >
          <p className="text-xs font-medium text-[var(--text-primary)]">
            {t.linkedNotes.emptyTitle}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {t.linkedNotes.emptySubtitle}
          </p>
        </div>
      ) : (
        <ul data-testid="linked-tx-list" className="flex flex-col gap-2">
          {data.items.map((tx) => (
            <li
              key={tx.id}
              data-testid={`linked-tx-row-${tx.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {tx.description || tx.categoryName}
                </p>
                <p className="truncate text-xs text-[var(--text-secondary)]">
                  {tx.categoryName} · {tx.walletName} ·{" "}
                  {formatOccurredDisplay(tx.occurredAt)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-sm font-semibold whitespace-nowrap",
                    tx.type === "income"
                      ? "text-[var(--status-income)]"
                      : "text-[var(--status-expense)]",
                  )}
                >
                  <PrivacyAmount amount={tx.amount} type={tx.type} />
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid={`linked-tx-unlink-${tx.id}`}
                  disabled={busyUnlinkId === tx.id}
                  onClick={() => void handleUnlink(tx)}
                >
                  <Unlink2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {busyUnlinkId === tx.id
                      ? t.linkedNotes.unlinkingButton
                      : t.linkedNotes.unlinkButton}
                  </span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t.linkedNotes.createTitle}
        closeLabel={t.linkedNotes.closeModalButton}
      >
        {activeWallets.length === 0 ? (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-[var(--text-secondary)]">
              {t.linkedNotes.noWalletsNotice}
            </p>
            <Link
              href="/app/finance"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]"
            >
              <Wallet className="h-4 w-4" aria-hidden="true" />
              <span>{t.quickCapture.noWalletsAction}</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmitCreate} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]">
              <span>{t.linkedNotes.typeLabel}</span>
              <select
                value={createType}
                onChange={(e) =>
                  handleCreateTypeChange(e.target.value as FinanceEntryType)
                }
                className="min-h-10 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)]"
              >
                <option value="expense">{t.linkedNotes.expenseOption}</option>
                <option value="income">{t.linkedNotes.incomeOption}</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]">
              <span>{t.linkedNotes.walletLabel}</span>
              <select
                value={createWalletId || defaultWalletId}
                onChange={(e) => setCreateWalletId(e.target.value)}
                className="min-h-10 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)]"
              >
                {activeWallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]">
              <span>{t.linkedNotes.categoryLabel}</span>
              <select
                value={
                  createCategoryId || createCategoriesForType[0]?.id || ""
                }
                onChange={(e) => setCreateCategoryId(e.target.value)}
                className="min-h-10 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)]"
              >
                {createCategoriesForType.map((c) => (
                  <option key={c.id} value={c.id}>
                    {resolveCategoryDisplayName(c, t)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]">
              <span>{t.linkedNotes.amountLabel}</span>
              <input
                type="number"
                min={1}
                step={1}
                required
                data-testid="linked-tx-create-amount"
                value={createAmount}
                onChange={(e) => setCreateAmount(e.target.value)}
                placeholder={t.linkedNotes.amountPlaceholder}
                className="min-h-10 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]">
              <span>{t.linkedNotes.descriptionLabel}</span>
              <input
                type="text"
                maxLength={300}
                data-testid="linked-tx-create-description"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder={t.linkedNotes.descriptionPlaceholder}
                className="min-h-10 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)]"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]">
              <span>{t.linkedNotes.occurredAtLabel}</span>
              <input
                type="datetime-local"
                value={createOccurredAt}
                onChange={(e) => setCreateOccurredAt(e.target.value)}
                className="min-h-10 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)]"
              />
            </label>

            {createError ? (
              <p role="alert" className="text-xs font-medium text-[var(--status-danger)]">
                {createError}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreateOpen(false)}
              >
                {t.linkedNotes.closeModalButton}
              </Button>
              <Button
                type="submit"
                data-testid="linked-tx-create-submit"
                disabled={createSubmitting}
              >
                {createSubmitting
                  ? t.linkedNotes.submittingCreateButton
                  : t.linkedNotes.submitCreateButton}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t.linkedNotes.pickerTitle}
        closeLabel={t.linkedNotes.closeModalButton}
      >
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              data-testid="linked-tx-picker-search"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder={t.linkedNotes.pickerSearchPlaceholder}
              className="min-h-10 w-full rounded-full border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 py-2 pr-3 pl-9 text-sm text-[var(--text-primary)]"
            />
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={pickerUnlinkedOnly}
              onChange={(e) => {
                const nextChecked = e.target.checked;
                setPickerUnlinkedOnly(nextChecked);
                void fetchPickerPage(null, nextChecked);
              }}
              className="h-4 w-4 rounded border-[var(--border-default)]"
            />
            <span>{t.linkedNotes.pickerFilterUnlinkedOnly}</span>
          </label>

          {pickerError ? (
            <p role="alert" className="text-xs font-medium text-[var(--status-danger)]">
              {pickerError}
            </p>
          ) : null}

          {pickerLoading ? (
            <p className="py-4 text-center text-xs text-[var(--text-muted)]">
              {t.linkedNotes.pickerLoading}
            </p>
          ) : filteredPickerItems.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--text-muted)]">
              {t.linkedNotes.pickerEmpty}
            </p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
              {filteredPickerItems.map((tx) => {
                const isLinkedHere = tx.noteId === noteId;
                const isLinkedElsewhere =
                  tx.noteId !== null && tx.noteId !== noteId;
                const disabled =
                  isLinkedHere ||
                  isLinkedElsewhere ||
                  pickerBusyId === tx.id;

                return (
                  <li
                    key={tx.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {tx.description || tx.categoryName}
                      </p>
                      <p className="truncate text-xs text-[var(--text-secondary)]">
                        {tx.categoryName} · {tx.walletName} ·{" "}
                        <PrivacyAmount amount={tx.amount} type={tx.type} />
                      </p>
                      {isLinkedHere ? (
                        <p className="text-[11px] font-medium text-[var(--accent-text)]">
                          {t.linkedNotes.pickerAlreadyLinkedCurrent}
                        </p>
                      ) : isLinkedElsewhere ? (
                        <p className="text-[11px] font-medium text-[var(--status-warning)]">
                          {t.linkedNotes.pickerAlreadyLinkedOther}
                        </p>
                      ) : null}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant={disabled ? "secondary" : "primary"}
                      data-testid={`linked-tx-pick-${tx.id}`}
                      disabled={disabled}
                      onClick={() => void handleLinkExisting(tx)}
                    >
                      {pickerBusyId === tx.id
                        ? t.linkedNotes.pickerLinkingAction
                        : t.linkedNotes.pickerLinkAction}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {pickerNextCursor ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pickerLoadingMore}
              onClick={() => void fetchPickerPage(pickerNextCursor)}
            >
              {pickerLoadingMore
                ? t.linkedNotes.pickerLoadingMore
                : t.linkedNotes.pickerLoadMore}
            </Button>
          ) : null}
        </div>
      </Modal>
    </section>
  );
}
