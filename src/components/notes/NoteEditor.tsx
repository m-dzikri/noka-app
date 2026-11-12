"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Bold,
  CheckSquare,
  Code,
  FolderOpen,
  Heading2,
  Italic,
  Link2,
  List,
  Pin,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { MarkdownPreview } from "@/components/notes/MarkdownPreview";
import { useOptionalSync } from "@/components/providers/SyncProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { parseChecklists, toggleChecklistInMarkdown } from "@/features/notes/checklist";
import {
  areDraftSnapshotsEqual,
  NoteMutationCoordinator,
  type NoteDraftSnapshot,
  type PendingSaveStatus,
} from "@/features/notes/mutation-queue";
import { NOTE_MAX_TAGS, normalizeTagNames } from "@/features/notes/schemas";
import type {
  FolderDto,
  NoteDeleteResult,
  NoteDto,
  NoteMutationResult,
} from "@/features/notes/service";
import { buildOptimisticNoteDto } from "@/features/sync/client-api";
import { applyOptimisticToMirror, enqueueOutboxMutation } from "@/features/sync/db";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

export type EditorViewMode = "edit" | "preview" | "split";
export type NoteSaveStatus = "saved" | PendingSaveStatus;

export interface NoteEditorProps {
  note: NoteDto;
  folders: FolderDto[];
  onSaved: (updatedNote: NoteDto) => void;
  onDeleted: (noteId: string) => void;
  onOpenFolderManager?: () => void;
  onBack?: () => void;
  renderAttachmentsSlot?: (note: NoteDto) => ReactNode;
  renderLinkedTransactionsSlot?: (note: NoteDto) => ReactNode;
}

const AUTO_SAVE_DEBOUNCE_MS = 600;
const KEEPALIVE_MAX_BYTES = 60_000;

interface PersistSnapshotOptions {
  keepalive?: boolean;
}

function toDraftSnapshot(note: NoteDto): NoteDraftSnapshot {
  return {
    title: note.title,
    content: note.content,
    folderId: note.folderId,
    isPinned: note.isPinned,
    tags: note.tags.map((item) => item.name),
  };
}

function resolveValidFolderId(
  candidateFolderId: string | null,
  fallbackFolderId: string | null,
  folders: FolderDto[],
): string | null {
  if (candidateFolderId === null) {
    return null;
  }
  if (folders.some((item) => item.id === candidateFolderId)) {
    return candidateFolderId;
  }
  if (
    fallbackFolderId !== null &&
    folders.some((item) => item.id === fallbackFolderId)
  ) {
    return fallbackFolderId;
  }
  return null;
}

/**
 * Bilingual Markdown note editor with GFM checklist toggles, 600ms debounced auto-save, pin, folder, and tags.
 */
