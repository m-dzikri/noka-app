"use client";

import { Moon, Sun } from "lucide-react";
import { useI18n, usePreferences } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

export interface ThemeToggleProps {
  className?: string;
}

/**
 * Instant Light/Dark mode toggle button synchronized with PreferencesProvider.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, updatePreferences } = usePreferences();
  const { t } = useI18n();
  const isDark = theme === "dark";
  const actionLabel = isDark
    ? t.preferences.switchToLight
    : t.preferences.switchToDark;

  return (
    <button
      type="button"
      aria-pressed={isDark}
      aria-label={actionLabel}
      title={actionLabel}
      onClick={() => updatePreferences({ theme: isDark ? "light" : "dark" })}
      className={cn(
        "inline-flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer",
        className,
      )}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}

