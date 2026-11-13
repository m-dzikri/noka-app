"use client";

import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";
import { PrivacySummaryCard } from "@/components/settings/PrivacySummaryCard";
import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm";
import type { AuthUser } from "@/features/auth/session";
import { DICTIONARIES, useI18n } from "@/lib/i18n/context";

interface SettingsWorkspaceProps {
  initialUser: AuthUser;
}

export function SettingsWorkspace({ initialUser }: SettingsWorkspaceProps) {
  const { t, locale } = useI18n();
  const settings =
    t?.settings ?? (locale === "en" ? DICTIONARIES.en.settings : DICTIONARIES.id.settings);

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
          {settings.pageTitle}
        </h1>
        <p className="text-sm text-[var(--text-secondary)] sm:text-base">
          {settings.pageSubtitle}
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <ProfileSettingsForm initialUser={initialUser} />
        <ChangePasswordForm />
        <PrivacySummaryCard />
        <DeleteAccountSection />
      </div>
    </div>
  );
}

