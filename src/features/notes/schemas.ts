import { z } from "zod";
import { ApiError } from "@/lib/api-response";

export const NOTE_TITLE_MAX_LENGTH = 200;
export const NOTE_CONTENT_MAX_LENGTH = 200_000;
export const FOLDER_NAME_MAX_LENGTH = 80;
export const TAG_NAME_MAX_LENGTH = 40;
export const NOTE_MAX_TAGS = 20;
export const NOTE_LIST_DEFAULT_LIMIT = 50;
export const NOTE_LIST_MAX_LIMIT = 100;

export const uuidSchema = z.string().uuid();

const optionalIdempotencyKeySchema = z.string().trim().min(1).max(128).optional();
const optionalUpdatedAtSchema = z.string().trim().min(1).max(64).optional();

export const tagListSchema = z
  .array(z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH))
  .transform((items) => normalizeTagNames(items))
  .pipe(z.array(z.string()).max(NOTE_MAX_TAGS));

export const createNoteSchema = z.object({
  id: uuidSchema.optional(),
  folderId: uuidSchema.nullable().optional(),
  title: z.string().trim().max(NOTE_TITLE_MAX_LENGTH).optional().default(""),
  content: z.string().max(NOTE_CONTENT_MAX_LENGTH).optional().default(""),
  isPinned: z.boolean().optional().default(false),
  tags: tagListSchema.optional().default([]),
  updatedAt: optionalUpdatedAtSchema,
  idempotencyKey: optionalIdempotencyKeySchema,
});

export const updateNoteSchema = z.object({
  folderId: uuidSchema.nullable().optional(),
  title: z.string().trim().max(NOTE_TITLE_MAX_LENGTH).optional(),
  content: z.string().max(NOTE_CONTENT_MAX_LENGTH).optional(),
  isPinned: z.boolean().optional(),
  tags: tagListSchema.optional(),
  updatedAt: optionalUpdatedAtSchema,
  idempotencyKey: optionalIdempotencyKeySchema,
});

export const toggleChecklistSchema = z.object({
  index: z.number().int().min(0).max(50_000),
  checked: z.boolean(),
  updatedAt: optionalUpdatedAtSchema,
  idempotencyKey: optionalIdempotencyKeySchema,
});

export const deleteMutationBodySchema = z.object({
  updatedAt: optionalUpdatedAtSchema,
  idempotencyKey: optionalIdempotencyKeySchema,
});

export const createFolderSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1).max(FOLDER_NAME_MAX_LENGTH),
  updatedAt: optionalUpdatedAtSchema,
  idempotencyKey: optionalIdempotencyKeySchema,
});

export const updateFolderSchema = z.object({
  name: z.string().trim().min(1).max(FOLDER_NAME_MAX_LENGTH),
  updatedAt: optionalUpdatedAtSchema,
  idempotencyKey: optionalIdempotencyKeySchema,
});

export const noteListQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  folderId: z
    .union([uuidSchema, z.literal("unfiled")])
    .optional(),
  tagId: uuidSchema.optional(),
  tag: z
    .string()
    .trim()
    .max(TAG_NAME_MAX_LENGTH)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  pinned: z
    .enum(["true", "false"])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : value === "true",
    ),
  cursor: z
    .string()
    .trim()
    .max(512)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTE_LIST_MAX_LIMIT)
    .optional()
    .default(NOTE_LIST_DEFAULT_LIMIT),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type ToggleChecklistInput = z.infer<typeof toggleChecklistSchema>;
export type DeleteMutationBody = z.infer<typeof deleteMutationBodySchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;
export type NoteListQueryInput = z.infer<typeof noteListQuerySchema>;

/**
 * Normalizes and case-insensitively deduplicates note tag names while keeping original casing.
 */
export function normalizeTagNames(rawTags: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of rawTags) {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.length > TAG_NAME_MAX_LENGTH) {
      continue;
    }

    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) {
      continue;
    }

    seen.add(lower);
    normalized.push(trimmed);
  }

  return normalized;
}

/**
 * Validates any value with Zod and throws a structured 422 ApiError matching API-1/API-2.
 */
export function validateNotesSchema<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Validation failed",
      result.error.flatten().fieldErrors,
    );
  }

  return result.data;
}

