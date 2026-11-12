import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  createCategory,
  listCategories,
} from "@/features/finance/categories-service";
import {
  categoryListQuerySchema,
  createCategorySchema,
} from "@/features/finance/schemas";
import { apiOk, handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import { resolveIdempotencyKey, validateZodSchema } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const sp = req.nextUrl.searchParams;

    const query = validateZodSchema(categoryListQuerySchema, {
      type: sp.get("type") ?? undefined,
    });

    const categories = await listCategories(user.id, query);
    return apiOk({ categories });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const rawBody: unknown = await req.json();
    const input = validateZodSchema(createCategorySchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "POST",
      path: "/api/categories",
      payload: input,
      handler: async (tx) => {
        const category = await createCategory(user.id, input, tx);
        return { status: 201, body: { category } };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

