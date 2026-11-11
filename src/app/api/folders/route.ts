import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  resolveIdempotencyKey,
  validateNotesSchema,
} from "@/features/notes/route-helpers";
import { createFolderSchema } from "@/features/notes/schemas";
import { createFolder, listFolders } from "@/features/notes/service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const items = await listFolders(user.id);
    return apiOk({ folders: items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const rawBody: unknown = await req.json();
    const input = validateNotesSchema(createFolderSchema, rawBody);
    const idempotencyKey = resolveIdempotencyKey(req, input.idempotencyKey);

    return await withIdempotency({
      userId: user.id,
      idempotencyKey,
      method: "POST",
      path: "/api/folders",
      payload: input,
      handler: async (tx) => {
        const created = await createFolder(user.id, input, tx);
        return { status: 201, body: created };
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

