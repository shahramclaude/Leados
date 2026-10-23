// LEADOS Operations Console — schema of record for the modules implemented
// in this session (see docs/PROGRAM-NOTICE.md for scope + honesty notes).
import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  serial,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Part 124 — Controllership & financial close
// ---------------------------------------------------------------------------
export const closeTasks = pgTable("close_tasks", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  taskName: text("task_name").notNull(),
  sequence: integer("sequence").notNull().default(1),
  owner: text("owner").notNull(),
  status: text("status").notNull().default("pending"), // pending|in-progress|review|signed-off|blocked
  slaHours: integer("sla_hours").notNull().default(24),
  evidenceRef: text("evidence_ref"),
  signedOffBy: text("signed_off_by"),
  signedOffAt: timestamp("signed_off_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reconciliations = pgTable("reconciliations", {
  id: serial("id").primaryKey(),
  accountId: text("account_id").notNull(),
  period: text("period").notNull(), // e.g. 2026-01
  sourceBalance: numeric("source_balance", { precision: 18, scale: 2 }).notNull(),
  glBalance: numeric("gl_balance", { precision: 18, scale: 2 }).notNull(),
  reconcilingItemsTotal: numeric("reconciling_items_total", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  toleranceUsd: numeric("tolerance_usd", { precision: 18, scale: 2 }).notNull().default("1"),
  preparer: text("preparer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 125 — Source-to-pay & contract lifecycle
// ---------------------------------------------------------------------------
export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  counterparty: text("counterparty").notNull(),
  contractType: text("contract_type").notNull(),
  valueUsd: numeric("value_usd", { precision: 18, scale: 2 }).notNull().default("0"),
  renewalDate: date("renewal_date").notNull(),
  noticeDays: integer("notice_days").notNull().default(30),
  autoRenew: boolean("auto_renew").notNull().default(true),
  decisionMade: boolean("decision_made").notNull().default(false),
  riskClauses: text("risk_clauses"), // comma separated enumerated clause tags
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  vendor: text("vendor").notNull(),
  poAmount: numeric("po_amount", { precision: 18, scale: 2 }),
  receiptAmount: numeric("receipt_amount", { precision: 18, scale: 2 }),
  invoiceAmount: numeric("invoice_amount", { precision: 18, scale: 2 }).notNull(),
  toleranceUsd: numeric("tolerance_usd", { precision: 18, scale: 2 }).notNull().default("5"),
  bankChangeRequested: boolean("bank_change_requested").notNull().default(false),
  dualControlApproved: boolean("dual_control_approved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 126 — IT service management
// ---------------------------------------------------------------------------
export const itsmTickets = pgTable("itsm_tickets", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  requester: text("requester").notNull(),
  priority: integer("priority").notNull().default(3), // 1 (highest) .. 4
  status: text("status").notNull().default("open"), // open|paused|resolved
  slaHours: integer("sla_hours"), // override; otherwise derived from priority
  pausedHours: integer("paused_hours").notNull().default(0),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 127 — HSE & wellbeing operations
// ---------------------------------------------------------------------------
export const hseIncidents = pgTable("hse_incidents", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // injury|near-miss|environmental|process-safety
  severity: integer("severity").notNull(), // 1..5
  location: text("location").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  anonymous: boolean("anonymous").notNull().default(false),
  reporterName: text("reporter_name"), // NULL enforced at write time when anonymous=true
  rootCauseIsHumanErrorOnly: boolean("root_cause_is_human_error_only").notNull().default(false),
  systemContributingFactor: text("system_contributing_factor"),
  correctiveAction: text("corrective_action"),
  status: text("status").notNull().default("open"), // open|rejected-root-cause|closed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 138 — Treasury & capital allocation
// ---------------------------------------------------------------------------
export const cashPositions = pgTable("cash_positions", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  currency: text("currency").notNull().default("USD"),
  bookBalance: numeric("book_balance", { precision: 18, scale: 2 }).notNull(),
  bankBalance: numeric("bank_balance", { precision: 18, scale: 2 }).notNull(),
  outstandingItemsTotal: numeric("outstanding_items_total", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  asOf: date("as_of").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const covenants = pgTable("covenants", {
  id: serial("id").primaryKey(),
  agreementRef: text("agreement_ref").notNull(),
  covenantKind: text("covenant_kind").notNull(), // leverage|interest-cover|liquidity|custom
  direction: text("direction").notNull().default("max"), // max: current must stay <= threshold; min: current must stay >= threshold
  thresholdValue: numeric("threshold_value", { precision: 18, scale: 4 }).notNull(),
  currentValue: numeric("current_value", { precision: 18, scale: 4 }).notNull(),
  testDate: date("test_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Part 139 — Capstone: Charter v2 promises (each traces to a mechanism below)
// ---------------------------------------------------------------------------
export const charterPromises = pgTable("charter_promises", {
  id: serial("id").primaryKey(),
  statement: text("statement").notNull(),
  promiseClass: text("promise_class").notNull(), // 'does' | 'never-does'
  enforcement: text("enforcement").notNull(), // where in code it's enforced
  verified: boolean("verified").notNull().default(false),
  dimension: text("dimension").notNull(), // intelligence|automation|trust|universality|dignity|operability
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
