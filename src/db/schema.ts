import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * TENANCY ROOT
 * Every tenant-scoped table below carries an explicit `orgId` column. Every
 * repository function in `src/db/repositories/*` requires an `orgId`
 * argument and bakes it into the SQL `where` clause (never into
 * application-layer post-filtering) so a missing scope fails closed.
 */
export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  accentColor: text("accent_color").notNull().default("#2563eb"),
  defaultLocale: text("default_locale").notNull().default("en-US"),
  // Terminology glossary key, e.g. "team" | "department" | "afdeling".
  teamTermKey: text("team_term_key").notNull().default("team"),
  domains: text("domains").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(), // executive | hr | manager | contributor | viewer | admin
    managerOfTeamId: uuid("manager_of_team_id").references(() => teams.id, { onDelete: "set null" }),
    financeRead: boolean("finance_read").notNull().default(false),
    locale: text("locale"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_org_email_idx").on(table.orgId, table.email)],
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [uniqueIndex("feature_flags_org_key_idx").on(table.orgId, table.key)],
);

export const rolePermissionOverrides = pgTable(
  "role_permission_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    permission: text("permission").notNull(),
    allowed: boolean("allowed").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [uniqueIndex("role_perm_org_role_perm_idx").on(table.orgId, table.role, table.permission)],
);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// People records engines reason about. `version` powers optimistic
// concurrency for the offline write queue (Section D).
export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  roleTitle: text("role_title").notNull(),
  riskScore: integer("risk_score").notNull().default(0),
  isSample: boolean("is_sample").notNull().default(false),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Engine-generated content is stored as a template key + params, never as
// baked prose, so every locale renders it through the message catalog.
export const briefings = pgTable("briefings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "cascade" }),
  templateKey: text("template_key").notNull(),
  params: jsonb("params").notNull().default({}),
  severity: text("severity").notNull().default("info"),
  isSample: boolean("is_sample").notNull().default(false),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "cascade" }),
  templateKey: text("template_key").notNull(),
  params: jsonb("params").notNull().default({}),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playbooks = pgTable("playbooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  templateKey: text("template_key").notNull(),
  params: jsonb("params").notNull().default({}),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const onboardingState = pgTable(
  "onboarding_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    stepsCompleted: jsonb("steps_completed").notNull().default([]),
    sampleDataSeeded: boolean("sample_data_seeded").notNull().default(false),
    wizardCompleted: boolean("wizard_completed").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("onboarding_state_org_idx").on(table.orgId)],
);
