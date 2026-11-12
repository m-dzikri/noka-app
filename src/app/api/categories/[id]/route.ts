import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  deleteCategory,
  updateCategory,
} from "@/features/finance/categories-service";
import {
  deleteFinanceMutationBodySchema,
  updateCategorySchema,
} from "@/features/finance/schemas";
import { handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import {
  parseOptionalJsonBody,
  parseUuidRouteParam,
  resolveIdempotencyKey,
  validateZodSchema,
} from "@/lib/route-helpers";

interface CategoryRouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: CategoryRouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const categoryId = parseUuidRouteParam(id);

    const rawBody: unknown = await req.json();
    const input = validateZodSchema(updateCategorySchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "PATCH",
      path: `/api/categories/${categoryId}`,
      payload: input,
      handler: async (tx) => {
        const result = await updateCategory(user.id, categoryId, input, tx);
        return { status: 200, body: result };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: CategoryRouteContext,
) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const categoryId = parseUuidRouteParam(id);

    const rawBody = await parseOptionalJsonBody(req);
    const input = validateZodSchema(deleteFinanceMutationBodySchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "DELETE",
      path: `/api/categories/${categoryId}`,
      payload: input,
      handler: async (tx) => {
        const result = await deleteCategory(user.id, categoryId, input, tx);
        return { status: 200, body: result };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

