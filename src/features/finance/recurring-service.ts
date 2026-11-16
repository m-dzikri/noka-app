import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  recurringTemplates,
  transactions,
  wallets,
} from "@/db/schema/finance";
import type {
  ConfirmRecurringItemInput,
  CreateRecurringTemplateInput,
  PendingRecurringDto,
  ProcessRecurringResultDto,
  RecurringFrequency,
  RecurringTemplateDto,
  RecurringType,
  UpdateRecurringTemplateInput,
} from "@/features/finance/recurring-schemas";
import { ApiError } from "@/lib/api-response";

/**
 * Calculates the next run date based on frequency, interval step, and target day of month/week.
 * Preserves the target day of month across months of differing lengths without permanent drift.
 */
export function calculateNextRunAt(
  fromIsoOrDate: string | Date,
  frequency: RecurringFrequency,
  intervalStep = 1,
  targetDayOfMonth?: number | null,
): Date {
  const base = new Date(fromIsoOrDate);
  const step = Math.max(1, intervalStep);

  switch (frequency) {
    case "daily": {
      const next = new Date(base.getTime());
      next.setUTCDate(next.getUTCDate() + step);
      return next;
    }
    case "weekly": {
      const next = new Date(base.getTime());
      next.setUTCDate(next.getUTCDate() + step * 7);
      return next;
    }
    case "monthly": {
      const currentYear = base.getUTCFullYear();
      const currentMonth = base.getUTCMonth();
      const targetDay = targetDayOfMonth ?? base.getUTCDate();

      let nextYear = currentYear;
      let nextMonth = currentMonth + step;
      while (nextMonth > 11) {
        nextMonth -= 12;
        nextYear += 1;
      }

      // Find max days in nextMonth
      const maxDaysInNextMonth = new Date(
        Date.UTC(nextYear, nextMonth + 1, 0),
      ).getUTCDate();
      const clampedDay = Math.min(targetDay, maxDaysInNextMonth);

      return new Date(
        Date.UTC(
          nextYear,
          nextMonth,
          clampedDay,
          base.getUTCHours(),
          base.getUTCMinutes(),
          base.getUTCSeconds(),
          base.getUTCMilliseconds(),
        ),
      );
    }
    default: {
      const next = new Date(base.getTime());
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    }
  }
}

/**
 * Derives the initial run timestamp when creating a template.
 * If startDate is in the future, uses startDate.
 * If dayOfMonth or dayOfWeek is specified, aligns to the first matching date >= startDate.
 */
export function calculateInitialRunAt(
  startDate: Date,
  frequency: RecurringFrequency,
  dayOfMonth?: number | null,
  dayOfWeek?: number | null,
): Date {
  const initial = new Date(startDate.getTime());

  if (frequency === "monthly" && typeof dayOfMonth === "number" && dayOfMonth >= 1 && dayOfMonth <= 31) {
    const currentDay = initial.getUTCDate();
    const maxDays = new Date(
      Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth() + 1, 0),
    ).getUTCDate();

    if (currentDay > dayOfMonth) {
      // Month already passed that day, schedule next month
      return calculateNextRunAt(initial, "monthly", 1, dayOfMonth);
    } else {
      const clamped = Math.min(dayOfMonth, maxDays);
      initial.setUTCDate(clamped);
      return initial;
    }
  }

  if (frequency === "weekly" && typeof dayOfWeek === "number" && dayOfWeek >= 0 && dayOfWeek <= 6) {
    const currentDow = initial.getUTCDay();
    let diff = dayOfWeek - currentDow;
    if (diff < 0) {
      diff += 7;
    }
    initial.setUTCDate(initial.getUTCDate() + diff);
    return initial;
  }

  return initial;
}

