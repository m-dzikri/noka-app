import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import { updateRecurringTemplateSchema } from "@/features/finance/recurring-schemas";
import {
  deleteRecurringTemplate,
  getRecurringTemplateById,
  updateRecurringTemplate,
} from "@/features/finance/recurring-service";
import { ApiError, apiOk, handleApiError } from "@/lib/api-response";
import { parseUuidRouteParam, validateZodSchema } from "@/lib/route-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { user } = await requireAuth(req);
    const { id } = await params;
    const templateId = parseUuidRouteParam(id);

    const template = await getRecurringTemplateById(user.id, templateId);
    if (!template) {
      throw new ApiError(
        404,
        "TEMPLATE_NOT_FOUND",
        "Jadwal berulang tidak ditemukan",
      );
    }

    return apiOk({ template });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const templateId = parseUuidRouteParam(id);

    const rawBody: unknown = await req.json();
    const patch = validateZodSchema(updateRecurringTemplateSchema, rawBody);

    const template = await updateRecurringTemplate(user.id, templateId, patch);
    return apiOk({ template });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const templateId = parseUuidRouteParam(id);

    const deleted = await deleteRecurringTemplate(user.id, templateId);
    if (!deleted) {
      throw new ApiError(
        404,
        "TEMPLATE_NOT_FOUND",
        "Jadwal berulang tidak ditemukan",
      );
    }

    return apiOk({ deleted: true, id: templateId });
  } catch (error) {
    return handleApiError(error);
  }
}
