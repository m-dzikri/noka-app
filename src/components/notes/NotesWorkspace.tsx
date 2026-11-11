"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FileText,
  FolderCog,
  Pin,
  Plus,
  Search,
  Tag,
  X,
} from "lucide-react";
import { FolderManagerModal } from "@/components/notes/FolderManagerModal";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { Button } from "@/components/ui/Button";
import type {
  FolderDto,
  NoteDto,
  NoteListResult,
  TagDto,
} from "@/features/notes/service";
import { apiFetch } from "@/lib/http-client";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

export interface NotesWorkspaceProps {
  initialNotes: NoteDto[];
  initialNextCursor: string | null;
  initialHasMore?: boolean;
  initialFolders: FolderDto[];
  initialTags: TagDto[];
  renderAttachmentsSlot?: (note: NoteDto) => ReactNode;
  renderLinkedTransactionsSlot?: (note: NoteDto) => ReactNode;
}

const SEARCH_DEBOUNCE_MS = 180;

type FolderFilter = "all" | "unfiled" | string;

function sortNotesPinnedFirst(list: NoteDto[]): NoteDto[] {
  return [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    const timeDiff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return b.id.localeCompare(a.id);
  });
}

function noteMatchesActiveFilters(
  note: NoteDto,
  searchQuery: string,
  folderFilter: FolderFilter,
  tagFilter: string,
  pinnedOnly: boolean,
): boolean {
  if (pinnedOnly && !note.isPinned) {
    return false;
  }

  if (folderFilter === "unfiled" && note.folderId !== null) {
    return false;
  }

  if (
    folderFilter !== "all" &&
    folderFilter !== "unfiled" &&
    note.folderId !== folderFilter
  ) {
    return false;
  }

  if (tagFilter && !note.tags.some((item) => item.id === tagFilter)) {
    return false;
  }

  const trimmedQ = searchQuery.trim().toLowerCase();
  if (trimmedQ) {
    const matchesTitle = note.title.toLowerCase().includes(trimmedQ);
    const matchesContent = note.content.toLowerCase().includes(trimmedQ);
    const matchesTag = note.tags.some((item) =>
      item.name.toLowerCase().includes(trimmedQ),
    );
    if (!matchesTitle && !matchesContent && !matchesTag) {
      return false;
    }
  }

  return true;
}

function buildContentExcerpt(content: string): string {
  const plain = content.replace(/\s+/g, " ").trim();
  return plain.length > 96 ? `${plain.slice(0, 96)}...` : plain;
}

/**
 * Responsive Notes Workspace: desktop split list+editor, mobile list->detail navigation, instant search & filters.
 */
