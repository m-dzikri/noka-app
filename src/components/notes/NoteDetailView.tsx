"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowLeft, FileWarning } from "lucide-react";
import { FolderManagerModal } from "@/components/notes/FolderManagerModal";
import { NoteAttachmentsPanel } from "@/components/notes/NoteAttachmentsPanel";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { NoteLinkedTransactionsPanel } from "@/components/notes/NoteLinkedTransactionsPanel";
import { useOptionalSync } from "@/components/providers/SyncProvider";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { WalletWithBalanceDto } from "@/features/finance/wallets-service";
import type { NoteAttachmentDto } from "@/features/notes/attachments-service";
import type { LinkedTransactionsListResult } from "@/features/notes/linked-transactions-service";
import type { FolderDto, NoteDto } from "@/features/notes/service";
import { computeLocalLinkedTransactions } from "@/features/sync/local-queries";
import { useI18n } from "@/lib/i18n/context";

export interface NoteDetailViewProps {
  routeNoteId?: string;
  initialNote: NoteDto | null;
  initialFolders: FolderDto[];
  enableAttachments?: boolean;
  initialAttachments?: NoteAttachmentDto[];
  enableLinkedTransactions?: boolean;
  initialWallets?: WalletWithBalanceDto[];
  initialCategories?: CategoryDto[];
  initialLinkedTransactions?: LinkedTransactionsListResult;
  renderAttachmentsSlot?: (note: NoteDto) => ReactNode;
  renderLinkedTransactionsSlot?: (note: NoteDto) => ReactNode;
}

/**
 * Client detail wrapper for `/app/notes/[id]` supporting mobile editing, folder management, and not-found state.
 */
export function NoteDetailView({
  routeNoteId,
  initialNote,
  initialFolders,
  enableAttachments = false,
  initialAttachments,
  enableLinkedTransactions = false,
  initialWallets,
  initialCategories,
  initialLinkedTransactions,
  renderAttachmentsSlot,
  renderLinkedTransactionsSlot,
}: NoteDetailViewProps) {
  const router = useRouter();
  const { t } = useI18n();
  const sync = useOptionalSync();
  const [noteState, setNoteState] = useState<NoteDto | null>(initialNote);
  const [foldersState, setFoldersState] = useState<FolderDto[]>(initialFolders);
  const [folderModalOpen, setFolderModalOpen] = useState(false);

  const note =
    noteState ??
    (routeNoteId && sync?.mirror
      ? (sync.mirror.notes.find((item) => item.id === routeNoteId) ?? null)
      : null);

  const folders =
    foldersState.length > 0
      ? foldersState
      : (sync?.mirror?.folders ?? foldersState);

  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-12 text-center shadow-[var(--shadow-sm)]">
        <FileWarning
          className="h-9 w-9 text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {t.notes.noteNotFoundTitle}
        </h1>
        <p className="max-w-md text-sm text-[var(--text-secondary)]">
          {t.notes.noteNotFoundDescription}
        </p>
        <Link
          href="/app/notes"
          className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-hover)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>{t.notes.backToNotes}</span>
        </Link>
      </div>
    );
  }

  const effectiveInitialAttachments =
    initialAttachments !== undefined
      ? initialAttachments
      : sync?.mirror
        ? sync.mirror.noteAttachments
            .filter((att) => att.noteId === note.id)
            .map((att) => ({
              id: att.id,
              noteId: att.noteId,
              mimeType: att.mimeType,
              sizeBytes: att.sizeBytes,
              createdAt: att.createdAt,
              url: att.url || `/api/attachments/${att.id}`,
            }))
        : undefined;

  const effectiveRenderAttachmentsSlot =
    renderAttachmentsSlot ??
    (enableAttachments
      ? (currentNote: NoteDto) => (
          <NoteAttachmentsPanel
            key={currentNote.id}
            noteId={currentNote.id}
            initialAttachments={effectiveInitialAttachments}
            initialAttachmentsNoteId={
              initialAttachments !== undefined
                ? (initialNote?.id ?? currentNote.id)
                : currentNote.id
            }
            onNoteUpdatedAt={(targetNoteId, updatedAt) => {
              const nextTime = Date.parse(updatedAt);
              if (Number.isNaN(nextTime)) {
                return;
              }
              setNoteState((prev) =>
                prev &&
                prev.id === targetNoteId &&
                nextTime > Date.parse(prev.updatedAt)
                  ? { ...prev, updatedAt }
                  : prev,
              );
            }}
          />
        )
      : undefined);

  const effectiveInitialLinked =
    initialLinkedTransactions ??
    (sync?.mirror
      ? computeLocalLinkedTransactions(sync.mirror, note.id)
      : undefined);

  const effectiveWallets =
    initialWallets && initialWallets.length > 0
      ? initialWallets
      : sync?.mirror?.wallets;
  const effectiveCategories =
    initialCategories && initialCategories.length > 0
      ? initialCategories
      : sync?.mirror?.categories;

  const effectiveRenderLinkedTransactionsSlot =
    renderLinkedTransactionsSlot ??
    (enableLinkedTransactions
      ? (currentNote: NoteDto) => (
          <NoteLinkedTransactionsPanel
            key={currentNote.id}
            noteId={currentNote.id}
            wallets={effectiveWallets}
            categories={effectiveCategories}
            initialData={effectiveInitialLinked}
            initialNoteId={
              initialLinkedTransactions !== undefined
                ? (initialNote?.id ?? currentNote.id)
                : currentNote.id
            }
          />
        )
      : undefined);

  return (
    <div className="flex flex-col gap-4">
      {!initialNote && sync?.mirror ? (
        <div
          role="status"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3.5 py-2 text-xs text-[var(--text-secondary)]"
        >
          {t.sync.offlineNoteFallbackHint}
        </div>
      ) : null}

      <NoteEditor
        note={note}
        folders={folders}
        onSaved={(updated) => setNoteState(updated)}
        onDeleted={() => {
          router.push("/app/notes");
          router.refresh();
        }}
        onBack={() => {
          router.push("/app/notes");
          router.refresh();
        }}
        onOpenFolderManager={() => setFolderModalOpen(true)}
        renderAttachmentsSlot={effectiveRenderAttachmentsSlot}
        renderLinkedTransactionsSlot={effectiveRenderLinkedTransactionsSlot}
      />

      <FolderManagerModal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        folders={folders}
        onFoldersChanged={(nextFolders, deletedFolderId) => {
          setFoldersState(nextFolders);
          if (deletedFolderId && note.folderId === deletedFolderId) {
            setNoteState((prev) => {
              const target = prev ?? note;
              return { ...target, folderId: null, folderName: null };
            });
          } else if (note.folderId) {
            const matched = nextFolders.find((f) => f.id === note.folderId);
            if (matched) {
              setNoteState((prev) => {
                const target = prev ?? note;
                return { ...target, folderName: matched.name };
              });
            }
          }
        }}
      />
    </div>
  );
}

