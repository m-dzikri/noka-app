import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as dbModule from "@/db";
import { sessions, users } from "@/db/schema/auth";
import { categories } from "@/db/schema/finance";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { GET as meGet } from "@/app/api/auth/me/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { hashToken } from "@/features/auth/password";
import { getSessionUser } from "@/features/auth/session";

const createdUserIds: string[] = [];

function extractCookieValue(
  response: Response,
  cookieName: string,
): { value: string; rawHeader: string } | null {
  const headers = response.headers as unknown as {
    getSetCookie?: () => string[];
  };
  const setCookies = headers.getSetCookie
    ? headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];

  for (const rawHeader of setCookies) {
    if (rawHeader.startsWith(`${cookieName}=`)) {
      const value = rawHeader.slice(cookieName.length + 1).split(";")[0] ?? "";
      return { value, rawHeader };
    }
  }
  return null;
}

describe("auth registration, sessions, 12 categories, logout, and rate limits (TS-002-02)", () => {
  beforeEach(async () => {
    const { clearRateLimitsForTest } = await import("@/lib/rate-limit");
    const { resetEnvCacheForTest } = await import("@/lib/env");
    clearRateLimitsForTest();
    resetEnvCacheForTest();
  });

  afterEach(async () => {
    const { clearRateLimitsForTest } = await import("@/lib/rate-limit");
    const { resetEnvCacheForTest } = await import("@/lib/env");
    clearRateLimitsForTest();
    resetEnvCacheForTest();
    vi.restoreAllMocks();

    if (createdUserIds.length > 0) {
      await dbModule
        .getDb()
        .delete(users)
        .where(inArray(users.id, [...createdUserIds]));
      createdUserIds.length = 0;
    }
  });

  it("registers user with normalized email, 12 localized system categories, HttpOnly cookie, and /me profile", async () => {
    const uniqueEmail = `Raka.${crypto.randomUUID()}@Example.Test`;
    const registerReq = new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "  Raka Pratama  ",
        email: `  ${uniqueEmail} `,
        password: "password1234",
        locale: "en",
        theme: "dark",
      }),
    });

    const registerRes = await registerPost(registerReq);
    expect(registerRes.status).toBe(201);

    const registerJson = (await registerRes.json()) as {
      ok: boolean;
      data: {
        user: Record<string, unknown>;
      };
    };
    expect(registerJson.ok).toBe(true);
    expect(registerJson.data.user).toMatchObject({
      name: "Raka Pratama",
      email: uniqueEmail.toLowerCase(),
      locale: "en",
      theme: "dark",
      cycleStartDay: "1",
    });
    expect("passwordHash" in registerJson.data.user).toBe(false);

    const userId = String(registerJson.data.user.id);
    createdUserIds.push(userId);

    const sessionCookie = extractCookieValue(registerRes, "noka_session");
    expect(sessionCookie).not.toBeNull();
    expect(sessionCookie!.rawHeader).toContain("HttpOnly");
    expect(sessionCookie!.rawHeader.toLowerCase()).toContain("samesite=lax");
    expect(sessionCookie!.rawHeader).toContain("Path=/");
    expect(sessionCookie!.rawHeader).not.toContain("; Secure");

    expect(extractCookieValue(registerRes, "noka_locale")?.value).toBe("en");
    expect(extractCookieValue(registerRes, "noka_theme")?.value).toBe("dark");

    // Verify 12 system categories (8 expense + 4 income) were seeded in English inside transaction.
    const seededCategories = await dbModule
      .getDb()
      .select()
      .from(categories)
      .where(eq(categories.userId, userId));
    expect(seededCategories).toHaveLength(12);
    expect(seededCategories.every((row) => row.isSystem)).toBe(true);
    expect(seededCategories.filter((row) => row.type === "expense")).toHaveLength(8);
    expect(seededCategories.filter((row) => row.type === "income")).toHaveLength(4);
    expect(
      seededCategories.find((row) => row.systemKey === "food_drink")?.name,
    ).toBe("Food & Drink");

    // Duplicate email rejected with 409 EMAIL_ALREADY_EXISTS.
    const duplicateRes = await registerPost(
      new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Clone",
          email: uniqueEmail.toUpperCase(),
          password: "password1234",
        }),
      }),
    );
    expect(duplicateRes.status).toBe(409);
    expect(await duplicateRes.json()).toMatchObject({
      ok: false,
      error: { code: "EMAIL_ALREADY_EXISTS" },
    });

    // GET /api/auth/me succeeds with valid cookie and hides passwordHash.
    const meRes = await meGet(
      new NextRequest("http://localhost:3000/api/auth/me", {
        headers: { cookie: `noka_session=${sessionCookie!.value}` },
      }),
    );
    expect(meRes.status).toBe(200);
    const meJson = (await meRes.json()) as {
      ok: boolean;
      data: { user: Record<string, unknown> };
    };
    expect(meJson.data.user.cycleStartDay).toBe("1");
    expect("passwordHash" in meJson.data.user).toBe(false);
  });

  it("handles login failure/success, Secure cookie when HTTPS, zero-DB unauth cookie fast path, expiry, and idempotent logout", async () => {
    const email = `session.${crypto.randomUUID()}@example.test`;
    const registerRes = await registerPost(
      new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Dinda",
          email,
          password: "SecretPassword99",
          locale: "id",
          theme: "light",
        }),
      }),
    );
    const createdJson = (await registerRes.json()) as {
      data: { user: { id: string } };
    };
    createdUserIds.push(createdJson.data.user.id);
    const registerSessionCookie = extractCookieValue(registerRes, "noka_session");
    expect(registerSessionCookie).not.toBeNull();

    // Zero DB query when noka_session cookie is missing or malformed length.
    const getDbSpy = vi.spyOn(dbModule, "getDb");
    expect(
      await getSessionUser(new NextRequest("http://localhost:3000/api/auth/me")),
    ).toBeNull();
    expect(
      await getSessionUser(
        new NextRequest("http://localhost:3000/api/auth/me", {
          headers: { cookie: "noka_session=short" },
        }),
      ),
    ).toBeNull();
    expect(getDbSpy).not.toHaveBeenCalled();
    getDbSpy.mockRestore();

    // Unauthenticated /api/auth/me returns 401 UNAUTHORIZED.
    const unauthMe = await meGet(new NextRequest("http://localhost:3000/api/auth/me"));
    expect(unauthMe.status).toBe(401);
    expect(await unauthMe.json()).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });

    // Wrong password returns 401 INVALID_CREDENTIALS and logs do not leak secrets.
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const wrongLogin = await loginPost(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password: "WrongPassword!" }),
      }),
    );
    expect(wrongLogin.status).toBe(401);
    expect(await wrongLogin.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_CREDENTIALS" },
    });

    const unknownEmailLogin = await loginPost(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: `unknown.${crypto.randomUUID()}@example.test`,
          password: "SecretPassword99",
        }),
      }),
    );
    expect(unknownEmailLogin.status).toBe(401);
    expect(await unknownEmailLogin.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_CREDENTIALS" },
    });

    // Valid login under HTTPS APP_URL attaches Secure cookie attribute.
    const previousAppUrl = process.env.APP_URL;
    process.env.APP_URL = "https://noka.example.com";
    const { resetEnvCacheForTest } = await import("@/lib/env");
    resetEnvCacheForTest();

    const okLogin = await loginPost(
      new NextRequest("https://noka.example.com/api/auth/login", {
        method: "POST",
        headers: {
          origin: "https://noka.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password: "SecretPassword99" }),
      }),
    );
    expect(okLogin.status).toBe(200);
    const loginCookie = extractCookieValue(okLogin, "noka_session");
    expect(loginCookie!.rawHeader).toContain("Secure");

    process.env.APP_URL = previousAppUrl;
    resetEnvCacheForTest();

    // Active session works before logout and its DB row exists.
    const activeMe = await meGet(
      new NextRequest("http://localhost:3000/api/auth/me", {
        headers: { cookie: `noka_session=${loginCookie!.value}` },
      }),
    );
    expect(activeMe.status).toBe(200);
    const activeRowsBeforeLogout = await dbModule
      .getDb()
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.tokenHash, hashToken(loginCookie!.value)));
    expect(activeRowsBeforeLogout).toHaveLength(1);

    // Logout removes active DB row, clears cookie, and rejects reused session token with 401.
    const logoutRes1 = await logoutPost(
      new NextRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          cookie: `noka_session=${loginCookie!.value}`,
        },
      }),
    );
    expect(logoutRes1.status).toBe(200);
    expect(await logoutRes1.json()).toEqual({
      ok: true,
      data: { loggedOut: true },
    });
    expect(extractCookieValue(logoutRes1, "noka_session")?.rawHeader).toContain(
      "Max-Age=0",
    );

    const activeRowsAfterLogout = await dbModule
      .getDb()
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.tokenHash, hashToken(loginCookie!.value)));
    expect(activeRowsAfterLogout).toHaveLength(0);

    const postLogoutMe = await meGet(
      new NextRequest("http://localhost:3000/api/auth/me", {
        headers: { cookie: `noka_session=${loginCookie!.value}` },
      }),
    );
    expect(postLogoutMe.status).toBe(401);
    expect(await postLogoutMe.json()).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });

    // Force-expire separate session in DB -> rejected with 401 UNAUTHORIZED.
    await dbModule
      .getDb()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(sessions.tokenHash, hashToken(registerSessionCookie!.value)));

    const expiredMe = await meGet(
      new NextRequest("http://localhost:3000/api/auth/me", {
        headers: { cookie: `noka_session=${registerSessionCookie!.value}` },
      }),
    );
    expect(expiredMe.status).toBe(401);

    // Logout remains idempotent when called without cookie.
    const logoutRes2 = await logoutPost(
      new NextRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      }),
    );
    expect(logoutRes2.status).toBe(200);

    const allLogs = [
      ...stdoutSpy.mock.calls.map((c) => String(c[0])),
      ...stderrSpy.mock.calls.map((c) => String(c[0])),
    ].join("\n");
    expect(allLogs).not.toContain("SecretPassword99");
    expect(allLogs).not.toContain("WrongPassword!");
    expect(allLogs).not.toContain(loginCookie!.value);
  });

  it("enforces login/register rate limit (>10/15m) before Zod validation and blocks bad JSON / CSRF", async () => {
    const email = `ratelimit.${crypto.randomUUID()}@example.test`;

    // Malformed JSON -> 400 INVALID_JSON.
    const badJsonRes = await loginPost(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: "{not-json",
      }),
    );
    expect(badJsonRes.status).toBe(400);
    expect(await badJsonRes.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_JSON" },
    });

    // Missing Origin -> 403 CSRF_ORIGIN_MISMATCH.
    const csrfRes = await loginPost(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "x" }),
      }),
    );
    expect(csrfRes.status).toBe(403);

    // Send 10 intentionally Zod-invalid payloads (empty password) -> all rejected 422 while incrementing rate limiter.
    for (let i = 0; i < 10; i += 1) {
      const res = await loginPost(
        new NextRequest("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "x-forwarded-for": "198.51.100.55",
            "content-type": "application/json",
          },
          body: JSON.stringify({ email, password: "" }),
        }),
      );
      expect(res.status).toBe(422);
    }

    // 11th request hits 429 RATE_LIMITED with Retry-After before Zod validation.
    const limitedRes = await loginPost(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "x-forwarded-for": "198.51.100.55",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password: "" }),
      }),
    );
    expect(limitedRes.status).toBe(429);
    expect(Number(limitedRes.headers.get("Retry-After"))).toBeGreaterThanOrEqual(
      1,
    );
    expect(await limitedRes.json()).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" },
    });
  });
});
