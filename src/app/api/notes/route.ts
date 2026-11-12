import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  resolveIdempotencyKey,
  validateNotesSchema,
} from "@/features/notes/route-helpers";
import {
  createNoteSchema,
  noteListQuerySchema,
} from "@/features/notes/schemas";
import { createNote, listNotes } from "@/features/notes/service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const sp = req.nextUrl.searchParams;

    const query = validateNotesSchema(noteListQuerySchema, {
      q: sp.get("q") ?? undefined,
      folderId: sp.get("folderId") ?? undefined,
      tagId: sp.get("tagId") ?? undefined,
      tag: sp.get("tag") ?? undefined,
      pinned: sp.get("pinned") ?? undefined,
      cursor: sp.get("cursor") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });

    const result = await listNotes(user.id, query);
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
    const input = validateNotesSchema(createNoteSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "POST",
      path: "/api/notes",
      payload: input,
      handler: async (tx) => {
        const created = await createNote(user.id, input, tx);
        return { status: 201, body: { note: created } };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

