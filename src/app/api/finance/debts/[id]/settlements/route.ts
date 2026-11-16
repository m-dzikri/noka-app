import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import { createSettlementSchema } from "@/features/finance/debt-schemas";
import { recordSettlement } from "@/features/finance/debt-service";
import { handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import {
  parseUuidRouteParam,
  resolveIdempotencyKey,
  validateZodSchema,
} from "@/lib/route-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const debtId = parseUuidRouteParam(id);

    const rawBody: unknown = await req.json();
    const input = validateZodSchema(createSettlementSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "POST",
      path: `/api/finance/debts/${debtId}/settlements`,
      payload: input,
      handler: async () => {
        const result = await recordSettlement(user.id, debtId, input);
        return {
          status: 201,
          body: {
            settlement: result.settlement,
            debt: result.debt,
          },
        };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
