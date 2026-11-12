"use client";

import { Eye, EyeOff } from "lucide-react";
import { usePrivacy } from "@/components/providers/PrivacyProvider";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/context";

export interface PrivacyBlurToggleProps {
  className?: string;
}

/**
 * Global one-click Privacy Blur toggle button placed inside `AppShell` header (`F17`, `UI-5`).
 */
export function PrivacyBlurToggle({ className }: PrivacyBlurToggleProps) {
  const { isBlurred, toggleBlur } = usePrivacy();
  const { t } = useI18n();
  const label = isBlurred ? t.privacy.showLabel : t.privacy.hideLabel;

  return (
    <button
      type="button"
      data-testid="privacy-blur-toggle"
      aria-pressed={isBlurred}
      aria-label={label}
      title={label}
      onClick={toggleBlur}
      className={cn(
        "inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]",
        isBlurred
          ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/15 text-[var(--accent-text)]"
          : "border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]",
        className,
      )}
    >
      {isBlurred ? (
        <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="hidden lg:inline">
        {isBlurred ? t.privacy.activeBadge : t.privacy.shortLabel}
      </span>
    </button>
  );
}