export function NotesWorkspace({
  initialNotes,
  initialNextCursor,
  initialHasMore,
  initialFolders,
  initialTags,
  renderAttachmentsSlot,
  renderLinkedTransactionsSlot,
}: NotesWorkspaceProps) {
  const router = useRouter();
  const { t } = useI18n();

  const [notesList, setNotesList] = useState<NoteDto[]>(initialNotes);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState<boolean>(
    initialHasMore ?? Boolean(initialNextCursor),
  );
  const [foldersList, setFoldersList] = useState<FolderDto[]>(initialFolders);
  const [tagsList, setTagsList] = useState<TagDto[]>(initialTags);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    initialNotes[0]?.id ?? null,
  );

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);

  const [creatingNote, setCreatingNote] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const hasFilterInteractionRef = useRef(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);

  const buildNotesQueryString = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      params.set("limit", "50");

      const trimmed = debouncedQuery.trim();
      if (trimmed) {
        params.set("q", trimmed);
      }

      if (folderFilter !== "all") {
        params.set("folderId", folderFilter);
      }

      if (tagFilter) {
        params.set("tagId", tagFilter);
      }

      if (pinnedOnly) {
        params.set("pinned", "true");
      }

      if (cursor) {
        params.set("cursor", cursor);
      }

      return params.toString();
    },
    [debouncedQuery, folderFilter, pinnedOnly, tagFilter],
  );

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current !== null) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const refreshTagsAndFolders = useCallback(async () => {
    try {
      const [tagsRes, foldersRes] = await Promise.all([
        apiFetch("/api/tags"),
        apiFetch("/api/folders"),
      ]);

      if (tagsRes.ok) {
        const tagsPayload = (await tagsRes.json().catch(() => null)) as {
          ok?: boolean;
          data?: { tags?: TagDto[] };
        } | null;
        if (tagsPayload?.ok && tagsPayload.data?.tags) {
          const nextTags = tagsPayload.data.tags;
          setTagsList(nextTags);
          setTagFilter((prev) =>
            prev && !nextTags.some((item) => item.id === prev) ? "" : prev,
          );
        }
      }

      if (foldersRes.ok) {
        const foldersPayload = (await foldersRes.json().catch(() => null)) as {
          ok?: boolean;
          data?: { folders?: FolderDto[] };
        } | null;
        if (foldersPayload?.ok && foldersPayload.data?.folders) {
          setFoldersList(foldersPayload.data.folders);
        }
      }
    } catch {
      // Keep current cached folders/tags silently during transient offline state.
    }
  }, []);

  const handleSearchChange = (value: string) => {
    hasFilterInteractionRef.current = true;
    setSearchInput(value);
    if (searchTimeoutRef.current !== null) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchTimeoutRef.current = null;
      setDebouncedQuery(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  useEffect(() => {
    if (!hasFilterInteractionRef.current) {
      return;
    }

    const currentFetchId = ++fetchIdRef.current;

    const runFetch = async () => {
      try {
        const response = await apiFetch(
          `/api/notes?${buildNotesQueryString(null)}`,
        );
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          data?: NoteListResult;
        } | null;

        if (currentFetchId !== fetchIdRef.current) {
          return;
        }

        if (!response.ok || payload?.ok !== true || !payload.data) {
          setErrorBanner(t.errors.generic);
          return;
        }

        setErrorBanner(null);
        setNotesList(payload.data.notes);
        setNextCursor(payload.data.nextCursor);
        setHasMore(payload.data.hasMore);
        setSelectedNoteId((prev) =>
          prev && payload.data!.notes.some((item) => item.id === prev)
            ? prev
            : (payload.data!.notes[0]?.id ?? null),
        );
      } catch {
        if (currentFetchId === fetchIdRef.current) {
          setErrorBanner(t.errors.generic);
        }
      }
    };

    void runFetch();
  }, [buildNotesQueryString, t.errors.generic]);

  const handleCreateNote = async () => {
    setCreatingNote(true);
    setErrorBanner(null);

    try {
      const targetFolderId =
        folderFilter !== "all" && folderFilter !== "unfiled"
          ? folderFilter
          : null;

      const response = await apiFetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "",
          content: "",
          folderId: targetFolderId,
          tags: [],
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: NoteDto;
      } | null;

      if (!response.ok || payload?.ok !== true || !payload.data) {
        setErrorBanner(t.errors.generic);
        return;
      }

      const created = payload.data;
      setNotesList((prev) => sortNotesPinnedFirst([created, ...prev]));
      setSelectedNoteId(created.id);
      void refreshTagsAndFolders();

      const isMobileViewport =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 1023px)").matches;

      if (isMobileViewport) {
        router.push(`/app/notes/${created.id}`);
      }
    } catch {
      setErrorBanner(t.errors.generic);
    } finally {
      setCreatingNote(false);
    }
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const response = await apiFetch(
        `/api/notes?${buildNotesQueryString(nextCursor)}`,
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: NoteListResult;
      } | null;

      if (!response.ok || payload?.ok !== true || !payload.data) {
        setErrorBanner(t.errors.generic);
        return;
      }

      setNotesList((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const appended = payload.data!.notes.filter(
          (item) => !seen.has(item.id),
        );
        return [...prev, ...appended];
      });
      setNextCursor(payload.data.nextCursor);
      setHasMore(payload.data.hasMore);
    } catch {
      setErrorBanner(t.errors.generic);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleNoteSaved = useCallback(
    (updated: NoteDto) => {
      setNotesList((prev) => {
        const replaced = prev.map((item) =>
          item.id === updated.id ? updated : item,
        );
        const filtered = replaced.filter((item) =>
          noteMatchesActiveFilters(
            item,
            debouncedQuery,
            folderFilter,
            tagFilter,
            pinnedOnly,
          ),
        );
        return sortNotesPinnedFirst(filtered);
      });
      void refreshTagsAndFolders();
    },
    [
      debouncedQuery,
      folderFilter,
      pinnedOnly,
      refreshTagsAndFolders,
      tagFilter,
    ],
  );

  const handleNoteDeleted = useCallback(
    (deletedId: string) => {
      setNotesList((prev) => {
        const remaining = prev.filter((item) => item.id !== deletedId);
        setSelectedNoteId((current) =>
          current === deletedId ? (remaining[0]?.id ?? null) : current,
        );
        return remaining;
      });
      void refreshTagsAndFolders();
    },
    [refreshTagsAndFolders],
  );

  const handleFoldersChanged = useCallback(
    (nextFolders: FolderDto[], deletedFolderId?: string) => {
      setFoldersList(nextFolders);

      if (deletedFolderId) {
        if (folderFilter === deletedFolderId) {
          hasFilterInteractionRef.current = true;
          setFolderFilter("all");
        }
        setNotesList((prev) =>
          prev.map((item) =>
            item.folderId === deletedFolderId
              ? { ...item, folderId: null, folderName: null }
              : item,
          ),
        );
      } else {
        const nameById = new Map(nextFolders.map((f) => [f.id, f.name]));
        setNotesList((prev) =>
          prev.map((item) =>
            item.folderId && nameById.has(item.folderId)
              ? { ...item, folderName: nameById.get(item.folderId) ?? null }
              : item,
          ),
        );
      }
    },
    [folderFilter],
  );

  const selectedNote =
    notesList.find((item) => item.id === selectedNoteId) ?? null;

  const hasActiveFilters =
    Boolean(debouncedQuery.trim()) ||
    folderFilter !== "all" ||
    Boolean(tagFilter) ||
    pinnedOnly;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3.5 shadow-[var(--shadow-sm)] sm:px-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
            {t.notes.workspaceTitle}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] sm:text-sm">
            {t.notes.workspaceSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            shape="pill"
            variant="secondary"
            size="sm"
            onClick={() => setFolderModalOpen(true)}
          >
            <FolderCog className="h-4 w-4" aria-hidden="true" />
            <span>{t.folders.manageButton}</span>
          </Button>
          <Button
            shape="pill"
            variant="primary"
            size="sm"
            loading={creatingNote}
            onClick={() => void handleCreateNote()}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>
              {creatingNote ? t.notes.creatingNote : t.notes.newNoteButton}
            </span>
          </Button>
        </div>
      </div>

      {errorBanner ? (
        <div
          role="alert"
          className="rounded-xl border border-[var(--status-expense)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--status-expense)]"
        >
          {errorBanner}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <aside className="flex flex-col gap-3 lg:col-span-5 xl:col-span-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-sm)]">
            <div className="relative">
              <label htmlFor="notes-search-input" className="sr-only">
                {t.notes.searchLabel}
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <input
                id="notes-search-input"
                type="search"
                value={searchInput}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder={t.notes.searchPlaceholder}
                className="min-h-10 w-full rounded-full border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 py-2 pr-9 pl-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:bg-[var(--bg-surface)]"
              />
              {searchInput ? (
                <button
                  type="button"
                  aria-label={t.notes.clearSearch}
                  onClick={() => handleSearchChange("")}
                  className="absolute top-1/2 right-2.5 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-pressed={folderFilter === "all"}
                onClick={() => {
                  hasFilterInteractionRef.current = true;
                  setFolderFilter("all");
                }}
                className={cn(
                  "min-h-8 cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  folderFilter === "all"
                    ? "bg-[var(--accent-primary)] text-[var(--accent-foreground)]"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                {t.notes.filterAllNotes}
              </button>

              <button
                type="button"
                aria-pressed={folderFilter === "unfiled"}
                onClick={() => {
                  hasFilterInteractionRef.current = true;
                  setFolderFilter("unfiled");
                }}
                className={cn(
                  "min-h-8 cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  folderFilter === "unfiled"
                    ? "bg-[var(--accent-primary)] text-[var(--accent-foreground)]"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                {t.notes.filterUnfiled}
              </button>

              {foldersList.map((folder) => {
                const isActive = folderFilter === folder.id;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      hasFilterInteractionRef.current = true;
                      setFolderFilter(folder.id);
                    }}
                    className={cn(
                      "min-h-8 max-w-full cursor-pointer truncate rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-[var(--accent-primary)] text-[var(--accent-foreground)]"
                        : "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {folder.name}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                aria-pressed={pinnedOnly}
                onClick={() => {
                  hasFilterInteractionRef.current = true;
                  setPinnedOnly((prev) => !prev);
                }}
                className={cn(
                  "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  pinnedOnly
                    ? "bg-[var(--accent-primary)] text-[var(--accent-foreground)]"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.notes.filterPinnedOnly}</span>
              </button>

              <div className="flex items-center gap-1.5">
                <Tag
                  className="h-3.5 w-3.5 text-[var(--text-muted)]"
                  aria-hidden="true"
                />
                <label htmlFor="notes-tag-filter" className="sr-only">
                  {t.notes.filterByTagLabel}
                </label>
                <select
                  id="notes-tag-filter"
                  value={tagFilter}
                  onChange={(event) => {
                    hasFilterInteractionRef.current = true;
                    setTagFilter(event.target.value);
                  }}
                  className="min-h-8 rounded-full border border-[var(--border-default)] bg-[var(--bg-subtle)] px-3 py-1 text-xs font-medium text-[var(--text-primary)]"
                >
                  <option value="">{t.notes.filterAllTags}</option>
                  {tagsList.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      #{tag.name} ({tag.noteCount})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {notesList.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-8 text-center">
              <FileText
                className="h-8 w-8 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t.notes.emptyListTitle}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {hasActiveFilters
                  ? t.notes.emptyFilterDescription
                  : t.notes.emptyListDescription}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {notesList.map((note) => {
                const isSelected = selectedNote?.id === note.id;
                const displayTitle =
                  note.title.trim() || t.notes.untitledNote;
                const excerpt = buildContentExcerpt(note.content);

                return (
                  <li key={note.id}>
                    <Link
                      href={`/app/notes/${note.id}`}
                      onClick={(event) => {
                        const isDesktop =
                          typeof window !== "undefined" &&
                          typeof window.matchMedia === "function" &&
                          window.matchMedia("(min-width: 1024px)").matches;
                        if (isDesktop) {
                          event.preventDefault();
                          setSelectedNoteId(note.id);
                        }
                      }}
                      aria-current={isSelected ? "true" : undefined}
                      className={cn(
                        "flex flex-col gap-1.5 rounded-2xl border p-3.5 transition-colors",
                        isSelected
                          ? "border-[var(--accent-primary)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]"
                          : "border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                          {displayTitle}
                        </h2>
                        {note.isPinned ? (
                          <Pin
                            className="h-3.5 w-3.5 shrink-0 text-[var(--accent-text)]"
                            aria-label={t.notes.pinnedLabel}
                          />
                        ) : null}
                      </div>

                      {excerpt ? (
                        <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">
                          {excerpt}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {note.folderName ? (
                          <span className="inline-flex items-center rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                            {note.folderName}
                          </span>
                        ) : null}

                        {note.checklistTotal > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                            {note.checklistCompleted}/{note.checklistTotal}
                          </span>
                        ) : null}

                        {note.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                          >
                            #{tag.name}
                          </span>
                        ))}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {hasMore ? (
            <Button
              shape="pill"
              variant="secondary"
              loading={loadingMore}
              onClick={() => void handleLoadMore()}
              className="w-full"
            >
              {loadingMore ? t.notes.loadingMore : t.notes.loadMoreButton}
            </Button>
          ) : null}
        </aside>

        <div className="hidden lg:block lg:col-span-7 xl:col-span-8">
          {selectedNote ? (
            <NoteEditor
              note={selectedNote}
              folders={foldersList}
              onSaved={handleNoteSaved}
              onDeleted={handleNoteDeleted}
              onOpenFolderManager={() => setFolderModalOpen(true)}
              renderAttachmentsSlot={renderAttachmentsSlot}
              renderLinkedTransactionsSlot={renderLinkedTransactionsSlot}
            />
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center">
              <FileText
                className="h-10 w-10 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {t.notes.selectNotePromptTitle}
              </h2>
              <p className="max-w-md text-sm text-[var(--text-secondary)]">
                {t.notes.selectNotePromptDescription}
              </p>
              <Button
                shape="pill"
                variant="primary"
                loading={creatingNote}
                onClick={() => void handleCreateNote()}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>{t.notes.newNoteButton}</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      <FolderManagerModal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        folders={foldersList}
        onFoldersChanged={handleFoldersChanged}
      />
    </div>
  );
}

