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
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { parseChecklists, toggleChecklistInMarkdown } from "@/features/notes/checklist";
import { NOTE_MAX_TAGS, normalizeTagNames } from "@/features/notes/schemas";
import type {
  FolderDto,
  NoteDeleteResult,
  NoteDto,
  NoteMutationResult,
} from "@/features/notes/service";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

export type EditorViewMode = "edit" | "preview" | "split";
export type NoteSaveStatus = "saved" | "saving" | "pending_sync" | "error";

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

interface DraftSnapshot {
  title: string;
  content: string;
  folderId: string | null;
  isPinned: boolean;
  tags: string[];
}

const AUTO_SAVE_DEBOUNCE_MS = 600;

function toDraftSnapshot(note: NoteDto): DraftSnapshot {
  return {
    title: note.title,
    content: note.content,
    folderId: note.folderId,
    isPinned: note.isPinned,
    tags: note.tags.map((item) => item.name),
  };
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

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeNoteIdRef = useRef(note.id);
  const serverUpdatedAtRef = useRef(note.updatedAt);
  const dirtyRef = useRef(false);
  const draftRef = useRef<DraftSnapshot>(toDraftSnapshot(note));
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const applyServerNote = useCallback((serverNote: NoteDto, showConflict: boolean) => {
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
  }, []);

  const clearPendingTimer = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const persistSnapshot = useCallback(
    async (
      targetNoteId: string,
      snapshot: DraftSnapshot,
      baseUpdatedAt: string,
    ): Promise<NoteDto | null> => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (activeNoteIdRef.current === targetNoteId) {
          setSaveStatus("pending_sync");
        }
        return null;
      }

      if (activeNoteIdRef.current === targetNoteId) {
        setSaveStatus("saving");
      }

      try {
        const response = await apiFetch(`/api/notes/${targetNoteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: snapshot.title,
            content: snapshot.content,
            folderId: snapshot.folderId,
            isPinned: snapshot.isPinned,
            tags: snapshot.tags,
            updatedAt: baseUpdatedAt,
            idempotencyKey: crypto.randomUUID(),
          }),
        });

        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          data?: NoteMutationResult;
        } | null;

        if (!response.ok || payload?.ok !== true || !payload.data?.note) {
          if (activeNoteIdRef.current === targetNoteId) {
            setSaveStatus(response.status >= 500 ? "pending_sync" : "error");
          }
          return null;
        }

        const savedNote = payload.data.note;
        onSavedRef.current(savedNote);

        if (activeNoteIdRef.current === targetNoteId) {
          if (payload.data.conflictResolved === "server_newer") {
            applyServerNote(savedNote, true);
          } else {
            serverUpdatedAtRef.current = savedNote.updatedAt;
            const matchesCurrentDraft =
              draftRef.current.title === snapshot.title &&
              draftRef.current.content === snapshot.content &&
              draftRef.current.folderId === snapshot.folderId &&
              draftRef.current.isPinned === snapshot.isPinned &&
              draftRef.current.tags.join("|") === snapshot.tags.join("|");

            if (matchesCurrentDraft) {
              dirtyRef.current = false;
              setSaveStatus("saved");
            }
          }
        }

        return savedNote;
      } catch {
        if (activeNoteIdRef.current === targetNoteId) {
          setSaveStatus("pending_sync");
        }
        return null;
      }
    },
    [applyServerNote],
  );

  // Flush pending edits when switching to another note, then load the newly selected note.
  useEffect(() => {
    const previousNoteId = activeNoteIdRef.current;
    if (previousNoteId !== note.id) {
      clearPendingTimer();
      if (dirtyRef.current) {
        void persistSnapshot(
          previousNoteId,
          draftRef.current,
          serverUpdatedAtRef.current,
        );
      }

      activeNoteIdRef.current = note.id;
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
    } else if (!dirtyRef.current) {
      serverUpdatedAtRef.current = note.updatedAt;
      draftRef.current = toDraftSnapshot(note);
      setTitle(note.title);
      setContent(note.content);
      setFolderId(note.folderId);
      setIsPinned(note.isPinned);
      setTagNames(note.tags.map((item) => item.name));
      setTagLimitError(false);
    } else if (
      draftRef.current.folderId !== null &&
      !folders.some((item) => item.id === draftRef.current.folderId)
    ) {
      const fallbackFolderId =
        note.folderId !== null &&
        folders.some((item) => item.id === note.folderId)
          ? note.folderId
          : null;
      draftRef.current = {
        ...draftRef.current,
        folderId: fallbackFolderId,
      };
      setFolderId(fallbackFolderId);
    }
  }, [clearPendingTimer, folders, note, persistSnapshot]);

  useEffect(() => {
    const handleOnline = () => {
      if (!dirtyRef.current) {
        return;
      }
      clearPendingTimer();
      void persistSnapshot(
        activeNoteIdRef.current,
        draftRef.current,
        serverUpdatedAtRef.current,
      );
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [clearPendingTimer, persistSnapshot]);

  useEffect(() => {
    return () => {
      clearPendingTimer();
    };
  }, [clearPendingTimer]);

  const scheduleDebouncedSave = useCallback(
    (nextDraft: DraftSnapshot) => {
      draftRef.current = nextDraft;
      dirtyRef.current = true;
      setConflictNotice(false);
      setSaveStatus("saving");
      clearPendingTimer();

      const targetNoteId = activeNoteIdRef.current;
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void persistSnapshot(
          targetNoteId,
          draftRef.current,
          serverUpdatedAtRef.current,
        );
      }, AUTO_SAVE_DEBOUNCE_MS);
    },
    [clearPendingTimer, persistSnapshot],
  );

  const commitMetadataImmediately = useCallback(
    (nextDraft: DraftSnapshot) => {
      draftRef.current = nextDraft;
      dirtyRef.current = true;
      setConflictNotice(false);
      clearPendingTimer();
      void persistSnapshot(
        activeNoteIdRef.current,
        nextDraft,
        serverUpdatedAtRef.current,
      );
    },
    [clearPendingTimer, persistSnapshot],
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
    const targetNoteId = activeNoteIdRef.current;
    const wasDirtyBeforeToggle = dirtyRef.current;

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

    const nextDraft: DraftSnapshot = {
      ...draftRef.current,
      content: optimisticContent,
    };
    setContent(optimisticContent);
    draftRef.current = nextDraft;
    dirtyRef.current = true;
    setConflictNotice(false);

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setSaveStatus("pending_sync");
      return;
    }

    if (wasDirtyBeforeToggle) {
      await persistSnapshot(targetNoteId, nextDraft, serverUpdatedAtRef.current);
      return;
    }

    const baseUpdatedAt = serverUpdatedAtRef.current;
    setSaveStatus("saving");
    try {
      const response = await apiFetch(`/api/notes/${targetNoteId}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          index,
          checked,
          updatedAt: baseUpdatedAt,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: NoteMutationResult;
      } | null;

      if (!response.ok || payload?.ok !== true || !payload.data?.note) {
        if (activeNoteIdRef.current === targetNoteId) {
          setSaveStatus(response.status >= 500 ? "pending_sync" : "error");
        }
        return;
      }

      const updatedNote = payload.data.note;
      onSavedRef.current(updatedNote);

      if (activeNoteIdRef.current === targetNoteId) {
        if (payload.data.conflictResolved === "server_newer") {
          applyServerNote(updatedNote, true);
        } else {
          serverUpdatedAtRef.current = updatedNote.updatedAt;
          const matchesCurrentDraft =
            draftRef.current.content === optimisticContent &&
            draftRef.current.title === nextDraft.title &&
            draftRef.current.folderId === nextDraft.folderId &&
            draftRef.current.isPinned === nextDraft.isPinned &&
            draftRef.current.tags.join("|") === nextDraft.tags.join("|");

          if (matchesCurrentDraft) {
            dirtyRef.current = false;
            draftRef.current = toDraftSnapshot(updatedNote);
            setContent(updatedNote.content);
            setSaveStatus("saved");
          }
        }
      }
    } catch {
      if (activeNoteIdRef.current === targetNoteId) {
        setSaveStatus("pending_sync");
      }
    }
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
    dirtyRef.current = false;
    setDeleting(true);
    try {
      const response = await apiFetch(`/api/notes/${note.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: NoteDeleteResult;
      } | null;

      if (!response.ok || payload?.ok !== true || !payload.data) {
        setSaveStatus(response.status >= 500 ? "pending_sync" : "error");
        setDeleteModalOpen(false);
        return;
      }

      if (!payload.data.deleted) {
        if (payload.data.note) {
          applyServerNote(payload.data.note, true);
          onSavedRef.current(payload.data.note);
        } else {
          setSaveStatus("error");
        }
        setDeleteModalOpen(false);
        return;
      }

      setDeleteModalOpen(false);
      onDeleted(note.id);
    } catch {
      setSaveStatus("pending_sync");
      setDeleteModalOpen(false);
    } finally {
      setDeleting(false);
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
              onClick={onBack}
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

