"use client";

import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  Calendar,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import {
  dispatchFinanceUpdated,
  readJsonSafe,
  resolveFinanceErrorMessage,
  type ApiErrorPayload,
} from "@/components/finance/finance-client-helpers";
import { useOptionalSync } from "@/components/providers/SyncProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import type {
  RecurringFrequency,
  RecurringTemplateDto,
  RecurringType,
} from "@/features/finance/recurring-schemas";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import {
  executeOfflineCapableMutation,
  isLikelyNetworkError,
} from "@/features/sync/client-api";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";

export interface RecurringTemplateModalProps {
  open: boolean;
  onClose: () => void;
  templates: RecurringTemplateDto[];
  wallets: WalletWithBalanceDto[];
  categories: CategoryDto[];
  onMutated: () => Promise<void> | void;
}

function RecurringModalBody({
  templates,
  wallets,
  categories,
  onClose,
  onMutated,
}: Omit<RecurringTemplateModalProps, "open">) {
  const { t } = useI18n();
  const sync = useOptionalSync();

  const activeWallets = wallets.filter((w) => w.archivedAt === null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<RecurringType>("expense");
  const [walletId, setWalletId] = useState<string>(activeWallets[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState<string>("");
  const [amountStr, setAmountStr] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [intervalStep, setIntervalStep] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(new Date().getDate());
  const [dayOfWeek, setDayOfWeek] = useState<number>(new Date().getDay());
  const [startDateStr, setStartDateStr] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [endDateStr, setEndDateStr] = useState<string>("");
  const [autoApply, setAutoApply] = useState<boolean>(false);

  const [saving, setSaving] = useState(false);
  const [busyToggleId, setBusyToggleId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const availableCategories = categories.filter((c) => c.type === type);

  // Set default category on type change if none selected or mismatched
  const currentCategory = availableCategories.find((c) => c.id === categoryId);
  const selectedCatId = currentCategory?.id ?? availableCategories[0]?.id ?? "";

  function resetForm() {
    setEditingId(null);
    setType("expense");
    setWalletId(activeWallets[0]?.id ?? "");
    setCategoryId("");
    setAmountStr("");
    setDescription("");
    setFrequency("monthly");
    setIntervalStep(1);
    setDayOfMonth(new Date().getDate());
    setDayOfWeek(new Date().getDay());
    setStartDateStr(new Date().toISOString().slice(0, 10));
    setEndDateStr("");
    setAutoApply(false);
    setErrorMsg(null);
  }

  function handleStartEdit(item: RecurringTemplateDto) {
    setEditingId(item.id);
    setType(item.type);
    setWalletId(item.walletId);
    setCategoryId(item.categoryId);
    setAmountStr(String(item.amount));
    setDescription(item.description);
    setFrequency(item.frequency);
    setIntervalStep(item.intervalStep);
    setDayOfMonth(item.dayOfMonth ?? new Date(item.nextRunAt).getDate());
    setDayOfWeek(item.dayOfWeek ?? new Date(item.nextRunAt).getDay());
    setStartDateStr(item.startDate.slice(0, 10));
    setEndDateStr(item.endDate ? item.endDate.slice(0, 10) : "");
    setAutoApply(item.autoApply);
    setErrorMsg(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!walletId) {
      setErrorMsg(t.finance.recurring.selectWalletPlaceholder);
      return;
    }
    if (!selectedCatId) {
      setErrorMsg(t.finance.recurring.selectCategoryPlaceholder);
      return;
    }

    const cleanNum = Number(amountStr.replace(/\D/g, ""));
    if (!Number.isSafeInteger(cleanNum) || cleanNum <= 0) {
      setErrorMsg(t.finance.recurring.invalidAmountError);
      return;
    }

    if (!description.trim()) {
      setErrorMsg(t.finance.recurring.descriptionPlaceholder);
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const payload = {
      walletId,
      categoryId: selectedCatId,
      type,
      amount: cleanNum,
      description: description.trim(),
      frequency,
      intervalStep: Math.max(1, intervalStep),
      dayOfMonth: frequency === "monthly" ? dayOfMonth : null,
      dayOfWeek: frequency === "weekly" ? dayOfWeek : null,
      startDate: new Date(startDateStr).toISOString(),
      endDate: endDateStr ? new Date(endDateStr).toISOString() : null,
      autoApply,
    };

    const isEdit = Boolean(editingId);
    const syncMutationContext = sync
      ? {
          userId: sync.userId,
          isOnline: sync.isOnline,
          storageAvailable: sync.storageAvailable,
          onMirrorChanged: () => void sync.reloadMirror(),
        }
      : null;

    try {
      if (isEdit && editingId) {
        const res = await apiFetch(`/api/finance/recurring/${editingId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = (await readJsonSafe(res)) as ApiErrorPayload | null;
          setErrorMsg(resolveFinanceErrorMessage(t, err));
          return;
        }
      } else {
        const optimisticId = crypto.randomUUID();
        const optimisticTemplate: RecurringTemplateDto = {
          id: optimisticId,
          userId: sync?.userId ?? "user",
          walletId,
          walletName: activeWallets.find((w) => w.id === walletId)?.name ?? "Dompet",
          categoryId: selectedCatId,
          categoryName:
            availableCategories.find((c) => c.id === selectedCatId)?.name ??
            "Kategori",
          type,
          amount: cleanNum,
          description: description.trim(),
          frequency,
          intervalStep: Math.max(1, intervalStep),
          dayOfMonth: frequency === "monthly" ? dayOfMonth : null,
          dayOfWeek: frequency === "weekly" ? dayOfWeek : null,
          startDate: new Date(startDateStr).toISOString(),
          endDate: endDateStr ? new Date(endDateStr).toISOString() : null,
          autoApply,
          nextRunAt: new Date(startDateStr).toISOString(),
          lastRunAt: null,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const outcome = await executeOfflineCapableMutation<{
          template: RecurringTemplateDto;
        }>(syncMutationContext, {
          entity: "recurring",
          entityId: optimisticId,
          op: "upsert",
          method: "POST",
          path: "/api/finance/recurring",
          body: payload,
          optimisticSnapshot: {
            kind: "recurring_upsert",
            template: optimisticTemplate,
          },
        });

        if (outcome.mode === "online" && outcome.response && !outcome.response.ok) {
          const err = (await readJsonSafe(outcome.response)) as ApiErrorPayload | null;
          setErrorMsg(resolveFinanceErrorMessage(t, err));
          return;
        }
      }

      resetForm();
      dispatchFinanceUpdated();
      await onMutated();
    } catch (err) {
      if (!isLikelyNetworkError(err)) {
        setErrorMsg(err instanceof Error ? err.message : t.errors.generic);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(item: RecurringTemplateDto) {
    setBusyToggleId(item.id);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/finance/recurring/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (!res.ok) {
        const err = (await readJsonSafe(res)) as ApiErrorPayload | null;
        setErrorMsg(resolveFinanceErrorMessage(t, err));
        return;
      }
      dispatchFinanceUpdated();
      await onMutated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.errors.generic);
    } finally {
      setBusyToggleId(null);
    }
  }

  async function handleDelete(templateId: string) {
    setBusyDeleteId(templateId);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/finance/recurring/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = (await readJsonSafe(res)) as ApiErrorPayload | null;
        setErrorMsg(resolveFinanceErrorMessage(t, err));
        return;
      }
      setConfirmDeleteId(null);
      if (editingId === templateId) {
        resetForm();
      }
      dispatchFinanceUpdated();
      await onMutated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.errors.generic);
    } finally {
      setBusyDeleteId(null);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--text-muted)]">
        {t.finance.recurring.modalDescription}
      </p>

      {errorMsg ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-[var(--status-expense)]/40 bg-[var(--bg-muted)]/30 px-3 py-2 text-xs text-[var(--status-expense)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      ) : null}

      {/* Form: Create or Edit */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-4"
        data-testid="recurring-template-form"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)]/40 pb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
            {editingId
              ? t.finance.recurring.editTemplateTitle
              : t.finance.recurring.newTemplateTitle}
          </h4>
          {editingId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetForm}
              className="h-6 text-xs"
            >
              {t.finance.recurring.cancelButton}
            </Button>
          ) : null}
        </div>

        {/* Type & Amount */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              {t.finance.recurring.typeLabel}
            </label>
            <div className="mt-1 flex rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5">
              <button
                type="button"
                onClick={() => setType("expense")}
                className={`flex-1 rounded-lg py-1 text-xs font-semibold transition-all ${
                  type === "expense"
                    ? "bg-[var(--status-expense)] text-white shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t.finance.recurring.expenseType}
              </button>
              <button
                type="button"
                onClick={() => setType("income")}
                className={`flex-1 rounded-lg py-1 text-xs font-semibold transition-all ${
                  type === "income"
                    ? "bg-[var(--status-income)] text-white shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t.finance.recurring.incomeType}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="recurring-amount-input"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.finance.recurring.amountLabel}
            </label>
            <Input
              id="recurring-amount-input"
              type="text"
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder={t.finance.recurring.amountPlaceholder}
              className="mt-1 h-9 text-xs"
              required
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="recurring-desc-input"
            className="block text-xs font-medium text-[var(--text-secondary)]"
          >
            {t.finance.recurring.descriptionLabel}
          </label>
          <Input
            id="recurring-desc-input"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.finance.recurring.descriptionPlaceholder}
            className="mt-1 h-9 text-xs"
            required
          />
        </div>

        {/* Wallet & Category */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="recurring-wallet-select"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.finance.recurring.walletLabel}
            </label>
            <select
              id="recurring-wallet-select"
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-hidden"
              required
            >
              {activeWallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="recurring-cat-select"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.finance.recurring.categoryLabel}
            </label>
            <select
              id="recurring-cat-select"
              value={selectedCatId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-hidden"
              required
            >
              {availableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Frequency & Details */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label
              htmlFor="recurring-freq-select"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.finance.recurring.frequencyLabel}
            </label>
            <select
              id="recurring-freq-select"
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as RecurringFrequency)
              }
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-hidden"
            >
              <option value="daily">{t.finance.recurring.dailyFrequency}</option>
              <option value="weekly">{t.finance.recurring.weeklyFrequency}</option>
              <option value="monthly">{t.finance.recurring.monthlyFrequency}</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="recurring-interval-input"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.finance.recurring.intervalStepLabel}
            </label>
            <Input
              id="recurring-interval-input"
              type="number"
              min={1}
              value={intervalStep}
              onChange={(e) => setIntervalStep(Number(e.target.value) || 1)}
              className="mt-1 h-9 text-xs"
              required
            />
          </div>

          {frequency === "monthly" ? (
            <div>
              <label
                htmlFor="recurring-day-input"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                {t.finance.recurring.dayOfMonthLabel}
              </label>
              <Input
                id="recurring-day-input"
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value) || 1)}
                className="mt-1 h-9 text-xs"
              />
            </div>
          ) : frequency === "weekly" ? (
            <div>
              <label
                htmlFor="recurring-dow-select"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                {t.finance.recurring.dayOfWeekLabel}
              </label>
              <select
                id="recurring-dow-select"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-hidden"
              >
                <option value={0}>Minggu / Sunday</option>
                <option value={1}>Senin / Monday</option>
                <option value={2}>Selasa / Tuesday</option>
                <option value={3}>Rabu / Wednesday</option>
                <option value={4}>Kamis / Thursday</option>
                <option value={5}>Jumat / Friday</option>
                <option value={6}>Sabtu / Saturday</option>
              </select>
            </div>
          ) : (
            <div />
          )}
        </div>

        {/* Start Date & End Date */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="recurring-start-date"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.finance.recurring.startDateLabel}
            </label>
            <Input
              id="recurring-start-date"
              type="date"
              value={startDateStr}
              onChange={(e) => setStartDateStr(e.target.value)}
              className="mt-1 h-9 text-xs"
              required
            />
          </div>

          <div>
            <label
              htmlFor="recurring-end-date"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.finance.recurring.endDateLabel}{" "}
              <span className="text-[var(--text-muted)]">
                ({t.finance.recurring.endDateOptional})
              </span>
            </label>
            <Input
              id="recurring-end-date"
              type="date"
              value={endDateStr}
              onChange={(e) => setEndDateStr(e.target.value)}
              className="mt-1 h-9 text-xs"
            />
          </div>
        </div>

        {/* Auto Apply Toggle */}
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
          <input
            id="recurring-auto-apply"
            type="checkbox"
            checked={autoApply}
            onChange={(e) => setAutoApply(e.target.checked)}
            className="h-4 w-4 rounded-sm border-[var(--border-subtle)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
          />
          <div>
            <label
              htmlFor="recurring-auto-apply"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              {autoApply
                ? t.finance.recurring.autoApplyLabel
                : t.finance.recurring.manualApplyLabel}
            </label>
            <p className="text-xs text-[var(--text-muted)]">
              {autoApply
                ? t.finance.recurring.autoApplyDescription
                : t.finance.recurring.manualApplyDescription}
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            size="sm"
            disabled={saving}
            className="gap-1.5 text-xs"
            data-testid="save-recurring-plan-button"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>
              {saving
                ? t.finance.recurring.savingButton
                : t.finance.recurring.saveButton}
            </span>
          </Button>
        </div>
      </form>

      {/* List of Existing Plans */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t.finance.recurring.sectionTitle} ({templates.length})
        </h4>

        {templates.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-[var(--border-subtle)] p-6 text-center text-xs text-[var(--text-muted)]">
            <Calendar className="mx-auto h-8 w-8 text-[var(--text-muted)] opacity-60" />
            <h5 className="mt-2 font-semibold text-[var(--text-primary)]">
              {t.finance.recurring.noRecurringTitle}
            </h5>
            <p className="mt-1">{t.finance.recurring.noRecurringDescription}</p>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-[var(--border-subtle)]/50 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            {templates.map((item) => {
              const isPaused = !item.isActive;

              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 p-4 text-xs sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`recurring-template-card-${item.id}`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[var(--text-primary)]">
                        {item.description}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold text-[10px] ${
                          isPaused
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]"
                        }`}
                      >
                        {isPaused
                          ? t.finance.recurring.pausedStatus
                          : t.finance.recurring.activeStatus}
                      </span>
                      <span className="rounded-full bg-[var(--bg-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                        {item.autoApply
                          ? t.finance.recurring.autoApplyLabel
                          : t.finance.recurring.manualApplyLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[var(--text-muted)]">
                      <span
                        className={`font-semibold ${
                          item.type === "expense"
                            ? "text-[var(--status-expense)]"
                            : "text-[var(--status-income)]"
                        }`}
                      >
                        <PrivacyAmount amount={item.amount} signMode="plain" />
                      </span>
                      <span>•</span>
                      <span>{item.walletName}</span>
                      <span>•</span>
                      <span>{item.categoryName}</span>
                      <span>•</span>
                      <span className="capitalize">
                        {item.frequency === "monthly"
                          ? `Bulanan (tgl ${item.dayOfMonth ?? 1})`
                          : item.frequency}
                      </span>
                    </div>

                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {t.finance.recurring.nextRunLabel}:{" "}
                      <strong>{item.nextRunAt.slice(0, 10)}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleToggleActive(item)}
                      disabled={busyToggleId === item.id}
                      className="h-7 px-2 text-xs"
                      data-testid={`toggle-active-${item.id}`}
                      aria-label={
                        isPaused
                          ? t.finance.recurring.resumeAction
                          : t.finance.recurring.pauseAction
                      }
                    >
                      {isPaused ? (
                        <Play className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Pause className="h-3.5 w-3.5 text-amber-600" />
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStartEdit(item)}
                      className="h-7 px-2 text-xs"
                      data-testid={`edit-template-${item.id}`}
                      aria-label="Edit template"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>

                    {confirmDeleteId === item.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => void handleDelete(item.id)}
                          disabled={busyDeleteId === item.id}
                          className="h-7 bg-[var(--status-expense)] px-2 text-xs hover:bg-[var(--status-expense)]/90"
                          data-testid="confirm-delete-template-btn"
                        >
                          {t.finance.recurring.confirmDeleteButton}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirmDeleteId(null)}
                          className="h-7 px-2 text-xs"
                        >
                          {t.finance.recurring.cancelButton}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(item.id)}
                        className="h-7 px-2 text-xs text-[var(--status-expense)] hover:bg-[var(--status-expense)]/10"
                        data-testid={`delete-template-${item.id}`}
                        aria-label="Delete template"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button variant="secondary" onClick={onClose}>
          {t.finance.recurring.cancelButton}
        </Button>
      </div>
    </div>
  );
}

export function RecurringTemplateModal({
  open,
  onClose,
  templates,
  wallets,
  categories,
  onMutated,
}: RecurringTemplateModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.finance.recurring.modalTitle}
      className="max-w-2xl"
    >
      <RecurringModalBody
        templates={templates}
        wallets={wallets}
        categories={categories}
        onClose={onClose}
        onMutated={onMutated}
      />
    </Modal>
  );
}
