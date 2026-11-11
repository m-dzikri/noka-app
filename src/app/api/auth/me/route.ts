import type { NextRequest } from "next/server";
import { requireAuth } from "@/features/auth/session";
import { apiOk, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    return apiOk({ user }, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

