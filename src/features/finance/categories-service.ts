import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { categories, transactions } from "@/db/schema/finance";
import type {
  CategoryListQueryInput,
  CreateCategoryInput,
  DeleteFinanceMutationBody,
  FinanceEntryType,
  UpdateCategoryInput,
} from "@/features/finance/schemas";
import {
  isPgUniqueViolation,
  type ConflictResolution,
} from "@/features/finance/shared";
import { ApiError } from "@/lib/api-response";
import { resolveLwwTimestamp } from "@/lib/idempotency";

export interface CategoryDto {
  id: string;
  name: string;
  type: FinanceEntryType;
  isSystem: boolean;
  systemKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryMutationResult {
  category: CategoryDto;
  conflictResolved: ConflictResolution;
}

export interface CategoryDeleteResult {
  deleted: boolean;
  id: string;
  reassignedCount?: number;
  conflictResolved: ConflictResolution;
  category?: CategoryDto;
}

function serializeCategoryRow(row: typeof categories.$inferSelect): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type as FinanceEntryType,
    isSystem: row.isSystem,
    systemKey: row.systemKey ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Lists active categories ordered system-first, then alphabetically by name.
 */
export async function listCategories(
  userId: string,
  query: Partial<CategoryListQueryInput> = {},
  txOrDb: DbOrTx = getDb(),
): Promise<CategoryDto[]> {
  const conditions = [
    eq(categories.userId, userId),
    isNull(categories.deletedAt),
  ];

  if (query.type !== undefined) {
    conditions.push(eq(categories.type, query.type));
  }

  const rows = await txOrDb
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(desc(categories.isSystem), asc(categories.name));

  return rows.map(serializeCategoryRow);
}

/**
 * Creates a custom category enforcing case-insensitive uniqueness across all active categories of the same type.
 */
export async function createCategory(
  userId: string,
  input: CreateCategoryInput,
  txOrDb?: DbOrTx,
): Promise<CategoryDto> {
  const runInTx = async (tx: DbOrTx): Promise<CategoryDto> => {
    const duplicateRows = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.type, input.type),
          sql`lower(${categories.name}) = lower(${input.name})`,
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    if (duplicateRows.length > 0) {
      throw new ApiError(
        409,
        "CATEGORY_ALREADY_EXISTS",
        "A category with this name already exists",
      );
    }

    const createdTimestamp = resolveLwwTimestamp(
      new Date(0),
      input.updatedAt,
    ).nextUpdatedAt;

    try {
      const [inserted] = await tx
        .insert(categories)
        .values({
          id: input.id,
          userId,
          name: input.name,
          type: input.type,
          isSystem: false,
          systemKey: null,
          createdAt: createdTimestamp,
          updatedAt: createdTimestamp,
        })
        .returning();

      return serializeCategoryRow(inserted);
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        const constraint =
          typeof error === "object" && error !== null
            ? ((error as { constraint?: unknown }).constraint ??
              (error as { cause?: { constraint?: unknown } }).cause?.constraint)
            : undefined;
        if (constraint === "categories_user_type_lower_name_active_idx") {
          throw new ApiError(
            409,
            "CATEGORY_ALREADY_EXISTS",
            "A category with this name already exists",
          );
        }
        throw new ApiError(
          409,
          "RESOURCE_ALREADY_EXISTS",
          "Category ID already exists",
        );
      }
      throw error;
    }
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}

/**
 * Renames a custom category while rejecting system category edits prior to LWW timestamp checks.
 */
export async function updateCategory(
  userId: string,
  categoryId: string,
  input: UpdateCategoryInput,
  txOrDb?: DbOrTx,
): Promise<CategoryMutationResult> {
  const runInTx = async (tx: DbOrTx): Promise<CategoryMutationResult> => {
    const existingRows = await tx
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.userId, userId),
          isNull(categories.deletedAt),
        ),
      )
      .for("update")
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }

    // Protect immutable system categories before evaluating LWW timestamps.
    if (existing.isSystem) {
      throw new ApiError(
        403,
        "CANNOT_MODIFY_SYSTEM_CATEGORY",
        "System categories cannot be modified",
      );
    }

    const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      return {
        category: serializeCategoryRow(existing),
        conflictResolved: "server_newer",
      };
    }

    const duplicateRows = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.type, existing.type),
          sql`lower(${categories.name}) = lower(${input.name})`,
          ne(categories.id, categoryId),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    if (duplicateRows.length > 0) {
      throw new ApiError(
        409,
        "CATEGORY_ALREADY_EXISTS",
        "A category with this name already exists",
      );
    }

    try {
      const [updated] = await tx
        .update(categories)
        .set({
          name: input.name,
          updatedAt: lww.nextUpdatedAt,
        })
        .where(
          and(eq(categories.id, categoryId), eq(categories.userId, userId)),
        )
        .returning();

      return {
        category: serializeCategoryRow(updated),
        conflictResolved: "applied",
      };
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new ApiError(
          409,
          "CATEGORY_ALREADY_EXISTS",
          "A category with this name already exists",
        );
      }
      throw error;
    }
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}

/**
 * Soft-deletes a custom category and atomically reassigns all active transactions to `other_expense` / `other_income` (DATA-4).
 */
export async function deleteCategory(
  userId: string,
  categoryId: string,
  input: DeleteFinanceMutationBody,
  txOrDb?: DbOrTx,
): Promise<CategoryDeleteResult> {
  const runInTx = async (tx: DbOrTx): Promise<CategoryDeleteResult> => {
    const existingRows = await tx
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.userId, userId),
          isNull(categories.deletedAt),
        ),
      )
      .for("update")
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }

    if (existing.isSystem) {
      throw new ApiError(
        403,
        "CANNOT_DELETE_SYSTEM_CATEGORY",
        "System categories cannot be deleted",
      );
    }

    const lww = resolveLwwTimestamp(existing.updatedAt, input.updatedAt);
    if (lww.serverNewer) {
      return {
        deleted: false,
        id: categoryId,
        category: serializeCategoryRow(existing),
        conflictResolved: "server_newer",
      };
    }

    const fallbackKey =
      existing.type === "income" ? "other_income" : "other_expense";
    const fallbackRows = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.systemKey, fallbackKey),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    const fallbackCategory = fallbackRows[0];
    if (!fallbackCategory) {
      throw new ApiError(
        500,
        "INTERNAL_ERROR",
        `System fallback category ${fallbackKey} is missing`,
      );
    }

    const reassignedRows = await tx
      .update(transactions)
      .set({
        categoryId: fallbackCategory.id,
        updatedAt: lww.nextUpdatedAt,
      })
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.categoryId, categoryId),
          isNull(transactions.deletedAt),
        ),
      )
      .returning({ id: transactions.id });

    await tx
      .update(categories)
      .set({
        deletedAt: new Date(),
        updatedAt: lww.nextUpdatedAt,
      })
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));

    return {
      deleted: true,
      id: categoryId,
      reassignedCount: reassignedRows.length,
      conflictResolved: "applied",
    };
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}

