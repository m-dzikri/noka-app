import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "@/db/schema/auth";
import { notes } from "@/db/schema/notes";

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    type: varchar("type", { length: 16 }).notNull(),
    initialBalance: bigint("initial_balance", { mode: "number" })
      .notNull()
      .default(0),
    includeInSafeToSpend: boolean("include_in_safe_to_spend")
      .notNull()
      .default(true),
    isDefault: boolean("is_default").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("wallets_user_id_idx").on(table.userId),
    check(
      "wallets_initial_balance_non_negative",
      sql`${table.initialBalance} >= 0`,
    ),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    type: varchar("type", { length: 16 }).notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    systemKey: varchar("system_key", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("categories_user_system_key_active_idx")
      .on(table.userId, table.systemKey)
      .where(sql`${table.systemKey} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    uniqueIndex("categories_user_type_lower_name_active_idx")
      .on(table.userId, table.type, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const transfers = pgTable(
  "transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromWalletId: uuid("from_wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    toWalletId: uuid("to_wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    note: varchar("note", { length: 300 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("transfers_user_occurred_idx").on(table.userId, table.occurredAt),
    index("transfers_from_wallet_idx").on(table.fromWalletId),
    index("transfers_to_wallet_idx").on(table.toWalletId),
    check("transfers_amount_positive", sql`${table.amount} > 0`),
    check(
      "transfers_distinct_wallets",
      sql`${table.fromWalletId} <> ${table.toWalletId}`,
    ),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    noteId: uuid("note_id").references(() => notes.id, {
      onDelete: "set null",
    }),
    type: varchar("type", { length: 16 }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    description: varchar("description", { length: 300 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("transactions_user_occurred_idx").on(table.userId, table.occurredAt),
    index("transactions_user_wallet_idx").on(table.userId, table.walletId),
    index("transactions_note_id_idx").on(table.noteId),
    check("transactions_amount_positive", sql`${table.amount} > 0`),
  ],
);

