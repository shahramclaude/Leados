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

// ---------------------------------------------------------------------------
// LEADOS — Part 15: universality (i18n, tenancy, RBAC, PWA) schema.
// Every tenant-owned table carries an explicit `orgId` column so the
// repository layer (src/lib/repo/*) can enforce org scoping uniformly.
// ---------------------------------------------------------------------------

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  locale: text("locale").notNull().default("en-US"),
  accentColor: text("accent_color").notNull().default("#2563eb"),
  logoEmoji: text("logo_emoji").notNull().default("🏛️"),
  terminology: jsonb("terminology").$type<Record<string, string>>().notNull().default({}),
  highContrastDefault: boolean("high_contrast_default").notNull().default(false),
  plainLanguageDefault: boolean("plain_language_default").notNull().default(false),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Roles are fixed per the standing order: Executive/HR/Manager/Contributor/Viewer/Admin
export const MEMBERSHIP_ROLES = [
  "Executive",
  "HR",
  "Manager",
  "Contributor",
  "Viewer",
  "Admin",
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

// Domain scopes used for scoped ABAC on top of RBAC roles.
export const DOMAIN_SCOPES = ["people", "finance", "strategy", "operations"] as const;
export type DomainScope = (typeof DOMAIN_SCOPES)[number];

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().$type<MembershipRole>(),
    scopes: jsonb("scopes").$type<DomainScope[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("memberships_org_user_unique").on(table.orgId, table.userId)],
);

export const ENGINE_RECORD_TYPES = ["briefing", "finding", "playbook"] as const;
export type EngineRecordType = (typeof ENGINE_RECORD_TYPES)[number];

// Engine-generated content (briefings, findings, playbooks). Rendered through
// parameterized i18n templates rather than stored as baked English prose, so
// the same row renders correctly in en-US and da-DK.
export const engineRecords = pgTable("engine_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  type: text("type").notNull().$type<EngineRecordType>(),
  domain: text("domain").notNull().$type<DomainScope>(),
  templateKey: text("template_key").notNull(),
  params: jsonb("params").$type<Record<string, string | number>>().notNull().default({}),
  version: integer("version").notNull().default(1),
  seeded: boolean("seeded").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("feature_flags_org_key_unique").on(table.orgId, table.key)],
);

export const featureFlagAudit = pgTable("feature_flag_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  flagKey: text("flag_key").notNull(),
  action: text("action").notNull(), // created | enabled | disabled
  actorId: uuid("actor_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncConflicts = pgTable("sync_conflicts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  recordId: uuid("record_id").notNull(),
  resolution: text("resolution").notNull(), // mine | theirs | merge
  resolvedBy: uuid("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
