"use client";

import Link from "next/link";
import {
  CheckSquare,
  EyeOff,
  Link2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { FeaturePreviewCard } from "@/components/landing/FeaturePreviewCard";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
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

function renderSplitHeadline(title: string) {
  const splitIndex = title.indexOf(", ");
  if (splitIndex === -1) {
    return title;
  }

  const lead = title.slice(0, splitIndex + 2);
  const tail = title.slice(splitIndex + 2);

  return (
    <>
      <span>{lead}</span>
      <span className="block text-[var(--accent-text)]">{tail}</span>
    </>
  );
}

/**
 * SSR-hydrated public landing showcase with centered hero over static fading grid and instant ID/EN + Light/Dark switching.
 */
export function LandingContent({ isAuthenticated }: LandingContentProps) {
  const { t } = useI18n();

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div
        aria-hidden="true"
        data-testid="landing-hero-grid"
        className="noka-hero-grid pointer-events-none absolute inset-x-0 top-0 h-[135dvh] min-h-[760px]"
      />

      <a
        href="#noka-landing-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-[var(--accent-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--accent-foreground)]"
      >
        {t.nav.skipToContent}
      </a>

      <LandingHeader isAuthenticated={isAuthenticated} />

      <main
        id="noka-landing-content"
        className="relative z-10 mx-auto flex w-full max-w-[1360px] flex-1 flex-col px-4 pb-16 sm:px-6 lg:px-8"
      >
        {/* Centered Full-Viewport Hero */}
        <section
          data-testid="landing-hero"
          className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-3xl flex-col items-center justify-center gap-5 py-8 text-center sm:min-h-[calc(100dvh-4.25rem)] sm:py-12"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] shadow-[var(--shadow-sm)]">
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent-primary)]"
              aria-hidden="true"
            />
            <span>{t.landing.hero.eyebrow}</span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-6xl sm:leading-[1.12]">
            {renderSplitHeadline(t.landing.hero.title)}
          </h1>

          <p className="max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            {t.landing.hero.subtitle}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {isAuthenticated ? (
              <>
                <Link
                  href="/app"
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--accent-hover)]"
                >
                  {t.landing.hero.primaryAuthCta}
                </Link>
                <a
                  href="#preview"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
                >
                  {t.landing.hero.secondaryAuthCta}
                </a>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--accent-hover)]"
                >
                  {t.landing.hero.primaryGuestCta}
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
                >
                  {t.landing.hero.secondaryGuestCta}
                </Link>
              </>
            )}
          </div>

          <p className="max-w-2xl text-sm text-[var(--text-muted)]">
            {t.landing.hero.trustLine}
          </p>
        </section>

        <div className="flex flex-col gap-16 pt-12 sm:gap-20 sm:pt-16">
          {/* Interactive Feature Preview */}
          <FeaturePreviewCard />

          {/* Five Core Advantages — Balanced 2 + 3 Bento Grid */}
          <section
            id="features"
            aria-labelledby="landing-features-heading"
            data-testid="landing-features"
            className="flex scroll-mt-24 flex-col gap-7"
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

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-6">
              {t.landing.features.items.map((feature, index) => {
                const Icon = FEATURE_ICONS[index];
                return (
                  <Card
                    key={index}
                    className={cn(
                      "flex flex-col gap-3 rounded-2xl p-6 sm:p-7 transition-transform duration-150 hover:-translate-y-0.5",
                      index < 2
                        ? "lg:col-span-3"
                        : index === 4
                          ? "sm:col-span-2 lg:col-span-2"
                          : "lg:col-span-2",
                    )}
                  >
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--accent-text)]">
                      <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    </div>
                    <CardTitle as="h3" className="text-base sm:text-lg">
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
        </div>
      </main>

      <LandingFooter isAuthenticated={isAuthenticated} />
    </div>
  );
}
