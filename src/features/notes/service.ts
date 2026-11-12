import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { transactions } from "@/db/schema/finance";
import {
  folders,
  noteAttachments,
  notes,
  noteTags,
  tags,
} from "@/db/schema/notes";
import { parseChecklists, toggleChecklistInMarkdown } from "@/features/notes/checklist";
import {
  NOTE_LIST_DEFAULT_LIMIT,
  normalizeTagNames,
  uuidSchema,
  type CreateFolderInput,
  type CreateNoteInput,
  type DeleteMutationBody,
  type NoteListQueryInput,
  type ToggleChecklistInput,
  type UpdateFolderInput,
  type UpdateNoteInput,
} from "@/features/notes/schemas";
import { ApiError } from "@/lib/api-response";
import { resolveLwwTimestamp } from "@/lib/idempotency";
import { logger } from "@/lib/logger";

export interface FolderDto {
  id: string;
  name: string;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TagDto {
  id: string;
  name: string;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteTagItemDto {
  id: string;
  name: string;
}

export type ConflictResolution = "applied" | "server_newer";

export interface NoteDto {
  id: string;
  folderId: string | null;
  folderName: string | null;
  title: string;
  content: string;
  isPinned: boolean;
  tags: NoteTagItemDto[];
  checklistTotal: number;
  checklistCompleted: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteMutationResult {
  note: NoteDto;
  conflictResolved: ConflictResolution;
}

export interface FolderMutationResult {
  folder: FolderDto;
  conflictResolved: ConflictResolution;
}

export interface NoteListResult {
  items: NoteDto[];
  nextCursor: string | null;
}

export interface NoteDeleteResult {
  deleted: boolean;
  id: string;
  conflictResolved: ConflictResolution;
  note?: NoteDto;
}

export interface FolderDeleteResult {
  deleted: boolean;
  id: string;
  movedNotesCount?: number;
  conflictResolved: ConflictResolution;
  folder?: FolderDto;
}

export interface NoteDeleteCleanupPayload {
  userId: string;
  noteId: string;
  storageKeys: string[];
}

export type NoteDeleteCleanupHandler = (
  payload: NoteDeleteCleanupPayload,
) => Promise<void> | void;

interface DecodedNotesCursor {
  p: boolean;
  u: Date;
  i: string;
}

const deleteCleanupHandlers = new Set<NoteDeleteCleanupHandler>();

/**
 * Registers a post-commit cleanup callback executed when a note is deleted (e.g. R2 attachment removal).
 */
export function registerNoteDeleteCleanup(
  handler: NoteDeleteCleanupHandler,
): () => void {
  deleteCleanupHandlers.add(handler);
  return () => {
    deleteCleanupHandlers.delete(handler);
  };
}

/**
 * Executes registered note deletion cleanup hooks strictly after the database transaction has committed.
 */
export async function runNoteDeleteCleanupHandlers(
  payload: NoteDeleteCleanupPayload,
): Promise<void> {
  for (const handler of deleteCleanupHandlers) {
    try {
      await handler(payload);
    } catch (error) {
      logger.error("notes.delete_cleanup_failed", {
        noteId: payload.noteId,
        storageKeyCount: payload.storageKeys.length,
        error,
      });
    }
  }
}

function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, "\\$&");
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const record = error as { code?: unknown; cause?: unknown };
  if (record.code === "23505") {
    return true;
  }

  if (typeof record.cause === "object" && record.cause !== null) {
    return (record.cause as { code?: unknown }).code === "23505";
  }

  return false;
}

function encodeNotesCursor(row: {
  isPinned: boolean;
  updatedAt: Date;
  id: string;
}): string {
  const payload = JSON.stringify({
    p: row.isPinned,
    u: row.updatedAt.toISOString(),
    i: row.id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeNotesCursor(rawCursor: string): DecodedNotesCursor {
  try {
    const decoded = Buffer.from(rawCursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      typeof parsed.p !== "boolean" ||
      typeof parsed.u !== "string" ||
      typeof parsed.i !== "string"
    ) {
      throw new Error("Invalid cursor shape");
    }

    const idValidation = uuidSchema.safeParse(parsed.i);
    if (!idValidation.success) {
      throw new Error("Invalid cursor id");
    }

    const updatedMs = Date.parse(parsed.u);
    if (Number.isNaN(updatedMs)) {
      throw new Error("Invalid cursor timestamp");
    }

    return {
      p: parsed.p,
      u: new Date(updatedMs),
      i: idValidation.data,
    };
  } catch {
    throw new ApiError(400, "INVALID_CURSOR", "Invalid pagination cursor");
  }
}

function buildNoteDto(
  row: {
    id: string;
    folderId: string | null;
    folderName: string | null;
    title: string;
    content: string;
    isPinned: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  noteTagItems: NoteTagItemDto[],
): NoteDto {
  const checklists = parseChecklists(row.content);
  let completed = 0;
  for (const item of checklists) {
    if (item.checked) {
      completed += 1;
    }
  }

  return {
    id: row.id,
    folderId: row.folderId,
    folderName: row.folderName,
    title: row.title,
    content: row.content,
    isPinned: row.isPinned,
    tags: noteTagItems,
    checklistTotal: checklists.length,
    checklistCompleted: completed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertOwnedActiveFolder(
  tx: DbOrTx,
  userId: string,
  folderId: string,
): Promise<string> {
  const rows = await tx
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, userId),
        isNull(folders.deletedAt),
      ),
    )
    .limit(1);

  if (!rows[0]) {
    throw new ApiError(404, "FOLDER_NOT_FOUND", "Folder not found");
  }

  return rows[0].name;
}

async function countActiveNotesInFolder(
  tx: DbOrTx,
  userId: string,
  folderId: string,
): Promise<number> {
  const countRows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.folderId, folderId),
        isNull(notes.deletedAt),
      ),
    );
  return Number(countRows[0]?.count ?? 0);
}

async function fetchTagsByNoteIds(
  tx: DbOrTx,
  userId: string,
  noteIds: readonly string[],
): Promise<Map<string, NoteTagItemDto[]>> {
  const grouped = new Map<string, NoteTagItemDto[]>();
  if (noteIds.length === 0) {
    return grouped;
  }

  const rows = await tx
    .select({
      noteId: noteTags.noteId,
      id: tags.id,
      name: tags.name,
    })
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .where(
      and(
        inArray(noteTags.noteId, [...noteIds]),
        eq(tags.userId, userId),
        isNull(tags.deletedAt),
      ),
    )
    .orderBy(asc(sql`lower(${tags.name})`), asc(tags.name));

  for (const row of rows) {
    const existing = grouped.get(row.noteId);
    if (existing) {
      existing.push({ id: row.id, name: row.name });
    } else {
      grouped.set(row.noteId, [{ id: row.id, name: row.name }]);
    }
  }

  return grouped;
}

async function softDeleteOrphanTags(
  tx: DbOrTx,
  userId: string,
  now: Date,
): Promise<void> {
  await tx
    .update(tags)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(tags.userId, userId),
        isNull(tags.deletedAt),
        sql`NOT EXISTS (
          SELECT 1
          FROM ${noteTags}
          INNER JOIN ${notes} ON ${notes.id} = ${noteTags.noteId}
          WHERE ${noteTags.tagId} = ${tags.id}
            AND ${notes.deletedAt} IS NULL
        )`,
      ),
    );
}

