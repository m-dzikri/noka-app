"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Filter,
  Plus,
  Scale,
  Search,
} from "lucide-react";
import type {
  CreateDebtInput,
  DebtReceivableDto,
  DebtsSummaryDto,
  UpdateDebtInput,
  CreateSettlementInput,
} from "@/features/finance/debt-schemas";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { useI18n } from "@/lib/i18n/context";
import { DebtCard } from "./DebtCard";
import { DebtFormModal } from "./DebtFormModal";
import { DebtHistoryModal } from "./DebtHistoryModal";
import { RecordSettlementModal } from "./RecordSettlementModal";

interface DebtsWorkspaceProps {
  initialSummary: DebtsSummaryDto;
  initialItems: DebtReceivableDto[];
  initialContacts: string[];
  wallets: WalletWithBalanceDto[];
}

export function DebtsWorkspace({
  initialSummary,
  initialItems,
  initialContacts,
  wallets,
}: DebtsWorkspaceProps) {
  const { t: dict } = useI18n();
  const t = dict.finance.debts;

  const [items, setItems] = useState<DebtReceivableDto[]>(initialItems);
  const [summary, setSummary] = useState<DebtsSummaryDto>(initialSummary);
  const [contacts, setContacts] = useState<string[]>(initialContacts);

  // Filters
  const [typeTab, setTypeTab] = useState<"all" | "receivable" | "debt">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "settled">("active");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [formDefaultType, setFormDefaultType] = useState<"debt" | "receivable">("debt");
  const [editingDebt, setEditingDebt] = useState<DebtReceivableDto | null>(null);

  const [settlementDebt, setSettlementDebt] = useState<DebtReceivableDto | null>(null);
  const [historyDebt, setHistoryDebt] = useState<DebtReceivableDto | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const reloadData = async () => {
    try {
      const res = await fetch("/api/finance/debts");
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setSummary(json.data.summary);
          setItems(json.data.items);
          if (json.data.contacts) setContacts(json.data.contacts);
        }
      }
    } catch {
      // Ignore background refresh failure.
    }
  };

  const handleCreate = async (input: CreateDebtInput) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/finance/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || "Gagal membuat catatan");
      }

      showToast(t.createSuccess);
      await reloadData();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (debtId: string, input: UpdateDebtInput) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/finance/debts/${debtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || "Gagal memperbarui catatan");
      }

      showToast(t.updateSuccess);
      await reloadData();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (debt: DebtReceivableDto) => {
    if (!window.confirm(t.deleteConfirmDescription)) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/finance/debts/${debt.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || "Gagal menghapus catatan");
      }

      showToast(t.deleteSuccess);
      await reloadData();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordSettlement = async (
    debtId: string,
    input: CreateSettlementInput,
  ) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/finance/debts/${debtId}/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || "Gagal mencatat pelunasan");
      }

      showToast(t.settleSuccess);
      await reloadData();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter items in memory
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (typeTab !== "all" && item.type !== typeTab) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.personName.toLowerCase().includes(q);
        const matchesNotes = item.notes?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesNotes) return false;
      }
      return true;
    });
  }, [items, typeTab, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-foreground text-background px-4 py-2.5 text-xs font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toastMessage}
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/app/finance"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t.backToFinance}</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t.pageTitle}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t.pageSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingDebt(null);
              setFormDefaultType("debt");
              setIsFormModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-border bg-card hover:bg-secondary text-foreground shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-rose-500" />
            <span>{t.newDebtCta}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingDebt(null);
              setFormDefaultType("receivable");
              setIsFormModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-white" />
            <span>{t.newReceivableCta}</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Receivables */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {t.totalReceivablesLabel}
            </span>
            <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div
            data-testid="summary-total-receivable"
            className="text-xl font-bold text-foreground"
          >
            <PrivacyAmount amount={summary.totalReceivable} signMode="plain" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {summary.activeReceivablesCount} piutang aktif
          </div>
        </div>

        {/* Total Debts */}
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span className="font-medium text-rose-600 dark:text-rose-400">
              {t.totalDebtsLabel}
            </span>
            <div className="w-7 h-7 rounded-full bg-rose-500/10 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
          </div>
          <div
            data-testid="summary-total-debt"
            className="text-xl font-bold text-foreground"
          >
            <PrivacyAmount amount={summary.totalDebt} signMode="plain" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {summary.activeDebtsCount} utang aktif
          </div>
        </div>

        {/* Net Position */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span className="font-medium">{t.netPositionLabel}</span>
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Scale className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div
            data-testid="summary-net-position"
            className={`text-xl font-bold ${
              summary.netPosition >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            <PrivacyAmount amount={summary.netPosition} signMode="signed" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {summary.netPosition >= 0 ? t.netAssetSurplus : t.netLiabilityDeficit}
          </div>
        </div>
      </div>

      {/* Filter and Tab Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Tabs: All / Receivables / Debts */}
        <div className="flex items-center p-1 rounded-xl bg-secondary/60 border border-border shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setTypeTab("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              typeTab === "all"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.tabAll}
          </button>
          <button
            type="button"
            onClick={() => setTypeTab("receivable")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              typeTab === "receivable"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.tabReceivables}
          </button>
          <button
            type="button"
            onClick={() => setTypeTab("debt")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              typeTab === "debt"
                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.tabDebts}
          </button>
        </div>

        {/* Right side: Status Dropdown & Search Bar */}
        <div className="flex items-center gap-2">
          {/* Status filter */}
          <div className="relative shrink-0">
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | "active" | "settled")
              }
              className="rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 appearance-none pr-7 font-medium"
            >
              <option value="active">{t.filterStatusActive}</option>
              <option value="settled">{t.filterStatusSettled}</option>
              <option value="all">{t.filterStatusAll}</option>
            </select>
            <Filter className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Search bar */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full rounded-xl border border-input bg-background pl-8 pr-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
      </div>

      {/* Grid of Debt Cards */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
            <Scale className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-sm text-foreground">
            {t.emptyTitle}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
            {t.emptyDescription}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setEditingDebt(null);
                setFormDefaultType("debt");
                setIsFormModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-medium border border-border bg-card hover:bg-secondary text-foreground"
            >
              {t.createFirstDebtCta}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingDebt(null);
                setFormDefaultType("receivable");
                setIsFormModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t.createFirstReceivableCta}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <DebtCard
              key={item.id}
              debt={item}
              onRecordSettlement={(d) => setSettlementDebt(d)}
              onViewHistory={(d) => setHistoryDebt(d)}
              onEdit={(d) => {
                setEditingDebt(d);
                setIsFormModalOpen(true);
              }}
              onDelete={handleDelete}
              isPending={isSubmitting}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <DebtFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingDebt(null);
        }}
        onSubmitCreate={handleCreate}
        onSubmitUpdate={handleUpdate}
        editingDebt={editingDebt}
        defaultType={formDefaultType}
        contacts={contacts}
        isSubmitting={isSubmitting}
      />

      <RecordSettlementModal
        isOpen={settlementDebt !== null}
        onClose={() => setSettlementDebt(null)}
        debt={settlementDebt}
        wallets={wallets}
        onSubmitSettlement={handleRecordSettlement}
        isSubmitting={isSubmitting}
      />

      <DebtHistoryModal
        isOpen={historyDebt !== null}
        onClose={() => setHistoryDebt(null)}
        debt={historyDebt}
      />
    </div>
  );
}
