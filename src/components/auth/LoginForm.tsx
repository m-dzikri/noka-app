"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useI18n, usePreferences } from "@/lib/i18n/context";
import type { Locale, Theme } from "@/lib/i18n/types";

interface LoginSuccessPayload {
  ok: true;
  data: {
    user: {
      locale: Locale;
      theme: Theme;
    };
  };
}

/**
 * Client login form with localized validation, CSRF cookie submission, and preference sync.
 */
export function LoginForm() {
  const router = useRouter();
  const { t } = useI18n();
  const { updatePreferences } = usePreferences();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setEmailError(undefined);
    setPasswordError(undefined);

    const formData = new FormData(event.currentTarget);
    const rawEmail = (formData.get("email") as string) || email;
    const rawPassword = (formData.get("password") as string) || password;
    const trimmedEmail = (rawEmail || "").trim();
    let hasClientError = false;
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setEmailError(t.auth.emailInvalidError);
      hasClientError = true;
    }
    if (!rawPassword) {
      setPasswordError(t.errors.VALIDATION_ERROR);
      hasClientError = true;
    }
    if (hasClientError) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          password: rawPassword,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | LoginSuccessPayload
        | ApiErrorPayload
        | null;

      if (!response.ok) {
        setFormError(
          resolveAuthErrorMessage(
            t,
            response,
            payload as ApiErrorPayload | null,
          ),
        );
        return;
      }

      if (payload?.ok === true) {
        updatePreferences(
          {
            locale: payload.data.user.locale,
            theme: payload.data.user.theme,
          },
          { persist: false },
        );
      }

      router.push("/app/notes");
      router.refresh();
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
          {t.auth.loginTitle}
        </CardTitle>
        <CardDescription>{t.auth.loginSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
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

          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            label={t.auth.passwordLabel}
            placeholder={t.auth.passwordPlaceholder}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={passwordError}
            required
          />

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--text-primary)] hover:underline"
            >
              {t.auth.forgotPasswordLink}
            </Link>
          </div>

          <Button
            type="submit"
            shape="pill"
            disabled={submitting}
            className="w-full font-semibold"
          >
            {submitting ? t.auth.loggingInButton : t.auth.loginButton}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center border-t border-[var(--border-subtle)] pt-4 text-sm text-[var(--text-secondary)]">
        <span>{t.auth.noAccountPrompt}</span>
        <Link
          href="/register"
          className="font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline"
        >
          {t.auth.createAccountLink}
        </Link>
      </CardFooter>
    </Card>
  );
}
