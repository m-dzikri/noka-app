"use client";

import { useI18n, usePreferences } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

export interface LocaleToggleProps {
  className?: string;
}

/**
 * Instant ID/EN locale switcher with explicit aria-pressed state per option.
 */
export function LocaleToggle({ className }: LocaleToggleProps) {
  const { locale, updatePreferences } = usePreferences();
  const { t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t.preferences.localeToggleLabel}
      className={cn(
        "inline-flex min-h-10 items-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-0.5",
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={locale === "id"}
        title={t.preferences.switchToId}
        onClick={() => updatePreferences({ locale: "id" })}
        className={cn(
          "min-h-10 rounded-[calc(var(--radius-md)-2px)] px-3 text-xs font-semibold transition-colors cursor-pointer",
          locale === "id"
            ? "bg-[var(--accent-primary)] text-[var(--accent-foreground)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
        )}
      >
        {t.preferences.indonesian}
      </button>
      <button
        type="button"
        aria-pressed={locale === "en"}
        title={t.preferences.switchToEn}
        onClick={() => updatePreferences({ locale: "en" })}
        className={cn(
          "min-h-10 rounded-[calc(var(--radius-md)-2px)] px-3 text-xs font-semibold transition-colors cursor-pointer",
          locale === "en"
            ? "bg-[var(--accent-primary)] text-[var(--accent-foreground)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
        )}
      >
        {t.preferences.english}
      </button>
    </div>
  );
}

