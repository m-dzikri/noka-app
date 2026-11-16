import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import { updateDebtSchema } from "@/features/finance/debt-schemas";
import {
  deleteDebt,
  getDebtById,
  updateDebt,
} from "@/features/finance/debt-service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { parseUuidRouteParam, validateZodSchema } from "@/lib/route-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { user } = await requireAuth(req);
    const { id } = await params;
    const debtId = parseUuidRouteParam(id);

    const item = await getDebtById(user.id, debtId);
    return apiOk({ item });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const debtId = parseUuidRouteParam(id);

    const rawBody: unknown = await req.json();
    const patch = validateZodSchema(updateDebtSchema, rawBody);

    const item = await updateDebt(user.id, debtId, patch);
    return apiOk({ item });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const debtId = parseUuidRouteParam(id);

    const result = await deleteDebt(user.id, debtId);
    return apiOk({ deleted: result.deleted, id: debtId });
  } catch (error) {
    return handleApiError(error);
  }
}