async function syncNoteTags(
  tx: DbOrTx,
  userId: string,
  noteId: string,
  rawTagNames: readonly string[],
  now: Date,
): Promise<NoteTagItemDto[]> {
  const normalizedNames = normalizeTagNames(rawTagNames);
  const desiredLower = new Map<string, string>();
  for (const name of normalizedNames) {
    desiredLower.set(name.toLowerCase(), name);
  }

  const resolvedTagIds: string[] = [];

  if (desiredLower.size > 0) {
    const lowerValues = [...desiredLower.keys()];
    const existingRows = await tx
      .select({
        id: tags.id,
        name: tags.name,
        deletedAt: tags.deletedAt,
      })
      .from(tags)
      .where(
        and(
          eq(tags.userId, userId),
          inArray(sql`lower(${tags.name})`, lowerValues),
        ),
      );

    const activeByLower = new Map<string, { id: string; name: string }>();
    const deletedByLower = new Map<string, { id: string; name: string }>();

    for (const row of existingRows) {
      const lower = row.name.toLowerCase();
      if (row.deletedAt === null) {
        activeByLower.set(lower, { id: row.id, name: row.name });
      } else if (!deletedByLower.has(lower)) {
        deletedByLower.set(lower, { id: row.id, name: row.name });
      }
    }

    for (const [lower, preferredName] of desiredLower) {
      const active = activeByLower.get(lower);
      if (active) {
        resolvedTagIds.push(active.id);
        continue;
      }

      const deletedRow = deletedByLower.get(lower);
      if (deletedRow) {
        const reactivated = await tx
          .update(tags)
          .set({
            name: preferredName,
            deletedAt: null,
            updatedAt: now,
          })
          .where(and(eq(tags.id, deletedRow.id), isNotNull(tags.deletedAt)))
          .returning({ id: tags.id });

        if (reactivated[0]) {
          resolvedTagIds.push(reactivated[0].id);
          continue;
        }
      }

      const inserted = await tx
        .insert(tags)
        .values({
          userId,
          name: preferredName,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: tags.id });

      resolvedTagIds.push(inserted[0].id);
    }
  }

  if (resolvedTagIds.length === 0) {
    await tx.delete(noteTags).where(eq(noteTags.noteId, noteId));
  } else {
    const currentLinks = await tx
      .select({ tagId: noteTags.tagId })
      .from(noteTags)
      .where(eq(noteTags.noteId, noteId));

    const currentSet = new Set(currentLinks.map((link) => link.tagId));
    const desiredSet = new Set(resolvedTagIds);

    const toRemove = [...currentSet].filter((id) => !desiredSet.has(id));
    if (toRemove.length > 0) {
      await tx
        .delete(noteTags)
        .where(
          and(
            eq(noteTags.noteId, noteId),
            inArray(noteTags.tagId, toRemove),
          ),
        );
    }

    const toInsert = resolvedTagIds.filter((id) => !currentSet.has(id));
    if (toInsert.length > 0) {
      await tx
        .insert(noteTags)
        .values(toInsert.map((tagId) => ({ noteId, tagId })))
        .onConflictDoNothing();
    }
  }

  await softDeleteOrphanTags(tx, userId, now);

  if (resolvedTagIds.length === 0) {
    return [];
  }

  const hydratedMap = await fetchTagsByNoteIds(tx, userId, [noteId]);
  return hydratedMap.get(noteId) ?? [];
}

