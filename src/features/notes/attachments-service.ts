import crypto from "node:crypto";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { getDb, type DbOrTx } from "@/db";
import { noteAttachments, notes } from "@/db/schema/notes";
import { ApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { getStorage, type StorageAdapter } from "@/lib/storage";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_MULTIPART_CONTENT_LENGTH = MAX_ATTACHMENT_BYTES + 65_536;
export const MAX_ATTACHMENTS_PER_NOTE = 5;

const ALLOWED_ATTACHMENT_MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AllowedAttachmentMime = keyof typeof ALLOWED_ATTACHMENT_MIME_TO_EXT;
export type AllowedAttachmentExt =
  (typeof ALLOWED_ATTACHMENT_MIME_TO_EXT)[AllowedAttachmentMime];

export interface NoteAttachmentDto {
  id: string;
  noteId: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

export interface UploadNoteAttachmentResult {
  attachment: NoteAttachmentDto;
  noteUpdatedAt: string;
}

export interface DeleteNoteAttachmentResult {
  deleted: true;
  id: string;
  noteUpdatedAt: string;
}

export interface ReadNoteAttachmentBinaryResult {
  id: string;
  noteId: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}

export interface ValidatedAttachmentImage {
  mimeType: AllowedAttachmentMime;
  ext: AllowedAttachmentExt;
  sizeBytes: number;
}

export interface NoteAttachmentCleanupInput {
  userId: string;
  noteId: string;
  storageKeys: string[];
}

function isAllowedMime(value: string): value is AllowedAttachmentMime {
  return value in ALLOWED_ATTACHMENT_MIME_TO_EXT;
}

function normalizeDeclaredMime(rawType: string | undefined): string {
  const base = (rawType ?? "").trim().toLowerCase().split(";")[0]?.trim() ?? "";
  if (base === "image/jpg") {
    return "image/jpeg";
  }
  return base;
}

function toAttachmentDto(row: {
  id: string;
  noteId: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}): NoteAttachmentDto {
  return {
    id: row.id,
    noteId: row.noteId,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    url: `/api/attachments/${row.id}`,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Generates an immutable UUID-backed storage object key independent of client filenames (SEC-6).
 */
export function buildAttachmentStorageKey(
  userId: string,
  noteId: string,
  attachmentId: string,
  ext: AllowedAttachmentExt,
): string {
  return `users/${userId}/notes/${noteId}/${attachmentId}.${ext}`;
}

/**
 * Validates file size boundaries for note image uploads (`422 EMPTY_FILE`, `413 FILE_TOO_LARGE`).
 */
export function assertValidAttachmentSize(sizeBytes: number): void {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new ApiError(422, "EMPTY_FILE", "Uploaded image file cannot be empty");
  }
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw new ApiError(
      413,
      "FILE_TOO_LARGE",
      "Uploaded image exceeds the 5 MB file limit",
    );
  }
}

/**
 * Validates magic bytes (`file-type`) and optional declared MIME type for JPEG/PNG/WebP uploads (SEC-6).
 */
export async function validateAttachmentImageBuffer(
  buffer: Buffer,
  declaredMimeType?: string,
): Promise<ValidatedAttachmentImage> {
  assertValidAttachmentSize(buffer.byteLength);

  // Convert to a realm-local Uint8Array view so file-type works identically in Node and jsdom realms.
  const bytes = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !isAllowedMime(detected.mime)) {
    throw new ApiError(
      422,
      "UNSUPPORTED_IMAGE_TYPE",
      "Only JPEG, PNG, and WebP images are supported",
    );
  }

  const normalizedDeclared = normalizeDeclaredMime(declaredMimeType);
  if (
    normalizedDeclared.length > 0 &&
    normalizedDeclared !== "application/octet-stream" &&
    normalizedDeclared !== detected.mime
  ) {
    throw new ApiError(
      422,
      "UNSUPPORTED_IMAGE_TYPE",
      "Declared image MIME type does not match file contents",
    );
  }

  return {
    mimeType: detected.mime,
    ext: ALLOWED_ATTACHMENT_MIME_TO_EXT[detected.mime],
    sizeBytes: buffer.byteLength,
  };
}

/**
 * Parses and pre-validates a `multipart/form-data` image upload Request containing a single `file` field.
 */
export async function extractAttachmentUploadFromRequest(
  req: Request,
): Promise<{ buffer: Buffer; declaredMimeType: string }> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new ApiError(
      400,
      "INVALID_MULTIPART",
      "Request must use multipart/form-data",
    );
  }

  const contentLengthRaw = req.headers.get("content-length");
  if (contentLengthRaw !== null) {
    const contentLength = Number.parseInt(contentLengthRaw.trim(), 10);
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_MULTIPART_CONTENT_LENGTH
    ) {
      throw new ApiError(
        413,
        "PAYLOAD_TOO_LARGE",
        "Request payload exceeds the maximum upload limit",
      );
    }
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    throw new ApiError(
      400,
      "INVALID_MULTIPART",
      "Malformed multipart form payload",
    );
  }

  const entries = formData.getAll("file");
  if (entries.length !== 1) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Exactly one 'file' field is required",
      { file: ["Must provide exactly one image file"] },
    );
  }

  const fileEntry = entries[0];
  if (!(fileEntry instanceof File)) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "The 'file' field must be an uploaded file",
      { file: ["Must be a file upload"] },
    );
  }

  assertValidAttachmentSize(fileEntry.size);

  const arrayBuffer = await fileEntry.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  assertValidAttachmentSize(buffer.byteLength);

  return {
    buffer,
    declaredMimeType: fileEntry.type,
  };
}

