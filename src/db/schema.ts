import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const decisionStatusEnum = pgEnum("decision_status", [
  "proposed",
  "under_review",
  "committed",
  "implemented",
  "reversed",
]);

export const signalSeverityEnum = pgEnum("signal_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const signalStatusEnum = pgEnum("signal_status", [
  "new",
  "investigating",
  "resolved",
  "dismissed",
]);

export const cadenceTypeEnum = pgEnum("cadence_type", [
  "meeting",
  "ritual",
  "review",
]);

export const cadenceFrequencyEnum = pgEnum("cadence_frequency", [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
]);

export const cadenceStatusEnum = pgEnum("cadence_status", [
  "active",
  "paused",
]);

export const boardItemTypeEnum = pgEnum("board_item_type", [
  "resolution",
  "minutes",
  "pack",
  "motion",
]);

export const boardItemStatusEnum = pgEnum("board_item_status", [
  "draft",
  "circulated",
  "approved",
  "rejected",
]);

export const riskCategoryEnum = pgEnum("risk_category", [
  "strategic",
  "operational",
  "financial",
  "compliance",
  "reputational",
]);

export const riskStatusEnum = pgEnum("risk_status", [
  "open",
  "mitigating",
  "closed",
]);

export const initiativeStatusEnum = pgEnum("initiative_status", [
  "planned",
  "active",
  "at_risk",
  "completed",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const decisions = pgTable("decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: decisionStatusEnum("status").notNull().default("proposed"),
  owner: text("owner").notNull(),
  rationale: text("rationale"),
  impact: text("impact"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const signals = pgTable("signals", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  source: text("source").notNull(),
  severity: signalSeverityEnum("severity").notNull().default("medium"),
  status: signalStatusEnum("status").notNull().default("new"),
  detectedAt: timestamp("detected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cadenceItems = pgTable("cadence_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  type: cadenceTypeEnum("type").notNull().default("meeting"),
  frequency: cadenceFrequencyEnum("frequency").notNull().default("weekly"),
  owner: text("owner").notNull(),
  nextOccurrence: timestamp("next_occurrence", { withTimezone: true }),
  status: cadenceStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const boardItems = pgTable("board_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  type: boardItemTypeEnum("type").notNull().default("pack"),
  status: boardItemStatusEnum("status").notNull().default("draft"),
  meetingDate: timestamp("meeting_date", { withTimezone: true }),
  owner: text("owner").notNull(),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const riskItems = pgTable("risk_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  category: riskCategoryEnum("category").notNull().default("operational"),
  likelihood: integer("likelihood").notNull().default(3),
  impact: integer("impact").notNull().default(3),
  status: riskStatusEnum("status").notNull().default("open"),
  owner: text("owner").notNull(),
  mitigation: text("mitigation"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const initiatives = pgTable("initiatives", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  objective: text("objective"),
  status: initiativeStatusEnum("status").notNull().default("planned"),
  progress: integer("progress").notNull().default(0),
  owner: text("owner").notNull(),
  targetDate: timestamp("target_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
