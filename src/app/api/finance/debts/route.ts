import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  createDebtSchema,
  debtFilterSchema,
} from "@/features/finance/debt-schemas";
import {
  createDebt,
  listContactNames,
  listDebts,
} from "@/features/finance/debt-service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import { resolveIdempotencyKey, validateZodSchema } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const searchParams = req.nextUrl.searchParams;

    const queryFilters = {
      type: searchParams.get("type") || undefined,
      status: searchParams.get("status") || undefined,
      search: searchParams.get("search") || undefined,
    };

    const filters = validateZodSchema(debtFilterSchema, queryFilters);
    const result = await listDebts(user.id, filters);
    const contacts = await listContactNames(user.id);

    return apiOk({
      summary: result.summary,
      items: result.items,
      contacts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const rawBody: unknown = await req.json();
    const input = validateZodSchema(createDebtSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "POST",
      path: "/api/finance/debts",
      payload: input,
      handler: async () => {
        const item = await createDebt(user.id, input);
        return { status: 201, body: { item } };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
