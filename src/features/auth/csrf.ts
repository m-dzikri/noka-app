import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api-response";
import { getEnv } from "@/lib/env";

function extractRequestOrigin(req: NextRequest): string | null {
  const originHeader = req.headers.get("origin");
  if (originHeader !== null) {
    if (originHeader === "null") {
      return null;
    }
    try {
      const parsed = new URL(originHeader);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      return null;
    }
    return null;
  }

  const refererHeader = req.headers.get("referer");
  if (refererHeader !== null) {
    try {
      const parsed = new URL(refererHeader);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function getAllowedOrigins(req: NextRequest): Set<string> {
  const allowed = new Set<string>();
  allowed.add(new URL(getEnv().APP_URL).origin);

  const forwardedHost = req.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const hostHeader = req.headers.get("host")?.trim();
  const effectiveHost = forwardedHost || hostHeader;

  if (effectiveHost) {
    const rawProto = req.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      ?.toLowerCase();
    const effectiveProto =
      rawProto === "http" || rawProto === "https" ? rawProto : "https";

    try {
      allowed.add(new URL(`${effectiveProto}://${effectiveHost}`).origin);
    } catch {
      // Ignore malformed Host header; fallback to configured APP_URL only.
    }
  }

  return allowed;
}

/**
 * Enforces same-origin requests on mutating endpoints using Origin/Referer vs APP_URL/Host (SEC-4).
 */
export function verifyCsrfOrigin(req: NextRequest): void {
  const requestOrigin = extractRequestOrigin(req);
  if (!requestOrigin) {
    throw new ApiError(
      403,
      "CSRF_ORIGIN_MISMATCH",
      "Missing or invalid request origin",
    );
  }

  const allowedOrigins = getAllowedOrigins(req);
  if (!allowedOrigins.has(requestOrigin)) {
    throw new ApiError(
      403,
      "CSRF_ORIGIN_MISMATCH",
      "Request origin is not permitted",
    );
  }
}

