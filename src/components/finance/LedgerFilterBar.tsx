"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { CycleWindowInfo } from "@/features/finance/safe-to-spend";
import type { FinanceSummaryFilterType } from "@/features/finance/schemas";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import { useI18n } from "@/lib/i18n/context";

export interface LedgerFiltersState {
  walletId: string;
  type: FinanceSummaryFilterType;
  categoryId: string;
  from: string;
  to: string;
}

export interface LedgerFilterBarProps {
  filters: LedgerFiltersState;
  wallets: WalletWithBalanceDto[];
  categories: CategoryDto[];
  cycle?: Pick<CycleWindowInfo, "startDate" | "endDate">;
  onFilterChange: (patch: Partial<LedgerFiltersState>) => void;
  onReset: () => void;
}

/**
 * Unified ledger filter bar supporting wallet, entry type (All/Income/Expense/Transfer), category, and date range (`F13`, `API-5`).
 */
export function LedgerFilterBar({
  filters,
  wallets,
  categories,
  cycle,
  onFilterChange,
  onReset,
}: LedgerFilterBarProps) {
  const { t } = useI18n();
  const isTransferOnly = filters.type === "transfer";
  const matchingCategories = isTransferOnly
    ? []
    : categories.filter(
        (cat) => filters.type === "all" || cat.type === filters.type,
      );

  return (
    <div className="flex flex-col gap-2">
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
          value={filters.walletId}
          onChange={(e) => onFilterChange({ walletId: e.target.value })}
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

      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-type"
          className="text-xs font-medium text-[var(--text-secondary)]"
        >
          {t.finance.transactionModal.typeLabel}
        </label>
        <select
          id="filter-type"
          value={filters.type}
          onChange={(e) =>
            onFilterChange({
              type: e.target.value as FinanceSummaryFilterType,
            })
          }
          className="min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
        >
          <option value="all">{t.finance.filters.allTypes}</option>
          <option value="expense">{t.finance.filters.expense}</option>
          <option value="income">{t.finance.filters.income}</option>
          <option value="transfer">{t.finance.filters.transfer}</option>
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
          value={isTransferOnly ? "" : filters.categoryId}
          disabled={isTransferOnly}
          onChange={(e) => onFilterChange({ categoryId: e.target.value })}
          className="min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">{t.finance.filters.allCategories}</option>
          {matchingCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Input
        label={t.finance.filters.fromDate}
        type="date"
        value={filters.from}
        onChange={(e) => onFilterChange({ from: e.target.value })}
      />

      <Input
        label={t.finance.filters.toDate}
        type="date"
        value={filters.to}
        onChange={(e) => onFilterChange({ to: e.target.value })}
      />

      <div className="flex items-end">
        <Button
          variant="ghost"
          size="sm"
          className="w-full sm:w-auto"
          onClick={onReset}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t.finance.filters.reset}</span>
        </Button>
      </div>
    </div>
    {cycle && (!filters.from || !filters.to) ? (
      <p
        data-testid="ledger-filter-cycle-hint"
        className="text-xs text-[var(--text-muted)]"
      >
        {t.finance.filters.cycleDefaultHint
          .replace("{start}", cycle.startDate)
          .replace("{end}", cycle.endDate)}
      </p>
    ) : null}
    </div>
  );
}

