import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  budgetListQuerySchema,
  upsertBudgetBodySchema,
} from "@/features/finance/budgets-schemas";
import {
  listCategoryBudgets,
  upsertCategoryBudget,
} from "@/features/finance/budgets-service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import { resolveIdempotencyKey, validateZodSchema } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const sp = req.nextUrl.searchParams;

    const query = validateZodSchema(budgetListQuerySchema, {
      period: sp.get("period") ?? undefined,
      tzOffset: sp.get("tzOffset") ?? undefined,
    });

    const summary = await listCategoryBudgets(user.id, {
      period: query.period,
      tzOffset: query.tzOffset,
      cycleStartDay: user.cycleStartDay,
    });

    return apiOk(summary);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const rawBody: unknown = await req.json();
    const input = validateZodSchema(upsertBudgetBodySchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "POST",
      path: "/api/finance/budgets",
      payload: input,
      handler: async (tx) => {
        const budget = await upsertCategoryBudget(user.id, input, tx);
        return { status: 200, body: { budget } };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