async function fetchHydratedNoteRow(
  tx: DbOrTx,
  userId: string,
  noteId: string,
) {
  const rows = await tx
    .select({
      id: notes.id,
      folderId: notes.folderId,
      folderName: folders.name,
      title: notes.title,
      content: notes.content,
      isPinned: notes.isPinned,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .leftJoin(
      folders,
      and(
        eq(notes.folderId, folders.id),
        eq(folders.userId, userId),
        isNull(folders.deletedAt),
      ),
    )
    .where(
      and(
        eq(notes.id, noteId),
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Lists active notes for a user with optional instant search, filters, and keyset pagination (PERF-2).
 */
export async function listNotes(
  userId: string,
  query: Partial<NoteListQueryInput> = {},
  dbOrTx: DbOrTx = getDb(),
): Promise<NoteListResult> {
  const limit = query.limit ?? NOTE_LIST_DEFAULT_LIMIT;
  const conditions = [eq(notes.userId, userId), isNull(notes.deletedAt)];

  if (query.folderId === "none") {
    conditions.push(isNull(notes.folderId));
  } else if (query.folderId !== undefined) {
    conditions.push(eq(notes.folderId, query.folderId));
  }

  if (query.pinned !== undefined) {
    conditions.push(eq(notes.isPinned, query.pinned));
  }

  if (query.tagId !== undefined) {
    conditions.push(
      sql`EXISTS (
        SELECT 1
        FROM ${noteTags}
        INNER JOIN ${tags} ON ${tags.id} = ${noteTags.tagId}
        WHERE ${noteTags.noteId} = ${notes.id}
          AND ${noteTags.tagId} = ${query.tagId}
          AND ${tags.userId} = ${userId}
          AND ${tags.deletedAt} IS NULL
      )`,
    );
  }

  if (query.tag !== undefined) {
    const tagLower = query.tag.toLowerCase();
    conditions.push(
      sql`EXISTS (
        SELECT 1
        FROM ${noteTags}
        INNER JOIN ${tags} ON ${tags.id} = ${noteTags.tagId}
        WHERE ${noteTags.noteId} = ${notes.id}
          AND ${tags.userId} = ${userId}
          AND ${tags.deletedAt} IS NULL
          AND lower(${tags.name}) = ${tagLower}
      )`,
    );
  }

  if (query.q !== undefined) {
    const escaped = `%${escapeLikePattern(query.q)}%`;
    conditions.push(
      sql`(
        ${notes.title} ILIKE ${escaped} ESCAPE '\\'
        OR ${notes.content} ILIKE ${escaped} ESCAPE '\\'
        OR EXISTS (
          SELECT 1
          FROM ${noteTags}
          INNER JOIN ${tags} ON ${tags.id} = ${noteTags.tagId}
          WHERE ${noteTags.noteId} = ${notes.id}
            AND ${tags.userId} = ${userId}
            AND ${tags.deletedAt} IS NULL
            AND ${tags.name} ILIKE ${escaped} ESCAPE '\\'
        )
      )`,
    );
  }

  if (query.cursor !== undefined) {
    const cursor = decodeNotesCursor(query.cursor);
    if (cursor.p) {
      conditions.push(
        or(
          eq(notes.isPinned, false),
          and(eq(notes.isPinned, true), lt(notes.updatedAt, cursor.u)),
          and(
            eq(notes.isPinned, true),
            eq(notes.updatedAt, cursor.u),
            lt(notes.id, cursor.i),
          ),
        )!,
      );
    } else {
      conditions.push(
        or(
          and(eq(notes.isPinned, false), lt(notes.updatedAt, cursor.u)),
          and(
            eq(notes.isPinned, false),
            eq(notes.updatedAt, cursor.u),
            lt(notes.id, cursor.i),
          ),
        )!,
      );
    }
  }

  const rows = await dbOrTx
    .select({
      id: notes.id,
      folderId: notes.folderId,
      folderName: folders.name,
      title: notes.title,
      content: notes.content,
      isPinned: notes.isPinned,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .leftJoin(
      folders,
      and(
        eq(notes.folderId, folders.id),
        eq(folders.userId, userId),
        isNull(folders.deletedAt),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(notes.isPinned), desc(notes.updatedAt), desc(notes.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const tagMap = await fetchTagsByNoteIds(
    dbOrTx,
    userId,
    pageRows.map((row) => row.id),
  );

  const items = pageRows.map((row) =>
    buildNoteDto(row, tagMap.get(row.id) ?? []),
  );

  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && lastRow ? encodeNotesCursor(lastRow) : null;

  return {
    items,
    nextCursor,
  };
}

/**
 * Fetches a single active note owned by the user or throws 404 NOTE_NOT_FOUND (SEC-1).
 */
export async function getNoteById(
  userId: string,
  noteId: string,
  dbOrTx: DbOrTx = getDb(),
): Promise<NoteDto> {
  const row = await fetchHydratedNoteRow(dbOrTx, userId, noteId);
  if (!row) {
    throw new ApiError(404, "NOTE_NOT_FOUND", "Note not found");
  }

  const tagMap = await fetchTagsByNoteIds(dbOrTx, userId, [row.id]);
  return buildNoteDto(row, tagMap.get(row.id) ?? []);
}

/**
 * Creates a new note within the provided transaction or new transaction, hydrating tags & folder.
 */
export async function createNote(
  userId: string,
  input: CreateNoteInput,
  txArg?: DbOrTx,
): Promise<NoteDto> {
  const run = async (tx: DbOrTx): Promise<NoteDto> => {
    if (input.id !== undefined) {
      const existingById = await tx
        .select({ id: notes.id, userId: notes.userId })
        .from(notes)
        .where(eq(notes.id, input.id))
        .limit(1);

      if (existingById[0]) {
        throw new ApiError(409, "NOTE_ALREADY_EXISTS", "Note ID already exists");
      }
    }

    let folderName: string | null = null;
    if (input.folderId !== undefined && input.folderId !== null) {
      folderName = await assertOwnedActiveFolder(tx, userId, input.folderId);
    }

    const lww = resolveLwwTimestamp(new Date(0), input.updatedAt);
    const now = lww.nextUpdatedAt;

    const inserted = await tx
      .insert(notes)
      .values({
        ...(input.id !== undefined ? { id: input.id } : {}),
        userId,
        folderId: input.folderId ?? null,
        title: input.title,
        content: input.content,
        isPinned: input.isPinned,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: notes.id,
        folderId: notes.folderId,
        title: notes.title,
        content: notes.content,
        isPinned: notes.isPinned,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      });

    const created = inserted[0];
    const syncedTags = await syncNoteTags(tx, userId, created.id, input.tags, now);

    return buildNoteDto(
      {
        ...created,
        folderName,
      },
      syncedTags,
    );
  };

  return txArg ? run(txArg) : getDb().transaction(run);
}

/**
 * Updates a note using LWW metadata resolution and folder/tag ownership verification.
 */
export async function updateNote(
  userId: string,
  noteId: string,
  input: UpdateNoteInput,
  txArg?: DbOrTx,
): Promise<NoteMutationResult> {
  const run = async (tx: DbOrTx): Promise<NoteMutationResult> => {
    const existing = await fetchHydratedNoteRow(tx, userId, noteId);
    if (!existing) {
      throw new ApiError(404, "NOTE_NOT_FOUND", "Note not found");
    }

    const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      const existingTags = await fetchTagsByNoteIds(tx, userId, [noteId]);
      return {
        note: buildNoteDto(existing, existingTags.get(noteId) ?? []),
        conflictResolved: "server_newer",
      };
    }

    let nextFolderName = existing.folderName;
    if (input.folderId !== undefined) {
      if (input.folderId === null) {
        nextFolderName = null;
      } else {
        nextFolderName = await assertOwnedActiveFolder(
          tx,
          userId,
          input.folderId,
        );
      }
    }

    const nextTitle = input.title ?? existing.title;
    const nextContent = input.content ?? existing.content;
    const nextPinned = input.isPinned ?? existing.isPinned;
    const nextFolderId =
      input.folderId !== undefined ? input.folderId : existing.folderId;

    const updatedRows = await tx
      .update(notes)
      .set({
        folderId: nextFolderId,
        title: nextTitle,
        content: nextContent,
        isPinned: nextPinned,
        updatedAt: lww.nextUpdatedAt,
      })
      .where(
        and(
          eq(notes.id, noteId),
          eq(notes.userId, userId),
          isNull(notes.deletedAt),
        ),
      )
      .returning({
        id: notes.id,
        folderId: notes.folderId,
        title: notes.title,
        content: notes.content,
        isPinned: notes.isPinned,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      });

    const updatedRow = updatedRows[0];
    if (!updatedRow) {
      throw new ApiError(404, "NOTE_NOT_FOUND", "Note not found");
    }

    const nextTags =
      input.tags !== undefined
        ? await syncNoteTags(tx, userId, noteId, input.tags, lww.nextUpdatedAt)
        : ((await fetchTagsByNoteIds(tx, userId, [noteId])).get(noteId) ?? []);

    return {
      note: buildNoteDto(
        {
          ...updatedRow,
          folderName: nextFolderName,
        },
        nextTags,
      ),
      conflictResolved: "applied",
    };
  };

  return txArg ? run(txArg) : getDb().transaction(run);
}

/**
 * Toggles a specific GFM checklist item index in the note's Markdown content with LWW protection.
 */
export async function toggleNoteChecklist(
  userId: string,
  noteId: string,
  input: ToggleChecklistInput,
  txArg?: DbOrTx,
): Promise<NoteMutationResult> {
  const run = async (tx: DbOrTx): Promise<NoteMutationResult> => {
    const existing = await fetchHydratedNoteRow(tx, userId, noteId);
    if (!existing) {
      throw new ApiError(404, "NOTE_NOT_FOUND", "Note not found");
    }

    const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      const existingTags = await fetchTagsByNoteIds(tx, userId, [noteId]);
      return {
        note: buildNoteDto(existing, existingTags.get(noteId) ?? []),
        conflictResolved: "server_newer",
      };
    }

    const nextContent = toggleChecklistInMarkdown(
      existing.content,
      input.index,
      input.checked,
    );

    const updatedRows = await tx
      .update(notes)
      .set({
        content: nextContent,
        updatedAt: lww.nextUpdatedAt,
      })
      .where(
        and(
          eq(notes.id, noteId),
          eq(notes.userId, userId),
          isNull(notes.deletedAt),
        ),
      )
      .returning({
        id: notes.id,
        folderId: notes.folderId,
        title: notes.title,
        content: notes.content,
        isPinned: notes.isPinned,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      });

    const updatedRow = updatedRows[0];
    if (!updatedRow) {
      throw new ApiError(404, "NOTE_NOT_FOUND", "Note not found");
    }

    const noteTagList =
      (await fetchTagsByNoteIds(tx, userId, [noteId])).get(noteId) ?? [];

    return {
      note: buildNoteDto(
        {
          ...updatedRow,
          folderName: existing.folderName,
        },
        noteTagList,
      ),
      conflictResolved: "applied",
    };
  };

  return txArg ? run(txArg) : getDb().transaction(run);
}

/**
 * Executes transactional note deletion logic (unlink transactions, orphan tags, collect storage keys).
 * Callers must execute `cleanupPayload` ONLY after the enclosing database transaction commits.
 */
export async function deleteNoteInTx(
  tx: DbOrTx,
  userId: string,
  noteId: string,
  input: DeleteMutationBody = {},
): Promise<{
  result: NoteDeleteResult;
  cleanupPayload: NoteDeleteCleanupPayload | null;
}> {
  const existing = await fetchHydratedNoteRow(tx, userId, noteId);
  if (!existing) {
    throw new ApiError(404, "NOTE_NOT_FOUND", "Note not found");
  }

  const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
  if (lww.serverNewer) {
    const existingTags = await fetchTagsByNoteIds(tx, userId, [noteId]);
    return {
      result: {
        deleted: false,
        id: noteId,
        conflictResolved: "server_newer",
        note: buildNoteDto(existing, existingTags.get(noteId) ?? []),
      },
      cleanupPayload: null,
    };
  }

  const attachmentRows = await tx
    .select({ storageKey: noteAttachments.storageKey })
    .from(noteAttachments)
    .where(
      and(
        eq(noteAttachments.noteId, noteId),
        eq(noteAttachments.userId, userId),
      ),
    );

  // DATA-4: detach linked finance transactions without deleting them.
  await tx
    .update(transactions)
    .set({
      noteId: null,
      updatedAt: lww.nextUpdatedAt,
    })
    .where(
      and(eq(transactions.userId, userId), eq(transactions.noteId, noteId)),
    );

  await tx
    .update(notes)
    .set({
      deletedAt: lww.nextUpdatedAt,
      updatedAt: lww.nextUpdatedAt,
    })
    .where(
      and(
        eq(notes.id, noteId),
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
      ),
    );

  await tx.delete(noteTags).where(eq(noteTags.noteId, noteId));
  await softDeleteOrphanTags(tx, userId, lww.nextUpdatedAt);

  return {
    result: {
      deleted: true,
      id: noteId,
      conflictResolved: "applied",
    },
    cleanupPayload: {
      userId,
      noteId,
      storageKeys: attachmentRows.map((row) => row.storageKey),
    },
  };
}

/**
 * Soft-deletes a note atomically, detaches linked transactions, and triggers storage cleanup post-commit.
 */
export async function deleteNote(
  userId: string,
  noteId: string,
  input: DeleteMutationBody = {},
): Promise<NoteDeleteResult> {
  const outcome = await getDb().transaction((tx) =>
    deleteNoteInTx(tx, userId, noteId, input),
  );

  if (outcome.cleanupPayload) {
    await runNoteDeleteCleanupHandlers(outcome.cleanupPayload);
  }

  return outcome.result;
}

/**
 * Lists active folders owned by the user with active note counts.
 */
export async function listFolders(
  userId: string,
  dbOrTx: DbOrTx = getDb(),
): Promise<FolderDto[]> {
  const rows = await dbOrTx
    .select({
      id: folders.id,
      name: folders.name,
      createdAt: folders.createdAt,
      updatedAt: folders.updatedAt,
      noteCount: sql<number>`count(${notes.id})::int`,
    })
    .from(folders)
    .leftJoin(
      notes,
      and(
        eq(notes.folderId, folders.id),
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
      ),
    )
    .where(and(eq(folders.userId, userId), isNull(folders.deletedAt)))
    .groupBy(folders.id, folders.name, folders.createdAt, folders.updatedAt)
    .orderBy(asc(sql`lower(${folders.name})`), asc(folders.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    noteCount: Number(row.noteCount ?? 0),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Creates a new folder enforcing case-insensitive uniqueness across active folders.
 */
export async function createFolder(
  userId: string,
  input: CreateFolderInput,
  txArg?: DbOrTx,
): Promise<FolderDto> {
  const run = async (tx: DbOrTx): Promise<FolderDto> => {
    if (input.id !== undefined) {
      const existingById = await tx
        .select({ id: folders.id })
        .from(folders)
        .where(eq(folders.id, input.id))
        .limit(1);

      if (existingById[0]) {
        throw new ApiError(
          409,
          "FOLDER_ALREADY_EXISTS",
          "Folder ID already exists",
        );
      }
    }

    const duplicate = await tx
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.userId, userId),
          isNull(folders.deletedAt),
          eq(sql`lower(${folders.name})`, input.name.toLowerCase()),
        ),
      )
      .limit(1);

    if (duplicate[0]) {
      throw new ApiError(
        409,
        "FOLDER_NAME_EXISTS",
        "A folder with this name already exists",
      );
    }

    const lww = resolveLwwTimestamp(new Date(0), input.updatedAt);
    const now = lww.nextUpdatedAt;

    try {
      const inserted = await tx
        .insert(folders)
        .values({
          ...(input.id !== undefined ? { id: input.id } : {}),
          userId,
          name: input.name,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: folders.id,
          name: folders.name,
          createdAt: folders.createdAt,
          updatedAt: folders.updatedAt,
        });

      const created = inserted[0];
      return {
        id: created.id,
        name: created.name,
        noteCount: 0,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ApiError(
          409,
          "FOLDER_NAME_EXISTS",
          "A folder with this name already exists",
        );
      }
      throw error;
    }
  };

  return txArg ? run(txArg) : getDb().transaction(run);
}

/**
 * Renames an active user folder with LWW resolution and duplicate-name enforcement.
 */
export async function updateFolder(
  userId: string,
  folderId: string,
  input: UpdateFolderInput,
  txArg?: DbOrTx,
): Promise<FolderMutationResult> {
  const run = async (tx: DbOrTx): Promise<FolderMutationResult> => {
    const existingRows = await tx
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.id, folderId),
          eq(folders.userId, userId),
          isNull(folders.deletedAt),
        ),
      )
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "FOLDER_NOT_FOUND", "Folder not found");
    }

    const noteCount = await countActiveNotesInFolder(tx, userId, folderId);

    const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      return {
        folder: {
          id: existing.id,
          name: existing.name,
          noteCount,
          createdAt: existing.createdAt.toISOString(),
          updatedAt: existing.updatedAt.toISOString(),
        },
        conflictResolved: "server_newer",
      };
    }

    const duplicate = await tx
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.userId, userId),
          isNull(folders.deletedAt),
          eq(sql`lower(${folders.name})`, input.name.toLowerCase()),
        ),
      )
      .limit(1);

    if (duplicate[0] && duplicate[0].id !== folderId) {
      throw new ApiError(
        409,
        "FOLDER_NAME_EXISTS",
        "A folder with this name already exists",
      );
    }

    try {
      const updatedRows = await tx
        .update(folders)
        .set({
          name: input.name,
          updatedAt: lww.nextUpdatedAt,
        })
        .where(
          and(
            eq(folders.id, folderId),
            eq(folders.userId, userId),
            isNull(folders.deletedAt),
          ),
        )
        .returning({
          id: folders.id,
          name: folders.name,
          createdAt: folders.createdAt,
          updatedAt: folders.updatedAt,
        });

      const updated = updatedRows[0];
      if (!updated) {
        throw new ApiError(404, "FOLDER_NOT_FOUND", "Folder not found");
      }

      return {
        folder: {
          id: updated.id,
          name: updated.name,
          noteCount,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
        conflictResolved: "applied",
      };
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ApiError(
          409,
          "FOLDER_NAME_EXISTS",
          "A folder with this name already exists",
        );
      }
      throw error;
    }
  };

  return txArg ? run(txArg) : getDb().transaction(run);
}

