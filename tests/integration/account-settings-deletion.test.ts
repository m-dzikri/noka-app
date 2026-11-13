import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema/auth";
import {
  categories,
  transactions,
  transfers,
  wallets,
} from "@/db/schema/finance";
import { folders, noteAttachments, notes } from "@/db/schema/notes";
import { DELETE as accountDelete } from "@/app/api/account/route";
import { PATCH as passwordPatch } from "@/app/api/account/password/route";
import { PATCH as profilePatch } from "@/app/api/account/profile/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { POST as transfersPost } from "@/app/api/transfers/route";
import { POST as notesPost } from "@/app/api/notes/route";
import { POST as walletsPost } from "@/app/api/wallets/route";
import { uploadNoteAttachment } from "@/features/notes/attachments-service";
import { deleteAccount } from "@/features/account/service";
import { resetEnvCacheForTest } from "@/lib/env";
import { logger } from "@/lib/logger";
import { LocalStorageAdapter } from "@/lib/storage/local";

const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const createdUserIds: string[] = [];
const tempDirs: string[] = [];
const originalEnv = { ...process.env };

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

function extractSetCookies(response: Response): string[] {
  const headers = response.headers as unknown as {
    getSetCookie?: () => string[];
  };
  return headers.getSetCookie
    ? headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
}

function makeAuthedRequest(
  url: string,
  method: string,
  cookie?: string,
  body?: unknown,
  origin: string = "http://localhost:3000",
): NextRequest {
  const headers: Record<string, string> = {
    origin,
  };
  if (cookie) {
    headers.cookie = cookie;
  }
  if (body !== undefined && typeof body !== "string") {
    headers["content-type"] = "application/json";
  }

  return new NextRequest(url, {
    method,
    headers,
    body:
      body !== undefined
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined,
  });
}

