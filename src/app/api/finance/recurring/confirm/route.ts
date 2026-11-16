import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import { confirmRecurringItemSchema } from "@/features/finance/recurring-schemas";
import { confirmRecurringItem } from "@/features/finance/recurring-service";
import { handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import { resolveIdempotencyKey, validateZodSchema } from "@/lib/route-helpers";

export async function POST(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const rawBody: unknown = await req.json();
    const input = validateZodSchema(confirmRecurringItemSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "POST",
      path: "/api/finance/recurring/confirm",
      payload: input,
      handler: async () => {
        const result = await confirmRecurringItem(user.id, input);
        return { status: 200, body: result };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
