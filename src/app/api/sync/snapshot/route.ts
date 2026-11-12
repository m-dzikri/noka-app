import type { NextRequest } from "next/server";
import { requireAuth } from "@/features/auth/session";
import { buildUserSyncSnapshot } from "@/features/sync/snapshot-service";
import { apiOk, handleApiError } from "@/lib/api-response";

/**
 * Authenticated snapshot pull endpoint for IndexedDB local mirror hydration (RFC-009, SEC-1, API-1).
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const snapshot = await buildUserSyncSnapshot(user);
    const response = apiOk(snapshot);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

