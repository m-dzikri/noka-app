"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  resolveAuthErrorMessage,
  type ApiErrorPayload,
} from "@/components/auth/auth-error";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/lib/i18n/context";

export interface ResetPasswordFormProps {
  initialToken?: string;
}

/**
 * Password reset completion form validating missing URL tokens, password confirmation, and single-use submission.
 */
export function ResetPasswordForm({ initialToken }: ResetPasswordFormProps) {
  const { t } = useI18n();
  const token = initialToken?.trim() ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setPasswordError(undefined);
    setConfirmError(undefined);

    let hasError = false;
    if (newPassword.length < 8) {
      setPasswordError(t.auth.passwordTooShortError);
      hasError = true;
    }
    if (confirmPassword !== newPassword) {
      setConfirmError(t.auth.passwordMismatchError);
      hasError = true;
    }
    if (hasError) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword,
        }),
      });

      const payload = (await response
        .json()
        .catch(() => null)) as ApiErrorPayload | null;

      if (!response.ok) {
        setFormError(resolveAuthErrorMessage(t, response, payload));
        return;
      }

      setCompleted(true);
    } catch {
      setFormError(t.errors.generic);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-2xl">
          {t.auth.resetPasswordTitle}
        </CardTitle>
        <CardDescription>{t.auth.resetPasswordSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {!token ? (
          <div className="flex flex-col gap-3">
            <div
              role="alert"
              className="rounded-[var(--radius-md)] border border-[var(--status-expense)] bg-[var(--bg-subtle)] px-3 py-3 text-sm text-[var(--status-expense)]"
            >
              {t.auth.resetTokenMissingError}
            </div>
            <Link
              href="/forgot-password"
              className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            >
              {t.auth.requestNewLink}
            </Link>
          </div>
        ) : completed ? (
          <div className="flex flex-col gap-4">
            <div
              role="status"
              className="rounded-[var(--radius-md)] border border-[var(--status-income)] bg-[var(--bg-subtle)] px-3 py-3 text-sm text-[var(--status-income)]"
            >
              {t.auth.resetPasswordSuccess}
            </div>
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]"
            >
              {t.auth.loginButton}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            {formError ? (
              <div
                role="alert"
                className="rounded-[var(--radius-md)] border border-[var(--status-expense)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--status-expense)]"
              >
                {formError}
              </div>
            ) : null}

            <Input
              type="password"
              name="newPassword"
              autoComplete="new-password"
              label={t.auth.newPasswordLabel}
              placeholder={t.auth.passwordPlaceholder}
              hint={t.auth.passwordHint}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              error={passwordError}
              required
            />

            <Input
              type="password"
              name="confirmNewPassword"
              autoComplete="new-password"
              label={t.auth.confirmNewPasswordLabel}
              placeholder={t.auth.confirmPasswordPlaceholder}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              error={confirmError}
              required
            />

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting
                ? t.auth.resettingPasswordButton
                : t.auth.resetPasswordButton}
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter className="justify-center border-t border-[var(--border-default)] pt-4 text-sm">
        <Link
          href="/login"
          className="font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline"
        >
          {t.auth.backToLoginLink}
        </Link>
      </CardFooter>
    </Card>
  );
}