export function NoteEditor({
  note,
  folders,
  onSaved,
  onDeleted,
  onOpenFolderManager,
  onBack,
  renderAttachmentsSlot,
  renderLinkedTransactionsSlot,
}: NoteEditorProps) {
  const { t } = useI18n();
  const sync = useOptionalSync();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [folderId, setFolderId] = useState<string | null>(note.folderId);
  const [isPinned, setIsPinned] = useState(note.isPinned);
  const [tagNames, setTagNames] = useState<string[]>(() =>
    note.tags.map((item) => item.name),
  );
  const [tagInput, setTagInput] = useState("");
  const [tagLimitError, setTagLimitError] = useState(false);
  const [viewMode, setViewMode] = useState<EditorViewMode>("split");
  const [saveStatus, setSaveStatus] = useState<NoteSaveStatus>("saved");
  const [conflictNotice, setConflictNotice] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [returningBack, setReturningBack] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeNoteIdRef = useRef(note.id);
  const serverUpdatedAtRef = useRef(note.updatedAt);
  const dirtyRef = useRef(false);
  const draftRef = useRef<NoteDraftSnapshot>(toDraftSnapshot(note));
  const onSavedRef = useRef(onSaved);
  const foldersRef = useRef(folders);
  const noteRef = useRef(note);
  const syncRef = useRef(sync);
  const outboxOwnedNotesRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const returningBackRef = useRef(false);
  const flushOnUnloadRef = useRef<() => void>(() => {});
  const coordinatorRef = useRef<NoteMutationCoordinator | null>(null);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  const noteHasPendingOutbox = Boolean(
    sync?.mirror?.outbox.some(
      (item) =>
        item.status === "pending" &&
        item.entity === "note" &&
        item.entityId === note.id,
    ),
  );

  useEffect(() => {
    if (
      sync?.storageAvailable &&
      sync.isOnline &&
      outboxOwnedNotesRef.current.has(note.id) &&
      !noteHasPendingOutbox &&
      !dirtyRef.current &&
      saveStatus === "pending_sync"
    ) {
      outboxOwnedNotesRef.current.delete(note.id);
      queueMicrotask(() => {
        if (mountedRef.current && activeNoteIdRef.current === note.id) {
          setSaveStatus("saved");
        }
      });
    }
  }, [
    note.id,
    noteHasPendingOutbox,
    saveStatus,
    sync?.isOnline,
    sync?.storageAvailable,
  ]);

  const getCoordinator = useCallback(() => {
    if (!coordinatorRef.current) {
      coordinatorRef.current = new NoteMutationCoordinator();
    }
    return coordinatorRef.current;
  }, []);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const applyServerNote = useCallback(
    (serverNote: NoteDto, showConflict: boolean) => {
      serverUpdatedAtRef.current = serverNote.updatedAt;
      dirtyRef.current = false;
      draftRef.current = toDraftSnapshot(serverNote);
      setTitle(serverNote.title);
      setContent(serverNote.content);
      setFolderId(serverNote.folderId);
      setIsPinned(serverNote.isPinned);
      setTagNames(serverNote.tags.map((item) => item.name));
      setSaveStatus("saved");
      if (showConflict) {
        setConflictNotice(true);
      }
    },
    [],
  );

  const clearPendingTimer = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const reconcileMutationResponse = useCallback(
    (
      targetNoteId: string,
      seq: number,
      expectedSnapshot: NoteDraftSnapshot,
      response: Response,
      payload: { ok?: boolean; data?: NoteMutationResult } | null,
      syncContentOnApplied: boolean,
    ): NoteDto | null => {
      const coordinator = getCoordinator();

      if (!response.ok || payload?.ok !== true || !payload.data?.note) {
        const failStatus: PendingSaveStatus =
          response.status >= 500 ? "pending_sync" : "error";
        coordinator.updatePendingDraftStatus(targetNoteId, seq, failStatus);
        if (
          mountedRef.current &&
          activeNoteIdRef.current === targetNoteId &&
          coordinator.isLatestSeq(targetNoteId, seq)
        ) {
          setSaveStatus(failStatus);
        }
        return null;
      }

      const savedNote = payload.data.note;
      if (syncRef.current?.storageAvailable) {
        void applyOptimisticToMirror(syncRef.current.userId, {
          kind: "note_upsert",
          note: savedNote,
        })
          .then(() => {
            syncRef.current?.reloadMirror();
          })
          .catch(() => undefined);
      }

      if (payload.data.conflictResolved === "server_newer") {
        onSavedRef.current(savedNote);
        if (coordinator.isLatestSeq(targetNoteId, seq)) {
          coordinator.seedKnownUpdatedAt(targetNoteId, savedNote.updatedAt, true);
          coordinator.clearPendingDraftIfLatest(targetNoteId, seq);
          if (mountedRef.current && activeNoteIdRef.current === targetNoteId) {
            applyServerNote(savedNote, true);
          }
        }
        return savedNote;
      }

      coordinator.seedKnownUpdatedAt(targetNoteId, savedNote.updatedAt);
      onSavedRef.current(savedNote);

      if (coordinator.isLatestSeq(targetNoteId, seq)) {
        if (activeNoteIdRef.current === targetNoteId) {
          if (areDraftSnapshotsEqual(draftRef.current, expectedSnapshot)) {
            coordinator.clearPendingDraftIfLatest(targetNoteId, seq);
            if (mountedRef.current) {
              serverUpdatedAtRef.current = savedNote.updatedAt;
              dirtyRef.current = false;
              if (syncContentOnApplied) {
                draftRef.current = toDraftSnapshot(savedNote);
                setContent(savedNote.content);
              }
              setSaveStatus("saved");
            }
          }
        } else {
          coordinator.clearPendingDraftIfLatest(targetNoteId, seq);
        }
      }

      return savedNote;
    },
    [applyServerNote, getCoordinator],
  );

  const queueNotePatchToOutbox = useCallback(
    async (
      targetNoteId: string,
      effectiveSnapshot: NoteDraftSnapshot,
      seq: number,
      baseUpdatedAt: string,
    ): Promise<NoteDto | null> => {
      const coordinator = getCoordinator();
      const currentSync = syncRef.current;
      if (!currentSync || !currentSync.storageAvailable) {
        coordinator.updatePendingDraftStatus(targetNoteId, seq, "pending_sync");
        if (
          mountedRef.current &&
          activeNoteIdRef.current === targetNoteId &&
          coordinator.isLatestSeq(targetNoteId, seq)
        ) {
          setSaveStatus("pending_sync");
        }
        return null;
      }

      const prevMs = Date.parse(baseUpdatedAt);
      const nextTs = new Date(
        Math.max(Date.now(), Number.isNaN(prevMs) ? 0 : prevMs + 1),
      ).toISOString();
      const baseNote =
        noteRef.current.id === targetNoteId ? noteRef.current : undefined;
      const optimisticNote = buildOptimisticNoteDto({
        id: targetNoteId,
        title: effectiveSnapshot.title,
        content: effectiveSnapshot.content,
        folderId: effectiveSnapshot.folderId,
        folderName:
          foldersRef.current.find((f) => f.id === effectiveSnapshot.folderId)
            ?.name ?? null,
        isPinned: effectiveSnapshot.isPinned,
        tagNames: effectiveSnapshot.tags,
        existingTags: baseNote?.tags,
        createdAt: baseNote?.createdAt ?? nextTs,
        updatedAt: nextTs,
      });

      const idempotencyKey = crypto.randomUUID();
      await enqueueOutboxMutation(currentSync.userId, {
        mutationId: crypto.randomUUID(),
        createdAt: Date.now(),
        idempotencyKey,
        entity: "note",
        entityId: targetNoteId,
        op: "upsert",
        method: "PATCH",
        path: `/api/notes/${targetNoteId}`,
        body: {
          title: effectiveSnapshot.title,
          content: effectiveSnapshot.content,
          folderId: effectiveSnapshot.folderId,
          isPinned: effectiveSnapshot.isPinned,
          tags: effectiveSnapshot.tags,
          updatedAt: nextTs,
          idempotencyKey,
        },
        optimisticSnapshot: {
          kind: "note_upsert",
          note: optimisticNote,
        },
        updatedAt: nextTs,
        status: "pending",
        retryCount: 0,
        nextRetryAt: null,
        lastError: null,
      });

      outboxOwnedNotesRef.current.add(targetNoteId);
      coordinator.seedKnownUpdatedAt(targetNoteId, nextTs);
      currentSync.reloadMirror();
      onSavedRef.current(optimisticNote);

      if (coordinator.isLatestSeq(targetNoteId, seq)) {
        if (activeNoteIdRef.current === targetNoteId) {
          if (areDraftSnapshotsEqual(draftRef.current, effectiveSnapshot)) {
            coordinator.clearPendingDraftIfLatest(targetNoteId, seq);
            if (mountedRef.current) {
              serverUpdatedAtRef.current = nextTs;
              dirtyRef.current = false;
              setSaveStatus("pending_sync");
            }
          }
        } else {
          coordinator.clearPendingDraftIfLatest(targetNoteId, seq);
        }
      }

      return optimisticNote;
    },
    [getCoordinator],
  );

  const persistSnapshot = useCallback(
    async (
      targetNoteId: string,
      snapshot: NoteDraftSnapshot,
      baseUpdatedAt: string,
      seq?: number,
      options?: PersistSnapshotOptions,
    ): Promise<NoteDto | null> => {
      const coordinator = getCoordinator();
      const isOfflineNow =
        (syncRef.current ? !syncRef.current.isOnline : false) ||
        (typeof navigator !== "undefined" && navigator.onLine === false);
      const effectiveSeq =
        seq ??
        coordinator.stagePendingDraft(
          targetNoteId,
          snapshot,
          baseUpdatedAt,
          isOfflineNow ? "pending_sync" : "saving",
        );

      coordinator.markSeqQueued(targetNoteId, effectiveSeq);

      return coordinator.enqueue(targetNoteId, async () => {
        if (coordinator.isDeleted(targetNoteId)) {
          return null;
        }

        const sanitizedFolderId =
          snapshot.folderId !== null &&
          !foldersRef.current.some((item) => item.id === snapshot.folderId)
            ? null
            : snapshot.folderId;
        const effectiveSnapshot: NoteDraftSnapshot =
          sanitizedFolderId === snapshot.folderId
            ? snapshot
            : { ...snapshot, folderId: sanitizedFolderId };
        const authoritativeUpdatedAt =
          coordinator.getKnownUpdatedAt(targetNoteId) ?? baseUpdatedAt;

        const currentlyOffline =
          (syncRef.current ? !syncRef.current.isOnline : false) ||
          (typeof navigator !== "undefined" && navigator.onLine === false);

        if (currentlyOffline) {
          return queueNotePatchToOutbox(
            targetNoteId,
            effectiveSnapshot,
            effectiveSeq,
            authoritativeUpdatedAt,
          );
        }

        if (
          mountedRef.current &&
          activeNoteIdRef.current === targetNoteId &&
          coordinator.isLatestSeq(targetNoteId, effectiveSeq)
        ) {
          setSaveStatus("saving");
        }

        try {
          const bodyText = JSON.stringify({
            title: effectiveSnapshot.title,
            content: effectiveSnapshot.content,
            folderId: effectiveSnapshot.folderId,
            isPinned: effectiveSnapshot.isPinned,
            tags: effectiveSnapshot.tags,
            updatedAt: authoritativeUpdatedAt,
            idempotencyKey: crypto.randomUUID(),
          });
          // Browser fetch keepalive caps payloads at ~64 KiB; omit keepalive for large bodies up to 200k chars.
          const useKeepalive =
            options?.keepalive === true &&
            new TextEncoder().encode(bodyText).length <= KEEPALIVE_MAX_BYTES;

          const response = await apiFetch(`/api/notes/${targetNoteId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: bodyText,
            ...(useKeepalive ? { keepalive: true } : {}),
          });

          const payload = (await response.json().catch(() => null)) as {
            ok?: boolean;
            data?: NoteMutationResult;
          } | null;

          return reconcileMutationResponse(
            targetNoteId,
            effectiveSeq,
            effectiveSnapshot,
            response,
            payload,
            false,
          );
        } catch {
          return queueNotePatchToOutbox(
            targetNoteId,
            effectiveSnapshot,
            effectiveSeq,
            authoritativeUpdatedAt,
          );
        }
      });
    },
    [getCoordinator, queueNotePatchToOutbox, reconcileMutationResponse],
  );

  // Flush pending edits when switching to another note, and restore queued/pending drafts on re-selection.
  useEffect(() => {
    foldersRef.current = folders;
    const coordinator = getCoordinator();

    for (const pending of coordinator.listPendingDrafts()) {
      if (
        pending.snapshot.folderId !== null &&
        !folders.some((item) => item.id === pending.snapshot.folderId)
      ) {
        coordinator.reconcilePendingFolder(pending.noteId, null);
      }
    }

    const previousNoteId = activeNoteIdRef.current;
    if (previousNoteId !== note.id) {
      clearPendingTimer();
      if (dirtyRef.current) {
        const pendingPrev = coordinator.getPendingDraft(previousNoteId);
        const alreadyQueued =
          pendingPrev !== undefined &&
          pendingPrev.status === "saving" &&
          coordinator.isLatestSeqQueued(previousNoteId) &&
          areDraftSnapshotsEqual(pendingPrev.snapshot, draftRef.current);

        if (!alreadyQueued) {
          const prevStatus: PendingSaveStatus =
            typeof navigator !== "undefined" && navigator.onLine === false
              ? "pending_sync"
              : "saving";
          const prevSeq =
            pendingPrev &&
            areDraftSnapshotsEqual(pendingPrev.snapshot, draftRef.current)
              ? pendingPrev.seq
              : coordinator.stagePendingDraft(
                  previousNoteId,
                  draftRef.current,
                  serverUpdatedAtRef.current,
                  prevStatus,
                );
          void persistSnapshot(
            previousNoteId,
            draftRef.current,
            serverUpdatedAtRef.current,
            prevSeq,
          );
        }
      }

      activeNoteIdRef.current = note.id;
      coordinator.seedKnownUpdatedAt(note.id, note.updatedAt);

      const pendingForNext = coordinator.getPendingDraft(note.id);
      if (pendingForNext) {
        const validFolderId = resolveValidFolderId(
          pendingForNext.snapshot.folderId,
          note.folderId,
          folders,
        );
        const restoredSnapshot: NoteDraftSnapshot =
          validFolderId === pendingForNext.snapshot.folderId
            ? pendingForNext.snapshot
            : {
                ...pendingForNext.snapshot,
                folderId: validFolderId,
              };
        if (validFolderId !== pendingForNext.snapshot.folderId) {
          coordinator.reconcilePendingFolder(note.id, validFolderId);
        }

        serverUpdatedAtRef.current =
          coordinator.getKnownUpdatedAt(note.id) ?? note.updatedAt;
        dirtyRef.current = true;
        draftRef.current = restoredSnapshot;
        setTitle(restoredSnapshot.title);
        setContent(restoredSnapshot.content);
        setFolderId(restoredSnapshot.folderId);
        setIsPinned(restoredSnapshot.isPinned);
        setTagNames(restoredSnapshot.tags);
        setTagInput("");
        setTagLimitError(false);
        setSaveStatus(pendingForNext.status);
        setConflictNotice(false);
      } else {
        coordinator.seedKnownUpdatedAt(note.id, note.updatedAt, true);
        serverUpdatedAtRef.current = note.updatedAt;
        dirtyRef.current = false;
        draftRef.current = toDraftSnapshot(note);

        setTitle(note.title);
        setContent(note.content);
        setFolderId(note.folderId);
        setIsPinned(note.isPinned);
        setTagNames(note.tags.map((item) => item.name));
        setTagInput("");
        setTagLimitError(false);
        setSaveStatus("saved");
        setConflictNotice(false);
      }
    } else if (!dirtyRef.current && !coordinator.hasPendingOrInFlight(note.id)) {
      coordinator.seedKnownUpdatedAt(note.id, note.updatedAt);
      serverUpdatedAtRef.current =
        coordinator.getKnownUpdatedAt(note.id) ?? note.updatedAt;
      draftRef.current = toDraftSnapshot(note);
      setTitle(note.title);
      setContent(note.content);
      setFolderId(note.folderId);
      setIsPinned(note.isPinned);
      setTagNames(note.tags.map((item) => item.name));
      setTagLimitError(false);
    } else {
      coordinator.seedKnownUpdatedAt(note.id, note.updatedAt);
      if (
        draftRef.current.folderId !== null &&
        !folders.some((item) => item.id === draftRef.current.folderId)
      ) {
        const fallbackFolderId = resolveValidFolderId(
          note.folderId,
          null,
          folders,
        );
        draftRef.current = {
          ...draftRef.current,
          folderId: fallbackFolderId,
        };
        coordinator.reconcilePendingFolder(note.id, fallbackFolderId);
        setFolderId(fallbackFolderId);
      }
    }
  }, [clearPendingTimer, folders, getCoordinator, note, persistSnapshot]);

  useEffect(() => {
    const handleOnline = () => {
      clearPendingTimer();
      const coordinator = getCoordinator();
      const activeId = activeNoteIdRef.current;

      if (dirtyRef.current) {
        const activePending = coordinator.getPendingDraft(activeId);
        if (
          !activePending ||
          activePending.status === "pending_sync" ||
          !coordinator.isLatestSeqQueued(activeId)
        ) {
          const seq =
            activePending?.seq ??
            coordinator.stagePendingDraft(
              activeId,
              draftRef.current,
              serverUpdatedAtRef.current,
              "saving",
            );
          coordinator.updatePendingDraftStatus(activeId, seq, "saving");
          void persistSnapshot(
            activeId,
            draftRef.current,
            serverUpdatedAtRef.current,
            seq,
          );
        }
      }

      for (const pending of coordinator.listPendingDrafts()) {
        if (pending.noteId === activeId) {
          continue;
        }
        if (
          pending.status === "pending_sync" &&
          !coordinator.hasInFlight(pending.noteId)
        ) {
          coordinator.updatePendingDraftStatus(
            pending.noteId,
            pending.seq,
            "saving",
          );
          void persistSnapshot(
            pending.noteId,
            pending.snapshot,
            pending.baseUpdatedAt,
            pending.seq,
          );
        }
      }
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [clearPendingTimer, getCoordinator, persistSnapshot]);

  const flushActiveDraftIfNeeded = useCallback(
    (options?: PersistSnapshotOptions): boolean => {
      const hadPendingTimer = debounceTimerRef.current !== null;
      clearPendingTimer();

      const targetNoteId = activeNoteIdRef.current;
      const coordinator = getCoordinator();
      if (
        coordinator.isDeleted(targetNoteId) ||
        (typeof navigator !== "undefined" && navigator.onLine === false)
      ) {
        return false;
      }

      const activePending = coordinator.getPendingDraft(targetNoteId);
      const needsFlush =
        dirtyRef.current &&
        (hadPendingTimer || !coordinator.isLatestSeqQueued(targetNoteId));

      if (!needsFlush) {
        return false;
      }

      const seq =
        activePending?.seq ??
        coordinator.stagePendingDraft(
          targetNoteId,
          draftRef.current,
          serverUpdatedAtRef.current,
          "saving",
        );
      coordinator.updatePendingDraftStatus(targetNoteId, seq, "saving");
      void persistSnapshot(
        targetNoteId,
        draftRef.current,
        serverUpdatedAtRef.current,
        seq,
        options,
      );
      return true;
    },
    [clearPendingTimer, getCoordinator, persistSnapshot],
  );

  useEffect(() => {
    flushOnUnloadRef.current = () => {
      flushActiveDraftIfNeeded({ keepalive: true });
    };
  }, [flushActiveDraftIfNeeded]);

  useEffect(() => {
    mountedRef.current = true;
    const handlePageHide = () => {
      flushOnUnloadRef.current();
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", handlePageHide);
      flushOnUnloadRef.current();
    };
  }, []);

  const handleBackClick = () => {
    if (!onBack || returningBackRef.current) {
      return;
    }

    const targetNoteId = activeNoteIdRef.current;
    const coordinator = getCoordinator();
    const isOffline =
      typeof navigator !== "undefined" && navigator.onLine === false;

    if (!isOffline) {
      const didFlush = flushActiveDraftIfNeeded();
      if (didFlush || coordinator.hasInFlight(targetNoteId)) {
        returningBackRef.current = true;
        setReturningBack(true);
        void coordinator.waitForIdle(targetNoteId).finally(() => {
          returningBackRef.current = false;
          if (!mountedRef.current) {
            return;
          }
          setReturningBack(false);
          onBack();
        });
        return;
      }
    } else {
      clearPendingTimer();
    }

    onBack();
  };

  const scheduleDebouncedSave = useCallback(
    (nextDraft: NoteDraftSnapshot) => {
      const coordinator = getCoordinator();
      const targetNoteId = activeNoteIdRef.current;
      const seq = coordinator.stagePendingDraft(
        targetNoteId,
        nextDraft,
        serverUpdatedAtRef.current,
        "saving",
      );

      draftRef.current = nextDraft;
      dirtyRef.current = true;
      setConflictNotice(false);
      setSaveStatus("saving");
      clearPendingTimer();

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void persistSnapshot(
          targetNoteId,
          nextDraft,
          serverUpdatedAtRef.current,
          seq,
        );
      }, AUTO_SAVE_DEBOUNCE_MS);
    },
    [clearPendingTimer, getCoordinator, persistSnapshot],
  );

  const commitMetadataImmediately = useCallback(
    (nextDraft: NoteDraftSnapshot) => {
      const coordinator = getCoordinator();
      const targetNoteId = activeNoteIdRef.current;
      const initialStatus: PendingSaveStatus =
        typeof navigator !== "undefined" && navigator.onLine === false
          ? "pending_sync"
          : "saving";
      const seq = coordinator.stagePendingDraft(
        targetNoteId,
        nextDraft,
        serverUpdatedAtRef.current,
        initialStatus,
      );

      draftRef.current = nextDraft;
      dirtyRef.current = true;
      setConflictNotice(false);
      clearPendingTimer();
      void persistSnapshot(
        targetNoteId,
        nextDraft,
        serverUpdatedAtRef.current,
        seq,
      );
    },
    [clearPendingTimer, getCoordinator, persistSnapshot],
  );

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle);
    scheduleDebouncedSave({
      ...draftRef.current,
      title: nextTitle,
    });
  };

  const handleContentChange = (nextContent: string) => {
    setContent(nextContent);
    scheduleDebouncedSave({
      ...draftRef.current,
      content: nextContent,
    });
  };

  const handleFolderChange = (rawValue: string) => {
    const nextFolderId = rawValue === "" ? null : rawValue;
    setFolderId(nextFolderId);
    commitMetadataImmediately({
      ...draftRef.current,
      folderId: nextFolderId,
    });
  };

  const handleTogglePin = () => {
    const nextPinned = !isPinned;
    setIsPinned(nextPinned);
    commitMetadataImmediately({
      ...draftRef.current,
      isPinned: nextPinned,
    });
  };

  const handleAddTag = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return;
    }

    const nextTags = normalizeTagNames([...tagNames, trimmed]);
    if (nextTags.join("|") === tagNames.join("|")) {
      setTagInput("");
      setTagLimitError(false);
      return;
    }

    if (nextTags.length > NOTE_MAX_TAGS) {
      setTagLimitError(true);
      return;
    }

    setTagInput("");
    setTagLimitError(false);
    setTagNames(nextTags);
    commitMetadataImmediately({
      ...draftRef.current,
      tags: nextTags,
    });
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const nextTags = tagNames.filter(
      (tag) => tag.toLowerCase() !== tagToRemove.toLowerCase(),
    );
    setTagLimitError(false);
    setTagNames(nextTags);
    commitMetadataImmediately({
      ...draftRef.current,
      tags: nextTags,
    });
  };

  const handleTagInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      handleAddTag(tagInput);
    }
  };

  const handleToggleChecklist = async (index: number, checked: boolean) => {
    clearPendingTimer();
    const coordinator = getCoordinator();
    const targetNoteId = activeNoteIdRef.current;
    const wasDirtyOrQueuedBeforeToggle =
      dirtyRef.current || coordinator.hasPendingOrInFlight(targetNoteId);

    let optimisticContent: string;
    try {
      optimisticContent = toggleChecklistInMarkdown(
        draftRef.current.content,
        index,
        checked,
      );
    } catch {
      return;
    }

    const nextDraft: NoteDraftSnapshot = {
      ...draftRef.current,
      content: optimisticContent,
    };
    const isOffline =
      (syncRef.current ? !syncRef.current.isOnline : false) ||
      (typeof navigator !== "undefined" && navigator.onLine === false);
    const seq = coordinator.stagePendingDraft(
      targetNoteId,
      nextDraft,
      serverUpdatedAtRef.current,
      isOffline ? "pending_sync" : "saving",
    );

    setContent(optimisticContent);
    draftRef.current = nextDraft;
    dirtyRef.current = true;
    setConflictNotice(false);

    if (isOffline) {
      if (syncRef.current?.storageAvailable) {
        coordinator.markSeqQueued(targetNoteId, seq);
        await coordinator.enqueue(targetNoteId, () =>
          queueNotePatchToOutbox(
            targetNoteId,
            nextDraft,
            seq,
            coordinator.getKnownUpdatedAt(targetNoteId) ??
              serverUpdatedAtRef.current,
          ),
        );
      } else {
        setSaveStatus("pending_sync");
      }
      return;
    }

    if (wasDirtyOrQueuedBeforeToggle) {
      await persistSnapshot(
        targetNoteId,
        nextDraft,
        serverUpdatedAtRef.current,
        seq,
      );
      return;
    }

    coordinator.markSeqQueued(targetNoteId, seq);

    await coordinator.enqueue(targetNoteId, async () => {
      if (coordinator.isDeleted(targetNoteId)) {
        return null;
      }

      if (
        mountedRef.current &&
        activeNoteIdRef.current === targetNoteId &&
        coordinator.isLatestSeq(targetNoteId, seq)
      ) {
        setSaveStatus("saving");
      }

      const baseUpdatedAt =
        coordinator.getKnownUpdatedAt(targetNoteId) ??
        serverUpdatedAtRef.current;

      try {
        const response = await apiFetch(
          `/api/notes/${targetNoteId}/checklist`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              index,
              checked,
              updatedAt: baseUpdatedAt,
              idempotencyKey: crypto.randomUUID(),
            }),
          },
        );

        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          data?: NoteMutationResult;
        } | null;

        return reconcileMutationResponse(
          targetNoteId,
          seq,
          nextDraft,
          response,
          payload,
          true,
        );
      } catch {
        return queueNotePatchToOutbox(
          targetNoteId,
          nextDraft,
          seq,
          baseUpdatedAt,
        );
      }
    });
  };

  const applyToolbarSyntax = (
    formatter: (selected: string) => { text: string; cursorOffset?: number },
  ) => {
    const textarea = textareaRef.current;
    const start = textarea ? textarea.selectionStart : content.length;
    const end = textarea ? textarea.selectionEnd : content.length;
    const selected = content.slice(start, end);
    const { text: inserted, cursorOffset } = formatter(selected);

    const nextContent =
      content.slice(0, start) + inserted + content.slice(end);
    handleContentChange(nextContent);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const nextPos = start + (cursorOffset ?? inserted.length);
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    });
  };

  const handleConfirmDelete = async () => {
    clearPendingTimer();
    const targetNoteId = note.id;
    const coordinator = getCoordinator();
    coordinator.markDeleted(targetNoteId);
    dirtyRef.current = false;
    setDeleting(true);

    const queueDeleteLocally = async () => {
      const currentSync = syncRef.current;
      if (!currentSync || !currentSync.storageAvailable) {
        coordinator.unmarkDeleted(targetNoteId);
        if (mountedRef.current) {
          setSaveStatus("pending_sync");
          setDeleteModalOpen(false);
        }
        return;
      }

      const deletedAtIso = new Date().toISOString();
      const idempotencyKey = crypto.randomUUID();
      await enqueueOutboxMutation(currentSync.userId, {
        mutationId: crypto.randomUUID(),
        createdAt: Date.now(),
        idempotencyKey,
        entity: "note",
        entityId: targetNoteId,
        op: "delete",
        method: "DELETE",
        path: `/api/notes/${targetNoteId}`,
        body: { updatedAt: deletedAtIso, idempotencyKey },
        optimisticSnapshot: {
          kind: "note_delete",
          id: targetNoteId,
          deletedAt: deletedAtIso,
        },
        updatedAt: deletedAtIso,
        status: "pending",
        retryCount: 0,
        nextRetryAt: null,
        lastError: null,
      });
      coordinator.clearNoteRuntime(targetNoteId);
      currentSync.reloadMirror();
      if (mountedRef.current) {
        setDeleteModalOpen(false);
      }
      onDeleted(targetNoteId);
    };

    try {
      await coordinator.enqueue(targetNoteId, async () => {
        const isOfflineNow =
          (syncRef.current ? !syncRef.current.isOnline : false) ||
          (typeof navigator !== "undefined" && navigator.onLine === false);
        if (isOfflineNow) {
          await queueDeleteLocally();
          return;
        }

        try {
          const response = await apiFetch(`/api/notes/${targetNoteId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
          });

          const payload = (await response.json().catch(() => null)) as {
            ok?: boolean;
            data?: NoteDeleteResult;
          } | null;

          if (!response.ok || payload?.ok !== true || !payload.data) {
            coordinator.unmarkDeleted(targetNoteId);
            if (mountedRef.current) {
              setSaveStatus(response.status >= 500 ? "pending_sync" : "error");
              setDeleteModalOpen(false);
            }
            return;
          }

          if (!payload.data.deleted) {
            coordinator.unmarkDeleted(targetNoteId);
            if (payload.data.note) {
              coordinator.seedKnownUpdatedAt(
                targetNoteId,
                payload.data.note.updatedAt,
                true,
              );
              if (mountedRef.current) {
                applyServerNote(payload.data.note, true);
              }
              onSavedRef.current(payload.data.note);
            } else if (mountedRef.current) {
              setSaveStatus("error");
            }
            if (mountedRef.current) {
              setDeleteModalOpen(false);
            }
            return;
          }

          coordinator.clearNoteRuntime(targetNoteId);
          if (syncRef.current?.storageAvailable) {
            void applyOptimisticToMirror(syncRef.current.userId, {
              kind: "note_delete",
              id: targetNoteId,
              deletedAt: new Date().toISOString(),
            })
              .then(() => {
                syncRef.current?.reloadMirror();
              })
              .catch(() => undefined);
          }
          if (mountedRef.current) {
            setDeleteModalOpen(false);
          }
          onDeleted(targetNoteId);
        } catch {
          await queueDeleteLocally();
        }
      });
    } finally {
      if (mountedRef.current) {
        setDeleting(false);
      }
    }
  };

  const checklistSummary = parseChecklists(content);
  const completedCount = checklistSummary.filter((item) => item.checked).length;

  const statusText =
    saveStatus === "saving"
      ? t.notes.statusSaving
      : saveStatus === "pending_sync"
        ? t.notes.statusPendingSync
        : saveStatus === "error"
          ? t.notes.statusError
          : t.notes.statusSaved;

  return (
    <section
      aria-label={t.notes.workspaceTitle}
      className="flex flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-sm)] sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {onBack ? (
            <Button
              size="sm"
              shape="pill"
              variant="secondary"
              disabled={returningBack || deleting}
              onClick={handleBackClick}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{t.notes.backToNotes}</span>
            </Button>
          ) : null}

          <span
            role="status"
            aria-live="polite"
            data-testid="note-save-status"
            className={cn(
              "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-medium",
              saveStatus === "saved" &&
                "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
              saveStatus === "saving" &&
                "border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)]",
              saveStatus === "pending_sync" &&
                "border-[var(--status-warning)] bg-[var(--bg-subtle)] text-[var(--status-warning)]",
              saveStatus === "error" &&
                "border-[var(--status-expense)] bg-[var(--bg-subtle)] text-[var(--status-expense)]",
            )}
          >
            {statusText}
          </span>

          {checklistSummary.length > 0 ? (
            <span className="inline-flex min-h-8 items-center rounded-full bg-[var(--bg-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
              {t.notes.checklistCountLabel
                .replace("{done}", String(completedCount))
                .replace("{total}", String(checklistSummary.length))}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="group"
            aria-label={t.notes.modeGroupAriaLabel}
            className="inline-flex items-center rounded-full border border-[var(--border-default)] bg-[var(--bg-subtle)] p-0.5"
          >
            {(["edit", "preview", "split"] as const).map((mode) => {
              const label =
                mode === "edit"
                  ? t.notes.modeEdit
                  : mode === "preview"
                    ? t.notes.modePreview
                    : t.notes.modeSplit;
              const isSelected = viewMode === mode;

              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "min-h-8 cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    isSelected
                      ? "bg-[var(--accent-primary)] text-[var(--accent-foreground)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <Button
            size="sm"
            shape="pill"
            variant={isPinned ? "primary" : "secondary"}
            aria-pressed={isPinned}
            aria-label={t.notes.pinButtonLabel}
            onClick={handleTogglePin}
          >
            <Pin className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isPinned ? t.notes.pinnedLabel : t.notes.unpinnedLabel}</span>
          </Button>

          <Button
            size="sm"
            shape="pill"
            variant="danger"
            onClick={() => setDeleteModalOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.notes.deleteNoteButton}</span>
          </Button>
        </div>
      </div>

      {conflictNotice ? (
        <div
          role="status"
          className="rounded-xl border border-[var(--status-warning)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--status-warning)]"
        >
          {t.notes.conflictServerWinsNotice}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor={`note-title-${note.id}`} className="sr-only">
            {t.notes.titleLabel}
          </label>
          <input
            id={`note-title-${note.id}`}
            type="text"
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
            placeholder={t.notes.titlePlaceholder}
            maxLength={200}
            className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 px-3 py-2 text-lg font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:bg-[var(--bg-surface)]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor={`note-folder-${note.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]"
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.notes.folderLabel}</span>
            </label>
            <select
              id={`note-folder-${note.id}`}
              value={folderId ?? ""}
              onChange={(event) => handleFolderChange(event.target.value)}
              className="min-h-9 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-medium text-[var(--text-primary)]"
            >
              <option value="">{t.notes.noFolderOption}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
            {onOpenFolderManager ? (
              <Button
                size="sm"
                shape="pill"
                variant="ghost"
                onClick={onOpenFolderManager}
              >
                {t.folders.manageButton}
              </Button>
            ) : null}
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {t.notes.tagsLabel}:
            </span>
            {tagNames.map((tag) => (
              <span
                key={tag.toLowerCase()}
                className="inline-flex min-h-7 items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-primary)]"
              >
                <span>#{tag}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  aria-label={`${t.notes.removeTagAriaPrefix} ${tag}`}
                  className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
            <div className="inline-flex items-center gap-1">
              <input
                type="text"
                aria-label={t.notes.tagsLabel}
                value={tagInput}
                onChange={(event) => {
                  setTagInput(event.target.value);
                  if (tagLimitError) {
                    setTagLimitError(false);
                  }
                }}
                onKeyDown={handleTagInputKeyDown}
                placeholder={t.notes.tagPlaceholder}
                maxLength={40}
                className="min-h-8 w-36 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] sm:w-44"
              />
              <button
                type="button"
                onClick={() => handleAddTag(tagInput)}
                aria-label={t.notes.addTagButton}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                <span>{t.notes.addTagButton}</span>
              </button>
            </div>
            {tagLimitError ? (
              <p
                role="alert"
                className="w-full text-xs font-medium text-[var(--status-expense)]"
              >
                {t.notes.maxTagsReached}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {viewMode !== "preview" ? (
        <div
          role="toolbar"
          aria-label={t.notes.toolbarAriaLabel}
          className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 p-1.5"
        >
          <button
            type="button"
            onClick={() =>
              applyToolbarSyntax((sel) => ({
                text: `## ${sel || t.notes.toolDefaultHeading}`,
              }))
            }
            className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            <Heading2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.notes.toolHeading}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              applyToolbarSyntax((sel) => ({
                text: `**${sel || t.notes.toolDefaultBold}**`,
              }))
            }
            className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            <Bold className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.notes.toolBold}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              applyToolbarSyntax((sel) => ({
                text: `*${sel || t.notes.toolDefaultItalic}*`,
              }))
            }
            className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            <Italic className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.notes.toolItalic}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              applyToolbarSyntax((sel) => ({
                text: `${content.length > 0 && !content.endsWith("\n") ? "\n" : ""}- ${sel || t.notes.toolDefaultList}`,
              }))
            }
            className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            <List className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.notes.toolList}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              applyToolbarSyntax((sel) => ({
                text: `${content.length > 0 && !content.endsWith("\n") ? "\n" : ""}- [ ] ${sel || t.notes.toolDefaultChecklist}`,
              }))
            }
            className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.notes.toolChecklist}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              applyToolbarSyntax((sel) => ({
                text: `\`\`\`\n${sel || t.notes.toolDefaultCode}\n\`\`\``,
              }))
            }
            className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            <Code className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.notes.toolCode}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              applyToolbarSyntax((sel) => ({
                text: `[${sel || t.notes.toolDefaultLink}](https://example.com)`,
              }))
            }
            className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.notes.toolLink}</span>
          </button>
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-4",
          viewMode === "split" ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1",
        )}
      >
        {viewMode !== "preview" ? (
          <div className="flex flex-col">
            <label htmlFor={`note-content-${note.id}`} className="sr-only">
              {t.notes.contentLabel}
            </label>
            <textarea
              ref={textareaRef}
              id={`note-content-${note.id}`}
              value={content}
              onChange={(event) => handleContentChange(event.target.value)}
              placeholder={t.notes.contentPlaceholder}
              rows={14}
              className="min-h-[280px] w-full resize-y rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)]/40 p-3.5 font-mono text-sm leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:bg-[var(--bg-surface)]"
            />
          </div>
        ) : null}

        {viewMode !== "edit" ? (
          <div className="min-h-[280px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
            <MarkdownPreview
              content={content}
              onToggleChecklist={(idx, nextChecked) => {
                void handleToggleChecklist(idx, nextChecked);
              }}
            />
          </div>
        ) : null}
      </div>

      {renderAttachmentsSlot ? (
        <div className="border-t border-[var(--border-subtle)] pt-4">
          {renderAttachmentsSlot(note)}
        </div>
      ) : null}

      {renderLinkedTransactionsSlot ? (
        <div className="border-t border-[var(--border-subtle)] pt-4">
          {renderLinkedTransactionsSlot(note)}
        </div>
      ) : null}

      <Modal
        open={deleteModalOpen}
        onClose={() => {
          if (!deleting) {
            setDeleteModalOpen(false);
          }
        }}
        title={t.notes.deleteConfirmTitle}
        description={t.notes.deleteConfirmDescription}
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            shape="pill"
            variant="secondary"
            disabled={deleting}
            onClick={() => setDeleteModalOpen(false)}
          >
            {t.common.cancel}
          </Button>
          <Button
            shape="pill"
            variant="danger"
            loading={deleting}
            onClick={() => void handleConfirmDelete()}
          >
            {deleting ? t.notes.deletingNote : t.notes.deleteConfirmButton}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

