"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

export interface LandingFooterProps {
  isAuthenticated: boolean;
}

/**
 * Public landing footer summarizing account data isolation, local parsing privacy, and deletion controls.
 */
export function LandingFooter({ isAuthenticated }: LandingFooterProps) {
  const { t } = useI18n();

  return (
    <footer className="border-t border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
            <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{t.landing.footer.privacyHeading}</span>
          </div>

          <ul
            data-testid="landing-privacy-points"
            className="grid grid-cols-1 gap-3 md:grid-cols-3"
          >
            {t.landing.footer.privacyPoints.map((point) => (
              <li
                key={point}
                className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-canvas)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]"
              >
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-default)] pt-6 text-sm text-[var(--text-secondary)]">
          <span>{t.landing.footer.copyright}</span>
          <div className="flex flex-wrap items-center gap-4">
            {isAuthenticated ? (
              <Link
                href="/app"
                className="inline-flex min-h-10 items-center font-medium text-[var(--text-primary)] underline-offset-4 hover:underline"
              >
                {t.landing.header.openWorkspace}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex min-h-10 items-center font-medium text-[var(--text-primary)] underline-offset-4 hover:underline"
                >
                  {t.landing.header.signIn}
                </Link>
                <Link
                  href="/register"
                  className="inline-flex min-h-10 items-center font-medium text-[var(--text-primary)] underline-offset-4 hover:underline"
                >
                  {t.landing.header.signUp}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