/**
 * Soft-deletes a folder and atomically moves contained active notes to unfiled (DATA-4).
 */
export async function deleteFolder(
  userId: string,
  folderId: string,
  input: DeleteMutationBody = {},
  txArg?: DbOrTx,
): Promise<FolderDeleteResult> {
  const run = async (tx: DbOrTx): Promise<FolderDeleteResult> => {
    const existingRows = await tx
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.id, folderId),
          eq(folders.userId, userId),
          isNull(folders.deletedAt),
        ),
      )
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "FOLDER_NOT_FOUND", "Folder not found");
    }

    const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      const noteCount = await countActiveNotesInFolder(tx, userId, folderId);
      return {
        deleted: false,
        id: folderId,
        conflictResolved: "server_newer",
        folder: {
          id: existing.id,
          name: existing.name,
          noteCount,
          createdAt: existing.createdAt.toISOString(),
          updatedAt: existing.updatedAt.toISOString(),
        },
      };
    }

    const movedRows = await tx
      .update(notes)
      .set({
        folderId: null,
        updatedAt: lww.nextUpdatedAt,
      })
      .where(
        and(
          eq(notes.userId, userId),
          eq(notes.folderId, folderId),
          isNull(notes.deletedAt),
        ),
      )
      .returning({ id: notes.id });

    await tx
      .update(folders)
      .set({
        deletedAt: lww.nextUpdatedAt,
        updatedAt: lww.nextUpdatedAt,
      })
      .where(
        and(
          eq(folders.id, folderId),
          eq(folders.userId, userId),
          isNull(folders.deletedAt),
        ),
      );

    return {
      deleted: true,
      id: folderId,
      movedNotesCount: movedRows.length,
      conflictResolved: "applied",
    };
  };

  return txArg ? run(txArg) : getDb().transaction(run);
}

/**
 * Lists active tags belonging to the user that are linked to at least one active note.
 */
export async function listTags(
  userId: string,
  dbOrTx: DbOrTx = getDb(),
): Promise<TagDto[]> {
  const rows = await dbOrTx
    .select({
      id: tags.id,
      name: tags.name,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
      noteCount: sql<number>`count(${notes.id})::int`,
    })
    .from(tags)
    .innerJoin(noteTags, eq(noteTags.tagId, tags.id))
    .innerJoin(
      notes,
      and(
        eq(notes.id, noteTags.noteId),
        eq(notes.userId, userId),
        isNull(notes.deletedAt),
      ),
    )
    .where(and(eq(tags.userId, userId), isNull(tags.deletedAt)))
    .groupBy(tags.id, tags.name, tags.createdAt, tags.updatedAt)
    .orderBy(asc(sql`lower(${tags.name})`), asc(tags.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    noteCount: Number(row.noteCount ?? 0),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}
