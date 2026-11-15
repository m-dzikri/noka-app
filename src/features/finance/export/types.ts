import { z } from "zod";

export const EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const exportQuerySchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  walletId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  tzOffset: z.coerce.number().optional(),
});

export type ExportQueryParams = z.infer<typeof exportQuerySchema>;

export const reportWebQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  walletId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  tzOffset: z.coerce.number().finite().optional(),
});

export type ReportWebQueryParams = z.infer<typeof reportWebQuerySchema>;

export interface ExportLedgerRow {
  id: string;
  occurredAt: Date;
  occurredAtFormatted: string;
  type: "income" | "expense" | "transfer";
  typeLabel: string;
  walletName: string;
  categoryName: string;
  amount: number;
  notes: string;
}

export interface ExportWalletSummary {
  id: string;
  name: string;
  currentBalance: number;
}

export interface ExportCategorySummary {
  id: string;
  name: string;
  type: "income" | "expense";
  total: number;
}

export interface ExportDataset {
  userId: string;
  generatedAt: Date;
  generatedAtFormatted: string;
  startDate: Date;
  endDate: Date;
  startDateFormatted: string;
  endDateFormatted: string;
  totalIncome: number;
  totalExpense: number;
  netCashflow: number;
  wallets: ExportWalletSummary[];
  categories: ExportCategorySummary[];
  rows: ExportLedgerRow[];
}

export interface ExportDatasetDto
  extends Omit<ExportDataset, "generatedAt" | "startDate" | "endDate" | "rows"> {
  generatedAt: string;
  startDate: string;
  endDate: string;
  rows: Array<Omit<ExportLedgerRow, "occurredAt"> & { occurredAt: string }>;
}

export function serializeExportDataset(dataset: ExportDataset): ExportDatasetDto {
  return {
    ...dataset,
    generatedAt: dataset.generatedAt.toISOString(),
    generatedAtFormatted: dataset.generatedAtFormatted,
    startDate: dataset.startDate.toISOString(),
    endDate: dataset.endDate.toISOString(),
    rows: dataset.rows.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
    })),
  };
}
