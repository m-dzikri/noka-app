import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { getEnv } from "@/lib/env";

export type AppDatabase = NodePgDatabase<typeof schema>;

type PgTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
export type DbOrTx = AppDatabase | PgTransaction;

const globalForDb = globalThis as unknown as {
  __nokaPool?: Pool;
  __nokaPoolUrl?: string;
  __nokaDb?: AppDatabase;
};

function shouldEnableSsl(databaseUrl: string): boolean {
  try {
    const parsed = new URL(databaseUrl);
    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode === "disable") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      hostname !== "::1"
    );
  } catch {
    return false;
  }
}

/**
 * Lazily initializes and caches the PostgreSQL connection pool on first server access.
 */
export function getPool(): Pool {
  const { DATABASE_URL, NODE_ENV } = getEnv();

  if (globalForDb.__nokaPool && globalForDb.__nokaPoolUrl === DATABASE_URL) {
    return globalForDb.__nokaPool;
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: shouldEnableSsl(DATABASE_URL)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  if (NODE_ENV !== "production") {
    globalForDb.__nokaPool = pool;
    globalForDb.__nokaPoolUrl = DATABASE_URL;
  }

  return pool;
}

/**
 * Returns the lazily created Drizzle ORM database instance bound to the shared schema.
 */
export function getDb(): AppDatabase {
  const { DATABASE_URL, NODE_ENV } = getEnv();

  if (globalForDb.__nokaDb && globalForDb.__nokaPoolUrl === DATABASE_URL) {
    return globalForDb.__nokaDb;
  }

  const instance = drizzle(getPool(), { schema });
  if (NODE_ENV !== "production") {
    globalForDb.__nokaDb = instance;
    globalForDb.__nokaPoolUrl = DATABASE_URL;
  }

  return instance;
}

/**
 * Lazy proxy over getDb() so route modules remain build-safe without DATABASE_URL set.
 */
export const db: AppDatabase = new Proxy({} as AppDatabase, {
  get(_target, prop, receiver) {
    const targetDb = getDb();
    const value = Reflect.get(targetDb, prop, receiver);
    return typeof value === "function" ? value.bind(targetDb) : value;
  },
});

