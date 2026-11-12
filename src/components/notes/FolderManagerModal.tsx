"use client";

import { useState, type FormEvent } from "react";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type {
  FolderDeleteResult,
  FolderDto,
  FolderMutationResult,
} from "@/features/notes/service";
import { apiFetch } from "@/lib/http-client";
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
      const response = await apiFetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; data: { folder: FolderDto } }
        | ApiErrorPayload
        | null;

      if (
        !response.ok ||
        !payload ||
        !("ok" in payload) ||
        payload.ok !== true ||
        !payload.data?.folder
      ) {
        setErrorMsg(
          resolveFolderErrorMessage(t, payload as ApiErrorPayload | null),
        );
        return;
      }

      const nextFolders = [...folders, payload.data.folder].sort((a, b) =>
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
      const response = await apiFetch(`/api/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; data: FolderMutationResult }
        | ApiErrorPayload
        | null;

      if (
        !response.ok ||
        !payload ||
        !("ok" in payload) ||
        payload.ok !== true ||
        !payload.data?.folder
      ) {
        setErrorMsg(
          resolveFolderErrorMessage(t, payload as ApiErrorPayload | null),
        );
        return;
      }

      const nextFolders = folders
        .map((item) => (item.id === folderId ? payload.data.folder : item))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );
      setEditingId(null);
      setEditingName("");
      if (payload.data.conflictResolved === "server_newer") {
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
      const response = await apiFetch(`/api/folders/${folderId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; data: FolderDeleteResult }
        | ApiErrorPayload
        | null;

      if (
        !response.ok ||
        !payload ||
        !("ok" in payload) ||
        payload.ok !== true ||
        !payload.data
      ) {
        setErrorMsg(
          resolveFolderErrorMessage(t, payload as ApiErrorPayload | null),
        );
        return;
      }

      if (!payload.data.deleted) {
        if (payload.data.folder) {
          const nextFolders = folders
            .map((item) => (item.id === folderId ? payload.data.folder! : item))
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

