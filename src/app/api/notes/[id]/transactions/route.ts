import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  linkOrCreateNoteTransaction,
  listNoteLinkedTransactions,
  postLinkedNoteTransactionSchema,
} from "@/features/notes/linked-transactions-service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";
import {
  parseUuidRouteParam,
  resolveIdempotencyKey,
  validateZodSchema,
} from "@/lib/route-helpers";

interface NoteLinkedTransactionsContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  { params }: NoteLinkedTransactionsContext,
) {
  try {
    const { user } = await requireAuth(req);
    const { id } = await params;
    const noteId = parseUuidRouteParam(id);

    const result = await listNoteLinkedTransactions(user.id, noteId);
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: NoteLinkedTransactionsContext,
) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const noteId = parseUuidRouteParam(id);

    const rawBody: unknown = await req.json();
    const input = validateZodSchema(postLinkedNoteTransactionSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "POST",
      path: `/api/notes/${noteId}/transactions`,
      payload: input,
      handler: async (tx) => {
        const result = await linkOrCreateNoteTransaction(
          user.id,
          noteId,
          input,
          tx,
        );
        return {
          status: result.status,
          body: {
            transaction: result.transaction,
            summary: result.summary,
            conflictResolved: result.conflictResolved,
          },
        };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

