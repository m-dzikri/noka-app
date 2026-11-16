import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import { createRecurringTemplateSchema } from "@/features/finance/recurring-schemas";
import {
  createRecurringTemplate,
  listRecurringTemplates,
} from "@/features/finance/recurring-service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import { resolveIdempotencyKey, validateZodSchema } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const templates = await listRecurringTemplates(user.id);
    return apiOk({ templates });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const rawBody: unknown = await req.json();
    const input = validateZodSchema(createRecurringTemplateSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "POST",
      path: "/api/finance/recurring",
      payload: input,
      handler: async () => {
        const template = await createRecurringTemplate(user.id, input);
        return { status: 201, body: { template } };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
