import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  deleteFinanceMutationBodySchema,
  updateTransactionSchema,
} from "@/features/finance/schemas";
import {
  deleteTransaction,
  updateTransaction,
} from "@/features/finance/transactions-service";
import { handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import {
  parseOptionalJsonBody,
  parseUuidRouteParam,
  resolveIdempotencyKey,
  validateZodSchema,
} from "@/lib/route-helpers";

interface TransactionRouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  req: NextRequest,
  { params }: TransactionRouteContext,
) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const transactionId = parseUuidRouteParam(id);

    const rawBody: unknown = await req.json();
    const input = validateZodSchema(updateTransactionSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "PATCH",
      path: `/api/transactions/${transactionId}`,
      payload: input,
      handler: async (tx) => {
        const result = await updateTransaction(
          user.id,
          transactionId,
          input,
          tx,
        );
        return { status: 200, body: result };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: TransactionRouteContext,
) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const transactionId = parseUuidRouteParam(id);

    const rawBody = await parseOptionalJsonBody(req);
    const input = validateZodSchema(deleteFinanceMutationBodySchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "DELETE",
      path: `/api/transactions/${transactionId}`,
      payload: input,
      handler: async (tx) => {
        const result = await deleteTransaction(
          user.id,
          transactionId,
          input,
          tx,
        );
        return { status: 200, body: result };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

