"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Trash2,
  WifiOff,
} from "lucide-react";
import { useOptionalSync } from "@/components/providers/SyncProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/context";

/**
 * Persistent AppShell header indicator + interactive popover modal displaying offline
 * mirror status, pending queue count, failed items with Discard action, and manual Sync Now (`OFFLINE-2`, `OFFLINE-3`).
 */
export function SyncStatusBadge() {
  const { t, locale } = useI18n();
  const sync = useOptionalSync();
  const [open, setOpen] = useState(false);

  if (!sync) {
    return null;
  }

  const {
    status,
    isOnline,
    pendingCount,
    failedItems,
    lastSyncedAt,
    syncNow,
    discardFailedMutation,
  } = sync;

  const badgeLabel =
    status === "offline"
      ? t.sync.statusOffline
      : status === "syncing"
        ? t.sync.statusSyncing
        : status === "sync_error"
          ? t.sync.statusSyncError
          : t.sync.statusSynced;

  const totalAttentionCount = pendingCount + failedItems.length;

  const formattedLastSynced = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString(locale === "en" ? "en-US" : "id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      })
    : t.sync.neverSyncedLabel;

  return (
    <>
      <button
        type="button"
        data-testid="sync-status-badge"
        data-sync-status={status}
        onClick={() => setOpen(true)}
        aria-label={`${t.sync.statusAriaLabel}: ${badgeLabel}`}
        className={cn(
          "inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]",
          status === "sync_error"
            ? "border-[var(--status-expense)]/40 bg-[var(--status-expense)]/10 text-[var(--status-expense)]"
            : status === "offline"
              ? "border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] shadow-xs dark:border-[var(--border-strong,#52525b)] dark:bg-[var(--bg-surface)] dark:text-[var(--text-primary)]"
              : status === "syncing"
                ? "border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 text-[var(--text-primary)]"
                : "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
        )}
      >
        {status === "offline" ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)] dark:bg-[var(--text-secondary)]"
              aria-hidden="true"
            />
            <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </span>
        ) : status === "syncing" ? (
          <RefreshCw
            className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin"
            aria-hidden="true"
          />
        ) : status === "sync_error" ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2
            className="h-3.5 w-3.5 shrink-0 text-[var(--status-income)]"
            aria-hidden="true"
          />
        )}
        <span
          className={cn(
            "whitespace-nowrap",
            status === "synced" && totalAttentionCount === 0
              ? "hidden sm:inline"
              : "inline",
          )}
        >
          {badgeLabel}
        </span>
        {totalAttentionCount > 0 ? (
          <span
            data-testid="sync-pending-badge-count"
            className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-primary)] px-1 text-[10px] font-bold text-[var(--accent-foreground)]"
          >
            {totalAttentionCount}
          </span>
        ) : null}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t.sync.panelTitle}
        className="max-w-md"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">
                {t.sync.statusAriaLabel}
              </span>
              <span className="font-semibold text-[var(--text-primary)]">
                {badgeLabel}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">
                {t.sync.pendingCountPrefix}
              </span>
              <span className="font-medium tabular-nums text-[var(--text-primary)]">
                {pendingCount}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">
                {t.sync.failedCountPrefix}
              </span>
              <span className="font-medium tabular-nums text-[var(--text-primary)]">
                {failedItems.length}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-secondary)]">
                {t.sync.lastSyncedPrefix}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {formattedLastSynced}
              </span>
            </div>
          </div>

          {failedItems.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--status-expense)]">
                {t.sync.failedItemsHeading}
              </h3>
              <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                {failedItems.map((item) => (
                  <li
                    key={item.mutationId}
                    data-testid={`failed-mutation-${item.mutationId}`}
                    className="flex items-start justify-between gap-2 rounded-xl border border-[var(--status-expense)]/40 bg-[var(--status-expense)]/10 p-2.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--text-primary)]">
                        {item.entity} · {item.op}
                      </p>
                      <p className="mt-0.5 break-words text-[var(--text-secondary)]">
                        {item.lastError || item.path}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void discardFailedMutation(item.mutationId)}
                      className="shrink-0 text-[var(--status-expense)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t.sync.discardMutationButton}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setOpen(false)}
            >
              {t.sync.panelCloseButton}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={!isOnline || status === "syncing"}
              onClick={() => void syncNow()}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  status === "syncing" && "motion-safe:animate-spin",
                )}
                aria-hidden="true"
              />
              <span>
                {status === "syncing"
                  ? t.sync.syncingButton
                  : t.sync.syncNowButton}
              </span>
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
