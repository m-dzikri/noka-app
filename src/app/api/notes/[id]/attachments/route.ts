import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  extractAttachmentUploadFromRequest,
  listNoteAttachments,
  uploadNoteAttachment,
} from "@/features/notes/attachments-service";
import { parseUuidRouteParam } from "@/features/notes/route-helpers";
import { apiOk, handleApiError } from "@/lib/api-response";

interface NoteAttachmentsRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  { params }: NoteAttachmentsRouteContext,
) {
  try {
    const { user } = await requireAuth(req);
    const { id } = await params;
    const noteId = parseUuidRouteParam(id);

    const attachments = await listNoteAttachments(user.id, noteId);
    return apiOk({ attachments });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: NoteAttachmentsRouteContext,
) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id } = await params;
    const noteId = parseUuidRouteParam(id);

    const { buffer, declaredMimeType } =
      await extractAttachmentUploadFromRequest(req);
    const result = await uploadNoteAttachment(
      user.id,
      noteId,
      buffer,
      declaredMimeType,
    );

    const response = apiOk({ attachment: result.attachment }, 201);
    response.headers.set("X-Note-Updated-At", result.noteUpdatedAt);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

