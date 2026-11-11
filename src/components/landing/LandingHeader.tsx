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
          "inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]",
          fullWidth && "w-full",
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
        fullWidth && "grid w-full grid-cols-2 gap-2",
      )}
    >
      <Link
        href="/login"
        onClick={onNavigate}
        className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
      >
        {t.landing.header.signIn}
      </Link>
      <Link
        href="/register"
        onClick={onNavigate}
        className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]"
      >
        {t.landing.header.signUp}
      </Link>
    </div>
  );
}

/**
 * Responsive public landing header with single-row mobile hamburger bar and desktop inline controls.
 */
export function LandingHeader({ isAuthenticated }: LandingHeaderProps) {
  const { t } = useI18n();
  const { isOpen, toggle, close, menuId, containerRef, buttonRef } =
    useMobileMenu();

  return (
    <header
      ref={containerRef}
      className="sticky top-0 z-20 border-b border-[var(--border-default)] bg-[var(--bg-canvas)]/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
        <Link
          href="/"
          onClick={close}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 text-lg font-bold tracking-tight text-[var(--text-primary)]"
        >
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 rounded-sm bg-[var(--accent-primary)]"
          />
          <span>{t.common.appName}</span>
        </Link>

        <nav
          aria-label={t.landing.header.primaryNavAriaLabel}
          className="hidden sm:flex sm:items-center sm:gap-2"
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
          className="border-t border-[var(--border-default)] bg-[var(--bg-canvas)] px-4 py-3 sm:hidden"
        >
          <nav
            aria-label={t.nav.mobileMenuAriaLabel}
            className="mx-auto flex w-full max-w-6xl flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <LocaleToggle />
              <ThemeToggle />
            </div>
            <LandingAuthActions
              isAuthenticated={isAuthenticated}
              fullWidth
              onNavigate={close}
            />
          </nav>
        </div>
      ) : null}
    </header>
  );
}

