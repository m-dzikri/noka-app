// @vitest-environment node

import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmailsMock } = vi.hoisted(() => ({
  sendEmailsMock: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = {
      send: sendEmailsMock,
    };
  },
}));

import {
  registerClientLogoutCleanup,
  runClientLogoutCleanup,
} from "@/features/auth/client-cleanup";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import {
  generateTokenPair,
  hashPassword,
  hashToken,
  verifyPassword,
} from "@/features/auth/password";
import { ApiError } from "@/lib/api-response";
import { resetEnvCacheForTest } from "@/lib/env";
import {
  apiFetch,
  setUnauthorizedRedirectHandlerForTest,
} from "@/lib/http-client";
import { ResendMailer } from "@/lib/mailer/resend";
import {
  checkRateLimit,
  clearRateLimitsForTest,
  extractClientIp,
} from "@/lib/rate-limit";

describe("auth crypto, CSRF, rate limiter, and apiFetch cleanup (TS-002-01)", () => {
  const envMap = process.env as Record<string, string | undefined>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/noka_test",
      APP_URL: "http://localhost:3000",
      SESSION_SECRET: "unit-test-secret-with-more-than-32-characters",
    });
    resetEnvCacheForTest();
    clearRateLimitsForTest();
    sendEmailsMock.mockReset();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete envMap[key];
      }
    }
    Object.assign(process.env, originalEnv);
    resetEnvCacheForTest();
    clearRateLimitsForTest();
    setUnauthorizedRedirectHandlerForTest(null);
    sendEmailsMock.mockReset();
    vi.restoreAllMocks();
  });

  it("hashes passwords with bcrypt cost >= 12 and verifies constant-time comparison", async () => {
    const hash = await hashPassword("rahasia123");
    expect(bcrypt.getRounds(hash)).toBeGreaterThanOrEqual(12);
    expect(hash).not.toContain("rahasia123");
    await expect(verifyPassword("rahasia123", hash)).resolves.toBe(true);
    await expect(verifyPassword("salah-total", hash)).resolves.toBe(false);
  }, 15_000);

  it("generates unique 32-byte base64url tokens paired with SHA-256 hex hashes", () => {
    const first = generateTokenPair();
    const second = generateTokenPair();

    expect(first.rawToken).not.toBe(second.rawToken);
    expect(Buffer.from(first.rawToken, "base64url")).toHaveLength(32);
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(first.rawToken)).toBe(first.tokenHash);
  });

  it("enforces sliding-window rate limits with Retry-After and automatic pruning", () => {
    const startMs = 1_700_000_000_000;
    const windowMs = 15 * 60 * 1000;

    for (let i = 0; i < 5; i += 1) {
      const attempt = checkRateLimit(
        "auth:forgot-password",
        "203.0.113.10:user@example.test",
        5,
        windowMs,
        startMs + i * 1_000,
      );
      expect(attempt.allowed).toBe(true);
      expect(attempt.remaining).toBe(5 - (i + 1));
    }

    const blocked = checkRateLimit(
      "auth:forgot-password",
      "203.0.113.10:user@example.test",
      5,
      windowMs,
      startMs + 10_000,
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(890);

    // Populate > 500 expired buckets to trigger stale bucket pruning.
    for (let i = 0; i < 510; i += 1) {
      checkRateLimit("sweep-bucket", `old-${i}`, 2, 1_000, startMs);
    }

    // After the oldest attempt ages out (+1s increments across 5 attempts),
    // pruning preserves the remaining 4 active attempts so only 1 slot frees up.
    const partiallyRecovered = checkRateLimit(
      "auth:forgot-password",
      "203.0.113.10:user@example.test",
      5,
      windowMs,
      startMs + windowMs + 1,
    );
    expect(partiallyRecovered.allowed).toBe(true);
    expect(partiallyRecovered.remaining).toBe(0);

    // After full window passes since the newest timestamp, quota resets cleanly.
    const recovered = checkRateLimit(
      "auth:forgot-password",
      "203.0.113.10:user@example.test",
      5,
      windowMs,
      startMs + windowMs * 2 + 2,
    );
    expect(recovered.allowed).toBe(true);
    expect(recovered.remaining).toBe(4);

    const proxiedReq = new Request("http://localhost:3000/api/auth/login", {
      headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" },
    });
    expect(extractClientIp(proxiedReq)).toBe("198.51.100.7");

    const realIpReq = new Request("http://localhost:3000/api/auth/login", {
      headers: { "x-real-ip": "198.51.100.9" },
    });
    expect(extractClientIp(realIpReq)).toBe("198.51.100.9");
    expect(extractClientIp(new Request("http://localhost:3000"))).toBe(
      "127.0.0.1",
    );
  });

  it("validates CSRF Origin/Referer headers against APP_URL and forwarded Host", () => {
    const validOriginReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    expect(() => verifyCsrfOrigin(validOriginReq)).not.toThrow();

    const validRefererReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { referer: "http://localhost:3000/login?next=/app" },
    });
    expect(() => verifyCsrfOrigin(validRefererReq)).not.toThrow();

    const validForwardedReq = new NextRequest(
      "https://preview.noka.example/api/auth/login",
      {
        method: "POST",
        headers: {
          origin: "https://preview.noka.example",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "preview.noka.example",
        },
      },
    );
    expect(() => verifyCsrfOrigin(validForwardedReq)).not.toThrow();

    const badCases = [
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
      }),
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { origin: "null" },
      }),
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { referer: "not-a-valid-url" },
      }),
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { origin: "https://evil.example.com" },
      }),
    ];

    for (const req of badCases) {
      expect(() => verifyCsrfOrigin(req)).toThrowError(
        expect.objectContaining({
          status: 403,
          code: "CSRF_ORIGIN_MISMATCH",
        }),
      );
    }
  });

  it("triggers runClientLogoutCleanup strictly on 401 UNAUTHORIZED while keeping UI preferences", async () => {
    const storageMap = new Map<string, string>([
      ["noka_theme", "dark"],
      ["noka_locale", "en"],
      ["noka_privacy_blur", "true"],
      ["noka_private_draft", "rahasia"],
    ]);

    const mockStorage = {
      get length() {
        return storageMap.size;
      },
      key: (idx: number) => Array.from(storageMap.keys())[idx] ?? null,
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, val: string) => {
        storageMap.set(key, val);
      },
      removeItem: (key: string) => {
        storageMap.delete(key);
      },
      clear: () => {
        storageMap.clear();
      },
    };

    vi.stubGlobal("window", { localStorage: mockStorage });
    const cleanupCallback = vi.fn().mockResolvedValue(undefined);
    const unregister = registerClientLogoutCleanup(cleanupCallback);
    const redirectMock = vi.fn();
    setUnauthorizedRedirectHandlerForTest(redirectMock);

    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: false,
              error: { code: "INVALID_CREDENTIALS", message: "Wrong password" },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: false,
              error: {
                code: "INVALID_CURRENT_PASSWORD",
                message: "Current password mismatch",
              },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: false,
              error: { code: "UNAUTHORIZED", message: "Session revoked" },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        );
      vi.stubGlobal("fetch", fetchMock);

      const resCred = await apiFetch("/api/auth/login", { method: "POST" });
      expect(resCred.status).toBe(401);
      expect(cleanupCallback).not.toHaveBeenCalled();
      expect(redirectMock).not.toHaveBeenCalled();
      expect(storageMap.get("noka_private_draft")).toBe("rahasia");

      const resCurrentPwd = await apiFetch("/api/account/password", {
        method: "PATCH",
      });
      expect(resCurrentPwd.status).toBe(401);
      expect(cleanupCallback).not.toHaveBeenCalled();
      expect(redirectMock).not.toHaveBeenCalled();
      expect(storageMap.get("noka_private_draft")).toBe("rahasia");

      const resUnauthorized = await apiFetch("/api/auth/me");
      expect(resUnauthorized.status).toBe(401);
      expect(await resUnauthorized.json()).toEqual({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Session revoked" },
      });
      expect(cleanupCallback).toHaveBeenCalledTimes(1);
      expect(redirectMock).toHaveBeenCalledWith("/login");

      expect(storageMap.has("noka_private_draft")).toBe(false);
      expect(storageMap.get("noka_theme")).toBe("dark");
      expect(storageMap.get("noka_locale")).toBe("en");
      expect(storageMap.get("noka_privacy_blur")).toBe("true");

      // Direct runClientLogoutCleanup also respects preserved UI keys.
      storageMap.set("noka_private_notes_cache", "cached");
      await runClientLogoutCleanup();
      expect(cleanupCallback).toHaveBeenCalledTimes(2);
      expect(storageMap.has("noka_private_notes_cache")).toBe(false);
      expect(storageMap.get("noka_theme")).toBe("dark");
    } finally {
      unregister();
      vi.unstubAllGlobals();
    }
  });

  it("retains active staggered rate-limit timestamps across >500-key bucket sweeps", () => {
    const startMs = 1_700_000_000_000;
    const windowMs = 15 * 60 * 1000;
    const staggerOffsetMs = 5 * 60 * 1000; // +300s inside the 900s window

    // Initial attempt at t=0, followed by 4 staggered attempts at t=+300s (total 5).
    expect(
      checkRateLimit("auth:login", "staggered-user", 5, windowMs, startMs).allowed,
    ).toBe(true);
    for (let i = 0; i < 4; i += 1) {
      expect(
        checkRateLimit(
          "auth:login",
          "staggered-user",
          5,
          windowMs,
          startMs + staggerOffsetMs + i,
        ).allowed,
      ).toBe(true);
    }

    // Seed >500 short-lived expired buckets at t=0, then trigger sweep at t=+905s
    // when the t=0 attempt expired but the 4 attempts at t=+300s still remain active.
    for (let i = 0; i < 510; i += 1) {
      checkRateLimit("sweep-short", `k-${i}`, 2, 1_000, startMs);
    }
    checkRateLimit("sweep-trigger", "probe", 2, 1_000, startMs + windowMs + 5_000);

    // Only the t=0 attempt aged out -> 4 attempts survive, leaving 1 remaining slot.
    const fifthActive = checkRateLimit(
      "auth:login",
      "staggered-user",
      5,
      windowMs,
      startMs + windowMs + 5_000,
    );
    expect(fifthActive.allowed).toBe(true);
    expect(fifthActive.remaining).toBe(0);

    const sixthBlocked = checkRateLimit(
      "auth:login",
      "staggered-user",
      5,
      windowMs,
      startMs + windowMs + 6_000,
    );
    expect(sixthBlocked.allowed).toBe(false);
    expect(sixthBlocked.retryAfterSeconds).toBe(294);
  });

  it("delivers escaped password reset emails via ResendMailer and maps errors to 503 safely", async () => {
    delete envMap.RESEND_API_KEY;
    delete envMap.EMAIL_FROM;
    resetEnvCacheForTest();
    expect(() => new ResendMailer()).toThrowError(ApiError);
    try {
      new ResendMailer();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(503);
      expect((error as ApiError).code).toBe("MAIL_DELIVERY_UNAVAILABLE");
    }

    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Noka <noreply@noka.test>";
    resetEnvCacheForTest();
    const mailer = new ResendMailer();

    sendEmailsMock.mockResolvedValueOnce({ data: { id: "msg_1" }, error: null });
    await mailer.sendPasswordReset({
      to: "dinda@noka.test",
      name: "<Dinda>",
      resetUrl: "https://noka.app/reset-password?token=raw-secret-token",
      locale: "id",
    });

    expect(sendEmailsMock).toHaveBeenCalledTimes(1);
    const sentPayload = sendEmailsMock.mock.calls[0][0] as {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(sentPayload.from).toBe("Noka <noreply@noka.test>");
    expect(sentPayload.to).toBe("dinda@noka.test");
    expect(sentPayload.subject).toBe("Atur ulang kata sandi Noka Anda");
    expect(sentPayload.html).toContain("&lt;Dinda&gt;");
    expect(sentPayload.html).toContain(
      "https://noka.app/reset-password?token=raw-secret-token",
    );
    expect(sentPayload.text).toContain(
      "https://noka.app/reset-password?token=raw-secret-token",
    );

    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    sendEmailsMock.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "Bad sender" },
    });
    await expect(
      mailer.sendPasswordReset({
        to: "secret-user@noka.test",
        name: "Raka",
        resetUrl: "https://noka.app/reset-password?token=secret-token-2",
        locale: "en",
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "MAIL_DELIVERY_UNAVAILABLE",
    });

    sendEmailsMock.mockRejectedValueOnce(new Error("Upstream socket closed"));
    await expect(
      mailer.sendPasswordReset({
        to: "secret-user@noka.test",
        name: "Raka",
        resetUrl: "https://noka.app/reset-password?token=secret-token-3",
        locale: "en",
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "MAIL_DELIVERY_UNAVAILABLE",
    });

    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(stderrOutput).toContain("mailer.resend_rejected");
    expect(stderrOutput).toContain("mailer.resend_failed");
    expect(stderrOutput).not.toContain("secret-user@noka.test");
    expect(stderrOutput).not.toContain("secret-token-2");
    expect(stderrOutput).not.toContain("secret-token-3");
  });
});

