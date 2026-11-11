"use client";

import Link from "next/link";
import { LocaleToggle } from "@/components/ui/LocaleToggle";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useI18n } from "@/lib/i18n/context";

export interface LandingHeaderProps {
  isAuthenticated: boolean;
}

/**
 * Responsive public landing header with instant ID/EN + Light/Dark toggles and auth-aware CTAs.
 */
export function LandingHeader({ isAuthenticated }: LandingHeaderProps) {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border-default)] bg-[var(--bg-canvas)]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-10 items-center gap-2 text-lg font-bold tracking-tight text-[var(--text-primary)]"
        >
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 rounded-sm bg-[var(--accent-primary)]"
          />
          <span>{t.common.appName}</span>
        </Link>

        <nav
          aria-label={t.landing.header.primaryNavAriaLabel}
          className="flex flex-wrap items-center gap-2"
        >
          <LocaleToggle />
          <ThemeToggle />
          {isAuthenticated ? (
            <Link
              href="/app"
              className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              {t.landing.header.openWorkspace}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]"
              >
                {t.landing.header.signIn}
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]"
              >
                {t.landing.header.signUp}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

