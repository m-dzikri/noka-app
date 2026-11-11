import { NextRequest } from "next/server";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as dbModule from "@/db";
import { GET } from "@/app/api/health/route";

describe("GET /api/health integration (TS-001-05)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns 200 OK when PostgreSQL answers SELECT 1", async () => {
    const req = new NextRequest("http://localhost:3000/api/health");
    const response = await GET(req);
    const body = (await response.json()) as {
      ok: boolean;
      data: { status: string; db: string; timestamp: string };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.db).toBe("connected");
    expect(Date.parse(body.data.timestamp)).not.toBeNaN();
  });

  it("returns 503 DB_UNAVAILABLE when PostgreSQL query errors", async () => {
    vi.spyOn(dbModule, "getPool").mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    } as unknown as Pool);

    const req = new NextRequest("http://localhost:3000/api/health");
    const response = await GET(req);
    const body = (await response.json()) as {
      ok: boolean;
      error: { code: string; message: string };
    };

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "DB_UNAVAILABLE",
        message: "Database health check failed",
      },
    });
  });

  it("returns 503 DB_UNAVAILABLE after 2000ms timeout when DB hangs", async () => {
    vi.useFakeTimers();
    vi.spyOn(dbModule, "getPool").mockReturnValue({
      query: vi.fn(
        () =>
          new Promise(() => {
            // Intentionally never settles to trigger the 2000 ms timeout guard.
          }),
      ),
    } as unknown as Pool);

    const req = new NextRequest("http://localhost:3000/api/health");
    const pendingResponse = GET(req);

    await vi.advanceTimersByTimeAsync(2_000);

    const response = await pendingResponse;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "DB_UNAVAILABLE",
        message: "Database health check failed",
      },
    });
  });
});

