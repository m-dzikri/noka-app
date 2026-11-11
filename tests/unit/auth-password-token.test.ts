// @vitest-environment node

import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { resetEnvCacheForTest } from "@/lib/env";
import {
  apiFetch,
  setUnauthorizedRedirectHandlerForTest,
} from "@/lib/http-client";
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
    vi.restoreAllMocks();
  });

  it("hashes passwords with bcrypt cost >= 12 and verifies constant-time comparison", async () => {
    const hash = await hashPassword("rahasia123");
    expect(bcrypt.getRounds(hash)).toBeGreaterThanOrEqual(12);
    expect(hash).not.toContain("rahasia123");
    await expect(verifyPassword("rahasia123", hash)).resolves.toBe(true);
    await expect(verifyPassword("salah-total", hash)).resolves.toBe(false);
  });

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

    // After full window elapsed, original bucket is allowed again cleanly.
    const recovered = checkRateLimit(
      "auth:forgot-password",
      "203.0.113.10:user@example.test",
      5,
      windowMs,
      startMs + windowMs + 1,
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
});

