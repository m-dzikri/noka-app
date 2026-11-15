"use client";

import { useId, useState } from "react";
import { Download, ExternalLink, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type { ExportFormat } from "@/features/finance/export/types";
import { useI18n } from "@/lib/i18n/context";

export type ExportPeriodOption = "current_cycle" | "last_month" | "custom";

export interface ExportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallets: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  cycle: { startDate: string; endDate: string };
}

function computeLastMonthBounds(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed: current month
  // Last month is month - 1
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0); // 0th day of current month = last day of prev month

  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-01`;
  const end = `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`;

  return { start, end };
}

export function ExportDataModal({
  isOpen,
  onClose,
  wallets,
  categories,
  cycle,
}: ExportDataModalProps) {
  const { t } = useI18n();

  const [format, setFormat] = useState<ExportFormat>("csv");
  const [periodOption, setPeriodOption] = useState<ExportPeriodOption>("current_cycle");
  const [customStartDate, setCustomStartDate] = useState(cycle.startDate.slice(0, 10));
  const [customEndDate, setCustomEndDate] = useState(cycle.endDate.slice(0, 10));
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formatGroupId = useId();
  const periodGroupId = useId();

  function resolveEffectiveDates(): { start?: string; end?: string; error?: string } {
    if (periodOption === "current_cycle") {
      return { start: cycle.startDate, end: cycle.endDate };
    }
    if (periodOption === "last_month") {
      const bounds = computeLastMonthBounds();
      return { start: bounds.start, end: bounds.end };
    }
    if (periodOption === "custom") {
      if (!customStartDate || !customEndDate) {
        return { error: t.finance.exportModal.invalidDateRangeError };
      }
      if (customStartDate > customEndDate) {
        return { error: t.finance.exportModal.invalidDateRangeError };
      }
      return { start: customStartDate, end: customEndDate };
    }
    return {};
  }

  function buildExportUrl(targetFormat: ExportFormat): string | null {
    const dates = resolveEffectiveDates();
    if (dates.error) {
      setErrorMessage(dates.error);
      return null;
    }

    const params = new URLSearchParams();
    params.set("format", targetFormat);

    if (dates.start) params.set("startDate", dates.start);
    if (dates.end) params.set("endDate", dates.end);
    if (selectedWalletId) params.set("walletId", selectedWalletId);
    if (selectedCategoryId) params.set("categoryId", selectedCategoryId);

    const tzOffset = -new Date().getTimezoneOffset();
    params.set("tzOffset", String(tzOffset));

    return `/api/finance/export?${params.toString()}`;
  }

  function buildReportWebUrl(): string | null {
    const dates = resolveEffectiveDates();
    if (dates.error) {
      setErrorMessage(dates.error);
      return null;
    }

    const params = new URLSearchParams();
    if (dates.start) params.set("startDate", dates.start);
    if (dates.end) params.set("endDate", dates.end);
    if (selectedWalletId) params.set("walletId", selectedWalletId);
    if (selectedCategoryId) params.set("categoryId", selectedCategoryId);

    const tzOffset = -new Date().getTimezoneOffset();
    params.set("tzOffset", String(tzOffset));

    return `/app/finance/report?${params.toString()}`;
  }

  async function handleDownload(): Promise<void> {
    setErrorMessage(null);
    const url = buildExportUrl(format);
    if (!url) return;

    setIsLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        throw new Error(errorJson?.error?.message || t.finance.exportModal.errorMessage);
      }

      const contentDisposition = res.headers.get("content-disposition");
      let filename = `noka-export.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";]+)"?/);
        if (match?.[1]) {
          filename = match[1];
        }
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t.finance.exportModal.errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenReport(): void {
    setErrorMessage(null);
    const url = buildReportWebUrl();
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <Modal
      open={isOpen}
      onClose={() => {
        if (!isLoading) onClose();
      }}
      title={t.finance.exportModal.title}
      description={t.finance.exportModal.description}
    >
      <div className="flex flex-col gap-5 py-2">
        {errorMessage ? (
          <p
            role="alert"
            className="rounded-xl border border-[var(--status-expense)]/30 bg-[var(--status-expense)]/10 px-3 py-2 text-sm text-[var(--status-expense)]"
          >
            {errorMessage}
          </p>
        ) : null}

        {/* Format Selection */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-[var(--text-primary)]">
            {t.finance.exportModal.formatLabel}
          </label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-labelledby={formatGroupId}>
            {/* CSV */}
            <label
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors ${
                format === "csv"
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 ring-1 ring-[var(--brand-primary)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)]/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="exportFormat"
                  value="csv"
                  checked={format === "csv"}
                  onChange={() => setFormat("csv")}
                  className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                />
                <FileText className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {t.finance.exportModal.formatCsv}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] pl-6">
                {t.finance.exportModal.formatCsvDesc}
              </p>
            </label>

            {/* XLSX */}
            <label
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors ${
                format === "xlsx"
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 ring-1 ring-[var(--brand-primary)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)]/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="exportFormat"
                  value="xlsx"
                  checked={format === "xlsx"}
                  onChange={() => setFormat("xlsx")}
                  className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                />
                <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {t.finance.exportModal.formatXlsx}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] pl-6">
                {t.finance.exportModal.formatXlsxDesc}
              </p>
            </label>

            {/* PDF */}
            <label
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors ${
                format === "pdf"
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 ring-1 ring-[var(--brand-primary)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)]/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="exportFormat"
                  value="pdf"
                  checked={format === "pdf"}
                  onChange={() => setFormat("pdf")}
                  className="h-4 w-4 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                />
                <Printer className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {t.finance.exportModal.formatPdf}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] pl-6">
                {t.finance.exportModal.formatPdfDesc}
              </p>
            </label>
          </div>
        </div>

        {/* Period Selection */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-[var(--text-primary)]">
            {t.finance.exportModal.periodLabel}
          </label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={periodGroupId}>
            <button
              type="button"
              onClick={() => setPeriodOption("current_cycle")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                periodOption === "current_cycle"
                  ? "bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]"
                  : "bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]/80"
              }`}
            >
              {t.finance.exportModal.periodCurrentCycle}
            </button>
            <button
              type="button"
              onClick={() => setPeriodOption("last_month")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                periodOption === "last_month"
                  ? "bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]"
                  : "bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]/80"
              }`}
            >
              {t.finance.exportModal.periodLastMonth}
            </button>
            <button
              type="button"
              onClick={() => setPeriodOption("custom")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                periodOption === "custom"
                  ? "bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]"
                  : "bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]/80"
              }`}
            >
              {t.finance.exportModal.periodCustom}
            </button>
          </div>

          {periodOption === "custom" ? (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-secondary)]">
                  {t.finance.exportModal.startDateLabel}
                </label>
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-secondary)]">
                  {t.finance.exportModal.endDateLabel}
                </label>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Optional Filters */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--text-secondary)]">
              {t.finance.exportModal.walletFilterLabel}
            </label>
            <select
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
              className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            >
              <option value="">{t.finance.exportModal.allWalletsOption}</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--text-secondary)]">
              {t.finance.exportModal.categoryFilterLabel}
            </label>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            >
              <option value="">{t.finance.exportModal.allCategoriesOption}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {t.finance.exportModal.closeButton}
          </Button>

          {format === "pdf" ? (
            <Button variant="secondary" onClick={handleOpenReport} disabled={isLoading}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              <span>{t.finance.exportModal.openReportButton}</span>
            </Button>
          ) : null}

          <Button onClick={handleDownload} disabled={isLoading}>
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>
              {isLoading
                ? t.finance.exportModal.downloadingButton
                : t.finance.exportModal.downloadButton}
            </span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
