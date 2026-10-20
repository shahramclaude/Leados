// LEADOS data model — Part 13 security baseline.
//
// This sandbox began life as a bare Next.js + PostgreSQL starter template; no
// earlier LEADOS parts existed in this environment. Part 13 therefore ships a
// minimal-but-real multi-tenant "people" domain (the kind of sensitive
// organizational data LEADOS exists to manage) together with the full
// authentication / authorization / audit schema so every security control
// described in SECURITY_AUDIT.md, docs/THREAT-MODEL.md and docs/SECURITY.md
// has real tables, real routes and real tests behind it.
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "member"]);

/** A tenant / customer organization. All sensitive data is scoped to one org. */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Application users. Passwords are always bcrypt hashes, never plaintext. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("member"),
    // OIDC/SSO-ready: when set, local password login is disabled for this user
    // and authentication is federated. See docs/SECURITY.md "SSO readiness".
    ssoSubject: varchar("sso_subject", { length: 255 }),
    ssoProvider: varchar("sso_provider", { length: 100 }),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

/**
 * Server-side session record. The browser only ever holds an opaque, signed
 * JWT cookie; this table lets us revoke individual sessions (logout
 * everywhere, incident response) and rotate session ids without trusting a
 * purely stateless token.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: varchar("revoked_reason", { length: 255 }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

/** Sensitive personal data — the "crown jewel" asset protected by this part. */
export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 120 }).notNull(),
    lastName: varchar("last_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    // Free-text notes and structured sensitive attributes (e.g. compensation,
    // national id fragments). Stored as jsonb so field-level redaction can be
    // layered on later without a migration.
    notes: text("notes"),
    sensitiveData: jsonb("sensitive_data").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("people_org_id_idx").on(table.orgId)],
);

/**
 * Immutable, hash-chained audit log. Every row's `hash` is
 * sha256(prevHash + canonicalJson(row)); `prevHash` points at the previous
 * row *for the same org* so a tenant admin can verify the chain without
 * seeing other tenants' events. Rows are never updated or deleted by
 * application code (enforced by code review + DB role grants in production,
 * see docs/SECURITY.md).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: integer("seq").generatedAlwaysAsIdentity().notNull(),
    correlationId: varchar("correlation_id", { length: 64 }).notNull(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: varchar("actor_email", { length: 320 }),
    action: varchar("action", { length: 100 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }).notNull(),
    resourceId: varchar("resource_id", { length: 100 }),
    reason: varchar("reason", { length: 500 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    prevHash: varchar("prev_hash", { length: 64 }),
    hash: varchar("hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_org_id_idx").on(table.orgId),
    index("audit_log_created_at_idx").on(table.createdAt),
    uniqueIndex("audit_log_seq_idx").on(table.seq),
  ],
);
