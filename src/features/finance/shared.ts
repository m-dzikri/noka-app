import { and, eq, lt, or, type AnyColumn, type SQL } from "drizzle-orm";
import { ApiError } from "@/lib/api-response";

export type ConflictResolution = "applied" | "server_newer";

export interface DecodedFinanceCursor {
  o: Date;
  c: Date;
  i: string;
}

export type SummaryLedgerKind = "transaction" | "transfer";

export interface DecodedSummaryCursor {
  o: Date;
  c: Date;
  k: SummaryLedgerKind;
  i: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Checks whether a database error corresponds to PostgreSQL unique violation (23505).
 */
export function isPgUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const record = error as { code?: unknown; cause?: unknown };
  if (record.code === "23505") {
    return true;
  }

  if (typeof record.cause === "object" && record.cause !== null) {
    return (record.cause as { code?: unknown }).code === "23505";
  }

  return false;
}

/**
 * Encodes keyset pagination cursor `(occurredAt DESC, createdAt DESC, id DESC)` as base64url JSON.
 */
export function encodeFinanceCursor(row: {
  occurredAt: Date;
  createdAt: Date;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      o: row.occurredAt.toISOString(),
      c: row.createdAt.toISOString(),
      i: row.id,
    }),
    "utf8",
  ).toString("base64url");
}

/**
 * Decodes keyset pagination cursor and rejects malformed cursors with 400 INVALID_CURSOR.
 */
export function decodeFinanceCursor(rawCursor: string): DecodedFinanceCursor {
  try {
    const decoded = Buffer.from(rawCursor, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(decoded);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { o?: unknown }).o !== "string" ||
      typeof (parsed as { c?: unknown }).c !== "string" ||
      typeof (parsed as { i?: unknown }).i !== "string"
    ) {
      throw new Error("Invalid cursor shape");
    }

    const { o, c, i } = parsed as { o: string; c: string; i: string };
    if (!UUID_REGEX.test(i)) {
      throw new Error("Invalid cursor UUID");
    }

    const oMs = Date.parse(o);
    const cMs = Date.parse(c);
    if (Number.isNaN(oMs) || Number.isNaN(cMs)) {
      throw new Error("Invalid cursor timestamp");
    }

    return {
      o: new Date(oMs),
      c: new Date(cMs),
      i,
    };
  } catch {
    throw new ApiError(400, "INVALID_CURSOR", "Invalid pagination cursor");
  }
}

/**
 * Builds the descending keyset pagination SQL predicate `(occurredAt, createdAt, id) < cursor`.
 */
export function buildFinanceCursorPredicate(
  columns: { occurredAt: AnyColumn; createdAt: AnyColumn; id: AnyColumn },
  rawCursor: string,
): SQL | undefined {
  const cursor = decodeFinanceCursor(rawCursor);
  return or(
    lt(columns.occurredAt, cursor.o),
    and(
      eq(columns.occurredAt, cursor.o),
      lt(columns.createdAt, cursor.c),
    ),
    and(
      eq(columns.occurredAt, cursor.o),
      eq(columns.createdAt, cursor.c),
      lt(columns.id, cursor.i),
    ),
  );
}

/**
 * Encodes unified summary ledger keyset cursor `(occurredAt DESC, createdAt DESC, kind ASC, id DESC)`.
 */
export function encodeSummaryCursor(row: {
  occurredAt: Date;
  createdAt: Date;
  kind: SummaryLedgerKind;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      o: row.occurredAt.toISOString(),
      c: row.createdAt.toISOString(),
      k: row.kind,
      i: row.id,
    }),
    "utf8",
  ).toString("base64url");
}

/**
 * Decodes unified summary ledger keyset cursor and rejects malformed cursors with 400 INVALID_CURSOR.
 */
export function decodeSummaryCursor(rawCursor: string): DecodedSummaryCursor {
  try {
    const decoded = Buffer.from(rawCursor, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(decoded);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { o?: unknown }).o !== "string" ||
      typeof (parsed as { c?: unknown }).c !== "string" ||
      typeof (parsed as { k?: unknown }).k !== "string" ||
      typeof (parsed as { i?: unknown }).i !== "string"
    ) {
      throw new Error("Invalid summary cursor shape");
    }

    const { o, c, k, i } = parsed as {
      o: string;
      c: string;
      k: string;
      i: string;
    };
    if (k !== "transaction" && k !== "transfer") {
      throw new Error("Invalid summary cursor kind");
    }
    if (!UUID_REGEX.test(i)) {
      throw new Error("Invalid summary cursor UUID");
    }

    const oMs = Date.parse(o);
    const cMs = Date.parse(c);
    if (Number.isNaN(oMs) || Number.isNaN(cMs)) {
      throw new Error("Invalid summary cursor timestamp");
    }

    return {
      o: new Date(oMs),
      c: new Date(cMs),
      k,
      i,
    };
  } catch {
    throw new ApiError(400, "INVALID_CURSOR", "Invalid pagination cursor");
  }
}

/**
 * Builds the descending keyset predicate for a table with fixed `rowKind` against the unified summary cursor `(occurredAt DESC, createdAt DESC, kind ASC, id DESC)`.
 */
export function buildSummaryCursorPredicate(
  columns: { occurredAt: AnyColumn; createdAt: AnyColumn; id: AnyColumn },
  rowKind: SummaryLedgerKind,
  cursor: DecodedSummaryCursor,
): SQL | undefined {
  if (rowKind === cursor.k) {
    return or(
      lt(columns.occurredAt, cursor.o),
      and(eq(columns.occurredAt, cursor.o), lt(columns.createdAt, cursor.c)),
      and(
        eq(columns.occurredAt, cursor.o),
        eq(columns.createdAt, cursor.c),
        lt(columns.id, cursor.i),
      ),
    );
  }

  // Since "transaction" < "transfer" in kind ASC order:
  // - If cursor is "transfer", any "transaction" at (o, c) came before cursor -> require < (o, c).
  // - If cursor is "transaction", any "transfer" at (o, c) comes after cursor -> allow <= (o, c) at transfers.
  if (rowKind === "transaction" && cursor.k === "transfer") {
    return or(
      lt(columns.occurredAt, cursor.o),
      and(eq(columns.occurredAt, cursor.o), lt(columns.createdAt, cursor.c)),
    );
  }

  return or(
    lt(columns.occurredAt, cursor.o),
    and(eq(columns.occurredAt, cursor.o), lt(columns.createdAt, cursor.c)),
    and(eq(columns.occurredAt, cursor.o), eq(columns.createdAt, cursor.c)),
  );
}
