"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import {
  dispatchFinanceUpdated,
  dispatchWorkspaceUpdated,
  readJsonSafe,
  resolveFinanceErrorMessage,
  type ApiErrorPayload,
} from "@/components/finance/finance-client-helpers";
import { Button } from "@/components/ui/Button";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { FinanceEntryType } from "@/features/finance/schemas";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import { parseQuickCapture } from "@/features/quick-capture/parser";
import type { QuickCaptureIntent } from "@/features/quick-capture/types";
import { cn } from "@/lib/cn";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";
import type { Dictionary } from "@/lib/i18n/types";

export interface QuickCaptureBarProps {
  wallets: WalletWithBalanceDto[];
  categories: CategoryDto[];
  onRefreshContexts?: () => Promise<void>;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

interface FeedbackBannerState {
  kind: QuickCaptureIntent;
  createdId: string;
  message: string;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
}

function resolveCategoryDisplayName(
  category: CategoryDto,
  t: Dictionary,
): string {
  if (category.systemKey && category.systemKey in t.categories) {
    return t.categories[category.systemKey as keyof Dictionary["categories"]];
  }
  return category.name;
}

function pickFallbackCategoryId(
  categoriesForType: CategoryDto[],
  txType: FinanceEntryType,
): string {
  const fallbackKey = txType === "income" ? "other_income" : "other_expense";
  return (
    categoriesForType.find((c) => c.systemKey === fallbackKey)?.id ??
    categoriesForType[0]?.id ??
    ""
  );
}

/**
 * Global zero-latency Quick Capture bar with conservative offline parser,
 * keyboard shortcuts (`Ctrl/Cmd+K`, `/`, `Escape`, `Enter`/`Shift+Enter`),
 * manual Note <-> Transaction switch, and Privacy Blur support (`F14`, `AC-8.1`, `AC-8.2`).
 */
export function QuickCaptureBar({
  wallets,
  categories,
  onRefreshContexts,
  inputRef,
}: QuickCaptureBarProps) {
  const { t } = useI18n();
  const localInputRef = useRef<HTMLTextAreaElement>(null);
  const resolvedInputRef = inputRef ?? localInputRef;

  const [draftText, setDraftText] = useState("");
  const [modeOverride, setModeOverride] = useState<QuickCaptureIntent | null>(
    null,
  );
  const [manualTxType, setManualTxType] = useState<FinanceEntryType | null>(
    null,
  );
  const [manualWalletId, setManualWalletId] = useState<string | null>(null);
  const [manualCategoryId, setManualCategoryId] = useState<string | null>(null);
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackBannerState | null>(null);

  const activeWallets = useMemo(
    () => wallets.filter((wallet) => wallet.archivedAt === null),
    [wallets],
  );

  const defaultWalletId = useMemo(
    () =>
      activeWallets.find((w) => w.isDefault)?.id ??
      activeWallets[0]?.id ??
      null,
    [activeWallets],
  );

  const parsed = useMemo(
    () =>
      parseQuickCapture(draftText, {
        wallets: activeWallets,
        categories,
        defaultWalletId,
      }),
    [draftText, activeWallets, categories, defaultWalletId],
  );

  const parsedTx = parsed.intent === "transaction" ? parsed : null;
  const parsedAmount = parsedTx ? parsedTx.amount : null;
  const parsedDescription = parsedTx ? parsedTx.description : "";
  const parsedWalletId = parsedTx ? parsedTx.walletId : null;
  const parsedCategoryId = parsedTx ? parsedTx.categoryId : null;
  const parsedNoteTitle =
    parsed.intent === "note"
      ? parsed.title
      : (draftText.trim().split(/\r?\n/, 1)[0]?.trim() ?? "").slice(0, 200);

  const effectiveIntent: QuickCaptureIntent = modeOverride ?? parsed.intent;
  const effectiveTxType: FinanceEntryType =
    manualTxType ?? parsedTx?.type ?? "expense";

  const categoriesForType = useMemo(
    () => categories.filter((c) => c.type === effectiveTxType),
    [categories, effectiveTxType],
  );

  const effectiveWalletId = useMemo(() => {
    if (
      manualWalletId &&
      activeWallets.some((w) => w.id === manualWalletId)
    ) {
      return manualWalletId;
    }
    if (
      parsedWalletId &&
      activeWallets.some((w) => w.id === parsedWalletId)
    ) {
      return parsedWalletId;
    }
    return defaultWalletId ?? "";
  }, [activeWallets, defaultWalletId, manualWalletId, parsedWalletId]);

  const effectiveCategoryId = useMemo(() => {
    if (
      manualCategoryId &&
      categoriesForType.some((c) => c.id === manualCategoryId)
    ) {
      return manualCategoryId;
    }
    if (
      parsedCategoryId &&
      categoriesForType.some((c) => c.id === parsedCategoryId)
    ) {
      return parsedCategoryId;
    }
    return pickFallbackCategoryId(categoriesForType, effectiveTxType);
  }, [categoriesForType, effectiveTxType, manualCategoryId, parsedCategoryId]);

  const trimmedDraft = draftText.trim();
  const hasDraft = trimmedDraft.length > 0;
  const showPreview = (hasDraft || modeOverride !== null) && !previewDismissed;

  const focusQuickCapture = useCallback(() => {
    setPreviewDismissed(false);
    const el = resolvedInputRef.current;
    if (!el) {
      return;
    }
    el.focus();
    el.select();
  }, [resolvedInputRef]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      const isCtrlOrMetaK =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k";

      if (isCtrlOrMetaK) {
        event.preventDefault();
        focusQuickCapture();
        return;
      }

      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isEditableElement(document.activeElement) &&
        !isEditableElement(event.target)
      ) {
        event.preventDefault();
        focusQuickCapture();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [focusQuickCapture]);

  const resetDraftState = useCallback(() => {
    setDraftText("");
    setModeOverride(null);
    setManualTxType(null);
    setManualWalletId(null);
    setManualCategoryId(null);
    setPreviewDismissed(false);
    setErrorMessage(null);
  }, []);

  const submitCapture = useCallback(async () => {
    if (submitting) {
      return;
    }

    const content = draftText.trim();
    if (!content) {
      return;
    }

    setErrorMessage(null);
    setFeedback(null);

    if (effectiveIntent === "transaction") {
      if (activeWallets.length === 0) {
        setErrorMessage(t.quickCapture.noWalletsTitle);
        return;
      }

      if (
        parsedAmount === null ||
        !Number.isSafeInteger(parsedAmount) ||
        parsedAmount <= 0
      ) {
        setErrorMessage(t.quickCapture.invalidAmountError);
        return;
      }

      if (!effectiveWalletId || !effectiveCategoryId) {
        setErrorMessage(t.quickCapture.missingCategoryError);
        return;
      }

      setSubmitting(true);
      try {
        const txId = crypto.randomUUID();
        const idempotencyKey = crypto.randomUUID();
        const response = await apiFetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: txId,
            walletId: effectiveWalletId,
            categoryId: effectiveCategoryId,
            type: effectiveTxType,
            amount: parsedAmount,
            description: (parsedDescription || content).slice(0, 300),
            occurredAt: new Date().toISOString(),
            idempotencyKey,
          }),
        });

        const payload = await readJsonSafe<
          ApiErrorPayload & {
            ok?: boolean;
            data?: { transaction?: { id?: string } };
          }
        >(response);

        if (!response.ok || !payload?.ok) {
          setErrorMessage(resolveFinanceErrorMessage(t, payload));
          return;
        }

        const createdId = payload.data?.transaction?.id ?? txId;
        resetDraftState();
        setFeedback({
          kind: "transaction",
          createdId,
          message: t.quickCapture.transactionSavedFeedback,
        });
        dispatchFinanceUpdated("quick-capture");
        dispatchWorkspaceUpdated({
          kind: "transaction",
          id: createdId,
          source: "quick-capture",
        });
        await onRefreshContexts?.();
      } catch {
        setErrorMessage(t.errors.generic);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const noteId = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();
      const noteTitle = (
        parsedNoteTitle || t.linkedNotes.untitledNote
      ).slice(0, 200);

      const response = await apiFetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: noteId,
          title: noteTitle,
          content,
          isPinned: false,
          idempotencyKey,
        }),
      });

      const payload = await readJsonSafe<
        ApiErrorPayload & {
          ok?: boolean;
          data?: { note?: { id?: string } };
        }
      >(response);

      if (!response.ok || !payload?.ok) {
        setErrorMessage(resolveFinanceErrorMessage(t, payload));
        return;
      }

      const createdId = payload.data?.note?.id ?? noteId;
      resetDraftState();
      setFeedback({
        kind: "note",
        createdId,
        message: t.quickCapture.noteSavedFeedback,
      });
      dispatchWorkspaceUpdated({
        kind: "note",
        id: createdId,
        source: "quick-capture",
      });
    } catch {
      setErrorMessage(t.errors.generic);
    } finally {
      setSubmitting(false);
    }
  }, [
    activeWallets.length,
    draftText,
    effectiveCategoryId,
    effectiveIntent,
    effectiveTxType,
    effectiveWalletId,
    onRefreshContexts,
    parsedAmount,
    parsedDescription,
    parsedNoteTitle,
    resetDraftState,
    submitting,
    t,
  ]);

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitCapture();
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (showPreview) {
        setPreviewDismissed(true);
      } else {
        event.currentTarget.blur();
      }
      return;
    }

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submitCapture();
    }
  };

  const handleSelectMode = (nextMode: QuickCaptureIntent) => {
    setErrorMessage(null);
    setFeedback(null);
    setPreviewDismissed(false);
    setModeOverride((prev) => (prev === nextMode ? null : nextMode));
  };

  const handleTxTypeChange = (nextType: FinanceEntryType) => {
    setManualTxType(nextType);
    setManualCategoryId(null);
    setErrorMessage(null);
  };

  const primaryActionLabel = submitting
    ? t.quickCapture.submitting
    : effectiveIntent === "transaction"
      ? t.quickCapture.submitTransaction
      : t.quickCapture.submitNote;

  const isZeroWalletBlock =
    effectiveIntent === "transaction" && activeWallets.length === 0;

  return (
    <section
      aria-label={t.quickCapture.ariaLabel}
      data-testid="quick-capture-bar"
      className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 p-3 shadow-[var(--shadow-sm)] transition-colors sm:px-4 sm:py-3"
    >
      <form onSubmit={handleFormSubmit} className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/65 px-3 py-2 focus-within:border-[var(--accent-primary)] focus-within:ring-2 focus-within:ring-[var(--accent-primary)]/20">
            <Sparkles
              className="mt-1.5 h-4 w-4 shrink-0 text-[var(--accent-text)]"
              aria-hidden="true"
            />
            <textarea
              ref={resolvedInputRef}
              id="noka-quick-capture-input"
              data-testid="quick-capture-input"
              rows={1}
              value={draftText}
              onChange={(event) => {
                setDraftText(event.target.value);
                setErrorMessage(null);
                setFeedback(null);
                if (previewDismissed) {
                  setPreviewDismissed(false);
                }
              }}
              onKeyDown={handleInputKeyDown}
              placeholder={t.quickCapture.placeholder}
              aria-label={t.quickCapture.title}
              className="min-h-6 w-full min-w-0 resize-none bg-transparent text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            {hasDraft ? (
              <button
                type="button"
                onClick={resetDraftState}
                aria-label={t.quickCapture.clearButton}
                title={t.quickCapture.clearButton}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : (
              <span
                aria-hidden="true"
                className="hidden shrink-0 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] lg:inline-flex"
              >
                {t.quickCapture.shortcutHint}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 md:shrink-0 md:justify-end">
            <div
              role="group"
              aria-label={t.quickCapture.title}
              className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-0.5"
            >
              <button
                type="button"
                data-testid="quick-capture-mode-note"
                aria-pressed={effectiveIntent === "note"}
                onClick={() => handleSelectMode("note")}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                  effectiveIntent === "note"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.quickCapture.modeNoteLabel}</span>
              </button>
              <button
                type="button"
                data-testid="quick-capture-mode-transaction"
                aria-pressed={effectiveIntent === "transaction"}
                onClick={() => handleSelectMode("transaction")}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                  effectiveIntent === "transaction"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.quickCapture.modeTransactionLabel}</span>
              </button>
            </div>

            {hasDraft ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreviewDismissed((prev) => !prev)}
                  aria-label={
                    previewDismissed
                      ? t.quickCapture.expandPreview
                      : t.quickCapture.collapsePreview
                  }
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {previewDismissed ? (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <Button
                  type="submit"
                  size="sm"
                  data-testid="quick-capture-submit"
                  disabled={submitting || isZeroWalletBlock}
                >
                  {primaryActionLabel}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {showPreview ? (
          <div
            data-testid="quick-capture-preview"
            className="flex flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 px-3 py-2.5 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  data-testid="quick-capture-intent-badge"
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-primary)]/15 px-2.5 py-0.5 font-semibold text-[var(--accent-text)]"
                >
                  {effectiveIntent === "transaction"
                    ? t.quickCapture.intentDetectedTransaction
                    : t.quickCapture.intentDetectedNote}
                </span>
                {modeOverride !== null ? (
                  <span className="text-[var(--text-muted)]">
                    · {t.quickCapture.modeOverrideActive}
                  </span>
                ) : null}
              </div>

              {effectiveIntent === "transaction" &&
              parsedAmount !== null &&
              parsedAmount > 0 ? (
                <div
                  data-testid="quick-capture-amount-preview"
                  className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]"
                >
                  <span className="text-[var(--text-secondary)]">
                    {t.quickCapture.amountLabel}:
                  </span>
                  <PrivacyAmount amount={parsedAmount} />
                </div>
              ) : null}
            </div>

            {effectiveIntent === "transaction" ? (
              isZeroWalletBlock ? (
                <div
                  data-testid="quick-capture-zero-wallet-guard"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--status-warning)]/30 bg-[var(--bg-surface)] px-3 py-2"
                >
                  <span className="font-medium text-[var(--text-primary)]">
                    {t.quickCapture.noWalletsTitle}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href="/app/finance"
                      className="inline-flex min-h-8 items-center rounded-full bg-[var(--accent-primary)] px-3 py-1 font-semibold text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]"
                    >
                      {t.quickCapture.noWalletsAction}
                    </Link>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setModeOverride("note");
                        setErrorMessage(null);
                      }}
                    >
                      {t.quickCapture.fallbackAsNoteAction}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                      {t.linkedNotes.typeLabel}
                    </span>
                    <select
                      aria-label={t.linkedNotes.typeLabel}
                      data-testid="quick-capture-type-select"
                      value={effectiveTxType}
                      onChange={(event) =>
                        handleTxTypeChange(
                          event.target.value as FinanceEntryType,
                        )
                      }
                      className="min-h-9 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 text-xs text-[var(--text-primary)]"
                    >
                      <option value="expense">
                        {t.quickCapture.txTypeExpense}
                      </option>
                      <option value="income">
                        {t.quickCapture.txTypeIncome}
                      </option>
                    </select>
                  </label>

                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                      {t.quickCapture.walletLabel}
                    </span>
                    <select
                      aria-label={t.quickCapture.walletLabel}
                      data-testid="quick-capture-wallet-select"
                      value={effectiveWalletId}
                      onChange={(event) => setManualWalletId(event.target.value)}
                      className="min-h-9 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 text-xs text-[var(--text-primary)]"
                    >
                      {activeWallets.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                      {t.quickCapture.categoryLabel}
                    </span>
                    <select
                      aria-label={t.quickCapture.categoryLabel}
                      data-testid="quick-capture-category-select"
                      value={effectiveCategoryId}
                      onChange={(event) =>
                        setManualCategoryId(event.target.value)
                      }
                      className="min-h-9 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 text-xs text-[var(--text-primary)]"
                    >
                      {categoriesForType.map((category) => (
                        <option key={category.id} value={category.id}>
                          {resolveCategoryDisplayName(category, t)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex min-w-0 flex-col justify-center gap-1">
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                      {t.quickCapture.descriptionLabel}
                    </span>
                    <span
                      data-testid="quick-capture-description-preview"
                      className="truncate rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2 text-xs text-[var(--text-primary)]"
                    >
                      {parsedDescription || trimmedDraft || "—"}
                    </span>
                  </div>
                </div>
              )
            ) : (
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2">
                <span className="shrink-0 font-medium text-[var(--text-secondary)]">
                  {t.quickCapture.noteTitleLabel}:
                </span>
                <span
                  data-testid="quick-capture-note-title-preview"
                  className="truncate font-medium text-[var(--text-primary)]"
                >
                  {parsedNoteTitle || t.linkedNotes.untitledNote}
                </span>
              </div>
            )}
          </div>
        ) : null}

        {errorMessage ? (
          <p
            role="alert"
            data-testid="quick-capture-error"
            className="text-xs font-medium text-[var(--status-danger)]"
          >
            {errorMessage}
          </p>
        ) : null}

        {feedback ? (
          <div
            role="status"
            data-testid="quick-capture-feedback"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--status-success)]/30 bg-[var(--bg-subtle)]/70 px-3 py-1.5 text-xs"
          >
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--status-success)]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{feedback.message}</span>
            </span>
            <Link
              href={
                feedback.kind === "transaction"
                  ? "/app/finance"
                  : `/app/notes/${feedback.createdId}`
              }
              className="font-semibold text-[var(--accent-text)] underline underline-offset-2 hover:opacity-85"
            >
              {feedback.kind === "transaction"
                ? t.quickCapture.openFinanceLink
                : t.quickCapture.openNoteLink}
            </Link>
          </div>
        ) : null}
      </form>
    </section>
  );
}