function serializeTemplateRow(row: {
  template: typeof recurringTemplates.$inferSelect;
  walletName: string;
  categoryName: string;
}): RecurringTemplateDto {
  const t = row.template;
  return {
    id: t.id,
    userId: t.userId,
    walletId: t.walletId,
    walletName: row.walletName,
    categoryId: t.categoryId,
    categoryName: row.categoryName,
    type: t.type as RecurringType,
    amount: Number(t.amount),
    description: t.description,
    frequency: t.frequency as RecurringFrequency,
    intervalStep: t.intervalStep,
    dayOfMonth: t.dayOfMonth,
    dayOfWeek: t.dayOfWeek,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate ? t.endDate.toISOString() : null,
    autoApply: t.autoApply,
    nextRunAt: t.nextRunAt.toISOString(),
    lastRunAt: t.lastRunAt ? t.lastRunAt.toISOString() : null,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function listRecurringTemplates(
  userId: string,
): Promise<RecurringTemplateDto[]> {
  const db = getDb();
  const rows = await db
    .select({
      template: recurringTemplates,
      walletName: wallets.name,
      categoryName: categories.name,
    })
    .from(recurringTemplates)
    .innerJoin(wallets, eq(recurringTemplates.walletId, wallets.id))
    .innerJoin(categories, eq(recurringTemplates.categoryId, categories.id))
    .where(eq(recurringTemplates.userId, userId))
    .orderBy(desc(recurringTemplates.createdAt));

  return rows.map(serializeTemplateRow);
}

export async function getRecurringTemplateById(
  userId: string,
  id: string,
): Promise<RecurringTemplateDto | null> {
  const db = getDb();
  const rows = await db
    .select({
      template: recurringTemplates,
      walletName: wallets.name,
      categoryName: categories.name,
    })
    .from(recurringTemplates)
    .innerJoin(wallets, eq(recurringTemplates.walletId, wallets.id))
    .innerJoin(categories, eq(recurringTemplates.categoryId, categories.id))
    .where(
      and(eq(recurringTemplates.id, id), eq(recurringTemplates.userId, userId)),
    )
    .limit(1);

  return rows[0] ? serializeTemplateRow(rows[0]) : null;
}

export async function createRecurringTemplate(
  userId: string,
  input: CreateRecurringTemplateInput,
): Promise<RecurringTemplateDto> {
  const db = getDb();

  // Validate wallet: must exist, owned by user, and NOT archived (DATA-4)
  const walletRows = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, input.walletId), eq(wallets.userId, userId)))
    .limit(1);

  if (!walletRows[0] || walletRows[0].deletedAt !== null) {
    throw new ApiError(404, "WALLET_NOT_FOUND", "Dompet tidak ditemukan");
  }
  if (walletRows[0].archivedAt !== null) {
    throw new ApiError(
      422,
      "WALLET_ARCHIVED",
      "Tidak dapat membuat jadwal berulang pada dompet yang diarsipkan",
    );
  }

  // Validate category: must exist, owned by user, and match transaction type
  const catRows = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, input.categoryId),
        eq(categories.userId, userId),
        isNull(categories.deletedAt),
      ),
    )
    .limit(1);

  if (!catRows[0]) {
    throw new ApiError(404, "CATEGORY_NOT_FOUND", "Kategori tidak ditemukan");
  }
  if (catRows[0].type !== input.type) {
    throw new ApiError(
      422,
      "CATEGORY_TYPE_MISMATCH",
      "Tipe kategori tidak sesuai dengan tipe transaksi berulang",
    );
  }

  const startDate = input.startDate ? new Date(input.startDate) : new Date();
  const endDate = input.endDate ? new Date(input.endDate) : null;

  if (endDate && endDate <= startDate) {
    throw new ApiError(
      422,
      "INVALID_END_DATE",
      "Tanggal selesai harus lebih besar dari tanggal mulai",
    );
  }

  const nextRunAt = calculateInitialRunAt(
    startDate,
    input.frequency,
    input.dayOfMonth,
    input.dayOfWeek,
  );

  const [inserted] = await db
    .insert(recurringTemplates)
    .values({
      userId,
      walletId: input.walletId,
      categoryId: input.categoryId,
      type: input.type,
      amount: input.amount,
      description: input.description,
      frequency: input.frequency,
      intervalStep: input.intervalStep ?? 1,
      dayOfMonth: input.dayOfMonth ?? null,
      dayOfWeek: input.dayOfWeek ?? null,
      startDate,
      endDate,
      autoApply: input.autoApply ?? false,
      nextRunAt,
      isActive: true,
    })
    .returning();

  return {
    id: inserted.id,
    userId: inserted.userId,
    walletId: inserted.walletId,
    walletName: walletRows[0].name,
    categoryId: inserted.categoryId,
    categoryName: catRows[0].name,
    type: inserted.type as RecurringType,
    amount: Number(inserted.amount),
    description: inserted.description,
    frequency: inserted.frequency as RecurringFrequency,
    intervalStep: inserted.intervalStep,
    dayOfMonth: inserted.dayOfMonth,
    dayOfWeek: inserted.dayOfWeek,
    startDate: inserted.startDate.toISOString(),
    endDate: inserted.endDate ? inserted.endDate.toISOString() : null,
    autoApply: inserted.autoApply,
    nextRunAt: inserted.nextRunAt.toISOString(),
    lastRunAt: inserted.lastRunAt ? inserted.lastRunAt.toISOString() : null,
    isActive: inserted.isActive,
    createdAt: inserted.createdAt.toISOString(),
    updatedAt: inserted.updatedAt.toISOString(),
  };
}