describe("Account Settings, Password Change & Self-Service Account Deletion (TS-010-01)", () => {
  beforeEach(async () => {
    resetEnvCacheForTest();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    resetEnvCacheForTest();

    if (createdUserIds.length > 0) {
      const db = getDb();
      await db.delete(transfers).where(inArray(transfers.userId, [...createdUserIds]));
      await db.delete(transactions).where(inArray(transactions.userId, [...createdUserIds]));
      await db.delete(wallets).where(inArray(wallets.userId, [...createdUserIds]));
      await db.delete(categories).where(inArray(categories.userId, [...createdUserIds]));
      await db.delete(notes).where(inArray(notes.userId, [...createdUserIds]));
      await db.delete(folders).where(inArray(folders.userId, [...createdUserIds]));
      await db.delete(users).where(inArray(users.id, [...createdUserIds]));
      createdUserIds.length = 0;
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir && existsSync(dir)) {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  });

  async function createRegisteredUser(
    emailPrefix: string,
    password = "password123",
  ): Promise<{ userId: string; sessionCookie: string; email: string }> {
    const email = `${emailPrefix}-${crypto.randomUUID().slice(0, 8)}@test.noka.app`;
    const regReq = makeAuthedRequest("http://localhost:3000/api/auth/register", "POST", undefined, {
      name: "Pengguna Uji",
      email,
      password,
      locale: "id",
      theme: "light",
    });

    const regRes = await registerPost(regReq);
    expect(regRes.status).toBe(201);
    const regJson = (await regRes.json()) as { data: { user: { id: string } } };
    const userId = regJson.data.user.id;
    createdUserIds.push(userId);
    const sessionCookie = extractSessionCookie(regRes);

    return { userId, sessionCookie, email };
  }

  describe("PATCH /api/account/profile (AC-10.1)", () => {
    it("enforces authentication (401), CSRF origin verification (403), and JSON parsing (400)", async () => {
      const { sessionCookie } = await createRegisteredUser("prof-sec");

      // 1. Unauthenticated -> 401
      const unauthReq = makeAuthedRequest("http://localhost:3000/api/account/profile", "PATCH", undefined, {
        name: "Nama Baru",
      });
      const unauthRes = await profilePatch(unauthReq);
      expect(unauthRes.status).toBe(401);

      // 2. CSRF mismatch -> 403
      const csrfReq = makeAuthedRequest(
        "http://localhost:3000/api/account/profile",
        "PATCH",
        sessionCookie,
        { name: "Nama Baru" },
        "https://attacker.evil.com",
      );
      const csrfRes = await profilePatch(csrfReq);
      expect(csrfRes.status).toBe(403);

      // 3. Malformed JSON -> 400 INVALID_JSON
      const malformedReq = new NextRequest("http://localhost:3000/api/account/profile", {
        method: "PATCH",
        headers: {
          origin: "http://localhost:3000",
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: "{ name: invalid json without quotes ",
      });
      const malformedRes = await profilePatch(malformedReq);
      expect(malformedRes.status).toBe(400);
      const malformedJson = (await malformedRes.json()) as { error: { code: string } };
      expect(malformedJson.error.code).toBe("INVALID_JSON");
    });

    it("enforces validation: rejects empty payload {} (422) and invalid cycleStartDay (422 INVALID_CYCLE_DAY)", async () => {
      const { sessionCookie } = await createRegisteredUser("prof-val");

      // Empty payload -> 422 VALIDATION_ERROR
      const emptyReq = makeAuthedRequest("http://localhost:3000/api/account/profile", "PATCH", sessionCookie, {});
      const emptyRes = await profilePatch(emptyReq);
      expect(emptyRes.status).toBe(422);
      const emptyJson = (await emptyRes.json()) as { error: { code: string } };
      expect(emptyJson.error.code).toBe("VALIDATION_ERROR");

      // Invalid cycleStartDay '29' -> 422 INVALID_CYCLE_DAY
      const invalidCycleReq = makeAuthedRequest("http://localhost:3000/api/account/profile", "PATCH", sessionCookie, {
        cycleStartDay: "29",
      });
      const invalidCycleRes = await profilePatch(invalidCycleReq);
      expect(invalidCycleRes.status).toBe(422);
      const invalidCycleJson = (await invalidCycleRes.json()) as { error: { code: string } };
      expect(invalidCycleJson.error.code).toBe("INVALID_CYCLE_DAY");

      // Invalid cycleStartDay '0' -> 422 INVALID_CYCLE_DAY
      const zeroCycleReq = makeAuthedRequest("http://localhost:3000/api/account/profile", "PATCH", sessionCookie, {
        cycleStartDay: "0",
      });
      const zeroCycleRes = await profilePatch(zeroCycleReq);
      expect(zeroCycleRes.status).toBe(422);
      expect(((await zeroCycleRes.json()) as { error: { code: string } }).error.code).toBe("INVALID_CYCLE_DAY");

      // Empty name -> 422 VALIDATION_ERROR
      const emptyNameReq = makeAuthedRequest("http://localhost:3000/api/account/profile", "PATCH", sessionCookie, {
        name: "   ",
      });
      const emptyNameRes = await profilePatch(emptyNameReq);
      expect(emptyNameRes.status).toBe(422);
    });

    it("successfully updates name, locale, theme, and cycleStartDay, sets cookies, and returns sanitized DTO without passwordHash", async () => {
      const { userId, sessionCookie, email } = await createRegisteredUser("prof-ok");

      const updateReq = makeAuthedRequest("http://localhost:3000/api/account/profile", "PATCH", sessionCookie, {
        name: "Nama Lengkap Terverifikasi",
        locale: "en",
        theme: "dark",
        cycleStartDay: "15",
      });
      const updateRes = await profilePatch(updateReq);
      expect(updateRes.status).toBe(200);

      const updateJson = (await updateRes.json()) as {
        ok: boolean;
        data: { user: Record<string, unknown> };
      };
      expect(updateJson.ok).toBe(true);
      expect(updateJson.data.user).toEqual({
        id: userId,
        name: "Nama Lengkap Terverifikasi",
        email,
        locale: "en",
        theme: "dark",
        cycleStartDay: "15",
      });
      // Guarantees zero leakage of passwordHash in DTO
      expect(updateJson.data.user.passwordHash).toBeUndefined();

      // Verifies cookie headers for noka_locale and noka_theme
      const setCookies = extractSetCookies(updateRes);
      expect(setCookies.some((c) => c.includes("noka_locale=en"))).toBe(true);
      expect(setCookies.some((c) => c.includes("noka_theme=dark"))).toBe(true);

      // Also updates to end_of_month cleanly
      const eomReq = makeAuthedRequest("http://localhost:3000/api/account/profile", "PATCH", sessionCookie, {
        cycleStartDay: "end_of_month",
      });
      const eomRes = await profilePatch(eomReq);
      expect(eomRes.status).toBe(200);
      const eomJson = (await eomRes.json()) as { data: { user: { cycleStartDay: string } } };
      expect(eomJson.data.user.cycleStartDay).toBe("end_of_month");
    });
  });

  describe("PATCH /api/account/password (AC-10.2)", () => {
    it("enforces authentication (401), CSRF (403), JSON parsing (400), and password length min 8 (422)", async () => {
      const { sessionCookie } = await createRegisteredUser("pass-sec");

      // 1. Unauthenticated -> 401
      const unauthReq = makeAuthedRequest("http://localhost:3000/api/account/password", "PATCH", undefined, {
        currentPassword: "password123",
        newPassword: "newpassword456",
      });
      expect((await passwordPatch(unauthReq)).status).toBe(401);

      // 2. CSRF mismatch -> 403
      const csrfReq = makeAuthedRequest(
        "http://localhost:3000/api/account/password",
        "PATCH",
        sessionCookie,
        { currentPassword: "password123", newPassword: "newpassword456" },
        "https://attacker.org",
      );
      expect((await passwordPatch(csrfReq)).status).toBe(403);

      // 3. Short new password < 8 -> 422
      const shortPassReq = makeAuthedRequest("http://localhost:3000/api/account/password", "PATCH", sessionCookie, {
        currentPassword: "password123",
        newPassword: "short",
      });
      expect((await passwordPatch(shortPassReq)).status).toBe(422);
    });

    it("rejects wrong current password with 401 INVALID_CURRENT_PASSWORD without invalidating session", async () => {
      const { sessionCookie, email } = await createRegisteredUser("pass-wrong", "mypassword123");

      const wrongReq = makeAuthedRequest("http://localhost:3000/api/account/password", "PATCH", sessionCookie, {
        currentPassword: "wrongpassword123",
        newPassword: "brandnewpassword456",
      });
      const wrongRes = await passwordPatch(wrongReq);
      expect(wrongRes.status).toBe(401);
      const wrongJson = (await wrongRes.json()) as { error: { code: string } };
      expect(wrongJson.error.code).toBe("INVALID_CURRENT_PASSWORD");

      // Existing login still functions with the original password
      const loginReq = makeAuthedRequest("http://localhost:3000/api/auth/login", "POST", undefined, {
        email,
        password: "mypassword123",
      });
      const loginRes = await loginPost(loginReq);
      expect(loginRes.status).toBe(200);
    });

    it("updates password hash and revokes other sessions while keeping the current session active", async () => {
      const { userId, sessionCookie: session1Cookie, email } = await createRegisteredUser(
        "pass-ok",
        "oldpassword123",
      );

      // Login a 2nd device/browser to produce an additional active session
      const login2Req = makeAuthedRequest("http://localhost:3000/api/auth/login", "POST", undefined, {
        email,
        password: "oldpassword123",
      });
      const login2Res = await loginPost(login2Req);
      expect(login2Res.status).toBe(200);
      const session2Cookie = extractSessionCookie(login2Res);

      // Verify DB currently has 2 sessions for this user
      const db = getDb();
      const sessionsBefore = await db.select().from(sessions).where(eq(sessions.userId, userId));
      expect(sessionsBefore).toHaveLength(2);

      // Device 2 changes password
      const changeReq = makeAuthedRequest("http://localhost:3000/api/account/password", "PATCH", session2Cookie, {
        currentPassword: "oldpassword123",
        newPassword: "newpassword789",
      });
      const changeRes = await passwordPatch(changeReq);
      expect(changeRes.status).toBe(200);

      // Device 1 session must now be revoked from DB
      const sessionsAfter = await db.select().from(sessions).where(eq(sessions.userId, userId));
      expect(sessionsAfter).toHaveLength(1);

      // Device 1 request with old session cookie is now rejected with 401 UNAUTHORIZED
      const device1Req = makeAuthedRequest("http://localhost:3000/api/account/profile", "PATCH", session1Cookie, {
        name: "Nama Device 1",
      });
      expect((await profilePatch(device1Req)).status).toBe(401);

      // Old password fails on next login attempt -> 401 INVALID_CREDENTIALS
      const oldLoginReq = makeAuthedRequest("http://localhost:3000/api/auth/login", "POST", undefined, {
        email,
        password: "oldpassword123",
      });
      expect((await loginPost(oldLoginReq)).status).toBe(401);

      // New password succeeds on next login attempt -> 200
      const newLoginReq = makeAuthedRequest("http://localhost:3000/api/auth/login", "POST", undefined, {
        email,
        password: "newpassword789",
      });
      expect((await loginPost(newLoginReq)).status).toBe(200);
    });
  });

  describe("DELETE /api/account (AC-10.3)", () => {
    it("enforces authentication (401), CSRF (403), JSON parsing (400), and password required (422)", async () => {
      const { sessionCookie } = await createRegisteredUser("del-sec");

      // 1. Unauthenticated -> 401
      const unauthReq = makeAuthedRequest("http://localhost:3000/api/account", "DELETE", undefined, {
        password: "password123",
      });
      expect((await accountDelete(unauthReq)).status).toBe(401);

      // 2. CSRF mismatch -> 403
      const csrfReq = makeAuthedRequest(
        "http://localhost:3000/api/account",
        "DELETE",
        sessionCookie,
        { password: "password123" },
        "https://attacker.com",
      );
      expect((await accountDelete(csrfReq)).status).toBe(403);

      // 3. Missing/empty password -> 422
      const emptyReq = makeAuthedRequest("http://localhost:3000/api/account", "DELETE", sessionCookie, {});
      expect((await accountDelete(emptyReq)).status).toBe(422);
    });

    it("rejects wrong confirmation password with 401 INVALID_PASSWORD without deleting anything", async () => {
      const { userId, sessionCookie } = await createRegisteredUser("del-wrong", "correctpass123");

      const wrongReq = makeAuthedRequest("http://localhost:3000/api/account", "DELETE", sessionCookie, {
        password: "wrongpass123",
      });
      const wrongRes = await accountDelete(wrongReq);
      expect(wrongRes.status).toBe(401);
      const wrongJson = (await wrongRes.json()) as { error: { code: string } };
      expect(wrongJson.error.code).toBe("INVALID_PASSWORD");

      // User row still exists intact
      const db = getDb();
      const userRows = await db.select().from(users).where(eq(users.id, userId));
      expect(userRows).toHaveLength(1);
    });

    it("handles concurrent deletion race: returns 401 UNAUTHORIZED if user row disappears under lock", async () => {
      const fakeUserId = crypto.randomUUID();
      await expect(deleteAccount(fakeUserId, "anypass123")).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHORIZED",
      });
    });

    it("atomically deletes transfers, transactions, wallets, categories, notes, and attachment storage files without FK RESTRICT errors", async () => {
      // 1. Configure temporary test storage directory
      const tempStorageDir = await mkdtemp(path.join(os.tmpdir(), "noka-test-account-storage-"));
      tempDirs.push(tempStorageDir);
      process.env.LOCAL_UPLOADS_DIR = tempStorageDir;
      resetEnvCacheForTest();

      const { userId, sessionCookie, email } = await createRegisteredUser(
        "del-full",
        "supersecret123",
      );

      // 2. Seed a full user data graph:
      // A. Wallets
      const w1Req = makeAuthedRequest("http://localhost:3000/api/wallets", "POST", sessionCookie, {
        name: "Dompet Utama",
        type: "bank",
        initialBalance: 500000,
        includeInSafeToSpend: true,
      });
      const w1Res = await walletsPost(w1Req);
      const w1Id = ((await w1Res.json()) as { data: { wallet: { id: string } } }).data.wallet.id;

      const w2Req = makeAuthedRequest("http://localhost:3000/api/wallets", "POST", sessionCookie, {
        name: "Dompet Kas",
        type: "cash",
        initialBalance: 100000,
        includeInSafeToSpend: true,
      });
      const w2Res = await walletsPost(w2Req);
      const w2Id = ((await w2Res.json()) as { data: { wallet: { id: string } } }).data.wallet.id;

      // B. Transfer between wallets (which creates RESTRICT FKs on both fromWalletId and toWalletId!)
      const transferReq = makeAuthedRequest("http://localhost:3000/api/transfers", "POST", sessionCookie, {
        fromWalletId: w1Id,
        toWalletId: w2Id,
        amount: 50000,
        note: "Uang saku kas",
        occurredAt: new Date().toISOString(),
      });
      const transferRes = await transfersPost(transferReq);
      expect(transferRes.status).toBe(201);

      // C. Note
      const noteReq = makeAuthedRequest("http://localhost:3000/api/notes", "POST", sessionCookie, {
        title: "Catatan Pribadi",
        content: "Rahasia penting",
      });
      const noteRes = await notesPost(noteReq);
      expect(noteRes.status).toBe(201);
      const noteId = ((await noteRes.json()) as { data: { note: { id: string } } }).data.note.id;

      // D. Upload an image attachment using LocalStorageAdapter
      const localAdapter = new LocalStorageAdapter(tempStorageDir);
      const uploadedAtt = await uploadNoteAttachment(
        userId,
        noteId,
        VALID_PNG,
        "image/png",
        localAdapter,
      );

      const db = getDb();
      const [attRow] = await db
        .select({ storageKey: noteAttachments.storageKey })
        .from(noteAttachments)
        .where(eq(noteAttachments.id, uploadedAtt.attachment.id));
      expect(attRow?.storageKey).toBeDefined();

      // Verify the attachment binary exists on disk prior to account deletion
      const diskFilePath = path.join(tempStorageDir, attRow.storageKey);
      expect(existsSync(diskFilePath)).toBe(true);

      // Verify DB has entities populated
      expect((await db.select().from(transfers).where(eq(transfers.userId, userId)))).toHaveLength(1);
      expect((await db.select().from(wallets).where(eq(wallets.userId, userId))).length).toBeGreaterThanOrEqual(2);
      expect((await db.select().from(noteAttachments).where(eq(noteAttachments.userId, userId)))).toHaveLength(1);

      // 3. Execute self-service account deletion
      const deleteReq = makeAuthedRequest("http://localhost:3000/api/account", "DELETE", sessionCookie, {
        password: "supersecret123",
      });
      const deleteRes = await accountDelete(deleteReq);
      expect(deleteRes.status).toBe(200);

      const deleteJson = (await deleteRes.json()) as { ok: boolean; data: { deleted: boolean } };
      expect(deleteJson.ok).toBe(true);
      expect(deleteJson.data.deleted).toBe(true);

      // 4. Verify cookie is wiped with Max-Age=0
      const setCookies = extractSetCookies(deleteRes);
      expect(setCookies.some((c) => c.includes("noka_session=;") || c.includes("Max-Age=0"))).toBe(true);

      // 5. Verify 100% database entities for this user are purged without FK errors
      expect((await db.select().from(users).where(eq(users.id, userId)))).toHaveLength(0);
      expect((await db.select().from(sessions).where(eq(sessions.userId, userId)))).toHaveLength(0);
      expect((await db.select().from(transfers).where(eq(transfers.userId, userId)))).toHaveLength(0);
      expect((await db.select().from(transactions).where(eq(transactions.userId, userId)))).toHaveLength(0);
      expect((await db.select().from(wallets).where(eq(wallets.userId, userId)))).toHaveLength(0);
      expect((await db.select().from(categories).where(eq(categories.userId, userId)))).toHaveLength(0);
      expect((await db.select().from(notes).where(eq(notes.userId, userId)))).toHaveLength(0);
      expect((await db.select().from(noteAttachments).where(eq(noteAttachments.userId, userId)))).toHaveLength(0);

      // 6. Verify attachment file on disk is removed
      expect(existsSync(diskFilePath)).toBe(false);

      // 7. Verify subsequent login attempt fails
      const postDeleteLoginReq = makeAuthedRequest("http://localhost:3000/api/auth/login", "POST", undefined, {
        email,
        password: "supersecret123",
      });
      expect((await loginPost(postDeleteLoginReq)).status).toBe(401);
    });

    it("resiliently logs warning if deleteUserAttachmentObjects encounters partial failure without failing the account deletion", async () => {
      const { userId, sessionCookie } = await createRegisteredUser("del-storage-fail", "password123");

      // Seed a note and attachment so keysToDelete has keys
      const noteReq = makeAuthedRequest("http://localhost:3000/api/notes", "POST", sessionCookie, {
        title: "Catatan Lampiran Partial",
        content: "Halo",
      });
      const noteRes = await notesPost(noteReq);
      const noteId = ((await noteRes.json()) as { data: { note: { id: string } } }).data.note.id;

      const tempStorageDir = await mkdtemp(path.join(os.tmpdir(), "noka-test-partial-"));
      tempDirs.push(tempStorageDir);
      const localAdapter = new LocalStorageAdapter(tempStorageDir);
      await uploadNoteAttachment(userId, noteId, VALID_PNG, "image/png", localAdapter);

      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      // Simulate a partial storage failure during deleteUserAttachmentObjects
      const attachmentsService = await import("@/features/notes/attachments-service");
      vi.spyOn(attachmentsService, "deleteUserAttachmentObjects").mockResolvedValueOnce({
        failedKeys: ["users/fake-key-1.png"],
      });

      const deleteReq = makeAuthedRequest("http://localhost:3000/api/account", "DELETE", sessionCookie, {
        password: "password123",
      });
      const deleteRes = await accountDelete(deleteReq);
      expect(deleteRes.status).toBe(200);

      // Verify warning logged with opaque failed keys
      expect(warnSpy).toHaveBeenCalledWith(
        "account_storage_cleanup_partial",
        expect.objectContaining({
          failedKeyCount: 1,
          failedKeys: ["users/fake-key-1.png"],
        }),
      );
    });
  });
});
