"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, SlidersHorizontal, Target } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import type {
  BudgetThresholdStatus,
  CategoryBudgetDto,
  CategoryBudgetSummaryDto,
} from "@/features/finance/budgets-schemas";
import { useI18n } from "@/lib/i18n/context";

export interface CategoryBudgetSectionProps {
  summary: CategoryBudgetSummaryDto | null;
  loading?: boolean;
  onManageBudgets: () => void;
}

function getStatusBadge(status: BudgetThresholdStatus, t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "exceeded":
      return {
        label: t.finance.budgets.exceededStatus,
        colorClass: "bg-[var(--status-expense)]/15 text-[var(--status-expense)] border-[var(--status-expense)]/30",
        barClass: "bg-[var(--status-expense)]",
        icon: <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />,
      };
    case "warning":
      return {
        label: t.finance.budgets.warningStatus,
        colorClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
        barClass: "bg-amber-500",
        icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
      };
    case "normal":
    default:
      return {
        label: t.finance.budgets.normalStatus,
        colorClass: "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border-[var(--accent-primary)]/30",
        barClass: "bg-[var(--accent-primary)]",
        icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
      };
  }
}

export function CategoryBudgetSection({
  summary,
  loading = false,
  onManageBudgets,
}: CategoryBudgetSectionProps) {
  const { t } = useI18n();

  const hasBudgets =
    Boolean(summary && Array.isArray(summary.items) && summary.items.length > 0);
  const overallPercentage =
    summary && summary.totalBudgeted > 0
      ? Math.floor((summary.totalSpent * 100) / summary.totalBudgeted)
      : 0;

  return (
    <Card className="overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 border-b border-[var(--border-subtle)]/60 pb-4">
        <div>
          <CardTitle as="h2" className="flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
            <Target className="h-5 w-5 text-[var(--accent-primary)]" aria-hidden="true" />
            <span>{t.finance.budgets.sectionTitle}</span>
          </CardTitle>
          <CardDescription className="mt-1 text-sm text-[var(--text-muted)]">
            {t.finance.budgets.sectionSubtitle}
            {summary?.cycle ? (
              <span className="ml-1 font-medium text-[var(--text-secondary)]">
                ({summary.cycle.startDate} – {summary.cycle.endDate})
              </span>
            ) : null}
          </CardDescription>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={onManageBudgets}
          className="gap-1.5"
          data-testid="manage-budgets-button"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          <span>{t.finance.budgets.manageBudgetsButton}</span>
        </Button>
      </CardHeader>

      <CardContent className="pt-5">
        {loading && !summary ? (
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">
            Memuat anggaran kategori...
          </div>
        ) : !summary || !hasBudgets ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-muted)] text-[var(--text-muted)]">
              <Target className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-[var(--text-primary)]">
              {t.finance.budgets.noBudgetsTitle}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
              {t.finance.budgets.noBudgetsDescription}
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={onManageBudgets}
              className="mt-4"
              data-testid="create-first-budget-cta"
            >
              {t.finance.budgets.createFirstBudgetCta}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top Total Progress Bar */}
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                <span className="text-[var(--text-secondary)]">
                  {t.finance.budgets.totalSpentLabel}:{" "}
                  <strong className="text-[var(--text-primary)]">
                    <PrivacyAmount amount={summary.totalSpent} signMode="plain" />
                  </strong>{" "}
                  {t.finance.budgets.spentOfTotal}{" "}
                  <strong className="text-[var(--text-primary)]">
                    <PrivacyAmount amount={summary.totalBudgeted} signMode="plain" />
                  </strong>
                </span>
                <span
                  className={
                    overallPercentage >= 100
                      ? "font-bold text-[var(--status-expense)]"
                      : overallPercentage >= 80
                        ? "font-bold text-amber-600 dark:text-amber-400"
                        : "font-bold text-[var(--accent-primary)]"
                  }
                >
                  {overallPercentage}%
                </span>
              </div>

              <div
                className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]"
                role="progressbar"
                aria-valuenow={overallPercentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t.finance.budgets.sectionTitle}
              >
                <div
                  className={`h-full transition-all duration-300 ease-out ${
                    overallPercentage >= 100
                      ? "bg-[var(--status-expense)]"
                      : overallPercentage >= 80
                        ? "bg-amber-500"
                        : "bg-[var(--accent-primary)]"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, overallPercentage))}%` }}
                />
              </div>
            </div>

            {/* Category Budget Items */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(summary.items ?? []).map((budget: CategoryBudgetDto) => {
                const badge = getStatusBadge(budget.status, t);
                const isOverbudget = budget.remainingAmount < 0;

                return (
                  <div
                    key={budget.id}
                    data-testid={`budget-card-${budget.categoryId}`}
                    className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-2xs transition-shadow hover:shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-[var(--text-primary)]">
                          {budget.categoryName}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.colorClass}`}
                          data-testid={`budget-status-${budget.status}`}
                        >
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div
                          className="h-2 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]"
                          role="progressbar"
                          aria-valuenow={budget.percentage}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${budget.categoryName} budget progress`}
                        >
                          <div
                            className={`h-full transition-all duration-300 ease-out ${badge.barClass}`}
                            style={{ width: `${Math.min(100, Math.max(0, budget.percentage))}%` }}
                          />
                        </div>
                      </div>

                      {/* Spend details */}
                      <div className="mt-2.5 flex items-center justify-between text-xs text-[var(--text-muted)]">
                        <span>
                          <strong className="text-[var(--text-primary)]">
                            <PrivacyAmount amount={budget.spentAmount} signMode="plain" />
                          </strong>{" "}
                          / <PrivacyAmount amount={budget.amount} signMode="plain" />
                        </span>
                        <span className="font-bold text-[var(--text-secondary)]">
                          {budget.percentage}%
                        </span>
                      </div>
                    </div>

                    {/* Sisa / Kelebihan */}
                    <div className="mt-3 border-t border-[var(--border-subtle)]/50 pt-2 text-xs">
                      {isOverbudget ? (
                        <span className="font-semibold text-[var(--status-expense)]">
                          {t.finance.budgets.overbudgetLabel}: +
                          <PrivacyAmount
                            amount={Math.abs(budget.remainingAmount)}
                            signMode="plain"
                          />
                        </span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">
                          {t.finance.budgets.remainingLabel}:{" "}
                          <strong className="text-[var(--text-primary)]">
                            <PrivacyAmount amount={budget.remainingAmount} signMode="plain" />
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
