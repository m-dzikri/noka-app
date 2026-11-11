// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createLogger, logger } from "@/lib/logger";

describe("structured JSON logger (TS-001-02)", () => {
  it("writes single-line JSON to stdout/stderr without letting meta overwrite core fields", () => {
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrLines.push(String(chunk));
      return true;
    });

    const reqLogger = createLogger("req-abc-123");
    reqLogger.info("auth.login_attempt", {
      timestamp: "1999-01-01T00:00:00.000Z",
      level: "debug",
      requestId: "spoofed-id",
      event: "spoofed.event",
      userId: "u-1",
    });
    logger.warn("sync.retry", { attempt: 2 });
    reqLogger.error("health.failed", { status: 503 });

    expect(stdoutLines).toHaveLength(2);
    expect(stderrLines).toHaveLength(1);

    const first = JSON.parse(stdoutLines[0].trim()) as Record<string, unknown>;
    expect(stdoutLines[0].trim().includes("\n")).toBe(false);
    expect(first.level).toBe("info");
    expect(first.requestId).toBe("req-abc-123");
    expect(first.event).toBe("auth.login_attempt");
    expect(first.timestamp).not.toBe("1999-01-01T00:00:00.000Z");
    expect(first.userId).toBe("u-1");

    const warnEntry = JSON.parse(stdoutLines[1].trim()) as Record<string, unknown>;
    expect(warnEntry.requestId).toBeNull();
    expect(warnEntry.level).toBe("warn");

    const errorEntry = JSON.parse(stderrLines[0].trim()) as Record<string, unknown>;
    expect(errorEntry.level).toBe("error");
    expect(errorEntry.requestId).toBe("req-abc-123");
  });

  it("redacts sensitive exact keys and substrings while preserving contentType and contentLength", () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });

    const reqLogger = createLogger("req-redact");
    reqLogger.info("payload.audit", {
      content: "Rahasia catatan",
      amount: 150000,
      contentType: "image/png",
      contentLength: 2048,
      password: "super-secret-password",
      nested: {
        resetToken: "raw-token-value",
        resetUrl: "https://noka.app/reset-password?token=raw-secret-1",
        reset_url: "https://noka.app/reset-password?token=raw-secret-2",
        sessionSecret: "top-secret",
        cookie: "noka_session=abc",
        "Set-Cookie": "noka_session=xyz",
        Authorization: "Bearer abc",
        noteContent: "Catatan pribadi",
        note_content: "Catatan 2",
        initialBalance: 5000000,
        initial_balance: 100000,
      },
      items: [{ Amount: 99000, label: "safe-label" }],
    });

    const parsed = JSON.parse(lines[0].trim()) as Record<string, unknown>;
    expect(parsed.content).toBe("[REDACTED]");
    expect(parsed.amount).toBe("[REDACTED]");
    expect(parsed.contentType).toBe("image/png");
    expect(parsed.contentLength).toBe(2048);
    expect(parsed.password).toBe("[REDACTED]");

    const nested = parsed.nested as Record<string, unknown>;
    for (const key of Object.keys(nested)) {
      expect(nested[key]).toBe("[REDACTED]");
    }

    const items = parsed.items as Array<Record<string, unknown>>;
    expect(items[0].Amount).toBe("[REDACTED]");
    expect(items[0].label).toBe("safe-label");
  });

  it("serializes Error instances strictly as name and message without stack traces", () => {
    const lines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });

    const err = new Error("Connection refused");
    createLogger("req-err").error("db.error", { error: err });

    const parsed = JSON.parse(lines[0].trim()) as {
      error: Record<string, unknown>;
    };
    expect(parsed.error).toEqual({
      name: "Error",
      message: "Connection refused",
    });
    expect("stack" in parsed.error).toBe(false);
  });
});

