"use client";

import { useState } from "react";
import { AlertCircle, CalendarClock, Check, FastForward, SlidersHorizontal } from "lucide-react";
import {
  dispatchFinanceUpdated,
  readJsonSafe,
  resolveFinanceErrorMessage,
  type ApiErrorPayload,
} from "@/components/finance/finance-client-helpers";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { formatThousands } from "@/features/finance/format";
import type { PendingRecurringDto } from "@/features/finance/recurring-schemas";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";

export interface RecurringPendingBannerProps {
  pendingItems: PendingRecurringDto[];
  wallets: WalletWithBalanceDto[];
  onItemsMutated: () => Promise<void> | void;
}

export function RecurringPendingBanner({
  pendingItems,
  wallets,
  onItemsMutated,
}: RecurringPendingBannerProps) {
  const { t } = useI18n();
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Per-item override states in review modal
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [customWallets, setCustomWallets] = useState<Record<string, string>>({});

  const activeWallets = wallets.filter((w) => w.archivedAt === null);

  if (pendingItems.length === 0) {
    return null;
  }

  async function handleApplyAll() {
    setApplyingAll(true);
    setErrorMsg(null);
    try {
      for (const item of pendingItems) {
        const res = await apiFetch("/api/finance/recurring/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            templateId: item.templateId,
            action: "apply",
          }),
        });
        if (!res.ok) {
          const err = (await readJsonSafe(res)) as ApiErrorPayload | null;
          setErrorMsg(resolveFinanceErrorMessage(t, err));
          break;
        }
      }
      dispatchFinanceUpdated();
      await onItemsMutated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.errors.generic);
    } finally {
      setApplyingAll(false);
    }
  }

  async function handleConfirmSingle(
    item: PendingRecurringDto,
    action: "apply" | "skip",
  ) {
    setBusyItemId(item.templateId);
    setErrorMsg(null);

    const customAmtStr = customAmounts[item.templateId];
    const customWalletId = customWallets[item.templateId];

    let customAmount: number | undefined;
    if (customAmtStr) {
      const cleanNum = Number(customAmtStr.replace(/\D/g, ""));
      if (Number.isSafeInteger(cleanNum) && cleanNum > 0) {
        customAmount = cleanNum;
      }
    }

    try {
      const res = await apiFetch("/api/finance/recurring/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateId: item.templateId,
          action,
          customAmount: action === "apply" ? customAmount : undefined,
          customWalletId: action === "apply" ? customWalletId : undefined,
        }),
      });

      if (!res.ok) {
        const err = (await readJsonSafe(res)) as ApiErrorPayload | null;
        setErrorMsg(resolveFinanceErrorMessage(t, err));
        return;
      }

      dispatchFinanceUpdated();
      await onItemsMutated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.errors.generic);
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <>
      <div
        role="alert"
        aria-live="polite"
        data-testid="recurring-pending-banner"
        className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 p-4 text-sm text-[var(--text-primary)] shadow-xs transition-all sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <CalendarClock
            className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-primary)]"
            aria-hidden="true"
          />
          <div>
            <h4 className="font-bold text-[var(--text-primary)]">
              {t.finance.recurring.pendingBannerTitle}
            </h4>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {t.finance.recurring.pendingBannerDesc.replace(
                "{count}",
                String(pendingItems.length),
              )}
            </p>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {pendingItems.map((item) => (
                <span
                  key={item.templateId}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--accent-primary)]/30 bg-[var(--bg-surface)] px-2 py-0.5 font-medium text-[var(--text-primary)]"
                >
                  <span>{item.description}:</span>
                  <span
                    className={
                      item.type === "expense"
                        ? "text-[var(--status-expense)]"
                        : "text-[var(--status-income)]"
                    }
                  >
                    <PrivacyAmount amount={item.amount} signMode="plain" />
                  </span>
                  <span className="text-[var(--text-muted)]">({item.walletName})</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleApplyAll()}
            disabled={applyingAll}
            className="h-8 gap-1 text-xs"
            data-testid="recurring-apply-all-button"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {applyingAll
                ? t.finance.recurring.applyingButton
                : t.finance.recurring.applyAllButton}
            </span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setReviewModalOpen(true)}
            className="h-8 gap-1 text-xs"
            data-testid="recurring-review-button"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.finance.recurring.reviewButton}</span>
          </Button>
        </div>
      </div>

      {/* Review Modal */}
      <Modal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title={t.finance.recurring.confirmModalTitle}
        className="max-w-xl"
      >
        <div className="space-y-4" data-testid="recurring-review-modal">
          <p className="text-xs text-[var(--text-muted)]">
            {t.finance.recurring.modalDescription}
          </p>

          {errorMsg ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-[var(--status-expense)]/40 bg-[var(--bg-muted)]/30 px-3 py-2 text-xs text-[var(--status-expense)]"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          <div className="divide-y divide-[var(--border-subtle)]/50 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            {pendingItems.map((item) => {
              const isBusy = busyItemId === item.templateId;
              const curWalletId = customWallets[item.templateId] ?? item.walletId;
              const curAmountStr = formatThousands(customAmounts[item.templateId] ?? item.amount);

              return (
                <div
                  key={item.templateId}
                  className="space-y-3 p-4"
                  data-testid={`pending-recurring-row-${item.templateId}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-[var(--text-primary)]">
                        {item.description}
                      </h4>
                      <p className="text-xs text-[var(--text-muted)]">
                        {item.categoryName} • {item.frequency}
                      </p>
                    </div>
                    <span
                      className={`font-bold text-sm ${
                        item.type === "expense"
                          ? "text-[var(--status-expense)]"
                          : "text-[var(--status-income)]"
                      }`}
                    >
                      <PrivacyAmount amount={item.amount} signMode="plain" />
                    </span>
                  </div>

                  {/* Overrides */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`custom-amount-${item.templateId}`}
                        className="block text-xs font-medium text-[var(--text-secondary)]"
                      >
                        {t.finance.recurring.customAmountLabel}
                      </label>
                      <Input
                        id={`custom-amount-${item.templateId}`}
                        data-testid={`custom-amount-${item.templateId}`}
                        type="text"
                        inputMode="numeric"
                        value={curAmountStr}
                        onChange={(e) =>
                          setCustomAmounts((prev) => ({
                            ...prev,
                            [item.templateId]: formatThousands(e.target.value),
                          }))
                        }
                        className="mt-1 h-8 text-xs"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor={`custom-wallet-${item.templateId}`}
                        className="block text-xs font-medium text-[var(--text-secondary)]"
                      >
                        {t.finance.recurring.customWalletLabel}
                      </label>
                      <select
                        id={`custom-wallet-${item.templateId}`}
                        data-testid={`custom-wallet-${item.templateId}`}
                        value={curWalletId}
                        onChange={(e) =>
                          setCustomWallets((prev) => ({
                            ...prev,
                            [item.templateId]: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-hidden"
                      >
                        {activeWallets.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleConfirmSingle(item, "skip")}
                      disabled={isBusy}
                      className="h-7 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      data-testid={`skip-item-${item.templateId}`}
                    >
                      <FastForward className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t.finance.recurring.skipButton}</span>
                    </Button>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleConfirmSingle(item, "apply")}
                      disabled={isBusy}
                      className="h-7 text-xs"
                      data-testid={`apply-item-${item.templateId}`}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t.finance.recurring.applyButton}</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setReviewModalOpen(false)}>
              {t.finance.recurring.cancelButton}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
