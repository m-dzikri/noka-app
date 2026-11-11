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

describe("Notes, folders, tags, GFM checklist & referential integrity API (TS-004-02)", () => {
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
      data: { id: string; name: string };
    };
    const folderId = folderJson.data.id;

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
        id: string;
        updatedAt: string;
        tags: { id: string; name: string }[];
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
      data: { id: string };
    };
    expect(createdNote2.data.id).toBe(createdNote1.data.id);

    const noteId = createdNote1.data.id;
    expect(createdNote1.data.tags.map((item) => item.name)).toEqual([
      "Riset",
      "Skripsi",
    ]);

    // 4. Bob cannot read, update, or delete Alice's note (404)
    const bobGet = await noteGet(
      makeAuthedRequest(`http://localhost:3000/api/notes/${noteId}`, "GET", bob.cookie),
      { params: Promise.resolve({ id: noteId }) },
    );
    expect(bobGet.status).toBe(404);

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
      data: { title: string; updatedAt: string };
    };
    expect(newerNoteJson.data.title).toBe("Bab 3 Final");

    const staleTimestamp = new Date(
      Date.parse(newerNoteJson.data.updatedAt) - 5_000,
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
      data: { title: string; conflictResolved?: string };
    };
    expect(staleJson.data.title).toBe("Bab 3 Final");
    expect(staleJson.data.conflictResolved).toBe("server_wins");

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

    // 7. Folder rename + delete moves active notes to Unfiled (folderId = NULL) without deleting notes
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

    const deleteFolderRes = await folderDelete(
      makeAuthedRequest(
        `http://localhost:3000/api/folders/${folderId}`,
        "DELETE",
        alice.cookie,
      ),
      { params: Promise.resolve({ id: folderId }) },
    );
    expect(deleteFolderRes.status).toBe(200);

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
      data: { id: string; folderId: string | null };
    };
    expect(noteAfterJson.data.folderId).toBeNull();
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
    const noteData = ((await noteRes.json()) as { ok: true; data: { id: string } })
      .data;

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
        content: string;
        checklistTotal: number;
        checklistCompleted: number;
      };
    };
    expect(checkedJson.data.content).toBe(
      "- [ ] Tiket\n```md\n- [ ] Fenced\n```\n- [x] Hotel",
    );
    expect(checkedJson.data.checklistTotal).toBe(2);
    expect(checkedJson.data.checklistCompleted).toBe(1);

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
    const folderId = ((await fRes.json()) as { ok: true; data: { id: string } })
      .data.id;

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
      data: { notes: { title: string }[] };
    };
    expect(pctJson.data.notes.map((n) => n.title)).toEqual([
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
      data: { notes: { title: string }[] };
    };
    expect(tagSearchJson.data.notes.map((n) => n.title)).toEqual([
      "Catatan Kos",
    ]);

    // Filter folderId=unfiled excludes "Jadwal Ujian" (in folder)
    const unfiledRes = await notesGet(
      makeAuthedRequest(
        "http://localhost:3000/api/notes?folderId=unfiled",
        "GET",
        alice.cookie,
      ),
    );
    const unfiledJson = (await unfiledRes.json()) as {
      ok: true;
      data: { notes: { title: string; isPinned: boolean }[] };
    };
    expect(unfiledJson.data.notes.map((n) => n.title)).toEqual([
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
        notes: { title: string }[];
        hasMore: boolean;
        nextCursor: string | null;
      };
    };
    expect(page1.data.notes).toHaveLength(2);
    expect(page1.data.notes[0].title).toBe("Diskon 50% Promo");
    expect(page1.data.hasMore).toBe(true);
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
      data: { notes: { title: string }[]; hasMore: boolean };
    };
    expect(page2.data.notes).toHaveLength(1);
    expect(page2.data.hasMore).toBe(false);

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
      data: { notes: { title: string }[] };
    };
    expect(byTagJson.data.notes.map((n) => n.title)).toEqual(["Catatan Kos"]);

    // Normalizes/deduplicates tags BEFORE max(20) ceiling (25 duplicates -> 2 unique passes; 21 distinct -> 422)
    const dedupTagsRes = await notesPost(
      makeAuthedRequest(
        "http://localhost:3000/api/notes",
        "POST",
        alice.cookie,
        {
          title: "Many Dup Tags",
          content: "ok",
          tags: [
            ...Array.from({ length: 15 }, () => "Work"),
            ...Array.from({ length: 10 }, () => "work"),
            "finance",
          ],
        },
      ),
    );
    expect(dedupTagsRes.status).toBe(201);
    const dedupJson = (await dedupTagsRes.json()) as {
      ok: true;
      data: { tags: { name: string }[] };
    };
    expect(dedupJson.data.tags.map((item) => item.name)).toEqual([
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
});

