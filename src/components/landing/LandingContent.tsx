"use client";

import Link from "next/link";
import {
  CheckSquare,
  EyeOff,
  Link2,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { FeaturePreviewCard } from "@/components/landing/FeaturePreviewCard";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { useI18n } from "@/lib/i18n/context";

const FEATURE_ICONS = [
  CheckSquare,
  Sparkles,
  Link2,
  Wallet,
  EyeOff,
] as const;

export interface LandingContentProps {
  isAuthenticated: boolean;
}

/**
 * SSR-hydrated public landing showcase with instant ID/EN + Light/Dark switching.
 */
export function LandingContent({ isAuthenticated }: LandingContentProps) {
  const { t } = useI18n();

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <a
        href="#noka-landing-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--radius-md)] focus:bg-[var(--accent-primary)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--accent-foreground)]"
      >
        {t.nav.skipToContent}
      </a>

      <LandingHeader isAuthenticated={isAuthenticated} />

      <main
        id="noka-landing-content"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-4 py-12 sm:px-6 lg:py-16"
      >
        {/* Hero */}
        <section className="flex max-w-3xl flex-col items-start gap-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t.landing.hero.eyebrow}</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl sm:leading-tight">
            {t.landing.hero.title}
          </h1>

          <p className="text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            {t.landing.hero.subtitle}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {isAuthenticated ? (
              <>
                <Link
                  href="/app"
                  className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]"
                >
                  {t.landing.hero.primaryAuthCta}
                </Link>
                <a
                  href="#preview"
                  className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]"
                >
                  {t.landing.hero.secondaryAuthCta}
                </a>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]"
                >
                  {t.landing.hero.primaryGuestCta}
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]"
                >
                  {t.landing.hero.secondaryGuestCta}
                </Link>
              </>
            )}
          </div>

          <p className="text-sm text-[var(--text-secondary)]">
            {t.landing.hero.trustLine}
          </p>
        </section>

        {/* Interactive Feature Preview */}
        <FeaturePreviewCard />

        {/* Five Core Advantages */}
        <section
          aria-labelledby="landing-features-heading"
          data-testid="landing-features"
          className="flex flex-col gap-6"
        >
          <div className="flex max-w-2xl flex-col gap-1.5">
            <h2
              id="landing-features-heading"
              className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl"
            >
              {t.landing.features.sectionTitle}
            </h2>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
              {t.landing.features.sectionSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.landing.features.items.map((feature, index) => {
              const Icon = FEATURE_ICONS[index];
              return (
                <Card
                  key={index}
                  className="flex flex-col gap-2.5 transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-canvas)] text-[var(--text-primary)]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <CardTitle as="h3" className="text-base">
                    {feature.title}
                  </CardTitle>
                  <CardDescription className="leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </Card>
              );
            })}
          </div>
        </section>
      </main>

      <LandingFooter isAuthenticated={isAuthenticated} />
    </div>
  );
}