export async function updateRecurringTemplate(
  userId: string,
  id: string,
  patch: UpdateRecurringTemplateInput,
): Promise<RecurringTemplateDto> {
  const db = getDb();

  const existing = await getRecurringTemplateById(userId, id);
  if (!existing) {
    throw new ApiError(
      404,
      "TEMPLATE_NOT_FOUND",
      "Jadwal berulang tidak ditemukan",
    );
  }

  let walletName = existing.walletName;
  if (patch.walletId && patch.walletId !== existing.walletId) {
    const walletRows = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, patch.walletId), eq(wallets.userId, userId)))
      .limit(1);

    if (!walletRows[0] || walletRows[0].deletedAt !== null) {
      throw new ApiError(404, "WALLET_NOT_FOUND", "Dompet tidak ditemukan");
    }
    if (walletRows[0].archivedAt !== null) {
      throw new ApiError(
        422,
        "WALLET_ARCHIVED",
        "Tidak dapat mengarahkan jadwal ke dompet yang diarsipkan",
      );
    }
    walletName = walletRows[0].name;
  }

  let categoryName = existing.categoryName;
  const targetType = patch.type ?? existing.type;
  if (patch.categoryId && patch.categoryId !== existing.categoryId) {
    const catRows = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, patch.categoryId),
          eq(categories.userId, userId),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    if (!catRows[0]) {
      throw new ApiError(404, "CATEGORY_NOT_FOUND", "Kategori tidak ditemukan");
    }
    if (catRows[0].type !== targetType) {
      throw new ApiError(
        422,
        "CATEGORY_TYPE_MISMATCH",
        "Tipe kategori tidak sesuai dengan tipe transaksi berulang",
      );
    }
    categoryName = catRows[0].name;
  }

  const updateValues: Partial<typeof recurringTemplates.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (patch.walletId !== undefined) updateValues.walletId = patch.walletId;
  if (patch.categoryId !== undefined) updateValues.categoryId = patch.categoryId;
  if (patch.type !== undefined) updateValues.type = patch.type;
  if (patch.amount !== undefined) updateValues.amount = patch.amount;
  if (patch.description !== undefined)
    updateValues.description = patch.description;
  if (patch.frequency !== undefined) updateValues.frequency = patch.frequency;
  if (patch.intervalStep !== undefined)
    updateValues.intervalStep = patch.intervalStep;
  if (patch.dayOfMonth !== undefined) updateValues.dayOfMonth = patch.dayOfMonth;
  if (patch.dayOfWeek !== undefined) updateValues.dayOfWeek = patch.dayOfWeek;
  if (patch.endDate !== undefined)
    updateValues.endDate = patch.endDate ? new Date(patch.endDate) : null;
  if (patch.autoApply !== undefined) updateValues.autoApply = patch.autoApply;
  if (patch.isActive !== undefined) updateValues.isActive = patch.isActive;
  if (patch.nextRunAt !== undefined)
    updateValues.nextRunAt = new Date(patch.nextRunAt);

  const [updated] = await db
    .update(recurringTemplates)
    .set(updateValues)
    .where(
      and(eq(recurringTemplates.id, id), eq(recurringTemplates.userId, userId)),
    )
    .returning();

  return {
    id: updated.id,
    userId: updated.userId,
    walletId: updated.walletId,
    walletName,
    categoryId: updated.categoryId,
    categoryName,
    type: updated.type as RecurringType,
    amount: Number(updated.amount),
    description: updated.description,
    frequency: updated.frequency as RecurringFrequency,
    intervalStep: updated.intervalStep,
    dayOfMonth: updated.dayOfMonth,
    dayOfWeek: updated.dayOfWeek,
    startDate: updated.startDate.toISOString(),
    endDate: updated.endDate ? updated.endDate.toISOString() : null,
    autoApply: updated.autoApply,
    nextRunAt: updated.nextRunAt.toISOString(),
    lastRunAt: updated.lastRunAt ? updated.lastRunAt.toISOString() : null,
    isActive: updated.isActive,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function deleteRecurringTemplate(
  userId: string,
  id: string,
): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(recurringTemplates)
    .where(
      and(eq(recurringTemplates.id, id), eq(recurringTemplates.userId, userId)),
    )
    .returning({ id: recurringTemplates.id });

  return deleted.length > 0;
}

/**
 * On-Access Processor:
 * Evaluates active templates where nextRunAt <= now.
 * Auto-applies matching templates atomically inside a transaction with row lock (FOR UPDATE),
 * and collects templates requiring user confirmation.
 */
