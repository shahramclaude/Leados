// LEADOS — Part 9: Universality (i18n, multi-tenant, RBAC, PWA, inclusive access)
//
// This sandbox starts from the bare `nextjs-postgresql-template` (no
// earlier-part tables exist here — same situation Part 8's own schema
// comment describes). The slice below is deep enough to prove every Part 9
// mechanism for real against Postgres:
//   - multi-tenant isolation (every domain row carries `orgId`)
//   - RBAC (role lives on the membership, not on the user)
//   - per-org theming / terminology / feature flags
//   - offline queue idempotency + optimistic-concurrency conflict detection
//   - push notification subscriptions
//
// Every future table that holds tenant data MUST include `orgId` and every
// repository function MUST take `orgId` as a mandatory (not optional)
// parameter — enforced by convention here and by
// `scripts/test-tenant-isolation.ts`.

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ---------------------------------------------------------------------------
// Organizations (tenants) — white-label + i18n + feature-flag anchor
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  accentColor: text("accent_color").notNull().default("#4f46e5"),
  // Glossary overrides, e.g. { "team": "Squad", "manager": "Lead" }.
  terminology: jsonb("terminology").$type<Record<string, string>>().notNull().default({}),
  defaultLocale: text("default_locale").notNull().default("en-US"),
  timezone: text("timezone").notNull().default("UTC"),
  currency: text("currency").notNull().default("USD"),
  sampleDataEnabled: boolean("sample_data_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgFeatureFlags = pgTable(
  "org_feature_flags",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("org_feature_flags_org_key_idx").on(table.orgId, table.key)],
);

// ---------------------------------------------------------------------------
// Identity & RBAC — role lives on the membership (one user, many orgs)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  locale: text("locale").notNull().default("en-US"),
  highContrast: boolean("high_contrast").notNull().default(false),
  textScale: integer("text_scale").notNull().default(100), // percent, 100-200
  plainLanguage: boolean("plain_language").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// admin | executive | hr | manager | contributor | viewer — see src/lib/domain/rbac.ts
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memberships_user_org_idx").on(table.userId, table.orgId),
    index("memberships_org_idx").on(table.orgId),
  ],
);

// ---------------------------------------------------------------------------
// Findings — a minimal tenant-scoped domain table used to prove isolation,
// RBAC, offline idempotency (clientMutationId) and optimistic concurrency.
// ---------------------------------------------------------------------------

export const findings = pgTable(
  "findings",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    domain: text("domain").notNull().default("general"),
    team: text("team").notNull().default("General"),
    severity: integer("severity").notNull().default(1), // 1 (low) .. 5 (critical)
    status: text("status").notNull().default("open"), // open | resolved
    summary: text("summary").notNull().default(""),
    isSample: boolean("is_sample").notNull().default(false),
    // Idempotency key supplied by the offline write queue so a replayed
    // mutation never creates a duplicate row.
    clientMutationId: text("client_mutation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("findings_org_idx").on(table.orgId),
    uniqueIndex("findings_org_mutation_idx")
      .on(table.orgId, table.clientMutationId)
      .where(sql`${table.clientMutationId} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Push notification subscriptions (Web Push / PWA)
// ---------------------------------------------------------------------------

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("push_subscriptions_user_idx").on(table.userId)],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrgFeatureFlag = typeof orgFeatureFlags.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
