import type { Dictionary } from "@/lib/i18n/types";

export interface ApiErrorPayload {
  ok?: false;
  error?: {
    code?: string;
    message?: string;
  };
}

/**
 * Maps structured API-1 error payloads and Retry-After headers into active locale strings.
 */
export function resolveAuthErrorMessage(
  t: Dictionary,
  response: Response,
  payload: ApiErrorPayload | null,
): string {
  const code = payload?.error?.code;

  if (code === "RATE_LIMITED") {
    const retryHeader = response.headers.get("Retry-After");
    const seconds = retryHeader ? Number.parseInt(retryHeader, 10) : Number.NaN;
    if (Number.isFinite(seconds) && seconds > 0) {
      return t.auth.rateLimitedRetryMessage.replace(
        "{seconds}",
        String(seconds),
      );
    }
    return t.errors.RATE_LIMITED;
  }

  if (code && code in t.errors) {
    return t.errors[code as keyof Dictionary["errors"]];
  }

  return t.errors.generic;
}
