export type LogLevel = "info" | "warn" | "error";

export type LogMeta = Record<string, unknown>;

export interface Logger {
  info(event: string, meta?: LogMeta): void;
  warn(event: string, meta?: LogMeta): void;
  error(event: string, meta?: LogMeta): void;
}

const REDACTED = "[REDACTED]";

const EXACT_SENSITIVE_KEYS = new Set(["content", "amount"]);

const SENSITIVE_KEY_SUBSTRINGS = [
  "password",
  "token",
  "secret",
  "cookie",
  "set-cookie",
  "authorization",
  "notecontent",
  "note_content",
  "initialbalance",
  "initial_balance",
] as const;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (EXACT_SENSITIVE_KEYS.has(normalized)) {
    return true;
  }
  return SENSITIVE_KEY_SUBSTRINGS.some((fragment) => normalized.includes(fragment));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively redacts sensitive keys and strips error stack traces before log serialization.
 */
export function sanitizeLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, seen));
  }

  if (!isPlainObject(value)) {
    return Object.prototype.toString.call(value);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = REDACTED;
    } else {
      sanitized[key] = sanitizeLogValue(entryValue, seen);
    }
  }
  return sanitized;
}

function writeLog(
  level: LogLevel,
  requestId: string | null,
  event: string,
  meta?: LogMeta,
): void {
  const sanitizedMeta =
    meta && isPlainObject(meta)
      ? (sanitizeLogValue(meta) as Record<string, unknown>)
      : {};

  // Place core envelope fields last so untrusted meta keys cannot overwrite them.
  const entry: Record<string, unknown> = {
    ...sanitizedMeta,
    timestamp: new Date().toISOString(),
    level,
    requestId,
    event,
  };

  const line = `${JSON.stringify(entry)}\n`;
  if (level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

/**
 * Creates a request-scoped structured JSON logger enforcing OBS-2 redaction rules.
 */
export function createLogger(requestId: string | null = null): Logger {
  const normalizedRequestId = requestId ?? null;
  return {
    info(event: string, meta?: LogMeta) {
      writeLog("info", normalizedRequestId, event, meta);
    },
    warn(event: string, meta?: LogMeta) {
      writeLog("warn", normalizedRequestId, event, meta);
    },
    error(event: string, meta?: LogMeta) {
      writeLog("error", normalizedRequestId, event, meta);
    },
  };
}

export const logger: Logger = createLogger(null);

