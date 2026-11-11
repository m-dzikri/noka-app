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

/**
 * Forgot-password request form displaying identical neutral success messaging regardless of email registration (API-4).
 */
export function ForgotPasswordForm() {
  const { t } = useI18n();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setEmailError(undefined);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setEmailError(t.auth.emailInvalidError);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const payload = (await response
        .json()
        .catch(() => null)) as ApiErrorPayload | null;

      if (!response.ok) {
        setFormError(resolveAuthErrorMessage(t, response, payload));
        return;
      }

      setSubmitted(true);
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
          {t.auth.forgotPasswordTitle}
        </CardTitle>
        <CardDescription>{t.auth.forgotPasswordSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {submitted ? (
          <div
            role="status"
            className="rounded-[var(--radius-md)] border border-[var(--status-income)] bg-[var(--bg-subtle)] px-3 py-3 text-sm text-[var(--status-income)]"
          >
            {t.auth.forgotPasswordGenericSuccess}
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
              type="email"
              name="email"
              autoComplete="email"
              label={t.auth.emailLabel}
              placeholder={t.auth.emailPlaceholder}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={emailError}
              required
            />

            <Button
              type="submit"
              shape="pill"
              disabled={submitting}
              className="w-full font-semibold"
            >
              {submitting
                ? t.auth.sendingResetLinkButton
                : t.auth.sendResetLinkButton}
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter className="justify-center border-t border-[var(--border-subtle)] pt-4 text-sm">
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

