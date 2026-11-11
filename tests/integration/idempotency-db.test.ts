import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import {
  categories,
  transactions,
  transfers,
  wallets,
} from "@/db/schema/finance";
import { folders, notes } from "@/db/schema/notes";
import { idempotencyKeys } from "@/db/schema/sync";
import { ApiError } from "@/lib/api-response";
import { withIdempotency } from "@/lib/idempotency";

describe("withIdempotency and 13-table schema constraints (TS-001-04)", () => {
  let testUserId: string;
  let defaultCategoryId: string;

  beforeAll(async () => {
    const db = getDb();
    const [createdUser] = await db
      .insert(users)
      .values({
        name: "Idempotency Test User",
        email: `idem-${crypto.randomUUID()}@example.test`,
        passwordHash: "$2b$12$placeholderhashfortesting000000000000000000000000000",
      })
      .returning({ id: users.id });

    testUserId = createdUser.id;

    const [createdCategory] = await db
      .insert(categories)
      .values({
        userId: testUserId,
        name: "Lainnya",
        type: "expense",
        isSystem: true,
        systemKey: "expense_other",
      })
      .returning({ id: categories.id });

    defaultCategoryId = createdCategory.id;
  });

  beforeEach(async () => {
    const db = getDb();
    await db.delete(transactions).where(eq(transactions.userId, testUserId));
    await db.delete(transfers).where(eq(transfers.userId, testUserId));
    await db.delete(wallets).where(eq(wallets.userId, testUserId));
    await db.delete(notes).where(eq(notes.userId, testUserId));
    await db.delete(folders).where(eq(folders.userId, testUserId));
    await db
      .delete(idempotencyKeys)
      .where(eq(idempotencyKeys.userId, testUserId));
  });

  afterAll(async () => {
    if (testUserId) {
      await getDb().delete(users).where(eq(users.id, testUserId));
    }
  });

  it("replays 2xx response on duplicate key and rejects mismatched payload with 409 IDEMPOTENCY_KEY_CONFLICT", async () => {
    const key = `wallet-${crypto.randomUUID()}`;
    let calls = 0;

    const firstRes = await withIdempotency({
      userId: testUserId,
      idempotencyKey: key,
      method: "POST",
      path: "/api/wallets",
      payload: { name: "Dompet Utama", initialBalance: 100_000 },
      handler: async (tx) => {
        calls += 1;
        const [wallet] = await tx
          .insert(wallets)
          .values({
            userId: testUserId,
            name: "Dompet Utama",
            type: "cash",
            initialBalance: 100_000,
          })
          .returning({ id: wallets.id, name: wallets.name });
        return { status: 201, body: wallet };
      },
    });

    expect(firstRes.status).toBe(201);
    const firstJson = await firstRes.json();

    const replayRes = await withIdempotency({
      userId: testUserId,
      idempotencyKey: key,
      method: "POST",
      path: "/api/wallets",
      payload: { initialBalance: 100_000, name: "Dompet Utama", idempotencyKey: key },
      handler: async () => {
        calls += 1;
        throw new Error("Should not execute on replay");
      },
    });

    expect(calls).toBe(1);
    expect(replayRes.status).toBe(201);
    expect(await replayRes.json()).toEqual(firstJson);

    await expect(
      withIdempotency({
        userId: testUserId,
        idempotencyKey: key,
        method: "POST",
        path: "/api/wallets",
        payload: { name: "Dompet Berbeda", initialBalance: 100_000 },
        handler: async () => ({ status: 201, body: {} }),
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "IDEMPOTENCY_KEY_CONFLICT",
    });
  });

  it("executes handler exactly once when two parallel requests arrive with the same idempotencyKey", async () => {
    const key = `race-${crypto.randomUUID()}`;
    let executions = 0;

    const invoke = () =>
      withIdempotency({
        userId: testUserId,
        idempotencyKey: key,
        method: "POST",
        path: "/api/wallets",
        payload: { name: "Dompet Race", initialBalance: 50_000 },
        handler: async (tx) => {
          executions += 1;
          await new Promise((resolve) => setTimeout(resolve, 40));
          const [wallet] = await tx
            .insert(wallets)
            .values({
              userId: testUserId,
              name: "Dompet Race",
              type: "ewallet",
              initialBalance: 50_000,
            })
            .returning({ id: wallets.id });
          return { status: 201, body: wallet };
        },
      });

    const [resA, resB] = await Promise.all([invoke(), invoke()]);
    expect(executions).toBe(1);
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(await resA.json()).toEqual(await resB.json());

    const storedWallets = await getDb()
      .select()
      .from(wallets)
      .where(eq(wallets.userId, testUserId));
    expect(storedWallets).toHaveLength(1);
  });

  it("rolls back domain writes on 409 ApiError while persisting 409 replay, and never caches 5xx errors", async () => {
    const conflictKey = `conflict-${crypto.randomUUID()}`;

    const conflictRes = await withIdempotency({
      userId: testUserId,
      idempotencyKey: conflictKey,
      method: "POST",
      path: "/api/wallets",
      payload: { name: "WillRollback" },
      handler: async (tx) => {
        await tx.insert(wallets).values({
          userId: testUserId,
          name: "WillRollback",
          type: "cash",
          initialBalance: 0,
        });
        throw new ApiError(409, "DUPLICATE_WALLET", "Wallet exists");
      },
    });

    expect(conflictRes.status).toBe(409);
    expect(await conflictRes.json()).toEqual({
      ok: false,
      error: { code: "DUPLICATE_WALLET", message: "Wallet exists" },
    });

    const persistedWallets = await getDb()
      .select()
      .from(wallets)
      .where(eq(wallets.userId, testUserId));
    expect(persistedWallets).toHaveLength(0);

    const replayConflict = await withIdempotency({
      userId: testUserId,
      idempotencyKey: conflictKey,
      method: "POST",
      path: "/api/wallets",
      payload: { name: "WillRollback" },
      handler: async () => {
        throw new Error("Should replay persisted 409 instead of running handler");
      },
    });
    expect(replayConflict.status).toBe(409);

    const failKey = `fail-${crypto.randomUUID()}`;
    await expect(
      withIdempotency({
        userId: testUserId,
        idempotencyKey: failKey,
        method: "POST",
        path: "/api/wallets",
        payload: { name: "Crash" },
        handler: async (tx) => {
          await tx.insert(wallets).values({
            userId: testUserId,
            name: "Crash",
            type: "cash",
            initialBalance: 0,
          });
          throw new Error("Unexpected 500 failure");
        },
      }),
    ).rejects.toThrow("Unexpected 500 failure");

    const crashWallets = await getDb()
      .select()
      .from(wallets)
      .where(eq(wallets.userId, testUserId));
    expect(crashWallets).toHaveLength(0);

    const crashKeys = await getDb()
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.idempotencyKey, failKey));
    expect(crashKeys).toHaveLength(0);
  });

  it("enforces bigint precision, CHECK constraints, and ON DELETE SET NULL referential integrity", async () => {
    const db = getDb();
    const largeIdrAmount = 5_000_000_000_000;

    const [walletA] = await db
      .insert(wallets)
      .values({
        userId: testUserId,
        name: "Bank Besar",
        type: "bank",
        initialBalance: largeIdrAmount,
        includeInSafeToSpend: false,
      })
      .returning();

    expect(walletA.initialBalance).toBe(largeIdrAmount);

    await expect(
      db.insert(wallets).values({
        userId: testUserId,
        name: "Invalid Neg",
        type: "cash",
        initialBalance: -1,
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(transfers).values({
        userId: testUserId,
        fromWalletId: walletA.id,
        toWalletId: walletA.id,
        amount: 1000,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow();

    const [folder] = await db
      .insert(folders)
      .values({ userId: testUserId, name: "Harian" })
      .returning();

    const [note] = await db
      .insert(notes)
      .values({
        userId: testUserId,
        folderId: folder.id,
        title: "Belanja",
        content: "Kopi",
      })
      .returning();

    const [txRow] = await db
      .insert(transactions)
      .values({
        userId: testUserId,
        walletId: walletA.id,
        categoryId: defaultCategoryId,
        noteId: note.id,
        type: "expense",
        amount: 25_000,
        occurredAt: new Date(),
      })
      .returning();

    await db.delete(notes).where(eq(notes.id, note.id));

    const [reloadedTx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txRow.id));

    expect(reloadedTx).toBeDefined();
    expect(reloadedTx.noteId).toBeNull();
  });

  it("executes handler directly without writing idempotency_keys when idempotencyKey is undefined", async () => {
    const db = getDb();
    const beforeCount = (
      await db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, testUserId))
    ).length;

    const firstRes = await withIdempotency({
      userId: testUserId,
      method: "POST",
      path: "/api/wallets",
      payload: { name: "No Key 1" },
      handler: async (tx) => {
        const [created] = await tx
          .insert(wallets)
          .values({
            userId: testUserId,
            name: "No Key 1",
            type: "cash",
            initialBalance: 1_000,
          })
          .returning();
        return { status: 201, body: { id: created.id } };
      },
    });

    const secondRes = await withIdempotency({
      userId: testUserId,
      method: "POST",
      path: "/api/wallets",
      payload: { name: "No Key 1" },
      handler: async (tx) => {
        const [created] = await tx
          .insert(wallets)
          .values({
            userId: testUserId,
            name: "No Key 2",
            type: "cash",
            initialBalance: 2_000,
          })
          .returning();
        return { status: 201, body: { id: created.id } };
      },
    });

    expect(firstRes.status).toBe(201);
    expect(secondRes.status).toBe(201);

    const afterCount = (
      await db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, testUserId))
    ).length;
    expect(afterCount).toBe(beforeCount);

    const userWallets = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, testUserId));
    expect(userWallets).toHaveLength(2);
  });

  it("accepts 1-character and 128-character idempotency keys and rejects method or path conflicts with 409", async () => {
    const minKey = "k";
    const maxKey = "m".repeat(128);

    const minRes = await withIdempotency({
      userId: testUserId,
      idempotencyKey: minKey,
      method: "POST",
      path: "/api/wallets",
      payload: { name: "Boundary Min" },
      handler: async () => ({ status: 201, body: { min: true } }),
    });
    expect(minRes.status).toBe(201);
    expect(await minRes.json()).toEqual({ ok: true, data: { min: true } });

    const maxRes = await withIdempotency({
      userId: testUserId,
      idempotencyKey: maxKey,
      method: "POST",
      path: "/api/wallets",
      payload: { name: "Boundary Max" },
      handler: async () => ({ status: 201, body: { max: true } }),
    });
    expect(maxRes.status).toBe(201);
    expect(await maxRes.json()).toEqual({ ok: true, data: { max: true } });

    // Same key & payload, different HTTP method -> 409 IDEMPOTENCY_KEY_CONFLICT.
    await expect(
      withIdempotency({
        userId: testUserId,
        idempotencyKey: maxKey,
        method: "PATCH",
        path: "/api/wallets",
        payload: { name: "Boundary Max" },
        handler: async () => {
          throw new Error("Should not execute handler on method mismatch");
        },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "IDEMPOTENCY_KEY_CONFLICT",
    });

    // Same key & payload & method, different path -> 409 IDEMPOTENCY_KEY_CONFLICT.
    await expect(
      withIdempotency({
        userId: testUserId,
        idempotencyKey: maxKey,
        method: "POST",
        path: "/api/transactions",
        payload: { name: "Boundary Max" },
        handler: async () => {
          throw new Error("Should not execute handler on path mismatch");
        },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "IDEMPOTENCY_KEY_CONFLICT",
    });
  });
});

