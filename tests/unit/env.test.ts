// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAppUrl, getEnv, resetEnvCacheForTest } from "@/lib/env";

const VALID_BASE_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/noka_test",
  APP_URL: "http://localhost:3000",
  SESSION_SECRET: "12345678901234567890123456789012",
  NODE_ENV: "test",
};

const ENV_KEYS = [
  "DATABASE_URL",
  "APP_URL",
  "SESSION_SECRET",
  "NODE_ENV",
  "LOCAL_UPLOADS_DIR",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
] as const;

describe("env validation (TS-001-01)", () => {
  let snapshot: Record<string, string | undefined>;
  const envMap = process.env as Record<string, string | undefined>;

  beforeEach(() => {
    snapshot = {};
    for (const key of ENV_KEYS) {
      snapshot[key] = envMap[key];
      delete envMap[key];
    }
    resetEnvCacheForTest();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = snapshot[key];
      if (value === undefined) {
        delete envMap[key];
      } else {
        envMap[key] = value;
      }
    }
    resetEnvCacheForTest();
  });

  it("returns default or normalized APP_URL via getAppUrl() without DATABASE_URL or SESSION_SECRET", () => {
    expect(getAppUrl()).toBe("http://localhost:3000");

    process.env.APP_URL = "";
    expect(getAppUrl()).toBe("http://localhost:3000");

    process.env.APP_URL = "https://noka.example.com///";
    expect(getAppUrl()).toBe("https://noka.example.com");

    process.env.APP_URL = "not-a-valid-url";
    expect(() => getAppUrl()).toThrow();
  });

  it("validates required fields and normalizes empty strings in optional groups to undefined", () => {
    Object.assign(process.env, VALID_BASE_ENV, {
      LOCAL_UPLOADS_DIR: "",
      S3_ENDPOINT: "",
      S3_REGION: "",
      S3_BUCKET: "",
      S3_ACCESS_KEY_ID: "",
      S3_SECRET_ACCESS_KEY: "",
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
    });

    const parsed = getEnv();
    expect(parsed.DATABASE_URL).toBe(VALID_BASE_ENV.DATABASE_URL);
    expect(parsed.APP_URL).toBe("http://localhost:3000");
    expect(parsed.LOCAL_UPLOADS_DIR).toBeUndefined();
    expect(parsed.S3_REGION).toBeUndefined();
    expect(parsed.RESEND_API_KEY).toBeUndefined();
    expect(parsed.EMAIL_FROM).toBeUndefined();
  });

  it("rejects SESSION_SECRET shorter than 32 characters", () => {
    Object.assign(process.env, VALID_BASE_ENV, {
      SESSION_SECRET: "too-short-secret",
    });

    expect(() => getEnv()).toThrow();
  });

  it("rejects partial S3 configuration and defaults S3_REGION to auto when active", () => {
    Object.assign(process.env, VALID_BASE_ENV, {
      S3_BUCKET: "noka-media",
    });
    expect(() => getEnv()).toThrow();

    Object.assign(process.env, {
      S3_ENDPOINT: "not-a-url",
      S3_BUCKET: "noka-media",
      S3_ACCESS_KEY_ID: "key-id",
      S3_SECRET_ACCESS_KEY: "secret-key",
    });
    expect(() => getEnv()).toThrow();

    Object.assign(process.env, {
      S3_ENDPOINT: "https://r2.example.com",
      S3_REGION: "",
      S3_BUCKET: "noka-media",
      S3_ACCESS_KEY_ID: "key-id",
      S3_SECRET_ACCESS_KEY: "secret-key",
    });
    const parsed = getEnv();
    expect(parsed.S3_REGION).toBe("auto");
    expect(parsed.S3_ENDPOINT).toBe("https://r2.example.com");
  });

  it("rejects partial or malformed Resend configuration and accepts valid display format", () => {
    Object.assign(process.env, VALID_BASE_ENV, {
      RESEND_API_KEY: "re_test_123",
    });
    expect(() => getEnv()).toThrow();

    Object.assign(process.env, VALID_BASE_ENV, {
      RESEND_API_KEY: "re_test_123",
      EMAIL_FROM: "invalid-email",
    });
    expect(() => getEnv()).toThrow();

    Object.assign(process.env, VALID_BASE_ENV, {
      RESEND_API_KEY: "re_test_123",
      EMAIL_FROM: "Noka Support <noreply@noka.example.com>",
    });
    const parsed = getEnv();
    expect(parsed.EMAIL_FROM).toBe("Noka Support <noreply@noka.example.com>");
  });

  it("caches env outside NODE_ENV=test until resetEnvCacheForTest is called", () => {
    Object.assign(process.env, VALID_BASE_ENV, {
      NODE_ENV: "development",
      APP_URL: "https://one.example.com/",
    });

    expect(getEnv().APP_URL).toBe("https://one.example.com");

    process.env.APP_URL = "https://two.example.com";
    expect(getEnv().APP_URL).toBe("https://one.example.com");

    resetEnvCacheForTest();
    expect(getEnv().APP_URL).toBe("https://two.example.com");
  });
});
