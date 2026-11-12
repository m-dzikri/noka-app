import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import { categories, transactions, wallets } from "@/db/schema/finance";
import { noteAttachments, tags } from "@/db/schema/notes";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { DELETE as folderDelete, PATCH as folderPatch } from "@/app/api/folders/[id]/route";
import { GET as foldersGet, POST as foldersPost } from "@/app/api/folders/route";
import { PATCH as checklistPatch } from "@/app/api/notes/[id]/checklist/route";
import {
  DELETE as noteDelete,
  GET as noteGet,
  PATCH as notePatch,
} from "@/app/api/notes/[id]/route";
import { GET as notesGet, POST as notesPost } from "@/app/api/notes/route";
import { GET as tagsGet } from "@/app/api/tags/route";
import { registerNoteDeleteCleanup } from "@/features/notes/service";

const createdUserIds: string[] = [];

function extractSessionCookie(response: Response): string {
  const headers = response.headers as unknown as {
    getSetCookie?: () => string[];
  };
  const setCookies = headers.getSetCookie
    ? headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];

  for (const raw of setCookies) {
    if (raw.startsWith("noka_session=")) {
      return raw.split(";")[0] ?? "";
    }
  }
  throw new Error("Missing noka_session cookie on register response");
}

function makeAuthedRequest(
  url: string,
  method: string,
  cookie: string,
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      origin: "http://localhost:3000",
      cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });
}

function makePlainRequest(
  url: string,
  method: string,
  headers: Record<string, string> = {},
  body?: unknown,
): NextRequest {
  return new NextRequest(url, {
    method,
    headers,
    ...(body !== undefined
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });
}

async function createRegisteredUser(label: string): Promise<{
  userId: string;
  cookie: string;
}> {
  const req = new NextRequest("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: label,
      email: `${label.toLowerCase()}-${crypto.randomUUID()}@noka.test`,
      password: "password1234",
      locale: "id",
      theme: "light",
    }),
  });

  const res = await registerPost(req);
  expect(res.status).toBe(201);
  const json = (await res.json()) as {
    ok: true;
    data: { user: { id: string } };
  };
  createdUserIds.push(json.data.user.id);

  return {
    userId: json.data.user.id,
    cookie: extractSessionCookie(res),
  };
}

