"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type {
  CreateDebtInput,
  DebtReceivableDto,
  UpdateDebtInput,
} from "@/features/finance/debt-schemas";
import { useI18n } from "@/lib/i18n/context";

interface DebtFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitCreate: (input: CreateDebtInput) => Promise<void>;
  onSubmitUpdate: (debtId: string, input: UpdateDebtInput) => Promise<void>;
  editingDebt: DebtReceivableDto | null;
  defaultType?: "debt" | "receivable";
  contacts?: string[];
  isSubmitting?: boolean;
}

function DebtFormBody({
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
  editingDebt,
  defaultType = "debt",
  contacts = [],
  isSubmitting = false,
}: Omit<DebtFormModalProps, "isOpen">) {
  const { t: dict } = useI18n();
  const t = dict.finance.debts;

  const [type, setType] = useState<"debt" | "receivable">(
    editingDebt?.type ?? defaultType,
  );
  const [personName, setPersonName] = useState(editingDebt?.personName ?? "");
  const [amountStr, setAmountStr] = useState(
    editingDebt ? editingDebt.totalAmount.toString() : "",
  );
  const [dueDateStr, setDueDateStr] = useState(
    editingDebt?.dueDate ? editingDebt.dueDate.split("T")[0] : "",
  );
  const [notes, setNotes] = useState(editingDebt?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = personName.trim();
    if (!trimmedName) {
      setError(t.personNameLabel + " wajib diisi");
      return;
    }

    try {
      if (editingDebt) {
        await onSubmitUpdate(editingDebt.id, {
          personName: trimmedName,
          dueDate: dueDateStr ? `${dueDateStr}T00:00:00.000Z` : null,
          notes: notes.trim() || null,
        });
      } else {
        const parsedAmount = parseInt(amountStr, 10);
        if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
          setError("Nominal harus berupa angka bulat positif");
          return;
        }

        await onSubmitCreate({
          type,
          personName: trimmedName,
          totalAmount: parsedAmount,
          dueDate: dueDateStr ? `${dueDateStr}T00:00:00.000Z` : null,
          notes: notes.trim() || null,
        });
      }
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
              {editingDebt ? t.modalTitleEdit : t.modalTitleNew}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t.modalDescription}
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

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Commitment Type Selector (only on create) */}
          {!editingDebt && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                {t.typeLabel}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType("debt")}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                    type === "debt"
                      ? "bg-rose-500/15 border-rose-500 text-rose-600 dark:text-rose-400 font-semibold"
                      : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {t.typeDebtLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setType("receivable")}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                    type === "receivable"
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold"
                      : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {t.typeReceivableLabel}
                </button>
              </div>
            </div>
          )}

          {/* Counterparty Name with Autocomplete */}
          <div>
            <label
              htmlFor="personName"
              className="block text-xs font-medium text-foreground mb-1.5"
            >
              {t.personNameLabel}
            </label>
            <input
              id="personName"
              type="text"
              list="contact-names-list"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder={t.personNamePlaceholder}
              required
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
            <datalist id="contact-names-list">
              {contacts.map((contact) => (
                <option key={contact} value={contact} />
              ))}
            </datalist>
            <p className="text-[11px] text-muted-foreground mt-1">
              {t.personNameHint}
            </p>
          </div>

          {/* Principal Amount (only on create) */}
          {!editingDebt && (
            <div>
              <label
                htmlFor="amount"
                className="block text-xs font-medium text-foreground mb-1.5"
              >
                {t.amountLabel}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-semibold text-muted-foreground">
                  Rp
                </span>
                <input
                  id="amount"
                  type="number"
                  min="1"
                  step="1"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder={t.amountPlaceholder}
                  required
                  className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 font-mono"
                />
              </div>
            </div>
          )}

          {/* Due Date (Optional) */}
          <div>
            <label
              htmlFor="dueDate"
              className="block text-xs font-medium text-foreground mb-1.5"
            >
              {t.dueDateLabel}
            </label>
            <input
              id="dueDate"
              type="date"
              value={dueDateStr}
              onChange={(e) => setDueDateStr(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {t.dueDateOptional}
            </p>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="notes"
              className="block text-xs font-medium text-foreground mb-1.5"
            >
              {t.notesLabel}
            </label>
            <textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.notesPlaceholder}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          {/* Buttons */}
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
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
            >
              {isSubmitting ? t.savingButton : t.saveButton}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DebtFormModal(props: DebtFormModalProps) {
  if (!props.isOpen) return null;
  return (
    <DebtFormBody
      key={props.editingDebt ? props.editingDebt.id : `new-${props.defaultType}`}
      {...props}
    />
  );
}
