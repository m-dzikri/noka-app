import { z } from "zod";
import type { CycleWindowInfo } from "@/features/finance/safe-to-spend";

export const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Shifts a YYYY-MM period string forward or backward by a number of months.
 */
export function shiftPeriodMonth(period: string, delta: number): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) return period;
  let year = Number(match[1]);
  let month = Number(match[2]) + delta;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

export const upsertBudgetBodySchema = z.object({
  categoryId: z.string().uuid("Category ID must be a valid UUID"),
  amount: z
    .union([
      z.number().int().positive("Amount must be a positive integer"),
      z.string().regex(/^\d+$/, "Amount must be a positive integer string").transform((v) => Number(v)),
    ])
    .refine((n) => Number.isSafeInteger(n) && n > 0, {
      message: "Amount must be a positive integer within safe integer limits",
    }),
  period: z.string().regex(PERIOD_REGEX, "Period must be in YYYY-MM format"),
  idempotencyKey: z.string().uuid().optional(),
});

export type UpsertBudgetBodyInput = z.infer<typeof upsertBudgetBodySchema>;

export const budgetListQuerySchema = z.object({
  period: z.string().regex(PERIOD_REGEX).optional(),
  tzOffset: z.coerce.number().finite().optional(),
});

export type BudgetListQueryInput = z.infer<typeof budgetListQuerySchema>;

export type BudgetThresholdStatus = "normal" | "warning" | "exceeded";

export interface CategoryBudgetDto {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  periodMonth: string;
  spentAmount: number;
  remainingAmount: number;
  percentage: number;
  status: BudgetThresholdStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryBudgetSummaryDto {
  period: string;
  cycle: CycleWindowInfo;
  totalBudgeted: number;
  totalSpent: number;
  items: CategoryBudgetDto[];
}

export function calculateBudgetMetrics(
  spentAmount: number,
  amount: number,
): {
  percentage: number;
  remainingAmount: number;
  status: BudgetThresholdStatus;
} {
  if (amount <= 0) {
    return {
      percentage: 0,
      remainingAmount: 0,
      status: "normal",
    };
  }

  const percentage = Math.floor((spentAmount * 100) / amount);
  const remainingAmount = amount - spentAmount;
  let status: BudgetThresholdStatus = "normal";

  if (percentage >= 100) {
    status = "exceeded";
  } else if (percentage >= 80) {
    status = "warning";
  }

  return {
    percentage,
    remainingAmount,
    status,
  };
}
