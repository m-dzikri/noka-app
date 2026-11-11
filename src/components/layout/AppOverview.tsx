"use client";

import Link from "next/link";
import { ArrowRight, FileText, Wallet } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { useI18n } from "@/lib/i18n/context";

/**
 * Bilingual initial workspace overview card linking directly to Notes and Finance.
 */
export function AppOverview() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-2xl">
            {t.common.overviewHeading}
          </CardTitle>
          <CardDescription>{t.common.tagline}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-secondary)]">
            {t.common.overviewDescription}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col justify-between gap-4">
          <CardHeader className="mb-0">
            <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-subtle)] text-[var(--text-primary)]">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <CardTitle>{t.common.notesCardTitle}</CardTitle>
            <CardDescription>{t.common.notesCardDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/app/notes"
              className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] transition-colors"
            >
              <span>{t.common.openNotes}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between gap-4">
          <CardHeader className="mb-0">
            <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-subtle)] text-[var(--text-primary)]">
              <Wallet className="h-5 w-5" aria-hidden="true" />
            </div>
            <CardTitle>{t.common.financeCardTitle}</CardTitle>
            <CardDescription>{t.common.financeCardDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/app/finance"
              className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-canvas)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              <span>{t.common.openFinance}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

