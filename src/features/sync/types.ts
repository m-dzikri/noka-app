import type { AuthUser } from "@/features/auth/session";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { TransactionDto } from "@/features/finance/transactions-service";
import type { TransferDto } from "@/features/finance/transfers-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import type { FolderDto, NoteDto, TagDto } from "@/features/notes/service";

export interface SnapshotNoteAttachmentDto {
  id: string;
  noteId: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

export interface SnapshotDto {
  user: AuthUser;
  notes: NoteDto[];
  folders: FolderDto[];
  tags: TagDto[];
  noteAttachments: SnapshotNoteAttachmentDto[];
  wallets: WalletWithBalanceDto[];
  categories: CategoryDto[];
  transactions: TransactionDto[];
  transfers: TransferDto[];
  serverTime: string;
}

export type SyncEngineStatus = "synced" | "offline" | "syncing" | "sync_error";

export type OutboxEntity =
  | "note"
  | "folder"
  | "transaction"
  | "transfer"
  | "noteLink";

export type OutboxOp = "upsert" | "delete" | "link" | "unlink";

export type OutboxMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export type OutboxStatus = "pending" | "failed";

export type OutboxOptimisticPayload =
  | {
      kind: "note_upsert";
      note: NoteDto;
    }
  | {
      kind: "note_delete";
      id: string;
      deletedAt: string;
    }
  | {
      kind: "folder_upsert";
      folder: FolderDto;
    }
  | {
      kind: "folder_delete";
      id: string;
      deletedAt: string;
    }
  | {
      kind: "transaction_upsert";
      transaction: TransactionDto;
    }
  | {
      kind: "transaction_delete";
      id: string;
      deletedAt: string;
    }
  | {
      kind: "transfer_upsert";
      transfer: TransferDto;
    }
  | {
      kind: "transfer_delete";
      id: string;
      deletedAt: string;
    }
  | {
      kind: "note_link";
      noteId: string;
      transactionId: string;
      transaction?: TransactionDto;
    }
  | {
      kind: "note_unlink";
      noteId: string;
      transactionId: string;
    };

export interface OutboxItemRecord {
  mutationId: string;
  createdAt: number;
  idempotencyKey: string;
  entity: OutboxEntity;
  entityId: string;
  op: OutboxOp;
  method: OutboxMethod;
  path: string;
  body: Record<string, unknown> | null;
  optimisticSnapshot: OutboxOptimisticPayload;
  updatedAt: string;
  status: OutboxStatus;
  retryCount: number;
  nextRetryAt: number | null;
  lastError: string | null;
}

export type SyncMetaRecord =
  | {
      key: "userProfile";
      value: AuthUser;
    }
  | {
      key: "lastSyncedAt";
      value: string;
    };

export interface OfflineCapabilities {
  indexedDbAvailable: boolean;
  serviceWorkerAvailable: boolean;
  storageBlockedReason?: string;
}

