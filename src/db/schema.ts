// LEADOS — Part 17 security schema.
//
// NOTE ON PROVENANCE: the sandbox this part was authored in did not contain
// the artifacts described as pre-existing by the standing order (no
// SECURITY_AUDIT.md, src/lib/audit.ts, apiUtils.ts, middleware/, Part 13
// tenancy/RBAC tables, or Part 07 capability registry were present — see
// SECURITY_AUDIT.md "Provenance note" and AI-SESSION-LOG.md for the full
// disclosure). This schema reconstructs the minimal multi-tenant domain
// (organizations / users / people / audit) needed to deliver and test every
// control in the Part 17 mission end-to-end. Table and column names are
// chosen to be the obvious target for Parts 1-16 to converge on if/when they
// are merged in.
import {
  bigserial,
  boolean,
  inet,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Tenancy & identity
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", [
  "owner",
  "admin",
  "manager",
  "member",
  "viewer",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "invited",
  "disabled",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    // scrypt-based PHC-style hash, see src/lib/crypto.ts. Never a plaintext
    // password or a reversible encryption of one.
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("member"),
    status: userStatusEnum("status").notNull().default("active"),
    // Monotonic counter bumped on every privilege change / password change /
    // forced logout. Embedded in the session token and checked on every
    // request so previously issued sessions are invalidated instantly
    // (see src/lib/session.ts).
    securityStamp: uuid("security_stamp").notNull().defaultRandom(),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

// Server-side session store. The cookie only carries an opaque, signed JWT
// (see src/lib/session.ts); this table lets us revoke sessions server-side
// (logout everywhere, privilege change, incident response) even though the
// JWT itself is still cryptographically valid until it expires.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    securityStamp: uuid("security_stamp").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    ip: inet("ip"),
    userAgent: text("user_agent"),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    ip: inet("ip"),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("login_attempts_email_idx").on(table.email, table.createdAt),
    index("login_attempts_ip_idx").on(table.ip, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Organizational data ("people") — the sensitive records every read/write of
// which must be audited per Part 17-E.
// ---------------------------------------------------------------------------

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("people_org_idx").on(table.orgId)],
);

// Outbound integrations. URLs are user-supplied and therefore the primary
// SSRF surface (see src/lib/ssrf.ts and src/app/api/webhooks/route.ts).
export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (table) => [index("webhooks_org_idx").on(table.orgId)],
);

// ---------------------------------------------------------------------------
// Tamper-evident audit log (Part 17-E)
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    // Monotonic sequence is the source of truth for "previous record" —
    // never trust max(id) from a UUID column for chain ordering.
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    id: uuid("id").notNull().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    reason: text("reason"),
    correlationId: uuid("correlation_id").notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").notNull().default({}),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_org_idx").on(table.orgId, table.createdAt),
    index("audit_log_actor_idx").on(table.actorUserId),
    index("audit_log_correlation_idx").on(table.correlationId),
  ],
);
