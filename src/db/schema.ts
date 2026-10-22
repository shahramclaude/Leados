// src/db/schema.ts — LEADOS Part 19 security slice.
//
// Read-before-write note (see docs/SECURITY_AUDIT.md Phase 0 / AI-SESSION-LOG.md):
// the subject repository (github.com/shahramclaude/Leados) contains ~2,195 files
// accumulated across many independent sessions, including a `src/db/schema.ts`
// that is only 114 lines (a "Part 18 performance slice") while dozens of other
// files (`src/lib/audit.ts`, `tests/security/*.test.ts`, `src/app/api/people/**`)
// reference tables/columns (`organizations`, `users`, `sessions`, `auditLog` with
// `actorEmail`, `people.orgId`, `people.deletedAt`, etc.) that do not exist in
// that committed schema. That tree does not compile against itself. Rather than
// fabricate a "fixed" version of 2,195 non-integrated files, this part rebuilds
// the security-critical slice for real, in the one working copy that can
// actually be installed/typechecked/built/started in this session, matching the
// *design* found in the subject repo's own test files (tests/security/helpers.ts,
// authz-and-tenancy.test.ts, csrf-and-headers.test.ts, audit-chain.test.ts,
// rate-limit-and-lockout.test.ts, injection-and-validation.test.ts) so those
// tests' intent is honored with code that genuinely runs and is genuinely
// verified this session.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigserial,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "member", "viewer"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("member"),
    // Bumped on role change / forced logout-everywhere; embedded in every
    // signed session token so a stale token (minted under an old role) is
    // rejected even if it hasn't expired yet. See src/lib/session.ts.
    sessionVersion: integer("session_version").notNull().default(0),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique_idx").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("people_org_created_idx").on(t.orgId, t.createdAt),
    index("people_org_deleted_idx").on(t.orgId, t.deletedAt),
  ],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    rows: jsonb("rows").notNull(),
    rejectedRows: jsonb("rejected_rows").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => users.id),
  },
  (t) => [index("import_batches_org_idx").on(t.orgId, t.status)],
);

// Tamper-evident, hash-chained audit log. One chain per organization (plus a
// system chain where orgId IS NULL) so tenants cannot observe or interfere
// with one another's chain, and so `verifyAuditChain(orgId)` is an O(that
// org's events) operation rather than O(every event ever recorded).
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    orgId: uuid("org_id").references(() => organizations.id),
    actorUserId: uuid("actor_user_id"),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    reason: text("reason"),
    correlationId: text("correlation_id").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").notNull().default({}),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_org_seq_idx").on(t.orgId, t.seq),
    uniqueIndex("audit_log_seq_unique_idx").on(t.seq),
  ],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exportConsents = pgTable("export_consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  scope: text("scope").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  ip: text("ip"),
});

export const securityEventLog = pgTable(
  "security_event_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // e.g. "ssrf_blocked", "rate_limited", "lockout"
    detail: jsonb("detail").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("security_event_log_kind_idx").on(t.kind, t.createdAt)],
);


