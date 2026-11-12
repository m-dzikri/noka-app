import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import { noteAttachments, notes } from "@/db/schema/notes";
import {
  DELETE as attachmentDelete,
  GET as attachmentBinaryGet,
} from "@/app/api/attachments/[attachmentId]/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import {
  GET as noteAttachmentsGet,
  POST as noteAttachmentsPost,
} from "@/app/api/notes/[id]/attachments/route";
import { DELETE as noteDelete } from "@/app/api/notes/[id]/route";
import { POST as notesPost } from "@/app/api/notes/route";
import {
  deleteUserAttachmentObjects,
  MAX_ATTACHMENT_BYTES,
  MAX_MULTIPART_CONTENT_LENGTH,
  uploadNoteAttachment,
} from "@/features/notes/attachments-service";
import { deleteNote } from "@/features/notes/service";
import { resetEnvCacheForTest } from "@/lib/env";
import { logger } from "@/lib/logger";
import * as storageModule from "@/lib/storage";
import { LocalStorageAdapter } from "@/lib/storage/local";

// Minimal valid 1x1 PNG buffer
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const VALID_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
]);

const createdUserIds: string[] = [];
const tempDirs: string[] = [];
const originalEnvSnapshot = { ...process.env };

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
  throw new Error("Missing noka_session cookie on response");
}

async function createRegisteredUser(name: string) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `attach-${suffix}@example.com`;
  const req = new NextRequest("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name,
      email,
      password: "Password123!",
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

async function createNoteForUser(cookie: string, title = "Attachment Note") {
  const res = await notesPost(
    new NextRequest("http://localhost:3000/api/notes", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ title, content: "Body" }),
    }),
  );
  expect(res.status).toBe(201);
  const json = (await res.json()) as {
    ok: true;
    data: { note: { id: string; updatedAt: string } };
  };
  return json.data.note;
}

function makeUploadRequest(
  url: string,
  cookie: string | null,
  fileBytes: Buffer,
  fileName: string,
  mimeType: string,
  origin: string | null = "http://localhost:3000",
): NextRequest {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fileBytes)], { type: mimeType });
  formData.append("file", blob, fileName);

  const headers: Record<string, string> = {};
  if (origin !== null) {
    headers.origin = origin;
  }
  if (cookie !== null) {
    headers.cookie = cookie;
  }

  return new NextRequest(url, {
    method: "POST",
    headers,
    body: formData,
  });
}

async function setupIsolatedUploadsDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "noka-test-uploads-"));
  tempDirs.push(dir);
  process.env.LOCAL_UPLOADS_DIR = dir;
  resetEnvCacheForTest();
  return dir;
}

