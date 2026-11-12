"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from "react";
import {
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  RefreshCw,
  Trash2,
  WifiOff,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { NoteAttachmentDto } from "@/features/notes/attachments-service";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";
import type { Dictionary } from "@/lib/i18n/types";
import { cn } from "@/lib/cn";

const MAX_ATTACHMENTS_PER_NOTE = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_CLIENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export interface NoteAttachmentsPanelProps {
  noteId: string;
  isOnline?: boolean;
  initialAttachments?: NoteAttachmentDto[];
  initialAttachmentsNoteId?: string;
  onNoteUpdatedAt?: (noteId: string, updatedAt: string) => void;
}

interface ApiEnvelopeError {
  ok?: false;
  error?: {
    code?: string;
    message?: string;
  };
}

interface AttachmentPanelState {
  noteId: string;
  attachments: NoteAttachmentDto[];
  loading: boolean;
  loadFailed: boolean;
  uploading: boolean;
  deletingId: string | null;
  errorMessage: string | null;
  deleteTarget: NoteAttachmentDto | null;
  lightboxAttachment: NoteAttachmentDto | null;
  failedImageIds: ReadonlySet<string>;
  retrySeed: number;
}

const EMPTY_FAILED_IDS: ReadonlySet<string> = new Set();

function resolveAttachmentApiError(
  t: Dictionary,
  payload: ApiEnvelopeError | null,
): string {
  const code = payload?.error?.code;
  if (code && code in t.errors) {
    return t.errors[code as keyof Dictionary["errors"]];
  }
  return t.errors.generic;
}

function validateClientFileSelection(
  file: File,
  t: Dictionary,
): string | null {
  if (file.size <= 0) {
    return t.notes.attachments.clientEmptyFile;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return t.notes.attachments.clientFileTooLarge;
  }
  const normalizedType =
    file.type.trim().toLowerCase().split(";")[0]?.trim() ?? "";
  if (
    normalizedType.length > 0 &&
    normalizedType !== "application/octet-stream" &&
    !ALLOWED_CLIENT_MIME_TYPES.has(normalizedType)
  ) {
    return t.notes.attachments.unsupportedClientType;
  }
  return null;
}

function createInitialState(
  noteId: string,
  initialAttachments?: NoteAttachmentDto[],
  initialAttachmentsNoteId?: string,
): AttachmentPanelState {
  const hasSnapshot =
    initialAttachments !== undefined &&
    (initialAttachmentsNoteId === undefined ||
      initialAttachmentsNoteId === noteId);

  return {
    noteId,
    attachments: hasSnapshot ? initialAttachments : [],
    loading: !hasSnapshot,
    loadFailed: false,
    uploading: false,
    deletingId: null,
    errorMessage: null,
    deleteTarget: null,
    lightboxAttachment: null,
    failedImageIds: EMPTY_FAILED_IDS,
    retrySeed: 0,
  };
}

/**
 * Online-only note image attachment gallery, uploader, confirmation delete modal, and lightbox (RFC-005).
 */
function subscribeOnlineStatus(onStoreChange: () => void): () => void {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getClientOnlineSnapshot(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
    ? navigator.onLine
    : true;
}

function getServerOnlineSnapshot(): boolean {
  return true;
}

function AttachmentRetryButton({
  visible,
  label,
  onRetry,
}: {
  visible: boolean;
  label: string;
  onRetry: () => void;
}) {
  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
    >
      <RefreshCw className="h-3 w-3" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export function NoteAttachmentsPanel({
  noteId,
  isOnline: isOnlineProp,
  initialAttachments,
  initialAttachmentsNoteId,
  onNoteUpdatedAt,
}: NoteAttachmentsPanelProps) {
  const { t } = useI18n();

  const browserOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    getClientOnlineSnapshot,
    getServerOnlineSnapshot,
  );
  const effectiveIsOnline = isOnlineProp ?? browserOnline;

  const [state, setState] = useState<AttachmentPanelState>(() =>
    createInitialState(noteId, initialAttachments, initialAttachmentsNoteId),
  );

  // Derive scoped state cleanly when `noteId` changes without synchronous setState in effects.
  const activeState: AttachmentPanelState =
    state.noteId === noteId ? state : createInitialState(noteId);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeNoteIdRef = useRef<string>(noteId);
  const consumedInitialNoteIdRef = useRef<string | null>(
    initialAttachments !== undefined &&
      (initialAttachmentsNoteId === undefined ||
        initialAttachmentsNoteId === noteId)
      ? noteId
      : null,
  );
  const prevOnlineRef = useRef<boolean>(effectiveIsOnline);
  const loadFailedRef = useRef<boolean>(activeState.loadFailed);
  const tRef = useRef(t);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    loadFailedRef.current = activeState.loadFailed;
  }, [activeState.loadFailed]);

  const fetchAttachments = useCallback(
    async (targetNoteId: string, signal?: AbortSignal) => {
      try {
        const response = await apiFetch(
          `/api/notes/${targetNoteId}/attachments`,
          {
            method: "GET",
            signal,
          },
        );
        if (signal?.aborted || activeNoteIdRef.current !== targetNoteId) {
          return;
        }

        const payload = (await response.json().catch(() => null)) as
          | { ok?: true; data?: { attachments?: NoteAttachmentDto[] } }
          | ApiEnvelopeError
          | null;

        if (
          !response.ok ||
          !payload ||
          !("ok" in payload) ||
          payload.ok !== true ||
          !Array.isArray(payload.data?.attachments)
        ) {
          setState((prev) => ({
            ...(prev.noteId === targetNoteId
              ? prev
              : createInitialState(targetNoteId)),
            noteId: targetNoteId,
            loading: false,
            loadFailed: true,
            errorMessage: resolveAttachmentApiError(
              tRef.current,
              (payload as ApiEnvelopeError | null) ?? null,
            ),
          }));
          return;
        }

        const fetched = payload.data.attachments;
        setState((prev) => ({
          ...(prev.noteId === targetNoteId
            ? prev
            : createInitialState(targetNoteId)),
          noteId: targetNoteId,
          attachments: fetched,
          loading: false,
          loadFailed: false,
          errorMessage: null,
        }));
      } catch {
        if (signal?.aborted || activeNoteIdRef.current !== targetNoteId) {
          return;
        }
        setState((prev) => ({
          ...(prev.noteId === targetNoteId
            ? prev
            : createInitialState(targetNoteId)),
          noteId: targetNoteId,
          loading: false,
          loadFailed: true,
          errorMessage: null,
        }));
      }
    },
    [],
  );

  const resetFailedImagesForOnline = useCallback(() => {
    const currentNoteId = activeNoteIdRef.current;
    setState((prev) => {
      const base =
        prev.noteId === currentNoteId ? prev : createInitialState(currentNoteId);
      return {
        ...base,
        failedImageIds: EMPTY_FAILED_IDS,
        retrySeed: base.retrySeed + 1,
      };
    });
    if (loadFailedRef.current) {
      void fetchAttachments(currentNoteId);
    }
  }, [fetchAttachments]);

  useEffect(() => {
    window.addEventListener("online", resetFailedImagesForOnline);
    return () => {
      window.removeEventListener("online", resetFailedImagesForOnline);
    };
  }, [resetFailedImagesForOnline]);

  useEffect(() => {
    activeNoteIdRef.current = noteId;

    if (consumedInitialNoteIdRef.current === noteId) {
      consumedInitialNoteIdRef.current = null;
      return;
    }

    const controller = new AbortController();
    void fetchAttachments(noteId, controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchAttachments, noteId]);

  useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    prevOnlineRef.current = effectiveIsOnline;

    if (!wasOnline && effectiveIsOnline) {
      queueMicrotask(() => {
        resetFailedImagesForOnline();
      });
    }
  }, [effectiveIsOnline, resetFailedImagesForOnline]);

  const markImageFailed = useCallback(
    (attachmentId: string) => {
      setState((prev) => {
        const base = prev.noteId === noteId ? prev : createInitialState(noteId);
        if (base.failedImageIds.has(attachmentId)) {
          return prev;
        }
        const nextFailed = new Set(base.failedImageIds);
        nextFailed.add(attachmentId);
        return {
          ...base,
          failedImageIds: nextFailed,
        };
      });
    },
    [noteId],
  );

  const handleRetryImages = useCallback(() => {
    setState((prev) => {
      const base = prev.noteId === noteId ? prev : createInitialState(noteId);
      return {
        ...base,
        loading: loadFailedRef.current ? true : base.loading,
        errorMessage: loadFailedRef.current ? null : base.errorMessage,
        failedImageIds: EMPTY_FAILED_IDS,
        retrySeed: base.retrySeed + 1,
      };
    });
    if (loadFailedRef.current) {
      void fetchAttachments(noteId);
    }
  }, [fetchAttachments, noteId]);

  const handleRetryFetch = useCallback(() => {
    setState((prev) => ({
      ...(prev.noteId === noteId ? prev : createInitialState(noteId)),
      loading: true,
      errorMessage: null,
    }));
    void fetchAttachments(noteId);
  }, [fetchAttachments, noteId]);

  const notifyNoteTimestamp = useCallback(
    (response: Response, targetNoteId: string) => {
      if (!response.ok) {
        return;
      }
      const updatedHeader = response.headers.get("X-Note-Updated-At");
      if (updatedHeader) {
        onNoteUpdatedAt?.(targetNoteId, updatedHeader);
      }
    },
    [onNoteUpdatedAt],
  );

  const handleUploadButtonClick = () => {
    if (
      !effectiveIsOnline ||
      activeState.uploading ||
      activeState.attachments.length >= MAX_ATTACHMENTS_PER_NOTE
    ) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !effectiveIsOnline || activeState.uploading) {
      return;
    }

    if (activeState.attachments.length >= MAX_ATTACHMENTS_PER_NOTE) {
      setState((prev) => ({
        ...(prev.noteId === noteId ? prev : createInitialState(noteId)),
        errorMessage: t.errors.ATTACHMENT_LIMIT_REACHED,
      }));
      return;
    }

    const clientError = validateClientFileSelection(file, t);
    if (clientError) {
      setState((prev) => ({
        ...(prev.noteId === noteId ? prev : createInitialState(noteId)),
        errorMessage: clientError,
      }));
      return;
    }

    const targetNoteId = noteId;
    setState((prev) => ({
      ...(prev.noteId === targetNoteId
        ? prev
        : createInitialState(targetNoteId)),
      uploading: true,
      errorMessage: null,
    }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiFetch(
        `/api/notes/${targetNoteId}/attachments`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (activeNoteIdRef.current !== targetNoteId) {
        notifyNoteTimestamp(response, targetNoteId);
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { ok?: true; data?: { attachment?: NoteAttachmentDto } }
        | ApiEnvelopeError
        | null;

      if (
        !response.ok ||
        !payload ||
        !("ok" in payload) ||
        payload.ok !== true ||
        !payload.data?.attachment
      ) {
        setState((prev) => ({
          ...(prev.noteId === targetNoteId
            ? prev
            : createInitialState(targetNoteId)),
          uploading: false,
          errorMessage: resolveAttachmentApiError(
            tRef.current,
            (payload as ApiEnvelopeError | null) ?? null,
          ),
        }));
        return;
      }

      const createdAttachment = payload.data.attachment;
      setState((prev) => {
        const base =
          prev.noteId === targetNoteId ? prev : createInitialState(targetNoteId);
        const nextAttachments = base.attachments.some(
          (item) => item.id === createdAttachment.id,
        )
          ? base.attachments
          : [...base.attachments, createdAttachment];

        const nextFailed = new Set(base.failedImageIds);
        nextFailed.delete(createdAttachment.id);

        return {
          ...base,
          attachments: nextAttachments,
          failedImageIds: nextFailed,
          uploading: false,
          errorMessage: null,
        };
      });

      notifyNoteTimestamp(response, targetNoteId);
    } catch {
      if (activeNoteIdRef.current === targetNoteId) {
        setState((prev) => ({
          ...(prev.noteId === targetNoteId
            ? prev
            : createInitialState(targetNoteId)),
          uploading: false,
          errorMessage: tRef.current.errors.generic,
        }));
      }
    }
  };

  const handleConfirmDelete = async () => {
    const targetAttachment = activeState.deleteTarget;
    if (
      !targetAttachment ||
      !effectiveIsOnline ||
      activeState.deletingId !== null
    ) {
      return;
    }

    const targetNoteId = noteId;
    setState((prev) => ({
      ...(prev.noteId === targetNoteId
        ? prev
        : createInitialState(targetNoteId)),
      deletingId: targetAttachment.id,
      errorMessage: null,
    }));

    try {
      const response = await apiFetch(
        `/api/attachments/${targetAttachment.id}`,
        {
          method: "DELETE",
        },
      );

      if (activeNoteIdRef.current !== targetNoteId) {
        notifyNoteTimestamp(response, targetNoteId);
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { ok?: true; data?: { deleted?: boolean; id?: string } }
        | ApiEnvelopeError
        | null;

      if (
        !response.ok ||
        !payload ||
        !("ok" in payload) ||
        payload.ok !== true
      ) {
        setState((prev) => ({
          ...(prev.noteId === targetNoteId
            ? prev
            : createInitialState(targetNoteId)),
          deletingId: null,
          errorMessage: resolveAttachmentApiError(
            tRef.current,
            (payload as ApiEnvelopeError | null) ?? null,
          ),
        }));
        return;
      }

      setState((prev) => {
        const base =
          prev.noteId === targetNoteId ? prev : createInitialState(targetNoteId);
        return {
          ...base,
          attachments: base.attachments.filter(
            (item) => item.id !== targetAttachment.id,
          ),
          lightboxAttachment:
            base.lightboxAttachment?.id === targetAttachment.id
              ? null
              : base.lightboxAttachment,
          deleteTarget: null,
          deletingId: null,
        };
      });

      notifyNoteTimestamp(response, targetNoteId);
    } catch {
      if (activeNoteIdRef.current === targetNoteId) {
        setState((prev) => ({
          ...(prev.noteId === targetNoteId
            ? prev
            : createInitialState(targetNoteId)),
          deletingId: null,
          errorMessage: tRef.current.errors.generic,
        }));
      }
    }
  };

  const uploadDisabled =
    !effectiveIsOnline ||
    activeState.uploading ||
    activeState.deletingId !== null ||
    activeState.attachments.length >= MAX_ATTACHMENTS_PER_NOTE;

  const deleteControlsDisabled =
    !effectiveIsOnline ||
    activeState.uploading ||
    activeState.deletingId !== null;

  return (
    <section
      aria-labelledby={`attachments-heading-${noteId}`}
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ImageIcon
            className="h-4 w-4 text-[var(--text-secondary)]"
            aria-hidden="true"
          />
          <h3
            id={`attachments-heading-${noteId}`}
            className="text-sm font-semibold text-[var(--text-primary)]"
          >
            {t.notes.attachments.sectionTitle}
          </h3>
          <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
            {t.notes.attachments.countBadge.replace(
              "{count}",
              String(activeState.attachments.length),
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            tabIndex={-1}
            aria-label={t.notes.attachments.uploadInputAria}
            disabled={uploadDisabled}
            onChange={(event) => void handleFileSelected(event)}
            className="sr-only"
          />
          <Button
            variant="secondary"
            size="sm"
            shape="pill"
            disabled={uploadDisabled}
            loading={activeState.uploading}
            onClick={handleUploadButtonClick}
          >
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            <span>{t.notes.attachments.uploadButton}</span>
          </Button>
        </div>
      </div>

      {!effectiveIsOnline ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t.notes.attachments.offlineNotice}</span>
        </div>
      ) : null}

      {effectiveIsOnline &&
      activeState.attachments.length >= MAX_ATTACHMENTS_PER_NOTE ? (
        <p className="text-xs text-[var(--text-secondary)]">
          {t.notes.attachments.limitReachedNotice}
        </p>
      ) : null}

      {activeState.uploading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-primary)]"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>{t.notes.attachments.uploadingStatus}</span>
        </div>
      ) : null}

      {activeState.errorMessage ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--danger-bg)]/30 bg-[var(--danger-bg)]/10 px-3 py-2 text-xs font-medium text-[var(--text-primary)]"
        >
          {activeState.errorMessage}
        </p>
      ) : null}

      {activeState.loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>{t.common.loading}</span>
        </div>
      ) : activeState.loadFailed && activeState.attachments.length === 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 px-3 py-2.5 text-xs text-[var(--text-secondary)]"
        >
          {!effectiveIsOnline ? (
            <span>{t.notes.attachments.offlinePlaceholder}</span>
          ) : !activeState.errorMessage ? (
            <span>{t.errors.generic}</span>
          ) : null}
          <AttachmentRetryButton
            visible={effectiveIsOnline}
            label={t.notes.attachments.retryLoadButton}
            onRetry={handleRetryFetch}
          />
        </div>
      ) : activeState.attachments.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          {t.notes.attachments.emptyText}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {activeState.attachments.map((item, index) => {
            const hasLoadError = activeState.failedImageIds.has(item.id);
            return (
              <li
                key={item.id}
                className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-[var(--bg-subtle)]">
                  {hasLoadError ? (
                    <div
                      role="status"
                      className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 text-center text-xs text-[var(--text-secondary)]"
                    >
                      <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span className="line-clamp-3">
                        {t.notes.attachments.offlinePlaceholder}
                      </span>
                      <AttachmentRetryButton
                        visible={effectiveIsOnline}
                        label={t.notes.attachments.retryLoadButton}
                        onRetry={handleRetryImages}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setState((prev) => ({
                          ...(prev.noteId === noteId
                            ? prev
                            : createInitialState(noteId)),
                          lightboxAttachment: item,
                        }))
                      }
                      aria-label={`${t.notes.attachments.openPreviewAria} (${index + 1})`}
                      className="group relative block h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                    >
                      {/* Private cookie-authenticated endpoint compatible with noka-private-v1 SW cache; next/image proxy would bypass private offline caching. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        key={`${item.id}-${activeState.retrySeed}`}
                        src={item.url}
                        alt={t.notes.attachments.imageAlt}
                        loading="lazy"
                        onError={() => markImageFailed(item.id)}
                        className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-[1.03]"
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          "pointer-events-none absolute right-1.5 bottom-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
                        )}
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-end border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleteControlsDisabled}
                    onClick={() =>
                      setState((prev) => ({
                        ...(prev.noteId === noteId
                          ? prev
                          : createInitialState(noteId)),
                        deleteTarget: item,
                      }))
                    }
                    aria-label={`${t.notes.attachments.deleteButtonAria} (${index + 1})`}
                    className="min-h-8 w-full justify-center gap-1.5 px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--danger-bg)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t.notes.attachments.deleteButton}</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={activeState.deleteTarget !== null}
        onClose={() => {
          if (activeState.deletingId === null) {
            setState((prev) => ({
              ...(prev.noteId === noteId ? prev : createInitialState(noteId)),
              deleteTarget: null,
            }));
          }
        }}
        title={t.notes.attachments.deleteConfirmTitle}
        description={t.notes.attachments.deleteConfirmDescription}
      >
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            shape="pill"
            disabled={activeState.deletingId !== null}
            onClick={() =>
              setState((prev) => ({
                ...(prev.noteId === noteId ? prev : createInitialState(noteId)),
                deleteTarget: null,
              }))
            }
          >
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            shape="pill"
            disabled={!effectiveIsOnline}
            loading={activeState.deletingId !== null}
            onClick={() => void handleConfirmDelete()}
          >
            {activeState.deletingId !== null
              ? t.notes.attachments.deletingButton
              : t.notes.attachments.deleteConfirmButton}
          </Button>
        </div>
      </Modal>

      <Modal
        open={activeState.lightboxAttachment !== null}
        onClose={() =>
          setState((prev) => ({
            ...(prev.noteId === noteId ? prev : createInitialState(noteId)),
            lightboxAttachment: null,
          }))
        }
        title={t.notes.attachments.lightboxTitle}
        closeLabel={t.notes.attachments.closePreview}
        className="max-w-3xl"
      >
        {activeState.lightboxAttachment ? (
          <div className="flex flex-col gap-3">
            {activeState.failedImageIds.has(
              activeState.lightboxAttachment.id,
            ) ? (
              <div
                role="status"
                className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-6 text-center text-sm text-[var(--text-secondary)]"
              >
                <WifiOff className="h-6 w-6 shrink-0" aria-hidden="true" />
                <span>{t.notes.attachments.offlinePlaceholder}</span>
                <AttachmentRetryButton
                  visible={effectiveIsOnline}
                  label={t.notes.attachments.retryLoadButton}
                  onRetry={handleRetryImages}
                />
              </div>
            ) : (
              <>
                {/* Private cookie-authenticated endpoint compatible with noka-private-v1 SW cache. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`lightbox-${activeState.lightboxAttachment.id}-${activeState.retrySeed}`}
                  src={activeState.lightboxAttachment.url}
                  alt={t.notes.attachments.imageAlt}
                  onError={() =>
                    markImageFailed(activeState.lightboxAttachment!.id)
                  }
                  className="max-h-[70vh] w-full rounded-xl bg-[var(--bg-subtle)] object-contain"
                />
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
