import { wipeAllOfflineData } from "@/features/sync/cleanup";
import {
  applySnapshotWithPendingReplay,
  isOfflineDbsSuppressed,
  listOutboxItems,
  readFullMirror,
  removeOutboxItem,
  updateOutboxItem,
  type MirrorDataState,
} from "@/features/sync/db";
import type {
  OutboxItemRecord,
  SnapshotDto,
  SyncEngineStatus,
} from "@/features/sync/types";

const DEFAULT_RETRY_DELAY_MS = 15_000;
const inMemoryLocks = new Map<string, Promise<void>>();

export interface FlushOutboxOptions {
  fetchImpl?: typeof fetch;
  nowFn?: () => number;
  isOnlineFn?: () => boolean;
  onUnauthorized?: () => void;
  onStatusChange?: (status: SyncEngineStatus) => void;
}

export interface FlushOutboxResult {
  status: SyncEngineStatus;
  flushedCount: number;
  failedCount: number;
  pendingCount: number;
  halted: boolean;
  unauthorized: boolean;
  mirror: MirrorDataState | null;
}

/**
 * Runs an exclusive task keyed per `userId` via `navigator.locks` when supported,
 * falling back cleanly to an in-memory promise chain so parallel triggers never duplicate flushes.
 */
export async function withSyncLock<T>(
  userId: string,
  task: () => Promise<T>,
): Promise<T> {
  const lockName = `noka-sync-${userId}`;

  if (
    typeof navigator !== "undefined" &&
    navigator.locks &&
    typeof navigator.locks.request === "function"
  ) {
    return navigator.locks.request(lockName, async () => task());
  }

  const prev = inMemoryLocks.get(lockName) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.catch(() => undefined).then(() => gate);
  inMemoryLocks.set(lockName, tail);

  try {
    await prev.catch(() => undefined);
    return await task();
  } finally {
    release();
    if (inMemoryLocks.get(lockName) === tail) {
      inMemoryLocks.delete(lockName);
    }
  }
}

/**
 * Parses HTTP `Retry-After` header (integer seconds or HTTP-date) into delay milliseconds.
 */
export function parseRetryAfterMs(
  response: Response,
  nowMs: number = Date.now(),
): number {
  const raw = response.headers.get("Retry-After");
  if (!raw) {
    return DEFAULT_RETRY_DELAY_MS;
  }

  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.max(1000, Number(trimmed) * 1000);
  }

  const parsedDateMs = Date.parse(trimmed);
  if (!Number.isNaN(parsedDateMs)) {
    return Math.max(1000, parsedDateMs - nowMs);
  }

  return DEFAULT_RETRY_DELAY_MS;
}

async function extractErrorPayload(response: Response): Promise<{
  code?: string;
  message?: string;
}> {
  try {
    const parsed = (await response.clone().json()) as {
      error?: { code?: unknown; message?: unknown };
    } | null;
    const code =
      typeof parsed?.error?.code === "string" ? parsed.error.code : undefined;
    const message =
      typeof parsed?.error?.message === "string"
        ? parsed.error.message
        : undefined;
    return { code, message };
  } catch {
    return {};
  }
}

function defaultIsOnline(): boolean {
  return typeof navigator === "undefined" || typeof navigator.onLine !== "boolean"
    ? true
    : navigator.onLine;
}

function isTerminal4xxStatus(status: number): boolean {
  return (
    status === 400 ||
    status === 403 ||
    status === 404 ||
    status === 409 ||
    status === 422
  );
}

interface CausalEntityProgress {
  lastClientUpdatedAtMs: number;
  appliedServerUpdatedAtMs: number;
}

function parseOutboxClientUpdatedAtMs(item: OutboxItemRecord): number {
  const bodyUpdatedAt =
    item.body !== null &&
    typeof item.body === "object" &&
    !Array.isArray(item.body) &&
    typeof item.body.updatedAt === "string"
      ? item.body.updatedAt
      : item.updatedAt;
  return Date.parse(bodyUpdatedAt);
}

async function resolveCausalOutgoingItem(
  userId: string,
  item: OutboxItemRecord,
  progress: CausalEntityProgress | undefined,
): Promise<{ item: OutboxItemRecord; clientUpdatedAtMs: number }> {
  const clientUpdatedAtMs = parseOutboxClientUpdatedAtMs(item);
  if (
    !progress ||
    Number.isNaN(clientUpdatedAtMs) ||
    clientUpdatedAtMs < progress.lastClientUpdatedAtMs ||
    clientUpdatedAtMs > progress.appliedServerUpdatedAtMs ||
    item.body === null ||
    typeof item.body !== "object" ||
    Array.isArray(item.body) ||
    typeof item.body.updatedAt !== "string"
  ) {
    return { item, clientUpdatedAtMs };
  }

  // Keep offline multi-step edits (e.g., offline POST -> PATCH) monotonic against server-assigned NOW() timestamps.
  const bumpedUpdatedAt = new Date(
    progress.appliedServerUpdatedAtMs + 1,
  ).toISOString();
  const nextBody = { ...item.body, updatedAt: bumpedUpdatedAt };
  await updateOutboxItem(userId, item.mutationId, (prev) => ({
    ...prev,
    body: nextBody,
    updatedAt: bumpedUpdatedAt,
  }));
  return {
    item: { ...item, body: nextBody, updatedAt: bumpedUpdatedAt },
    clientUpdatedAtMs,
  };
}

