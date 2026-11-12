export type QuickCaptureIntent = "note" | "transaction";

export interface QuickCaptureWalletSummary {
  id: string;
  name: string;
  isDefault: boolean;
  archivedAt: string | Date | null;
}

export interface QuickCaptureCategorySummary {
  id: string;
  name: string;
  type: "income" | "expense";
  systemKey: string | null;
}

export interface QuickCaptureContext {
  wallets: QuickCaptureWalletSummary[];
  categories: QuickCaptureCategorySummary[];
  defaultWalletId: string | null;
}

export interface QuickCaptureNoteResult {
  intent: "note";
  title: string;
  content: string;
}

export interface QuickCaptureTransactionResult {
  intent: "transaction";
  type: "income" | "expense";
  amount: number;
  walletId: string | null;
  categoryId: string | null;
  description: string;
}

export type QuickCaptureParseResult =
  | QuickCaptureNoteResult
  | QuickCaptureTransactionResult;
