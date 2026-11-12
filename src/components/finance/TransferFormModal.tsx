"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  dispatchFinanceUpdated,
  fromDateTimeLocalValue,
  readJsonSafe,
  resolveFinanceErrorMessage,
  toDateTimeLocalValue,
  type ApiErrorPayload,
} from "@/components/finance/finance-client-helpers";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { parseIdrDigits } from "@/features/finance/format";
import type { TransferDto } from "@/features/finance/transfers-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";

export interface TransferFormModalProps {
  open: boolean;
  onClose: () => void;
  wallets: WalletWithBalanceDto[];
  editingTransfer: TransferDto | null;
  onMutated: () => Promise<void> | void;
}

function TransferFormBody({
  onClose,
  wallets,
  editingTransfer,
  onMutated,
}: Omit<TransferFormModalProps, "open">) {
  const { t } = useI18n();
  const activeWallets = useMemo(
    () => wallets.filter((w) => w.archivedAt === null),
    [wallets],
  );

  const defaultFrom = activeWallets.find((w) => w.isDefault) ?? activeWallets[0];
  const defaultTo = activeWallets.find((w) => w.id !== defaultFrom?.id);

  const [fromWalletId, setFromWalletId] = useState<string>(
    editingTransfer?.fromWalletId ?? defaultFrom?.id ?? "",
  );
  const [toWalletId, setToWalletId] = useState<string>(
    editingTransfer?.toWalletId ?? defaultTo?.id ?? "",
  );
  const [amountText, setAmountText] = useState<string>(
    editingTransfer ? String(editingTransfer.amount) : "",
  );
  const [note, setNote] = useState<string>(editingTransfer?.note ?? "");
  const [occurredAtLocal, setOccurredAtLocal] = useState<string>(() =>
    toDateTimeLocalValue(editingTransfer?.occurredAt),
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectableWallets = useMemo(() => {
    if (!editingTransfer) {
      return activeWallets;
    }
    const extras = wallets.filter(
      (w) =>
        w.archivedAt !== null &&
        (w.id === editingTransfer.fromWalletId ||
          w.id === editingTransfer.toWalletId),
    );
    return [...extras, ...activeWallets];
  }, [activeWallets, editingTransfer, wallets]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!fromWalletId || !toWalletId || fromWalletId === toWalletId) {
      setErrorMsg(t.finance.transferModal.sameWalletError);
      return;
    }

    const parsedAmount = parseIdrDigits(amountText);
    if (parsedAmount === null || parsedAmount <= 0) {
      setErrorMsg(t.finance.transferModal.invalidAmountError);
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
      const trimmedNote = note.trim();
      const url = editingTransfer
        ? `/api/transfers/${editingTransfer.id}`
        : "/api/transfers";
      const method = editingTransfer ? "PATCH" : "POST";

      const response = await apiFetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          fromWalletId,
          toWalletId,
          amount: parsedAmount,
          note: trimmedNote.length > 0 ? trimmedNote : null,
          occurredAt: isoOccurredAt,
          ...(editingTransfer ? { updatedAt: editingTransfer.updatedAt } : {}),
        }),
      });

      if (!response.ok) {
        const errPayload = await readJsonSafe<ApiErrorPayload>(response);
        setErrorMsg(resolveFinanceErrorMessage(t, errPayload));
        return;
      }

      onClose();
      await onMutated();
      dispatchFinanceUpdated();
    } finally {
      setSubmitting(false);
    }
  }

  if (!editingTransfer && activeWallets.length < 2) {
    return (
      <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4 text-sm text-[var(--text-secondary)]">
        {t.finance.transferModal.needTwoWalletsNotice}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            htmlFor="transfer-from-wallet"
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            {t.finance.transferModal.fromWalletLabel}
          </label>
          <select
            id="transfer-from-wallet"
            value={fromWalletId}
            onChange={(e) => setFromWalletId(e.target.value)}
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
            htmlFor="transfer-to-wallet"
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            {t.finance.transferModal.toWalletLabel}
          </label>
          <select
            id="transfer-to-wallet"
            value={toWalletId}
            onChange={(e) => setToWalletId(e.target.value)}
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label={t.finance.transferModal.amountLabel}
          placeholder={t.finance.transferModal.amountPlaceholder}
          inputMode="numeric"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
        />

        <Input
          label={t.finance.transferModal.occurredAtLabel}
          type="datetime-local"
          value={occurredAtLocal}
          onChange={(e) => setOccurredAtLocal(e.target.value)}
        />
      </div>

      <Input
        label={t.finance.transferModal.noteLabel}
        placeholder={t.finance.transferModal.notePlaceholder}
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button type="submit" loading={submitting}>
          {editingTransfer
            ? submitting
              ? t.finance.transferModal.savingButton
              : t.finance.transferModal.saveButton
            : submitting
              ? t.finance.transferModal.creatingButton
              : t.finance.transferModal.createButton}
        </Button>
      </div>
    </form>
  );
}

/**
 * Accessible modal for creating or editing atomic inter-wallet transfers (F12, DATA-3).
 */
export function TransferFormModal({
  open,
  onClose,
  wallets,
  editingTransfer,
  onMutated,
}: TransferFormModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        editingTransfer
          ? t.finance.transferModal.editTitle
          : t.finance.transferModal.createTitle
      }
      className="max-w-lg"
    >
      {open ? (
        <TransferFormBody
          key={editingTransfer?.id ?? "new-transfer"}
          onClose={onClose}
          wallets={wallets}
          editingTransfer={editingTransfer}
          onMutated={onMutated}
        />
      ) : null}
    </Modal>
  );
}
