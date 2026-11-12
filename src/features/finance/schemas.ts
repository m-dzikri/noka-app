import { z } from "zod";
import { ApiError } from "@/lib/api-response";

export const WALLET_TYPES = ["cash", "bank", "ewallet"] as const;
export const CATEGORY_TYPES = ["income", "expense"] as const;
export const FINANCE_SUMMARY_FILTER_TYPES = [
  "all",
  "income",
  "expense",
  "transfer",
] as const;

export const WALLET_NAME_MAX_LENGTH = 80;
export const CATEGORY_NAME_MAX_LENGTH = 60;
export const TRANSACTION_DESCRIPTION_MAX_LENGTH = 300;
export const TRANSFER_NOTE_MAX_LENGTH = 300;

export const FINANCE_LIST_DEFAULT_LIMIT = 50;
export const FINANCE_LIST_MAX_LIMIT = 100;
export const DEFAULT_TZ_OFFSET_MINUTES = 420; // UTC+7 (WIB)

export type WalletType = (typeof WALLET_TYPES)[number];
export type FinanceEntryType = (typeof CATEGORY_TYPES)[number];
export type FinanceSummaryFilterType =
  (typeof FINANCE_SUMMARY_FILTER_TYPES)[number];

export const uuidSchema = z.string().uuid();

const optionalIdempotencyKeySchema = z.string().trim().min(1).max(128).optional();
const optionalUpdatedAtSchema = z.string().trim().min(1).max(64).optional();

export const initialBalanceSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);

export const positiveIdrAmountSchema = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER);

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isValidCalendarDateParts(year: number, month: number, day: number): boolean {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

/**
 * Validates `YYYY-MM-DD` (interpreted as UTC midnight) or full ISO-8601 datetime with offset/Z.
 */
export function parseOccurredAtValue(raw: string): Date | null {
  const trimmed = raw.trim();
  if (DATE_ONLY_PATTERN.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    if (!isValidCalendarDateParts(y, m, d)) {
      return null;
    }
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  }

  if (!ISO_DATETIME_PATTERN.test(trimmed)) {
    return null;
  }

  const parsedMs = Date.parse(trimmed);
  return Number.isNaN(parsedMs) ? null : new Date(parsedMs);
}

export const occurredAtSchema = z
  .string()
  .trim()
  .refine((val) => parseOccurredAtValue(val) !== null, {
    message: "Must be a valid ISO-8601 date or datetime",
  });

const optionalDateFilterSchema = z
  .string()
  .trim()
  .refine(
    (val) =>
      DATE_ONLY_PATTERN.test(val)
        ? parseOccurredAtValue(val) !== null
        : ISO_DATETIME_PATTERN.test(val) && !Number.isNaN(Date.parse(val)),
    { message: "Must be a valid YYYY-MM-DD date or ISO-8601 datetime" },
  )
  .optional();

export const createWalletSchema = z
  .object({
    id: uuidSchema.optional(),
    name: z.string().trim().min(1).max(WALLET_NAME_MAX_LENGTH),
    type: z.enum(WALLET_TYPES),
    initialBalance: initialBalanceSchema.optional().default(0),
    includeInSafeToSpend: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    updatedAt: optionalUpdatedAtSchema,
    idempotencyKey: optionalIdempotencyKeySchema,
  })
  .strict();

export const updateWalletSchema = z
  .object({
    name: z.string().trim().min(1).max(WALLET_NAME_MAX_LENGTH).optional(),
    type: z.enum(WALLET_TYPES).optional(),
    initialBalance: initialBalanceSchema.optional(),
    includeInSafeToSpend: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    archived: z.boolean().optional(),
    updatedAt: optionalUpdatedAtSchema,
    idempotencyKey: optionalIdempotencyKeySchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasMutatingField =
      data.name !== undefined ||
      data.type !== undefined ||
      data.initialBalance !== undefined ||
      data.includeInSafeToSpend !== undefined ||
      data.isDefault !== undefined ||
      data.archived !== undefined;

    if (!hasMutatingField) {
      ctx.addIssue({
        code: "custom",
        message: "At least one wallet field must be provided for update",
      });
    }

    if (data.isDefault === true && data.archived === true) {
      ctx.addIssue({
        code: "custom",
        path: ["isDefault"],
        message: "Cannot set a wallet as default while archiving it",
      });
    }
  });

export const walletListQuerySchema = z.object({
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const createCategorySchema = z
  .object({
    id: uuidSchema.optional(),
    name: z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH),
    type: z.enum(CATEGORY_TYPES),
    updatedAt: optionalUpdatedAtSchema,
    idempotencyKey: optionalIdempotencyKeySchema,
  })
  .strict();

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH),
    updatedAt: optionalUpdatedAtSchema,
    idempotencyKey: optionalIdempotencyKeySchema,
  })
  .strict();

export const categoryListQuerySchema = z.object({
  type: z.enum(CATEGORY_TYPES).optional(),
});

export const createTransactionSchema = z
  .object({
    id: uuidSchema.optional(),
    walletId: uuidSchema,
    categoryId: uuidSchema,
    noteId: uuidSchema.nullable().optional(),
    type: z.enum(CATEGORY_TYPES),
    amount: positiveIdrAmountSchema,
    description: z
      .string()
      .trim()
      .max(TRANSACTION_DESCRIPTION_MAX_LENGTH)
      .nullable()
      .optional(),
    occurredAt: occurredAtSchema,
    updatedAt: optionalUpdatedAtSchema,
    idempotencyKey: optionalIdempotencyKeySchema,
  })
  .strict();

