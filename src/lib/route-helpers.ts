import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-response";

const routeUuidSchema = z.string().uuid();

/**
 * Validates dynamic `[id]` UUID route parameters uniformly with 422 VALIDATION_ERROR.
 */
export function parseUuidRouteParam(rawId: string): string {
  const result = routeUuidSchema.safeParse(rawId);
  if (!result.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid UUID identifier", {
      id: ["Must be a valid UUID"],
    });
  }
  return result.data;
}

/**
 * Safely parses JSON bodies on DELETE endpoints where an empty payload defaults to `{}`.
 */
export async function parseOptionalJsonBody(req: NextRequest): Promise<unknown> {
  const rawText = await req.text();
  if (rawText.trim().length === 0) {
    return {};
  }
  return JSON.parse(rawText);
}

/**
 * Resolves `Idempotency-Key` from HTTP header or JSON body, rejecting mismatched pairs.
 */
export function resolveIdempotencyKey(
  req: NextRequest,
  bodyIdempotencyKey?: string,
): string | undefined {
  const headerKey = req.headers.get("idempotency-key")?.trim();
  const bodyKey = bodyIdempotencyKey?.trim();

  if (
    headerKey !== undefined &&
    headerKey.length > 0 &&
    bodyKey !== undefined &&
    bodyKey.length > 0 &&
    headerKey !== bodyKey
  ) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Idempotency-Key header does not match body idempotencyKey",
    );
  }

  if (headerKey !== undefined && headerKey.length === 0) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Idempotency-Key header must not be empty",
    );
  }

  return headerKey ?? bodyKey;
}

/**
 * Validates any value with Zod and throws a structured 422 ApiError matching API-1/API-2.
 */
export function validateZodSchema<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Validation failed",
      result.error.flatten().fieldErrors,
    );
  }

  return result.data;
}

