import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  unlinkLinkedNoteTransactionSchema,
  unlinkNoteTransaction,
} from "@/features/notes/linked-transactions-service";
import { handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import {
  parseOptionalJsonBody,
  parseUuidRouteParam,
  resolveIdempotencyKey,
  validateZodSchema,
} from "@/lib/route-helpers";

interface UnlinkRouteContext {
  params: Promise<{ id: string; txId: string }>;
}

export async function DELETE(
  req: NextRequest,
  { params }: UnlinkRouteContext,
) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id, txId: rawTxId } = await params;
    const noteId = parseUuidRouteParam(id);
    const txId = parseUuidRouteParam(rawTxId);

    const rawBody = await parseOptionalJsonBody(req);
    const input = validateZodSchema(unlinkLinkedNoteTransactionSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "DELETE",
      path: `/api/notes/${noteId}/transactions/${txId}`,
      payload: input,
      handler: async (tx) => {
        const result = await unlinkNoteTransaction(
          user.id,
          noteId,
          txId,
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

