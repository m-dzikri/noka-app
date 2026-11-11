import type { NextRequest } from "next/server";
import { requireAuth } from "@/features/auth/session";
import { listTags } from "@/features/notes/service";
import { apiOk, handleApiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const items = await listTags(user.id);
    return apiOk({ tags: items });
  } catch (error) {
    return handleApiError(error);
  }
}

