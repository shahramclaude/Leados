import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// Status recorded by the Part 59 dry-run seed (keyword-evidence only).
export const seedStatusEnum = pgEnum("coverage_seed_status", [
  "canonical", // ✅
  "partial", // 🟡
  "absent", // 🔴
]);

// Status produced by a live Phase-0 verification pass against real code.
export const verifiedStatusEnum = pgEnum("coverage_verified_status", [
  "unverified",
  "present",
  "partial",
  "missing",
  "legacy_quarantined",
]);

export const coverageParts = pgTable("coverage_parts", {
  id: serial("id").primaryKey(),
  partNumber: integer("part_number").notNull().unique(),
  title: text("title").notNull(),
  seedStatus: seedStatusEnum("seed_status").notNull(),
  evidence: text("evidence").notNull(),
  note: text("note"),
  currentStatus: verifiedStatusEnum("current_status").notNull().default("unverified"),
  ownerPart: varchar("owner_part", { length: 32 }),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verificationLogs = pgTable("verification_logs", {
  id: serial("id").primaryKey(),
  partId: integer("part_id")
    .notNull()
    .references(() => coverageParts.id, { onDelete: "cascade" }),
  previousStatus: verifiedStatusEnum("previous_status").notNull(),
  newStatus: verifiedStatusEnum("new_status").notNull(),
  commandOutput: text("command_output"),
  verifiedBy: varchar("verified_by", { length: 120 }).notNull().default("operator"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
});

