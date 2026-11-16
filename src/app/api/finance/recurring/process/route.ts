import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import { processDueRecurringTemplates } from "@/features/finance/recurring-service";
import { apiOk, handleApiError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const result = await processDueRecurringTemplates(user.id);
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
