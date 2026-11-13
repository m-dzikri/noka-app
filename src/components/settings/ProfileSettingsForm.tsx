"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, WifiOff } from "lucide-react";
import { useOptionalSync } from "@/components/providers/SyncProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { AuthUser } from "@/features/auth/session";
import { useI18n, usePreferences } from "@/lib/i18n/context";
import type { Locale, Theme } from "@/lib/i18n/types";

interface ProfileSettingsFormProps {
  initialUser: AuthUser;
}

const CYCLE_DAYS = [
  ...Array.from({ length: 28 }, (_, i) => String(i + 1)),
  "end_of_month",
] as const;

export function ProfileSettingsForm({ initialUser }: ProfileSettingsFormProps) {
  const { t } = useI18n();
  const { updatePreferences } = usePreferences();
  const sync = useOptionalSync();

  const currentUser = sync?.userProfile ?? initialUser;

  const [name, setName] = useState(currentUser.name);
  const [locale, setLocale] = useState<Locale>(currentUser.locale);
  const [theme, setTheme] = useState<Theme>(currentUser.theme);
  const [cycleStartDay, setCycleStartDay] = useState(currentUser.cycleStartDay);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isOnline = sync ? sync.isOnline : typeof navigator === "undefined" || navigator.onLine !== false;

  const isDirty =
    name.trim() !== currentUser.name ||
    locale !== currentUser.locale ||
    theme !== currentUser.theme ||
    cycleStartDay !== currentUser.cycleStartDay;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOnline) return;

    if (!isDirty) {
      setSuccessMessage(t.settings.profileSavedSuccess);
      return;
    }

    setIsSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          name: name.trim(),
          locale,
          theme,
          cycleStartDay,
        }),
      });

      const payload = (await res.json()) as {
        ok?: boolean;
        data?: { user: AuthUser };
        error?: { code?: string; message?: string };
      };

      if (!res.ok || !payload.ok || !payload.data?.user) {
        setErrorMessage(
          payload.error?.message ?? t.errors.VALIDATION_ERROR,
        );
        return;
      }

      const updatedUser = payload.data.user;

      // Update root preferences without triggering persist handler loop (persist: false)
      updatePreferences(
        { locale: updatedUser.locale, theme: updatedUser.theme },
        { persist: false },
      );

      // Synchronize SyncProvider mirror meta immediately (recalculates Safe-to-Spend instantly)
      if (sync) {
        void sync.updateUserMeta(updatedUser);
      }

      setSuccessMessage(t.settings.profileSavedSuccess);
    } catch {
      setErrorMessage(t.errors.INTERNAL_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.profileTitle}</CardTitle>
        <CardDescription>{t.settings.profileSubtitle}</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {successMessage ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-[var(--status-income)]/40 bg-[var(--status-income)]/10 p-3 text-sm font-medium text-[var(--status-income)]"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
        ) : null}

        {errorMessage ? (
          <div
            role="alert"
            className="rounded-xl border border-[var(--status-expense)]/40 bg-[var(--status-expense)]/10 p-3 text-sm font-medium text-[var(--status-expense)]"
          >
            {errorMessage}
          </div>
        ) : null}

        {!isOnline ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-3 text-sm text-[var(--text-secondary)]"
          >
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t.settings.offlineProfileNotice}</span>
          </div>
        ) : null}

        <Input
          label={t.settings.emailLabel}
          value={currentUser.email}
          readOnly
          disabled
          hint={t.settings.emailHelp}
          className="cursor-not-allowed bg-[var(--bg-subtle)] opacity-75"
        />

        <Input
          label={t.settings.nameLabel}
          name="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSuccessMessage(null);
          }}
          placeholder={t.settings.namePlaceholder}
          required
          maxLength={120}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="settings-locale"
              className="text-sm font-medium text-[var(--text-primary)]"
            >
              {t.settings.localeLabel}
            </label>
            <select
              id="settings-locale"
              value={locale}
              onChange={(e) => {
                setLocale(e.target.value as Locale);
                setSuccessMessage(null);
              }}
              className="min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent-primary)] focus:outline-none"
            >
              <option value="id">{t.settings.localeOptionId}</option>
              <option value="en">{t.settings.localeOptionEn}</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="settings-theme"
              className="text-sm font-medium text-[var(--text-primary)]"
            >
              {t.settings.themeLabel}
            </label>
            <select
              id="settings-theme"
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value as Theme);
                setSuccessMessage(null);
              }}
              className="min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent-primary)] focus:outline-none"
            >
              <option value="light">{t.settings.themeOptionLight}</option>
              <option value="dark">{t.settings.themeOptionDark}</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="settings-cycle-start-day"
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            {t.settings.cycleStartDayLabel}
          </label>
          <select
            id="settings-cycle-start-day"
            value={cycleStartDay}
            onChange={(e) => {
              setCycleStartDay(e.target.value);
              setSuccessMessage(null);
            }}
            className="min-h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-2 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent-primary)] focus:outline-none"
          >
            {CYCLE_DAYS.map((day) => (
              <option key={day} value={day}>
                {day === "end_of_month"
                  ? t.settings.cycleEndOfMonth
                  : `${t.settings.cycleDayPrefix} ${day}`}
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--text-muted)]">
            {t.settings.cycleStartDayHelp}
          </p>
        </div>

        <div className="pt-2">
          <Button
            type="submit"
            disabled={!isOnline || isSubmitting}
            loading={isSubmitting}
            className="w-full sm:w-auto"
          >
            {isSubmitting
              ? t.settings.savingProfileButton
              : t.settings.saveProfileButton}
          </Button>
        </div>
      </form>
    </Card>
  );
}
