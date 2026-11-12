import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  deleteFinanceMutationBodySchema,
  updateWalletSchema,
} from "@/features/finance/schemas";
import { deleteWallet, updateWallet } from "@/features/finance/wallets-service";
import { handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import {
  parseOptionalJsonBody,
  parseUuidRouteParam,
  resolveIdempotencyKey,
  validateZodSchema,
} from "@/lib/route-helpers";

interface WalletRouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: WalletRouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const walletId = parseUuidRouteParam(id);

    const rawBody: unknown = await req.json();
    const input = validateZodSchema(updateWalletSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "PATCH",
      path: `/api/wallets/${walletId}`,
      payload: input,
      handler: async (tx) => {
        const result = await updateWallet(user.id, walletId, input, tx);
        return { status: 200, body: result };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: WalletRouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const walletId = parseUuidRouteParam(id);

    const rawBody = await parseOptionalJsonBody(req);
    const input = validateZodSchema(deleteFinanceMutationBodySchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "DELETE",
      path: `/api/wallets/${walletId}`,
      payload: input,
      handler: async (tx) => {
        const result = await deleteWallet(user.id, walletId, input, tx);
        return { status: 200, body: result };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

