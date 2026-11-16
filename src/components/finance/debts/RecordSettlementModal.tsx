"use client";

import { useState } from "react";
import { CheckCircle2, Wallet, X } from "lucide-react";
import type {
  CreateSettlementInput,
  DebtReceivableDto,
} from "@/features/finance/debt-schemas";
import { formatIdr, formatThousands, parseIdrDigits } from "@/features/finance/format";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import { useI18n } from "@/lib/i18n/context";

interface RecordSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  debt: DebtReceivableDto | null;
  wallets: WalletWithBalanceDto[];
  onSubmitSettlement: (
    debtId: string,
    input: CreateSettlementInput,
  ) => Promise<void>;
  isSubmitting?: boolean;
}

function RecordSettlementBody({
  onClose,
  debt,
  wallets,
  onSubmitSettlement,
  isSubmitting = false,
}: Omit<RecordSettlementModalProps, "isOpen"> & { debt: DebtReceivableDto }) {
  const { t: dict } = useI18n();
  const t = dict.finance.debts;

  const [amountStr, setAmountStr] = useState(formatThousands(debt.remainingAmount));
  const [walletId, setWalletId] = useState<string>(wallets[0]?.id ?? "");
  const [settledAtStr, setSettledAtStr] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseIdrDigits(amountStr) || 0;
  const isFullSettlement = parsedAmount >= debt.remainingAmount;
  const isOverSettlement = parsedAmount > debt.remainingAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (parsedAmount <= 0) {
      setError("Nominal harus berupa angka bulat positif");
      return;
    }

    if (isOverSettlement) {
      setError(t.overSettlementWarning);
      return;
    }

    try {
      await onSubmitSettlement(debt.id, {
        amount: parsedAmount,
        walletId: walletId ? walletId : null,
        settledAt: settledAtStr ? `${settledAtStr}T00:00:00.000Z` : null,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl animate-in fade-in-0 zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t.settlementModalTitle}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {debt.type === "receivable"
                ? `Terima pembayaran piutang dari ${debt.personName}`
                : `Bayar cicilan utang kepada ${debt.personName}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Debt Info Summary Box */}
        <div className="mt-4 p-3.5 rounded-xl bg-secondary/50 border border-border text-xs space-y-1.5">
          <div className="flex justify-between items-center text-muted-foreground">
            <span>{t.totalAmountLabel}:</span>
            <span className="font-semibold text-foreground">
              {formatIdr(debt.totalAmount)}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span>{t.settledAmountLabel}:</span>
            <span className="font-medium text-foreground">
              {formatIdr(debt.settledAmount)}
            </span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-border font-semibold">
            <span className="text-foreground">{t.remainingAmountLabel}:</span>
            <span
              className={
                debt.type === "receivable"
                  ? "text-emerald-600 dark:text-emerald-400 text-sm"
                  : "text-rose-600 dark:text-rose-400 text-sm"
              }
            >
              {formatIdr(debt.remainingAmount)}
            </span>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Settlement Amount */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label
                htmlFor="settleAmount"
                className="text-xs font-medium text-foreground"
              >
                {t.settleAmountLabel}
              </label>
              <button
                type="button"
                onClick={() => setAmountStr(formatThousands(debt.remainingAmount))}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                Lunasi Semua ({formatIdr(debt.remainingAmount)})
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2 text-xs font-semibold text-muted-foreground">
                Rp
              </span>
              <input
                id="settleAmount"
                type="text"
                inputMode="numeric"
                value={amountStr}
                onChange={(e) => setAmountStr(formatThousands(e.target.value))}
                placeholder={t.settleAmountPlaceholder}
                required
                className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 font-mono"
              />
              {parsedAmount > 0 && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Preview: {formatIdr(parsedAmount)}
                </p>
              )}
            </div>
            {isFullSettlement && !isOverSettlement && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Pelunasan penuh (status akan otomatis Lunas)</span>
              </div>
            )}
          </div>

          {/* Wallet Selection */}
          <div>
            <label
              htmlFor="settleWallet"
              className="block text-xs font-medium text-foreground mb-1.5"
            >
              {t.walletSelectLabel}
            </label>
            <div className="relative">
              <select
                id="settleWallet"
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 appearance-none pr-8"
              >
                <option value="">{t.noWalletOption}</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} (Saldo: {formatIdr(w.currentBalance)})
                  </option>
                ))}
              </select>
              <Wallet className="w-4 h-4 text-muted-foreground absolute right-3 top-2.5 pointer-events-none" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {walletId
                ? debt.type === "debt"
                  ? "Akan mencatat pengeluaran kas dan memotong saldo dompet ini."
                  : "Akan mencatat pemasukan kas dan menambah saldo dompet ini."
                : "Tidak mempengaruhi saldo dompet keuangan mana pun."}
            </p>
          </div>

          {/* Settlement Date */}
          <div>
            <label
              htmlFor="settledAt"
              className="block text-xs font-medium text-foreground mb-1.5"
            >
              {t.settleDateLabel}
            </label>
            <input
              id="settledAt"
              type="date"
              value={settledAtStr}
              onChange={(e) => setSettledAtStr(e.target.value)}
              required
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="settleNotes"
              className="block text-xs font-medium text-foreground mb-1.5"
            >
              {t.settleNotesLabel}
            </label>
            <input
              id="settleNotes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.settleNotesPlaceholder}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              {t.cancelButton}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isOverSettlement}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? t.settlingButton : t.settleSubmitButton}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RecordSettlementModal(props: RecordSettlementModalProps) {
  if (!props.isOpen || !props.debt) return null;
  return (
    <RecordSettlementBody
      key={props.debt.id}
      {...props}
      debt={props.debt}
    />
  );
}
