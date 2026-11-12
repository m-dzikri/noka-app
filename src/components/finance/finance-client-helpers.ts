"use client";

import type { Dictionary } from "@/lib/i18n/types";

export interface ApiErrorPayload {
  ok?: false;
  error?: {
    code?: string;
    message?: string;
  };
}

export const FINANCE_UPDATED_EVENT = "noka:finance-updated";
export const WORKSPACE_UPDATED_EVENT = "noka:workspace-updated";

export interface WorkspaceUpdatedDetail {
  kind: "transaction" | "note";
  id?: string;
  source?: string;
}

/**
 * Resolves a backend API error envelope to a localized dictionary string.
 */
export function resolveFinanceErrorMessage(
  t: Dictionary,
  payload: ApiErrorPayload | null,
): string {
  const code = payload?.error?.code;
  if (code && code in t.errors) {
    return t.errors[code as keyof Dictionary["errors"]];
  }
  return t.errors.generic;
}

/**
 * Safely extracts JSON from a Response without throwing on non-JSON error payloads.
 */
export async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Dispatches the cross-workspace finance sync event (`RFC-006`, `RFC-008`).
 */
export function dispatchFinanceUpdated(source = "finance-workspace"): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(FINANCE_UPDATED_EVENT, { detail: { source } }),
    );
  }
}

/**
 * Dispatches the cross-workspace live update event (`RFC-008`, `AC-8.2`).
 */
export function dispatchWorkspaceUpdated(
  detail: WorkspaceUpdatedDetail,
): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<WorkspaceUpdatedDetail>(WORKSPACE_UPDATED_EVENT, {
        detail,
      }),
    );
  }
}

/**
 * Formats an ISO timestamp (or Date.now) as a `datetime-local` input value in local wall-clock time.
 */
export function toDateTimeLocalValue(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${safeDate.getFullYear()}-${pad(safeDate.getMonth() + 1)}-${pad(
    safeDate.getDate(),
  )}T${pad(safeDate.getHours())}:${pad(safeDate.getMinutes())}`;
}

/**
 * Converts a `datetime-local` value into an ISO-8601 UTC string with current timezone awareness.
 */
export function fromDateTimeLocalValue(localValue: string): string | null {
  const trimmed = localValue.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

