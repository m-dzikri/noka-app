"use client";

import { CalendarRange, Info, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import type {
  CycleWindowInfo,
  SafeToSpendResult,
} from "@/features/finance/safe-to-spend";
import { useI18n } from "@/lib/i18n/context";

export interface SafeToSpendCardProps {
  safeToSpend: SafeToSpendResult;
  cycle: CycleWindowInfo;
}

function formatYmdForLocale(ymd: string, locale: "id" | "en"): string {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return ymd;
  }
  const [year, month, day] = parts;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Displays deterministic daily Safe-to-Spend allowance, cycle dates, included wallet balance, and helpful status hints (`F16`, `DATA-5`, `UI-4`).
 */
export function SafeToSpendCard({
  safeToSpend,
  cycle,
}: SafeToSpendCardProps) {
  const { locale, t } = useI18n();

  const startLabel = formatYmdForLocale(cycle.startDate, locale);
  const endLabel = formatYmdForLocale(cycle.endDate, locale);
  const remainingDaysText = t.finance.safeToSpend.remainingDaysLabel.replace(
    "{days}",
    String(safeToSpend.remainingDays),
  );
  const includedWalletsText = t.finance.safeToSpend.includedWalletsCount.replace(
    "{count}",
    String(safeToSpend.includedWalletCount),
  );

  const statusHint =
    safeToSpend.status === "no_included_wallets"
      ? t.finance.safeToSpend.noWalletsHint
      : safeToSpend.status === "non_positive_balance"
        ? t.finance.safeToSpend.nonPositiveHint
        : t.finance.safeToSpend.activeHint;

  return (
    <Card data-testid="safe-to-spend-card">
      <CardHeader className="mb-3 gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck
              className="h-4 w-4 text-[var(--accent-text)]"
              aria-hidden="true"
            />
            <CardTitle as="h2" className="text-lg">
              {t.finance.safeToSpend.title}
            </CardTitle>
          </div>
          <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {t.finance.safeToSpend.cycleRangeLabel}: {startLabel} – {endLabel}
            </span>
          </CardDescription>
        </div>

        <span
          data-testid="safe-to-spend-remaining-days"
          className="inline-flex w-fit shrink-0 items-center rounded-full bg-[var(--accent-primary)]/15 px-3 py-1 text-xs font-semibold text-[var(--accent-text)]"
        >
          {remainingDaysText}
        </span>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            data-testid="safe-to-spend-amount"
            className="text-3xl font-bold tracking-tight text-[var(--text-primary)]"
          >
            <PrivacyAmount amount={safeToSpend.safeToSpend} signMode="plain" />
          </span>
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {t.finance.safeToSpend.perDaySuffix}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
          <span>
            {t.finance.safeToSpend.includedBalanceLabel}:{" "}
            <strong className="font-semibold text-[var(--text-primary)]">
              <PrivacyAmount
                amount={safeToSpend.totalIncludedBalance}
                signMode="plain"
              />
            </strong>
          </span>
          <span>({includedWalletsText})</span>
        </div>

        <p
          data-testid="safe-to-spend-hint"
          className="flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 px-3 py-2 text-xs text-[var(--text-secondary)]"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{statusHint}</span>
        </p>
      </CardContent>
    </Card>
  );
}

