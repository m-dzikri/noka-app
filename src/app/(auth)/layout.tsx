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
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-canvas)]/95">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-10 items-center text-base font-bold tracking-tight text-[var(--text-primary)]"
          >
            {t.common.appName}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <LocaleToggle />
            <ThemeToggle />
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

