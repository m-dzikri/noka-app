"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import {
  dispatchFinanceUpdated,
  readJsonSafe,
  resolveFinanceErrorMessage,
  type ApiErrorPayload,
} from "@/components/finance/finance-client-helpers";
import { useOptionalSync } from "@/components/providers/SyncProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import {
  shiftPeriodMonth,
  type CategoryBudgetDto,
  type CategoryBudgetSummaryDto,
} from "@/features/finance/budgets-schemas";
import type { CategoryDto } from "@/features/finance/categories-service";
import {
  executeOfflineCapableMutation,
  isLikelyNetworkError,
} from "@/features/sync/client-api";
import { apiFetch } from "@/lib/http-client";
import { formatIdr, formatThousands } from "@/features/finance/format";
import { useI18n } from "@/lib/i18n/context";

export interface BudgetManagerModalProps {
  open: boolean;
  onClose: () => void;
  categories: CategoryDto[];
  budgets: CategoryBudgetDto[];
  currentPeriod: string;
  onMutated: () => Promise<void> | void;
}

function BudgetManagerBody({
  categories,
  budgets,
  currentPeriod,
  onClose,
  onMutated,
}: Omit<BudgetManagerModalProps, "open">) {
  const { t } = useI18n();
  const sync = useOptionalSync();

  const expenseCategories = categories.filter((c) => c.type === "expense");

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    expenseCategories[0]?.id ?? "",
  );
  const [amountStr, setAmountStr] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copySuccessMsg, setCopySuccessMsg] = useState<string | null>(null);

  // If user chooses an existing category that already has a budget, show existing amount
  function handleSelectCategory(catId: string) {
    setSelectedCategoryId(catId);
    setCopySuccessMsg(null);
    const existing = budgets.find((b) => b.categoryId === catId);
    if (existing) {
      setAmountStr(formatThousands(existing.amount));
    } else {
      setAmountStr("");
    }
    setErrorMsg(null);
  }

  function handleStartEdit(budget: CategoryBudgetDto) {
    setSelectedCategoryId(budget.categoryId);
    setAmountStr(formatThousands(budget.amount));
    setCopySuccessMsg(null);
    setErrorMsg(null);
  }

  async function handleSaveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCategoryId) {
      setErrorMsg(t.finance.budgets.selectCategoryPlaceholder);
      return;
    }

    const cleanNum = Number(amountStr.replace(/\D/g, ""));
    if (!Number.isSafeInteger(cleanNum) || cleanNum <= 0) {
      setErrorMsg(t.finance.budgets.invalidAmountError);
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const targetCategory = expenseCategories.find(
      (c) => c.id === selectedCategoryId,
    );
    const categoryName = targetCategory?.name ?? "Kategori";

    const optimisticId = crypto.randomUUID();
    const existing = budgets.find((b) => b.categoryId === selectedCategoryId);
    const budgetId = existing?.id ?? optimisticId;

    const optimisticBudget: CategoryBudgetDto = {
      id: budgetId,
      categoryId: selectedCategoryId,
      categoryName,
      amount: cleanNum,
      periodMonth: currentPeriod,
      spentAmount: existing?.spentAmount ?? 0,
      remainingAmount: cleanNum - (existing?.spentAmount ?? 0),
      percentage:
        cleanNum > 0
          ? Math.floor(((existing?.spentAmount ?? 0) * 100) / cleanNum)
          : 0,
      status:
        (existing?.spentAmount ?? 0) >= cleanNum
          ? "exceeded"
          : (existing?.spentAmount ?? 0) * 100 >= cleanNum * 80
            ? "warning"
            : "normal",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const syncMutationContext = sync
      ? {
          userId: sync.userId,
          isOnline: sync.isOnline,
          storageAvailable: sync.storageAvailable,
          onMirrorChanged: () => void sync.reloadMirror(),
        }
      : null;

    try {
      const outcome = await executeOfflineCapableMutation<{ budget: CategoryBudgetDto }>(
        syncMutationContext,
        {
          entity: "budget",
          entityId: budgetId,
          op: "upsert",
          method: "POST",
          path: "/api/finance/budgets",
          body: {
            categoryId: selectedCategoryId,
            amount: cleanNum,
            period: currentPeriod,
          },
          optimisticSnapshot: {
            kind: "budget_upsert",
            budget: optimisticBudget,
          },
        },
      );

      if (outcome.mode === "online" && outcome.response && !outcome.response.ok) {
        const errorJson = (await readJsonSafe(outcome.response)) as ApiErrorPayload | null;
        setErrorMsg(resolveFinanceErrorMessage(t, errorJson));
        return;
      }

      setAmountStr("");
      dispatchFinanceUpdated();
      await onMutated();
    } catch (error) {
      if (!isLikelyNetworkError(error)) {
        setErrorMsg(
          error instanceof Error ? error.message : "Terjadi kesalahan saat menyimpan anggaran",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBudget(budgetId: string) {
    setBusyDeleteId(budgetId);
    setErrorMsg(null);

    const syncMutationContext = sync
      ? {
          userId: sync.userId,
          isOnline: sync.isOnline,
          storageAvailable: sync.storageAvailable,
          onMirrorChanged: () => void sync.reloadMirror(),
        }
      : null;

    try {
      const outcome = await executeOfflineCapableMutation<{ deleted: true; id: string }>(
        syncMutationContext,
        {
          entity: "budget",
          entityId: budgetId,
          op: "delete",
          method: "DELETE",
          path: `/api/finance/budgets/${budgetId}`,
          body: null,
          optimisticSnapshot: {
            kind: "budget_delete",
            id: budgetId,
          },
        },
      );

      if (outcome.mode === "online" && outcome.response && !outcome.response.ok) {
        const errorJson = (await readJsonSafe(outcome.response)) as ApiErrorPayload | null;
        setErrorMsg(resolveFinanceErrorMessage(t, errorJson));
        return;
      }

      setConfirmDeleteId(null);
      if (existingSelectedBudget?.id === budgetId) {
        setAmountStr("");
      }
      dispatchFinanceUpdated();
      await onMutated();
    } catch (error) {
      if (!isLikelyNetworkError(error)) {
        setErrorMsg(
          error instanceof Error ? error.message : "Terjadi kesalahan saat menghapus anggaran",
        );
      }
    } finally {
      setBusyDeleteId(null);
    }
  }

  async function handleCopyPreviousMonth() {
    setErrorMsg(null);
    setCopySuccessMsg(null);
    setCopying(true);

    const prevPeriod = shiftPeriodMonth(currentPeriod, -1);
    try {
      let previousBudgets: CategoryBudgetDto[] = [];
      const offlineNow =
        sync !== null
          ? !sync.isOnline
          : typeof navigator !== "undefined" && !navigator.onLine;

      if (offlineNow && sync?.mirror?.categoryBudgets) {
        previousBudgets = sync.mirror.categoryBudgets.filter(
          (b) => b.periodMonth === prevPeriod,
        );
      } else {
        const res = await apiFetch(
          `/api/finance/budgets?period=${prevPeriod}&tzOffset=${-new Date().getTimezoneOffset()}`,
        );
        if (res.ok) {
          const payload = await readJsonSafe<{
            data: CategoryBudgetSummaryDto;
          }>(res);
          if (payload?.data?.items && Array.isArray(payload.data.items)) {
            previousBudgets = payload.data.items;
          }
        } else if (sync?.mirror?.categoryBudgets) {
          previousBudgets = sync.mirror.categoryBudgets.filter(
            (b) => b.periodMonth === prevPeriod,
          );
        }
      }

      if (!previousBudgets || previousBudgets.length === 0) {
        setErrorMsg(t.finance.budgets.noPreviousBudgets);
        return;
      }

      // Filter out budgets whose categoryId already exists in currentPeriod budgets
      const existingCategoryIds = new Set(budgets.map((b) => b.categoryId));
      const toCopy = previousBudgets.filter(
        (b) => !existingCategoryIds.has(b.categoryId),
      );

      if (toCopy.length === 0) {
        setErrorMsg(t.finance.budgets.allPreviousBudgetsExist);
        return;
      }

      const syncMutationContext = sync
        ? {
            userId: sync.userId,
            isOnline: sync.isOnline,
            storageAvailable: sync.storageAvailable,
            onMirrorChanged: () => void sync.reloadMirror(),
          }
        : null;

      let copiedCount = 0;
      for (const item of toCopy) {
        const optimisticId = crypto.randomUUID();
        const optimisticBudget: CategoryBudgetDto = {
          id: optimisticId,
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          amount: item.amount,
          periodMonth: currentPeriod,
          spentAmount: 0,
          remainingAmount: item.amount,
          percentage: 0,
          status: "normal",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const outcome = await executeOfflineCapableMutation<{
          budget: CategoryBudgetDto;
        }>(syncMutationContext, {
          entity: "budget",
          entityId: optimisticId,
          op: "upsert",
          method: "POST",
          path: "/api/finance/budgets",
          body: {
            categoryId: item.categoryId,
            amount: item.amount,
            period: currentPeriod,
          },
          optimisticSnapshot: {
            kind: "budget_upsert",
            budget: optimisticBudget,
          },
        });

        if (outcome.mode === "online" && outcome.response && !outcome.response.ok) {
          const errorJson = (await readJsonSafe(outcome.response)) as ApiErrorPayload | null;
          setErrorMsg(resolveFinanceErrorMessage(t, errorJson));
          break;
        }
        copiedCount++;
      }

      if (copiedCount > 0) {
        setCopySuccessMsg(
          t.finance.budgets.copyPreviousMonthSuccess.replace(
            "{count}",
            String(copiedCount),
          ),
        );
        dispatchFinanceUpdated();
        await onMutated();
      }
    } catch (error) {
      if (!isLikelyNetworkError(error)) {
        setErrorMsg(
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menyalin anggaran dari bulan lalu",
        );
      }
    } finally {
      setCopying(false);
    }
  }

  const existingSelectedBudget = budgets.find(
    (b) => b.categoryId === selectedCategoryId,
  );

  const currentAmount = Number(amountStr.replace(/\D/g, ""));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)]/50 pb-3">
        <p className="max-w-xs text-xs text-[var(--text-muted)] sm:max-w-sm">
          {t.finance.budgets.modalDescription}
        </p>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void handleCopyPreviousMonth()}
          disabled={copying || saving}
          className="gap-1.5 text-xs"
          data-testid="copy-previous-month-button"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {copying
              ? t.finance.budgets.copyingPreviousMonth
              : t.finance.budgets.copyPreviousMonthButton}
          </span>
        </Button>
      </div>

      {copySuccessMsg ? (
        <div
          role="status"
          data-testid="copy-success-banner"
          className="flex items-center gap-2 rounded-xl border border-[var(--status-income)]/40 bg-[var(--status-income)]/10 px-3 py-2.5 text-xs text-[var(--status-income)]"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{copySuccessMsg}</span>
        </div>
      ) : null}

      {errorMsg ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-[var(--status-expense)]/40 bg-[var(--bg-muted)]/30 px-3 py-2.5 text-xs text-[var(--status-expense)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      ) : null}

      {expenseCategories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] p-4 text-center text-sm text-[var(--text-muted)]">
          {t.finance.budgets.noExpenseCategoriesError}
        </div>
      ) : (
        <form onSubmit={handleSaveBudget} className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="budget-category-select"
                className="block text-xs font-semibold text-[var(--text-secondary)]"
              >
                {t.finance.budgets.categorySelectLabel}
              </label>
              <select
                id="budget-category-select"
                value={selectedCategoryId}
                onChange={(e) => handleSelectCategory(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-hidden"
              >
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="budget-amount-input"
                className="block text-xs font-semibold text-[var(--text-secondary)]"
              >
                {t.finance.budgets.amountLabel}
              </label>
              <Input
                id="budget-amount-input"
                type="text"
                inputMode="numeric"
                value={amountStr}
                onChange={(e) => setAmountStr(formatThousands(e.target.value))}
                placeholder={t.finance.budgets.amountPlaceholder}
                className="mt-1.5"
                hint={
                  currentAmount > 0
                    ? `Preview: ${formatIdr(currentAmount)}`
                    : undefined
                }
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-[var(--text-muted)]">
              {t.finance.budgets.periodLabel}: <strong>{currentPeriod}</strong>
            </span>

            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{saving ? t.finance.budgets.savingButton : t.finance.budgets.saveButton}</span>
            </Button>
          </div>
        </form>
      )}

      {/* Existing Budgets List in Modal */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t.finance.budgets.sectionTitle} ({budgets.length})
        </h4>

        {budgets.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {t.finance.budgets.noBudgetsDescription}
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--border-subtle)]/50 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            {budgets.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between p-3 text-sm"
              >
                <div>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {b.categoryName}
                  </span>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                    <PrivacyAmount amount={b.amount} signMode="plain" /> •{" "}
                    {b.percentage}% {t.finance.budgets.spentOfTotal.toLowerCase()}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleStartEdit(b)}
                    className="h-8 px-2 text-xs"
                    aria-label={`Edit ${b.categoryName} budget`}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>

                  {confirmDeleteId === b.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void handleDeleteBudget(b.id)}
                        disabled={busyDeleteId === b.id}
                        className="h-8 bg-[var(--status-expense)] px-2 text-xs hover:bg-[var(--status-expense)]/90"
                      >
                        {busyDeleteId === b.id
                          ? t.finance.budgets.deletingButton
                          : t.finance.budgets.confirmDeleteButton}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setConfirmDeleteId(null)}
                        className="h-8 px-2 text-xs"
                      >
                        {t.finance.budgets.cancelButton}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDeleteId(b.id)}
                      className="h-8 px-2 text-xs text-[var(--status-expense)] hover:bg-[var(--status-expense)]/10"
                      aria-label={`Delete ${b.categoryName} budget`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button variant="secondary" onClick={onClose}>
          {t.finance.budgets.cancelButton}
        </Button>
      </div>
    </div>
  );
}

export function BudgetManagerModal({
  open,
  onClose,
  categories,
  budgets,
  currentPeriod,
  onMutated,
}: BudgetManagerModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.finance?.budgets?.modalTitle ?? "Kelola Anggaran Kategori"}
      className="max-w-xl"
    >
      <BudgetManagerBody
        categories={categories}
        budgets={budgets}
        currentPeriod={currentPeriod}
        onClose={onClose}
        onMutated={onMutated}
      />
    </Modal>
  );
}
