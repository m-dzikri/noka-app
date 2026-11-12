import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  createWalletSchema,
  walletListQuerySchema,
} from "@/features/finance/schemas";
import {
  createWallet,
  loadWalletsWithBalances,
} from "@/features/finance/wallets-service";
import { getDb } from "@/db";
import { apiOk, handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import { resolveIdempotencyKey, validateZodSchema } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const sp = req.nextUrl.searchParams;

    const query = validateZodSchema(walletListQuerySchema, {
      includeArchived: sp.get("includeArchived") ?? undefined,
    });

    const wallets = await loadWalletsWithBalances(getDb(), user.id, query);
    return apiOk({ wallets });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const rawBody: unknown = await req.json();
    const input = validateZodSchema(createWalletSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "POST",
      path: "/api/wallets",
      payload: input,
      handler: async (tx) => {
        const wallet = await createWallet(user.id, input, tx);
        return { status: 201, body: { wallet } };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

