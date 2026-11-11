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

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
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

