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

  return (
    <button
      type="button"
      aria-pressed={isDark}
      aria-label={
        isDark ? t.preferences.switchToLight : t.preferences.switchToDark
      }
      title={t.preferences.themeToggleLabel}
      onClick={() => updatePreferences({ theme: isDark ? "light" : "dark" })}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer",
        className,
      )}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{isDark ? t.preferences.darkMode : t.preferences.lightMode}</span>
    </button>
  );
}

