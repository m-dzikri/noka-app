"use client";

import { useState, type FormEvent } from "react";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useOptionalSync } from "@/components/providers/SyncProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type {
  FolderDeleteResult,
  FolderDto,
  FolderMutationResult,
} from "@/features/notes/service";
import {
  buildOptimisticFolderDto,
  executeOfflineCapableMutation,
} from "@/features/sync/client-api";
import { useI18n } from "@/lib/i18n/context";

export interface FolderManagerModalProps {
  open: boolean;
  onClose: () => void;
  folders: FolderDto[];
  onFoldersChanged: (
    nextFolders: FolderDto[],
    deletedFolderId?: string,
  ) => void;
}

interface ApiErrorPayload {
  ok?: false;
  error?: {
    code?: string;
    message?: string;
  };
}

function resolveFolderErrorMessage(
  t: ReturnType<typeof useI18n>["t"],
  payload: ApiErrorPayload | null,
): string {
  const code = payload?.error?.code;
  if (code && code in t.errors) {
    return t.errors[code as keyof typeof t.errors];
  }
  return t.errors.generic;
}

/**
 * Accessible modal for creating, renaming, and safely deleting note folders (F8, DATA-4).
 */
export function FolderManagerModal({
  open,
  onClose,
  folders,
  onFoldersChanged,
}: FolderManagerModalProps) {
  const { t } = useI18n();
  const sync = useOptionalSync();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setErrorMsg(t.folders.folderNameRequired);
      return;
    }

    setCreating(true);
    setErrorMsg(null);
    try {
      const folderId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const optimisticFolder = buildOptimisticFolderDto({
        id: folderId,
        name: trimmed,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      const idempotencyKey = crypto.randomUUID();
      const outcome = await executeOfflineCapableMutation<{
        folder: FolderDto;
      }>(sync, {
        entity: "folder",
        entityId: folderId,
        op: "upsert",
        method: "POST",
        path: "/api/folders",
        idempotencyKey,
        body: {
          id: folderId,
          name: trimmed,
          updatedAt: nowIso,
          idempotencyKey,
        },
        updatedAt: nowIso,
        optimisticSnapshot: {
          kind: "folder_upsert",
          folder: optimisticFolder,
        },
      });

      if (outcome.mode === "queued") {
        const nextFolders = [...folders, optimisticFolder].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );
        setNewName("");
        onFoldersChanged(nextFolders);
        return;
      }

      if (outcome.errorStatus !== undefined || !outcome.data?.folder) {
        setErrorMsg(
          resolveFolderErrorMessage(
            t,
            (outcome.errorPayload as ApiErrorPayload | null) ?? null,
          ),
        );
        return;
      }

      const nextFolders = [...folders, outcome.data.folder].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
      setNewName("");
      onFoldersChanged(nextFolders);
    } catch {
      setErrorMsg(t.errors.generic);
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (folderId: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setErrorMsg(t.folders.folderNameRequired);
      return;
    }

    setBusyId(folderId);
    setErrorMsg(null);
    try {
      const existingFolder = folders.find((item) => item.id === folderId);
      const nowIso = new Date().toISOString();
      const optimisticFolder = buildOptimisticFolderDto({
        id: folderId,
        name: trimmed,
        noteCount: existingFolder?.noteCount ?? 0,
        createdAt: existingFolder?.createdAt ?? nowIso,
        updatedAt: nowIso,
      });

      const idempotencyKey = crypto.randomUUID();
      const outcome = await executeOfflineCapableMutation<FolderMutationResult>(
        sync,
        {
          entity: "folder",
          entityId: folderId,
          op: "upsert",
          method: "PATCH",
          path: `/api/folders/${folderId}`,
          idempotencyKey,
          body: {
            name: trimmed,
            updatedAt: nowIso,
            idempotencyKey,
          },
          updatedAt: nowIso,
          optimisticSnapshot: {
            kind: "folder_upsert",
            folder: optimisticFolder,
          },
        },
      );

      if (outcome.mode === "queued") {
        const nextFolders = folders
          .map((item) => (item.id === folderId ? optimisticFolder : item))
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
          );
        setEditingId(null);
        setEditingName("");
        onFoldersChanged(nextFolders);
        return;
      }

      if (outcome.errorStatus !== undefined || !outcome.data?.folder) {
        setErrorMsg(
          resolveFolderErrorMessage(
            t,
            (outcome.errorPayload as ApiErrorPayload | null) ?? null,
          ),
        );
        return;
      }

      const serverFolder = outcome.data.folder;
      const nextFolders = folders
        .map((item) => (item.id === folderId ? serverFolder : item))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );
      setEditingId(null);
      setEditingName("");
      if (outcome.data.conflictResolved === "server_newer") {
        setErrorMsg(t.notes.conflictServerWinsNotice);
      }
      onFoldersChanged(nextFolders);
    } catch {
      setErrorMsg(t.errors.generic);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (folderId: string) => {
    setBusyId(folderId);
    setErrorMsg(null);
    try {
      const deletedAtIso = new Date().toISOString();
      const idempotencyKey = crypto.randomUUID();
      const outcome = await executeOfflineCapableMutation<FolderDeleteResult>(
        sync,
        {
          entity: "folder",
          entityId: folderId,
          op: "delete",
          method: "DELETE",
          path: `/api/folders/${folderId}`,
          idempotencyKey,
          body: { updatedAt: deletedAtIso, idempotencyKey },
          updatedAt: deletedAtIso,
          optimisticSnapshot: {
            kind: "folder_delete",
            id: folderId,
            deletedAt: deletedAtIso,
          },
        },
      );

      if (outcome.mode === "queued") {
        const nextFolders = folders.filter((item) => item.id !== folderId);
        if (editingId === folderId) {
          setEditingId(null);
        }
        onFoldersChanged(nextFolders, folderId);
        return;
      }

      if (outcome.errorStatus !== undefined || !outcome.data) {
        setErrorMsg(
          resolveFolderErrorMessage(
            t,
            (outcome.errorPayload as ApiErrorPayload | null) ?? null,
          ),
        );
        return;
      }

      if (!outcome.data.deleted) {
        if (outcome.data.folder) {
          const restored = outcome.data.folder;
          const nextFolders = folders
            .map((item) => (item.id === folderId ? restored : item))
            .sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
            );
          onFoldersChanged(nextFolders);
        }
        setErrorMsg(t.notes.conflictServerWinsNotice);
        return;
      }

      const nextFolders = folders.filter((item) => item.id !== folderId);
      if (editingId === folderId) {
        setEditingId(null);
      }
      onFoldersChanged(nextFolders, folderId);
    } catch {
      setErrorMsg(t.errors.generic);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.folders.modalTitle}
      description={t.folders.modalDescription}
    >
      <div className="flex flex-col gap-4">
        {errorMsg ? (
          <div
            role="alert"
            className="rounded-xl border border-[var(--status-expense)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--status-expense)]"
          >
            {errorMsg}
          </div>
        ) : null}

        <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label={t.folders.newFolderLabel}
              placeholder={t.folders.newFolderPlaceholder}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={80}
            />
          </div>
          <Button
            type="submit"
            shape="pill"
            loading={creating}
            className="shrink-0"
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            <span>
              {creating ? t.folders.creatingButton : t.folders.createButton}
            </span>
          </Button>
        </form>

        <p className="rounded-xl bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          {t.folders.deleteNotice}
        </p>

        {folders.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">
            {t.folders.emptyTitle}
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
            {folders.map((folder) => {
              const isEditing = editingId === folder.id;
              const isBusy = busyId === folder.id;

              return (
                <li
                  key={folder.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 px-3 py-2"
                >
                  {isEditing ? (
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <Input
                        aria-label={t.folders.newFolderLabel}
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        maxLength={80}
                        className="min-h-9"
                      />
                      <Button
                        size="sm"
                        shape="pill"
                        loading={isBusy}
                        onClick={() => void handleRename(folder.id)}
                      >
                        {t.folders.saveRenameButton}
                      </Button>
                      <Button
                        size="sm"
                        shape="pill"
                        variant="ghost"
                        disabled={isBusy}
                        onClick={() => {
                          setEditingId(null);
                          setEditingName("");
                        }}
                      >
                        {t.common.cancel}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                          {folder.name}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {t.notes.noteCountSummary.replace(
                            "{count}",
                            String(folder.noteCount),
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          shape="pill"
                          variant="secondary"
                          disabled={isBusy}
                          aria-label={`${t.folders.renameButton} ${folder.name}`}
                          onClick={() => {
                            setEditingId(folder.id);
                            setEditingName(folder.name);
                            setErrorMsg(null);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t.folders.renameButton}</span>
                        </Button>
                        <Button
                          size="sm"
                          shape="pill"
                          variant="danger"
                          loading={isBusy}
                          aria-label={`${t.folders.deleteButton} ${folder.name}`}
                          onClick={() => void handleDelete(folder.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t.folders.deleteButton}</span>
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

