"use client";

import { Eye, EyeOff, FileText, Link2, Sparkles, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/context";

function formatDemoAmount(
  sign: "positive" | "negative" | "neutral" | undefined,
  visibleText: string,
  isBlurred: boolean,
): string {
  if (!isBlurred) {
    return visibleText;
  }
  if (sign === "positive") {
    return "+Rp •••••";
  }
  if (sign === "negative") {
    return "-Rp •••••";
  }
  return "Rp •••••";
}

/**
 * Self-contained 4-block interactive showcase preserved across instant ID/EN and Light/Dark toggles.
 */
export function FeaturePreviewCard() {
  const { t } = useI18n();
  const [selectedPresetId, setSelectedPresetId] = useState<
    "expense" | "income" | "note"
  >("expense");
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({
    "chk-1": true,
    "chk-2": false,
    "chk-3": false,
  });
  const [demoBlurred, setDemoBlurred] = useState(false);

  const activePreset =
    t.landing.preview.presets.find((item) => item.id === selectedPresetId) ??
    t.landing.preview.presets[0];

  const toggleChecklist = (itemId: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  return (
    <section
      id="preview"
      aria-labelledby="landing-preview-heading"
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-1.5">
          <h2
            id="landing-preview-heading"
            className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl"
          >
            {t.landing.preview.sectionTitle}
          </h2>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
            {t.landing.preview.sectionSubtitle}
          </p>
        </div>

        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button
            type="button"
            variant={demoBlurred ? "primary" : "secondary"}
            aria-pressed={demoBlurred}
            onClick={() => setDemoBlurred((prev) => !prev)}
            className="min-h-10 shrink-0"
          >
            {demoBlurred ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {demoBlurred
                ? t.landing.preview.privacyBlurButtonHide
                : t.landing.preview.privacyBlurButtonShow}
            </span>
          </Button>
          <span className="text-xs text-[var(--text-secondary)]">
            {t.landing.preview.privacyBlurHint}
          </span>
        </div>
      </div>

      <Card className="flex flex-col gap-5 p-4 sm:p-6">
        {/* (a) Preset Smart Quick Capture Demo */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t.landing.preview.quickCaptureLabel}</span>
            </div>
            <span className="text-xs text-[var(--text-secondary)]">
              {t.landing.preview.quickCaptureHint}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {t.landing.preview.presets.map((preset) => {
              const isSelected = preset.id === activePreset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedPresetId(preset.id)}
                  className={cn(
                    "min-h-10 cursor-pointer rounded-[var(--radius-md)] border px-3 py-2 font-mono text-xs font-medium transition-colors sm:text-sm",
                    isSelected
                      ? "border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-foreground)]"
                      : "border-[var(--border-default)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]",
                  )}
                >
                  {preset.chip}
                </button>
              );
            })}
          </div>

          <div
            data-testid="quick-capture-result"
            className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {t.landing.preview.detectedHeading}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border border-[var(--border-default)] bg-[var(--bg-canvas)] px-2.5 py-0.5 text-xs font-semibold",
                    activePreset.id === "expense" &&
                      "text-[var(--status-expense)]",
                    activePreset.id === "income" &&
                      "text-[var(--status-income)]",
                    activePreset.id === "note" && "text-[var(--text-primary)]",
                  )}
                >
                  {activePreset.kindLabel}
                </span>
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {activePreset.categoryLabel}
                </span>
                {activePreset.walletLabel ? (
                  <span className="text-sm text-[var(--text-secondary)]">
                    • {activePreset.walletLabel}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                {activePreset.hintText}
              </p>
            </div>

            {activePreset.amountText ? (
              <span
                data-testid="quick-capture-amount"
                className={cn(
                  "font-mono text-xl font-bold tracking-tight sm:text-2xl",
                  activePreset.id === "income"
                    ? "text-[var(--status-income)]"
                    : "text-[var(--status-expense)]",
                )}
              >
                {formatDemoAmount(
                  activePreset.amountSign,
                  activePreset.amountText,
                  demoBlurred,
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-[var(--text-primary)]">
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{activePreset.noteTitle}</span>
              </span>
            )}
          </div>
        </div>

        {/* (b) Interactive GFM Checklist + (c) Safe-to-Spend & Linked Notes */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-canvas)] p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t.landing.preview.checklistHeading}
            </p>
            <div className="flex flex-col gap-2">
              {t.landing.preview.checklistItems.map((item) => {
                const isChecked = Boolean(checkedItems[item.id]);
                return (
                  <label
                    key={item.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleChecklist(item.id)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent-primary)]"
                    />
                    <span
                      className={cn(
                        isChecked
                          ? "text-[var(--text-muted)] line-through"
                          : "text-[var(--text-primary)]",
                      )}
                    >
                      {item.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t.landing.preview.safeToSpendTitle}</span>
              </div>
              <p className="text-base text-[var(--text-primary)]">
                <span
                  data-testid="safe-to-spend-amount"
                  className="font-mono text-xl font-bold text-[var(--status-income)]"
                >
                  {formatDemoAmount(
                    "neutral",
                    t.landing.preview.safeToSpendVisibleAmount,
                    demoBlurred,
                  )}
                </span>
                <span className="text-sm text-[var(--text-secondary)]">
                  {t.landing.preview.safeToSpendSuffix}
                </span>
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {t.landing.preview.safeToSpendSubtext}
              </p>
            </div>

            <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Link2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t.landing.preview.linkedNotesTitle}</span>
              </div>
              <p className="text-sm text-[var(--text-primary)]">
                <span>{t.landing.preview.linkedNotesDetailPrefix}</span>
                <span
                  data-testid="linked-notes-amount"
                  className="font-mono font-bold text-[var(--status-expense)]"
                >
                  {formatDemoAmount(
                    "negative",
                    t.landing.preview.linkedNotesVisibleAmount,
                    demoBlurred,
                  )}
                </span>
              </p>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

