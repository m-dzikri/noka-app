import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db";
import { users } from "@/db/schema/auth";
import { categories, categoryBudgets, transactions } from "@/db/schema/finance";
import {
  calculateBudgetMetrics,
  type CategoryBudgetDto,
  type CategoryBudgetSummaryDto,
  type UpsertBudgetBodyInput,
} from "@/features/finance/budgets-schemas";
import {
  resolveActiveCycleWindow,
  resolveCycleWindowForPeriod,
} from "@/features/finance/safe-to-spend";
import { DEFAULT_TZ_OFFSET_MINUTES } from "@/features/finance/schemas";
import { ApiError } from "@/lib/api-response";

export interface ListBudgetsOptions {
  period?: string;
  tzOffset?: number;
  cycleStartDay?: string | number | null;
  nowDate?: Date;
}

/**
 * Loads category budgets and aggregates real-time expense spending within the cycle window (`RFC-012`, `F20`, `DATA-1`).
 */
export async function listCategoryBudgets(
  userId: string,
  options: ListBudgetsOptions = {},
  txOrDb: DbOrTx = getDb(),
): Promise<CategoryBudgetSummaryDto> {
  const nowDate = options.nowDate ?? new Date();
  const tzOffset = options.tzOffset ?? DEFAULT_TZ_OFFSET_MINUTES;

  let cycleStartDay = options.cycleStartDay;
  if (cycleStartDay === undefined) {
    const [userRow] = await txOrDb
      .select({ cycleStartDay: users.cycleStartDay })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    cycleStartDay = userRow?.cycleStartDay ?? "1";
  }

  const activeCycle = resolveActiveCycleWindow(nowDate, cycleStartDay, tzOffset);
  const activePeriod = activeCycle.startDate.slice(0, 7);

  const targetPeriod =
    options.period && /^\d{4}-(0[1-9]|1[0-2])$/.test(options.period)
      ? options.period
      : activePeriod;

  const cycle = resolveCycleWindowForPeriod(
    targetPeriod,
    cycleStartDay,
    tzOffset,
    nowDate,
  );

  const startUtc = new Date(cycle.startUtcIso);
  const endExclusiveUtc = new Date(cycle.endExclusiveUtcIso);

  // 1 & 2. Fetch budgets and expense spending aggregations in parallel
  const [budgetRows, spendingRows] = await Promise.all([
    txOrDb
      .select({
        id: categoryBudgets.id,
        categoryId: categoryBudgets.categoryId,
        categoryName: categories.name,
        amount: categoryBudgets.amount,
        periodMonth: categoryBudgets.periodMonth,
        createdAt: categoryBudgets.createdAt,
        updatedAt: categoryBudgets.updatedAt,
      })
      .from(categoryBudgets)
      .innerJoin(
        categories,
        and(
          eq(categories.id, categoryBudgets.categoryId),
          eq(categories.userId, userId),
          isNull(categories.deletedAt),
        ),
      )
      .where(
        and(
          eq(categoryBudgets.userId, userId),
          eq(categoryBudgets.periodMonth, targetPeriod),
        ),
      ),
    txOrDb
      .select({
        categoryId: transactions.categoryId,
        spentTotal: sql<number>`COALESCE(SUM(${transactions.amount}), 0)::bigint`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "expense"),
          isNull(transactions.deletedAt),
          gte(transactions.occurredAt, startUtc),
          lt(transactions.occurredAt, endExclusiveUtc),
        ),
      )
      .groupBy(transactions.categoryId),
  ]);

  const spendingMap = new Map<string, number>();
  for (const row of spendingRows) {
    spendingMap.set(row.categoryId, Number(row.spentTotal));
  }

  let totalBudgeted = 0;
  let totalSpent = 0;

  const items: CategoryBudgetDto[] = budgetRows.map((row) => {
    const spentAmount = spendingMap.get(row.categoryId) ?? 0;
    const metrics = calculateBudgetMetrics(spentAmount, row.amount);
    totalBudgeted += row.amount;
    totalSpent += spentAmount;

    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      amount: row.amount,
      periodMonth: row.periodMonth,
      spentAmount,
      remainingAmount: metrics.remainingAmount,
      percentage: metrics.percentage,
      status: metrics.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  // Sort by status urgency (exceeded > warning > normal), then percentage desc, then category name asc
  const statusRank: Record<string, number> = {
    exceeded: 3,
    warning: 2,
    normal: 1,
  };

  items.sort((a, b) => {
    const rankDiff = (statusRank[b.status] ?? 0) - (statusRank[a.status] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    if (b.percentage !== a.percentage) return b.percentage - a.percentage;
    return a.categoryName.localeCompare(b.categoryName);
  });

  return {
    period: targetPeriod,
    cycle,
    totalBudgeted,
    totalSpent,
    items,
  };
}

/**
 * Creates or updates a category budget idempotently for a given period (`RFC-012`, `F20`, `API-1`, `DATA-1`).
 */
export async function upsertCategoryBudget(
  userId: string,
  input: UpsertBudgetBodyInput,
  txOrDb: DbOrTx = getDb(),
): Promise<CategoryBudgetDto> {
  const runInTx = async (tx: DbOrTx): Promise<CategoryBudgetDto> => {
    // 1. Verify category exists, is owned by user, is not deleted, and is an expense category
    const [cat] = await tx
      .select({
        id: categories.id,
        name: categories.name,
        type: categories.type,
      })
      .from(categories)
      .where(
        and(
          eq(categories.id, input.categoryId),
          eq(categories.userId, userId),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    if (!cat) {
      throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }

    if (cat.type !== "expense") {
      throw new ApiError(
        422,
        "INVALID_CATEGORY_TYPE",
        "Budgets can only be created for expense categories",
      );
    }

    // 2. Upsert category_budgets
    const now = new Date();
    const [row] = await tx
      .insert(categoryBudgets)
      .values({
        userId,
        categoryId: input.categoryId,
        amount: input.amount,
        periodMonth: input.period,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          categoryBudgets.userId,
          categoryBudgets.categoryId,
          categoryBudgets.periodMonth,
        ],
        set: {
          amount: input.amount,
          updatedAt: now,
        },
      })
      .returning();

    if (!row) {
      throw new ApiError(500, "INTERNAL_ERROR", "Failed to upsert category budget");
    }

    // 3. Resolve cycle spending for response metrics
    const [userRow] = await tx
      .select({ cycleStartDay: users.cycleStartDay })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const cycle = resolveCycleWindowForPeriod(
      input.period,
      userRow?.cycleStartDay ?? "1",
    );

    const startUtc = new Date(cycle.startUtcIso);
    const endExclusiveUtc = new Date(cycle.endExclusiveUtcIso);

    const [spending] = await tx
      .select({
        spentTotal: sql<number>`COALESCE(SUM(${transactions.amount}), 0)::bigint`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.categoryId, input.categoryId),
          eq(transactions.type, "expense"),
          isNull(transactions.deletedAt),
          gte(transactions.occurredAt, startUtc),
          lt(transactions.occurredAt, endExclusiveUtc),
        ),
      );

    const spentAmount = Number(spending?.spentTotal ?? 0);
    const metrics = calculateBudgetMetrics(spentAmount, row.amount);

    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryName: cat.name,
      amount: row.amount,
      periodMonth: row.periodMonth,
      spentAmount,
      remainingAmount: metrics.remainingAmount,
      percentage: metrics.percentage,
      status: metrics.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  };

  return txOrDb ? runInTx(txOrDb) : getDb().transaction(runInTx);
}

/**
 * Deletes a category budget by ID (`RFC-012`, `F20`, `API-1`).
 */
export async function deleteCategoryBudget(
  userId: string,
  budgetId: string,
  txOrDb: DbOrTx = getDb(),
): Promise<{ deleted: true; id: string }> {
  const deletedRows = await txOrDb
    .delete(categoryBudgets)
    .where(
      and(
        eq(categoryBudgets.id, budgetId),
        eq(categoryBudgets.userId, userId),
      ),
    )
    .returning({ id: categoryBudgets.id });

  if (deletedRows.length === 0) {
    throw new ApiError(404, "BUDGET_NOT_FOUND", "Category budget not found");
  }

  return {
    deleted: true,
    id: budgetId,
  };
}
