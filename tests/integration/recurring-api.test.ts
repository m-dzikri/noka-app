import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { POST as registerPost } from "@/app/api/auth/register/route";
import {
  GET as categoriesGet,
} from "@/app/api/categories/route";
import {
  GET as recurringGet,
  POST as recurringPost,
} from "@/app/api/finance/recurring/route";
import {
  GET as recurringDetailGet,
  PATCH as recurringDetailPatch,
  DELETE as recurringDetailDelete,
} from "@/app/api/finance/recurring/[id]/route";
import { POST as processPost } from "@/app/api/finance/recurring/process/route";
import { POST as confirmPost } from "@/app/api/finance/recurring/confirm/route";
import { POST as walletsPost } from "@/app/api/wallets/route";
import { PATCH as walletPatch } from "@/app/api/wallets/[id]/route";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import {
  categories,
  categoryBudgets,
  recurringTemplates,
  transactions,
  transfers,
  wallets,
} from "@/db/schema/finance";

const createdUserIds: string[] = [];

afterEach(async () => {
  if (createdUserIds.length === 0) return;
  const db = getDb();
  const ids = [...createdUserIds];
  createdUserIds.length = 0;

  await db.delete(recurringTemplates).where(inArray(recurringTemplates.userId, ids));
  await db.delete(categoryBudgets).where(inArray(categoryBudgets.userId, ids));
  await db.delete(transactions).where(inArray(transactions.userId, ids));
  await db.delete(transfers).where(inArray(transfers.userId, ids));
  await db.delete(wallets).where(inArray(wallets.userId, ids));
  await db.delete(categories).where(inArray(categories.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

function extractSessionCookie(response: Response): string {
  const headers = response.headers as unknown as {
    getSetCookie?: () => string[];
  };
  const setCookies = headers.getSetCookie
    ? headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];

  for (const raw of setCookies) {
    if (raw.startsWith("noka_session=")) {
      return raw.split(";")[0] ?? "";
    }
  }
  throw new Error("Missing noka_session cookie on register response");
}

function makeAuthedRequest(
  url: string,
  method: string,
  cookie: string,
  body?: unknown,
  customHeaders: Record<string, string> = {},
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      origin: "http://localhost:3000",
      cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...customHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function createRegisteredUser(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@noka.test`;
  const res = await registerPost(
    new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Recurring User",
        email,
        password: "Password123!",
      }),
    }),
  );

  const json = await res.json();
  const userId = json.data.user.id as string;
  createdUserIds.push(userId);
  const cookie = extractSessionCookie(res);

  // Fetch categories
  const catRes = await categoriesGet(
    makeAuthedRequest("http://localhost:3000/api/categories", "GET", cookie),
  );
  const catJson = await catRes.json();
  const catList = catJson.data.categories as Array<{
    id: string;
    name: string;
    type: string;
  }>;
  const expenseCat = catList.find((c) => c.type === "expense")!;
  const incomeCat = catList.find((c) => c.type === "income")!;

  // Create active wallet
  const walletRes = await walletsPost(
    makeAuthedRequest("http://localhost:3000/api/wallets", "POST", cookie, {
      name: "Dompet Operasional",
      type: "cash",
      initialBalance: 2_000_000,
      includeInSafeToSpend: true,
      isDefault: true,
    }),
  );
  const walletJson = await walletRes.json();
  const wallet = walletJson.data.wallet as { id: string; name: string };

  return { userId, cookie, expenseCat, incomeCat, wallet };
}

describe("TS-013-02: Recurring Transactions API & Integrity Suite", () => {
  it("enforces authentication (401) and CSRF protection (403)", async () => {
    // 1. Unauthenticated GET
    const unauthGet = await recurringGet(
      new NextRequest("http://localhost:3000/api/finance/recurring", {
        method: "GET",
      }),
    );
    expect(unauthGet.status).toBe(401);

    // 2. Unauthenticated POST
    const unauthPost = await recurringPost(
      new NextRequest("http://localhost:3000/api/finance/recurring", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(unauthPost.status).toBe(401);

    // 3. Authenticated without CSRF origin
    const user = await createRegisteredUser("csrf-test");
    const noOriginPost = await recurringPost(
      new NextRequest("http://localhost:3000/api/finance/recurring", {
        method: "POST",
        headers: {
          cookie: user.cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(noOriginPost.status).toBe(403);
  });

  it("validates input constraints: positive IDR, valid UUIDs, category type alignment, and active wallet", async () => {
    const user = await createRegisteredUser("val-test");

    // Negative amount rejected
    const negRes = await recurringPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "POST", user.cookie, {
        walletId: user.wallet.id,
        categoryId: user.expenseCat.id,
        type: "expense",
        amount: -50000,
        description: "Invalid Negative",
        frequency: "monthly",
      }),
    );
    expect(negRes.status).toBe(422);

    // Category type mismatch (expense template with income category)
    const mismatchRes = await recurringPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "POST", user.cookie, {
        walletId: user.wallet.id,
        categoryId: user.incomeCat.id,
        type: "expense",
        amount: 50000,
        description: "Mismatch Cat",
        frequency: "monthly",
      }),
    );
    expect(mismatchRes.status).toBe(422);
    const mismatchJson = await mismatchRes.json();
    expect(mismatchJson.error.code).toBe("CATEGORY_TYPE_MISMATCH");

    // Archived wallet rejected
    // Archive wallet
    const archiveRes = await walletPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/wallets/${user.wallet.id}`,
        "PATCH",
        user.cookie,
        { archived: true },
      ),
      { params: Promise.resolve({ id: user.wallet.id }) },
    );
    expect(archiveRes.status).toBe(200);

    const archivedWalletRes = await recurringPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "POST", user.cookie, {
        walletId: user.wallet.id,
        categoryId: user.expenseCat.id,
        type: "expense",
        amount: 50000,
        description: "Archived Wallet Recurring",
        frequency: "monthly",
      }),
    );
    expect(archivedWalletRes.status).toBe(422);
    const archivedJson = await archivedWalletRes.json();
    expect(archivedJson.error.code).toBe("WALLET_ARCHIVED");
  });

  it("creates recurring template idempotently, lists it, and supports pause/resume PATCH", async () => {
    const user = await createRegisteredUser("crud-test");
    const idempotencyKey = crypto.randomUUID();

    const payload = {
      walletId: user.wallet.id,
      categoryId: user.expenseCat.id,
      type: "expense" as const,
      amount: 150_000,
      description: "Internet Bulanan",
      frequency: "monthly" as const,
      intervalStep: 1,
      dayOfMonth: 20,
      startDate: "2026-01-01T00:00:00.000Z",
      autoApply: true,
      idempotencyKey,
    };

    // 1. Create template
    const createRes = await recurringPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "POST", user.cookie, payload),
    );
    expect(createRes.status).toBe(201);
    const createJson = await createRes.json();
    const templateId = createJson.data.template.id as string;
    expect(templateId).toBeDefined();
    expect(createJson.data.template.amount).toBe(150_000);
    expect(createJson.data.template.isActive).toBe(true);

    // 2. Idempotent replay with same key
    const replayRes = await recurringPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "POST", user.cookie, payload),
    );
    expect(replayRes.status).toBe(201);
    const replayJson = await replayRes.json();
    expect(replayJson.data.template.id).toBe(templateId);

    // 3. List templates
    const listRes = await recurringGet(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "GET", user.cookie),
    );
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.data.templates.length).toBe(1);
    expect(listJson.data.templates[0].id).toBe(templateId);

    // 4. Detail GET
    const detailRes = await recurringDetailGet(
      makeAuthedRequest(`http://localhost:3000/api/finance/recurring/${templateId}`, "GET", user.cookie),
      { params: Promise.resolve({ id: templateId }) },
    );
    expect(detailRes.status).toBe(200);

    // 5. Pause template (isActive: false)
    const pauseRes = await recurringDetailPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/finance/recurring/${templateId}`,
        "PATCH",
        user.cookie,
        { isActive: false },
      ),
      { params: Promise.resolve({ id: templateId }) },
    );
    expect(pauseRes.status).toBe(200);
    const pauseJson = await pauseRes.json();
    expect(pauseJson.data.template.isActive).toBe(false);

    // 6. Resume template (isActive: true)
    const resumeRes = await recurringDetailPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/finance/recurring/${templateId}`,
        "PATCH",
        user.cookie,
        { isActive: true },
      ),
      { params: Promise.resolve({ id: templateId }) },
    );
    expect(resumeRes.status).toBe(200);
    const resumeJson = await resumeRes.json();
    expect(resumeJson.data.template.isActive).toBe(true);
  });

  it("processes due auto-apply templates atomically with ledger balance deduction and advances nextRunAt", async () => {
    const user = await createRegisteredUser("process-auto");
    const db = getDb();

    // Create auto-apply template with past startDate
    const createRes = await recurringPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "POST", user.cookie, {
        walletId: user.wallet.id,
        categoryId: user.expenseCat.id,
        type: "expense",
        amount: 250_000,
        description: "Listrik Pascabayar",
        frequency: "monthly",
        intervalStep: 1,
        dayOfMonth: 1,
        startDate: "2026-01-01T00:00:00.000Z",
        autoApply: true,
      }),
    );
    expect(createRes.status).toBe(201);
    const createJson = await createRes.json();
    const templateId = createJson.data.template.id as string;

    // Manually ensure nextRunAt is in the past (1 hour ago) so it triggers on process
    const oneHourAgo = new Date(Date.now() - 3600_000);
    await db
      .update(recurringTemplates)
      .set({ nextRunAt: oneHourAgo })
      .where(eq(recurringTemplates.id, templateId));

    // Process due templates
    const processRes = await processPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring/process", "POST", user.cookie),
    );
    expect(processRes.status).toBe(200);
    const processJson = await processRes.json();
    expect(processJson.data.appliedCount).toBe(1);
    expect(processJson.data.pendingConfirmations.length).toBe(0);

    // Verify transaction was created in ledger
    const createdTx = await db
      .select()
      .from(transactions)
      .where(eq(transactions.recurringTemplateId, templateId));
    expect(createdTx.length).toBe(1);
    expect(createdTx[0].amount).toBe(250_000);
    expect(createdTx[0].description).toBe("Listrik Pascabayar");
    expect(createdTx[0].walletId).toBe(user.wallet.id);

    // Verify template nextRunAt advanced
    const updatedTemplate = await db
      .select()
      .from(recurringTemplates)
      .where(eq(recurringTemplates.id, templateId));
    expect(updatedTemplate[0].lastRunAt).toBeDefined();
    expect(new Date(updatedTemplate[0].nextRunAt).getTime()).toBeGreaterThan(
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );

    // Run process again immediately: should do nothing (appliedCount = 0)
    const secondProcess = await processPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring/process", "POST", user.cookie),
    );
    const secondJson = await secondProcess.json();
    expect(secondJson.data.appliedCount).toBe(0);
  });

  it("prevents duplicate executions during parallel concurrent process calls", async () => {
    const user = await createRegisteredUser("concurrency-test");
    const db = getDb();

    // Create due template
    const createRes = await recurringPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "POST", user.cookie, {
        walletId: user.wallet.id,
        categoryId: user.expenseCat.id,
        type: "expense",
        amount: 100_000,
        description: "Gaji Asisten",
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
        autoApply: true,
      }),
    );
    const templateId = (await createRes.json()).data.template.id as string;
    const oneHourAgo = new Date(Date.now() - 3600_000);
    await db
      .update(recurringTemplates)
      .set({ nextRunAt: oneHourAgo })
      .where(eq(recurringTemplates.id, templateId));

    // Call process 3 times concurrently
    const [res1, res2, res3] = await Promise.all([
      processPost(makeAuthedRequest("http://localhost:3000/api/finance/recurring/process", "POST", user.cookie)),
      processPost(makeAuthedRequest("http://localhost:3000/api/finance/recurring/process", "POST", user.cookie)),
      processPost(makeAuthedRequest("http://localhost:3000/api/finance/recurring/process", "POST", user.cookie)),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    const json1 = await res1.json();
    const json2 = await res2.json();
    const json3 = await res3.json();

    const totalApplied = json1.data.appliedCount + json2.data.appliedCount + json3.data.appliedCount;
    expect(totalApplied).toBe(1);

    const txRows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.recurringTemplateId, templateId));
    expect(txRows.length).toBe(1);
  });

  it("handles manual confirmation flow (prompt-on-due): apply with overrides vs skip", async () => {
    const user = await createRegisteredUser("manual-confirm");
    const db = getDb();

    // Create template 1 for manual apply with overrides
    const t1Res = await recurringPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "POST", user.cookie, {
        walletId: user.wallet.id,
        categoryId: user.expenseCat.id,
        type: "expense",
        amount: 100_000,
        description: "Tagihan Air",
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
        autoApply: false, // Manual prompt
      }),
    );
    const t1Id = (await t1Res.json()).data.template.id as string;
    const oneHourAgo = new Date(Date.now() - 3600_000);
    await db
      .update(recurringTemplates)
      .set({ nextRunAt: oneHourAgo })
      .where(eq(recurringTemplates.id, t1Id));

    // Create template 2 for skip
    const t2Res = await recurringPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "POST", user.cookie, {
        walletId: user.wallet.id,
        categoryId: user.expenseCat.id,
        type: "expense",
        amount: 80_000,
        description: "Gym Membership",
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
        autoApply: false,
      }),
    );
    const t2Id = (await t2Res.json()).data.template.id as string;
    await db
      .update(recurringTemplates)
      .set({ nextRunAt: oneHourAgo })
      .where(eq(recurringTemplates.id, t2Id));

    // Calling process returns both in pendingConfirmations without ledger mutation
    const procRes = await processPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring/process", "POST", user.cookie),
    );
    const procJson = await procRes.json();
    expect(procJson.data.appliedCount).toBe(0);
    expect(procJson.data.pendingConfirmations.length).toBe(2);

    // Apply template 1 with custom amount override (120_000 instead of 100_000)
    const applyRes = await confirmPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring/confirm", "POST", user.cookie, {
        templateId: t1Id,
        action: "apply",
        customAmount: 120_000,
      }),
    );
    expect(applyRes.status).toBe(200);
    const applyJson = await applyRes.json();
    expect(applyJson.data.status).toBe("applied");

    const t1Tx = await db
      .select()
      .from(transactions)
      .where(eq(transactions.recurringTemplateId, t1Id));
    expect(t1Tx.length).toBe(1);
    expect(t1Tx[0].amount).toBe(120_000);

    // Skip template 2: advances nextRunAt without creating transaction
    const skipRes = await confirmPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring/confirm", "POST", user.cookie, {
        templateId: t2Id,
        action: "skip",
      }),
    );
    expect(skipRes.status).toBe(200);
    const skipJson = await skipRes.json();
    expect(skipJson.data.status).toBe("skipped");

    const t2Tx = await db
      .select()
      .from(transactions)
      .where(eq(transactions.recurringTemplateId, t2Id));
    expect(t2Tx.length).toBe(0);

    const t2Updated = await db
      .select()
      .from(recurringTemplates)
      .where(eq(recurringTemplates.id, t2Id));
    expect(new Date(t2Updated[0].nextRunAt).getTime()).toBeGreaterThan(
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );
  });

  it("deactivates template when nextRunAt passes endDate", async () => {
    const user = await createRegisteredUser("expiry-test");
    const db = getDb();

    // Template with endDate in past
    const createRes = await recurringPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "POST", user.cookie, {
        walletId: user.wallet.id,
        categoryId: user.expenseCat.id,
        type: "expense",
        amount: 50_000,
        description: "Cicilan Terakhir",
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-15T00:00:00.000Z",
        autoApply: true,
      }),
    );
    const templateId = (await createRes.json()).data.template.id as string;
    await db
      .update(recurringTemplates)
      .set({ nextRunAt: new Date("2026-01-01T00:00:00.000Z") })
      .where(eq(recurringTemplates.id, templateId));

    // Process
    await processPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring/process", "POST", user.cookie),
    );

    const templateAfter = await db
      .select()
      .from(recurringTemplates)
      .where(eq(recurringTemplates.id, templateId));
    expect(templateAfter[0].isActive).toBe(false);
  });

  it("retains transaction history with nullified recurring_template_id when template is deleted (DATA-4)", async () => {
    const user = await createRegisteredUser("retain-history");
    const db = getDb();

    // Create and auto-apply template
    const createRes = await recurringPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "POST", user.cookie, {
        walletId: user.wallet.id,
        categoryId: user.expenseCat.id,
        type: "expense",
        amount: 300_000,
        description: "Retain History Test",
        frequency: "monthly",
        startDate: "2026-01-01T00:00:00.000Z",
        autoApply: true,
      }),
    );
    const templateId = (await createRes.json()).data.template.id as string;
    await db
      .update(recurringTemplates)
      .set({ nextRunAt: new Date("2026-01-01T00:00:00.000Z") })
      .where(eq(recurringTemplates.id, templateId));

    await processPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring/process", "POST", user.cookie),
    );

    // Verify transaction exists
    const beforeDeleteTx = await db
      .select()
      .from(transactions)
      .where(eq(transactions.recurringTemplateId, templateId));
    expect(beforeDeleteTx.length).toBe(1);
    const txId = beforeDeleteTx[0].id;

    // Delete template
    const delRes = await recurringDetailDelete(
      makeAuthedRequest(`http://localhost:3000/api/finance/recurring/${templateId}`, "DELETE", user.cookie),
      { params: Promise.resolve({ id: templateId }) },
    );
    expect(delRes.status).toBe(200);

    // Verify transaction still exists with recurringTemplateId set to null
    const afterDeleteTx = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId));
    expect(afterDeleteTx.length).toBe(1);
    expect(afterDeleteTx[0].recurringTemplateId).toBeNull();
  });

  it("enforces strict multi-tenant isolation (SEC-1)", async () => {
    const userA = await createRegisteredUser("tenant-a");
    const userB = await createRegisteredUser("tenant-b");

    // User A creates a template
    const createRes = await recurringPost(
      makeAuthedRequest("http://localhost:3000/api/finance/recurring", "POST", userA.cookie, {
        walletId: userA.wallet.id,
        categoryId: userA.expenseCat.id,
        type: "expense",
        amount: 99_000,
        description: "User A Secret Recurring",
        frequency: "monthly",
      }),
    );
    const templateId = (await createRes.json()).data.template.id as string;

    // User B tries to view User A's template
    const bViewRes = await recurringDetailGet(
      makeAuthedRequest(`http://localhost:3000/api/finance/recurring/${templateId}`, "GET", userB.cookie),
      { params: Promise.resolve({ id: templateId }) },
    );
    expect(bViewRes.status).toBe(404);

    // User B tries to modify User A's template
    const bPatchRes = await recurringDetailPatch(
      makeAuthedRequest(
        `http://localhost:3000/api/finance/recurring/${templateId}`,
        "PATCH",
        userB.cookie,
        { amount: 1_000 },
      ),
      { params: Promise.resolve({ id: templateId }) },
    );
    expect(bPatchRes.status).toBe(404);

    // User B tries to delete User A's template
    const bDelRes = await recurringDetailDelete(
      makeAuthedRequest(`http://localhost:3000/api/finance/recurring/${templateId}`, "DELETE", userB.cookie),
      { params: Promise.resolve({ id: templateId }) },
    );
    expect(bDelRes.status).toBe(404);
  });
});
