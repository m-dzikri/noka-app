import type { TransactionDto } from "@/features/finance/transactions-service";
import type { TransferDto } from "@/features/finance/transfers-service";
import { parseChecklists } from "@/features/notes/checklist";
import type {
  FolderDto,
  NoteDto,
  NoteTagItemDto,
} from "@/features/notes/service";
import {
  applyOptimisticToMirror,
  enqueueOutboxMutation,
} from "@/features/sync/db";
import type {
  OutboxEntity,
  OutboxMethod,
  OutboxOp,
  OutboxOptimisticPayload,
} from "@/features/sync/types";
import { apiFetch } from "@/lib/http-client";

export interface SyncMutationContext {
  userId: string;
  isOnline: boolean;
  storageAvailable: boolean;
  onMirrorChanged?: () => void;
}

export interface ClientMutationOutcome<T> {
  mode: "online" | "queued";
  data?: T;
  response?: Response;
  errorStatus?: number;
  errorPayload?: {
    ok?: false;
    error?: { code?: string; message?: string };
  } | null;
}

export function isLikelyNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof DOMException && error.name === "NetworkError") {
    return true;
  }
  return false;
}

async function safeParseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Executes an Online-Direct mutation and falls back seamlessly to IndexedDB outbox + optimistic mirror
 * when offline or hitting a transient network failure (RFC-009, OFFLINE-3, API-3).
 */
export async function executeOfflineCapableMutation<T>(
  ctx: SyncMutationContext | null | undefined,
  params: {
    entity: OutboxEntity;
    entityId: string;
    op: OutboxOp;
    method: OutboxMethod;
    path: string;
    body: Record<string, unknown> | null;
    idempotencyKey?: string;
    updatedAt?: string;
    optimisticSnapshot: OutboxOptimisticPayload;
    onlineFetchImpl?: typeof apiFetch;
  },
): Promise<ClientMutationOutcome<T>> {
  const fetchFn = params.onlineFetchImpl ?? apiFetch;
  const bodyIdempotencyKey =
    typeof params.body?.idempotencyKey === "string" &&
    params.body.idempotencyKey.trim().length > 0
      ? params.body.idempotencyKey.trim()
      : undefined;
  const idempotencyKey =
    params.idempotencyKey ?? bodyIdempotencyKey ?? crypto.randomUUID();
  const updatedAt = params.updatedAt ?? new Date().toISOString();
  const effectiveOnline =
    ctx !== undefined && ctx !== null
      ? ctx.isOnline
      : typeof navigator === "undefined" || navigator.onLine !== false;

  const queueLocally = async (): Promise<ClientMutationOutcome<T>> => {
    if (!ctx || !ctx.storageAvailable) {
      return {
        mode: "online",
        errorStatus: 0,
        errorPayload: {
          ok: false,
          error: {
            code: "NETWORK_UNAVAILABLE",
            message: "Network unavailable and offline storage disabled",
          },
        },
      };
    }

    await enqueueOutboxMutation(ctx.userId, {
      mutationId: crypto.randomUUID(),
      createdAt: Date.now(),
      idempotencyKey,
      entity: params.entity,
      entityId: params.entityId,
      op: params.op,
      method: params.method,
      path: params.path,
      body: params.body,
      optimisticSnapshot: params.optimisticSnapshot,
      updatedAt,
      status: "pending",
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
    });
    ctx.onMirrorChanged?.();
    return { mode: "queued" };
  };

  if (!effectiveOnline) {
    return queueLocally();
  }

  try {
    const headers: Record<string, string> = {
      "Idempotency-Key": idempotencyKey,
    };
    if (params.body !== null) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetchFn(params.path, {
      method: params.method,
      headers,
      body: params.body !== null ? JSON.stringify(params.body) : undefined,
    });

    const payload = await safeParseJson<{
      ok?: boolean;
      data?: T;
      error?: { code?: string; message?: string };
    }>(response);

    if (!response.ok || !payload?.ok) {
      return {
        mode: "online",
        response,
        errorStatus: response.status,
        errorPayload: {
          ok: false,
          error: payload?.error,
        },
      };
    }

    if (ctx && ctx.storageAvailable) {
      await applyOptimisticToMirror(ctx.userId, params.optimisticSnapshot).catch(
        () => undefined,
      );
      ctx.onMirrorChanged?.();
    }

    return {
      mode: "online",
      response,
      data: payload.data,
    };
  } catch (error) {
    if (isLikelyNetworkError(error) && ctx?.storageAvailable) {
      return queueLocally();
    }
    throw error;
  }
}

/**
 * Helper constructing a valid optimistic `NoteDto` from draft fields (`RFC-004` + `RFC-009`).
 */
export function buildOptimisticNoteDto(params: {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  folderName: string | null;
  isPinned: boolean;
  tagNames: readonly string[];
  existingTags?: readonly NoteTagItemDto[];
  createdAt?: string;
  updatedAt?: string;
}): NoteDto {
  const nowIso = params.updatedAt ?? new Date().toISOString();
  const checklists = parseChecklists(params.content);
  const existingByName = new Map(
    (params.existingTags ?? []).map((t) => [t.name.toLowerCase(), t]),
  );

  const tags: NoteTagItemDto[] = params.tagNames.map((rawName) => {
    const trimmed = rawName.trim();
    const matched = existingByName.get(trimmed.toLowerCase());
    return matched ?? { id: crypto.randomUUID(), name: trimmed };
  });

  return {
    id: params.id,
    folderId: params.folderId,
    folderName: params.folderName,
    title: params.title,
    content: params.content,
    isPinned: params.isPinned,
    tags,
    checklistTotal: checklists.length,
    checklistCompleted: checklists.filter((c) => c.checked).length,
    createdAt: params.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Helper constructing a valid optimistic `FolderDto`.
 */
export function buildOptimisticFolderDto(params: {
  id: string;
  name: string;
  noteCount?: number;
  createdAt?: string;
  updatedAt?: string;
}): FolderDto {
  const nowIso = params.updatedAt ?? new Date().toISOString();
  return {
    id: params.id,
    name: params.name,
    noteCount: params.noteCount ?? 0,
    createdAt: params.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Helper constructing a valid optimistic `TransactionDto`.
 */
export function buildOptimisticTransactionDto(params: {
  id: string;
  walletId: string;
  walletName: string;
  categoryId: string;
  categoryName: string;
  noteId: string | null;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  occurredAt: string;
  createdAt?: string;
  updatedAt?: string;
}): TransactionDto {
  const nowIso = params.updatedAt ?? new Date().toISOString();
  return {
    id: params.id,
    walletId: params.walletId,
    walletName: params.walletName,
    categoryId: params.categoryId,
    categoryName: params.categoryName,
    noteId: params.noteId,
    type: params.type,
    amount: params.amount,
    description: params.description,
    occurredAt: params.occurredAt,
    createdAt: params.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Helper constructing a valid optimistic `TransferDto`.
 */
export function buildOptimisticTransferDto(params: {
  id: string;
  fromWalletId: string;
  fromWalletName: string;
  toWalletId: string;
  toWalletName: string;
  amount: number;
  note: string | null;
  occurredAt: string;
  createdAt?: string;
  updatedAt?: string;
}): TransferDto {
  const nowIso = params.updatedAt ?? new Date().toISOString();
  return {
    id: params.id,
    fromWalletId: params.fromWalletId,
    fromWalletName: params.fromWalletName,
    toWalletId: params.toWalletId,
    toWalletName: params.toWalletName,
    amount: params.amount,
    note: params.note,
    occurredAt: params.occurredAt,
    createdAt: params.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
}

