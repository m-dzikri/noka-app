import { existsSync } from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { beforeAll } from "vitest";
import { getDb, getPool } from "@/db";

const INTEGRATION_MIGRATION_LOCK_ID = 78421001;

function configureIntegrationEnv(): void {
  const envMap = process.env as Record<string, string | undefined>;

  if (!envMap.DATABASE_URL) {
    if (existsSync(".env.test")) {
      try {
        process.loadEnvFile(".env.test");
      } catch {
        // Fallback to .env below if .env.test cannot be read.
      }
    }

    if (!envMap.DATABASE_URL && existsSync(".env")) {
      try {
        process.loadEnvFile(".env");
        if (envMap.DATABASE_URL) {
          const parsed = new URL(envMap.DATABASE_URL);
          if (parsed.pathname === "/noka_dev") {
            parsed.pathname = "/noka_test";
            envMap.DATABASE_URL = parsed.toString();
          }
        }
      } catch {
        // Let getEnv() surface missing configuration clearly during tests.
      }
    }
  }

  if (!envMap.APP_URL) {
    envMap.APP_URL = "http://localhost:3000";
  }
  if (!envMap.SESSION_SECRET) {
    envMap.SESSION_SECRET = "integration-test-session-secret-minimum-32-chars";
  }
}

configureIntegrationEnv();

let migrationPromise: Promise<void> | null = null;

async function runSerializedMigration(): Promise<void> {
  const client = await getPool().connect();
  try {
    // Serialize Drizzle schema/table bootstrapping across parallel Vitest workers.
    await client.query("SELECT pg_advisory_lock($1)", [
      INTEGRATION_MIGRATION_LOCK_ID,
    ]);
    await migrate(getDb(), {
      migrationsFolder: path.resolve(process.cwd(), "src/db/migrations"),
    });
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [INTEGRATION_MIGRATION_LOCK_ID])
      .catch(() => undefined);
    client.release();
  }
}

beforeAll(async () => {
  if (!migrationPromise) {
    migrationPromise = runSerializedMigration();
  }
  await migrationPromise;
});
