"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  History,
  Trash2,
  User,
} from "lucide-react";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import type { DebtReceivableDto } from "@/features/finance/debt-schemas";
import { useI18n } from "@/lib/i18n/context";

interface DebtCardProps {
  debt: DebtReceivableDto;
  onRecordSettlement: (debt: DebtReceivableDto) => void;
  onViewHistory: (debt: DebtReceivableDto) => void;
  onEdit: (debt: DebtReceivableDto) => void;
  onDelete: (debt: DebtReceivableDto) => void;
  isPending?: boolean;
}

export function DebtCard({
  debt,
  onRecordSettlement,
  onViewHistory,
  onEdit,
  onDelete,
  isPending = false,
}: DebtCardProps) {
  const { t: dict } = useI18n();
  const t = dict.finance.debts;
  const isSettled = debt.status === "settled";
  const isReceivable = debt.type === "receivable";

  const formattedDueDate = debt.dueDate
    ? new Date(debt.dueDate).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div
      data-testid={`debt-card-${debt.id}`}
      className={`rounded-2xl border bg-card p-5 shadow-xs transition-all ${
        isSettled
          ? "border-border/60 opacity-80"
          : debt.isOverdue
            ? "border-red-500/40 bg-red-500/[0.02]"
            : debt.isDueSoon
              ? "border-amber-500/40 bg-amber-500/[0.02]"
              : "border-border hover:border-border/80 hover:shadow-sm"
      }`}
    >
      {/* Header: Type, Status, Due date badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isReceivable
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
            }`}
          >
            {isReceivable ? t.receivableTypeLabel : t.debtTypeLabel}
          </span>

          {isSettled ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              {t.statusSettled}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
              {t.statusActive}
            </span>
          )}
        </div>

        {/* Due status badges */}
        {!isSettled && (
          <div className="flex items-center gap-1.5">
            {debt.isOverdue ? (
              <span
                data-testid="overdue-badge"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
              >
                <AlertCircle className="w-3 h-3" />
                {t.overdueBadge}
              </span>
            ) : debt.isDueSoon ? (
              <span
                data-testid="due-soon-badge"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              >
                <Clock className="w-3 h-3" />
                {t.dueSoonBadge}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* Person Name & Due date */}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-foreground/70" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-foreground leading-tight">
                {debt.personName}
              </h3>
              {debt.notes && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {debt.notes}
                </p>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-xs text-muted-foreground block">
              {t.remainingAmountLabel}
            </span>
            <span
              data-testid="remaining-amount"
              className={`font-bold text-base ${
                isSettled
                  ? "text-muted-foreground line-through"
                  : isReceivable
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
              }`}
            >
              <PrivacyAmount amount={debt.remainingAmount} signMode="plain" />
            </span>
          </div>
        </div>

        {formattedDueDate && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
            <Calendar className="w-3.5 h-3.5" />
            <span>{t.dueOnLabel.replace("{date}", formattedDueDate)}</span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center text-xs mb-1.5">
          <span className="text-muted-foreground">
            {t.settledAmountLabel}:{" "}
            <strong className="text-foreground font-medium">
              <PrivacyAmount amount={debt.settledAmount} signMode="plain" />
            </strong>
          </span>
          <span className="text-muted-foreground font-medium">
            {debt.settlementPercentage}%
          </span>
        </div>
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isSettled
                ? "bg-emerald-500"
                : isReceivable
                  ? "bg-emerald-500"
                  : "bg-rose-500"
            }`}
            style={{ width: `${Math.min(100, debt.settlementPercentage)}%` }}
          />
        </div>
        <div className="text-right text-[11px] text-muted-foreground mt-1">
          {t.totalAmountLabel}:{" "}
          <PrivacyAmount amount={debt.totalAmount} signMode="plain" />
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border/60 gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onViewHistory(debt)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            title={t.settlementHistoryCta}
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.settlementHistoryCta}</span>
          </button>

          <button
            type="button"
            onClick={() => onEdit(debt)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            title={t.editCta}
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.editCta}</span>
          </button>

          <button
            type="button"
            onClick={() => onDelete(debt)}
            disabled={isPending}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
            title={t.deleteCta}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {!isSettled && (
          <button
            type="button"
            onClick={() => onRecordSettlement(debt)}
            disabled={isPending}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow-xs transition-colors ${
              isReceivable
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-rose-600 hover:bg-rose-500"
            }`}
          >
            <span>{t.recordSettlementCta}</span>
          </button>
        )}
      </div>
    </div>
  );
}
