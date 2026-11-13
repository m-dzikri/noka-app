"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, WifiOff } from "lucide-react";
import { useOptionalSync } from "@/components/providers/SyncProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/lib/i18n/context";
import { enDictionary } from "@/lib/i18n/dictionaries/en";
import { idDictionary } from "@/lib/i18n/dictionaries/id";

export function ChangePasswordForm() {
  const { t, locale } = useI18n();
  const settings =
    t?.settings ?? (locale === "en" ? enDictionary.settings : idDictionary.settings);
  const sync = useOptionalSync();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);

  const isOnline = sync ? sync.isOnline : typeof navigator === "undefined" || navigator.onLine !== false;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOnline) return;

    setSuccessMessage(null);
    setErrorMessage(null);
    setCurrentPasswordError(null);

    if (newPassword !== confirmPassword) {
      setErrorMessage(settings.passwordMismatchError);
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage(settings.newPasswordHelp);
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/account/password", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const payload = (await res.json()) as {
        ok?: boolean;
        error?: { code?: string; message?: string };
      };

      if (!res.ok || !payload.ok) {
        if (payload.error?.code === "INVALID_CURRENT_PASSWORD") {
          setCurrentPasswordError(settings.invalidCurrentPasswordError);
        } else {
          setErrorMessage(payload.error?.message ?? t.errors.VALIDATION_ERROR);
        }
        return;
      }

      // Success: clear form fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMessage(settings.passwordChangedSuccess);
    } catch {
      setErrorMessage(t.errors.INTERNAL_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{settings.passwordTitle}</CardTitle>
        <CardDescription>{settings.passwordSubtitle}</CardDescription>
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
            <span>{settings.offlinePasswordNotice}</span>
          </div>
        ) : null}

        <Input
          label={settings.currentPasswordLabel}
          type="password"
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value);
            setCurrentPasswordError(null);
            setSuccessMessage(null);
          }}
          placeholder={settings.currentPasswordPlaceholder}
          error={currentPasswordError ?? undefined}
          required
        />

        <Input
          label={settings.newPasswordLabel}
          type="password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          placeholder={settings.newPasswordPlaceholder}
          hint={settings.newPasswordHelp}
          required
          minLength={8}
          maxLength={128}
        />

        <Input
          label={settings.confirmPasswordLabel}
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          placeholder={settings.confirmPasswordPlaceholder}
          required
          minLength={8}
          maxLength={128}
        />

        <div className="pt-2">
          <Button
            type="submit"
            disabled={!isOnline || isSubmitting}
            loading={isSubmitting}
            className="w-full sm:w-auto"
          >
            {isSubmitting
              ? settings.changingPasswordButton
              : settings.changePasswordButton}
          </Button>
        </div>
      </form>
    </Card>
  );
}

