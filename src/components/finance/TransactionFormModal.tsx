"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  dispatchFinanceUpdated,
  fromDateTimeLocalValue,
  resolveFinanceErrorMessage,
  toDateTimeLocalValue,
} from "@/components/finance/finance-client-helpers";
import { useOptionalSync } from "@/components/providers/SyncProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type { CategoryDto } from "@/features/finance/categories-service";
import { parseIdrDigits } from "@/features/finance/format";
import type { FinanceEntryType } from "@/features/finance/schemas";
import type { TransactionDto } from "@/features/finance/transactions-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import {
  buildOptimisticTransactionDto,
  executeOfflineCapableMutation,
} from "@/features/sync/client-api";
import { useI18n } from "@/lib/i18n/context";

export interface TransactionFormModalProps {
  open: boolean;
  onClose: () => void;
  wallets: WalletWithBalanceDto[];
  categories: CategoryDto[];
  editingTransaction: TransactionDto | null;
  onMutated: () => Promise<void> | void;
}

function TransactionFormBody({
  onClose,
  wallets,
  categories,
  editingTransaction,
  onMutated,
}: Omit<TransactionFormModalProps, "open">) {
  const { t } = useI18n();
  const sync = useOptionalSync();
  const activeWallets = useMemo(
    () => wallets.filter((w) => w.archivedAt === null),
    [wallets],
  );

  const defaultWallet =
    activeWallets.find((w) => w.isDefault) ?? activeWallets[0];
  const defaultExpenseCategory =
    categories.find((c) => c.type === "expense") ?? categories[0];

  const [type, setType] = useState<FinanceEntryType>(
    editingTransaction?.type ?? "expense",
  );
  const [walletId, setWalletId] = useState<string>(
    editingTransaction?.walletId ?? defaultWallet?.id ?? "",
  );
  const [categoryId, setCategoryId] = useState<string>(
    editingTransaction?.categoryId ?? defaultExpenseCategory?.id ?? "",
  );
  const [amountText, setAmountText] = useState<string>(
    editingTransaction ? String(editingTransaction.amount) : "",
  );
  const [description, setDescription] = useState<string>(
    editingTransaction?.description ?? "",
  );
  const [occurredAtLocal, setOccurredAtLocal] = useState<string>(() =>
    toDateTimeLocalValue(editingTransaction?.occurredAt),
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectableWallets = useMemo(() => {
    if (!editingTransaction) {
      return activeWallets;
    }
    const existingWallet = wallets.find(
      (w) => w.id === editingTransaction.walletId,
    );
    if (existingWallet && existingWallet.archivedAt !== null) {
      return [existingWallet, ...activeWallets];
    }
    return activeWallets;
  }, [activeWallets, editingTransaction, wallets]);

  const categoriesForType = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
  );

  function handleTypeSwitch(nextType: FinanceEntryType): void {
    setType(nextType);
    const matching = categories.filter((c) => c.type === nextType);
    if (!matching.some((c) => c.id === categoryId)) {
      setCategoryId(matching[0]?.id ?? "");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!walletId) {
      setErrorMsg(t.finance.transactionModal.selectWalletError);
      return;
    }
    if (!categoryId) {
      setErrorMsg(t.finance.transactionModal.selectCategoryError);
      return;
    }

    const parsedAmount = parseIdrDigits(amountText);
    if (parsedAmount === null || parsedAmount <= 0) {
      setErrorMsg(t.finance.transactionModal.invalidAmountError);
      return;
    }

    const isoOccurredAt = fromDateTimeLocalValue(occurredAtLocal);
    if (!isoOccurredAt) {
      setErrorMsg(t.errors.INVALID_TIMESTAMP);
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const trimmedDesc = description.trim();
      const txId = editingTransaction?.id ?? crypto.randomUUID();
      const url = editingTransaction
        ? `/api/transactions/${editingTransaction.id}`
        : "/api/transactions";
      const method = editingTransaction ? "PATCH" : "POST";
      const idempotencyKey = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const targetWallet = wallets.find((w) => w.id === walletId);
      const targetCategory = categories.find((c) => c.id === categoryId);

      const optimisticTx = buildOptimisticTransactionDto({
        id: txId,
        walletId,
        walletName: targetWallet?.name ?? editingTransaction?.walletName ?? "",
        categoryId,
        categoryName:
          targetCategory?.name ?? editingTransaction?.categoryName ?? "",
        noteId: editingTransaction?.noteId ?? null,
        type,
        amount: parsedAmount,
        description: trimmedDesc.length > 0 ? trimmedDesc : null,
        occurredAt: isoOccurredAt,
        createdAt: editingTransaction?.createdAt ?? nowIso,
        updatedAt: nowIso,
      });

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
          entityId: txId,
          op: "upsert",
          method,
          path: url,
          idempotencyKey,
          updatedAt: nowIso,
          body: {
            ...(editingTransaction ? {} : { id: txId }),
            walletId,
            categoryId,
            type,
            amount: parsedAmount,
            description: trimmedDesc.length > 0 ? trimmedDesc : null,
            occurredAt: isoOccurredAt,
            ...(editingTransaction
              ? { updatedAt: editingTransaction.updatedAt }
              : {}),
          },
          optimisticSnapshot: {
            kind: "transaction_upsert",
            transaction: optimisticTx,
          },
        },
      );

      if (outcome.mode === "online" && outcome.errorPayload) {
        setErrorMsg(resolveFinanceErrorMessage(t, outcome.errorPayload));
        return;
      }

      onClose();
      await onMutated();
      dispatchFinanceUpdated();
    } finally {
      setSubmitting(false);
    }
  }

  if (!editingTransaction && activeWallets.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4 text-sm text-[var(--text-secondary)]">
        {t.finance.transactionModal.noActiveWalletsNotice}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div
        className="flex gap-2"
        role="group"
        aria-label={t.finance.transactionModal.typeLabel}
      >
        <Button
          size="sm"
          variant={type === "expense" ? "primary" : "secondary"}
          aria-pressed={type === "expense"}
          onClick={() => handleTypeSwitch("expense")}
        >
          {t.finance.transactionModal.expenseOption}
        </Button>
        <Button
          size="sm"
          variant={type === "income" ? "primary" : "secondary"}
          aria-pressed={type === "income"}
          onClick={() => handleTypeSwitch("income")}
        >
          {t.finance.transactionModal.incomeOption}
        </Button>
      </div>

      {errorMsg ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--status-expense)]/40 bg-[var(--bg-subtle)] px-3.5 py-2.5 text-sm text-[var(--status-expense)]"
        >
          {errorMsg}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="tx-wallet-select"
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            {t.finance.transactionModal.walletLabel}
          </label>
          <select
            id="tx-wallet-select"
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            className="min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {selectableWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.archivedAt ? ` (${t.finance.archivedBadge})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="tx-category-select"
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            {t.finance.transactionModal.categoryLabel}
          </label>
          <select
            id="tx-category-select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {categoriesForType.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label={t.finance.transactionModal.amountLabel}
          placeholder={t.finance.transactionModal.amountPlaceholder}
          inputMode="numeric"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
        />

        <Input
          label={t.finance.transactionModal.occurredAtLabel}
          type="datetime-local"
          value={occurredAtLocal}
          onChange={(e) => setOccurredAtLocal(e.target.value)}
        />
      </div>

      <Input
        label={t.finance.transactionModal.descriptionLabel}
        placeholder={t.finance.transactionModal.descriptionPlaceholder}
        maxLength={300}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button type="submit" loading={submitting}>
          {editingTransaction
            ? submitting
              ? t.finance.transactionModal.savingButton
              : t.finance.transactionModal.saveButton
            : submitting
              ? t.finance.transactionModal.creatingButton
              : t.finance.transactionModal.createButton}
        </Button>
      </div>
    </form>
  );
}

/**
 * Accessible modal for creating or editing income/expense transactions (F11, DATA-1, DATA-2).
 */
export function TransactionFormModal({
  open,
  onClose,
  wallets,
  categories,
  editingTransaction,
  onMutated,
}: TransactionFormModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        editingTransaction
          ? t.finance.transactionModal.editTitle
          : t.finance.transactionModal.createTitle
      }
      className="max-w-lg"
    >
      {open ? (
        <TransactionFormBody
          key={editingTransaction?.id ?? "new-tx"}
          onClose={onClose}
          wallets={wallets}
          categories={categories}
          editingTransaction={editingTransaction}
          onMutated={onMutated}
        />
      ) : null}
    </Modal>
  );
}
