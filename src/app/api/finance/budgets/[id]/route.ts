import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import { deleteCategoryBudget } from "@/features/finance/budgets-service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { parseUuidRouteParam } from "@/lib/route-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const budgetId = parseUuidRouteParam(id);

    const result = await deleteCategoryBudget(user.id, budgetId);
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