export const updateTransactionSchema = z
  .object({
    walletId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    noteId: uuidSchema.nullable().optional(),
    type: z.enum(CATEGORY_TYPES).optional(),
    amount: positiveIdrAmountSchema.optional(),
    description: z
      .string()
      .trim()
      .max(TRANSACTION_DESCRIPTION_MAX_LENGTH)
      .nullable()
      .optional(),
    occurredAt: occurredAtSchema.optional(),
    updatedAt: optionalUpdatedAtSchema,
    idempotencyKey: optionalIdempotencyKeySchema,
  })
  .strict()
  .refine(
    (data) =>
      data.walletId !== undefined ||
      data.categoryId !== undefined ||
      data.noteId !== undefined ||
      data.type !== undefined ||
      data.amount !== undefined ||
      data.description !== undefined ||
      data.occurredAt !== undefined,
    { message: "At least one transaction field must be provided for update" },
  );

export const createTransferSchema = z
  .object({
    id: uuidSchema.optional(),
    fromWalletId: uuidSchema,
    toWalletId: uuidSchema,
    amount: positiveIdrAmountSchema,
    note: z.string().trim().max(TRANSFER_NOTE_MAX_LENGTH).nullable().optional(),
    occurredAt: occurredAtSchema,
    updatedAt: optionalUpdatedAtSchema,
    idempotencyKey: optionalIdempotencyKeySchema,
  })
  .strict();

export const updateTransferSchema = z
  .object({
    fromWalletId: uuidSchema.optional(),
    toWalletId: uuidSchema.optional(),
    amount: positiveIdrAmountSchema.optional(),
    note: z.string().trim().max(TRANSFER_NOTE_MAX_LENGTH).nullable().optional(),
    occurredAt: occurredAtSchema.optional(),
    updatedAt: optionalUpdatedAtSchema,
    idempotencyKey: optionalIdempotencyKeySchema,
  })
  .strict()
  .refine(
    (data) =>
      data.fromWalletId !== undefined ||
      data.toWalletId !== undefined ||
      data.amount !== undefined ||
      data.note !== undefined ||
      data.occurredAt !== undefined,
    { message: "At least one transfer field must be provided for update" },
  );

export const deleteFinanceMutationBodySchema = z
  .object({
    updatedAt: optionalUpdatedAtSchema,
    idempotencyKey: optionalIdempotencyKeySchema,
  })
  .strict();

const tzOffsetQuerySchema = z.coerce
  .number()
  .int()
  .min(-720)
  .max(840)
  .optional()
  .default(DEFAULT_TZ_OFFSET_MINUTES);

const limitQuerySchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(FINANCE_LIST_MAX_LIMIT)
  .optional()
  .default(FINANCE_LIST_DEFAULT_LIMIT);

const cursorQuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .optional();

/**
 * Resolves inclusive UTC date bounds from optional `from`/`to` parameters and client `tzOffset` minutes (default UTC+7).
 */
export function resolveDateFilterRange(
  fromRaw?: string,
  toRaw?: string,
  tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES,
): { fromDate?: Date; toDate?: Date } {
  let fromDate: Date | undefined;
  let toDate: Date | undefined;

  if (fromRaw !== undefined) {
    const trimmed = fromRaw.trim();
    if (DATE_ONLY_PATTERN.test(trimmed)) {
      const [y, m, d] = trimmed.split("-").map(Number);
      fromDate = new Date(
        Date.UTC(y, m - 1, d, 0, 0, 0, 0) - tzOffsetMinutes * 60_000,
      );
    } else {
      fromDate = new Date(Date.parse(trimmed));
    }
  }

  if (toRaw !== undefined) {
    const trimmed = toRaw.trim();
    if (DATE_ONLY_PATTERN.test(trimmed)) {
      const [y, m, d] = trimmed.split("-").map(Number);
      toDate = new Date(
        Date.UTC(y, m - 1, d, 23, 59, 59, 999) - tzOffsetMinutes * 60_000,
      );
    } else {
      toDate = new Date(Date.parse(trimmed));
    }
  }

  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Parameter 'from' must not be later than 'to'",
      { from: ["Must be earlier than or equal to 'to'"] },
    );
  }

  return { fromDate, toDate };
}

export const transactionListQuerySchema = z.object({
  from: optionalDateFilterSchema,
  to: optionalDateFilterSchema,
  tzOffset: tzOffsetQuerySchema,
  walletId: uuidSchema.optional(),
  type: z.enum(CATEGORY_TYPES).optional(),
  categoryId: uuidSchema.optional(),
  unlinked: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  limit: limitQuerySchema,
  cursor: cursorQuerySchema,
});

export const transferListQuerySchema = z.object({
  from: optionalDateFilterSchema,
  to: optionalDateFilterSchema,
  tzOffset: tzOffsetQuerySchema,
  walletId: uuidSchema.optional(),
  limit: limitQuerySchema,
  cursor: cursorQuerySchema,
});

export const financeSummaryQuerySchema = z.object({
  from: optionalDateFilterSchema,
  to: optionalDateFilterSchema,
  walletId: uuidSchema.optional(),
  type: z.enum(FINANCE_SUMMARY_FILTER_TYPES).optional().default("all"),
  categoryId: uuidSchema.optional(),
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  tzOffset: tzOffsetQuerySchema,
  limit: limitQuerySchema,
  cursor: cursorQuerySchema,
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;
export type WalletListQueryInput = z.infer<typeof walletListQuerySchema>;

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryListQueryInput = z.infer<typeof categoryListQuerySchema>;

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionListQueryInput = z.infer<typeof transactionListQuerySchema>;

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type UpdateTransferInput = z.infer<typeof updateTransferSchema>;
export type TransferListQueryInput = z.infer<typeof transferListQuerySchema>;
export type FinanceSummaryQueryInput = z.infer<typeof financeSummaryQuerySchema>;

export type DeleteFinanceMutationBody = z.infer<typeof deleteFinanceMutationBodySchema>;