async function extractAppliedEntityTimestamp(response: Response): Promise<{
  serverNewer: boolean;
  appliedUpdatedAtMs: number | null;
}> {
  try {
    const payload = (await response.clone().json()) as {
      data?: {
        conflictResolved?: unknown;
        note?: { updatedAt?: unknown };
        folder?: { updatedAt?: unknown };
        transaction?: { updatedAt?: unknown };
      };
    } | null;

    const data = payload?.data;
    if (data?.conflictResolved === "server_newer") {
      return { serverNewer: true, appliedUpdatedAtMs: null };
    }

    const candidateIso =
      (typeof data?.note?.updatedAt === "string" ? data.note.updatedAt : null) ??
      (typeof data?.folder?.updatedAt === "string"
        ? data.folder.updatedAt
        : null) ??
      (typeof data?.transaction?.updatedAt === "string"
        ? data.transaction.updatedAt
        : null) ??
      response.headers.get("X-Note-Updated-At");

    if (!candidateIso) {
      return { serverNewer: false, appliedUpdatedAtMs: null };
    }

    const parsedMs = Date.parse(candidateIso);
    return {
      serverNewer: false,
      appliedUpdatedAtMs: Number.isNaN(parsedMs) ? null : parsedMs,
    };
  } catch {
    return { serverNewer: false, appliedUpdatedAtMs: null };
  }
}

/**
 * Executes the strict FIFO iOS-safe outbox state machine under an exclusive user lock (`RFC-009`, `OFFLINE-3`, `API-3`).
 */
