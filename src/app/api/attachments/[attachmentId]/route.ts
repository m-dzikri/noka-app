import { NextResponse, type NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import {
  deleteNoteAttachment,
  readNoteAttachmentBinary,
} from "@/features/notes/attachments-service";
import { parseUuidRouteParam } from "@/features/notes/route-helpers";
import { apiOk, handleApiError } from "@/lib/api-response";

interface AttachmentRouteContext {
  params: Promise<{ attachmentId: string }>;
}

export async function GET(
  req: NextRequest,
  { params }: AttachmentRouteContext,
) {
  try {
    const { user } = await requireAuth(req);
    const { attachmentId: rawAttachmentId } = await params;
    const attachmentId = parseUuidRouteParam(rawAttachmentId);

    const asset = await readNoteAttachmentBinary(user.id, attachmentId);

    return new NextResponse(new Uint8Array(asset.buffer), {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.sizeBytes),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: AttachmentRouteContext,
) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { attachmentId: rawAttachmentId } = await params;
    const attachmentId = parseUuidRouteParam(rawAttachmentId);

    const result = await deleteNoteAttachment(user.id, attachmentId);

    const response = apiOk({ deleted: result.deleted, id: result.id });
    response.headers.set("X-Note-Updated-At", result.noteUpdatedAt);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

