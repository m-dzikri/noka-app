"use client";

import Link from "next/link";
import { LocaleToggle } from "@/components/ui/LocaleToggle";
import {
  MobileMenuButton,
  useMobileMenu,
} from "@/components/ui/MobileMenuButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

export interface LandingHeaderProps {
  isAuthenticated: boolean;
}

interface LandingAuthActionsProps {
  isAuthenticated: boolean;
  fullWidth?: boolean;
  onNavigate?: () => void;
}

function LandingAuthActions({
  isAuthenticated,
  fullWidth = false,
  onNavigate,
}: LandingAuthActionsProps) {
  const { t } = useI18n();

  if (isAuthenticated) {
    return (
      <Link
        href="/app"
        onClick={onNavigate}
        className={cn(
          "inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--accent-primary)] px-4.5 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]",
          fullWidth && "min-h-11 w-full",
        )}
      >
        {t.landing.header.openWorkspace}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        fullWidth && "flex-col items-stretch",
      )}
    >
      <Link
        href="/login"
        onClick={onNavigate}
        className={cn(
          "inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]",
          fullWidth && "min-h-11 w-full",
        )}
      >
        {t.landing.header.signIn}
      </Link>
      <Link
        href="/register"
        onClick={onNavigate}
        className={cn(
          "inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--accent-primary)] px-4.5 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]",
          fullWidth && "min-h-11 w-full",
        )}
      >
        {t.landing.header.signUp}
      </Link>
    </div>
  );
}

/**
 * Responsive public landing floating pill header with single-row mobile trigger and stacked vertical mobile drawer.
 */
export function LandingHeader({ isAuthenticated }: LandingHeaderProps) {
  const { t } = useI18n();
  const { isOpen, toggle, close, menuId, containerRef, buttonRef } =
    useMobileMenu();

  return (
    <header ref={containerRef} className="sticky top-0 z-30 pt-2.5">
      <div className="mx-auto w-full max-w-[1360px] px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-3 py-1.5 shadow-[var(--shadow-pill)] backdrop-blur-md sm:px-4">
          <Link
            href="/"
            onClick={close}
            className="inline-flex min-h-10 min-w-10 shrink-0 items-center gap-2 px-1.5 text-lg font-bold tracking-tight text-[var(--text-primary)]"
          >
            <span
              aria-hidden="true"
              className="inline-block h-3.5 w-3.5 rounded-full bg-[var(--accent-primary)]"
            />
            <span>{t.common.appName}</span>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            <a
              href="#preview"
              className="inline-flex min-h-10 items-center rounded-full px-3.5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
            >
              {t.landing.header.previewLink}
            </a>
            <a
              href="#features"
              className="inline-flex min-h-10 items-center rounded-full px-3.5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
            >
              {t.landing.header.featuresLink}
            </a>
          </div>

          <nav
            aria-label={t.landing.header.primaryNavAriaLabel}
            className="hidden shrink-0 sm:flex sm:items-center sm:gap-2"
          >
            <LocaleToggle />
            <ThemeToggle />
            <LandingAuthActions isAuthenticated={isAuthenticated} />
          </nav>

          <MobileMenuButton
            ref={buttonRef}
            isOpen={isOpen}
            controlsId={menuId}
            onToggle={toggle}
            className="sm:hidden"
          />
        </div>

        {isOpen ? (
          <div
            id={menuId}
            data-testid="landing-mobile-menu"
            className="mt-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/98 p-3 shadow-[var(--shadow-pill)] backdrop-blur-md sm:hidden"
          >
            <nav
              aria-label={t.nav.mobileMenuAriaLabel}
              className="flex flex-col gap-2"
            >
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 px-3 py-1.5">
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  {t.nav.languageLabel}
                </span>
                <LocaleToggle />
              </div>

              <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 px-3 py-1.5">
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  {t.nav.themeLabel}
                </span>
                <ThemeToggle />
              </div>

              <a
                href="#preview"
                onClick={close}
                className="inline-flex min-h-11 w-full items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
              >
                {t.landing.header.previewLink}
              </a>

              <a
                href="#features"
                onClick={close}
                className="inline-flex min-h-11 w-full items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
              >
                {t.landing.header.featuresLink}
              </a>

              <div className="pt-1">
                <LandingAuthActions
                  isAuthenticated={isAuthenticated}
                  fullWidth
                  onNavigate={close}
                />
              </div>
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}
