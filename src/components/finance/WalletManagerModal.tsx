"use client";

import { useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  dispatchFinanceUpdated,
  readJsonSafe,
  resolveFinanceErrorMessage,
  type ApiErrorPayload,
} from "@/components/finance/finance-client-helpers";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { formatIdr, parseIdrDigits } from "@/features/finance/format";
import { WALLET_TYPES, type WalletType } from "@/features/finance/schemas";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";

export interface WalletManagerModalProps {
  open: boolean;
  onClose: () => void;
  wallets: WalletWithBalanceDto[];
  onMutated: () => Promise<void> | void;
}

function WalletManagerBody({
  wallets,
  onMutated,
}: Pick<WalletManagerModalProps, "wallets" | "onMutated">) {
  const { t } = useI18n();
  const [editingWallet, setEditingWallet] = useState<WalletWithBalanceDto | null>(
    null,
  );
  const [name, setName] = useState("");
  const [type, setType] = useState<WalletType>("cash");
  const [initialBalanceText, setInitialBalanceText] = useState("0");
  const [includeInSafeToSpend, setIncludeInSafeToSpend] = useState(true);
  const [isDefault, setIsDefault] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [archiveOfferWalletId, setArchiveOfferWalletId] = useState<string | null>(
    null,
  );

  function startCreateMode(): void {
    setEditingWallet(null);
    setName("");
    setType("cash");
    setInitialBalanceText("0");
    setIncludeInSafeToSpend(true);
    setIsDefault(false);
    setErrorMsg(null);
    setArchiveOfferWalletId(null);
  }

  function startEditWallet(wallet: WalletWithBalanceDto): void {
    setEditingWallet(wallet);
    setName(wallet.name);
    setType(wallet.type);
    setInitialBalanceText(String(wallet.initialBalance));
    setIncludeInSafeToSpend(wallet.includeInSafeToSpend);
    setIsDefault(wallet.isDefault);
    setErrorMsg(null);
    setArchiveOfferWalletId(null);
  }

  function handleTypeChange(nextType: WalletType): void {
    setType(nextType);
    if (!editingWallet) {
      setIncludeInSafeToSpend(nextType !== "bank");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg(t.finance.walletModal.nameRequiredError);
      return;
    }

    const parsedBalance = parseIdrDigits(initialBalanceText);
    if (parsedBalance === null || parsedBalance < 0) {
      setErrorMsg(t.finance.walletModal.invalidAmountError);
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setArchiveOfferWalletId(null);

    try {
      const url = editingWallet
        ? `/api/wallets/${editingWallet.id}`
        : "/api/wallets";
      const method = editingWallet ? "PATCH" : "POST";

      const response = await apiFetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          name: trimmedName,
          type,
          initialBalance: parsedBalance,
          includeInSafeToSpend,
          ...(editingWallet?.archivedAt ? {} : { isDefault }),
          ...(editingWallet ? { updatedAt: editingWallet.updatedAt } : {}),
        }),
      });

      if (!response.ok) {
        const errPayload = await readJsonSafe<ApiErrorPayload>(response);
        setErrorMsg(resolveFinanceErrorMessage(t, errPayload));
        return;
      }

      startCreateMode();
      await onMutated();
      dispatchFinanceUpdated();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleArchive(
    wallet: WalletWithBalanceDto,
    archived: boolean,
  ): Promise<void> {
    setBusyId(wallet.id);
    setErrorMsg(null);
    setArchiveOfferWalletId(null);

    try {
      const response = await apiFetch(`/api/wallets/${wallet.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          archived,
          updatedAt: wallet.updatedAt,
        }),
      });

      if (!response.ok) {
        const errPayload = await readJsonSafe<ApiErrorPayload>(response);
        setErrorMsg(resolveFinanceErrorMessage(t, errPayload));
        return;
      }

      if (editingWallet?.id === wallet.id) {
        startCreateMode();
      }
      await onMutated();
      dispatchFinanceUpdated();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteWallet(wallet: WalletWithBalanceDto): Promise<void> {
    setBusyId(wallet.id);
    setErrorMsg(null);
    setArchiveOfferWalletId(null);

    try {
      const response = await apiFetch(`/api/wallets/${wallet.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          updatedAt: wallet.updatedAt,
        }),
      });

      if (!response.ok) {
        const errPayload = await readJsonSafe<ApiErrorPayload>(response);
        if (response.status === 409 && errPayload?.error?.code === "WALLET_HAS_HISTORY") {
          setArchiveOfferWalletId(wallet.id);
        }
        setErrorMsg(resolveFinanceErrorMessage(t, errPayload));
        return;
      }

      if (editingWallet?.id === wallet.id) {
        startCreateMode();
      }
      await onMutated();
      dispatchFinanceUpdated();
    } finally {
      setBusyId(null);
    }
  }

  const archiveOfferTarget = archiveOfferWalletId
    ? wallets.find((w) => w.id === archiveOfferWalletId)
    : undefined;

  return (
    <div className="flex flex-col gap-5">
      {errorMsg ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-[var(--status-expense)]/40 bg-[var(--bg-subtle)] px-3.5 py-2.5 text-sm text-[var(--status-expense)]"
        >
          <p>{errorMsg}</p>
          {archiveOfferTarget && archiveOfferTarget.archivedAt === null ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-xs text-[var(--text-secondary)]">
                {t.finance.walletModal.archiveOfferTitle}
              </span>
              <Button
                size="sm"
                variant="secondary"
                loading={busyId === archiveOfferTarget.id}
                onClick={() => void handleToggleArchive(archiveOfferTarget, true)}
              >
                <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.finance.walletModal.archiveOfferButton}</span>
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {editingWallet
              ? t.finance.walletModal.editWalletHeading
              : t.finance.walletModal.newWalletHeading}
          </h3>
          {editingWallet ? (
            <Button size="sm" variant="ghost" onClick={startCreateMode}>
              {t.finance.walletModal.cancelEditButton}
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={t.finance.walletModal.nameLabel}
            placeholder={t.finance.walletModal.namePlaceholder}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="wallet-type-select"
              className="text-sm font-medium text-[var(--text-primary)]"
            >
              {t.finance.walletModal.typeLabel}
            </label>
            <select
              id="wallet-type-select"
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as WalletType)}
              className="min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {WALLET_TYPES.map((walletType) => (
                <option key={walletType} value={walletType}>
                  {t.finance.walletTypes[walletType]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Input
          label={t.finance.walletModal.initialBalanceLabel}
          inputMode="numeric"
          value={initialBalanceText}
          onChange={(e) => setInitialBalanceText(e.target.value)}
        />

        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={includeInSafeToSpend}
              onChange={(e) => setIncludeInSafeToSpend(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent-primary)]"
            />
            <span>{t.finance.walletModal.includeInSafeToSpendLabel}</span>
          </label>

          {editingWallet?.archivedAt ? null : (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent-primary)]"
              />
              <span>{t.finance.walletModal.setDefaultLabel}</span>
            </label>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" loading={submitting}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>
              {editingWallet
                ? submitting
                  ? t.finance.walletModal.savingButton
                  : t.finance.walletModal.saveButton
                : submitting
                  ? t.finance.walletModal.creatingButton
                  : t.finance.walletModal.createButton}
            </span>
          </Button>
        </div>
      </form>

      <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
        {wallets.map((wallet) => {
          const isArchived = wallet.archivedAt !== null;
          return (
            <li
              key={wallet.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-medium text-[var(--text-primary)]">
                    {wallet.name}
                  </span>
                  <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                    {t.finance.walletTypes[wallet.type]}
                  </span>
                  {wallet.isDefault ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-primary)]/15 px-2 py-0.5 text-xs font-medium text-[var(--accent-text)]">
                      <Star className="h-3 w-3" aria-hidden="true" />
                      {t.finance.defaultBadge}
                    </span>
                  ) : null}
                  {isArchived ? (
                    <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                      {t.finance.archivedBadge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {formatIdr(wallet.currentBalance)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId === wallet.id}
                  onClick={() => startEditWallet(wallet)}
                  aria-label={`${t.finance.walletModal.editButton} ${wallet.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.finance.walletModal.editButton}</span>
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  loading={busyId === wallet.id}
                  onClick={() => void handleToggleArchive(wallet, !isArchived)}
                  aria-label={`${isArchived ? t.finance.walletModal.unarchiveButton : t.finance.walletModal.archiveButton} ${wallet.name}`}
                >
                  {isArchived ? (
                    <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {isArchived
                      ? t.finance.walletModal.unarchiveButton
                      : t.finance.walletModal.archiveButton}
                  </span>
                </Button>

                <Button
                  size="sm"
                  variant="danger"
                  loading={busyId === wallet.id}
                  onClick={() => void handleDeleteWallet(wallet)}
                  aria-label={`${t.finance.walletModal.deleteButton} ${wallet.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.finance.walletModal.deleteButton}</span>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Accessible modal for creating, editing, setting default, archiving/restoring, and deleting 0-history wallets (F10, HIGH-3).
 */
export function WalletManagerModal({
  open,
  onClose,
  wallets,
  onMutated,
}: WalletManagerModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.finance.walletModal.title}
      description={t.finance.walletModal.description}
      className="max-w-xl"
    >
      {open ? <WalletManagerBody wallets={wallets} onMutated={onMutated} /> : null}
    </Modal>
  );
}
