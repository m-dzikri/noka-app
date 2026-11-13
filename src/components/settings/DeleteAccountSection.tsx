"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, WifiOff } from "lucide-react";
import { useOptionalSync } from "@/components/providers/SyncProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { runClientLogoutCleanup } from "@/features/auth/client-cleanup";
import { useI18n } from "@/lib/i18n/context";
import { enDictionary } from "@/lib/i18n/dictionaries/en";
import { idDictionary } from "@/lib/i18n/dictionaries/id";

export function DeleteAccountSection() {
  const { t, locale } = useI18n();
  const settings =
    t?.settings ?? (locale === "en" ? enDictionary.settings : idDictionary.settings);
  const sync = useOptionalSync();
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmWordInput, setConfirmWordInput] = useState("");
  const [password, setPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const isOnline = sync ? sync.isOnline : typeof navigator === "undefined" || navigator.onLine !== false;

  const expectedConfirmWord = settings.deleteModalConfirmWord.toUpperCase();
  const isConfirmWordMatch =
    confirmWordInput.trim().toUpperCase() === expectedConfirmWord ||
    confirmWordInput.trim().toUpperCase() === "HAPUS" ||
    confirmWordInput.trim().toUpperCase() === "DELETE";

  const isDeleteReady = isConfirmWordMatch && password.length > 0;

  const handleOpenModal = () => {
    setConfirmWordInput("");
    setPassword("");
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setConfirmWordInput("");
    setPassword("");
    setModalError(null);
  };

  const handleDeleteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isDeleteReady || isSubmitting) return;

    setIsSubmitting(true);
    setModalError(null);

    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });

      const payload = (await res.json()) as {
        ok?: boolean;
        error?: { code?: string; message?: string };
      };

      if (!res.ok || !payload.ok) {
        if (payload.error?.code === "INVALID_PASSWORD") {
          setModalError(settings.invalidPasswordError);
        } else {
          setModalError(
            payload.error?.message ?? settings.deleteAccountGenericError,
          );
        }
        setIsSubmitting(false);
        return;
      }

      // Success: execute full client logout cleanup (wiping IndexedDB & SW private caches)
      await runClientLogoutCleanup();

      // Redirect to public landing page
      router.push("/");
      if (typeof window !== "undefined" && typeof window.location?.assign === "function") {
        try {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full document navigation ensures complete teardown of React tree & private in-memory state on account deletion
          window.location.assign("/");
        } catch {
          // jsdom throws "Not implemented: navigation to another Document"
        }
      }
    } catch {
      setModalError(settings.deleteAccountGenericError);
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Card className="border-[var(--status-expense)]/40 bg-[var(--status-expense)]/5">
        <CardHeader>
          <div className="flex items-center gap-2 text-[var(--status-expense)]">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <CardTitle className="text-[var(--status-expense)]">
              {settings.deleteAccountTitle}
            </CardTitle>
          </div>
          <CardDescription>{settings.deleteAccountSubtitle}</CardDescription>
        </CardHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--status-expense)]/20 bg-[var(--bg-surface)] p-4 text-sm text-[var(--text-secondary)]">
            <p className="font-semibold text-[var(--text-primary)]">
              {settings.deleteAccountWarningHeading}
            </p>
            <p className="mt-1 leading-relaxed">
              {settings.deleteAccountWarningBody}
            </p>
          </div>

          {!isOnline ? (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-3 text-sm text-[var(--text-secondary)]"
            >
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{settings.offlineDeleteAccountNotice}</span>
            </div>
          ) : null}

          <div>
            <Button
              variant="danger"
              onClick={handleOpenModal}
              disabled={!isOnline}
              className="w-full sm:w-auto"
            >
              {settings.deleteAccountButton}
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        title={settings.deleteModalTitle}
        className="max-w-lg"
      >
        <form onSubmit={handleDeleteSubmit} className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {settings.deleteModalBody}
          </p>

          {modalError ? (
            <div
              role="alert"
              className="rounded-xl border border-[var(--status-expense)]/40 bg-[var(--status-expense)]/10 p-3 text-sm font-medium text-[var(--status-expense)]"
            >
              {modalError}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="delete-confirm-word"
              className="text-sm font-medium text-[var(--text-primary)]"
            >
              {settings.deleteModalConfirmPrompt}
            </label>
            <Input
              id="delete-confirm-word"
              value={confirmWordInput}
              onChange={(e) => {
                setConfirmWordInput(e.target.value);
                setModalError(null);
              }}
              placeholder={settings.deleteModalConfirmWord}
              autoComplete="off"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Input
              id="delete-account-password"
              label={settings.deleteModalPasswordLabel}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setModalError(null);
              }}
              placeholder={settings.deleteModalPasswordPlaceholder}
              autoComplete="current-password"
              required
            />
          </div>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseModal}
              disabled={isSubmitting}
            >
              {settings.deleteModalCancelButton}
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={!isDeleteReady || isSubmitting}
              loading={isSubmitting}
            >
              {isSubmitting
                ? settings.deleteModalDeletingButton
                : settings.deleteModalConfirmButton}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
