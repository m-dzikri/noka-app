interface RateLimitBucketEntry {
  timestamps: number[];
  expiresAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
}

const MAX_STORE_KEYS_BEFORE_SWEEP = 500;

const globalForRateLimit = globalThis as unknown as {
  __nokaRateLimits?: Map<string, RateLimitBucketEntry>;
};

function getStore(): Map<string, RateLimitBucketEntry> {
  if (!globalForRateLimit.__nokaRateLimits) {
    globalForRateLimit.__nokaRateLimits = new Map();
  }
  return globalForRateLimit.__nokaRateLimits;
}

function sweepExpiredBuckets(store: Map<string, RateLimitBucketEntry>, nowMs: number): void {
  if (store.size <= MAX_STORE_KEYS_BEFORE_SWEEP) {
    return;
  }

  for (const [entryKey, entry] of store.entries()) {
    if (entry.expiresAt <= nowMs || entry.timestamps.length === 0) {
      store.delete(entryKey);
    }
  }
}

/**
 * Enforces an in-memory sliding-window rate limit with automatic stale-entry pruning.
 */
export function checkRateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
  nowMs = Date.now(),
): RateLimitResult {
  const store = getStore();
  sweepExpiredBuckets(store, nowMs);

  const compositeKey = `${bucket}:${key}`;
  const cutoff = nowMs - windowMs;
  const existing = store.get(compositeKey);
  const recentTimestamps = existing
    ? existing.timestamps.filter((ts) => ts > cutoff)
    : [];

  if (recentTimestamps.length >= limit) {
    const oldestAllowedAt = Math.min(...recentTimestamps);
    const newestAllowedAt = Math.max(...recentTimestamps);
    const resetAt = oldestAllowedAt + windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - nowMs) / 1000));
    store.set(compositeKey, {
      timestamps: recentTimestamps,
      expiresAt: newestAllowedAt + windowMs,
    });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
      resetAt,
    };
  }

  recentTimestamps.push(nowMs);
  const resetAt = Math.min(...recentTimestamps) + windowMs;
  const newestAllowedAt = Math.max(...recentTimestamps);
  store.set(compositeKey, {
    timestamps: recentTimestamps,
    expiresAt: newestAllowedAt + windowMs,
  });

  return {
    allowed: true,
    remaining: Math.max(0, limit - recentTimestamps.length),
    retryAfterSeconds: 0,
    resetAt,
  };
}

/**
 * Extracts the client IP address from proxy headers with safe loopback fallback.
 */
export function extractClientIp(request: { headers: Headers }): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "127.0.0.1";
}

/**
 * Clears all sliding-window buckets (for deterministic test isolation).
 */
export function clearRateLimitsForTest(): void {
  globalForRateLimit.__nokaRateLimits?.clear();
}

