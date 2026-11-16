import { z } from "zod";
import {
  parseOccurredAtValue,
  positiveIdrAmountSchema,
  uuidSchema,
} from "@/features/finance/schemas";

export const DEBT_TYPES = ["debt", "receivable"] as const;
export const DEBT_STATUSES = ["active", "settled"] as const;

export type DebtType = (typeof DEBT_TYPES)[number];
export type DebtStatus = (typeof DEBT_STATUSES)[number];

export const optionalDateOrNullSchema = z
  .union([
    z.string().trim().refine((val) => parseOccurredAtValue(val) !== null, {
      message: "Must be a valid ISO-8601 date or datetime",
    }),
    z.null(),
  ])
  .optional();

export const createDebtSchema = z.object({
  id: uuidSchema.optional(),
  type: z.enum(DEBT_TYPES),
  personName: z.string().trim().min(1, "Nama pihak wajib diisi").max(100),
  totalAmount: positiveIdrAmountSchema,
  dueDate: optionalDateOrNullSchema,
  notes: z.string().trim().max(500).nullable().optional(),
});

export const updateDebtSchema = z.object({
  personName: z.string().trim().min(1, "Nama pihak wajib diisi").max(100).optional(),
  dueDate: optionalDateOrNullSchema,
  notes: z.string().trim().max(500).nullable().optional(),
});

export const createSettlementSchema = z.object({
  id: uuidSchema.optional(),
  amount: positiveIdrAmountSchema,
  walletId: uuidSchema.nullable().optional(),
  categoryId: uuidSchema.nullable().optional(),
  notes: z.string().trim().max(255).nullable().optional(),
  settledAt: optionalDateOrNullSchema,
});

export const debtFilterSchema = z.object({
  type: z.enum(DEBT_TYPES).optional(),
  status: z.enum(DEBT_STATUSES).optional(),
  search: z.string().trim().optional(),
});

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
export type DebtFilterInput = z.infer<typeof debtFilterSchema>;

export interface DebtSettlementDto {
  id: string;
  debtId: string;
  walletId: string | null;
  transactionId: string | null;
  amount: number;
  notes: string | null;
  settledAt: string;
  createdAt: string;
  walletName?: string | null;
}

export interface DebtReceivableDto {
  id: string;
  userId: string;
  type: DebtType;
  personName: string;
  totalAmount: number;
  settledAmount: number;
  remainingAmount: number;
  settlementPercentage: number;
  dueDate: string | null;
  notes: string | null;
  status: DebtStatus;
  isOverdue: boolean;
  isDueSoon: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DebtReceivableDetailDto extends DebtReceivableDto {
  settlements: DebtSettlementDto[];
}

export interface DebtsSummaryDto {
  totalDebt: number; // remaining active debt
  totalReceivable: number; // remaining active receivable
  netPosition: number; // totalReceivable - totalDebt
  activeDebtsCount: number;
  activeReceivablesCount: number;
  overdueCount: number;
}
