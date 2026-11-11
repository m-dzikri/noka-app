"use client";

import { runClientLogoutCleanup } from "@/features/auth/client-cleanup";

export type UnauthorizedRedirectHandler = (targetPath: string) => void;

let unauthorizedRedirectHandler: UnauthorizedRedirectHandler | null = null;

/**
 * Allows overriding the client redirect behavior in isolated unit tests.
 */
export function setUnauthorizedRedirectHandlerForTest(
  handler: UnauthorizedRedirectHandler | null,
): void {
  unauthorizedRedirectHandler = handler;
}

function redirectToLogin(): void {
  if (unauthorizedRedirectHandler) {
    unauthorizedRedirectHandler("/login");
    return;
  }

  if (typeof window !== "undefined") {
    const loginUrl = new URL("/login", window.location.origin).toString();
    window.location.assign(loginUrl);
  }
}

/**
 * Wrapper around fetch that wipes private client caches strictly on 401 UNAUTHORIZED (OFFLINE-5).
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
  });

  if (response.status === 401) {
    try {
      const payload = (await response.clone().json()) as {
        error?: { code?: unknown };
      } | null;

      if (payload?.error?.code === "UNAUTHORIZED") {
        await runClientLogoutCleanup();
        redirectToLogin();
      }
    } catch {
      // Ignore non-JSON 401 bodies without altering response consumption for caller.
    }
  }

  return response;
}
