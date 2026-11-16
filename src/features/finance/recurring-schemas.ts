import { z } from "zod";

export const RECURRING_FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const RECURRING_TYPES = ["expense", "income"] as const;
export type RecurringType = (typeof RECURRING_TYPES)[number];

export const createRecurringTemplateSchema = z.object({
  walletId: z.string().uuid("Wallet ID must be a valid UUID"),
  categoryId: z.string().uuid("Category ID must be a valid UUID"),
  type: z.enum(RECURRING_TYPES),
  amount: z
    .union([
      z.number().int().positive("Amount must be a positive integer"),
      z
        .string()
        .regex(/^\d+$/, "Amount must be a positive integer string")
        .transform((v) => Number(v)),
    ])
    .refine((n) => Number.isSafeInteger(n) && n > 0, {
      message: "Amount must be a positive integer within safe integer limits",
    }),
  description: z
    .string()
    .trim()
    .min(1, "Description cannot be empty")
    .max(300, "Description cannot exceed 300 characters"),
  frequency: z.enum(RECURRING_FREQUENCIES),
  intervalStep: z
    .number()
    .int()
    .min(1, "Interval step must be at least 1")
    .default(1)
    .optional(),
  dayOfMonth: z
    .number()
    .int()
    .min(1, "Day of month must be between 1 and 31")
    .max(31, "Day of month must be between 1 and 31")
    .nullable()
    .optional(),
  dayOfWeek: z
    .number()
    .int()
    .min(0, "Day of week must be between 0 (Sunday) and 6 (Saturday)")
    .max(6, "Day of week must be between 0 (Sunday) and 6 (Saturday)")
    .nullable()
    .optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().nullable().optional(),
  autoApply: z.boolean().default(false).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export type CreateRecurringTemplateInput = z.infer<
  typeof createRecurringTemplateSchema
>;

export const updateRecurringTemplateSchema = z.object({
  walletId: z.string().uuid("Wallet ID must be a valid UUID").optional(),
  categoryId: z.string().uuid("Category ID must be a valid UUID").optional(),
  type: z.enum(RECURRING_TYPES).optional(),
  amount: z
    .union([
      z.number().int().positive("Amount must be a positive integer"),
      z
        .string()
        .regex(/^\d+$/, "Amount must be a positive integer string")
        .transform((v) => Number(v)),
    ])
    .refine((n) => Number.isSafeInteger(n) && n > 0, {
      message: "Amount must be a positive integer within safe integer limits",
    })
    .optional(),
  description: z
    .string()
    .trim()
    .min(1, "Description cannot be empty")
    .max(300, "Description cannot exceed 300 characters")
    .optional(),
  frequency: z.enum(RECURRING_FREQUENCIES).optional(),
  intervalStep: z
    .number()
    .int()
    .min(1, "Interval step must be at least 1")
    .optional(),
  dayOfMonth: z
    .number()
    .int()
    .min(1, "Day of month must be between 1 and 31")
    .max(31, "Day of month must be between 1 and 31")
    .nullable()
    .optional(),
  dayOfWeek: z
    .number()
    .int()
    .min(0, "Day of week must be between 0 (Sunday) and 6 (Saturday)")
    .max(6, "Day of week must be between 0 (Sunday) and 6 (Saturday)")
    .nullable()
    .optional(),
  endDate: z.string().datetime().nullable().optional(),
  autoApply: z.boolean().optional(),
  isActive: z.boolean().optional(),
  nextRunAt: z.string().datetime().optional(),
});

export type UpdateRecurringTemplateInput = z.infer<
  typeof updateRecurringTemplateSchema
>;

export const confirmRecurringItemSchema = z.object({
  templateId: z.string().uuid("Template ID must be a valid UUID"),
  action: z.enum(["apply", "skip"]),
  customAmount: z
    .union([
      z.number().int().positive("Amount must be a positive integer"),
      z
        .string()
        .regex(/^\d+$/, "Amount must be a positive integer string")
        .transform((v) => Number(v)),
    ])
    .refine((n) => Number.isSafeInteger(n) && n > 0, {
      message: "Amount must be a positive integer within safe integer limits",
    })
    .optional(),
  customWalletId: z.string().uuid().optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export type ConfirmRecurringItemInput = z.infer<
  typeof confirmRecurringItemSchema
>;

export interface RecurringTemplateDto {
  id: string;
  userId: string;
  walletId: string;
  walletName: string;
  categoryId: string;
  categoryName: string;
  type: RecurringType;
  amount: number;
  description: string;
  frequency: RecurringFrequency;
  intervalStep: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: string;
  endDate: string | null;
  autoApply: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PendingRecurringDto {
  templateId: string;
  walletId: string;
  walletName: string;
  categoryId: string;
  categoryName: string;
  type: RecurringType;
  amount: number;
  description: string;
  dueDate: string;
  frequency: RecurringFrequency;
}

export interface ProcessRecurringResultDto {
  appliedCount: number;
  pendingConfirmations: PendingRecurringDto[];
}
