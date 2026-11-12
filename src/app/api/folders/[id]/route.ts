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
  updateFolderSchema,
} from "@/features/notes/schemas";
import { deleteFolder, updateFolder } from "@/features/notes/service";
import { handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";

interface FolderRouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: FolderRouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const folderId = parseUuidRouteParam(id);

    const rawBody: unknown = await req.json();
    const input = validateNotesSchema(updateFolderSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "PATCH",
      path: `/api/folders/${folderId}`,
      payload: input,
      handler: async (tx) => {
        const updated = await updateFolder(user.id, folderId, input, tx);
        return { status: 200, body: updated };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: FolderRouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const folderId = parseUuidRouteParam(id);

    const rawBody = await parseOptionalJsonBody(req);
    const input = validateNotesSchema(deleteMutationBodySchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "DELETE",
      path: `/api/folders/${folderId}`,
      payload: input,
      handler: async (tx) => {
        const deleted = await deleteFolder(user.id, folderId, input, tx);
        return { status: 200, body: deleted };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