describe("Note Attachments Integration & Security (TS-005-02)", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    process.env = { ...originalEnvSnapshot };
    resetEnvCacheForTest();

    if (createdUserIds.length > 0) {
      await getDb()
        .delete(users)
        .where(inArray(users.id, [...createdUserIds]));
      createdUserIds.length = 0;
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  it("enforces auth/CSRF/UUID/magic-bytes/size/5-limit WITH parallel FOR UPDATE locking and UUID storageKey", async () => {
    const uploadsDir = await setupIsolatedUploadsDir();
    const alice = await createRegisteredUser("Alice");
    const bob = await createRegisteredUser("Bob");
    const aliceNote = await createNoteForUser(alice.cookie);

    // Unauthenticated POST -> 401
    const unauthRes = await noteAttachmentsPost(
      makeUploadRequest(
        `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
        null,
        VALID_PNG,
        "a.png",
        "image/png",
      ),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(unauthRes.status).toBe(401);

    // Cross-origin CSRF -> 403
    const csrfRes = await noteAttachmentsPost(
      makeUploadRequest(
        `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
        alice.cookie,
        VALID_PNG,
        "a.png",
        "image/png",
        "https://evil.example",
      ),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(csrfRes.status).toBe(403);

    // Invalid UUID -> 422 across all attachment routes
    const badUuidRes = await noteAttachmentsPost(
      makeUploadRequest(
        "http://localhost:3000/api/notes/not-a-uuid/attachments",
        alice.cookie,
        VALID_PNG,
        "a.png",
        "image/png",
      ),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(badUuidRes.status).toBe(422);

    const badGetListUuidRes = await noteAttachmentsGet(
      new NextRequest("http://localhost:3000/api/notes/not-a-uuid/attachments", {
        headers: { cookie: alice.cookie },
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(badGetListUuidRes.status).toBe(422);
    expect(
      ((await badGetListUuidRes.json()) as { error: { code: string } }).error
        .code,
    ).toBe("VALIDATION_ERROR");

    const badGetBinUuidRes = await attachmentBinaryGet(
      new NextRequest("http://localhost:3000/api/attachments/not-a-uuid", {
        headers: { cookie: alice.cookie },
      }),
      { params: Promise.resolve({ attachmentId: "not-a-uuid" }) },
    );
    expect(badGetBinUuidRes.status).toBe(422);
    expect(
      ((await badGetBinUuidRes.json()) as { error: { code: string } }).error
        .code,
    ).toBe("VALIDATION_ERROR");

    const badDelUuidRes = await attachmentDelete(
      new NextRequest("http://localhost:3000/api/attachments/not-a-uuid", {
        method: "DELETE",
        headers: { origin: "http://localhost:3000", cookie: alice.cookie },
      }),
      { params: Promise.resolve({ attachmentId: "not-a-uuid" }) },
    );
    expect(badDelUuidRes.status).toBe(422);
    expect(
      ((await badDelUuidRes.json()) as { error: { code: string } }).error.code,
    ).toBe("VALIDATION_ERROR");

    // Non-multipart POST -> 400 INVALID_MULTIPART
    const jsonRes = await noteAttachmentsPost(
      new NextRequest(
        `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
        {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            cookie: alice.cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        },
      ),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(jsonRes.status).toBe(400);
    expect(((await jsonRes.json()) as { error: { code: string } }).error.code).toBe(
      "INVALID_MULTIPART",
    );

    // Cross-user upload -> 404 NOTE_NOT_FOUND
    const bobUploadRes = await noteAttachmentsPost(
      makeUploadRequest(
        `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
        bob.cookie,
        VALID_PNG,
        "a.png",
        "image/png",
      ),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(bobUploadRes.status).toBe(404);

    // Empty file -> 422 EMPTY_FILE
    const emptyRes = await noteAttachmentsPost(
      makeUploadRequest(
        `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
        alice.cookie,
        Buffer.alloc(0),
        "empty.png",
        "image/png",
      ),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(emptyRes.status).toBe(422);
    expect(((await emptyRes.json()) as { error: { code: string } }).error.code).toBe(
      "EMPTY_FILE",
    );

    // Oversized buffer > 5 MB -> 413 FILE_TOO_LARGE
    const largeBuffer = Buffer.alloc(MAX_ATTACHMENT_BYTES + 16, 0xaa);
    const largeRes = await noteAttachmentsPost(
      makeUploadRequest(
        `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
        alice.cookie,
        largeBuffer,
        "huge.png",
        "image/png",
      ),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(largeRes.status).toBe(413);
    expect(((await largeRes.json()) as { error: { code: string } }).error.code).toBe(
      "FILE_TOO_LARGE",
    );

    // Pre-check Content-Length > 5MB + 64KiB -> 413 PAYLOAD_TOO_LARGE
    const headerTooBigRes = await noteAttachmentsPost(
      new NextRequest(
        `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
        {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            cookie: alice.cookie,
            "content-type": "multipart/form-data; boundary=----noka",
            "content-length": String(MAX_MULTIPART_CONTENT_LENGTH + 1),
          },
          body: "ignored",
        },
      ),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(headerTooBigRes.status).toBe(413);
    expect(
      ((await headerTooBigRes.json()) as { error: { code: string } }).error.code,
    ).toBe("PAYLOAD_TOO_LARGE");

    // Spoofed file -> 422 UNSUPPORTED_IMAGE_TYPE
    const spoofRes = await noteAttachmentsPost(
      makeUploadRequest(
        `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
        alice.cookie,
        Buffer.from("plain text pretending to be jpeg", "utf8"),
        "fake.jpg",
        "image/jpeg",
      ),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(spoofRes.status).toBe(422);
    expect(((await spoofRes.json()) as { error: { code: string } }).error.code).toBe(
      "UNSUPPORTED_IMAGE_TYPE",
    );

    // Valid upload ignores dangerous client filename and stores under UUID storageKey
    const firstUploadRes = await noteAttachmentsPost(
      makeUploadRequest(
        `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
        alice.cookie,
        VALID_JPEG,
        "../../../etc/passwd.jpg",
        "image/jpg",
      ),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(firstUploadRes.status).toBe(201);
    const updatedHeader = firstUploadRes.headers.get("X-Note-Updated-At");
    expect(updatedHeader).toBeTruthy();

    const firstJson = (await firstUploadRes.json()) as {
      ok: true;
      data: {
        attachment: {
          id: string;
          noteId: string;
          mimeType: string;
          sizeBytes: number;
          url: string;
        };
      };
    };
    const firstId = firstJson.data.attachment.id;
    expect(firstJson.data.attachment.mimeType).toBe("image/jpeg");
    expect(firstJson.data.attachment.url).toBe(`/api/attachments/${firstId}`);

    const [dbRow] = await getDb()
      .select()
      .from(noteAttachments)
      .where(eq(noteAttachments.id, firstId));
    expect(dbRow.storageKey).toBe(
      `users/${alice.userId}/notes/${aliceNote.id}/${firstId}.jpg`,
    );
    expect(existsSync(path.join(uploadsDir, dbRow.storageKey))).toBe(true);

    // Upload 3 more sequentially -> total 4
    for (let i = 0; i < 3; i++) {
      const res = await noteAttachmentsPost(
        makeUploadRequest(
          `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
          alice.cookie,
          VALID_PNG,
          `img-${i}.png`,
          "image/png",
        ),
        { params: Promise.resolve({ id: aliceNote.id }) },
      );
      expect(res.status).toBe(201);
    }

    // Parallel #5 and #6 race guarded by FOR UPDATE: exactly 1 succeeds (201) and 1 fails (409)
    const [raceA, raceB] = await Promise.all([
      noteAttachmentsPost(
        makeUploadRequest(
          `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
          alice.cookie,
          VALID_PNG,
          "race-a.png",
          "image/png",
        ),
        { params: Promise.resolve({ id: aliceNote.id }) },
      ),
      noteAttachmentsPost(
        makeUploadRequest(
          `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
          alice.cookie,
          VALID_PNG,
          "race-b.png",
          "image/png",
        ),
        { params: Promise.resolve({ id: aliceNote.id }) },
      ),
    ]);

    const raceStatuses = [raceA.status, raceB.status].sort((a, b) => a - b);
    expect(raceStatuses).toEqual([201, 409]);

    const rejectedRes = raceA.status === 409 ? raceA : raceB;
    expect(
      ((await rejectedRes.json()) as { error: { code: string } }).error.code,
    ).toBe("ATTACHMENT_LIMIT_REACHED");

    const rowsInDb = await getDb()
      .select()
      .from(noteAttachments)
      .where(eq(noteAttachments.noteId, aliceNote.id));
    expect(rowsInDb).toHaveLength(5);

    const listRes = await noteAttachmentsGet(
      new NextRequest(
        `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
        { headers: { cookie: alice.cookie } },
      ),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(listRes.status).toBe(200);
    // Cross-user GET list -> 404; unauth GET list -> 401
    const bobListRes = await noteAttachmentsGet(
      new NextRequest(
        `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
        { headers: { cookie: bob.cookie } },
      ),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(bobListRes.status).toBe(404);

    const unauthListRes = await noteAttachmentsGet(
      new NextRequest(
        `http://localhost:3000/api/notes/${aliceNote.id}/attachments`,
      ),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(unauthListRes.status).toBe(401);
  });

  it("handles storage putObject failure rollback, commit failure compensation deleteObject, private binary headers, DELETE rollback, and note cleanup resilience", async () => {
    const uploadsDir = await setupIsolatedUploadsDir();
    const alice = await createRegisteredUser("Alice");
    const bob = await createRegisteredUser("Bob");
    const aliceNote = await createNoteForUser(alice.cookie);

    // 1. Storage putObject failure -> DB rolls back and returns 503 STORAGE_UNAVAILABLE
    const failingStorage = {
      putObject: vi.fn().mockRejectedValue(new Error("S3 outage")),
      readObject: vi.fn(),
      deleteObject: vi.fn(),
      deleteObjects: vi.fn(),
      getSignedReadUrl: vi.fn(),
    };
    await expect(
      uploadNoteAttachment(
        alice.userId,
        aliceNote.id,
        VALID_PNG,
        "image/png",
        failingStorage,
      ),
    ).rejects.toMatchObject({ status: 503, code: "STORAGE_UNAVAILABLE" });
    expect(
      await getDb()
        .select()
        .from(noteAttachments)
        .where(eq(noteAttachments.noteId, aliceNote.id)),
    ).toHaveLength(0);

    // 2. DB commit failure AFTER putObject succeeded -> compensation deleteObject removes orphan file
    const localAdapter = new LocalStorageAdapter(uploadsDir);
    const deleteSpy = vi.spyOn(localAdapter, "deleteObject");
    const dbInstance = getDb();
    const originalTx = dbInstance.transaction.bind(dbInstance);
    vi.spyOn(dbInstance, "transaction").mockImplementationOnce((async (
      cb: Parameters<typeof dbInstance.transaction>[0],
    ) => {
      await originalTx(async (tx) => {
        await cb(tx);
        throw new Error("Simulated commit failure");
      });
    }) as typeof dbInstance.transaction);

    await expect(
      uploadNoteAttachment(
        alice.userId,
        aliceNote.id,
        VALID_PNG,
        "image/png",
        localAdapter,
      ),
    ).rejects.toThrow("Simulated commit failure");

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    const compensatedKey = deleteSpy.mock.calls[0]?.[0] as string;
    expect(existsSync(path.join(uploadsDir, compensatedKey))).toBe(false);

    // 3. Upload valid attachment -> GET binary headers + cross-user 404 + missing object 404
    const uploaded = await uploadNoteAttachment(
      alice.userId,
      aliceNote.id,
      VALID_PNG,
      "image/png",
    );
    const attachmentId = uploaded.attachment.id;

    // Cross-user GET -> 404
    const bobGetRes = await attachmentBinaryGet(
      new NextRequest(`http://localhost:3000/api/attachments/${attachmentId}`, {
        headers: { cookie: bob.cookie },
      }),
      { params: Promise.resolve({ attachmentId }) },
    );
    expect(bobGetRes.status).toBe(404);

    // Owner GET -> 200 with security & cache headers
    const ownerGetRes = await attachmentBinaryGet(
      new NextRequest(`http://localhost:3000/api/attachments/${attachmentId}`, {
        headers: { cookie: alice.cookie },
      }),
      { params: Promise.resolve({ attachmentId }) },
    );
    expect(ownerGetRes.status).toBe(200);
    expect(ownerGetRes.headers.get("content-type")).toBe("image/png");
    expect(ownerGetRes.headers.get("content-disposition")).toBe("inline");
    expect(ownerGetRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(ownerGetRes.headers.get("cache-control")).toBe("private, max-age=3600");
    const servedBytes = Buffer.from(await ownerGetRes.arrayBuffer());
    expect(servedBytes.equals(VALID_PNG)).toBe(true);

    // 4. DELETE storage failure -> DB rollback keeps row intact & returns 503
    const realStorage = storageModule.getStorage();
    vi.spyOn(storageModule, "getStorage").mockReturnValueOnce({
      ...realStorage,
      putObject: realStorage.putObject.bind(realStorage),
      readObject: realStorage.readObject.bind(realStorage),
      deleteObjects: realStorage.deleteObjects.bind(realStorage),
      getSignedReadUrl: realStorage.getSignedReadUrl.bind(realStorage),
      deleteObject: vi.fn().mockRejectedValue(new Error("Delete failure")),
    });

    const delFailRes = await attachmentDelete(
      new NextRequest(`http://localhost:3000/api/attachments/${attachmentId}`, {
        method: "DELETE",
        headers: { origin: "http://localhost:3000", cookie: alice.cookie },
      }),
      { params: Promise.resolve({ attachmentId }) },
    );
    expect(delFailRes.status).toBe(503);
    expect(
      await getDb()
        .select()
        .from(noteAttachments)
        .where(eq(noteAttachments.id, attachmentId)),
    ).toHaveLength(1);

    // Remove file manually on disk to verify 404 ATTACHMENT_OBJECT_MISSING
    const [rowForMissingTest] = await getDb()
      .select()
      .from(noteAttachments)
      .where(eq(noteAttachments.id, attachmentId));
    await rm(path.join(uploadsDir, rowForMissingTest.storageKey));
    const missingObjRes = await attachmentBinaryGet(
      new NextRequest(`http://localhost:3000/api/attachments/${attachmentId}`, {
        headers: { cookie: alice.cookie },
      }),
      { params: Promise.resolve({ attachmentId }) },
    );
    expect(missingObjRes.status).toBe(404);
    expect(
      ((await missingObjRes.json()) as { error: { code: string } }).error.code,
    ).toBe("ATTACHMENT_OBJECT_MISSING");

    // Restore object on disk -> reject unauth/CSRF/cross-user DELETE -> then owner DELETE succeeds
    await writeFile(path.join(uploadsDir, rowForMissingTest.storageKey), VALID_PNG);

    const unauthDelRes = await attachmentDelete(
      new NextRequest(`http://localhost:3000/api/attachments/${attachmentId}`, {
        method: "DELETE",
        headers: { origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ attachmentId }) },
    );
    expect(unauthDelRes.status).toBe(401);

    const csrfDelRes = await attachmentDelete(
      new NextRequest(`http://localhost:3000/api/attachments/${attachmentId}`, {
        method: "DELETE",
        headers: { origin: "https://evil.example", cookie: alice.cookie },
      }),
      { params: Promise.resolve({ attachmentId }) },
    );
    expect(csrfDelRes.status).toBe(403);

    const bobDelRes = await attachmentDelete(
      new NextRequest(`http://localhost:3000/api/attachments/${attachmentId}`, {
        method: "DELETE",
        headers: { origin: "http://localhost:3000", cookie: bob.cookie },
      }),
      { params: Promise.resolve({ attachmentId }) },
    );
    expect(bobDelRes.status).toBe(404);

    const delOkRes = await attachmentDelete(
      new NextRequest(`http://localhost:3000/api/attachments/${attachmentId}`, {
        method: "DELETE",
        headers: { origin: "http://localhost:3000", cookie: alice.cookie },
      }),
      { params: Promise.resolve({ attachmentId }) },
    );
    expect(delOkRes.status).toBe(200);
    expect(existsSync(path.join(uploadsDir, rowForMissingTest.storageKey))).toBe(
      false,
    );

    // 5. Note delete triggers post-commit cleanup via service.ts hook & survives storage failures
    const att2 = await uploadNoteAttachment(
      alice.userId,
      aliceNote.id,
      VALID_PNG,
      "image/png",
    );
    const [att2Row] = await getDb()
      .select()
      .from(noteAttachments)
      .where(eq(noteAttachments.id, att2.attachment.id));
    expect(existsSync(path.join(uploadsDir, att2Row.storageKey))).toBe(true);

    const noteDelRes = await noteDelete(
      new NextRequest(`http://localhost:3000/api/notes/${aliceNote.id}`, {
        method: "DELETE",
        headers: { origin: "http://localhost:3000", cookie: alice.cookie },
      }),
      { params: Promise.resolve({ id: aliceNote.id }) },
    );
    expect(noteDelRes.status).toBe(200);
    expect(existsSync(path.join(uploadsDir, att2Row.storageKey))).toBe(false);
    // Deleted note attachment can no longer be fetched or deleted
    const deletedNoteGet = await attachmentBinaryGet(
      new NextRequest(
        `http://localhost:3000/api/attachments/${att2.attachment.id}`,
        { headers: { cookie: alice.cookie } },
      ),
      { params: Promise.resolve({ attachmentId: att2.attachment.id }) },
    );
    expect(deletedNoteGet.status).toBe(404);

    // Second note delete when storage batch delete fails post-commit MUST still succeed (not 503/500)
    const note2 = await createNoteForUser(alice.cookie, "Cleanup Resilience");
    const att3 = await uploadNoteAttachment(
      alice.userId,
      note2.id,
      VALID_PNG,
      "image/png",
    );
    const [att3Row] = await getDb()
      .select()
      .from(noteAttachments)
      .where(eq(noteAttachments.id, att3.attachment.id));

    const warnSpy = vi.spyOn(logger, "warn");
    vi.spyOn(storageModule, "getStorage").mockReturnValueOnce({
      ...realStorage,
      deleteObjects: vi.fn().mockRejectedValue(new Error("Temporary outage")),
    });

    const resilientDel = await deleteNote(alice.userId, note2.id);
    expect(resilientDel.deleted).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      "notes.attachment_cleanup_partial_failure",
      {
        noteId: note2.id,
        failedKeys: [att3Row.storageKey],
      },
    );

    const [deletedNoteRow] = await getDb()
      .select({ deletedAt: notes.deletedAt })
      .from(notes)
      .where(eq(notes.id, note2.id));
    expect(deletedNoteRow.deletedAt).not.toBeNull();

    // Verify deleteUserAttachmentObjects handles both empty and failing production S3 cleanly
    const cleanupResult = await deleteUserAttachmentObjects([att3Row.storageKey]);
    expect(cleanupResult).toEqual({ failedKeys: [] });
    expect(existsSync(path.join(uploadsDir, att3Row.storageKey))).toBe(false);

    expect(await deleteUserAttachmentObjects([])).toEqual({ failedKeys: [] });

    const envMap = process.env as Record<string, string | undefined>;
    envMap.NODE_ENV = "production";
    delete envMap.S3_ENDPOINT;
    delete envMap.S3_REGION;
    delete envMap.S3_BUCKET;
    delete envMap.S3_ACCESS_KEY_ID;
    delete envMap.S3_SECRET_ACCESS_KEY;
    resetEnvCacheForTest();

    expect(await deleteUserAttachmentObjects([])).toEqual({ failedKeys: [] });
    expect(await deleteUserAttachmentObjects(["k1", "k2"])).toEqual({
      failedKeys: ["k1", "k2"],
    });
  });

  it("ensures local fallback test files remain valid PNG buffers on disk before delete", async () => {
    const uploadsDir = await setupIsolatedUploadsDir();
    const alice = await createRegisteredUser("DiskCheck");
    const note = await createNoteForUser(alice.cookie);
    const uploaded = await uploadNoteAttachment(
      alice.userId,
      note.id,
      VALID_PNG,
      "image/png",
    );
    const [row] = await getDb()
      .select()
      .from(noteAttachments)
      .where(eq(noteAttachments.id, uploaded.attachment.id));
    const diskBytes = await readFile(path.join(uploadsDir, row.storageKey));
    expect(diskBytes.equals(VALID_PNG)).toBe(true);
  });
});
