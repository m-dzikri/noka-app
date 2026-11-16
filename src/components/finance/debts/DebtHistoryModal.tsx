"use client";

import { useEffect, useState } from "react";
import { History, Trash2, Wallet, X } from "lucide-react";
import type {
  DebtReceivableDetailDto,
  DebtReceivableDto,
} from "@/features/finance/debt-schemas";
import { formatIdr } from "@/features/finance/format";
import { useI18n } from "@/lib/i18n/context";

interface DebtHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  debt: DebtReceivableDto | null;
  onSettlementReverted?: () => void;
}

function DebtHistoryBody({
  onClose,
  debt,
  onSettlementReverted,
}: Omit<DebtHistoryModalProps, "isOpen"> & { debt: DebtReceivableDto }) {
  const { t: dict } = useI18n();
  const t = dict.finance.debts;

  const [detail, setDetail] = useState<DebtReceivableDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/finance/debts/${debt.id}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error?.message || "Gagal memuat detail");
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setDetail(data.data?.item || null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal memuat data");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debt.id]);

  const handleDeleteSettlement = async (settlementId: string) => {
    if (!window.confirm(t.revertConfirmDesc)) return;
    setDeletingId(settlementId);
    try {
      const res = await fetch(
        `/api/finance/debts/${debt.id}/settlements/${settlementId}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || "Gagal membatalkan pelunasan");
      }
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              settlements: prev.settlements.filter((s) => s.id !== settlementId),
            }
          : null,
      );
      onSettlementReverted?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal membatalkan pelunasan");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl animate-in fade-in-0 zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <History className="w-4 h-4 text-foreground/70" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {t.historyModalTitle}
              </h2>
              <p className="text-xs text-muted-foreground">
                {debt.personName} • {formatIdr(debt.totalAmount)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-4">
          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Memuat riwayat...
            </div>
          ) : error ? (
            <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs">
              {error}
            </div>
          ) : !detail?.settlements || detail.settlements.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {t.historyEmpty}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {detail.settlements.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/30 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-foreground">
                      {formatIdr(s.amount)}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Wallet className="w-3 h-3" />
                      <span>{s.walletName || t.noWalletOption}</span>
                      {s.notes && <span>• {s.notes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right text-[11px] text-muted-foreground">
                      {new Date(s.settledAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                    <button
                      type="button"
                      title={t.revertSettlementCta}
                      aria-label={t.revertSettlementCta}
                      disabled={deletingId === s.id}
                      onClick={() => handleDeleteSettlement(s.id)}
                      className="p-1 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 mt-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
          >
            {t.cancelButton}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DebtHistoryModal(props: DebtHistoryModalProps) {
  if (!props.isOpen || !props.debt) return null;
  return (
    <DebtHistoryBody
      key={props.debt.id}
      {...props}
      debt={props.debt}
    />
  );
}
