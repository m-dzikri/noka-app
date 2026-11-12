import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  deleteFinanceMutationBodySchema,
  updateTransferSchema,
} from "@/features/finance/schemas";
import {
  deleteTransfer,
  updateTransfer,
} from "@/features/finance/transfers-service";
import { handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import {
  parseOptionalJsonBody,
  parseUuidRouteParam,
  resolveIdempotencyKey,
  validateZodSchema,
} from "@/lib/route-helpers";

interface TransferRouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: TransferRouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const transferId = parseUuidRouteParam(id);

    const rawBody: unknown = await req.json();
    const input = validateZodSchema(updateTransferSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "PATCH",
      path: `/api/transfers/${transferId}`,
      payload: input,
      handler: async (tx) => {
        const result = await updateTransfer(user.id, transferId, input, tx);
        return { status: 200, body: result };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: TransferRouteContext,
) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const transferId = parseUuidRouteParam(id);

    const rawBody = await parseOptionalJsonBody(req);
    const input = validateZodSchema(deleteFinanceMutationBodySchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "DELETE",
      path: `/api/transfers/${transferId}`,
      payload: input,
      handler: async (tx) => {
        const result = await deleteTransfer(user.id, transferId, input, tx);
        return { status: 200, body: result };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

