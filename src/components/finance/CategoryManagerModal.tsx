"use client";

import { useState, type FormEvent } from "react";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import {
  dispatchFinanceUpdated,
  readJsonSafe,
  resolveFinanceErrorMessage,
  type ApiErrorPayload,
} from "@/components/finance/finance-client-helpers";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type { CategoryDto } from "@/features/finance/categories-service";
import type { FinanceEntryType } from "@/features/finance/schemas";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";

export interface CategoryManagerModalProps {
  open: boolean;
  onClose: () => void;
  categories: CategoryDto[];
  onMutated: () => Promise<void> | void;
}

function CategoryManagerBody({
  categories,
  onMutated,
}: Pick<CategoryManagerModalProps, "categories" | "onMutated">) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [type, setType] = useState<FinanceEntryType>("expense");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingUpdatedAt, setEditingUpdatedAt] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleCreateCategory(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg(t.finance.categoryModal.nameRequiredError);
      return;
    }

    setCreating(true);
    setErrorMsg(null);

    try {
      const response = await apiFetch("/api/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          name: trimmed,
          type,
        }),
      });

      if (!response.ok) {
        const errPayload = await readJsonSafe<ApiErrorPayload>(response);
        setErrorMsg(resolveFinanceErrorMessage(t, errPayload));
        return;
      }

      setName("");
      await onMutated();
      dispatchFinanceUpdated();
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveRename(categoryId: string): Promise<void> {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setErrorMsg(t.finance.categoryModal.nameRequiredError);
      return;
    }

    setBusyId(categoryId);
    setErrorMsg(null);

    try {
      const response = await apiFetch(`/api/categories/${categoryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          name: trimmed,
          updatedAt: editingUpdatedAt,
        }),
      });

      if (!response.ok) {
        const errPayload = await readJsonSafe<ApiErrorPayload>(response);
        setErrorMsg(resolveFinanceErrorMessage(t, errPayload));
        return;
      }

      setEditingId(null);
      setEditingName("");
      await onMutated();
      dispatchFinanceUpdated();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteCategory(category: CategoryDto): Promise<void> {
    setBusyId(category.id);
    setErrorMsg(null);

    try {
      const response = await apiFetch(`/api/categories/${category.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          updatedAt: category.updatedAt,
        }),
      });

      if (!response.ok) {
        const errPayload = await readJsonSafe<ApiErrorPayload>(response);
        setErrorMsg(resolveFinanceErrorMessage(t, errPayload));
        return;
      }

      await onMutated();
      dispatchFinanceUpdated();
    } finally {
      setBusyId(null);
    }
  }

  const filteredCategories = categories.filter((c) => c.type === type);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex gap-2"
        role="tablist"
        aria-label={t.finance.categoryModal.typeLabel}
      >
        <Button
          size="sm"
          variant={type === "expense" ? "primary" : "secondary"}
          role="tab"
          aria-selected={type === "expense"}
          onClick={() => setType("expense")}
        >
          {t.finance.filters.expense}
        </Button>
        <Button
          size="sm"
          variant={type === "income" ? "primary" : "secondary"}
          role="tab"
          aria-selected={type === "income"}
          onClick={() => setType("income")}
        >
          {t.finance.filters.income}
        </Button>
      </div>

      {errorMsg ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--status-expense)]/40 bg-[var(--bg-subtle)] px-3.5 py-2.5 text-sm text-[var(--status-expense)]"
        >
          {errorMsg}
        </p>
      ) : null}

      <form
        onSubmit={handleCreateCategory}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <Input
            label={t.finance.categoryModal.nameLabel}
            placeholder={t.finance.categoryModal.namePlaceholder}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" loading={creating}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>
            {creating
              ? t.finance.categoryModal.creatingButton
              : t.finance.categoryModal.createButton}
          </span>
        </Button>
      </form>

      <p className="text-xs text-[var(--text-muted)]">
        {t.finance.categoryModal.migrateNotice}
      </p>

      <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
        {filteredCategories.map((category) => {
          const isEditing = editingId === category.id;
          return (
            <li
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5"
            >
              {isEditing ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <Input
                    aria-label={t.finance.categoryModal.nameLabel}
                    value={editingName}
                    maxLength={60}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="min-w-0 flex-1"
                  />
                  <Button
                    size="sm"
                    loading={busyId === category.id}
                    onClick={() => void handleSaveRename(category.id)}
                  >
                    {t.finance.categoryModal.saveRenameButton}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
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
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {category.name}
                    </span>
                    {category.isSystem ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        {t.finance.categoryModal.systemLockedBadge}
                      </span>
                    ) : null}
                  </div>

                  {category.isSystem ? null : (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === category.id}
                        onClick={() => {
                          setEditingId(category.id);
                          setEditingName(category.name);
                          setEditingUpdatedAt(category.updatedAt);
                          setErrorMsg(null);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t.finance.categoryModal.renameButton}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={busyId === category.id}
                        onClick={() => void handleDeleteCategory(category)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t.finance.categoryModal.deleteButton}</span>
                      </Button>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Accessible modal for managing income/expense categories while locking system categories and migrating deletes to Other (F11, DATA-4).
 */
export function CategoryManagerModal({
  open,
  onClose,
  categories,
  onMutated,
}: CategoryManagerModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.finance.categoryModal.title}
      description={t.finance.categoryModal.description}
      className="max-w-lg"
    >
      {open ? (
        <CategoryManagerBody categories={categories} onMutated={onMutated} />
      ) : null}
    </Modal>
  );
}
