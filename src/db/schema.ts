// Keep the schema entrypoint present so models can define tables and run
// `npx drizzle-kit push` without bootstrapping Drizzle config first.
//
// Part 08 — Financial Intelligence: persistence for the driver DAG model.
// Three tables back the "full change history" / "asserted vs evidence"
// requirements from the spec:
//   - financeModelVersions: immutable snapshots of the evaluated model
//   - financeDriverOverrides: hand-typed ("asserted") driver values that
//     shadow the evidence-derived/forecast value until evidence replaces them
//   - financeBoardPacks: generated, versioned monthly board packs

import {
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const financeModelVersions = pgTable("finance_model_versions", {
  id: serial("id").primaryKey(),
  hash: varchar("hash", { length: 64 }).notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  nodeCount: numeric("node_count").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const financeDriverOverrides = pgTable("finance_driver_overrides", {
  id: serial("id").primaryKey(),
  driverId: varchar("driver_id", { length: 80 }).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  value: numeric("value").notNull(),
  assertedBy: varchar("asserted_by", { length: 120 }).notNull().default("unknown"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const financeBoardPacks = pgTable("finance_board_packs", {
  id: serial("id").primaryKey(),
  month: varchar("month", { length: 7 }).notNull(),
  version: numeric("version").notNull(),
  modelHash: varchar("model_hash", { length: 64 }).notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
