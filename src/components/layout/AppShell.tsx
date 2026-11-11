"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Plus, Settings, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { LocaleToggle } from "@/components/ui/LocaleToggle";
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
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[var(--radius-md)] focus:bg-[var(--accent-primary)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--accent-foreground)]"
      >
        {t.nav.skipToContent}
      </a>

      <header className="sticky top-0 z-30 border-b border-[var(--border-default)] bg-[var(--bg-canvas)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/app"
              className="inline-flex min-h-10 items-center text-base font-bold tracking-tight text-[var(--text-primary)]"
            >
              {t.common.appName}
            </Link>
            <WorkspaceNav
              currentPath={resolvedPath}
              className="hidden md:flex"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {syncStatusSlot}
            {privacyBlurSlot}
            <LocaleToggle />
            <ThemeToggle />
            {user ? (
              <span
                data-testid="app-shell-user-badge"
                className="inline-flex min-h-9 max-w-40 items-center truncate rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]"
                title={user.email}
              >
                {user.name}
              </span>
            ) : null}
            {logoutSlot}
          </div>
        </div>
      </header>

      {quickCaptureSlot ? (
        <div className="mx-auto w-full max-w-5xl px-3 pt-4 sm:px-6">
          {quickCaptureSlot}
        </div>
      ) : null}

      <main
        id="noka-main-content"
        className="mx-auto w-full max-w-5xl flex-1 px-3 py-5 pb-24 sm:px-6 md:pb-8"
      >
        {children}
      </main>

      <nav
        aria-label={t.nav.mobileNavAriaLabel}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-default)] bg-[var(--bg-canvas)]/95 px-2 py-1.5 backdrop-blur md:hidden"
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
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-1 text-xs font-medium",
              isWorkspaceRouteActive(resolvedPath, "/app/notes")
                ? "text-[var(--text-primary)] underline underline-offset-4"
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
            className="flex min-h-11 items-center justify-center gap-1 rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-2 text-xs font-semibold text-[var(--accent-foreground)] cursor-pointer"
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
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-1 text-xs font-medium",
              isWorkspaceRouteActive(resolvedPath, "/app/finance")
                ? "text-[var(--text-primary)] underline underline-offset-4"
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
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-1 text-xs font-medium",
              isWorkspaceRouteActive(resolvedPath, "/app/settings")
                ? "text-[var(--text-primary)] underline underline-offset-4"
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