/**
 * Lists metadata for attachments belonging to an active note owned by the user.
 */
export async function listNoteAttachments(
  userId: string,
  noteId: string,
  dbOrTx: DbOrTx = getDb(),
): Promise<NoteAttachmentDto[]> {
  const [noteRow] = await dbOrTx
    .select({ id: notes.id })
    .from(notes)
    .where(
      and(
        eq(notes.id, noteId),
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
      ),
    )
    .limit(1);

  if (!noteRow) {
    throw new ApiError(404, "NOTE_NOT_FOUND", "Note not found");
  }

  const rows = await dbOrTx
    .select({
      id: noteAttachments.id,
      noteId: noteAttachments.noteId,
      mimeType: noteAttachments.mimeType,
      sizeBytes: noteAttachments.sizeBytes,
      createdAt: noteAttachments.createdAt,
    })
    .from(noteAttachments)
    .where(
      and(
        eq(noteAttachments.noteId, noteId),
        eq(noteAttachments.userId, userId),
      ),
    )
    .orderBy(asc(noteAttachments.createdAt), asc(noteAttachments.id));

  return rows.map(toAttachmentDto);
}

/**
 * Validates and uploads one image attachment atomically under a note FOR UPDATE lock with compensation on commit failure.
 */
export async function uploadNoteAttachment(
  userId: string,
  noteId: string,
  buffer: Buffer,
  declaredMimeType?: string,
  storage: StorageAdapter = getStorage(),
): Promise<UploadNoteAttachmentResult> {
  const validated = await validateAttachmentImageBuffer(
    buffer,
    declaredMimeType,
  );

  let uploadedStorageKey: string | null = null;

  try {
    return await getDb().transaction(async (tx) => {
      const lockedNotes = await tx
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.id, noteId),
            eq(notes.userId, userId),
            isNull(notes.deletedAt),
          ),
        )
        .for("update")
        .limit(1);

      if (lockedNotes.length === 0) {
        throw new ApiError(404, "NOTE_NOT_FOUND", "Note not found");
      }

      const [existingCount] = await tx
        .select({ total: count() })
        .from(noteAttachments)
        .where(
          and(
            eq(noteAttachments.noteId, noteId),
            eq(noteAttachments.userId, userId),
          ),
        );

      if (Number(existingCount?.total ?? 0) >= MAX_ATTACHMENTS_PER_NOTE) {
        throw new ApiError(
          409,
          "ATTACHMENT_LIMIT_REACHED",
          "Maximum of 5 image attachments per note reached",
        );
      }

      const attachmentId = crypto.randomUUID();
      const storageKey = buildAttachmentStorageKey(
        userId,
        noteId,
        attachmentId,
        validated.ext,
      );
      const now = new Date();

      const [inserted] = await tx
        .insert(noteAttachments)
        .values({
          id: attachmentId,
          userId,
          noteId,
          storageKey,
          mimeType: validated.mimeType,
          sizeBytes: validated.sizeBytes,
          createdAt: now,
        })
        .returning({
          id: noteAttachments.id,
          noteId: noteAttachments.noteId,
          mimeType: noteAttachments.mimeType,
          sizeBytes: noteAttachments.sizeBytes,
          createdAt: noteAttachments.createdAt,
        });

      await tx
        .update(notes)
        .set({ updatedAt: now })
        .where(
          and(
            eq(notes.id, noteId),
            eq(notes.userId, userId),
            isNull(notes.deletedAt),
          ),
        );

      try {
        await storage.putObject(storageKey, buffer, validated.mimeType);
      } catch (storageError) {
        if (storageError instanceof ApiError) {
          throw storageError;
        }
        logger.error("notes.attachment_upload_storage_failed", {
          noteId,
          attachmentId,
          error: storageError,
        });
        throw new ApiError(
          503,
          "STORAGE_UNAVAILABLE",
          "Attachment storage service is unavailable",
        );
      }

      uploadedStorageKey = storageKey;

      return {
        attachment: toAttachmentDto(inserted),
        noteUpdatedAt: now.toISOString(),
      };
    });
  } catch (error) {
    if (uploadedStorageKey) {
      try {
        await storage.deleteObject(uploadedStorageKey);
      } catch (compensationError) {
        logger.error("notes.attachment_upload_compensation_failed", {
          noteId,
          storageKey: uploadedStorageKey,
          error: compensationError,
        });
      }
    }
    throw error;
  }
}

