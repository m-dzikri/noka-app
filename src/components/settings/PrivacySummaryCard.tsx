"use client";

import { EyeOff, HardDrive, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { DICTIONARIES, useI18n } from "@/lib/i18n/context";

export function PrivacySummaryCard() {
  const { t, locale } = useI18n();
  const settings =
    t?.settings ?? (locale === "en" ? DICTIONARIES.en.settings : DICTIONARIES.id.settings);
  const summary = settings.privacySummary;

  const points = [
    {
      title: summary.zeroLogsTitle,
      desc: summary.zeroLogsDesc,
      icon: EyeOff,
    },
    {
      title: summary.userIsolationTitle,
      desc: summary.userIsolationDesc,
      icon: Lock,
    },
    {
      title: summary.localControlTitle,
      desc: summary.localControlDesc,
      icon: RefreshCw,
    },
    {
      title: summary.noTrackingTitle,
      desc: summary.noTrackingDesc,
      icon: HardDrive,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-[var(--accent-primary)]">
          <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
          <CardTitle>{summary.heading}</CardTitle>
        </div>
        <CardDescription>{summary.subheading}</CardDescription>
      </CardHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {points.map((p, idx) => {
          const Icon = p.icon;
          return (
            <div
              key={idx}
              className="flex flex-col gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 p-4"
            >
              <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                <Icon className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                <span className="text-sm">{p.title}</span>
              </div>
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                {p.desc}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