describe("Notes, folders, tags, GFM checklist & referential integrity API (TS-004-03)", () => {
  afterEach(async () => {
    const { clearRateLimitsForTest } = await import("@/lib/rate-limit");
    clearRateLimitsForTest();
    vi.restoreAllMocks();

    if (createdUserIds.length > 0) {
      await getDb()
        .delete(users)
        .where(inArray(users.id, [...createdUserIds]));
      createdUserIds.length = 0;
    }
  });

  it("enforces folder uniqueness (409), folder deletion -> Unfiled, note CRUD, LWW, and user isolation", async () => {
    const alice = await createRegisteredUser("Alice");
    const bob = await createRegisteredUser("Bob");

    // 1. Folder CRUD + case-insensitive 409 conflict
    const createFolderRes = await foldersPost(
      makeAuthedRequest(
        "http://localhost:3000/api/folders",
        "POST",
        alice.cookie,
        { name: "Skripsi", idempotencyKey: `f-${crypto.randomUUID()}` },
      ),
    );
    expect(createFolderRes.status).toBe(201);
    const folderJson = (await createFolderRes.json()) as {
      ok: true;
      data: { folder: { id: string; name: string } };
    };
    const folderId = folderJson.data.folder.id;

    const dupFolderRes = await foldersPost(
      makeAuthedRequest(
        "http://localhost:3000/api/folders",
        "POST",
        alice.cookie,
        { name: "skripsi" },
      ),
    );
    expect(dupFolderRes.status).toBe(409);

    // 2. Bob cannot attach Alice's folderId when creating a note
    const crossFolderRes = await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        bob.cookie,
        { title: "Hack", content: "x", folderId },
      ),
    );
    expect(crossFolderRes.status).toBe(404);
    const crossFolderJson = (await crossFolderRes.json()) as {
      ok: false;
      error: { code: string };
    };
    expect(crossFolderJson.error.code).toBe("FOLDER_NOT_FOUND");

    // 3. Alice creates note with folder + tags + checklist + idempotency replay
    const idemKey = `n-${crypto.randomUUID()}`;
    const notePayload = {
      folderId,
      title: "Bab 3 Metode",
      content: "- [ ] Olah data\n- [x] Referensi",
      tags: ["Skripsi", "skripsi", "Riset"],
    };

    const createNoteRes1 = await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        notePayload,
        { "idempotency-key": idemKey },
      ),
    );
    expect(createNoteRes1.status).toBe(201);
    const createdNote1 = (await createNoteRes1.json()) as {
      ok: true;
      data: {
        note: {
          id: string;
          updatedAt: string;
          tags: { id: string; name: string }[];
        };
      };
    };

    // Replay returns identical response without duplicating rows
    const createNoteRes2 = await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        notePayload,
        { "idempotency-key": idemKey },
      ),
    );
    expect(createNoteRes2.status).toBe(201);
    const createdNote2 = (await createNoteRes2.json()) as {
      ok: true;
      data: { note: { id: string } };
    };
    expect(createdNote2.data.note.id).toBe(createdNote1.data.note.id);

    const noteId = createdNote1.data.note.id;
    expect(createdNote1.data.note.tags.map((item) => item.name)).toEqual([
      "Riset",
      "Skripsi",
    ]);

    // 4. Bob cannot read, update, or delete Alice's note (404 NOTE_NOT_FOUND)
    const bobGet = await noteGet(
      makeAuthedRequest(`http://localhost:3000/api/notes/${noteId}`, "GET", bob.cookie),
      { params: Promise.resolve({ id: noteId }) },
    );
    expect(bobGet.status).toBe(404);
    const bobGetJson = (await bobGet.json()) as {
      ok: false;
      error: { code: string };
    };
    expect(bobGetJson.error.code).toBe("NOTE_NOT_FOUND");

    const bobPatch = await notePatch(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteId}`,
        "PATCH",
        bob.cookie,
        { title: "Hijack" },
      ),
      { params: Promise.resolve({ id: noteId }) },
    );
    expect(bobPatch.status).toBe(404);
    const bobPatchJson = (await bobPatch.json()) as {
      ok: false;
      error: { code: string };
    };
    expect(bobPatchJson.error.code).toBe("NOTE_NOT_FOUND");

    // 5. Server update advances updatedAt; stale client updatedAt loses under LWW
    const newerUpdateRes = await notePatch(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteId}`,
        "PATCH",
        alice.cookie,
        { title: "Bab 3 Final", tags: ["Final"] },
      ),
      { params: Promise.resolve({ id: noteId }) },
    );
    expect(newerUpdateRes.status).toBe(200);
    const newerNoteJson = (await newerUpdateRes.json()) as {
      ok: true;
      data: {
        note: { title: string; updatedAt: string };
        conflictResolved: string;
      };
    };
    expect(newerNoteJson.data.conflictResolved).toBe("applied");
    expect(newerNoteJson.data.note.title).toBe("Bab 3 Final");

    const staleTimestamp = new Date(
      Date.parse(newerNoteJson.data.note.updatedAt) - 5_000,
    ).toISOString();
    const stalePatchRes = await notePatch(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteId}`,
        "PATCH",
        alice.cookie,
        { title: "Stale Offline Edit", updatedAt: staleTimestamp },
      ),
      { params: Promise.resolve({ id: noteId }) },
    );
    expect(stalePatchRes.status).toBe(200);
    const staleJson = (await stalePatchRes.json()) as {
      ok: true;
      data: {
        note: { title: string };
        conflictResolved: string;
      };
    };
    expect(staleJson.data.note.title).toBe("Bab 3 Final");
    expect(staleJson.data.conflictResolved).toBe("server_newer");

    // 6. Removing "Skripsi" and "Riset" soft-deletes orphan tags; reusing "Riset" reactivates cleanly
    const tagsBefore = await tagsGet(
      makeAuthedRequest("http://localhost:3000/api/tags", "GET", alice.cookie),
    );
    const tagsBeforeJson = (await tagsBefore.json()) as {
      ok: true;
      data: { tags: { name: string }[] };
    };
    expect(tagsBeforeJson.data.tags.map((item) => item.name)).toEqual(["Final"]);

    const reactivateRes = await notePatch(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteId}`,
        "PATCH",
        alice.cookie,
        { tags: ["Final", "Riset"] },
      ),
      { params: Promise.resolve({ id: noteId }) },
    );
    expect(reactivateRes.status).toBe(200);
    const activeTagsRows = await getDb()
      .select({ name: tags.name, deletedAt: tags.deletedAt })
      .from(tags)
      .where(eq(tags.userId, alice.userId));
    expect(
      activeTagsRows.filter((r) => r.deletedAt === null).map((r) => r.name),
    ).toContain("Riset");

    // 7. Folder rename + stale DELETE LWW preserves real noteCount + valid delete moves active notes to Unfiled (folderId = NULL)
    const renameRes = await folderPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/folders/${folderId}`,
        "PATCH",
        alice.cookie,
        { name: "Tesis" },
      ),
      { params: Promise.resolve({ id: folderId }) },
    );
    expect(renameRes.status).toBe(200);
    const renameJson = (await renameRes.json()) as {
      ok: true;
      data: {
        folder: { id: string; name: string; noteCount: number; updatedAt: string };
        conflictResolved: string;
      };
    };
    expect(renameJson.data.conflictResolved).toBe("applied");
    expect(renameJson.data.folder.name).toBe("Tesis");
    expect(renameJson.data.folder.noteCount).toBe(1);

    const staleFolderDeleteRes = await folderDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/folders/${folderId}`,
        "DELETE",
        alice.cookie,
        {
          updatedAt: new Date(
            Date.parse(renameJson.data.folder.updatedAt) - 5_000,
          ).toISOString(),
        },
      ),
      { params: Promise.resolve({ id: folderId }) },
    );
    expect(staleFolderDeleteRes.status).toBe(200);
    const staleFolderDeleteJson = (await staleFolderDeleteRes.json()) as {
      ok: true;
      data: {
        deleted: boolean;
        id: string;
        conflictResolved: string;
        folder?: { name: string; noteCount: number };
      };
    };
    expect(staleFolderDeleteJson.data.deleted).toBe(false);
    expect(staleFolderDeleteJson.data.conflictResolved).toBe("server_newer");
    expect(staleFolderDeleteJson.data.folder?.name).toBe("Tesis");
    expect(staleFolderDeleteJson.data.folder?.noteCount).toBe(1);

    const deleteFolderRes = await folderDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/folders/${folderId}`,
        "DELETE",
        alice.cookie,
      ),
      { params: Promise.resolve({ id: folderId }) },
    );
    expect(deleteFolderRes.status).toBe(200);
    const deleteFolderJson = (await deleteFolderRes.json()) as {
      ok: true;
      data: {
        deleted: boolean;
        id: string;
        movedNotesCount: number;
        conflictResolved: string;
      };
    };
    expect(deleteFolderJson.data).toEqual({
      deleted: true,
      id: folderId,
      movedNotesCount: 1,
      conflictResolved: "applied",
    });

    const listFoldersAfter = await foldersGet(
      makeAuthedRequest("http://localhost:3000/api/folders", "GET", alice.cookie),
    );
    const listFoldersJson = (await listFoldersAfter.json()) as {
      ok: true;
      data: { folders: unknown[] };
    };
    expect(listFoldersJson.data.folders).toHaveLength(0);

    const noteAfterFolderDelete = await noteGet(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteId}`,
        "GET",
        alice.cookie,
      ),
      { params: Promise.resolve({ id: noteId }) },
    );
    const noteAfterJson = (await noteAfterFolderDelete.json()) as {
      ok: true;
      data: { note: { id: string; folderId: string | null } };
    };
    expect(noteAfterJson.data.note.folderId).toBeNull();
  });

  it("toggles GFM checklist items via API and safely unlinks transactions + runs cleanup hook post-commit on empty DELETE", async () => {
    const alice = await createRegisteredUser("ChecklistUser");
    const db = getDb();

    const noteRes = await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        {
          title: "Belanja & Trip",
          content: "- [ ] Tiket\n```md\n- [ ] Fenced\n```\n- [ ] Hotel",
          tags: ["travel"],
        },
      ),
    );
    expect(noteRes.status).toBe(201);
    const noteData = ((await noteRes.json()) as { ok: true; data: { note: { id: string } } })
      .data.note;

    // Toggle index 1 ("Hotel", skipping fenced code item)
    const checkRes = await checklistPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteData.id}/checklist`,
        "PATCH",
        alice.cookie,
        { index: 1, checked: true },
      ),
      { params: Promise.resolve({ id: noteData.id }) },
    );
    expect(checkRes.status).toBe(200);
    const checkedJson = (await checkRes.json()) as {
      ok: true;
      data: {
        note: {
          content: string;
          checklistTotal: number;
          checklistCompleted: number;
        };
        conflictResolved: string;
      };
    };
    expect(checkedJson.data.conflictResolved).toBe("applied");
    expect(checkedJson.data.note.content).toBe(
      "- [ ] Tiket\n```md\n- [ ] Fenced\n```\n- [x] Hotel",
    );
    expect(checkedJson.data.note.checklistTotal).toBe(2);
    expect(checkedJson.data.note.checklistCompleted).toBe(1);

    // Out-of-range index -> 422
    const invalidCheckRes = await checklistPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteData.id}/checklist`,
        "PATCH",
        alice.cookie,
        { index: 5, checked: true },
      ),
      { params: Promise.resolve({ id: noteData.id }) },
    );
    expect(invalidCheckRes.status).toBe(422);

    // Link a finance transaction + attachment key to verify DATA-4 unlink & post-commit cleanup
    const [wallet] = await db
      .insert(wallets)
      .values({
        userId: alice.userId,
        name: "Dompet Utama",
        type: "cash",
        initialBalance: 500_000,
      })
      .returning({ id: wallets.id });

    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.userId, alice.userId))
      .limit(1);

    const [txRow] = await db
      .insert(transactions)
      .values({
        userId: alice.userId,
        walletId: wallet.id,
        categoryId: category.id,
        noteId: noteData.id,
        type: "expense",
        amount: 250_000,
        description: "Tiket kereta",
        occurredAt: new Date(),
      })
      .returning({ id: transactions.id });

    await db.insert(noteAttachments).values({
      userId: alice.userId,
      noteId: noteData.id,
      storageKey: `notes/${alice.userId}/${noteData.id}/receipt.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
    });

    const cleanupSpy = vi.fn();
    const unregister = registerNoteDeleteCleanup(cleanupSpy);

    try {
      // DELETE with NO request body must succeed cleanly and unlink transaction
      const delRes = await noteDelete(
        makeAuthedRequest(
          `http://localhost:3000/api/notes/${noteData.id}`,
          "DELETE",
          alice.cookie,
        ),
        { params: Promise.resolve({ id: noteData.id }) },
      );
      expect(delRes.status).toBe(200);
      const delJson = (await delRes.json()) as {
        ok: true;
        data: { deleted: boolean; id: string; conflictResolved: string };
      };
      expect(delJson.data).toEqual({
        deleted: true,
        id: noteData.id,
        conflictResolved: "applied",
      });
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      expect(cleanupSpy).toHaveBeenCalledWith({
        userId: alice.userId,
        noteId: noteData.id,
        storageKeys: [`notes/${alice.userId}/${noteData.id}/receipt.jpg`],
      });

      const [txAfter] = await db
        .select({ id: transactions.id, noteId: transactions.noteId })
        .from(transactions)
        .where(eq(transactions.id, txRow.id));
      expect(txAfter).toEqual({ id: txRow.id, noteId: null });
    } finally {
      unregister();
    }
  });

  it("supports instant search (title, content, tags), wildcard escaping, pinned order, and keyset pagination", async () => {
    const alice = await createRegisteredUser("SearchUser");

    const fRes = await foldersPost(
      makeAuthedRequest(
        "http://localhost:3000/api/folders",
        "POST",
        alice.cookie,
        { name: "Kuliah" },
      ),
    );
    const folderId = ((await fRes.json()) as { ok: true; data: { folder: { id: string } } })
      .data.folder.id;

    // Create 3 notes: 1 pinned with wildcard char `%`, 2 unpinned in different folders/tags
    await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        {
          title: "Diskon 50% Promo",
          content: "Catatan biasa",
          isPinned: true,
          tags: ["promo"],
        },
      ),
    );
    await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        {
          folderId,
          title: "Jadwal Ujian",
          content: "Pelajari kalkulus bab 4",
          tags: ["kampus"],
        },
      ),
    );
    await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        {
          title: "Catatan Kos",
          content: "Bayar listrik akhir bulan",
          tags: ["tag-khusus"],
        },
      ),
    );

    // Search `%` should match only "50%" literally, not act as SQL wildcard for all notes
    const pctSearchRes = await notesGet(
      makeAuthedRequest(
        "http://localhost:3000/api/notes?q=50%25",
        "GET",
        alice.cookie,
      ),
    );
    expect(pctSearchRes.status).toBe(200);
    const pctJson = (await pctSearchRes.json()) as {
      ok: true;
      data: { items: { title: string }[] };
    };
    expect(pctJson.data.items.map((n) => n.title)).toEqual([
      "Diskon 50% Promo",
    ]);

    // Search by tag name ("tag-khusus")
    const tagSearchRes = await notesGet(
      makeAuthedRequest(
        "http://localhost:3000/api/notes?q=tag-khusus",
        "GET",
        alice.cookie,
      ),
    );
    const tagSearchJson = (await tagSearchRes.json()) as {
      ok: true;
      data: { items: { title: string }[] };
    };
    expect(tagSearchJson.data.items.map((n) => n.title)).toEqual([
      "Catatan Kos",
    ]);

    // Filter folderId=none excludes "Jadwal Ujian" (in folder)
    const unfiledRes = await notesGet(
      makeAuthedRequest(
        "http://localhost:3000/api/notes?folderId=none",
        "GET",
        alice.cookie,
      ),
    );
    const unfiledJson = (await unfiledRes.json()) as {
      ok: true;
      data: { items: { title: string; isPinned: boolean }[] };
    };
    expect(unfiledJson.data.items.map((n) => n.title)).toEqual([
      "Diskon 50% Promo",
      "Catatan Kos",
    ]);

    // Keyset pagination limit=2 -> page 2 returns remaining note in pinned-first order
    const page1Res = await notesGet(
      makeAuthedRequest(
        "http://localhost:3000/api/notes?limit=2",
        "GET",
        alice.cookie,
      ),
    );
    const page1 = (await page1Res.json()) as {
      ok: true;
      data: {
        items: { title: string }[];
        nextCursor: string | null;
      };
    };
    expect(page1.data.items).toHaveLength(2);
    expect(page1.data.items[0].title).toBe("Diskon 50% Promo");
    expect(page1.data.nextCursor).toBeTruthy();

    const page2Res = await notesGet(
      makeAuthedRequest(
        `http://localhost:3000/api/notes?limit=2&cursor=${encodeURIComponent(page1.data.nextCursor!)}`,
        "GET",
        alice.cookie,
      ),
    );
    const page2 = (await page2Res.json()) as {
      ok: true;
      data: { items: { title: string }[]; nextCursor: string | null };
    };
    expect(page2.data.items).toHaveLength(1);
    expect(page2.data.nextCursor).toBeNull();

    // Malformed cursor returns 400 INVALID_CURSOR; limit > 100 returns 422
    const badCursorRes = await notesGet(
      makeAuthedRequest(
        "http://localhost:3000/api/notes?cursor=not-a-valid-cursor",
        "GET",
        alice.cookie,
      ),
    );
    expect(badCursorRes.status).toBe(400);

    const badLimitRes = await notesGet(
      makeAuthedRequest(
        "http://localhost:3000/api/notes?limit=101",
        "GET",
        alice.cookie,
      ),
    );
    expect(badLimitRes.status).toBe(422);

    // Filter by case-insensitive tag name (`?tag=`)
    const byTagParamRes = await notesGet(
      makeAuthedRequest(
        "http://localhost:3000/api/notes?tag=TAG-KHUSUS",
        "GET",
        alice.cookie,
      ),
    );
    expect(byTagParamRes.status).toBe(200);
    const byTagJson = (await byTagParamRes.json()) as {
      ok: true;
      data: { items: { title: string }[] };
    };
    expect(byTagJson.data.items.map((n) => n.title)).toEqual(["Catatan Kos"]);

    // Trims, drops empty tags, & deduplicates BEFORE max(20) ceiling (whitespace + 25 duplicates -> 2 unique passes; 21 distinct -> 422)
    const dedupTagsRes = await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        {
          title: "Many Dup Tags",
          content: "ok",
          tags: [
            "",
            "   ",
            ...Array.from({ length: 15 }, () => " Work "),
            ...Array.from({ length: 10 }, () => "work"),
            "finance",
          ],
        },
      ),
    );
    expect(dedupTagsRes.status).toBe(201);
    const dedupJson = (await dedupTagsRes.json()) as {
      ok: true;
      data: { note: { tags: { name: string }[] } };
    };
    expect(dedupJson.data.note.tags.map((item) => item.name)).toEqual([
      "finance",
      "Work",
    ]);

    const tooManyDistinctTagsRes = await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        {
          title: "Too Many Distinct",
          content: "nope",
          tags: Array.from({ length: 21 }, (_, idx) => `tag-${idx + 1}`),
        },
      ),
    );
    expect(tooManyDistinctTagsRes.status).toBe(422);
  });

  it("enforces 401/403/400/422/409 boundaries, cross-user DELETE/folders, non-executing cleanup on LWW/replay, and PERF-2 < 300ms", async () => {
    const alice = await createRegisteredUser("BoundaryAlice");
    const bob = await createRegisteredUser("BoundaryBob");
    const dummyUuid = crypto.randomUUID();

    // 1. Unauthenticated -> 401 across endpoints
    const unauthResponses = await Promise.all([
      notesGet(makePlainRequest("http://localhost:3000/api/notes", "GET")),
      notesPost(
        makePlainRequest("http://localhost:3000/api/notes", "POST", {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        }, "{}"),
      ),
      noteGet(
        makePlainRequest(`http://localhost:3000/api/notes/${dummyUuid}`, "GET"),
        { params: Promise.resolve({ id: dummyUuid }) },
      ),
      checklistPatch(
        makePlainRequest(
          `http://localhost:3000/api/notes/${dummyUuid}/checklist`,
          "PATCH",
          { origin: "http://localhost:3000", "content-type": "application/json" },
          JSON.stringify({ index: 0, checked: true }),
        ),
        { params: Promise.resolve({ id: dummyUuid }) },
      ),
      foldersGet(makePlainRequest("http://localhost:3000/api/folders", "GET")),
      tagsGet(makePlainRequest("http://localhost:3000/api/tags", "GET")),
    ]);
    for (const res of unauthResponses) {
      expect(res.status).toBe(401);
    }

    // 2. CSRF origin mismatch -> 403 CSRF_ORIGIN_MISMATCH
    const csrfRes = await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        { title: "CSRF" },
        { origin: "https://evil.example" },
      ),
    );
    expect(csrfRes.status).toBe(403);
    const csrfJson = (await csrfRes.json()) as {
      ok: false;
      error: { code: string };
    };
    expect(csrfJson.error.code).toBe("CSRF_ORIGIN_MISMATCH");

    // 3. Malformed JSON -> 400 INVALID_JSON; bad UUID route param -> 422; oversized content -> 422
    const badJsonRes = await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        "{invalid-json",
      ),
    );
    expect(badJsonRes.status).toBe(400);
    expect(
      ((await badJsonRes.json()) as { error: { code: string } }).error.code,
    ).toBe("INVALID_JSON");

    const badFolderJsonRes = await foldersPost(
      makeAuthedRequest(
        "http://localhost:3000/api/folders",
        "POST",
        alice.cookie,
        "{broken",
      ),
    );
    expect(badFolderJsonRes.status).toBe(400);

    const badParamResponses = await Promise.all([
      noteGet(
        makeAuthedRequest("http://localhost:3000/api/notes/not-uuid", "GET", alice.cookie),
        { params: Promise.resolve({ id: "not-uuid" }) },
      ),
      notePatch(
        makeAuthedRequest("http://localhost:3000/api/notes/not-uuid", "PATCH", alice.cookie, {}),
        { params: Promise.resolve({ id: "not-uuid" }) },
      ),
      noteDelete(
        makeAuthedRequest("http://localhost:3000/api/notes/not-uuid", "DELETE", alice.cookie),
        { params: Promise.resolve({ id: "not-uuid" }) },
      ),
      checklistPatch(
        makeAuthedRequest(
          "http://localhost:3000/api/notes/not-uuid/checklist",
          "PATCH",
          alice.cookie,
          { index: 0, checked: true },
        ),
        { params: Promise.resolve({ id: "not-uuid" }) },
      ),
      folderPatch(
        makeAuthedRequest(
          "http://localhost:3000/api/folders/not-uuid",
          "PATCH",
          alice.cookie,
          { name: "X" },
        ),
        { params: Promise.resolve({ id: "not-uuid" }) },
      ),
      folderDelete(
        makeAuthedRequest(
          "http://localhost:3000/api/folders/not-uuid",
          "DELETE",
          alice.cookie,
        ),
        { params: Promise.resolve({ id: "not-uuid" }) },
      ),
    ]);
    for (const res of badParamResponses) {
      expect(res.status).toBe(422);
    }

    const oversizedRes = await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        { title: "Big", content: "a".repeat(200_001) },
      ),
    );
    expect(oversizedRes.status).toBe(422);

    // 4. Folder self-rename (200), folder LWW server_newer, duplicate ID 409, and cross-user isolation
    const folderId = crypto.randomUUID();
    const fKey = `folder-${crypto.randomUUID()}`;
    const createFolderRes = await foldersPost(
      makeAuthedRequest(
        "http://localhost:3000/api/folders",
        "POST",
        alice.cookie,
        { id: folderId, name: "Skripsi", idempotencyKey: fKey },
      ),
    );
    expect(createFolderRes.status).toBe(201);

    // Same idempotency key with changed payload -> 409 IDEMPOTENCY_KEY_CONFLICT
    const conflictIdemRes = await foldersPost(
      makeAuthedRequest(
        "http://localhost:3000/api/folders",
        "POST",
        alice.cookie,
        { id: folderId, name: "Different", idempotencyKey: fKey },
      ),
    );
    expect(conflictIdemRes.status).toBe(409);
    expect(
      ((await conflictIdemRes.json()) as { error: { code: string } }).error.code,
    ).toBe("IDEMPOTENCY_KEY_CONFLICT");

    // Different idempotency key with duplicate PK id -> 409 FOLDER_ALREADY_EXISTS
    const dupFolderIdRes = await foldersPost(
      makeAuthedRequest(
        "http://localhost:3000/api/folders",
        "POST",
        alice.cookie,
        { id: folderId, name: "Unique Name" },
      ),
    );
    expect(dupFolderIdRes.status).toBe(409);
    expect(
      ((await dupFolderIdRes.json()) as { error: { code: string } }).error.code,
    ).toBe("FOLDER_ALREADY_EXISTS");

    // Case-insensitive self-rename -> 200
    const selfRenameRes = await folderPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/folders/${folderId}`,
        "PATCH",
        alice.cookie,
        { name: "skripsi" },
      ),
      { params: Promise.resolve({ id: folderId }) },
    );
    expect(selfRenameRes.status).toBe(200);
    const selfRenameJson = (await selfRenameRes.json()) as {
      ok: true;
      data: { folder: { name: string; updatedAt: string }; conflictResolved: string };
    };
    expect(selfRenameJson.data.folder.name).toBe("skripsi");

    // Folder stale rename -> server_newer
    const staleFolderRename = await folderPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/folders/${folderId}`,
        "PATCH",
        alice.cookie,
        {
          name: "Stale Name",
          updatedAt: new Date(
            Date.parse(selfRenameJson.data.folder.updatedAt) - 5_000,
          ).toISOString(),
        },
      ),
      { params: Promise.resolve({ id: folderId }) },
    );
    expect(staleFolderRename.status).toBe(200);
    expect(
      ((await staleFolderRename.json()) as {
        data: { conflictResolved: string; folder: { name: string } };
      }).data,
    ).toMatchObject({
      conflictResolved: "server_newer",
      folder: { name: "skripsi" },
    });

    // Bob sees 0 folders and gets 404 FOLDER_NOT_FOUND on Alice's folder
    const bobFolders = await foldersGet(
      makeAuthedRequest("http://localhost:3000/api/folders", "GET", bob.cookie),
    );
    expect(((await bobFolders.json()) as { data: { folders: unknown[] } }).data.folders).toHaveLength(0);

    const bobPatchFolder = await folderPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/folders/${folderId}`,
        "PATCH",
        bob.cookie,
        { name: "Hijack" },
      ),
      { params: Promise.resolve({ id: folderId }) },
    );
    expect(bobPatchFolder.status).toBe(404);

    const bobDeleteFolder = await folderDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/folders/${folderId}`,
        "DELETE",
        bob.cookie,
      ),
      { params: Promise.resolve({ id: folderId }) },
    );
    expect(bobDeleteFolder.status).toBe(404);

    // 5. Concurrent tag creation race + duplicate note PK 409 + cross-user DELETE/checklist + cleanup hook safety
    const noteId = crypto.randomUUID();
    const [race1, race2] = await Promise.all([
      notesPost(
        makeAuthedRequest(
          "http://localhost:3000/api/notes",
          "POST",
          alice.cookie,
          {
            id: noteId,
            folderId,
            title: "Alpha_Spec\\v1",
            content: "Details for foo_bar\\baz in body",
            isPinned: true,
            tags: ["SharedRace", "FilterTag"],
          },
        ),
      ),
      notesPost(
        makeAuthedRequest(
          "http://localhost:3000/api/notes",
          "POST",
          alice.cookie,
          {
            title: "Concurrent Peer",
            content: "- [ ] Peer task",
            tags: ["sharedrace"],
          },
        ),
      ),
    ]);
    expect(race1.status).toBe(201);
    expect(race2.status).toBe(201);

    const race1Json = (await race1.json()) as {
      data: { note: { id: string; updatedAt: string; tags: { id: string; name: string }[] } };
    };
    const filterTagId = race1Json.data.note.tags.find(
      (item) => item.name === "FilterTag",
    )!.id;

    // Duplicate note PK UUID -> 409 NOTE_ALREADY_EXISTS
    const dupNoteIdRes = await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        { id: noteId, title: "Dup ID" },
      ),
    );
    expect(dupNoteIdRes.status).toBe(409);
    expect(
      ((await dupNoteIdRes.json()) as { error: { code: string } }).error.code,
    ).toBe("NOTE_ALREADY_EXISTS");

    // Cross-user checklist & delete -> 404 NOTE_NOT_FOUND
    const bobChecklist = await checklistPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteId}/checklist`,
        "PATCH",
        bob.cookie,
        { index: 0, checked: true },
      ),
      { params: Promise.resolve({ id: noteId }) },
    );
    expect(bobChecklist.status).toBe(404);

    const bobDeleteNote = await noteDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/notes/${noteId}`,
        "DELETE",
        bob.cookie,
      ),
      { params: Promise.resolve({ id: noteId }) },
    );
    expect(bobDeleteNote.status).toBe(404);

    // Search filters: content substring with `_` & `\`, folderId=<uuid>, tagId=<uuid>, pinned=true
    const contentEscapedRes = await notesGet(
      makeAuthedRequest(
        `http://localhost:3000/api/notes?q=${encodeURIComponent("foo_bar\\baz")}&folderId=${folderId}&tagId=${filterTagId}&pinned=true`,
        "GET",
        alice.cookie,
      ),
    );
    expect(contentEscapedRes.status).toBe(200);
    const contentEscapedJson = (await contentEscapedRes.json()) as {
      data: { items: { id: string }[] };
    };
    expect(contentEscapedJson.data.items.map((n) => n.id)).toEqual([noteId]);

    // PERF-2: seed 25 additional notes cleanly and verify instant search stays < 300 ms
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        notesPost(
          makeAuthedRequest(
            "http://localhost:3000/api/notes",
            "POST",
            alice.cookie,
            {
              title: `Bulk Note ${i + 1}`,
              content: i === 24 ? "Target keyword perfNeedle inside content" : "Routine ledger entry",
            },
          ),
        ),
      ),
    );

    const tStart = performance.now();
    const perfSearchRes = await notesGet(
      makeAuthedRequest(
        "http://localhost:3000/api/notes?q=perfNeedle",
        "GET",
        alice.cookie,
      ),
    );
    const elapsedMs = performance.now() - tStart;
    expect(perfSearchRes.status).toBe(200);
    expect(
      ((await perfSearchRes.json()) as { data: { items: { title: string }[] } })
        .data.items.map((n) => n.title),
    ).toEqual(["Bulk Note 25"]);
    expect(elapsedMs).toBeLessThan(300);

    // Post-commit cleanup hook must NOT fire on stale server_newer DELETE, rollback, or idempotency replay
    const cleanupSpy = vi.fn();
    const unregister = registerNoteDeleteCleanup(cleanupSpy);
    try {
      const staleDeleteRes = await noteDelete(
        makeAuthedRequest(
          `http://localhost:3000/api/notes/${noteId}`,
          "DELETE",
          alice.cookie,
          {
            updatedAt: new Date(
              Date.parse(race1Json.data.note.updatedAt) - 5_000,
            ).toISOString(),
          },
        ),
        { params: Promise.resolve({ id: noteId }) },
      );
      expect(staleDeleteRes.status).toBe(200);
      expect(
        ((await staleDeleteRes.json()) as { data: { deleted: boolean } }).data.deleted,
      ).toBe(false);
      expect(cleanupSpy).not.toHaveBeenCalled();

      const delIdemKey = `del-${crypto.randomUUID()}`;
      const delOkRes = await noteDelete(
        makeAuthedRequest(
          `http://localhost:3000/api/notes/${noteId}`,
          "DELETE",
          alice.cookie,
          undefined,
          { "idempotency-key": delIdemKey },
        ),
        { params: Promise.resolve({ id: noteId }) },
      );
      expect(delOkRes.status).toBe(200);
      expect(cleanupSpy).toHaveBeenCalledTimes(1);

      // Replay must return cached result without invoking cleanupSpy a second time
      const delReplayRes = await noteDelete(
        makeAuthedRequest(
          `http://localhost:3000/api/notes/${noteId}`,
          "DELETE",
          alice.cookie,
          undefined,
          { "idempotency-key": delIdemKey },
        ),
        { params: Promise.resolve({ id: noteId }) },
      );
      expect(delReplayRes.status).toBe(200);
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });
});

