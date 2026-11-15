"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { ExportDatasetDto } from "@/features/finance/export/types";
import { formatIdr } from "@/features/finance/format";
import { useI18n } from "@/lib/i18n/context";

export interface FinanceReportClientViewProps {
  dataset: ExportDatasetDto;
}

export function FinanceReportClientView({ dataset }: FinanceReportClientViewProps) {
  const { t } = useI18n();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 print:p-0 print:max-w-none">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 1.5cm;
          }
          body {
            background: white !important;
            color: black !important;
          }
          .no-print,
          nav,
          header,
          footer,
          [data-noka-shell-header] {
            display: none !important;
          }
          .print-avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Action bar (hidden when printing) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Link href="/app/finance">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{t.finance.reportPage.backButton}</span>
            </Button>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.print();
              }
            }}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            <span>{t.finance.reportPage.printButton}</span>
          </Button>
        </div>
      </div>

      {/* Report Header */}
      <div className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-4 print:border-black/30">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] print:text-black">
          {t.finance.reportPage.pageTitle}
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--text-secondary)] print:text-gray-600">
          <span>
            {t.finance.reportPage.periodLabel}:{" "}
            <strong className="text-[var(--text-primary)] print:text-black">
              {dataset.startDateFormatted} s.d. {dataset.endDateFormatted}
            </strong>
          </span>
          <span>
            {t.finance.reportPage.generatedAtLabel}: {dataset.startDateFormatted}
          </span>
        </div>
      </div>

      {/* Executive Summary Cards */}
      <div className="print-avoid-break grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="print:border-black/20 print:bg-white print:shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] print:text-gray-600">
              {t.finance.reportPage.totalIncome}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[var(--status-income)] print:text-black">
              {formatIdr(dataset.totalIncome)}
            </div>
          </CardContent>
        </Card>

        <Card className="print:border-black/20 print:bg-white print:shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] print:text-gray-600">
              {t.finance.reportPage.totalExpense}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[var(--status-expense)] print:text-black">
              {formatIdr(dataset.totalExpense)}
            </div>
          </CardContent>
        </Card>

        <Card className="print:border-black/20 print:bg-white print:shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] print:text-gray-600">
              {t.finance.reportPage.netCashflow}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold print:text-black ${
                dataset.netCashflow >= 0
                  ? "text-[var(--status-income)]"
                  : "text-[var(--status-expense)]"
              }`}
            >
              {formatIdr(dataset.netCashflow)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] print:text-black">
          {t.finance.reportPage.transactionsTableTitle} ({dataset.rows.length})
        </h2>

        {dataset.rows.length === 0 ? (
          <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center text-sm text-[var(--text-secondary)] print:border-black/20 print:text-gray-600">
            {t.finance.reportPage.emptyNotice}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] print:border-black/30 print:bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-muted)]/50 print:border-black/30 print:bg-gray-100">
                  <th className="p-3 font-semibold text-[var(--text-secondary)] print:text-black">
                    {t.finance.reportPage.colDate}
                  </th>
                  <th className="p-3 font-semibold text-[var(--text-secondary)] print:text-black">
                    {t.finance.reportPage.colType}
                  </th>
                  <th className="p-3 font-semibold text-[var(--text-secondary)] print:text-black">
                    {t.finance.reportPage.colWallet}
                  </th>
                  <th className="p-3 font-semibold text-[var(--text-secondary)] print:text-black">
                    {t.finance.reportPage.colCategory}
                  </th>
                  <th className="p-3 text-right font-semibold text-[var(--text-secondary)] print:text-black">
                    {t.finance.reportPage.colAmount}
                  </th>
                  <th className="p-3 font-semibold text-[var(--text-secondary)] print:text-black">
                    {t.finance.reportPage.colNote}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] print:divide-black/20">
                {dataset.rows.map((row) => {
                  const isIncome = row.type === "income";
                  const isExpense = row.type === "expense";
                  return (
                    <tr
                      key={row.id}
                      className="print-avoid-break transition-colors hover:bg-[var(--bg-muted)]/30 print:hover:bg-transparent"
                    >
                      <td className="whitespace-nowrap p-3 font-mono text-xs text-[var(--text-secondary)] print:text-black">
                        {row.occurredAtFormatted}
                      </td>
                      <td className="whitespace-nowrap p-3 text-xs">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 font-medium print:border print:border-black/30 print:bg-white print:text-black ${
                            isIncome
                              ? "bg-[var(--status-income)]/10 text-[var(--status-income)]"
                              : isExpense
                                ? "bg-[var(--status-expense)]/10 text-[var(--status-expense)]"
                                : "bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-fg)]"
                          }`}
                        >
                          {row.typeLabel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap p-3 font-medium text-[var(--text-primary)] print:text-black">
                        {row.walletName}
                      </td>
                      <td className="whitespace-nowrap p-3 text-[var(--text-secondary)] print:text-black">
                        {row.categoryName}
                      </td>
                      <td
                        className={`whitespace-nowrap p-3 text-right font-semibold print:text-black ${
                          isIncome
                            ? "text-[var(--status-income)]"
                            : isExpense
                              ? "text-[var(--status-expense)]"
                              : "text-[var(--text-primary)]"
                        }`}
                      >
                        {formatIdr(row.amount)}
                      </td>
                      <td className="max-w-xs truncate p-3 text-xs text-[var(--text-secondary)] print:text-black">
                        {row.notes || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 border-t border-[var(--border-subtle)] pt-4 text-center text-xs text-[var(--text-secondary)] print:border-black/30 print:text-gray-500">
        {t.finance.reportPage.footerNotice}
      </div>
    </div>
  );
}
