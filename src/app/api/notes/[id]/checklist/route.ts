import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  parseUuidRouteParam,
  resolveIdempotencyKey,
  validateNotesSchema,
} from "@/features/notes/route-helpers";
import { toggleChecklistSchema } from "@/features/notes/schemas";
import { toggleNoteChecklist } from "@/features/notes/service";
import { handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";

interface NoteChecklistRouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  req: NextRequest,
  { params }: NoteChecklistRouteContext,
) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const noteId = parseUuidRouteParam(id);

    const rawBody: unknown = await req.json();
    const input = validateNotesSchema(toggleChecklistSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "PATCH",
      path: `/api/notes/${noteId}/checklist`,
      payload: input,
      handler: async (tx) => {
        const updated = await toggleNoteChecklist(user.id, noteId, input, tx);
        return { status: 200, body: updated };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

