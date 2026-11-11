import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema/auth";
import { POST as forgotPost } from "@/app/api/auth/forgot-password/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { GET as meGet } from "@/app/api/auth/me/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { POST as resetPost } from "@/app/api/auth/reset-password/route";
import { GET as outboxGet } from "@/app/api/dev/outbox/route";
import { hashToken } from "@/features/auth/password";
import { resetEnvCacheForTest } from "@/lib/env";
import * as mailerModule from "@/lib/mailer";
import { clearOutbox } from "@/lib/mailer/dev";
import { clearRateLimitsForTest } from "@/lib/rate-limit";

const createdUserIds: string[] = [];

function getSessionCookieFromHeaders(res: Response): string {
  const headers = res.headers as unknown as { getSetCookie?: () => string[] };
  const cookies = headers.getSetCookie ? headers.getSetCookie() : [];
  const line = cookies.find((c) => c.startsWith("noka_session=")) ?? "";
  return line.slice("noka_session=".length).split(";")[0] ?? "";
}

describe("forgot password, dev outbox, production mailer fallback, and atomic reset (TS-002-03)", () => {
  const envMap = process.env as Record<string, string | undefined>;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = envMap.NODE_ENV;
    clearRateLimitsForTest();
    clearOutbox();
    resetEnvCacheForTest();
  });

  afterEach(async () => {
    envMap.NODE_ENV = originalNodeEnv;
    clearRateLimitsForTest();
    clearOutbox();
    resetEnvCacheForTest();
    vi.restoreAllMocks();

    if (createdUserIds.length > 0) {
      await getDb()
        .delete(users)
        .where(inArray(users.id, [...createdUserIds]));
      createdUserIds.length = 0;
    }
  });

  it("returns identical 200 for existing vs unknown email, hashes 30m token, keeps prior token active, and serves /api/dev/outbox", async () => {
    const email = `reset.${crypto.randomUUID()}@example.test`;
    const regRes = await registerPost(
      new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Noka User",
          email,
          password: "InitialPassword123",
          locale: "en",
          theme: "light",
        }),
      }),
    );
    const regJson = (await regRes.json()) as { data: { user: { id: string } } };
    const userId = regJson.data.user.id;
    createdUserIds.push(userId);

    const forgotRegistered = await forgotPost(
      new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          cookie: "noka_locale=id",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email }),
      }),
    );
    const forgotUnknown = await forgotPost(
      new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          cookie: "noka_locale=id",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: `missing.${crypto.randomUUID()}@example.test`,
        }),
      }),
    );

    expect(forgotRegistered.status).toBe(200);
    expect(forgotUnknown.status).toBe(200);
    expect(await forgotRegistered.json()).toEqual(await forgotUnknown.json());

    // Email uses user's persisted locale ("en"), not request cookie ("id").
    const outboxRes = await outboxGet();
    expect(outboxRes.status).toBe(200);
    const outboxJson = (await outboxRes.json()) as {
      ok: boolean;
      data: {
        emails: Array<{
          to: string;
          resetUrl: string;
          locale: string;
          subject: string;
        }>;
      };
    };
    expect(outboxJson.data.emails).toHaveLength(1);
    const emailEntry = outboxJson.data.emails[0];
    expect(emailEntry.to).toBe(email);
    expect(emailEntry.locale).toBe("en");
    expect(emailEntry.subject).toContain("Reset your Noka password");

    const rawToken = new URL(emailEntry.resetUrl).searchParams.get("token");
    expect(rawToken).toBeTruthy();

    const storedTokens = await getDb()
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    expect(storedTokens).toHaveLength(1);
    expect(storedTokens[0].tokenHash).toBe(hashToken(rawToken!));
    expect(storedTokens[0].usedAt).toBeNull();
    const ttlMinutes =
      (storedTokens[0].expiresAt.getTime() -
        storedTokens[0].createdAt.getTime()) /
      60_000;
    expect(ttlMinutes).toBeCloseTo(30, 0);

    // Issue a second reset link: both tokens stay valid until reset/expiry.
    await forgotPost(
      new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email }),
      }),
    );
    const afterSecond = await getDb()
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond.every((t) => t.usedAt === null)).toBe(true);

    // Hides dev outbox in production (404 NOT_FOUND) and returns 503 if Resend fails/unconfigured.
    envMap.NODE_ENV = "production";
    resetEnvCacheForTest();

    const prodOutboxRes = await outboxGet();
    expect(prodOutboxRes.status).toBe(404);

    const prodUnconfiguredForgot = await forgotPost(
      new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email }),
      }),
    );
    expect(prodUnconfiguredForgot.status).toBe(503);
    expect(await prodUnconfiguredForgot.json()).toMatchObject({
      ok: false,
      error: { code: "MAIL_DELIVERY_UNAVAILABLE" },
    });

    envMap.NODE_ENV = originalNodeEnv;
    resetEnvCacheForTest();
    vi.spyOn(mailerModule, "getMailer").mockReturnValue({
      sendPasswordReset: vi.fn().mockRejectedValue(
        new (await import("@/lib/api-response")).ApiError(
          503,
          "MAIL_DELIVERY_UNAVAILABLE",
          "Service down",
        ),
      ),
    });

    const transientFailRes = await forgotPost(
      new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email }),
      }),
    );
    expect(transientFailRes.status).toBe(503);

    vi.restoreAllMocks();
    for (let i = 0; i < 5; i += 1) {
      const okForgot = await forgotPost(
        new NextRequest("http://localhost:3000/api/auth/forgot-password", {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "x-forwarded-for": "198.51.100.99",
            "content-type": "application/json",
          },
          body: JSON.stringify({ email }),
        }),
      );
      expect(okForgot.status).toBe(200);
    }

    const sixthForgot = await forgotPost(
      new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "x-forwarded-for": "198.51.100.99",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email }),
      }),
    );
    expect(sixthForgot.status).toBe(429);
    expect(Number(sixthForgot.headers.get("Retry-After"))).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("enforces FOR UPDATE single-use race safety, invalidates active reset tokens, revokes all sessions, and rate-limits resets", async () => {
    const email = `race-reset.${crypto.randomUUID()}@example.test`;
    const regRes = await registerPost(
      new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Race User",
          email,
          password: "OldPassword123!",
        }),
      }),
    );
    const sessionA = getSessionCookieFromHeaders(regRes);
    const regJson = (await regRes.json()) as { data: { user: { id: string } } };
    const userId = regJson.data.user.id;
    createdUserIds.push(userId);

    // Create a second active session before resetting password.
    const loginRes = await loginPost(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password: "OldPassword123!" }),
      }),
    );
    const sessionB = getSessionCookieFromHeaders(loginRes);

    // Request 2 reset tokens so we verify both become invalid after reset.
    await forgotPost(
      new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email }),
      }),
    );
    await forgotPost(
      new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email }),
      }),
    );

    const outbox = await outboxGet();
    const outboxData = (await outbox.json()) as {
      data: { emails: Array<{ resetUrl: string }> };
    };
    const token1 = new URL(outboxData.data.emails[0].resetUrl).searchParams.get(
      "token",
    )!;
    const token2 = new URL(outboxData.data.emails[1].resetUrl).searchParams.get(
      "token",
    )!;

    // Concurrent reset race with token2: exactly one succeeds (200) and one fails (400).
    const makeResetReq = (token: string, newPassword: string) =>
      resetPost(
        new NextRequest("http://localhost:3000/api/auth/reset-password", {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "x-forwarded-for": "198.51.100.77",
            "content-type": "application/json",
          },
          body: JSON.stringify({ token, newPassword }),
        }),
      );

    const [raceRes1, raceRes2] = await Promise.all([
      makeResetReq(token2, "BrandNewPass123!"),
      makeResetReq(token2, "BrandNewPass123!"),
    ]);

    const statuses = [raceRes1.status, raceRes2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 400]);

    // Prior active reset token1 is now marked used too.
    const reusePrior = await makeResetReq(token1, "AnotherPass123!");
    expect(reusePrior.status).toBe(400);
    expect(await reusePrior.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_OR_EXPIRED_TOKEN" },
    });

    // Both prior active sessions were revoked immediately in DB (HIGH-4).
    const activeSessions = await getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId));
    expect(activeSessions).toHaveLength(0);

    expect(
      (
        await meGet(
          new NextRequest("http://localhost:3000/api/auth/me", {
            headers: { cookie: `noka_session=${sessionA}` },
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await meGet(
          new NextRequest("http://localhost:3000/api/auth/me", {
            headers: { cookie: `noka_session=${sessionB}` },
          }),
        )
      ).status,
    ).toBe(401);

    // Old password rejected, new password logs in successfully.
    const oldLogin = await loginPost(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password: "OldPassword123!" }),
      }),
    );
    expect(oldLogin.status).toBe(401);

    const newLogin = await loginPost(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password: "BrandNewPass123!" }),
      }),
    );
    expect(newLogin.status).toBe(200);

    // Remaining requests on same IP hit 5/15m limit -> 429 RATE_LIMITED.
    await makeResetReq("invalid-4", "BrandNewPass123!");
    await makeResetReq("invalid-5", "BrandNewPass123!");
    const sixthRes = await makeResetReq("invalid-6", "BrandNewPass123!");
    expect(sixthRes.status).toBe(429);
    expect(Number(sixthRes.headers.get("Retry-After"))).toBeGreaterThanOrEqual(
      1,
    );

    // Expired token manually tested on a fresh IP -> 400.
    const rawExpired = "expired-raw-token";
    await getDb().insert(passwordResetTokens).values({
      userId,
      tokenHash: hashToken(rawExpired),
      expiresAt: new Date(Date.now() - 10_000),
    });
    const expiredReset = await resetPost(
      new NextRequest("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "x-forwarded-for": "198.51.100.88",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: rawExpired,
          newPassword: "AnotherValidPassword123",
        }),
      }),
    );
    expect(expiredReset.status).toBe(400);
  });
});
