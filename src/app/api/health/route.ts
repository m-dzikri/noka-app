import { NextRequest } from "next/server";
import { getPool } from "@/db";
import { apiError, apiOk } from "@/lib/api-response";
import { createLogger } from "@/lib/logger";

const HEALTH_TIMEOUT_MS = 2_000;

export const dynamic = "force-dynamic";

async function checkDatabaseWithTimeout(): Promise<void> {
  const queryPromise = getPool()
    .query("SELECT 1")
    .then(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Database health check timed out"));
    }, HEALTH_TIMEOUT_MS);
  });

  try {
    await Promise.race([queryPromise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    // Prevent unhandled rejections if the underlying query settles after timeout.
    void queryPromise.catch(() => undefined);
  }
}

const MAX_REQUEST_ID_LENGTH = 128;

function normalizeRequestId(rawHeader: string | null): string {
  if (!rawHeader) {
    return crypto.randomUUID();
  }
  const sanitized = rawHeader
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_REQUEST_ID_LENGTH);
  return sanitized || crypto.randomUUID();
}

export async function GET(request: NextRequest) {
  const requestId = normalizeRequestId(request.headers.get("x-request-id"));
  const log = createLogger(requestId);

  try {
    await checkDatabaseWithTimeout();
    return apiOk(
      {
        status: "ok",
        db: "connected",
        timestamp: new Date().toISOString(),
      },
      200,
    );
  } catch (error) {
    log.error("health.check_failed", { error });
    return apiError(503, "DB_UNAVAILABLE", "Database health check failed");
  }
}

