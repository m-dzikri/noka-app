export type PendingSaveStatus = "saving" | "pending_sync" | "error";

export interface NoteDraftSnapshot {
  title: string;
  content: string;
  folderId: string | null;
  isPinned: boolean;
  tags: string[];
}

export interface PendingNoteDraft {
  noteId: string;
  snapshot: NoteDraftSnapshot;
  baseUpdatedAt: string;
  status: PendingSaveStatus;
  seq: number;
}

/**
 * Compares two note draft snapshots field-by-field for exact equality.
 */
export function areDraftSnapshotsEqual(
  a: NoteDraftSnapshot,
  b: NoteDraftSnapshot,
): boolean {
  if (
    a.title !== b.title ||
    a.content !== b.content ||
    a.folderId !== b.folderId ||
    a.isPinned !== b.isPinned ||
    a.tags.length !== b.tags.length
  ) {
    return false;
  }

  for (let index = 0; index < a.tags.length; index += 1) {
    if (a.tags[index] !== b.tags[index]) {
      return false;
    }
  }

  return true;
}

function parseIsoTimeMs(iso: string): number {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/**
 * Coordinates per-note serialized HTTP mutations, sequence ordering, LWW timestamps,
 * and uncommitted draft preservation across rapid note switching.
 */
export class NoteMutationCoordinator {
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly latestSeq = new Map<string, number>();
  private readonly queuedSeq = new Map<string, number>();
  private readonly knownUpdatedAt = new Map<string, string>();
  private readonly pendingDrafts = new Map<string, PendingNoteDraft>();
  private readonly deletedIds = new Set<string>();

  enqueue<T>(noteId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(noteId);
    const run = previous
      ? previous.catch(() => undefined).then(() => task())
      : Promise.resolve().then(() => task());
    const settled = run.catch(() => undefined);
    this.queues.set(noteId, settled);

    void settled.finally(() => {
      if (this.queues.get(noteId) === settled) {
        this.queues.delete(noteId);
      }
    });

    return run;
  }

  hasInFlight(noteId: string): boolean {
    return this.queues.has(noteId);
  }

  async waitForIdle(noteId: string): Promise<void> {
    while (true) {
      const pending = this.queues.get(noteId);
      if (!pending) {
        return;
      }
      await pending;
    }
  }

  hasPendingOrInFlight(noteId: string): boolean {
    return this.queues.has(noteId) || this.pendingDrafts.has(noteId);
  }

  getLatestSeq(noteId: string): number {
    return this.latestSeq.get(noteId) ?? 0;
  }

  isLatestSeq(noteId: string, seq: number): boolean {
    return this.getLatestSeq(noteId) === seq;
  }

  bumpSeq(noteId: string): number {
    const next = this.getLatestSeq(noteId) + 1;
    this.latestSeq.set(noteId, next);
    return next;
  }

  markSeqQueued(noteId: string, seq: number): void {
    const previous = this.queuedSeq.get(noteId) ?? 0;
    if (seq > previous) {
      this.queuedSeq.set(noteId, seq);
    }
  }

  isLatestSeqQueued(noteId: string): boolean {
    const latest = this.getLatestSeq(noteId);
    return latest > 0 && (this.queuedSeq.get(noteId) ?? 0) === latest;
  }

  seedKnownUpdatedAt(
    noteId: string,
    updatedAt: string,
    force = false,
  ): void {
    if (force) {
      this.knownUpdatedAt.set(noteId, updatedAt);
      return;
    }

    const existing = this.knownUpdatedAt.get(noteId);
    if (!existing || parseIsoTimeMs(updatedAt) > parseIsoTimeMs(existing)) {
      this.knownUpdatedAt.set(noteId, updatedAt);
    }
  }

  getKnownUpdatedAt(noteId: string): string | undefined {
    return this.knownUpdatedAt.get(noteId);
  }

  stagePendingDraft(
    noteId: string,
    snapshot: NoteDraftSnapshot,
    baseUpdatedAt: string,
    status: PendingSaveStatus,
  ): number {
    const seq = this.bumpSeq(noteId);
    this.pendingDrafts.set(noteId, {
      noteId,
      snapshot,
      baseUpdatedAt,
      status,
      seq,
    });
    return seq;
  }

  updatePendingDraftStatus(
    noteId: string,
    seq: number,
    status: PendingSaveStatus,
  ): void {
    const current = this.pendingDrafts.get(noteId);
    if (current && current.seq === seq) {
      this.pendingDrafts.set(noteId, {
        ...current,
        status,
      });
    }
  }

  reconcilePendingFolder(noteId: string, nextFolderId: string | null): void {
    const current = this.pendingDrafts.get(noteId);
    if (!current || current.snapshot.folderId === nextFolderId) {
      return;
    }

    this.pendingDrafts.set(noteId, {
      ...current,
      snapshot: {
        ...current.snapshot,
        folderId: nextFolderId,
      },
    });
  }

  clearPendingDraftIfLatest(noteId: string, seq: number): void {
    const current = this.pendingDrafts.get(noteId);
    if (current && current.seq === seq) {
      this.pendingDrafts.delete(noteId);
    }
  }

  clearPendingDraft(noteId: string): void {
    this.pendingDrafts.delete(noteId);
  }

  getPendingDraft(noteId: string): PendingNoteDraft | undefined {
    return this.pendingDrafts.get(noteId);
  }

  listPendingDrafts(): PendingNoteDraft[] {
    return [...this.pendingDrafts.values()];
  }

  markDeleted(noteId: string): void {
    this.deletedIds.add(noteId);
    this.bumpSeq(noteId);
    this.pendingDrafts.delete(noteId);
  }

  unmarkDeleted(noteId: string): void {
    this.deletedIds.delete(noteId);
  }

  isDeleted(noteId: string): boolean {
    return this.deletedIds.has(noteId);
  }

  clearNoteRuntime(noteId: string): void {
    this.pendingDrafts.delete(noteId);
    this.knownUpdatedAt.delete(noteId);
    this.queuedSeq.delete(noteId);
  }
}
