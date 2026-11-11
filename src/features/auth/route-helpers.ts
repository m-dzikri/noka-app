import type { NextRequest } from "next/server";
import type { z } from "zod";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import {
  extractEmailRateLimitKey,
  validateWithSchema,
} from "@/features/auth/schemas";
import { ApiError } from "@/lib/api-response";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";

export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

interface PrepareAuthMutationOptions<T> {
  req: NextRequest;
  bucket: string;
  limit: number;
  windowMs?: number;
  includeEmailKey?: boolean;
  schema: z.ZodType<T>;
}

/**
 * Enforces CSRF -> JSON parse -> IP/email rate limit -> Zod validation in strict SEC-4/SEC-5 order.
 */
export async function prepareAuthMutation<T>({
  req,
  bucket,
  limit,
  windowMs = AUTH_RATE_LIMIT_WINDOW_MS,
  includeEmailKey = true,
  schema,
}: PrepareAuthMutationOptions<T>): Promise<T> {
  verifyCsrfOrigin(req);

  const rawBody: unknown = await req.json();
  const ip = extractClientIp(req);
  const key = includeEmailKey
    ? `${ip}:${extractEmailRateLimitKey(rawBody)}`
    : ip;

  const rate = checkRateLimit(bucket, key, limit, windowMs);
  if (!rate.allowed) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many requests. Please try again later.",
      undefined,
      { "Retry-After": String(rate.retryAfterSeconds) },
    );
  }

  return validateWithSchema(schema, rawBody);
}