/**
 * Loads attachment metadata and object bytes strictly for active notes owned by the requester.
 */
export async function readNoteAttachmentBinary(
  userId: string,
  attachmentId: string,
  storage: StorageAdapter = getStorage(),
): Promise<ReadNoteAttachmentBinaryResult> {
  const rows = await getDb()
    .select({
      id: noteAttachments.id,
      noteId: noteAttachments.noteId,
      storageKey: noteAttachments.storageKey,
      mimeType: noteAttachments.mimeType,
      sizeBytes: noteAttachments.sizeBytes,
    })
    .from(noteAttachments)
    .innerJoin(notes, eq(noteAttachments.noteId, notes.id))
    .where(
      and(
        eq(noteAttachments.id, attachmentId),
        eq(noteAttachments.userId, userId),
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new ApiError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found");
  }

  let buffer: Buffer | null;
  try {
    buffer = await storage.readObject(row.storageKey);
  } catch (storageError) {
    if (storageError instanceof ApiError) {
      throw storageError;
    }
    logger.error("notes.attachment_read_storage_failed", {
      attachmentId,
      noteId: row.noteId,
      error: storageError,
    });
    throw new ApiError(
      503,
      "STORAGE_UNAVAILABLE",
      "Attachment storage service is unavailable",
    );
  }

  if (buffer === null) {
    throw new ApiError(
      404,
      "ATTACHMENT_OBJECT_MISSING",
      "Attachment file object could not be found",
    );
  }

  return {
    id: row.id,
    noteId: row.noteId,
    mimeType: row.mimeType,
    sizeBytes: buffer.byteLength,
    buffer,
  };
}

/**
 * Atomically deletes an attachment row and storage object for an active note, rolling back on storage error.
 */
export async function deleteNoteAttachment(
  userId: string,
  attachmentId: string,
  storage: StorageAdapter = getStorage(),
): Promise<DeleteNoteAttachmentResult> {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .select({
        id: noteAttachments.id,
        noteId: noteAttachments.noteId,
        storageKey: noteAttachments.storageKey,
      })
      .from(noteAttachments)
      .innerJoin(notes, eq(noteAttachments.noteId, notes.id))
      .where(
        and(
          eq(noteAttachments.id, attachmentId),
          eq(noteAttachments.userId, userId),
          eq(notes.userId, userId),
          isNull(notes.deletedAt),
        ),
      )
      .for("update")
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new ApiError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found");
    }

    await tx
      .delete(noteAttachments)
      .where(
        and(
          eq(noteAttachments.id, attachmentId),
          eq(noteAttachments.userId, userId),
        ),
      );

    const now = new Date();
    await tx
      .update(notes)
      .set({ updatedAt: now })
      .where(
        and(
          eq(notes.id, row.noteId),
          eq(notes.userId, userId),
          isNull(notes.deletedAt),
        ),
      );

    try {
      await storage.deleteObject(row.storageKey);
    } catch (storageError) {
      if (storageError instanceof ApiError) {
        throw storageError;
      }
      logger.error("notes.attachment_delete_storage_failed", {
        attachmentId,
        noteId: row.noteId,
        error: storageError,
      });
      throw new ApiError(
        503,
        "STORAGE_UNAVAILABLE",
        "Attachment storage service is unavailable",
      );
    }

    return {
      deleted: true,
      id: attachmentId,
      noteUpdatedAt: now.toISOString(),
    };
  });
}

/**
 * Best-effort batch deletion for storage objects; never throws on storage unavailability (RFC-005, RFC-010).
 */
export async function deleteUserAttachmentObjects(
  keys: string[],
  storage: StorageAdapter = getStorage(),
): Promise<{ failedKeys: string[] }> {
  if (keys.length === 0) {
    return { failedKeys: [] };
  }

  try {
    const result = await storage.deleteObjects(keys);
    return { failedKeys: result.failedKeys };
  } catch (error) {
    logger.warn("notes.attachment_batch_delete_failed", {
      keyCount: keys.length,
      error,
    });
    return { failedKeys: [...keys] };
  }
}

/**
 * Post-commit cleanup hook invoked when a note is deleted; logs only opaque failedKeys on partial errors.
 */
export async function cleanupNoteAttachments(
  payload: NoteAttachmentCleanupInput,
  storage: StorageAdapter = getStorage(),
): Promise<void> {
  if (payload.storageKeys.length === 0) {
    return;
  }

  const { failedKeys } = await deleteUserAttachmentObjects(
    payload.storageKeys,
    storage,
  );
  if (failedKeys.length > 0) {
    logger.warn("notes.attachment_cleanup_partial_failure", {
      noteId: payload.noteId,
      failedKeys,
    });
  }
}
