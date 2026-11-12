import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  parseOptionalJsonBody,
  parseUuidRouteParam,
  resolveIdempotencyKey,
  validateNotesSchema,
} from "@/features/notes/route-helpers";
import {
  deleteMutationBodySchema,
  updateNoteSchema,
} from "@/features/notes/schemas";
import {
  deleteNoteInTx,
  getNoteById,
  runNoteDeleteCleanupHandlers,
  updateNote,
  type NoteDeleteCleanupPayload,
} from "@/features/notes/service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";

interface NoteRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: NoteRouteContext) {
  try {
    const { user } = await requireAuth(req);
    const { id } = await params;
    const noteId = parseUuidRouteParam(id);

    const note = await getNoteById(user.id, noteId);
    return apiOk({ note });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: NoteRouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const noteId = parseUuidRouteParam(id);

    const rawBody: unknown = await req.json();
    const input = validateNotesSchema(updateNoteSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "PATCH",
      path: `/api/notes/${noteId}`,
      payload: input,
      handler: async (tx) => {
        const updated = await updateNote(user.id, noteId, input, tx);
        return { status: 200, body: updated };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: NoteRouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const noteId = parseUuidRouteParam(id);

    const rawBody = await parseOptionalJsonBody(req);
    const input = validateNotesSchema(deleteMutationBodySchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    let pendingCleanup: NoteDeleteCleanupPayload | null = null;

    const response = await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "DELETE",
      path: `/api/notes/${noteId}`,
      payload: input,
      handler: async (tx) => {
        const outcome = await deleteNoteInTx(tx, user.id, noteId, input);
        pendingCleanup = outcome.cleanupPayload;
        return { status: 200, body: outcome.result };
      },
    });

    if (pendingCleanup) {
      await runNoteDeleteCleanupHandlers(pendingCleanup);
    }

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

