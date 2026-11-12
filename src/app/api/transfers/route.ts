import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  createTransferSchema,
  transferListQuerySchema,
} from "@/features/finance/schemas";
import {
  createTransfer,
  listTransfers,
} from "@/features/finance/transfers-service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import { resolveIdempotencyKey, validateZodSchema } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const sp = req.nextUrl.searchParams;

    const query = validateZodSchema(transferListQuerySchema, {
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      tzOffset: sp.get("tzOffset") ?? undefined,
      walletId: sp.get("walletId") ?? undefined,
      limit: sp.get("limit") ?? undefined,
      cursor: sp.get("cursor") ?? undefined,
    });

    const result = await listTransfers(user.id, query);
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
    const input = validateZodSchema(createTransferSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "POST",
      path: "/api/transfers",
      payload: input,
      handler: async (tx) => {
        const transfer = await createTransfer(user.id, input, tx);
        return { status: 201, body: { transfer } };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

