"use client";

import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import type {
  CategoryBreakdownItem,
  FinanceCashflowSummary,
} from "@/features/finance/summary-service";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/context";

export interface CashflowSummaryCardsProps {
  cashflow: FinanceCashflowSummary;
  categoryBreakdown: CategoryBreakdownItem[];
}

/**
 * Renders filtered cycle cashflow metrics (Income, Expense, Net) and per-category breakdown without transfer contamination (`F13`, `DATA-3`, `UI-4`).
 */
export function CashflowSummaryCards({
  cashflow,
  categoryBreakdown,
}: CashflowSummaryCardsProps) {
  const { t } = useI18n();

  return (
    <section
      aria-labelledby="cashflow-summary-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="cashflow-summary-heading"
          className="text-base font-semibold text-[var(--text-primary)]"
        >
          {t.finance.summary.sectionTitle}
        </h2>
        <p className="text-xs text-[var(--text-secondary)]">
          {t.finance.summary.excludedTransferNote}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--text-secondary)]">
            <span>{t.finance.summary.totalIncome}</span>
            <ArrowDownLeft
              className="h-4 w-4 text-[var(--status-income)]"
              aria-hidden="true"
            />
          </div>
          <p
            data-testid="cashflow-total-income"
            className="mt-2 text-xl font-bold text-[var(--status-income)]"
          >
            <PrivacyAmount amount={cashflow.totalIncome} type="income" />
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--text-secondary)]">
            <span>{t.finance.summary.totalExpense}</span>
            <ArrowUpRight
              className="h-4 w-4 text-[var(--status-expense)]"
              aria-hidden="true"
            />
          </div>
          <p
            data-testid="cashflow-total-expense"
            className="mt-2 text-xl font-bold text-[var(--status-expense)]"
          >
            <PrivacyAmount amount={cashflow.totalExpense} type="expense" />
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--text-secondary)]">
            <span>{t.finance.summary.netCashflow}</span>
            <Scale
              className="h-4 w-4 text-[var(--text-secondary)]"
              aria-hidden="true"
            />
          </div>
          <p
            data-testid="cashflow-net"
            className={cn(
              "mt-2 text-xl font-bold",
              cashflow.net >= 0
                ? "text-[var(--status-income)]"
                : "text-[var(--status-expense)]",
            )}
          >
            <PrivacyAmount amount={cashflow.net} signMode="signed" />
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader className="mb-3">
          <CardTitle as="h3" className="text-base">
            {t.finance.summary.categoryBreakdownTitle}
          </CardTitle>
          <CardDescription>
            {t.finance.summary.excludedTransferNote}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categoryBreakdown.length === 0 ? (
            <p className="py-3 text-sm text-[var(--text-secondary)]">
              {t.finance.summary.emptyBreakdown}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {categoryBreakdown.map((item) => {
                const clampedPct = Math.min(100, Math.max(0, item.percentage));
                const isIncome = item.type === "income";
                return (
                  <li
                    key={`${item.categoryId}-${item.type}`}
                    className="flex flex-col gap-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-[var(--text-primary)]">
                          {item.categoryName}
                        </span>
                        <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                          {isIncome
                            ? t.finance.filters.income
                            : t.finance.filters.expense}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 tabular-nums">
                        <span className="font-semibold text-[var(--text-primary)]">
                          <PrivacyAmount amount={item.total} signMode="plain" />
                        </span>
                        <span className="text-xs text-[var(--text-secondary)]">
                          ({clampedPct}%)
                        </span>
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]"
                    >
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width]",
                          isIncome
                            ? "bg-[var(--status-income)]"
                            : "bg-[var(--accent-primary)]",
                        )}
                        style={{ width: `${clampedPct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

