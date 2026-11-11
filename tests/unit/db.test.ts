// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTest } from "@/lib/env";

const { poolConstructorMock, poolInstances } = vi.hoisted(() => {
  const instances: Array<{
    config: { connectionString?: string; ssl?: unknown };
    end: ReturnType<typeof vi.fn>;
  }> = [];

  const ctor = vi.fn(function MockPool(
    this: { config: { connectionString?: string; ssl?: unknown }; end: ReturnType<typeof vi.fn> },
    config: { connectionString?: string; ssl?: unknown },
  ) {
    this.config = config;
    this.end = vi.fn().mockResolvedValue(undefined);
    instances.push(this);
  });

  return { poolConstructorMock: ctor, poolInstances: instances };
});

vi.mock("pg", () => ({
  Pool: poolConstructorMock,
}));

import { getDb, getPool } from "@/db";

function clearGlobalDbState() {
  const globalStore = globalThis as Record<string, unknown>;
  delete globalStore.__nokaPool;
  delete globalStore.__nokaPoolUrl;
  delete globalStore.__nokaDb;
  delete globalStore.__nokaDbUrl;
}

describe("database singleton & SSL configuration", () => {
  const envMap = process.env as Record<string, string | undefined>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    poolConstructorMock.mockClear();
    poolInstances.length = 0;
    clearGlobalDbState();
    resetEnvCacheForTest();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete envMap[key];
      }
    }
    Object.assign(process.env, originalEnv);
    clearGlobalDbState();
    resetEnvCacheForTest();
  });

  it("reuses a single Pool and Drizzle instance in production mode", () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/noka_prod",
      APP_URL: "https://noka.example.com",
      SESSION_SECRET: "a".repeat(32),
    });
    resetEnvCacheForTest();

    const poolA = getPool();
    const poolB = getPool();
    const dbA = getDb();
    const dbB = getDb();

    expect(poolA).toBe(poolB);
    expect(dbA).toBe(dbB);
    expect(poolConstructorMock).toHaveBeenCalledTimes(1);
  });

  it("treats IPv6 [::1], 127.0.0.1, localhost, and sslmode=disable without SSL while enabling SSL for remote hosts", () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://postgres:postgres@[::1]:5432/noka_local",
      APP_URL: "https://noka.example.com",
      SESSION_SECRET: "b".repeat(32),
    });
    resetEnvCacheForTest();

    const ipv6Pool = getPool();
    const ipv6Db = getDb();
    expect(poolInstances[0]?.config.ssl).toBeUndefined();

    // Changing DATABASE_URL resets both cached Pool and Drizzle instance cleanly.
    process.env.DATABASE_URL =
      "postgres://user:pass@db.remote.example:5432/noka_prod";
    resetEnvCacheForTest();

    const remotePool = getPool();
    const remoteDb = getDb();
    expect(remotePool).not.toBe(ipv6Pool);
    expect(remoteDb).not.toBe(ipv6Db);
    expect(poolInstances[0]?.end).toHaveBeenCalledTimes(1);
    expect(poolInstances[1]?.config.ssl).toEqual({ rejectUnauthorized: false });

    // sslmode=disable disables SSL even on remote hosts.
    process.env.DATABASE_URL =
      "postgres://user:pass@db.remote.example:5432/noka_prod?sslmode=disable";
    resetEnvCacheForTest();
    getPool();
    expect(poolInstances[2]?.config.ssl).toBeUndefined();
  });
});
