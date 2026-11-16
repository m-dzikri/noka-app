import crypto from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GET as attachmentGet,
  DELETE as attachmentDelete,
} from "@/app/api/attachments/[attachmentId]/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { POST as attachmentsPost } from "@/app/api/notes/[id]/attachments/route";
import { POST as notesPost } from "@/app/api/notes/route";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import { noteAttachments } from "@/db/schema/notes";
import { deleteAccount } from "@/features/account/service";
import { resetEnvCacheForTest } from "@/lib/env";
import { getStorage } from "@/lib/storage";

const VALID_PDF_SAMPLE = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF\n",
  "utf8",
);

const PNG_SAMPLE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
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
  const email = `pdf-user-${suffix}@example.com`;
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

async function createNoteForUser(cookie: string, title = "PDF Attachment Note") {
  const res = await notesPost(
    new NextRequest("http://localhost:3000/api/notes", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ title, content: "Body with PDF" }),
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
  const dir = await mkdtemp(path.join(os.tmpdir(), "noka-test-pdf-"));
  tempDirs.push(dir);
  process.env.LOCAL_UPLOADS_DIR = dir;
  resetEnvCacheForTest();
  return dir;
}

describe("TS-015-02: PDF Note Attachments API Integration Tests", () => {
  beforeEach(async () => {
    await setupIsolatedUploadsDir();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env = { ...originalEnvSnapshot };
    resetEnvCacheForTest();

    if (createdUserIds.length > 0) {
      const db = getDb();
      await db.delete(users).where(inArray(users.id, createdUserIds));
      createdUserIds.length = 0;
    }

    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
    tempDirs.length = 0;
  });

  it("uploads real PDF document, returns metadata DTO, and verifies storage persistence (AC-15.1)", async () => {
    const user = await createRegisteredUser("Alice PDF");
    const note = await createNoteForUser(user.cookie, "Contract Note");

    const uploadReq = makeUploadRequest(
      `http://localhost:3000/api/notes/${note.id}/attachments`,
      user.cookie,
      VALID_PDF_SAMPLE,
      "document.pdf",
      "application/pdf",
    );

    const uploadRes = await attachmentsPost(uploadReq, {
      params: Promise.resolve({ id: note.id }),
    });

    expect(uploadRes.status).toBe(201);
    const json = await uploadRes.json();
    expect(json.ok).toBe(true);
    expect(json.data.attachment.mimeType).toBe("application/pdf");
    expect(json.data.attachment.sizeBytes).toBe(VALID_PDF_SAMPLE.byteLength);
    expect(json.data.attachment.url).toBe(
      `/api/attachments/${json.data.attachment.id}`,
    );

    // Verify storage object was written
    const storage = getStorage();
    const stored = await storage.readObject(
      `users/${user.userId}/notes/${note.id}/${json.data.attachment.id}.pdf`,
    );
    expect(stored).not.toBeNull();
    expect(stored?.byteLength).toBe(VALID_PDF_SAMPLE.byteLength);
  });

  it("serves private PDF binary with CSP sandbox headers and anti-sniff protection (SEC-4, AC-15.3)", async () => {
    const user = await createRegisteredUser("Bob PDF");
    const note = await createNoteForUser(user.cookie, "Secure PDF");

    const uploadReq = makeUploadRequest(
      `http://localhost:3000/api/notes/${note.id}/attachments`,
      user.cookie,
      VALID_PDF_SAMPLE,
      "policy.pdf",
      "application/pdf",
    );
    const uploadRes = await attachmentsPost(uploadReq, {
      params: Promise.resolve({ id: note.id }),
    });
    const { attachment } = (await uploadRes.json()).data;

    // Fetch the binary
    const getReq = new NextRequest(
      `http://localhost:3000/api/attachments/${attachment.id}`,
      {
        method: "GET",
        headers: {
          cookie: user.cookie,
        },
      },
    );

    const getRes = await attachmentGet(getReq, {
      params: Promise.resolve({ attachmentId: attachment.id }),
    });

    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("content-type")).toBe("application/pdf");
    expect(getRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(getRes.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    expect(getRes.headers.get("content-disposition")).toContain(`attachment-${attachment.id}.pdf`);
    expect(getRes.headers.get("cache-control")).toBe("private, max-age=3600");

    const arrayBuffer = await getRes.arrayBuffer();
    expect(arrayBuffer.byteLength).toBe(VALID_PDF_SAMPLE.byteLength);
  });

  it("enforces strict multi-tenant isolation: User B cannot view or delete User A's PDF (SEC-1)", async () => {
    const userA = await createRegisteredUser("User A");
    const userB = await createRegisteredUser("User B");

    const noteA = await createNoteForUser(userA.cookie, "User A Secret Document");
    const uploadReq = makeUploadRequest(
      `http://localhost:3000/api/notes/${noteA.id}/attachments`,
      userA.cookie,
      VALID_PDF_SAMPLE,
      "secret.pdf",
      "application/pdf",
    );
    const uploadRes = await attachmentsPost(uploadReq, {
      params: Promise.resolve({ id: noteA.id }),
    });
    const attachmentId = (await uploadRes.json()).data.attachment.id;

    // User B attempts to read User A's PDF
    const unauthorizedGet = new NextRequest(
      `http://localhost:3000/api/attachments/${attachmentId}`,
      {
        method: "GET",
        headers: { cookie: userB.cookie },
      },
    );
    const getRes = await attachmentGet(unauthorizedGet, {
      params: Promise.resolve({ attachmentId }),
    });
    expect(getRes.status).toBe(404);

    // User B attempts to delete User A's PDF
    const unauthorizedDelete = new NextRequest(
      `http://localhost:3000/api/attachments/${attachmentId}`,
      {
        method: "DELETE",
        headers: {
          cookie: userB.cookie,
          origin: "http://localhost:3000",
        },
      },
    );
    const delRes = await attachmentDelete(unauthorizedDelete, {
      params: Promise.resolve({ attachmentId }),
    });
    expect(delRes.status).toBe(404);
  });

  it("enforces combined 5-attachment limit across both images and PDFs (AC-15.2)", async () => {
    const user = await createRegisteredUser("Quota User");
    const note = await createNoteForUser(user.cookie, "Quota Test Note");

    // Upload 3 PNGs
    for (let i = 0; i < 3; i++) {
      const res = await attachmentsPost(
        makeUploadRequest(
          `http://localhost:3000/api/notes/${note.id}/attachments`,
          user.cookie,
          PNG_SAMPLE,
          `img-${i}.png`,
          "image/png",
        ),
        { params: Promise.resolve({ id: note.id }) },
      );
      expect(res.status).toBe(201);
    }

    // Upload 2 PDFs (now 5 total)
    for (let i = 0; i < 2; i++) {
      const res = await attachmentsPost(
        makeUploadRequest(
          `http://localhost:3000/api/notes/${note.id}/attachments`,
          user.cookie,
          VALID_PDF_SAMPLE,
          `doc-${i}.pdf`,
          "application/pdf",
        ),
        { params: Promise.resolve({ id: note.id }) },
      );
      expect(res.status).toBe(201);
    }

    // 6th upload (PDF) must be rejected with 409 ATTACHMENT_LIMIT_REACHED
    const overflowRes = await attachmentsPost(
      makeUploadRequest(
        `http://localhost:3000/api/notes/${note.id}/attachments`,
        user.cookie,
        VALID_PDF_SAMPLE,
        "overflow.pdf",
        "application/pdf",
      ),
      { params: Promise.resolve({ id: note.id }) },
    );
    expect(overflowRes.status).toBe(409);
    const overflowJson = await overflowRes.json();
    expect(overflowJson.error.code).toBe("ATTACHMENT_LIMIT_REACHED");
  });

  it("deletes PDF attachment and cascades storage cleanup on account deletion (AC-15.6, RFC-010)", async () => {
    const user = await createRegisteredUser("Account Deletion User");
    const note = await createNoteForUser(user.cookie, "Wipeout Note");

    const uploadRes = await attachmentsPost(
      makeUploadRequest(
        `http://localhost:3000/api/notes/${note.id}/attachments`,
        user.cookie,
        VALID_PDF_SAMPLE,
        "cleanup.pdf",
        "application/pdf",
      ),
      { params: Promise.resolve({ id: note.id }) },
    );
    const attachmentId = (await uploadRes.json()).data.attachment.id;

    // Perform account deletion
    await deleteAccount(user.userId, "Password123!");

    // Verify row is deleted from note_attachments
    const db = getDb();
    const rows = await db
      .select()
      .from(noteAttachments)
      .where(eq(noteAttachments.id, attachmentId));
    expect(rows).toHaveLength(0);

    // Verify storage object was cleaned up
    const storage = getStorage();
    const stored = await storage.readObject(
      `users/${user.userId}/notes/${note.id}/${attachmentId}.pdf`,
    );
    expect(stored).toBeNull();
  });
});
