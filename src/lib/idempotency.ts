import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, type DbOrTx } from "@/db";
import { idempotencyKeys } from "@/db/schema/sync";
import { ApiError } from "@/lib/api-response";

const MAX_FUTURE_SKEW_MS = 60_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export interface WithIdempotencyParams<T> {
  userId: string;
  idempotencyKey?: string;
  method: string;
  path: string;
  payload: unknown;
  handler: (tx: DbOrTx) => Promise<{ status: number; body: T }>;
}

export interface LwwResolution {
  serverNewer: boolean;
  nextUpdatedAt: Date;
}

/**
 * Serializes any JSON-compatible value deterministically by recursively sorting object keys.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : "null";
  }

  if (typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value !== "object") {
    return "null";
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    const items = value.map((item) =>
      item === undefined ||
      typeof item === "function" ||
      typeof item === "symbol"
        ? "null"
        : canonicalJson(item),
    );
    return `[${items.join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries: string[] = [];

  for (const key of keys) {
    const entryValue = record[key];
    if (
      entryValue === undefined ||
      typeof entryValue === "function" ||
      typeof entryValue === "symbol"
    ) {
      continue;
    }
    entries.push(`${JSON.stringify(key)}:${canonicalJson(entryValue)}`);
  }

  return `{${entries.join(",")}}`;
}

function stripTopLevelIdempotencyKey(payload: unknown): unknown {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    payload instanceof Date
  ) {
    return payload;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(payload)) {
    if (key !== "idempotencyKey") {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Executes a transactional mutation with race-safe idempotency key deduplication.
 */
export async function withIdempotency<T>({
  userId,
  idempotencyKey,
  method,
  path,
  payload,
  handler,
}: WithIdempotencyParams<T>): Promise<NextResponse> {
  if (idempotencyKey === undefined) {
    const result = await getDb().transaction(async (tx) => handler(tx));
    return NextResponse.json(
      { ok: true, data: result.body },
      { status: result.status },
    );
  }

  const trimmedKey = idempotencyKey.trim();
  if (
    trimmedKey.length === 0 ||
    trimmedKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
  ) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Idempotency-Key must be between 1 and 128 characters",
    );
  }

  const normalizedMethod = method.toUpperCase();
  const cleanPayload = stripTopLevelIdempotencyKey(payload);
  const requestHash = sha256Hex(canonicalJson(cleanPayload));

  try {
    const outcome = await getDb().transaction(async (tx) => {
      const inserted = await tx
        .insert(idempotencyKeys)
        .values({
          userId,
          idempotencyKey: trimmedKey,
          method: normalizedMethod,
          path,
          requestHash,
          statusCode: 0,
          responseBody: {},
        })
        .onConflictDoNothing({
          target: [idempotencyKeys.userId, idempotencyKeys.idempotencyKey],
        })
        .returning({ id: idempotencyKeys.id });

      if (inserted.length === 0) {
        const existingRows = await tx
          .select()
          .from(idempotencyKeys)
          .where(
            and(
              eq(idempotencyKeys.userId, userId),
              eq(idempotencyKeys.idempotencyKey, trimmedKey),
            ),
          )
          .limit(1);

        const existing = existingRows[0];
        if (!existing) {
          throw new ApiError(
            409,
            "IDEMPOTENCY_KEY_CONFLICT",
            "Idempotency key state could not be resolved",
          );
        }

        if (
          existing.method !== normalizedMethod ||
          existing.path !== path ||
          existing.requestHash !== requestHash
        ) {
          throw new ApiError(
            409,
            "IDEMPOTENCY_KEY_CONFLICT",
            "Idempotency-Key was already used with a different request payload",
          );
        }

        return {
          status: existing.statusCode,
          responseBody: existing.responseBody,
        };
      }

      const result = await handler(tx);
      const responseBody = { ok: true, data: result.body };

      await tx
        .update(idempotencyKeys)
        .set({
          statusCode: result.status,
          responseBody,
        })
        .where(eq(idempotencyKeys.id, inserted[0].id));

      return {
        status: result.status,
        responseBody,
      };
    });

    return NextResponse.json(outcome.responseBody, { status: outcome.status });
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 409 &&
      error.code !== "IDEMPOTENCY_KEY_CONFLICT"
    ) {
      const errorBody = {
        ok: false as const,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      };

      await getDb()
        .insert(idempotencyKeys)
        .values({
          userId,
          idempotencyKey: trimmedKey,
          method: normalizedMethod,
          path,
          requestHash,
          statusCode: 409,
          responseBody: errorBody,
        })
        .onConflictDoNothing({
          target: [idempotencyKeys.userId, idempotencyKeys.idempotencyKey],
        });

      return NextResponse.json(errorBody, { status: 409 });
    }

    throw error;
  }
}

/**
 * Resolves Last-Write-Wins metadata timestamps with validation and +60s clock-skew clamping.
 */
export function resolveLwwTimestamp(
  rowUpdatedAt: Date,
  clientUpdatedAtIso?: string,
): LwwResolution {
  const nowMs = Date.now();

  if (clientUpdatedAtIso === undefined) {
    return {
      serverNewer: false,
      nextUpdatedAt: new Date(Math.max(nowMs, rowUpdatedAt.getTime())),
    };
  }

  const parsedMs = Date.parse(clientUpdatedAtIso);
  if (Number.isNaN(parsedMs)) {
    throw new ApiError(
      422,
      "INVALID_TIMESTAMP",
      "Invalid updatedAt timestamp format",
    );
  }

  const clampedMs = Math.min(parsedMs, nowMs + MAX_FUTURE_SKEW_MS);
  const serverNewer = clampedMs < rowUpdatedAt.getTime();
  const nextUpdatedAt = serverNewer
    ? rowUpdatedAt
    : new Date(Math.max(clampedMs, nowMs));

  return {
    serverNewer,
    nextUpdatedAt,
  };
}

