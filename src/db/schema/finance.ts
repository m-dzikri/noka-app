import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
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

export const recurringTemplates = pgTable(
  "recurring_templates",
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
    type: varchar("type", { length: 16 }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    description: varchar("description", { length: 300 }).notNull(),
    frequency: varchar("frequency", { length: 20 }).notNull(),
    intervalStep: integer("interval_step").notNull().default(1),
    dayOfMonth: integer("day_of_month"),
    dayOfWeek: integer("day_of_week"),
    startDate: timestamp("start_date", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    autoApply: boolean("auto_apply").notNull().default(false),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("recurring_templates_user_idx").on(table.userId),
    index("recurring_templates_user_active_next_run_idx").on(
      table.userId,
      table.isActive,
      table.nextRunAt,
    ),
    index("recurring_templates_wallet_idx").on(table.walletId),
    index("recurring_templates_category_idx").on(table.categoryId),
    check("recurring_templates_amount_positive", sql`${table.amount} > 0`),
    check(
      "recurring_templates_interval_positive",
      sql`${table.intervalStep} >= 1`,
    ),
    check(
      "recurring_templates_day_of_month_valid",
      sql`${table.dayOfMonth} IS NULL OR (${table.dayOfMonth} >= 1 AND ${table.dayOfMonth} <= 31)`,
    ),
    check(
      "recurring_templates_day_of_week_valid",
      sql`${table.dayOfWeek} IS NULL OR (${table.dayOfWeek} >= 0 AND ${table.dayOfWeek} <= 6)`,
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
    recurringTemplateId: uuid("recurring_template_id").references(
      () => recurringTemplates.id,
      { onDelete: "set null" },
    ),
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
    index("transactions_recurring_template_id_idx").on(
      table.recurringTemplateId,
    ),
    check("transactions_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const categoryBudgets = pgTable(
  "category_budgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    periodMonth: varchar("period_month", { length: 7 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("category_budgets_user_cat_period_unique_idx").on(
      table.userId,
      table.categoryId,
      table.periodMonth,
    ),
    index("category_budgets_user_period_idx").on(
      table.userId,
      table.periodMonth,
    ),
    check("category_budgets_amount_positive", sql`${table.amount} > 0`),
  ],
);


