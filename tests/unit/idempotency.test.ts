// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiError, apiOk, handleApiError } from "@/lib/api-response";
import {
  canonicalJson,
  resolveLwwTimestamp,
  withIdempotency,
} from "@/lib/idempotency";
import type { Logger } from "@/lib/logger";

describe("idempotency helpers, LWW & API envelope (TS-001-03)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces deterministic canonicalJson sorting keys recursively, skipping undefined, keeping array order, and stringifying bigint", () => {
    const a = canonicalJson({
      z: 1,
      skip: undefined,
      arr: [3, 1, 2],
      amount: BigInt("9007199254740993"),
      nested: { b: true, a: "hi", missing: undefined },
    });
    const b = canonicalJson({
      nested: { a: "hi", b: true },
      amount: BigInt("9007199254740993"),
      arr: [3, 1, 2],
      z: 1,
    });
    const differentArrayOrder = canonicalJson({
      nested: { a: "hi", b: true },
      amount: BigInt("9007199254740993"),
      arr: [1, 3, 2],
      z: 1,
    });

    expect(a).toBe(b);
    expect(a).not.toBe(differentArrayOrder);
    expect(a).toContain('"amount":"9007199254740993"');
  });

  it("formats apiOk, apiError, and handleApiError envelopes accurately", async () => {
    const okRes = apiOk({ id: "1" }, 201);
    expect(okRes.status).toBe(201);
    expect(await okRes.json()).toEqual({ ok: true, data: { id: "1" } });

    const errRes = apiError(422, "VALIDATION_ERROR", "Invalid", {
      field: "amount",
    });
    expect(errRes.status).toBe(422);
    expect(await errRes.json()).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid",
        details: { field: "amount" },
      },
    });

    const mockLog: Logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const apiErrRes = handleApiError(
      new ApiError(409, "IDEMPOTENCY_KEY_CONFLICT", "Mismatch"),
      mockLog,
    );
    expect(apiErrRes.status).toBe(409);
    expect(await apiErrRes.json()).toEqual({
      ok: false,
      error: { code: "IDEMPOTENCY_KEY_CONFLICT", message: "Mismatch" },
    });

    const syntaxRes = handleApiError(new SyntaxError("Unexpected end"), mockLog);
    expect(syntaxRes.status).toBe(400);
    expect(await syntaxRes.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_JSON" },
    });

    const unknownRes = handleApiError(new Error("sensitive detail"), mockLog);
    expect(unknownRes.status).toBe(500);
    expect(mockLog.error).toHaveBeenCalledTimes(1);
    expect(await unknownRes.json()).toEqual({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });

  it("resolves LWW timestamps with clock-skew clamping and INVALID_TIMESTAMP validation", () => {
    const fixedNow = new Date("2026-11-11T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const rowUpdatedAt = new Date("2026-11-11T11:59:00.000Z");

    const omitted = resolveLwwTimestamp(rowUpdatedAt, undefined);
    expect(omitted.serverNewer).toBe(false);
    expect(omitted.nextUpdatedAt.getTime()).toBe(fixedNow.getTime());

    const olderClient = resolveLwwTimestamp(
      rowUpdatedAt,
      "2026-11-11T11:58:00.000Z",
    );
    expect(olderClient.serverNewer).toBe(true);
    expect(olderClient.nextUpdatedAt.getTime()).toBe(rowUpdatedAt.getTime());

    const withinSkew = resolveLwwTimestamp(
      rowUpdatedAt,
      new Date(fixedNow.getTime() + 30_000).toISOString(),
    );
    expect(withinSkew.serverNewer).toBe(false);
    expect(withinSkew.nextUpdatedAt.getTime()).toBe(fixedNow.getTime() + 30_000);

    const excessiveFuture = resolveLwwTimestamp(
      rowUpdatedAt,
      new Date(fixedNow.getTime() + 3_600_000).toISOString(),
    );
    expect(excessiveFuture.serverNewer).toBe(false);
    expect(excessiveFuture.nextUpdatedAt.getTime()).toBe(
      fixedNow.getTime() + 60_000,
    );

    expect(() => resolveLwwTimestamp(rowUpdatedAt, "not-a-timestamp")).toThrowError(
      ApiError,
    );
    try {
      resolveLwwTimestamp(rowUpdatedAt, "not-a-timestamp");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(422);
      expect((error as ApiError).code).toBe("INVALID_TIMESTAMP");
    }
  });

  it("rejects empty, whitespace-only, and over-128-character idempotency keys with 422 VALIDATION_ERROR", async () => {
    for (const badKey of ["", "   ", "k".repeat(129)]) {
      await expect(
        withIdempotency({
          userId: "user-1",
          idempotencyKey: badKey,
          method: "POST",
          path: "/api/wallets",
          payload: { name: "Test" },
          handler: async () => {
            throw new Error("Handler must not execute on invalid idempotencyKey");
          },
        }),
      ).rejects.toMatchObject({
        status: 422,
        code: "VALIDATION_ERROR",
      });
    }
  });
});

