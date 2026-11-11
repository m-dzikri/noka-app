"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Plus, Settings, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { LocaleToggle } from "@/components/ui/LocaleToggle";
import {
  MobileMenuButton,
  useMobileMenu,
} from "@/components/ui/MobileMenuButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  isWorkspaceRouteActive,
  WorkspaceNav,
} from "@/components/layout/WorkspaceNav";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

export interface AppShellUser {
  id: string;
  name: string;
  email: string;
}

function UserBadge({
  user,
  maxWidthClass,
  testId,
}: {
  user: AppShellUser;
  maxWidthClass: string;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex min-h-10 items-center truncate rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]",
        maxWidthClass,
      )}
      title={user.email}
    >
      {user.name}
    </span>
  );
}

export interface AppShellProps {
  children: ReactNode;
  currentPath?: string;
  user?: AppShellUser | null;
  quickCaptureSlot?: ReactNode;
  privacyBlurSlot?: ReactNode;
  syncStatusSlot?: ReactNode;
  logoutSlot?: ReactNode;
  onMobileQuickAction?: () => void;
}

/**
 * Responsive application shell separating Notes and Finance with mobile bottom reachability.
 */
export function AppShell({
  children,
  currentPath,
  user,
  quickCaptureSlot,
  privacyBlurSlot,
  syncStatusSlot,
  logoutSlot,
  onMobileQuickAction,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { isOpen, toggle, close, menuId, containerRef, buttonRef } =
    useMobileMenu();

  const resolvedPath = currentPath ?? pathname ?? "/app";

  const handleMobileQuickAction = () => {
    if (onMobileQuickAction) {
      onMobileQuickAction();
      return;
    }

    const quickInput = document.getElementById("noka-quick-capture-input");
    if (quickInput instanceof HTMLElement) {
      quickInput.focus();
      return;
    }

    router.push("/app/notes");
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <a
        href="#noka-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-[var(--accent-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--accent-foreground)]"
      >
        {t.nav.skipToContent}
      </a>

      <header ref={containerRef} className="sticky top-0 z-30 pt-2.5">
        <div className="mx-auto w-full max-w-[1360px] px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-3 py-1.5 shadow-[var(--shadow-pill)] backdrop-blur-md sm:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/app"
                onClick={close}
                className="inline-flex min-h-10 min-w-10 shrink-0 items-center gap-2 px-1.5 text-base font-bold tracking-tight text-[var(--text-primary)]"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-3.5 w-3.5 rounded-full bg-[var(--accent-primary)]"
                />
                <span>{t.common.appName}</span>
              </Link>
              <WorkspaceNav
                currentPath={resolvedPath}
                className="hidden md:flex"
              />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {syncStatusSlot}
              {privacyBlurSlot}
              <div className="hidden md:flex md:items-center md:gap-2">
                <LocaleToggle />
                <ThemeToggle />
                {user ? (
                  <UserBadge
                    user={user}
                    maxWidthClass="max-w-28 lg:max-w-44"
                    testId="app-shell-user-badge"
                  />
                ) : null}
                {logoutSlot}
              </div>
              <MobileMenuButton
                ref={buttonRef}
                isOpen={isOpen}
                controlsId={menuId}
                onToggle={toggle}
                className="md:hidden"
              />
            </div>
          </div>

          {isOpen ? (
            <div
              id={menuId}
              data-testid="app-shell-mobile-menu"
              className="mt-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/98 p-3 shadow-[var(--shadow-pill)] backdrop-blur-md md:hidden"
            >
              <nav
                aria-label={t.nav.mobileMenuAriaLabel}
                className="flex flex-col gap-2"
              >
                {user ? (
                  <div className="flex w-full">
                    <UserBadge user={user} maxWidthClass="w-full" />
                  </div>
                ) : null}

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

                {logoutSlot ? (
                  <div className="flex flex-col pt-1">{logoutSlot}</div>
                ) : null}
              </nav>
            </div>
          ) : null}
        </div>
      </header>

      {quickCaptureSlot ? (
        <div className="mx-auto w-full max-w-[1360px] px-3 pt-4 sm:px-6 lg:px-8">
          {quickCaptureSlot}
        </div>
      ) : null}

      <main
        id="noka-main-content"
        className="mx-auto w-full max-w-[1360px] flex-1 px-3 py-5 pb-24 sm:px-6 md:pb-8 lg:px-8"
      >
        {children}
      </main>

      <nav
        aria-label={t.nav.mobileNavAriaLabel}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-2 py-1.5 backdrop-blur-md md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 items-center gap-1">
          <Link
            href="/app/notes"
            aria-current={
              isWorkspaceRouteActive(resolvedPath, "/app/notes")
                ? "page"
                : undefined
            }
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-medium transition-colors",
              isWorkspaceRouteActive(resolvedPath, "/app/notes")
                ? "bg-[var(--bg-subtle)] font-semibold text-[var(--text-primary)] underline underline-offset-4"
                : "text-[var(--text-secondary)]",
            )}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">{t.nav.notes}</span>
          </Link>

          <button
            type="button"
            onClick={handleMobileQuickAction}
            aria-label={t.nav.quickAction}
            className="flex min-h-11 items-center justify-center gap-1 rounded-full bg-[var(--accent-primary)] px-2 text-xs font-semibold text-[var(--accent-foreground)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--accent-hover)] cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{t.common.quickActionButton}</span>
          </button>

          <Link
            href="/app/finance"
            aria-current={
              isWorkspaceRouteActive(resolvedPath, "/app/finance")
                ? "page"
                : undefined
            }
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-medium transition-colors",
              isWorkspaceRouteActive(resolvedPath, "/app/finance")
                ? "bg-[var(--bg-subtle)] font-semibold text-[var(--text-primary)] underline underline-offset-4"
                : "text-[var(--text-secondary)]",
            )}
          >
            <Wallet className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">{t.nav.finance}</span>
          </Link>

          <Link
            href="/app/settings"
            aria-current={
              isWorkspaceRouteActive(resolvedPath, "/app/settings")
                ? "page"
                : undefined
            }
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-medium transition-colors",
              isWorkspaceRouteActive(resolvedPath, "/app/settings")
                ? "bg-[var(--bg-subtle)] font-semibold text-[var(--text-primary)] underline underline-offset-4"
                : "text-[var(--text-secondary)]",
            )}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">{t.nav.settings}</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}