export async function flushOutbox(
  userId: string,
  options: FlushOutboxOptions = {},
): Promise<FlushOutboxResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowFn = options.nowFn ?? Date.now;
  const isOnlineFn = options.isOnlineFn ?? defaultIsOnline;

  if (isOfflineDbsSuppressed()) {
    return {
      status: "offline",
      flushedCount: 0,
      failedCount: 0,
      pendingCount: 0,
      halted: false,
      unauthorized: false,
      mirror: null,
    };
  }

  return withSyncLock(userId, async () => {
    if (isOfflineDbsSuppressed()) {
      return {
        status: "offline",
        flushedCount: 0,
        failedCount: 0,
        pendingCount: 0,
        halted: false,
        unauthorized: false,
        mirror: null,
      };
    }
    if (!isOnlineFn()) {
      options.onStatusChange?.("offline");
      const mirror = await readFullMirror(userId).catch(() => null);
      const pendingCount =
        mirror?.outbox.filter((item) => item.status === "pending").length ?? 0;
      const failedCount =
        mirror?.outbox.filter((item) => item.status === "failed").length ?? 0;
      return {
        status: "offline",
        flushedCount: 0,
        failedCount,
        pendingCount,
        halted: false,
        unauthorized: false,
        mirror,
      };
    }

    options.onStatusChange?.("syncing");

    const allItems = await listOutboxItems(userId);
    const pendingItems = allItems.filter((item) => item.status === "pending");

    let flushedCount = 0;
    let halted = false;
    let unauthorized = false;
    const causalProgress = new Map<string, CausalEntityProgress>();

    for (const rawItem of pendingItems) {
      const nowMs = nowFn();
      if (rawItem.nextRetryAt !== null && rawItem.nextRetryAt > nowMs) {
        // Strict causal FIFO gating: do not let newer mutations overtake a delayed item.
        halted = true;
        break;
      }

      const entityKey = `${rawItem.entity}:${rawItem.entityId}`;
      const { item, clientUpdatedAtMs } = await resolveCausalOutgoingItem(
        userId,
        rawItem,
        causalProgress.get(entityKey),
      );

      let response: Response;
      try {
        const headers: Record<string, string> = {
          "Idempotency-Key": item.idempotencyKey,
        };
        if (item.body !== null) {
          headers["Content-Type"] = "application/json";
        }
        response = await fetchImpl(item.path, {
          method: item.method,
          credentials: "same-origin",
          headers,
          body: item.body !== null ? JSON.stringify(item.body) : undefined,
        });
      } catch (err) {
        await updateOutboxItem(userId, item.mutationId, (prev) => ({
          ...prev,
          retryCount: prev.retryCount + 1,
          lastError: err instanceof Error ? err.message : "Network request failed",
        }));
        halted = true;
        break;
      }

      if (response.status === 401) {
        unauthorized = true;
        halted = true;
        await wipeAllOfflineData(userId);
        options.onUnauthorized?.();
        return {
          status: "sync_error",
          flushedCount,
          failedCount: 0,
          pendingCount: 0,
          halted: true,
          unauthorized: true,
          mirror: null,
        };
      }

      if (response.ok) {
        const entityOutcome = await extractAppliedEntityTimestamp(response);
        if (entityOutcome.serverNewer) {
          causalProgress.delete(entityKey);
        } else if (
          entityOutcome.appliedUpdatedAtMs !== null &&
          !Number.isNaN(clientUpdatedAtMs)
        ) {
          causalProgress.set(entityKey, {
            lastClientUpdatedAtMs: clientUpdatedAtMs,
            appliedServerUpdatedAtMs: entityOutcome.appliedUpdatedAtMs,
          });
        }
        await removeOutboxItem(userId, item.mutationId);
        flushedCount += 1;
        continue;
      }

      const errorPayload = await extractErrorPayload(response);
      if (isTerminal4xxStatus(response.status)) {
        await updateOutboxItem(userId, item.mutationId, (prev) => ({
          ...prev,
          status: "failed",
          lastError:
            errorPayload.message ??
            errorPayload.code ??
            `HTTP ${response.status}`,
        }));
        continue;
      }

      if (response.status === 429) {
        const retryDelay = parseRetryAfterMs(response, nowMs);
        await updateOutboxItem(userId, item.mutationId, (prev) => ({
          ...prev,
          retryCount: prev.retryCount + 1,
          nextRetryAt: nowMs + retryDelay,
          lastError: errorPayload.message ?? "Rate limited (429)",
        }));
        halted = true;
        break;
      }

      // 5xx or unexpected transient response -> pause FIFO loop cleanly and preserve pending item.
      await updateOutboxItem(userId, item.mutationId, (prev) => ({
        ...prev,
        retryCount: prev.retryCount + 1,
        lastError:
          errorPayload.message ??
          errorPayload.code ??
          `Server error (${response.status})`,
      }));
      halted = true;
      break;
    }

    let mirror: MirrorDataState | null = null;
    if (!halted) {
      if (isOfflineDbsSuppressed()) {
        return {
          status: "offline",
          flushedCount,
          failedCount: 0,
          pendingCount: 0,
          halted: true,
          unauthorized: false,
          mirror: null,
        };
      }
      try {
        const snapRes = await fetchImpl("/api/sync/snapshot", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });

        if (isOfflineDbsSuppressed()) {
          return {
            status: "offline",
            flushedCount,
            failedCount: 0,
            pendingCount: 0,
            halted: true,
            unauthorized: false,
            mirror: null,
          };
        }

        if (snapRes.status === 401) {
          await wipeAllOfflineData(userId);
          options.onUnauthorized?.();
          return {
            status: "sync_error",
            flushedCount,
            failedCount: 0,
            pendingCount: 0,
            halted: true,
            unauthorized: true,
            mirror: null,
          };
        }

        if (snapRes.ok) {
          const snapJson = (await snapRes.json()) as {
            ok?: boolean;
            data?: SnapshotDto;
          } | null;
          if (snapJson?.ok && snapJson.data) {
            mirror = await applySnapshotWithPendingReplay(userId, snapJson.data);
          } else {
            halted = true;
          }
        } else {
          halted = true;
        }
      } catch {
        halted = true;
      }
    }

    if (!mirror) {
      mirror = await readFullMirror(userId).catch(() => null);
    }

    const remainingOutbox = mirror?.outbox ?? [];
    const remainingPending = remainingOutbox.filter(
      (entry) => entry.status === "pending",
    ).length;
    const remainingFailed = remainingOutbox.filter(
      (entry) => entry.status === "failed",
    ).length;

    const finalStatus: SyncEngineStatus = !isOnlineFn()
      ? "offline"
      : halted || remainingFailed > 0 || remainingPending > 0
        ? "sync_error"
        : "synced";

    options.onStatusChange?.(finalStatus);
    return {
      status: finalStatus,
      flushedCount,
      failedCount: remainingFailed,
      pendingCount: remainingPending,
      halted,
      unauthorized,
      mirror,
    };
  });
}

/**
 * Discards one failed outbox mutation (`SyncStatusBadge` Discard action) and refreshes the server mirror when online.
 */
export async function discardOutboxMutation(
  userId: string,
  mutationId: string,
  options: FlushOutboxOptions = {},
): Promise<FlushOutboxResult> {
  await withSyncLock(userId, async () => {
    await removeOutboxItem(userId, mutationId);
  });

  // Flush / refresh snapshot to restore clean server state + replay any remaining valid pending mutations.
  return flushOutbox(userId, options);
}

/**
 * Summarizes outbox items into counts and failed entries for UI display.
 */
export function summarizeOutboxState(outbox: readonly OutboxItemRecord[]): {
  pendingCount: number;
  failedItems: OutboxItemRecord[];
} {
  let pendingCount = 0;
  const failedItems: OutboxItemRecord[] = [];
  for (const item of outbox) {
    if (item.status === "pending") {
      pendingCount += 1;
    } else if (item.status === "failed") {
      failedItems.push(item);
    }
  }
  return { pendingCount, failedItems };
}

