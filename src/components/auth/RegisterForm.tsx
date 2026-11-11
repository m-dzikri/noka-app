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

/**
 * Frictionless registration form syncing active theme/locale preferences into the created user profile.
 */
export function RegisterForm() {
  const router = useRouter();
  const { t } = useI18n();
  const { locale, theme } = usePreferences();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setNameError(undefined);
    setEmailError(undefined);
    setPasswordError(undefined);
    setConfirmError(undefined);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    let hasError = false;

    if (!trimmedName) {
      setNameError(t.auth.nameRequiredError);
      hasError = true;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setEmailError(t.auth.emailInvalidError);
      hasError = true;
    }
    if (password.length < 8) {
      setPasswordError(t.auth.passwordTooShortError);
      hasError = true;
    }
    if (confirmPassword !== password) {
      setConfirmError(t.auth.passwordMismatchError);
      hasError = true;
    }
    if (hasError) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password,
          locale,
          theme,
        }),
      });

      const payload = (await response
        .json()
        .catch(() => null)) as ApiErrorPayload | null;

      if (!response.ok) {
        setFormError(resolveAuthErrorMessage(t, response, payload));
        return;
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
          {t.auth.registerTitle}
        </CardTitle>
        <CardDescription>{t.auth.registerSubtitle}</CardDescription>
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
            type="text"
            name="name"
            autoComplete="name"
            label={t.auth.nameLabel}
            placeholder={t.auth.namePlaceholder}
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={nameError}
            required
          />

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
            autoComplete="new-password"
            label={t.auth.passwordLabel}
            placeholder={t.auth.passwordPlaceholder}
            hint={t.auth.passwordHint}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={passwordError}
            required
          />

          <Input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            label={t.auth.confirmPasswordLabel}
            placeholder={t.auth.confirmPasswordPlaceholder}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={confirmError}
            required
          />

          <Button
            type="submit"
            shape="pill"
            disabled={submitting}
            className="w-full font-semibold"
          >
            {submitting ? t.auth.registeringButton : t.auth.registerButton}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center border-t border-[var(--border-subtle)] pt-4 text-sm text-[var(--text-secondary)]">
        <span>{t.auth.hasAccountPrompt}</span>
        <Link
          href="/login"
          className="font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline"
        >
          {t.auth.signInLink}
        </Link>
      </CardFooter>
    </Card>
  );
}

