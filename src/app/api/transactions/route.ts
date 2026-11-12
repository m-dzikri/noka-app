import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  createTransactionSchema,
  transactionListQuerySchema,
} from "@/features/finance/schemas";
import {
  createTransaction,
  listTransactions,
} from "@/features/finance/transactions-service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import { resolveIdempotencyKey, validateZodSchema } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const sp = req.nextUrl.searchParams;

    const query = validateZodSchema(transactionListQuerySchema, {
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      tzOffset: sp.get("tzOffset") ?? undefined,
      walletId: sp.get("walletId") ?? undefined,
      type: sp.get("type") ?? undefined,
      categoryId: sp.get("categoryId") ?? undefined,
      unlinked: sp.get("unlinked") ?? undefined,
      limit: sp.get("limit") ?? undefined,
      cursor: sp.get("cursor") ?? undefined,
    });

    const result = await listTransactions(user.id, query);
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const rawBody: unknown = await req.json();
    const input = validateZodSchema(createTransactionSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "POST",
      path: "/api/transactions",
      payload: input,
      handler: async (tx) => {
        const transaction = await createTransaction(user.id, input, tx);
        return { status: 201, body: { transaction } };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