export async function processDueRecurringTemplates(
  userId: string,
  options: { nowDate?: Date } = {},
): Promise<ProcessRecurringResultDto> {
  const db = getDb();
  const now = options.nowDate ?? new Date();

  return await db.transaction(async (tx) => {
    // 1. Lock and retrieve due active templates for this user
    const dueRows = await tx
      .select({
        template: recurringTemplates,
        walletName: wallets.name,
        categoryName: categories.name,
      })
      .from(recurringTemplates)
      .innerJoin(wallets, eq(recurringTemplates.walletId, wallets.id))
      .innerJoin(categories, eq(recurringTemplates.categoryId, categories.id))
      .where(
        and(
          eq(recurringTemplates.userId, userId),
          eq(recurringTemplates.isActive, true),
          lte(recurringTemplates.nextRunAt, now),
        ),
      )
      .for("update");

    let appliedCount = 0;
    const pendingConfirmations: PendingRecurringDto[] = [];

    for (const row of dueRows) {
      const t = row.template;

      if (t.autoApply) {
        // Record new transaction in ledger
        await tx.insert(transactions).values({
          userId,
          walletId: t.walletId,
          categoryId: t.categoryId,
          recurringTemplateId: t.id,
          noteId: null,
          type: t.type,
          amount: t.amount,
          description: t.description,
          occurredAt: t.nextRunAt,
        });

        // Advance nextRunAt
        const nextNextRunAt = calculateNextRunAt(
          t.nextRunAt,
          t.frequency as RecurringFrequency,
          t.intervalStep,
          t.dayOfMonth,
        );

        const shouldDeactivate = Boolean(t.endDate && nextNextRunAt > t.endDate);

        await tx
          .update(recurringTemplates)
          .set({
            nextRunAt: nextNextRunAt,
            lastRunAt: now,
            isActive: shouldDeactivate ? false : t.isActive,
            updatedAt: now,
          })
          .where(eq(recurringTemplates.id, t.id));

        appliedCount++;
      } else {
        // Collect into pending confirmations
        pendingConfirmations.push({
          templateId: t.id,
          walletId: t.walletId,
          walletName: row.walletName,
          categoryId: t.categoryId,
          categoryName: row.categoryName,
          type: t.type as RecurringType,
          amount: Number(t.amount),
          description: t.description,
          dueDate: t.nextRunAt.toISOString(),
          frequency: t.frequency as RecurringFrequency,
        });
      }
    }

    return {
      appliedCount,
      pendingConfirmations,
    };
  });
}

/**
 * Confirms or skips a pending recurring template occurrence.
 */
export async function confirmRecurringItem(
  userId: string,
  input: ConfirmRecurringItemInput,
  options: { nowDate?: Date } = {},
): Promise<{
  confirmed: true;
  status: "applied" | "skipped";
  transactionId?: string;
}> {
  const db = getDb();
  const now = options.nowDate ?? new Date();

  return await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(recurringTemplates)
      .where(
        and(
          eq(recurringTemplates.id, input.templateId),
          eq(recurringTemplates.userId, userId),
        ),
      )
      .for("update")
      .limit(1);

    const template = rows[0];
    if (!template) {
      throw new ApiError(
        404,
        "TEMPLATE_NOT_FOUND",
        "Jadwal berulang tidak ditemukan",
      );
    }

    let createdTxId: string | undefined;

    if (input.action === "apply") {
      const targetWalletId = input.customWalletId ?? template.walletId;
      const targetAmount = input.customAmount ?? template.amount;

      if (input.customWalletId && input.customWalletId !== template.walletId) {
        const walletRows = await tx
          .select()
          .from(wallets)
          .where(and(eq(wallets.id, targetWalletId), eq(wallets.userId, userId)))
          .limit(1);

        if (!walletRows[0] || walletRows[0].deletedAt !== null) {
          throw new ApiError(404, "WALLET_NOT_FOUND", "Dompet tidak ditemukan");
        }
        if (walletRows[0].archivedAt !== null) {
          throw new ApiError(
            422,
            "WALLET_ARCHIVED",
            "Tidak dapat mencatat transaksi ke dompet yang diarsipkan",
          );
        }
      }

      const [insertedTx] = await tx
        .insert(transactions)
        .values({
          userId,
          walletId: targetWalletId,
          categoryId: template.categoryId,
          recurringTemplateId: template.id,
          noteId: null,
          type: template.type,
          amount: targetAmount,
          description: template.description,
          occurredAt: template.nextRunAt,
        })
        .returning({ id: transactions.id });

      createdTxId = insertedTx.id;
    }

    // Both apply and skip advance nextRunAt
    const nextNextRunAt = calculateNextRunAt(
      template.nextRunAt,
      template.frequency as RecurringFrequency,
      template.intervalStep,
      template.dayOfMonth,
    );

    const shouldDeactivate = Boolean(
      template.endDate && nextNextRunAt > template.endDate,
    );

    await tx
      .update(recurringTemplates)
      .set({
        nextRunAt: nextNextRunAt,
        lastRunAt: now,
        isActive: shouldDeactivate ? false : template.isActive,
        updatedAt: now,
      })
      .where(eq(recurringTemplates.id, template.id));

    return {
      confirmed: true,
      status: input.action === "apply" ? "applied" : "skipped",
      transactionId: createdTxId,
    };
  });
}
