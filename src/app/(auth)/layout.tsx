"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LocaleToggle } from "@/components/ui/LocaleToggle";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useI18n } from "@/lib/i18n/context";

/**
 * Isolated auth route-group layout with instant ID/EN + Light/Dark toggles (does not collide with (public) landing layout).
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-20 pt-2.5">
        <div className="mx-auto w-full max-w-[1360px] px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-3 py-1.5 shadow-[var(--shadow-pill)] backdrop-blur-md sm:px-4">
            <Link
              href="/"
              className="inline-flex min-h-10 min-w-10 shrink-0 items-center gap-2 px-1.5 text-base font-bold tracking-tight text-[var(--text-primary)]"
            >
              <span
                aria-hidden="true"
                className="inline-block h-3.5 w-3.5 rounded-full bg-[var(--accent-primary)]"
              />
              <span>{t.common.appName}</span>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <LocaleToggle />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main
        id="noka-auth-content"
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8"
      >
        {children}
      </main>
    </div>
  );
}

