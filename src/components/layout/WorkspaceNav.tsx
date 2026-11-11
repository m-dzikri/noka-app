"use client";

import Link from "next/link";
import { FileText, Settings, Wallet } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

export interface WorkspaceNavProps {
  currentPath: string;
  className?: string;
}

/**
 * Separated top-level workspace navigation for Notes, Finance, and Settings (ARCH-5).
 */
export function isWorkspaceRouteActive(
  currentPath: string,
  href: string,
): boolean {
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function WorkspaceNav({ currentPath, className }: WorkspaceNavProps) {
  const { t } = useI18n();

  const items = [
    { href: "/app/notes", label: t.nav.notes, icon: FileText },
    { href: "/app/finance", label: t.nav.finance, icon: Wallet },
    { href: "/app/settings", label: t.nav.settings, icon: Settings },
  ] as const;

  return (
    <nav
      aria-label={t.nav.workspaceAriaLabel}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = isWorkspaceRouteActive(currentPath, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-[var(--accent-primary)] text-[var(--accent-foreground)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

